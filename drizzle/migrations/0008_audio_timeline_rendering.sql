-- Phase 08: Audio Studio
create table public.voices (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai','elevenlabs')),
  provider_voice_id text not null,
  name text not null,
  language text, accent text, style text, category text, gender text,
  preview_url text,
  status text not null default 'active' check (status in ('active','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_voice_id)
);
grant select on public.voices to authenticated;
grant all on public.voices to service_role;
alter table public.voices enable row level security;
create policy "Authenticated users read active voices" on public.voices for select to authenticated using (status='active');

create table public.voice_clones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_asset_id uuid references public.assets(id) on delete set null,
  provider text not null, provider_voice_id text,
  name text not null, consent_confirmed boolean not null default false,
  consent_text text,
  status text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select,insert,update,delete on public.voice_clones to authenticated;
grant all on public.voice_clones to service_role;
alter table public.voice_clones enable row level security;
create policy "Users manage own voice clones" on public.voice_clones for all to authenticated
using (auth.uid()=user_id and public.owns_project(project_id))
with check (auth.uid()=user_id and public.owns_project(project_id));

create table public.voiceovers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid not null references public.scenes(id) on delete cascade,
  voice_id uuid not null references public.voices(id),
  generation_job_id uuid references public.generation_jobs(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  provider text not null, model text not null,
  text text not null, text_hash text not null,
  status text not null default 'generating' check (status in ('generating','ready','failed')),
  duration_seconds numeric, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select,insert,update,delete on public.voiceovers to authenticated;
grant all on public.voiceovers to service_role;
alter table public.voiceovers enable row level security;
create policy "Users manage own voiceovers" on public.voiceovers for all to authenticated
using (public.owns_project(project_id)) with check (public.owns_project(project_id));

create table public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  title text not null, genre text, mood text, duration_seconds numeric,
  license text, provider text not null default 'upload', provider_asset_id text,
  attribution text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select,insert,update,delete on public.music_tracks to authenticated;
grant all on public.music_tracks to service_role;
alter table public.music_tracks enable row level security;
create policy "Users manage own music tracks" on public.music_tracks for all to authenticated
using (public.owns_project(project_id)) with check (public.owns_project(project_id));

create table public.scene_audio (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid not null unique references public.scenes(id) on delete cascade,
  voiceover_id uuid references public.voiceovers(id) on delete set null,
  music_track_id uuid references public.music_tracks(id) on delete set null,
  sfx_asset_id uuid references public.assets(id) on delete set null,
  voice_volume numeric not null default 1 check (voice_volume between 0 and 2),
  music_volume numeric not null default .25 check (music_volume between 0 and 2),
  sfx_volume numeric not null default .5 check (sfx_volume between 0 and 2),
  fade_in_ms integer not null default 0 check (fade_in_ms between 0 and 60000),
  fade_out_ms integer not null default 0 check (fade_out_ms between 0 and 60000),
  ducking_enabled boolean not null default true,
  ducking_amount numeric not null default .65 check (ducking_amount between 0 and 1),
  ducking_attack_ms integer not null default 120 check (ducking_attack_ms between 0 and 10000),
  ducking_release_ms integer not null default 350 check (ducking_release_ms between 0 and 10000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select,insert,update,delete on public.scene_audio to authenticated;
grant all on public.scene_audio to service_role;
alter table public.scene_audio enable row level security;
create policy "Users manage own scene audio" on public.scene_audio for all to authenticated
using (public.owns_project(project_id)) with check (public.owns_project(project_id));

insert into public.ai_tasks(slug,name,description,model,credit_cost,is_active) values
('tts_voiceover','AI voiceover','Generate narration audio','gpt-4o-mini-tts',15,true),
('tts_preview','Voice preview','Generate a short voice preview','gpt-4o-mini-tts',1,true),
('clone_voice','Voice clone','Create an authorized voice clone','elevenlabs-ivc',20,true),
('generate_music','AI music','Generate an instrumental music bed','elevenlabs-music',25,true)
on conflict(slug) do update set name=excluded.name,description=excluded.description,model=excluded.model,credit_cost=excluded.credit_cost,is_active=excluded.is_active;

insert into public.voices(provider,provider_voice_id,name,language,style,category,metadata) values
('openai','alloy','Alloy','en','neutral','built-in','{"model":"gpt-4o-mini-tts"}'),
('openai','ash','Ash','en','warm','built-in','{"model":"gpt-4o-mini-tts"}'),
('openai','coral','Coral','en','bright','built-in','{"model":"gpt-4o-mini-tts"}'),
('openai','echo','Echo','en','clear','built-in','{"model":"gpt-4o-mini-tts"}'),
('openai','fable','Fable','en','storytelling','built-in','{"model":"gpt-4o-mini-tts"}'),
('openai','nova','Nova','en','energetic','built-in','{"model":"gpt-4o-mini-tts"}'),
('openai','onyx','Onyx','en','deep','built-in','{"model":"gpt-4o-mini-tts"}'),
('openai','sage','Sage','en','calm','built-in','{"model":"gpt-4o-mini-tts"}'),
('openai','shimmer','Shimmer','en','soft','built-in','{"model":"gpt-4o-mini-tts"}'),
('openai','verse','Verse','en','expressive','built-in','{"model":"gpt-4o-mini-tts"}')
on conflict(provider,provider_voice_id) do nothing;

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

-- Phase 10: Rendering + Cloud Export
create table public.render_presets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  width integer not null check (width between 320 and 7680),
  height integer not null check (height between 320 and 7680),
  fps integer not null check (fps in (24,25,30,50,60)),
  video_codec text not null default 'h264',
  audio_codec text not null default 'aac',
  video_bitrate_kbps integer not null default 8000 check (video_bitrate_kbps between 500 and 100000),
  audio_bitrate_kbps integer not null default 192 check (audio_bitrate_kbps between 32 and 1024),
  container text not null default 'mp4' check (container in ('mp4','webm')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select,insert,update,delete on public.render_presets to authenticated;
grant all on public.render_presets to service_role;
alter table public.render_presets enable row level security;
create policy "Users manage own render presets" on public.render_presets for all to authenticated
using (public.owns_project(project_id)) with check (public.owns_project(project_id));

create table public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  preset_id uuid references public.render_presets(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  provider text not null default 'cloud',
  provider_job_id text,
  progress numeric not null default 0 check (progress between 0 and 100),
  input_manifest jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select,insert,update on public.render_jobs to authenticated;
grant all on public.render_jobs to service_role;
alter table public.render_jobs enable row level security;
create policy "Users read own render jobs" on public.render_jobs for select to authenticated using (auth.uid()=user_id);
create policy "Users create own render jobs" on public.render_jobs for insert to authenticated with check (auth.uid()=user_id and public.owns_project(project_id));
create index render_jobs_project_idx on public.render_jobs(project_id, created_at desc);
create index render_jobs_status_idx on public.render_jobs(status, created_at);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  render_job_id uuid not null references public.render_jobs(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  format text not null,
  storage_path text,
  filename text not null,
  size_bytes bigint,
  duration_seconds numeric,
  width integer,
  height integer,
  fps integer,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select,insert,update on public.exports to authenticated;
grant all on public.exports to service_role;
alter table public.exports enable row level security;
create policy "Users read own exports" on public.exports for select to authenticated using (public.owns_project(project_id));
create index exports_project_idx on public.exports(project_id, created_at desc);

insert into public.ai_tasks(slug,name,description,model,credit_cost,is_active) values
('render_video','Video render','Render the project timeline to an export','cloud-renderer',0,true)
on conflict(slug) do update set name=excluded.name,description=excluded.description,model=excluded.model,credit_cost=excluded.credit_cost,is_active=excluded.is_active;