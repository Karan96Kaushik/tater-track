import { useState } from 'react';
import { Navigate } from 'react-router-dom';
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

type Mode = 'signin' | 'signup' | 'magic';

export function SignInCard() {
  const { user, loading, signInWithPassword, signUp, signInWithMagicLink } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === 'magic') {
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
      toast.error('Sign in failed', { description: (cause as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Popcorn className="mb-2 size-8 text-primary" />
          <CardTitle className="text-xl">tater-track</CardTitle>
          <CardDescription>
            Track what you watch and see what airs next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isSupabaseConfigured && (
            <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
              Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code> and set
              your project URL and publishable key.
            </p>
          )}

          <form onSubmit={onSubmit} className="space-y-3">
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {mode !== 'magic' && (
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
            <Button type="submit" className="w-full" disabled={busy || !isSupabaseConfigured}>
              {mode === 'signup' ? 'Create account' : mode === 'magic' ? 'Email me a link' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-4 flex justify-between text-xs text-muted-foreground">
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
