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
