-- Phase 09: Timeline Editor + Captions
create table public.timeline_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  fps integer not null default 30 check (fps in (24,25,30,50,60)),
  width integer not null default 1920 check (width between 320 and 7680),
  height integer not null default 1080 check (height between 320 and 7680),
  snap_enabled boolean not null default true,
  grid_seconds numeric not null default 1 check (grid_seconds > 0 and grid_seconds <= 10),
  caption_style jsonb not null default '{"font":"Inter","size":54,"position":"bottom","max_words":5}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select,insert,update,delete on public.timeline_settings to authenticated;
grant all on public.timeline_settings to service_role;
alter table public.timeline_settings enable row level security;
create policy "Users manage own timeline settings" on public.timeline_settings for all to authenticated
using (public.owns_project(project_id)) with check (public.owns_project(project_id));

create table public.timeline_tracks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  track_type text not null check (track_type in ('video','audio','caption','overlay')),
  position integer not null default 0,
  muted boolean not null default false,
  locked boolean not null default false,
  visible boolean not null default true,
  volume numeric not null default 1 check (volume between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select,insert,update,delete on public.timeline_tracks to authenticated;
grant all on public.timeline_tracks to service_role;
alter table public.timeline_tracks enable row level security;
create policy "Users manage own timeline tracks" on public.timeline_tracks for all to authenticated
using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create index timeline_tracks_project_idx on public.timeline_tracks(project_id, position);

create table public.timeline_clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  track_id uuid not null references public.timeline_tracks(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  clip_type text not null check (clip_type in ('video','image','voice','music','sfx','overlay')),
  start_seconds numeric not null default 0 check (start_seconds >= 0),
  duration_seconds numeric not null default 1 check (duration_seconds > 0),
  source_start_seconds numeric not null default 0 check (source_start_seconds >= 0),
  playback_rate numeric not null default 1 check (playback_rate > 0 and playback_rate <= 4),
  volume numeric not null default 1 check (volume between 0 and 2),
  opacity numeric not null default 1 check (opacity between 0 and 1),
  transition_in text,
  transition_out text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select,insert,update,delete on public.timeline_clips to authenticated;
grant all on public.timeline_clips to service_role;
alter table public.timeline_clips enable row level security;
create policy "Users manage own timeline clips" on public.timeline_clips for all to authenticated
using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create index timeline_clips_track_idx on public.timeline_clips(track_id, start_seconds);
create index timeline_clips_project_idx on public.timeline_clips(project_id, start_seconds);

create table public.captions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete set null,
  text text not null,
  start_seconds numeric not null check (start_seconds >= 0),
  end_seconds numeric not null check (end_seconds > start_seconds),
  style jsonb not null default '{}'::jsonb,
  position text not null default 'bottom' check (position in ('top','center','bottom')),
  words jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select,insert,update,delete on public.captions to authenticated;
grant all on public.captions to service_role;
alter table public.captions enable row level security;
create policy "Users manage own captions" on public.captions for all to authenticated
using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create index captions_project_time_idx on public.captions(project_id, start_seconds);

create table public.caption_styles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  style jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
grant select,insert,update,delete on public.caption_styles to authenticated;
grant all on public.caption_styles to service_role;
alter table public.caption_styles enable row level security;
create policy "Users manage own caption styles" on public.caption_styles for all to authenticated
using (public.owns_project(project_id)) with check (public.owns_project(project_id));

