begin;
alter table public.episodes add column if not exists series text not null default '' check(length(series)<=120);
alter table public.episodes add column if not exists episode_number integer check(episode_number between 1 and 9999);
with numbered as (select id,row_number() over(partition by series order by release_at nulls last,created_at,id) as n from public.episodes) update public.episodes e set episode_number=n.n from numbered n where e.id=n.id and e.episode_number is null;
create unique index if not exists episodes_series_number_unique on public.episodes(series,episode_number);
-- For an existing installation: run this once in Supabase SQL Editor.
-- Only announced episode metadata is exposed before release; never the audio.
create or replace function public.library_feed()
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'server_now', now(),
    'episodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'series', e.series,
        'episode_number', e.episode_number,
        'description', e.description,
        'duration', e.duration,
        'status', e.status,
        'release_at', e.release_at,
        'available', e.release_at <= now(),
        'storage_path', case when e.release_at <= now() then e.storage_path else null end
      ) order by e.release_at)
      from public.episodes e
      where e.status = 'published'
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.library_feed() from public;
grant execute on function public.library_feed() to anon, authenticated;

commit;
