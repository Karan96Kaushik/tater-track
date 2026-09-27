/**
 * Exercises the TMDB integration without AWS or Supabase in the loop.
 *   TMDB_ACCESS_TOKEN=... npx tsx scripts/test-tmdb.ts "the last of us"
 */
const token = process.env.TMDB_ACCESS_TOKEN;
if (!token) {
  console.error('TMDB_ACCESS_TOKEN is required (see .env.local)');
  process.exit(1);
}

const query = process.argv[2] ?? 'the last of us';
const BASE = 'https://api.themoviedb.org/3';
const scriptStart = performance.now();

function elapsed(start: number) {
  return `${Math.round(performance.now() - start)}ms`;
}

function done() {
  console.log(`done in ${elapsed(scriptStart)}`);
}

async function api<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`${path} → ${response.status} ${await response.text()}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw lastError;
}

interface SearchResponse {
  results: Array<{ id: number; media_type?: string; name?: string; title?: string; first_air_date?: string }>;
}

interface ShowResponse {
  id: number;
  name: string;
  number_of_episodes: number;
  status: string;
  next_episode_to_air: { season_number: number; episode_number: number; name: string; air_date: string } | null;
}

interface SeasonResponse {
  episodes: Array<{ season_number: number; episode_number: number; name: string; air_date: string | null }>;
}

const searchStart = performance.now();
const search = await api<SearchResponse>('/search/multi', { query, include_adult: 'false' });
const show = search.results.find((result) => result.media_type === 'tv');
console.log(`search/multi "${query}" → ${search.results.length} results (${elapsed(searchStart)})`);

if (!show) {
  console.log('No TV result to inspect.');
  done();
  process.exit(0);
}

const detailsStart = performance.now();
const details = await api<ShowResponse>(`/tv/${show.id}`);
console.log(
  `tv/${show.id} → ${details.name} (${details.status}, ${details.number_of_episodes} eps) (${elapsed(detailsStart)})`,
);

const next = details.next_episode_to_air;
if (!next) {
  console.log('next_episode_to_air: none scheduled');
  done();
  process.exit(0);
}

console.log(`next_episode_to_air: S${next.season_number}E${next.episode_number} "${next.name}" on ${next.air_date}`);

// Same window logic the upcoming-episodes Lambda uses.
const horizon = new Date();
horizon.setUTCDate(horizon.getUTCDate() + 30);
const today = new Date().toISOString().slice(0, 10);
const horizonDay = horizon.toISOString().slice(0, 10);

const seasonStart = performance.now();
const season = await api<SeasonResponse>(`/tv/${show.id}/season/${next.season_number}`);
const upcoming = season.episodes.filter(
  (episode) => episode.air_date && episode.air_date >= today && episode.air_date <= horizonDay,
);

console.log(`season/${next.season_number} → ${season.episodes.length} episodes (${elapsed(seasonStart)})`);
console.log(`episodes airing in the next 30 days: ${upcoming.length}`);
for (const episode of upcoming) {
  console.log(`  S${episode.season_number}E${episode.episode_number} ${episode.air_date} — ${episode.name}`);
}
done();
