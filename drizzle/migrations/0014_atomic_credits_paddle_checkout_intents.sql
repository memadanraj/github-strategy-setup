-- Phase 12/13: atomic credit ledger updates and server-authorized Paddle checkout intents.
-- Apply in staging using the project's managed SQL migration process; see INTEGRATION_SETUP.md.

alter table public.credit_transactions
  add column if not exists idempotency_key text;

-- Recoverable webhook processing: rows exist before fulfillment starts, and failed
-- events remain auditable and can be claimed again when Paddle retries delivery.
alter table public.paddle_events
  add column if not exists processing_status text not null default 'processed';
alter table public.paddle_events
  add column if not exists processing_started_at timestamptz;
alter table public.paddle_events
  add column if not exists last_error text;
create index if not exists paddle_events_processing_idx
  on public.paddle_events(processing_status, processing_started_at);

create unique index if not exists credit_transactions_idempotency_key_uq
  on public.credit_transactions(idempotency_key)
  where idempotency_key is not null;

create table if not exists public.paddle_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_kind text not null check (item_kind in ('subscription', 'credit_pack')),
  item_slug text not null,
  paddle_price_id text not null,
  fulfilled_transaction_id text unique,
  fulfilled_subscription_id text unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  updated_at timestamptz not null default now()
);
create index if not exists paddle_checkout_intents_user_created_idx
  on public.paddle_checkout_intents(user_id, created_at desc);
create index if not exists paddle_checkout_intents_expiry_idx
  on public.paddle_checkout_intents(expires_at);
alter table public.paddle_checkout_intents enable row level security;
grant all on public.paddle_checkout_intents to service_role;
revoke all on public.paddle_checkout_intents from anon, authenticated;

-- One atomic operation for credits, used by webhook fulfillment and admin adjustments.
-- Profile row locking prevents concurrent grants/adjustments from overwriting one another.
-- A unique idempotency key prevents payment-provider retries from double-crediting.
create or replace function public.apply_credit_transaction(
  _user_id uuid,
  _amount integer,
  _kind text,
  _description text,
  _idempotency_key text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _current_balance integer;
  _next_balance integer;
  _applied_amount integer;
  _transaction_id uuid;
begin
  if _user_id is null then raise exception 'User is required'; end if;
  if _amount = 0 then raise exception 'Credit transaction amount cannot be zero'; end if;
  if _amount < -1000000 or _amount > 1000000 then raise exception 'Credit amount is out of range'; end if;
  if _kind is null or btrim(_kind) = '' then raise exception 'Credit transaction kind is required'; end if;
  if _idempotency_key is not null and length(_idempotency_key) > 200 then
    raise exception 'Idempotency key is too long';
  end if;

  select credits_balance into _current_balance
  from public.profiles
  where id = _user_id
  for update;

  if _current_balance is null then raise exception 'Profile not found'; end if;

  _next_balance := greatest(0, _current_balance + _amount);
  _applied_amount := _next_balance - _current_balance;

  if _idempotency_key is not null and btrim(_idempotency_key) <> '' then
    insert into public.credit_transactions(user_id, amount, kind, description, idempotency_key)
    values (_user_id, _applied_amount, _kind, left(_description, 500), _idempotency_key)
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into _transaction_id;

    if _transaction_id is null then
      return _current_balance;
    end if;
  else
    insert into public.credit_transactions(user_id, amount, kind, description)
    values (_user_id, _applied_amount, _kind, left(_description, 500))
    returning id into _transaction_id;
  end if;

  if _applied_amount <> 0 then
    perform set_config('app.credit_ledger', 'on', true);
    update public.profiles
    set credits_balance = _next_balance, updated_at = now()
    where id = _user_id;
    perform set_config('app.credit_ledger', 'off', true);
  end if;

  return _next_balance;
end $$;

revoke all on function public.apply_credit_transaction(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_credit_transaction(uuid, integer, text, text, text) to service_role;
