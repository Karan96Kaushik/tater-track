-- Browser clients may read unexpired TMDB detail rows. Writes stay on the secret key.

drop policy if exists tmdb_cache_read on public.tmdb_cache;
create policy tmdb_cache_read on public.tmdb_cache
  for select
  to anon, authenticated
  using (expires_at > now());
