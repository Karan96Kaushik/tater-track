import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isGuest, loading } = useAuth();
  const location = useLocation();

  if (loading && !isGuest) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user && !isGuest) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
}

/** Library, upcoming, and settings need an account. Guests stay on discover. */
export function SignedInOnly({ children }: { children: ReactNode }) {
  const { user, isGuest } = useAuth();
  if (!user && isGuest) return <Navigate to="/discover" replace />;
  return <>{children}</>;
}
