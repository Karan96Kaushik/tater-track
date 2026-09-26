import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { mediaApi } from '@/lib/amplify/media-functions';

export function SettingsPanel() {
  const { user } = useAuth();
  const { settings, loading, update } = useSettings();
  const [issue, setIssue] = useState('');
  const [checks, setChecks] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);

  async function runSmokeTest() {
    setBusy(true);
    try {
      const result = await mediaApi.smokeTest();
      setChecks(result.checks);
    } catch (cause) {
      toast.error('Backend check failed', { description: (cause as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function submitIssue(event: React.FormEvent) {
    event.preventDefault();
    if (!issue.trim()) return;
    try {
      await mediaApi.reportIssue({ message: issue, category: 'feedback' });
      setIssue('');
      toast.success('Thanks — report sent');
    } catch (cause) {
      toast.error('Could not send report', { description: (cause as Error).message });
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferences</CardTitle>
          <CardDescription>Signed in as {user?.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>
                  Upcoming window
                  <span className="block text-xs text-muted-foreground">
                    How many days ahead the schedule looks.
                  </span>
                </span>
                <Input
                  type="number"
                  min={7}
                  max={180}
                  className="w-24"
                  value={settings?.upcoming_window_days ?? 30}
                  onChange={(event) =>
                    void update({ upcoming_window_days: Number(event.target.value) })
                  }
                />
              </label>

              <label className="flex items-center justify-between gap-4 text-sm">
                <span>
                  Include specials
                  <span className="block text-xs text-muted-foreground">
                    Season 0 episodes in progress and schedules.
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={settings?.include_specials ?? false}
                  onChange={(event) => void update({ include_specials: event.target.checked })}
                />
              </label>

              <label className="flex items-center justify-between gap-4 text-sm">
                <span>
                  Region
                  <span className="block text-xs text-muted-foreground">
                    Used for release dates and providers.
                  </span>
                </span>
                <Input
                  className="w-24 uppercase"
                  maxLength={2}
                  value={settings?.region ?? 'US'}
                  onChange={(event) => void update({ region: event.target.value.toUpperCase() })}
                />
              </label>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backend status</CardTitle>
          <CardDescription>Checks Supabase and TMDB credentials from the Lambda.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void runSmokeTest()}>
            {busy && <Loader2 className="size-4 animate-spin" />} Run check
          </Button>
          {checks && (
            <ul className="space-y-1 text-sm">
              {Object.entries(checks).map(([name, status]) => (
                <li key={name} className="flex gap-2">
                  <span className="w-20 text-muted-foreground">{name}</span>
                  <span className={status === 'ok' ? 'text-emerald-400' : 'text-destructive'}>
                    {status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report an issue</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitIssue} className="space-y-3">
            <textarea
              value={issue}
              onChange={(event) => setIssue(event.target.value)}
              rows={4}
              placeholder="What went wrong?"
              className="w-full rounded-md border border-border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="sm" disabled={!issue.trim()}>
              Send
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
