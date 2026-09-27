import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Popcorn } from 'lucide-react';
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
import { initialAuthCallback, verifyRecoveryToken } from '@/utils/supabase';

export function ResetPassword() {
  const { loading, user, passwordRecovery, updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [exchangeDone, setExchangeDone] = useState(!initialAuthCallback.tokenHash);

  useEffect(() => {
    const tokenHash = initialAuthCallback.tokenHash;
    if (!tokenHash) return;
    let active = true;
    verifyRecoveryToken(tokenHash).then((message) => {
      if (!active) return;
      setExchangeError(message);
      setExchangeDone(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (done) return <Navigate to="/" replace />;

  const callback = initialAuthCallback;
  const waitingForLink =
    (loading && callback.kind === 'recovery' && !exchangeError) ||
    (!exchangeDone && !exchangeError);
  const canChoosePassword = passwordRecovery && Boolean(user);
  const linkFailed = !waitingForLink && !canChoosePassword && (callback.kind !== null || Boolean(exchangeError));
  const failureMessage = exchangeError ?? callback.message;

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.55_0.14_60/0.28),transparent_55%)]" />
      <Card className="relative w-full max-w-sm border-border shadow-2xl shadow-black/30">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
            <Popcorn className="size-6" />
          </span>
          <CardTitle className="font-display text-2xl font-medium tracking-tight">Choose a new password</CardTitle>
          <CardDescription>
            {canChoosePassword
              ? 'Use at least 8 characters.'
              : 'This page opens from the reset link in your email.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {waitingForLink ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : canChoosePassword ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (password !== confirm) {
                  toast.error('Passwords do not match');
                  return;
                }
                setBusy(true);
                try {
                  await updatePassword(password);
                  toast.success('Password updated');
                  setDone(true);
                } catch (cause) {
                  toast.error('Could not update password', {
                    description: (cause as Error).message,
                  });
                } finally {
                  setBusy(false);
                }
              }}
              className="space-y-3"
            >
              <Input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="New password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <Input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
              <Button type="submit" className="w-full" disabled={busy}>
                Update password
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {linkFailed
                  ? (failureMessage ?? 'This reset link is invalid or has expired.')
                  : 'Open the password reset link from your email, or request a new one.'}
              </p>
              {user ? (
                <Button asChild variant="outline" className="w-full">
                  <Link to="/">Back to your library</Link>
                </Button>
              ) : (
                <Button asChild className="w-full">
                  <Link to="/login?reset=1">Request a new link</Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
