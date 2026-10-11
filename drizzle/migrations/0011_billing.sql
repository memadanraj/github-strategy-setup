-- Phase 13: Stripe billing, subscriptions and credit packs

alter table public.plans add column if not exists stripe_price_id text;

create table if not exists public.credit_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  credits integer not null check (credits > 0),
  price_cents integer not null check (price_cents > 0),
  stripe_price_id text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.credit_packs add column if not exists stripe_price_id text;
grant select on public.credit_packs to anon, authenticated;
grant all on public.credit_packs to service_role;
alter table public.credit_packs enable row level security;
drop policy if exists "Active credit packs are public" on public.credit_packs;
create policy "Active credit packs are public" on public.credit_packs for select to anon, authenticated using (is_active);

insert into public.credit_packs (slug,name,credits,price_cents,sort_order) values
('credits-500','500 credits',500,500,1),
('credits-1500','1,500 credits',1500,1200,2),
('credits-5000','5,000 credits',5000,3500,3)
on conflict(slug) do nothing;

create table if not exists public.stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.stripe_customers to authenticated;
grant all on public.stripe_customers to service_role;
alter table public.stripe_customers enable row level security;
drop policy if exists "Users read own Stripe customer" on public.stripe_customers;
create policy "Users read own Stripe customer" on public.stripe_customers for select to authenticated using (auth.uid()=user_id);

create table if not exists public.stripe_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  plan_slug text not null references public.plans(slug),
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.stripe_subscriptions to authenticated;
grant all on public.stripe_subscriptions to service_role;
alter table public.stripe_subscriptions enable row level security;
drop policy if exists "Users read own Stripe subscriptions" on public.stripe_subscriptions;
create policy "Users read own Stripe subscriptions" on public.stripe_subscriptions for select to authenticated using (auth.uid()=user_id);
create index if not exists stripe_subscriptions_user_idx on public.stripe_subscriptions(user_id,status);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  processed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
grant all on public.billing_events to service_role;
alter table public.billing_events enable row level security;
