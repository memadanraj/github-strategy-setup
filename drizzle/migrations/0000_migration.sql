create type public.app_role as enum ('admin','moderator','user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "Users read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);
create policy "Admins manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text,
  price_monthly_cents integer not null default 0,
  monthly_credits integer not null default 0,
  max_projects integer,
  max_storage_gb integer,
  max_video_minutes integer,
  max_resolution text not null default '720p',
  youtube_channels integer not null default 0,
  render_priority integer not null default 0,
  features jsonb not null default '[]'::jsonb,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.plans to anon, authenticated;
grant all on public.plans to service_role;
alter table public.plans enable row level security;
create policy "Active plans are public" on public.plans for select to anon, authenticated using (is_active);
create policy "Admins manage plans" on public.plans for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

insert into public.plans (slug,name,tagline,price_monthly_cents,monthly_credits,max_projects,max_storage_gb,max_video_minutes,max_resolution,youtube_channels,render_priority,features,is_featured,sort_order) values
('free','Free','Try the studio',0,100,3,2,2,'720p',0,0,'["AI titles & scripts","Basic voices","Watermarked renders"]',false,1),
('starter','Starter','For new channels',1900,1000,20,25,10,'1080p',1,1,'["Everything in Free","No watermark","Stock media library","1 YouTube channel"]',false,2),
('creator','Creator','For weekly uploaders',4900,3500,100,100,30,'1080p',3,2,'["Everything in Starter","AI video generation","Thumbnail studio","Priority rendering"]',true,3),
('pro','Pro','For full-time creators',9900,8000,null,500,60,'4K',5,3,'["Everything in Creator","Voice cloning","Character consistency","4K exports"]',false,4),
('agency','Agency','For teams & studios',24900,25000,null,2000,120,'4K',25,4,'["Everything in Pro","Team workspaces","Bulk generation","API access"]',false,5);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  plan_slug text not null default 'free',
  credits_balance integer not null default 100,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Users read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- prevent users from editing plan/credits directly
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'authenticated' and not public.has_role(auth.uid(),'admin') then
    new.plan_slug := old.plan_slug;
    new.credits_balance := old.credits_balance;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_protect before update on public.profiles for each row execute function public.protect_profile_fields();

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  kind text not null,
  description text,
  created_at timestamptz not null default now()
);
grant select on public.credit_transactions to authenticated;
grant all on public.credit_transactions to service_role;
alter table public.credit_transactions enable row level security;
create policy "Users read own credit txns" on public.credit_transactions for select to authenticated using (auth.uid() = user_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled project',
  idea text,
  format text not null default 'long',
  mode text not null default 'simple',
  status text not null default 'draft',
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;
create policy "Users manage own projects" on public.projects for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.raw_user_meta_data->>'avatar_url');
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  insert into public.credit_transactions (user_id, amount, kind, description) values (new.id, 100, 'grant', 'Welcome credits');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();