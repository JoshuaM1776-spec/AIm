-- Aim Plus: learners, TeachBack assessments and progress evidence.
-- Everything here is written only by the server (service role). Signed-in users can read their own rows.

-- Learners ------------------------------------------------------------------------------------
-- Who is learning. Each account has one learner, themselves. A future homeschool plan can add
-- child learners under a parent's account without changing any learning data.

create table public.learners (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  name text,
  is_self boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index learners_one_self on public.learners (account_id) where is_self;

alter table public.learners enable row level security;

create policy "Users read their own learners"
  on public.learners for select to authenticated
  using ((select auth.uid()) = account_id);

-- Existing accounts get their own learner; new accounts get one when they sign up.
insert into public.learners (account_id, is_self)
  select id, true from auth.users
  on conflict (account_id) where is_self do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.learners (account_id, is_self) values (new.id, true)
    on conflict (account_id) where is_self do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- TeachBack assessments --------------------------------------------------------------------------

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners (id) on delete cascade,
  kind text not null default 'teachback',
  topic text not null,
  notes text,
  content_type text,
  objectives jsonb not null default '[]',   -- ["objective text", ...]
  status text not null default 'active' check (status in ('active', 'complete', 'incomplete')),
  result jsonb,                             -- written once, when the session finishes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index assessments_learner_time on public.assessments (learner_id, created_at desc);

-- One row per question. The answer, any hints and the evaluation are recorded on it, so results
-- can always be traced back to what the learner actually wrote.
create table public.assessment_turns (
  id bigint generated always as identity primary key,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  seq integer not null,
  objective integer not null,               -- index into assessments.objectives
  student text not null,
  kind text not null,
  question text not null,
  status text not null default 'asked' check (status in ('asked', 'answered', 'skipped')),
  answer text,
  hints integer not null default 0,
  evaluation jsonb,
  created_at timestamptz not null default now(),
  unique (assessment_id, seq)
);

-- Progress evidence -------------------------------------------------------------------------------
-- What a learner has shown, and where the evidence came from. TeachBack writes source 'teachback';
-- the instructor, parents and projects will add their own sources, kept apart from it.

create table public.progress_events (
  id bigint generated always as identity primary key,
  learner_id uuid not null references public.learners (id) on delete cascade,
  source text not null check (source in ('teachback', 'instructor', 'parent', 'project')),
  kind text not null check (kind in ('viewed', 'item_completed', 'discussed', 'demonstrated', 'needs_review')),
  topic text not null,
  objective text,
  evidence text,
  assessment_id uuid references public.assessments (id) on delete set null,
  created_at timestamptz not null default now()
);

create index progress_learner_time on public.progress_events (learner_id, created_at desc);

-- Reading your own rows ---------------------------------------------------------------------------

alter table public.assessments enable row level security;
alter table public.assessment_turns enable row level security;
alter table public.progress_events enable row level security;

create policy "Users read their own assessments"
  on public.assessments for select to authenticated
  using (exists (select 1 from public.learners l
                 where l.id = learner_id and l.account_id = (select auth.uid())));

create policy "Users read their own assessment turns"
  on public.assessment_turns for select to authenticated
  using (exists (select 1 from public.assessments a join public.learners l on l.id = a.learner_id
                 where a.id = assessment_id and l.account_id = (select auth.uid())));

create policy "Users read their own progress"
  on public.progress_events for select to authenticated
  using (exists (select 1 from public.learners l
                 where l.id = learner_id and l.account_id = (select auth.uid())));
