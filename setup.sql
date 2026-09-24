-- Run once in a NEW dedicated Supabase project's SQL Editor.
begin;

create table public.studio_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.studio_admins enable row level security;
revoke all on public.studio_admins from anon, authenticated;

create function public.is_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$ select exists(select 1 from public.studio_admins where user_id = (select auth.uid())); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  series text not null default '' check(length(series)<=120),
  episode_number integer check(episode_number between 1 and 9999),
  title text not null check(length(trim(title)) between 1 and 120),
  description text not null default '' check(length(description) <= 2000),
  storage_path text not null unique,
  duration integer not null check(duration > 0),
  file_size bigint not null check(file_size > 0 and file_size <= 52428800),
  status text not null default 'draft' check(status in ('draft','published')),
  release_at timestamptz,
  created_at timestamptz not null default now(),
  check(status = 'draft' or release_at is not null),
  check(storage_path = id::text || '.mp3')
);
create unique index episodes_series_number_unique on public.episodes(series,episode_number);
create index episodes_release_idx on public.episodes (release_at desc) where status = 'published';
alter table public.episodes enable row level security;
revoke all on public.episodes from anon, authenticated;
grant select on public.episodes to anon, authenticated;
grant insert, update, delete on public.episodes to authenticated;

create policy "Released episodes can be read" on public.episodes
for select to anon, authenticated
using (status = 'published' and release_at <= now());

create policy "Only studio admins manage episodes" on public.episodes
for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio','audio',false,52428800,array['audio/mpeg']);

create policy "Only admins upload audio" on storage.objects
for insert to authenticated
with check (bucket_id = 'audio' and (select public.is_admin())
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$');

create policy "Only admins remove audio" on storage.objects
for delete to authenticated
using (bucket_id = 'audio' and (select public.is_admin()));

create policy "Audio can be read only when released or by admin" on storage.objects
for select to anon, authenticated
using (bucket_id = 'audio' and (
  (select public.is_admin()) or exists (
    select 1 from public.episodes e
    where e.storage_path = storage.objects.name
    and e.status = 'published' and e.release_at <= now()
  )
));

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

-- NEXT: Create your own user in Authentication > Users > Add user.
-- Then substitute its User UID below and run this ONE line separately:
-- insert into public.studio_admins (user_id) values ('YOUR-USER-UID-HERE');
