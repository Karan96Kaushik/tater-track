import { useMemo } from 'react';
import { CheckCircle2, Clock, Film, Tv } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { TrackedMedia } from '@/lib/supabase/types';

export function StatsRow({ items }: { items: TrackedMedia[] }) {
  const stats = useMemo(() => {
    const movies = items.filter((item) => item.media_type === 'movie');
    const shows = items.filter((item) => item.media_type === 'tv');
    return [
      { label: 'Movies', value: movies.length, icon: Film },
      { label: 'Shows', value: shows.length, icon: Tv },
      {
        label: 'Watching',
        value: items.filter((item) => item.status === 'watching').length,
        icon: Clock,
      },
      {
        label: 'Episodes watched',
        value: shows.reduce((total, show) => total + show.watched_episode_count, 0),
        icon: CheckCircle2,
      },
    ];
  }, [items]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardContent className="flex items-center gap-3 p-4">
            <Icon className="size-5 text-muted-foreground" />
            <div>
              <div className="text-xl font-semibold leading-none">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
