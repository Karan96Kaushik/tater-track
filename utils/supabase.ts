import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from '@/lib/supabase/url';
import type { Database } from '@/lib/supabase/types';

export interface AuthCallbackSnapshot {
  kind: 'recovery' | 'error' | null;
  message: string | null;
  tokenHash: string | null;
}

/** Read before the client is created so a recovery redirect is still in the URL. */
export function readAuthCallback(href?: string): AuthCallbackSnapshot {
  const target = href ?? (typeof window === 'undefined' ? '' : window.location.href);
  if (!target) return { kind: null, message: null, tokenHash: null };

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { kind: null, message: null, tokenHash: null };
  }

  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const type = hash.get('type') ?? url.searchParams.get('type');
  const tokenHash = url.searchParams.get('token_hash');
  const message =
    hash.get('error_description') ??
    url.searchParams.get('error_description') ??
    hash.get('error') ??
    url.searchParams.get('error');

  if (message) return { kind: 'error', message, tokenHash: null };
  if (type === 'recovery') return { kind: 'recovery', message: null, tokenHash };
  if (url.pathname === '/reset-password' && url.searchParams.has('code')) {
    return { kind: 'recovery', message: null, tokenHash: null };
  }
  return { kind: null, message: null, tokenHash: null };
}

export const initialAuthCallback = readAuthCallback();

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL_TATER);
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY_TATER;

if (!url || !publishableKey) {
  // Surfaced loudly in dev; the app renders a config banner instead of crashing.
  console.warn('[tater-track] VITE_SUPABASE_URL_TATER / VITE_SUPABASE_PUBLISHABLE_KEY_TATER are not set.');
}

export const isSupabaseConfigured = Boolean(url && publishableKey);

const projectRef = url ? new URL(url).hostname.split('.')[0] : 'local';

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  publishableKey ?? 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Scoped to the project so a session from another Supabase project is not reused.
      storageKey: `tater_track_${projectRef}_auth`,
    },
  },
);

type RecoveryListener = (active: boolean) => void;

const RECOVERY_FLAG = 'tater_password_recovery';
const recoveryListeners = new Set<RecoveryListener>();
const recoveryVerifications = new Map<string, Promise<string | null>>();
let passwordRecoveryActive =
  typeof sessionStorage !== 'undefined' && sessionStorage.getItem(RECOVERY_FLAG) === '1';

function setPasswordRecoveryActive(active: boolean): void {
  passwordRecoveryActive = active;
  if (typeof sessionStorage !== 'undefined') {
    if (active) sessionStorage.setItem(RECOVERY_FLAG, '1');
    else sessionStorage.removeItem(RECOVERY_FLAG);
  }
  recoveryListeners.forEach((listener) => listener(active));
}

// Subscribe immediately so PASSWORD_RECOVERY is not lost before React mounts.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryActive(true);
  if (event === 'SIGNED_OUT') setPasswordRecoveryActive(false);
});

/** Exchange a recovery `token_hash` from an email link. Safe to call more than once. */
export function verifyRecoveryToken(tokenHash: string): Promise<string | null> {
  const existing = recoveryVerifications.get(tokenHash);
  if (existing) return existing;

  const pending = supabase.auth
    .verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    .then(({ error }) => {
      if (!error) {
        window.history.replaceState(window.history.state, '', '/reset-password');
        return null;
      }
      setPasswordRecoveryActive(false);
      return error.message;
    });
  recoveryVerifications.set(tokenHash, pending);
  return pending;
}

export function subscribePasswordRecovery(listener: RecoveryListener): () => void {
  recoveryListeners.add(listener);
  listener(passwordRecoveryActive);
  return () => {
    recoveryListeners.delete(listener);
  };
}

export function clearPasswordRecovery(): void {
  setPasswordRecoveryActive(false);
}
