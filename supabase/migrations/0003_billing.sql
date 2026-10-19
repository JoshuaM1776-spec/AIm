-- Aim Plus billing (Stripe). The stripe-webhook function keeps these current; users can read their own
-- profile (existing policy) but never change it.

alter table public.profiles
  add column stripe_customer_id text unique,
  add column plan_status text,                                  -- Stripe's subscription status
  add column plan_renews_at timestamptz,                        -- end of the paid period
  add column plan_cancel_at_period_end boolean not null default false;

-- Each Stripe event is applied once: Stripe may send one more than once.
create table public.billing_events (
  id text primary key,                                          -- Stripe's event id (evt_…)
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;  -- no policies: the server only
