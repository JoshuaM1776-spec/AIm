-- Aim Homeschool: the parent website and the student's extension (docs/PARENT_WEBSITE.md §13 MVP).
--
-- A household belongs to a parent account. Its students are learners (the table from 0002) with no
-- logins of their own: a student's extension is paired to a learner with a one-time code, as an
-- anonymous account (student_devices). Plans are documents (hs_docs): a curriculum per student, kept
-- as approved versions, and a plan per student per week, with the approved copy kept apart from
-- edits so a change never reaches the student until the parent approves it again. Uploaded
-- curricula have their own table, private to the household (docs/HOMESCHOOL.md → "Bring your own
-- curriculum"). Only the server (service role) writes any of this; parents read their household.

alter table public.profiles drop constraint profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('free', 'plus', 'homeschool'));

create table public.households (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null unique references auth.users (id) on delete cascade,
  name text not null default 'Our family',
  settings jsonb not null default '{}'::jsonb,   -- role, school days, minutes per day, gap policy, setup progress
  created_at timestamptz not null default now()
);

alter table public.learners
  add column household_id uuid references public.households (id) on delete cascade,
  add column levels jsonb not null default '{}'::jsonb,    -- subject → level, not one grade
  add column interests text not null default '';

-- Plans as documents: kind 'curriculum' (key: learner id), 'curriculum_version' (learner:version),
-- 'week' (learner:YYYY-MM-DD, the Monday), 'channels' and 'materials' (key 'all'). version counts
-- saves, so two parents editing at once can't overwrite each other unknowingly.
create table public.hs_docs (
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('curriculum', 'curriculum_version', 'week', 'channels', 'materials')),
  key text not null,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (household_id, kind, key)
);

create table public.curriculum_uploads (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('purchased', 'open', 'own')),
  confirmed boolean not null check (confirmed),          -- "I have the right to use this for my family"
  text text not null,                                     -- extracted in the parent's browser
  created_at timestamptz not null default now()
);

-- A student's extension: an anonymous account tied to one learner.
create table public.student_devices (
  user_id uuid primary key references auth.users (id) on delete cascade,
  learner_id uuid not null references public.learners (id) on delete cascade,
  paired_at timestamptz not null default now()
);
create table public.pairing_codes (
  code_hash text primary key,                             -- sha-256 of the code; the code itself isn't kept
  learner_id uuid not null references public.learners (id) on delete cascade,
  expires_at timestamptz not null
);

-- Progress: "developing" (TeachBack's partial), and which curriculum objective it's about.
alter table public.progress_events drop constraint progress_events_kind_check;
alter table public.progress_events add constraint progress_events_kind_check
  check (kind in ('viewed', 'item_completed', 'discussed', 'developing', 'demonstrated', 'needs_review'));
alter table public.progress_events add column plan_objective text, add column plan_item text;
alter table public.assessments add column plan_objective text;

alter table public.households enable row level security;
alter table public.hs_docs enable row level security;
alter table public.curriculum_uploads enable row level security;
alter table public.student_devices enable row level security;
alter table public.pairing_codes enable row level security;   -- server only

create policy "Parents read their household" on public.households for select to authenticated
  using ((select auth.uid()) = owner);
create policy "Parents read their plans" on public.hs_docs for select to authenticated
  using (household_id in (select id from public.households where owner = (select auth.uid())));
create policy "Parents read their uploads" on public.curriculum_uploads for select to authenticated
  using (household_id in (select id from public.households where owner = (select auth.uid())));
create policy "Parents read their students' devices" on public.student_devices for select to authenticated
  using (learner_id in (select l.id from public.learners l join public.households h on h.id = l.household_id where h.owner = (select auth.uid())));

-- Saving a document: only if it's still the version the editor started from (or new).
create function public.hs_save(p_household uuid, p_kind text, p_key text, p_data jsonb, p_expect int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_expect is null or p_expect = 0 then
    insert into hs_docs (household_id, kind, key, data) values (p_household, p_kind, p_key, p_data)
    on conflict (household_id, kind, key) do nothing returning version into v;
  else
    update hs_docs set data = p_data, version = version + 1, updated_at = now()
      where household_id = p_household and kind = p_kind and key = p_key and version = p_expect
      returning version into v;
  end if;
  return v; -- null: someone else saved first
end $$;
revoke all on function public.hs_save(uuid, text, text, jsonb, int) from public, anon, authenticated;
grant execute on function public.hs_save(uuid, text, text, jsonb, int) to service_role;
