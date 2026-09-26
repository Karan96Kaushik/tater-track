import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { clearPasswordRecovery, subscribePasswordRecovery, supabase } from '@/utils/supabase';

const GUEST_KEY = 'tater_track_guest_browse';

function readGuestFlag(): boolean {
  try {
    return sessionStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}

function writeGuestFlag(active: boolean) {
  try {
    if (active) sessionStorage.setItem(GUEST_KEY, '1');
    else sessionStorage.removeItem(GUEST_KEY);
  } catch {
    // Private mode can block storage; the in-memory flag still covers this tab.
  }
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** Signed-out session that can search and open titles, without a library. */
  isGuest: boolean;
  loading: boolean;
  passwordRecovery: boolean;
  browseAsGuest: () => void;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signInWithMagicLink: (email: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isGuest, setIsGuest] = useState(readGuestFlag);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribeRecovery = subscribePasswordRecovery((activeRecovery) => {
      if (active) setPasswordRecovery(activeRecovery);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        writeGuestFlag(false);
        setIsGuest(false);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session) {
        const { error } = await supabase.auth.getUser();
        if (!active) return;
        if (error) {
          await supabase.auth.signOut();
          setSession(null);
          setLoading(false);
          return;
        }
        writeGuestFlag(false);
        setIsGuest(false);
      }
      setSession(data.session);
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribeRecovery();
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isGuest: session ? false : isGuest,
      loading,
      passwordRecovery,
      browseAsGuest() {
        writeGuestFlag(true);
        setIsGuest(true);
      },
      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
      },
      async signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw new Error(error.message);
        return { needsConfirmation: !data.session };
      },
      async signInWithMagicLink(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw new Error(error.message);
      },
      async requestPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw new Error(error.message);
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error(error.message);
        clearPasswordRecovery();
      },
      async signOut() {
        writeGuestFlag(false);
        setIsGuest(false);
        await supabase.auth.signOut();
      },
    }),
    [session, isGuest, loading, passwordRecovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
