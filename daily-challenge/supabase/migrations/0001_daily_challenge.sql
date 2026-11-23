-- Daily Challenge: schema, row-level security and the database API.
--
-- How access works
-- * Every table has row-level security on. Signed-in users may SELECT their own private rows
--   (attempts, drafts, submissions, evaluations, profile) and nothing else directly.
-- * All writes, and every read that crosses users (today's challenge, community responses,
--   aggregate results), go through the SECURITY DEFINER functions below. Each one checks who is
--   calling (auth.uid()), validates input, and returns only what that caller may see.
-- * Challenge reference material (what the evaluator is told) is readable only by admins and by
--   the evaluation function (service_role). It never reaches the browser of an ordinary user.
-- * Functions named eval_* are for the evaluation Edge Function only (service_role).
-- * One global challenge at a time: only the open challenge (see _current_challenge) can be
--   started, written, submitted or revised. Earlier challenges stay readable to the people who
--   took part, and evaluations of work submitted in time can always finish.

-- ---------------------------------------------------------------------------------------------
-- Time. Everyone shares one calendar: the day changes at 00:00 UTC.
-- Tests and the local dev server may pin "today" with: set app.today = '2026-01-01'.
-- (Browsers cannot set this: PostgREST never lets a client set arbitrary settings.)
-- ---------------------------------------------------------------------------------------------
create or replace function public.app_today() returns date
language sql stable set search_path = public, pg_temp as $$
  select coalesce(nullif(current_setting('app.today', true), '')::date, (now() at time zone 'utc')::date)
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 2 and 40),
  preferred_difficulty text not null default 'moderate' check (preferred_difficulty in ('easy', 'moderate', 'hard')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 80),
  summary text not null check (char_length(summary) between 10 and 400),
  subjects text[] not null default '{}' check (cardinality(subjects) between 1 and 4),
  -- fictional: an invented scenario; historical: a documented case; hypothetical: a present-day or future "what if"
  scenario_kind text not null default 'fictional' check (scenario_kind in ('fictional', 'historical', 'hypothetical')),
  scenario_note text not null default '' check (char_length(scenario_note) <= 300),
  role_title text not null check (char_length(role_title) between 2 and 60),
  role_body text not null check (char_length(role_body) between 10 and 600),
  situation text not null check (char_length(situation) between 10 and 1200),
  final_task text not null check (char_length(final_task) between 10 and 800),
  -- what each difficulty asks of the written response: { "easy": "...", "moderate": "...", "hard": "..." }
  expectations jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expectations_shape check (
    jsonb_typeof(expectations) = 'object'
    and jsonb_typeof(expectations -> 'easy') = 'string'
    and jsonb_typeof(expectations -> 'moderate') = 'string'
    and jsonb_typeof(expectations -> 'hard') = 'string'
  )
);

-- The five story cards. Their text comes from the challenge itself; a card adds its picture.
create table public.challenge_cards (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  kind text not null check (kind in ('role', 'situation', 'constraints', 'investigation', 'decision')),
  -- { "key": "aqueduct" } for a built-in illustration, or { "src": "https://..." }, plus "alt" and optional "credit"
  image jsonb,
  primary key (challenge_id, position),
  unique (challenge_id, kind)
);

create table public.challenge_constraints (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  position smallint not null,
  label text not null check (char_length(label) between 2 and 80),
  detail text not null default '' check (char_length(detail) <= 300),
  icon text not null default 'circle' check (icon ~ '^[a-z-]{1,30}$'),
  unique (challenge_id, position)
);

create table public.investigation_areas (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  position smallint not null,
  title text not null check (char_length(title) between 2 and 60),
  unique (challenge_id, position)
);

create table public.investigation_questions (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.investigation_areas (id) on delete cascade,
  position smallint not null,
  text text not null check (char_length(text) between 5 and 300),
  unique (area_id, position)
);

-- What the evaluator knows. Never sent to ordinary users.
create table public.challenge_reference (
  challenge_id uuid primary key references public.challenges (id) on delete cascade,
  background text not null default '',          -- verified facts and context the evaluator may rely on
  approaches jsonb not null default '[]',       -- [{ "title": "...", "summary": "..." }] multiple defensible approaches
  misconceptions jsonb not null default '[]',   -- ["...", ...]
  evaluator_notes text not null default '',     -- what distinguishes strong reasoning on this problem
  sources jsonb not null default '[]'           -- [{ "title": "...", "note": "..." }] for authors and reviewers
);

-- One challenge per UTC day. A challenge stays available after its day.
create table public.challenge_schedule (
  release_date date primary key,
  challenge_id uuid not null unique references public.challenges (id) on delete cascade,
  scheduled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  difficulty text not null check (difficulty in ('easy', 'moderate', 'hard')),
  -- active: being worked on (only ever on the open challenge); submitted: sent for review;
  -- expired: the challenge closed before it was submitted (the draft is kept, read-only)
  status text not null default 'active' check (status in ('active', 'submitted', 'expired')),
  card_position smallint not null default 1 check (card_position between 1 and 5),
  briefing_done boolean not null default false,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  expired_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);
create unique index attempts_one_active on public.attempts (user_id) where status = 'active';
create index attempts_challenge on public.attempts (challenge_id, status);

create table public.drafts (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  kind text not null check (kind in ('initial', 'revision')),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 30000),
  updated_at timestamptz not null default now(),
  primary key (attempt_id, kind)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  kind text not null check (kind in ('initial', 'revision')),
  body text not null check (char_length(body) between 1 and 30000),
  word_count integer not null check (word_count >= 0),
  difficulty text not null check (difficulty in ('easy', 'moderate', 'hard')),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  unique (attempt_id, kind)  -- one first submission and at most one revision
);
create index submissions_user on public.submissions (user_id, created_at);
create index submissions_challenge on public.submissions (challenge_id, kind);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'complete', 'failed')),
  understanding smallint check (understanding between 0 and 100),
  reasoning smallint check (reasoning between 0 and 100),
  clarity smallint check (clarity between 0 and 100),
  organization smallint check (organization between 0 and 100),
  overall smallint check (overall between 0 and 100),
  -- { "did_well": [...], "consider_further": [...], "keep_growing": "...", "summary": "...", "rationales": {...} }
  feedback jsonb,
  provider text,
  model text,
  error_code text,
  tries smallint not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint complete_has_scores check (
    status <> 'complete' or (understanding is not null and reasoning is not null and clarity is not null
      and organization is not null and overall is not null and feedback is not null)
  )
);
create index evaluations_user on public.evaluations (user_id, status);

