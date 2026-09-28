import { HttpError, json, parseBody, withHttp } from '../_shared/http.js';
import { enforceRateLimit } from '../_shared/rateLimit.js';
import { env } from '../_shared/secrets.js';
import { tmdb, type TmdbSearchResult } from '../_shared/tmdb.js';
import { verifySupabaseAuth } from '../_shared/verifySupabaseAuth.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SHOW_LIMIT = 12;

interface SimilarRequest {
  tmdbId?: number;
}

interface GroqSuggestion {
  tmdbId: number;
  title: string;
  reason: string;
}

export interface SimilarShow {
  tmdbId: number;
  title: string;
  reason: string;
  posterPath: string | null;
  releaseDate: string | null;
}

const similarSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['shows'],
  properties: {
    shows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tmdbId', 'title', 'reason'],
        properties: {
          tmdbId: { type: 'integer' },
          title: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titlesAlign(left: string, right: string): boolean {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const words = (value: string) => value.split(' ').filter((word) => word.length > 2);
  const aWords = new Set(words(a));
  const shared = words(b).filter((word) => aWords.has(word));
  const needed = Math.min(2, words(b).length);
  return needed > 0 && shared.length >= needed;
}

function parseSuggestions(content: string): GroqSuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new HttpError(502, 'Similar shows response was not valid JSON');
  }

  const shows = (parsed as { shows?: unknown }).shows;
  if (!Array.isArray(shows)) {
    throw new HttpError(502, 'Similar shows response was not valid JSON');
  }

  const suggestions: GroqSuggestion[] = [];
  for (const item of shows) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { tmdbId?: unknown; title?: unknown; reason?: unknown };
    const tmdbId = typeof row.tmdbId === 'number' ? row.tmdbId : Number(row.tmdbId);
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !title || !reason) continue;
    suggestions.push({ tmdbId, title, reason: reason.slice(0, 400) });
    if (suggestions.length >= SHOW_LIMIT) break;
  }
  return suggestions;
}

async function askGroq(source: {
  id: number;
  title: string;
  overview: string | null;
  year: string | null;
}): Promise<GroqSuggestion[]> {
  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: env.groqModel,
        temperature: 0.4,
        reasoning_effort: 'low',
        messages: [
          {
            role: 'system',
            content:
              'You recommend TV series similar to a source series. Use real TMDB TV series ids. Respond with JSON only.',
          },
          {
            role: 'user',
            content: [
              `Source series: ${source.title}${source.year ? ` (${source.year})` : ''} (TMDB id ${source.id}).`,
              `Overview: ${(source.overview || 'No overview.').slice(0, 800)}`,
              `List ${SHOW_LIMIT} different TV series a viewer of the source would want next.`,
              'Each item needs the real TMDB TV series id, the series title, and one sentence on why it is similar.',
              'Do not include the source series. Do not include movies.',
            ].join('\n'),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'similar_tv_shows',
            strict: true,
            schema: similarSchema,
          },
        },
      }),
    });
  } catch (error) {
    console.error('Groq request failed', error);
    throw new HttpError(502, 'Could not reach Groq');
  }

  if (response.status === 429) {
    throw new HttpError(429, 'Groq rate limit reached, try again shortly');
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Groq request failed', response.status, detail.slice(0, 500));
    throw new HttpError(502, 'Could not list similar shows');
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new HttpError(502, 'Similar shows response was empty');
  return parseSuggestions(content);
}

function fromTmdb(result: TmdbSearchResult, reason: string): SimilarShow | null {
  const title = result.name ?? result.title;
  if (!title) return null;
  return {
    tmdbId: result.id,
    title,
    reason,
    posterPath: result.poster_path ?? null,
    releaseDate: result.first_air_date ?? result.release_date ?? null,
  };
}

async function resolveSuggestion(suggestion: GroqSuggestion, sourceId: number): Promise<SimilarShow | null> {
  if (suggestion.tmdbId === sourceId) return null;

  try {
    const show = await tmdb.show(suggestion.tmdbId);
    if (titlesAlign(show.name, suggestion.title)) {
      return {
        tmdbId: show.id,
        title: show.name,
        reason: suggestion.reason,
        posterPath: show.poster_path,
        releaseDate: show.first_air_date,
      };
    }
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
  }

  const found = await tmdb.search('tv', suggestion.title, 1);
  const match =
    found.results.find((result) => result.id !== sourceId && titlesAlign(result.name ?? result.title ?? '', suggestion.title)) ??
    found.results.find((result) => result.id !== sourceId);
  if (!match) return null;
  return fromTmdb(match, suggestion.reason);
}

export const handler = withHttp(async (event) => {
  const user = await verifySupabaseAuth(event);
  enforceRateLimit(`similar:${user.id}`, 8);

  const body = parseBody<SimilarRequest>(event);
  const tmdbId = body.tmdbId;
  if (!tmdbId || !Number.isInteger(tmdbId) || tmdbId <= 0) {
    throw new HttpError(400, 'tmdbId is required');
  }

  const source = await tmdb.show(tmdbId);
  const suggestions = await askGroq({
    id: source.id,
    title: source.name,
    overview: source.overview,
    year: source.first_air_date?.slice(0, 4) ?? null,
  });

  const resolved = await Promise.all(suggestions.map((suggestion) => resolveSuggestion(suggestion, source.id)));
  const seen = new Set<number>();
  const shows = resolved.filter((show): show is SimilarShow => {
    if (!show || seen.has(show.tmdbId)) return false;
    seen.add(show.tmdbId);
    return true;
  });

  return json(200, {
    source: { tmdbId: source.id, title: source.name },
    shows,
  });
});
