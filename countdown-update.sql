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
