-- The Weekly Challenge (0.76): one story a week, the same for everyone. Aim drafts it; an editor
-- (AIM_DAILY_EDITORS) checks, playtests and publishes it. Only the server reads or writes this table
-- (service role); the AI function hands out the published week to everyone.

create table if not exists public.weekly_challenges (
  week date primary key,                 -- the Monday it starts
  status text not null default 'draft' check (status in ('draft', 'published')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
alter table public.weekly_challenges enable row level security;
-- No policies on purpose: nobody reads this table directly.

-- Each week's picture, readable by anyone with its link; only the server uploads (service role).
insert into storage.buckets (id, name, public) values ('weekly', 'weekly', true) on conflict (id) do nothing;
