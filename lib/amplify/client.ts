import amplifyOutputs from '@/amplify_outputs.json';
import { supabase } from '@/utils/supabase';

type FunctionKey =
  | 'tmdbSearchUrl'
  | 'tmdbDetailsUrl'
  | 'trackMediaUrl'
  | 'upcomingEpisodesUrl'
  | 'reportIssueUrl'
  | 'amplifyTestUrl'
  | 'aiChatUrl';

const custom = (amplifyOutputs as { custom?: Partial<Record<FunctionKey, string>> }).custom ?? {};

export class FunctionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'FunctionError';
  }
}

export function functionUrl(key: FunctionKey): string | null {
  const url = custom[key];
  return url ? url.replace(/\/$/, '') : null;
}

export const areFunctionsConfigured = Boolean(functionUrl('tmdbSearchUrl'));

interface CallOptions {
  /** Search and title details work without a session. Tracking calls stay signed-in only. */
  auth?: 'required' | 'optional';
}

/** POSTs to a Lambda Function URL with the current Supabase access token. */
export async function callFunction<TResponse, TBody extends object = object>(
  key: FunctionKey,
  body: TBody,
  options: CallOptions = {},
): Promise<TResponse> {
  const url = functionUrl(key);
  if (!url) {
    throw new FunctionError(
      503,
      'Backend is not deployed yet. Run `npm run amplify:sandbox` to generate amplify_outputs.json.',
    );
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token && options.auth !== 'optional') {
    throw new FunctionError(401, 'You need to sign in again.');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new FunctionError(response.status, message);
  }

  return payload as TResponse;
}
