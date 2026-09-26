import { NavLink, Outlet } from 'react-router-dom';
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
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Popcorn className="size-5 text-primary" />
            tater-track
          </div>

          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
                    isActive && 'bg-muted text-foreground',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <Button
            variant="ghost"
            size="icon"
            className="ml-auto sm:ml-0"
            title={user?.email ?? 'Sign out'}
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      {!areFunctionsConfigured && (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-300">
          Amplify functions are not deployed. Run <code>npm run amplify:sandbox</code> to populate{' '}
          <code>amplify_outputs.json</code>.
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:pb-6">
        <Outlet />
      </main>

      {/* Mobile tab bar: the PWA is installed to a phone home screen more often than not. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground',
                isActive && 'text-foreground',
              )
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
