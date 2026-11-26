-- The Daily Challenge (0.75): one challenge a day, the same for everyone. Aim's server drafts them;
-- an editor (AIM_DAILY_EDITORS) checks, edits and publishes each one. Only the server reads or writes
-- this table (with the service role): the AI function hands out published days to everyone.

create table public.daily_challenges (
  day date primary key,
  status text not null default 'draft' check (status in ('draft', 'published')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
alter table public.daily_challenges enable row level security;
-- No policies on purpose: nobody reads this table directly.
