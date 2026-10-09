CREATE TABLE public.paddle_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  paddle_customer_id text NOT NULL UNIQUE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.paddle_customers TO service_role;
ALTER TABLE public.paddle_customers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.paddle_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  paddle_customer_id text NOT NULL,
  paddle_subscription_id text NOT NULL UNIQUE,
  plan_slug text NOT NULL DEFAULT 'free',
  status text NOT NULL,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.paddle_subscriptions TO service_role;
ALTER TABLE public.paddle_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.paddle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paddle_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.paddle_events TO service_role;
ALTER TABLE public.paddle_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.credit_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  credits integer NOT NULL,
  price_cents integer NOT NULL,
  paddle_price_id text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.credit_packs TO service_role;
ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS paddle_price_id text;