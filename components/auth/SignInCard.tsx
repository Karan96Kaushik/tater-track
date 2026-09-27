import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Popcorn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/utils/supabase';

type Mode = 'signin' | 'signup' | 'magic' | 'forgot';

export function SignInCard() {
  const { user, loading, browseAsGuest, signInWithPassword, signUp, signInWithMagicLink, requestPasswordReset } =
    useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get('reset') === '1' ? 'forgot' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email);
        setResetSent(true);
      } else if (mode === 'magic') {
        await signInWithMagicLink(email);
        toast.success('Check your inbox for the sign-in link');
      } else if (mode === 'signup') {
        const { needsConfirmation } = await signUp(email, password);
        toast.success(
          needsConfirmation ? 'Confirm your email to finish signing up' : 'Account created',
        );
      } else {
        await signInWithPassword(email, password);
      }
    } catch (cause) {
      toast.error(mode === 'forgot' ? 'Could not send reset link' : 'Sign in failed', {
        description: (cause as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.55_0.14_60/0.28),transparent_55%)]" />
      <Card className="relative w-full max-w-sm border-border shadow-2xl shadow-black/30">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
            <Popcorn className="size-6" />
          </span>
          <CardTitle className="font-display text-3xl font-medium tracking-tight">tater-track</CardTitle>
          <CardDescription>
            {mode === 'forgot'
              ? 'We will email you a link to choose a new password.'
              : 'Track what you watch and see what airs next.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isSupabaseConfigured && (
            <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
              Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code> and set
              your project URL and publishable key.
            </p>
          )}

          {mode === 'forgot' && resetSent ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                If an account exists for {email}, a reset link is on its way. Open it on this device
                to choose a new password.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setResetSent(false);
                  setMode('signin');
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <Input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              {mode !== 'magic' && mode !== 'forgot' && (
                <Input
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
              {mode === 'signin' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setMode('forgot')}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={busy || !isSupabaseConfigured}>
                {mode === 'signup'
                  ? 'Create account'
                  : mode === 'magic'
                    ? 'Email me a link'
                    : mode === 'forgot'
                      ? 'Send reset link'
                      : 'Sign in'}
              </Button>
            </form>
          )}

          <div className="mt-4 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                browseAsGuest();
                navigate('/discover', { replace: true });
              }}
            >
              Browse without an account
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Search and open titles. Nothing is saved.
            </p>
          </div>

          {!(mode === 'forgot' && resetSent) && (
            <div className="mt-4 flex justify-between text-xs text-muted-foreground">
              {mode === 'forgot' ? (
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={() => setMode('signin')}
                >
                  Back to sign in
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
                  >
                    {mode === 'signup' ? 'Have an account?' : 'Create an account'}
                  </button>
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => setMode(mode === 'magic' ? 'signin' : 'magic')}
                  >
                    {mode === 'magic' ? 'Use a password' : 'Use a magic link'}
                  </button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