-- Every AI call, successful or not: for rate limits and cost tracking. No response text is kept here.
create table public.ai_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  submission_id uuid references public.submissions (id) on delete set null,
  created_at timestamptz not null default now(),
  ok boolean,
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  error_code text
);
create index ai_calls_user_time on public.ai_calls (user_id, created_at);

-- Responses people chose to share, plus clearly labelled sample responses.
create table public.community_responses (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  submission_id uuid unique references public.submissions (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  title text not null default '' check (char_length(title) <= 80),
  body text not null check (char_length(body) between 1 and 30000),
  is_sample boolean not null default false,
  -- curated: shown under Selected Approaches with this label ("The Conservation Plan")
  selected_label text check (selected_label is null or char_length(selected_label) between 2 and 60),
  selected_position smallint,
  hidden boolean not null default false,
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sample_or_owned check ((is_sample and user_id is null and submission_id is null)
    or (not is_sample and user_id is not null and submission_id is not null))
);
create unique index community_one_per_user on public.community_responses (challenge_id, user_id) where user_id is not null;
create index community_challenge on public.community_responses (challenge_id, hidden, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.community_responses (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('abusive', 'spam', 'personal_information', 'plagiarism', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  unique (response_id, reporter_id)
);

-- ---------------------------------------------------------------------------------------------
-- New accounts get a profile.
-- ---------------------------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Row-level security. Direct table access is read-only and limited to your own rows.
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_cards enable row level security;
alter table public.challenge_constraints enable row level security;
alter table public.investigation_areas enable row level security;
alter table public.investigation_questions enable row level security;
alter table public.challenge_reference enable row level security;
alter table public.challenge_schedule enable row level security;
alter table public.attempts enable row level security;
alter table public.drafts enable row level security;
alter table public.submissions enable row level security;
alter table public.evaluations enable row level security;
alter table public.ai_calls enable row level security;
alter table public.community_responses enable row level security;
alter table public.reports enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "own attempts" on public.attempts for select using (user_id = auth.uid());
create policy "own drafts" on public.drafts for select using (user_id = auth.uid());
create policy "own submissions" on public.submissions for select using (user_id = auth.uid());
create policy "own evaluations" on public.evaluations for select using (user_id = auth.uid());
create policy "admins read challenges" on public.challenges for select using (public.is_admin());
create policy "admins read cards" on public.challenge_cards for select using (public.is_admin());
create policy "admins read constraints" on public.challenge_constraints for select using (public.is_admin());
create policy "admins read areas" on public.investigation_areas for select using (public.is_admin());
create policy "admins read questions" on public.investigation_questions for select using (public.is_admin());
create policy "admins read reference" on public.challenge_reference for select using (public.is_admin());
create policy "admins read schedule" on public.challenge_schedule for select using (public.is_admin());
create policy "admins read reports" on public.reports for select using (public.is_admin());
-- Shared responses: visible to people who have submitted their own response to that challenge.
create policy "community after submitting" on public.community_responses for select using (
  user_id = auth.uid()
  or (not hidden and exists (select 1 from public.submissions s
       where s.user_id = auth.uid() and s.challenge_id = community_responses.challenge_id))
);
-- ai_calls: no policy, so no direct access at all.

-- Belt and braces: browsers never write tables directly.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon; -- visitors who aren't signed in use the functions only
revoke all on public.ai_calls, public.challenge_reference from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------
create or replace function public._fail(code text, detail text default null) returns void
language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = code, detail = coalesce(detail, '');
end $$;

create or replace function public._uid() returns uuid
language plpgsql stable as $$
declare u uuid := auth.uid();
begin
  if u is null then perform public._fail('auth_required', 'Sign in to do this.'); end if;
  return u;
end $$;

-- Strip control characters (keeping tabs and newlines) and normalise line endings.
create or replace function public._clean_text(t text) returns text
language sql immutable as $$
  select regexp_replace(replace(replace(coalesce(t, ''), E'\r\n', E'\n'), E'\r', E'\n'),
                        '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')
$$;

create or replace function public._word_count(t text) returns integer
language sql immutable as $$
  select coalesce(array_length(regexp_split_to_array(btrim(t), '\s+'), 1), 0) * (btrim(coalesce(t, '')) <> '')::int
$$;

-- When a challenge is released (null when unscheduled).
create or replace function public._release_date(cid uuid) returns date
language sql stable as $$ select release_date from public.challenge_schedule where challenge_id = cid $$;

-- One global challenge at a time. The open challenge is the most recent published challenge
-- released on or before today (UTC): normally the one released today. It stays open until the
-- next one is released, so a day with nothing scheduled never leaves people without a challenge.
create or replace function public._current_challenge() returns uuid
language sql stable as $$
  select s.challenge_id from public.challenge_schedule s join public.challenges c on c.id = s.challenge_id
   where c.status = 'published' and s.release_date <= public.app_today()
   order by s.release_date desc limit 1
$$;

-- When the open challenge closes: 00:00 UTC on the next scheduled release (null if none is scheduled yet).
create or replace function public._closes_at() returns timestamptz
language sql stable as $$
  select min(s.release_date)::timestamp at time zone 'utc'
    from public.challenge_schedule s join public.challenges c on c.id = s.challenge_id
   where c.status = 'published' and s.release_date > public.app_today()
$$;

create or replace function public._require_open(cid uuid) returns void
language plpgsql stable as $$
begin
  if cid is distinct from public._current_challenge() then
    perform public._fail('challenge_closed', 'This challenge has closed. Each challenge is open on its own day, until 00:00 UTC.');
  end if;
end $$;

-- The public content of a challenge, as the app shows it. Never includes reference material.
create or replace function public._challenge_json(cid uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', c.id, 'number', c.number, 'slug', c.slug, 'title', c.title, 'summary', c.summary,
    'subjects', to_jsonb(c.subjects), 'scenario_kind', c.scenario_kind, 'scenario_note', c.scenario_note,
    'role', jsonb_build_object('title', c.role_title, 'body', c.role_body),
    'situation', c.situation, 'final_task', c.final_task, 'expectations', c.expectations,
    'status', c.status, 'release_date', public._release_date(c.id),
    'is_open', c.id = public._current_challenge(),
    'closes_at', case when c.id = public._current_challenge() then public._closes_at() end,
    'cards', coalesce((select jsonb_agg(jsonb_build_object('position', k.position, 'kind', k.kind, 'image', k.image) order by k.position)
                        from public.challenge_cards k where k.challenge_id = c.id), '[]'),
    'constraints', coalesce((select jsonb_agg(jsonb_build_object('label', x.label, 'detail', x.detail, 'icon', x.icon) order by x.position)
                              from public.challenge_constraints x where x.challenge_id = c.id), '[]'),
    'investigation', coalesce((select jsonb_agg(jsonb_build_object('title', a.title,
                         'questions', coalesce((select jsonb_agg(q.text order by q.position) from public.investigation_questions q where q.area_id = a.id), '[]'))
                         order by a.position)
                       from public.investigation_areas a where a.challenge_id = c.id), '[]')
  )
  from public.challenges c where c.id = cid
$$;

create or replace function public._challenge_by_number(p_number integer) returns uuid
language plpgsql stable as $$
declare cid uuid;
begin
  select id into cid from public.challenges where number = p_number;
  -- Anyone can see the open challenge. Earlier challenges stay readable only to the people who
  -- took part in them (their work, feedback, community and results), and to admins.
  if cid is null or not (cid = public._current_challenge() or public.is_admin()
                         or exists (select 1 from public.attempts where challenge_id = cid and user_id = auth.uid())) then
    perform public._fail('challenge_not_found', 'That challenge is not available.');
  end if;
  return cid;
end $$;

-- The current user's view of one attempt: drafts, submissions and their evaluations, sharing.
create or replace function public._attempt_json(aid uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', a.id, 'challenge_id', a.challenge_id, 'difficulty', a.difficulty,
    -- unfinished work on a challenge that has closed reads as expired, whether or not it has been marked yet
    'status', case when a.status = 'active' and a.challenge_id is distinct from public._current_challenge() then 'expired' else a.status end,
    'card_position', a.card_position, 'briefing_done', a.briefing_done,
    'started_at', a.started_at, 'submitted_at', a.submitted_at, 'updated_at', a.updated_at,
    'drafts', coalesce((select jsonb_object_agg(d.kind, jsonb_build_object('body', d.body, 'updated_at', d.updated_at))
                         from public.drafts d where d.attempt_id = a.id), '{}'),
    'submissions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'body', s.body, 'word_count', s.word_count, 'difficulty', s.difficulty,
        'created_at', s.created_at,
        'evaluation', (select jsonb_build_object('id', e.id, 'status', e.status, 'understanding', e.understanding,
                         'reasoning', e.reasoning, 'clarity', e.clarity, 'organization', e.organization,
                         'overall', e.overall, 'feedback', e.feedback, 'provider', e.provider, 'model', e.model,
                         'error_code', e.error_code, 'completed_at', e.completed_at, 'started_at', e.started_at)
                       from public.evaluations e where e.submission_id = s.id)
      ) order by s.created_at) from public.submissions s where s.attempt_id = a.id), '[]'),
    'shared', (select jsonb_build_object('id', r.id, 'display_name', r.display_name, 'title', r.title,
                 'submission_id', r.submission_id, 'hidden', r.hidden, 'created_at', r.created_at)
               from public.community_responses r where r.submission_id in (select id from public.submissions where attempt_id = a.id))
  )
  from public.attempts a where a.id = aid
