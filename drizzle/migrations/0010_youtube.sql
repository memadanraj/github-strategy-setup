-- Phase 12: YouTube publishing, OAuth connections and analytics

create table if not exists public.youtube_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  channel_id text not null,
  channel_title text,
  channel_thumbnail_url text,
  access_token_enc text,
  refresh_token_enc text not null,
  access_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select,insert,update,delete on public.youtube_connections to authenticated;
grant all on public.youtube_connections to service_role;
alter table public.youtube_connections enable row level security;
create policy "Users read own YouTube connection" on public.youtube_connections for select to authenticated using (auth.uid()=user_id);

create table if not exists public.youtube_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_path text not null default '/dashboard',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
grant all on public.youtube_oauth_states to service_role;
alter table public.youtube_oauth_states enable row level security;
create index if not exists youtube_oauth_states_expiry_idx on public.youtube_oauth_states(expires_at);

create table if not exists public.youtube_publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  export_id uuid references public.exports(id) on delete set null,
  youtube_video_id text,
  title text not null,
  description text,
  tags text[] not null default '{}',
  category_id text not null default '22',
  privacy_status text not null default 'private' check (privacy_status in ('private','unlisted','public')),
  status text not null default 'queued' check (status in ('queued','uploading','published','failed')),
  youtube_url text,
  thumbnail_asset_id uuid references public.assets(id) on delete set null,
  error text,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select,insert,update on public.youtube_publications to authenticated;
grant all on public.youtube_publications to service_role;
alter table public.youtube_publications enable row level security;
create policy "Users read own YouTube publications" on public.youtube_publications for select to authenticated using (auth.uid()=user_id);
create policy "Users create own YouTube publications" on public.youtube_publications for insert to authenticated with check (auth.uid()=user_id and public.owns_project(project_id));
create index if not exists youtube_publications_project_idx on public.youtube_publications(project_id, created_at desc);

create table if not exists public.youtube_analytics_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  youtube_video_id text,
  channel_id text,
  day date not null,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  estimated_minutes_watched numeric,
  average_view_duration_seconds numeric,
  subscribers_gained bigint not null default 0,
  subscribers_lost bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, youtube_video_id, day)
);
grant select on public.youtube_analytics_daily to authenticated;
grant all on public.youtube_analytics_daily to service_role;
alter table public.youtube_analytics_daily enable row level security;
create policy "Users read own YouTube analytics" on public.youtube_analytics_daily for select to authenticated using (auth.uid()=user_id);
create index if not exists youtube_analytics_daily_user_day_idx on public.youtube_analytics_daily(user_id, day desc);
