-- 0001_init: initial tater-track schema (mirrors supabase/schema.sql)
-- tater-track schema
-- Auth is Supabase only. Every user-facing table is keyed to auth.users and guarded by RLS.
-- Lambdas use the service-role key *after* verifying the caller's JWT.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type media_type as enum ('movie', 'tv');
exception when duplicate_object then null; end $$;

do $$ begin
  create type track_status as enum ('watchlist', 'watching', 'completed', 'dropped');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  region text not null default 'US',
  include_specials boolean not null default false,
  upcoming_window_days integer not null default 30,
  theme text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- This project may already host a `user_settings` table from another app, in
-- which case the create above is a no-op; add the columns tater-track needs.
alter table public.user_settings
  add column if not exists region text not null default 'US',
  add column if not exists include_specials boolean not null default false,
  add column if not exists upcoming_window_days integer not null default 30,
  add column if not exists theme text not null default 'system',
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- tracked_media: one row per movie/show a user has engaged with
-- ---------------------------------------------------------------------------

create table if not exists public.tracked_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_id integer not null,
  media_type media_type not null,
  status track_status not null default 'watchlist',
  title text not null,
  poster_path text,
  backdrop_path text,
  release_date date,
  -- denormalised TV progress so the grid renders without extra round trips
  total_episodes integer,
  watched_episode_count integer not null default 0,
  user_rating smallint check (user_rating between 1 and 10),
  notes text,
  last_watched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, media_type, tmdb_id)
);

create index if not exists tracked_media_user_status_idx
  on public.tracked_media (user_id, status, updated_at desc);

-- ---------------------------------------------------------------------------
-- watched_episodes: per-episode progress for TV
-- ---------------------------------------------------------------------------

create table if not exists public.watched_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_show_id integer not null,
  season_number integer not null,
  episode_number integer not null,
  episode_name text,
  air_date date,
  watched_at timestamptz not null default now(),
  unique (user_id, tmdb_show_id, season_number, episode_number)
);

create index if not exists watched_episodes_user_show_idx
  on public.watched_episodes (user_id, tmdb_show_id, season_number, episode_number);

-- ---------------------------------------------------------------------------
-- upcoming_episodes: snapshot refreshed from TMDB for shows the user watches
-- ---------------------------------------------------------------------------

create table if not exists public.upcoming_episodes (
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_show_id integer not null,
  season_number integer not null,
  episode_number integer not null,
  show_name text not null,
  episode_name text,
  overview text,
  air_date date,
  poster_path text,
  still_path text,
  refreshed_at timestamptz not null default now(),
  primary key (user_id, tmdb_show_id, season_number, episode_number)
);

create index if not exists upcoming_episodes_user_air_idx
  on public.upcoming_episodes (user_id, air_date);

-- ---------------------------------------------------------------------------
-- user_backups: JSON export/import of a user's tracking state
-- ---------------------------------------------------------------------------

create table if not exists public.user_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists user_backups_user_idx
  on public.user_backups (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- issue_reports: written by the report-issue Lambda with the service-role key
-- ---------------------------------------------------------------------------

create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text,
  category text,
  message text not null,
  context jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tmdb_cache: shared response cache, service-role only (no user rows)
-- ---------------------------------------------------------------------------

create table if not exists public.tmdb_cache (
  cache_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists tmdb_cache_expires_idx on public.tmdb_cache (expires_at);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tracked_media_set_updated_at on public.tracked_media;
create trigger tracked_media_set_updated_at
  before update on public.tracked_media
  for each row execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.user_settings enable row level security;
alter table public.tracked_media enable row level security;
alter table public.watched_episodes enable row level security;
alter table public.upcoming_episodes enable row level security;
alter table public.user_backups enable row level security;
alter table public.issue_reports enable row level security;
alter table public.tmdb_cache enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings',
    'tracked_media',
    'watched_episodes',
    'upcoming_episodes',
    'user_backups'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_rw', t);
    execute format($p$
      create policy %I on public.%I
        for all
        to authenticated
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id)
    $p$, t || '_owner_rw', t);
  end loop;
end $$;

-- Users may file their own reports and read them back; the Lambda writes with
-- the service-role key, which bypasses RLS.
drop policy if exists issue_reports_owner_rw on public.issue_reports;
create policy issue_reports_owner_rw on public.issue_reports
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- tmdb_cache intentionally has RLS enabled and no policies: service-role only.