$$;

create or replace function public._own_attempt(p_attempt uuid) returns public.attempts
language plpgsql as $$
declare a public.attempts;
begin
  select * into a from public.attempts where id = p_attempt and user_id = public._uid() for update;
  if a.id is null then perform public._fail('attempt_not_found', 'That attempt was not found.'); end if;
  return a;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Reading challenges
-- ---------------------------------------------------------------------------------------------

-- Today's challenge: the one open challenge, the same for everyone.
create or replace function public.get_today() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare cid uuid := public._current_challenge();
begin
  return jsonb_build_object(
    'today', public.app_today(),
    'challenge', case when cid is null then null else public._challenge_json(cid) end,
    'closes_at', public._closes_at(),
    'is_new_today', public._release_date(cid) = public.app_today()
  );
end $$;

create or replace function public.get_challenge(p_number integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return public._challenge_json(public._challenge_by_number(p_number));
end $$;

-- ---------------------------------------------------------------------------------------------
-- The signed-in user's state
-- ---------------------------------------------------------------------------------------------
create or replace function public.my_state() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := public._uid(); p public.profiles; cur uuid := public._current_challenge();
begin
  select * into p from public.profiles where id = u;
  if p.id is null then
    -- the profile trigger normally creates this; be forgiving for accounts made before it existed
    insert into public.profiles (id) values (u) on conflict (id) do nothing;
    select * into p from public.profiles where id = u;
  end if;
  return jsonb_build_object(
    'today', public.app_today(),
    'profile', jsonb_build_object('id', p.id, 'display_name', p.display_name,
                 'preferred_difficulty', p.preferred_difficulty, 'is_admin', p.is_admin),
    'attempts', coalesce((select jsonb_object_agg(c.number::text, jsonb_build_object(
                   'status', case when a.status = 'active' and a.challenge_id is distinct from cur then 'expired' else a.status end,
                   'has_evaluation', exists (select 1 from public.submissions s join public.evaluations e on e.submission_id = s.id
                                             where s.attempt_id = a.id and e.status = 'complete')))
                 from public.attempts a join public.challenges c on c.id = a.challenge_id where a.user_id = u), '{}')
  );
end $$;

create or replace function public.update_profile(p_display_name text default null, p_preferred_difficulty text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := public._uid(); n text := btrim(public._clean_text(p_display_name));
begin
  if p_display_name is not null and n <> '' and (char_length(n) not between 2 and 40 or n !~ '^[[:alnum:] ._''-]+$') then
    perform public._fail('invalid_display_name', 'Use 2 to 40 letters, numbers, spaces, dots, dashes or apostrophes.');
  end if;
  if p_preferred_difficulty is not null and p_preferred_difficulty not in ('easy', 'moderate', 'hard') then
    perform public._fail('invalid_difficulty');
  end if;
  update public.profiles set
    display_name = case when p_display_name is null then display_name when n = '' then null else n end,
    preferred_difficulty = coalesce(p_preferred_difficulty, preferred_difficulty),
    updated_at = now()
  where id = u;
  return public.my_state() -> 'profile';
end $$;

-- ---------------------------------------------------------------------------------------------
-- Attempts and drafts
-- ---------------------------------------------------------------------------------------------

-- Start (or resume) the current user's attempt at the open challenge. Only the open challenge can
-- be started. Unfinished work on an earlier challenge is marked expired (its draft is kept).
create or replace function public.start_attempt(p_number integer, p_difficulty text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := public._uid(); cid uuid; a public.attempts;
begin
  if p_difficulty not in ('easy', 'moderate', 'hard') then perform public._fail('invalid_difficulty'); end if;
  cid := public._challenge_by_number(p_number);
  perform public._require_open(cid);
  -- serialise this user's attempt changes
  perform 1 from public.profiles where id = u for update;
  update public.attempts set status = 'expired', expired_at = now(), updated_at = now()
   where user_id = u and status = 'active' and challenge_id <> cid;
  select * into a from public.attempts where user_id = u and challenge_id = cid for update;
  if a.id is not null then
    if a.status = 'expired' then -- only if an admin re-opened a closed challenge
      update public.attempts set status = 'active', expired_at = null, updated_at = now() where id = a.id;
    end if;
    return public._attempt_json(a.id);
  end if;
  insert into public.attempts (user_id, challenge_id, difficulty) values (u, cid, p_difficulty) returning * into a;
  return public._attempt_json(a.id);
end $$;

create or replace function public.get_attempt(p_number integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := public._uid(); cid uuid; aid uuid;
begin
  cid := public._challenge_by_number(p_number);
  select id into aid from public.attempts where user_id = u and challenge_id = cid;
  return case when aid is null then null else public._attempt_json(aid) end;
end $$;

-- Remember where the user is in the story, whether they've finished the briefing, and
-- (until they submit) their difficulty.
create or replace function public.update_attempt(p_attempt uuid, p_card_position integer default null,
  p_briefing_done boolean default null, p_difficulty text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.attempts := public._own_attempt(p_attempt);
begin
  if p_card_position is not null and p_card_position not between 1 and 5 then perform public._fail('invalid_position'); end if;
  if p_difficulty is not null then
    if p_difficulty not in ('easy', 'moderate', 'hard') then perform public._fail('invalid_difficulty'); end if;
    if a.status <> 'active' or a.challenge_id is distinct from public._current_challenge() then
      perform public._fail('difficulty_locked', 'Difficulty is fixed once you submit.');
    end if;
  end if;
  update public.attempts set
    card_position = coalesce(p_card_position, card_position),
    briefing_done = briefing_done or coalesce(p_briefing_done, false),
    difficulty = coalesce(p_difficulty, difficulty),
    updated_at = now()
  where id = a.id;
  return public._attempt_json(a.id);
end $$;

create or replace function public.save_draft(p_attempt uuid, p_kind text, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.attempts := public._own_attempt(p_attempt); b text := public._clean_text(p_body); t timestamptz;
begin
  if p_kind not in ('initial', 'revision') then perform public._fail('invalid_kind'); end if;
  if char_length(b) > 30000 then perform public._fail('too_long', 'Responses can be up to 30,000 characters.'); end if;
  if p_kind = 'initial' and exists (select 1 from public.submissions where attempt_id = a.id and kind = 'initial') then
    perform public._fail('already_submitted', 'This response has already been submitted.');
  end if;
  if p_kind = 'revision' and exists (select 1 from public.submissions where attempt_id = a.id and kind = 'revision') then
    perform public._fail('already_submitted', 'Your revision has already been submitted.');
  end if;
  perform public._require_open(a.challenge_id);
  insert into public.drafts (attempt_id, kind, user_id, body, updated_at) values (a.id, p_kind, a.user_id, b, now())
  on conflict (attempt_id, kind) do update set body = excluded.body, updated_at = excluded.updated_at
  returning updated_at into t;
  update public.attempts set updated_at = now() where id = a.id;
  return jsonb_build_object('updated_at', t, 'word_count', public._word_count(b));
end $$;

-- Submit a response for review. p_key is a client-generated idempotency key: sending the same
-- request twice (a double tap, a retry after a dropped connection) returns the same submission.
create or replace function public.submit_response(p_attempt uuid, p_kind text, p_body text, p_key uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.attempts := public._own_attempt(p_attempt); b text := btrim(public._clean_text(p_body));
        s public.submissions; wc integer; init_eval text;
begin
  select * into s from public.submissions where idempotency_key = p_key;
  if s.id is not null then
    if s.user_id <> a.user_id then perform public._fail('invalid_key'); end if;
    return public._attempt_json(a.id);
  end if;
  if p_kind not in ('initial', 'revision') then perform public._fail('invalid_kind'); end if;
  if exists (select 1 from public.submissions where attempt_id = a.id and kind = p_kind) then
    perform public._fail('already_submitted', case p_kind when 'initial' then 'This response has already been submitted.'
                                                else 'You have already submitted your one revision.' end);
  end if;
  wc := public._word_count(b);
  if wc < 40 then perform public._fail('too_short', 'Write at least 40 words so there is enough to evaluate.'); end if;
  if char_length(b) > 30000 then perform public._fail('too_long', 'Responses can be up to 30,000 characters.'); end if;
  -- the response and its one revision are both written while the challenge is open
  perform public._require_open(a.challenge_id);
  if p_kind = 'initial' then
    if a.status <> 'active' then perform public._fail('not_active'); end if;
  else
    select e.status into init_eval from public.submissions s2 join public.evaluations e on e.submission_id = s2.id
     where s2.attempt_id = a.id and s2.kind = 'initial';
    if coalesce(init_eval, '') <> 'complete' then
      perform public._fail('revision_not_ready', 'You can revise once your first evaluation is ready.');
    end if;
  end if;
  insert into public.submissions (attempt_id, user_id, challenge_id, kind, body, word_count, difficulty, idempotency_key)
  values (a.id, a.user_id, a.challenge_id, p_kind, b, wc, a.difficulty, p_key) returning * into s;
  insert into public.drafts (attempt_id, kind, user_id, body) values (a.id, p_kind, a.user_id, b)
  on conflict (attempt_id, kind) do update set body = excluded.body, updated_at = now();
  if p_kind = 'initial' then
    update public.attempts set status = 'submitted', submitted_at = now(), updated_at = now() where id = a.id;
  end if;
  return public._attempt_json(a.id);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Community
-- ---------------------------------------------------------------------------------------------
create or replace function public.publish_response(p_attempt uuid, p_display_name text, p_title text default '')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.attempts := public._own_attempt(p_attempt); s public.submissions;
        n text := btrim(public._clean_text(p_display_name)); t text := btrim(public._clean_text(p_title));
begin
  if char_length(n) not between 2 and 40 or n !~ '^[[:alnum:] ._''-]+$' then
    perform public._fail('invalid_display_name', 'Use 2 to 40 letters, numbers, spaces, dots, dashes or apostrophes.');
  end if;
  if char_length(t) > 80 then perform public._fail('invalid_title', 'Keep the title under 80 characters.'); end if;
  -- share the latest version: the revision if there is one
  select * into s from public.submissions where attempt_id = a.id order by (kind = 'revision') desc limit 1;
  if s.id is null then perform public._fail('not_submitted', 'Submit your response before sharing it.'); end if;
  insert into public.community_responses (challenge_id, submission_id, user_id, display_name, title, body)
  values (a.challenge_id, s.id, a.user_id, n, t, s.body)
  on conflict (challenge_id, user_id) where user_id is not null
  do update set submission_id = excluded.submission_id, display_name = excluded.display_name,
                title = excluded.title, body = excluded.body, updated_at = now();
  update public.profiles set display_name = coalesce(display_name, n) where id = a.user_id;
  return public._attempt_json(a.id);
end $$;

create or replace function public.unpublish_response(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.attempts := public._own_attempt(p_attempt);
begin
  delete from public.community_responses where user_id = a.user_id and challenge_id = a.challenge_id;
  return public._attempt_json(a.id);
end $$;

-- Community responses for a challenge. Open to people who have submitted their own response
-- (so nobody can read others' work before forming their own view) and to admins.
-- p_tab: 'selected' (curated, intellectually different approaches) or 'all' (newest first).
-- Scores are never included.
create or replace function public.list_community(p_number integer, p_tab text default 'selected',
  p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := public._uid(); cid uuid := public._challenge_by_number(p_number); lim integer := least(greatest(p_limit, 1), 50);
begin
  if not public.is_admin() and not exists (select 1 from public.submissions where user_id = u and challenge_id = cid) then
    perform public._fail('submit_first', 'Submit your own response to see how others approached it.');
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.community_responses r where r.challenge_id = cid and not r.hidden
               and (p_tab <> 'selected' or r.selected_label is not null)),
    'items', coalesce((select jsonb_agg(x.j) from (
      select jsonb_build_object('id', r.id, 'display_name', r.display_name, 'title', r.title, 'body', r.body,
               'is_sample', r.is_sample, 'selected_label', r.selected_label, 'is_mine', r.user_id = u,
               'created_at', r.created_at, 'word_count', public._word_count(r.body),
               'difficulty', (select s.difficulty from public.submissions s where s.id = r.submission_id),
               'reported_by_me', exists (select 1 from public.reports rp where rp.response_id = r.id and rp.reporter_id = u)) as j
        from public.community_responses r
       where r.challenge_id = cid and not r.hidden and (p_tab <> 'selected' or r.selected_label is not null)
       order by case when p_tab = 'selected' then r.selected_position end nulls last,
                case when p_tab = 'selected' then null else r.is_sample end,
                r.created_at desc
       limit lim offset greatest(p_offset, 0)) x), '[]')
  );
end $$;

-- Reporting hides a response automatically once three different people have reported it,
-- until an admin reviews it.
create or replace function public.report_response(p_response uuid, p_reason text, p_details text default '')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := public._uid(); r public.community_responses; n integer;
begin
  select * into r from public.community_responses where id = p_response for update;
  if r.id is null or not (public.is_admin() or exists (select 1 from public.submissions where user_id = u and challenge_id = r.challenge_id)) then
    perform public._fail('response_not_found');
  end if;
  if r.user_id = u then perform public._fail('own_response', 'You cannot report your own response.'); end if;
  if p_reason not in ('abusive', 'spam', 'personal_information', 'plagiarism', 'other') then perform public._fail('invalid_reason'); end if;
  insert into public.reports (response_id, reporter_id, reason, details)
  values (r.id, u, p_reason, left(btrim(public._clean_text(p_details)), 500))
  on conflict (response_id, reporter_id) do nothing;
  select count(*) into n from public.reports where response_id = r.id and status = 'open';
  update public.community_responses set report_count = n, hidden = hidden or n >= 3 where id = r.id;
  return jsonb_build_object('reported', true);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Aggregate results. Counts are real; the average and distribution appear only once at least
-- 10 people have a completed first evaluation, so a handful of people can't be singled out
-- and a tiny sample isn't presented as meaningful. Sample responses never count.
-- ---------------------------------------------------------------------------------------------
create or replace function public.challenge_stats(p_number integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); cid uuid := public._challenge_by_number(p_number); threshold integer := 10;
        n_sub integer; n_eval integer; avg_score numeric; med numeric; mine integer;
begin
  select count(distinct s.user_id) into n_sub from public.submissions s where s.challenge_id = cid and s.kind = 'initial';
  select count(*), avg(e.overall), percentile_cont(0.5) within group (order by e.overall)
    into n_eval, avg_score, med
    from public.submissions s join public.evaluations e on e.submission_id = s.id
   where s.challenge_id = cid and s.kind = 'initial' and e.status = 'complete';
  if u is not null then
    select e.overall into mine from public.submissions s join public.evaluations e on e.submission_id = s.id
     where s.challenge_id = cid and s.kind = 'initial' and s.user_id = u and e.status = 'complete';
  end if;
  return jsonb_build_object(
    'submitted', n_sub, 'evaluated', n_eval, 'threshold', threshold, 'your_score', mine,
    'average', case when n_eval >= threshold then round(avg_score) end,
    'median', case when n_eval >= threshold then round(med) end,
    'distribution', case when n_eval >= threshold then (
      select jsonb_agg(jsonb_build_object('from', b * 10, 'to', least(b * 10 + 9, 100), 'count', coalesce(cnt, 0)) order by b)
        from generate_series(0, 9) b
        left join (select least(e.overall / 10, 9) as bucket, count(*) as cnt
                     from public.submissions s join public.evaluations e on e.submission_id = s.id
                    where s.challenge_id = cid and s.kind = 'initial' and e.status = 'complete' group by 1) h on h.bucket = b
    ) end
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- Personal progress and library
-- ---------------------------------------------------------------------------------------------

-- A participation day is a UTC day on which you submitted a first response to any challenge.
-- The current streak counts back from today, or from yesterday if you haven't taken part yet today:
-- missing today doesn't reset anything until the day is over.
create or replace function public.my_progress() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := public._uid(); today date := public.app_today(); cur integer := 0; longest integer := 0;
        d date; run integer := 0; prev date; days date[];
begin
  select array_agg(distinct (s.created_at at time zone 'utc')::date order by (s.created_at at time zone 'utc')::date)
    into days from public.submissions s where s.user_id = u and s.kind = 'initial';
  days := coalesce(days, '{}');
  foreach d in array days loop
    run := case when prev is not null and d = prev + 1 then run + 1 else 1 end;
    longest := greatest(longest, run);
    prev := d;
  end loop;
  if prev is not null and prev >= today - 1 then cur := run; end if;
  return jsonb_build_object(
    'completed', (select count(*) from public.submissions where user_id = u and kind = 'initial'),
    'current_streak', cur, 'longest_streak', longest,
    'participated_today', today = any(days),
    'recent_days', (select jsonb_agg(jsonb_build_object('date', g::date, 'done', g::date = any(days)) order by g)
                      from generate_series((today - 6)::timestamp, today::timestamp, interval '1 day') g),
    'average', (select round(avg(e.overall)) from public.submissions s join public.evaluations e on e.submission_id = s.id
                 where s.user_id = u and s.kind = 'initial' and e.status = 'complete'),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('number', c.number, 'title', c.title, 'date', (s.created_at at time zone 'utc')::date,
                 'difficulty', s.difficulty, 'overall', e.overall, 'understanding', e.understanding, 'reasoning', e.reasoning,
                 'clarity', e.clarity, 'organization', e.organization) order by s.created_at)
               from public.submissions s join public.evaluations e on e.submission_id = s.id join public.challenges c on c.id = s.challenge_id
              where s.user_id = u and s.kind = 'initial' and e.status = 'complete'), '[]')
  );
end $$;

-- Everything you've submitted, plus unfinished drafts on challenges that have closed (kept, read-only).
create or replace function public.my_library() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := public._uid(); cur uuid := public._current_challenge();
begin
  return coalesce((select jsonb_agg(x.j order by x.t desc) from (
    select coalesce(a.submitted_at, a.updated_at) as t, jsonb_build_object(
      'number', c.number, 'title', c.title, 'subjects', to_jsonb(c.subjects), 'difficulty', a.difficulty,
      'submitted_at', a.submitted_at, 'unfinished', a.status <> 'submitted', 'release_date', public._release_date(c.id),
      'initial', (select jsonb_build_object('overall', e.overall, 'status', e.status) from public.submissions s
                    left join public.evaluations e on e.submission_id = s.id where s.attempt_id = a.id and s.kind = 'initial'),
      'revision', (select jsonb_build_object('overall', e.overall, 'status', e.status) from public.submissions s
                    left join public.evaluations e on e.submission_id = s.id where s.attempt_id = a.id and s.kind = 'revision'),
      'shared', exists (select 1 from public.community_responses r where r.user_id = u and r.challenge_id = a.challenge_id)
    ) as j
    from public.attempts a join public.challenges c on c.id = a.challenge_id
   where a.user_id = u and (a.status = 'submitted'
         or (a.challenge_id is distinct from cur and exists (select 1 from public.drafts d where d.attempt_id = a.id and btrim(d.body) <> '')))) x), '[]');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Evaluation (service_role only: the evaluate Edge Function)
-- ---------------------------------------------------------------------------------------------

-- Claim the right to evaluate a submission. Returns one of:
--   { state: 'complete', evaluation }         already done: no AI call needed
--   { state: 'in_progress' }                  another request is evaluating it right now
--   { state: 'rate_limited', retry_after }    too many AI calls recently
--   { state: 'claimed', evaluation_id, context } go ahead: the AI call is recorded against the limits
create or replace function public.eval_claim(p_user uuid, p_submission uuid, p_per_hour integer default 8, p_per_day integer default 24)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.submissions; e public.evaluations; n_hour integer; n_day integer; oldest timestamptz;
begin
  select * into s from public.submissions where id = p_submission for update;
  if s.id is null or s.user_id <> p_user then return jsonb_build_object('state', 'not_found'); end if;
  select * into e from public.evaluations where submission_id = s.id for update;
  if e.status = 'complete' then return jsonb_build_object('state', 'complete', 'evaluation_id', e.id); end if;
  if e.status = 'pending' and e.started_at > now() - interval '3 minutes' then
    return jsonb_build_object('state', 'in_progress', 'evaluation_id', e.id);
  end if;
  select count(*) filter (where created_at > now() - interval '1 hour'), count(*), min(created_at) filter (where created_at > now() - interval '1 hour')
    into n_hour, n_day, oldest
    from public.ai_calls where user_id = p_user and created_at > now() - interval '24 hours';
  if n_hour >= p_per_hour or n_day >= p_per_day then
    return jsonb_build_object('state', 'rate_limited',
      'retry_after', greatest(60, extract(epoch from (coalesce(oldest, now()) + interval '1 hour' - now()))::integer));
  end if;
  if e.id is null then
    insert into public.evaluations (submission_id, user_id, status, tries, started_at)
    values (s.id, s.user_id, 'pending', 1, now()) returning * into e;
  else
    update public.evaluations set status = 'pending', tries = tries + 1, started_at = now(), error_code = null
     where id = e.id returning * into e;
  end if;
  insert into public.ai_calls (user_id, submission_id) values (p_user, s.id);
  return jsonb_build_object('state', 'claimed', 'evaluation_id', e.id, 'context', jsonb_build_object(
    'challenge', public._challenge_json(s.challenge_id),
    'reference', (select jsonb_build_object('background', r.background, 'approaches', r.approaches,
                   'misconceptions', r.misconceptions, 'evaluator_notes', r.evaluator_notes)
                  from public.challenge_reference r where r.challenge_id = s.challenge_id),
    'submission', jsonb_build_object('id', s.id, 'kind', s.kind, 'body', s.body, 'word_count', s.word_count, 'difficulty', s.difficulty)
  ));
end $$;

create or replace function public.eval_complete(p_evaluation uuid, p_scores jsonb, p_feedback jsonb, p_provider text,
  p_model text, p_input_tokens integer default null, p_output_tokens integer default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.evaluations; u smallint := (p_scores ->> 'understanding')::smallint; r smallint := (p_scores ->> 'reasoning')::smallint;
        c smallint := (p_scores ->> 'clarity')::smallint; o smallint := (p_scores ->> 'organization')::smallint;
begin
  -- the overall score is always the equal-weight average of the four categories
  update public.evaluations set status = 'complete', understanding = u, reasoning = r, clarity = c, organization = o,
         overall = round((u + r + c + o) / 4.0), feedback = p_feedback, provider = p_provider, model = p_model,
         error_code = null, completed_at = now()
   where id = p_evaluation and status = 'pending' returning * into e;
  if e.id is null then return jsonb_build_object('ok', false); end if;
  update public.ai_calls set ok = true, provider = p_provider, model = p_model, input_tokens = p_input_tokens, output_tokens = p_output_tokens
   where id = (select max(id) from public.ai_calls where submission_id = e.submission_id);
  return jsonb_build_object('ok', true, 'overall', e.overall);
end $$;

create or replace function public.eval_fail(p_evaluation uuid, p_code text, p_provider text default null, p_model text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid;
begin
  update public.evaluations set status = 'failed', error_code = left(p_code, 60)
   where id = p_evaluation and status = 'pending' returning submission_id into sid;
  if sid is not null then
    update public.ai_calls set ok = false, error_code = left(p_code, 60), provider = p_provider, model = p_model
     where id = (select max(id) from public.ai_calls where submission_id = sid);
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Challenge management (admins)
-- ---------------------------------------------------------------------------------------------
create or replace function public._require_admin() returns uuid
language plpgsql stable as $$
declare u uuid := public._uid();
begin
  if not public.is_admin() then perform public._fail('forbidden', 'Only administrators can do this.'); end if;
  return u;
end $$;

create or replace function public.admin_list_challenges() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  return jsonb_build_object('today', public.app_today(), 'items', coalesce((select jsonb_agg(jsonb_build_object(
    'id', c.id, 'number', c.number, 'title', c.title, 'status', c.status, 'subjects', to_jsonb(c.subjects),
    'release_date', public._release_date(c.id), 'updated_at', c.updated_at,
    'submissions', (select count(*) from public.submissions s where s.challenge_id = c.id and s.kind = 'initial'),
    'open_reports', (select count(*) from public.reports rp join public.community_responses r on r.id = rp.response_id
                      where r.challenge_id = c.id and rp.status = 'open')
  ) order by c.number) from public.challenges c), '[]'));
end $$;

create or replace function public.admin_get_challenge(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  if not exists (select 1 from public.challenges where id = p_id) then perform public._fail('challenge_not_found'); end if;
  return public._challenge_json(p_id) || jsonb_build_object('reference', (
    select jsonb_build_object('background', r.background, 'approaches', r.approaches, 'misconceptions', r.misconceptions,
             'evaluator_notes', r.evaluator_notes, 'sources', r.sources)
      from public.challenge_reference r where r.challenge_id = p_id));
end $$;

-- Create or update a challenge from one document (the shape _challenge_json returns, plus
-- "reference"). Cards, constraints and investigation areas are replaced as a whole.
create or replace function public._save_challenge(p_doc jsonb, u uuid) returns uuid
language plpgsql as $$
declare cid uuid := nullif(p_doc ->> 'id', '')::uuid; num integer;
        item jsonb; v_area uuid; i integer; ref jsonb := coalesce(p_doc -> 'reference', '{}');
        kinds text[] := array['role', 'situation', 'constraints', 'investigation', 'decision'];
begin
  num := coalesce(nullif(p_doc ->> 'number', '')::integer, (select coalesce(max(number), 0) + 1 from public.challenges));
  if jsonb_array_length(coalesce(p_doc -> 'constraints', '[]')) not between 2 and 6 then
    perform public._fail('invalid_challenge', 'A challenge needs 2 to 6 constraints.');
  end if;
  if jsonb_array_length(coalesce(p_doc -> 'investigation', '[]')) not between 2 and 5 then
    perform public._fail('invalid_challenge', 'A challenge needs 2 to 5 areas of investigation.');
  end if;
  if cid is null then
    insert into public.challenges (number, slug, title, summary, subjects, scenario_kind, scenario_note, role_title, role_body,
                                   situation, final_task, expectations, created_by)
    values (num, p_doc ->> 'slug', p_doc ->> 'title', p_doc ->> 'summary',
            array(select jsonb_array_elements_text(coalesce(p_doc -> 'subjects', '[]'))),
            coalesce(p_doc ->> 'scenario_kind', 'fictional'), coalesce(p_doc ->> 'scenario_note', ''),
            p_doc #>> '{role,title}', p_doc #>> '{role,body}', p_doc ->> 'situation', p_doc ->> 'final_task',
            p_doc -> 'expectations', u)
    returning id into cid;
  else
    update public.challenges set number = num, slug = p_doc ->> 'slug', title = p_doc ->> 'title', summary = p_doc ->> 'summary',
           subjects = array(select jsonb_array_elements_text(coalesce(p_doc -> 'subjects', '[]'))),
           scenario_kind = coalesce(p_doc ->> 'scenario_kind', 'fictional'), scenario_note = coalesce(p_doc ->> 'scenario_note', ''),
           role_title = p_doc #>> '{role,title}', role_body = p_doc #>> '{role,body}', situation = p_doc ->> 'situation',
           final_task = p_doc ->> 'final_task', expectations = p_doc -> 'expectations', updated_at = now()
     where id = cid;
    if not found then perform public._fail('challenge_not_found'); end if;
  end if;
  delete from public.challenge_cards where challenge_id = cid;
  for i in 1..5 loop
    insert into public.challenge_cards (challenge_id, position, kind, image)
    values (cid, i, kinds[i], (select c -> 'image' from jsonb_array_elements(coalesce(p_doc -> 'cards', '[]')) c
                                where c ->> 'kind' = kinds[i] limit 1));
  end loop;
  delete from public.challenge_constraints where challenge_id = cid;
  i := 0;
  for item in select * from jsonb_array_elements(p_doc -> 'constraints') loop
    i := i + 1;
    insert into public.challenge_constraints (challenge_id, position, label, detail, icon)
    values (cid, i, item ->> 'label', coalesce(item ->> 'detail', ''), coalesce(nullif(item ->> 'icon', ''), 'circle'));
  end loop;
  delete from public.investigation_areas where challenge_id = cid;
  i := 0;
  for item in select * from jsonb_array_elements(p_doc -> 'investigation') loop
    i := i + 1;
    if jsonb_array_length(coalesce(item -> 'questions', '[]')) not between 1 and 3 then
      perform public._fail('invalid_challenge', 'Each area of investigation needs 1 to 3 questions.');
    end if;
    insert into public.investigation_areas (challenge_id, position, title) values (cid, i, item ->> 'title') returning id into v_area;
    insert into public.investigation_questions (area_id, position, text)
    select v_area, q.ord, q.val from jsonb_array_elements_text(item -> 'questions') with ordinality q(val, ord);
  end loop;
  insert into public.challenge_reference (challenge_id, background, approaches, misconceptions, evaluator_notes, sources)
  values (cid, coalesce(ref ->> 'background', ''), coalesce(ref -> 'approaches', '[]'), coalesce(ref -> 'misconceptions', '[]'),
          coalesce(ref ->> 'evaluator_notes', ''), coalesce(ref -> 'sources', '[]'))
  on conflict (challenge_id) do update set background = excluded.background, approaches = excluded.approaches,
     misconceptions = excluded.misconceptions, evaluator_notes = excluded.evaluator_notes, sources = excluded.sources;
  return cid;
end $$;

create or replace function public.admin_save_challenge(p_doc jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := public._require_admin(); cid uuid;
begin
  cid := public._save_challenge(p_doc, u);
  -- a separate statement, so the stable reader sees the rows just written
  return public.admin_get_challenge(cid);
end $$;

-- Publishing needs a release date; a published challenge appears to everyone on that UTC date.
create or replace function public.admin_set_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  if p_status not in ('draft', 'published', 'archived') then perform public._fail('invalid_status'); end if;
  if p_status = 'published' then
    if public._release_date(p_id) is null then
      perform public._fail('needs_date', 'Choose a release date before publishing.');
    end if;
    if not exists (select 1 from public.challenge_reference where challenge_id = p_id and btrim(background) <> '') then
      perform public._fail('needs_reference', 'Add reference material for the evaluator before publishing.');
    end if;
  end if;
  update public.challenges set status = p_status, updated_at = now() where id = p_id;
  if not found then perform public._fail('challenge_not_found'); end if;
  return public.admin_get_challenge(p_id);
end $$;

create or replace function public.admin_schedule(p_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := public._require_admin(); other record; cur date;
begin
  if not exists (select 1 from public.challenges where id = p_id) then perform public._fail('challenge_not_found'); end if;
  cur := public._release_date(p_id);
  if p_date is null then
    if cur is not null and cur <= public.app_today() and (select status from public.challenges where id = p_id) = 'published' then
      perform public._fail('already_released', 'A released challenge keeps its date.');
    end if;
    delete from public.challenge_schedule where challenge_id = p_id;
    update public.challenges set status = 'draft', updated_at = now() where id = p_id and status = 'published';
    return public.admin_get_challenge(p_id);
  end if;
  if cur is not null and cur <= public.app_today() and (select status from public.challenges where id = p_id) = 'published' and p_date <> cur then
    perform public._fail('already_released', 'A released challenge keeps its date.');
  end if;
  if p_date < public.app_today() and cur is distinct from p_date then
    perform public._fail('date_in_past', 'Choose today or a later date (UTC).');
  end if;
  select c.number, c.title into other from public.challenge_schedule s join public.challenges c on c.id = s.challenge_id
   where s.release_date = p_date and s.challenge_id <> p_id;
  if other.number is not null then
    perform public._fail('date_taken', format('Day %s, %s, is already scheduled for that date.', other.number, other.title));
  end if;
  insert into public.challenge_schedule (release_date, challenge_id, scheduled_by) values (p_date, p_id, u)
  on conflict (challenge_id) do update set release_date = excluded.release_date, scheduled_by = excluded.scheduled_by, created_at = now();
  return public.admin_get_challenge(p_id);
end $$;

create or replace function public.admin_list_responses(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'display_name', r.display_name, 'title', r.title,
    'body', r.body, 'is_sample', r.is_sample, 'selected_label', r.selected_label, 'selected_position', r.selected_position,
    'hidden', r.hidden, 'report_count', r.report_count, 'created_at', r.created_at,
    'reports', coalesce((select jsonb_agg(jsonb_build_object('reason', rp.reason, 'details', rp.details, 'status', rp.status, 'created_at', rp.created_at))
                          from public.reports rp where rp.response_id = r.id), '[]')
  ) order by r.report_count desc, r.created_at desc) from public.community_responses r where r.challenge_id = p_id), '[]');
end $$;

-- Curate Selected Approaches, and moderate: hide or restore a response and resolve its reports.
create or replace function public.admin_update_response(p_response uuid, p_selected_label text default null,
  p_selected_position integer default null, p_hidden boolean default null, p_clear_selection boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  update public.community_responses set
    selected_label = case when p_clear_selection then null else coalesce(nullif(btrim(p_selected_label), ''), selected_label) end,
    selected_position = case when p_clear_selection then null else coalesce(p_selected_position, selected_position) end,
    hidden = coalesce(p_hidden, hidden), updated_at = now()
  where id = p_response;
  if not found then perform public._fail('response_not_found'); end if;
  if p_hidden is not null then
    update public.reports set status = case when p_hidden then 'actioned' else 'dismissed' end
     where response_id = p_response and status = 'open';
    update public.community_responses set report_count = 0 where id = p_response and not p_hidden;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.app_today(), public.is_admin(), public.get_today(), public.get_challenge(integer),
  public.challenge_stats(integer) to anon, authenticated;
grant execute on function public.my_state(), public.update_profile(text, text),
  public.start_attempt(integer, text), public.get_attempt(integer),
  public.update_attempt(uuid, integer, boolean, text),
  public.save_draft(uuid, text, text), public.submit_response(uuid, text, text, uuid),
  public.publish_response(uuid, text, text), public.unpublish_response(uuid),
  public.list_community(integer, text, integer, integer), public.report_response(uuid, text, text),
  public.my_progress(), public.my_library(),
  public.admin_list_challenges(), public.admin_get_challenge(uuid), public.admin_save_challenge(jsonb),
  public.admin_set_status(uuid, text), public.admin_schedule(uuid, date), public.admin_list_responses(uuid),
  public.admin_update_response(uuid, text, integer, boolean, boolean)
  to authenticated;
grant execute on function public.eval_claim(uuid, uuid, integer, integer),
  public.eval_complete(uuid, jsonb, jsonb, text, text, integer, integer),
  public.eval_fail(uuid, text, text, text) to service_role;
