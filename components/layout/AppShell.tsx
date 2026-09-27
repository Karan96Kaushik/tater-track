import { Link, NavLink, Outlet } from 'react-router-dom';
import { CalendarClock, Library, LogOut, Popcorn, Search, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { areFunctionsConfigured } from '@/lib/amplify/client';

const NAV = [
  { to: '/', label: 'Library', icon: Library, end: true },
  { to: '/discover', label: 'Discover', icon: Search, end: false },
  { to: '/upcoming', label: 'Upcoming', icon: CalendarClock, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
];

export function AppShell() {
  const { user, isGuest, signOut } = useAuth();
  const browsing = isGuest && !user;
  const links = browsing ? NAV.filter((item) => item.to === '/discover') : NAV;

  return (
    <div className="min-h-dvh text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to={browsing ? '/discover' : '/'} className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
              <Popcorn className="size-4" />
            </span>
            <span className="font-display text-lg font-medium tracking-tight">TaterTrack</span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 rounded-full bg-muted/70 p-1 ring-1 ring-border sm:flex">
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
                    isActive && 'bg-primary text-primary-foreground shadow-sm hover:text-primary-foreground',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          {browsing ? (
            <Button asChild size="sm" className="ml-auto rounded-full sm:ml-0">
              <Link to="/login">Sign in</Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto rounded-full sm:ml-0"
              title={user?.email ?? 'Sign out'}
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" />
            </Button>
          )}
        </div>
      </header>

      {browsing && (
        <div className="border-b border-border bg-primary/8 px-4 py-2 text-center text-xs text-muted-foreground">
          Browsing only. Sign in to save a watchlist or track episodes.
        </div>
      )}

      {!areFunctionsConfigured && (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-300">
          Amplify functions are not deployed. Run <code>npm run amplify:sandbox</code> to populate{' '}
          <code>amplify_outputs.json</code>.
        </div>
      )}

      <main className={cn('mx-auto max-w-6xl px-4 py-8', links.length > 1 ? 'pb-28 sm:pb-10' : 'pb-10')}>
        <Outlet />
      </main>

      {/* Mobile tab bar: the PWA is installed to a phone home screen more often than not. */}
      {links.length > 1 && (
        <nav className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex gap-1 rounded-2xl border border-border bg-card/85 p-1.5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:hidden">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] text-muted-foreground transition-colors',
                  isActive && 'bg-primary/15 text-primary',
                )
              }
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
