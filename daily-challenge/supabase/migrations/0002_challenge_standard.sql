-- Daily Challenge 0002
-- * The Challenge Creation & Quality Standard: challenge types, research time, the standard's
--   scenario classifications, image directions, essential/exploratory questions, the full private
--   evaluation guide, verified sources, the eight-criterion quality assessment, and editorial
--   status. Publishing requires an Approved challenge, and approval requires the standard's bar.
-- * AI-drafted challenges (the generate Edge Function): saved as drafts pending fact verification.
-- * "Was this challenge worth your time?" feedback.
-- * Revisions any time: the one revision may be written after the challenge closes. Public
--   results only ever use first versions, so a revision never changes someone's public score.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
alter table public.challenges
  add column challenge_type text not null default 'decide' check (challenge_type in ('solve', 'investigate', 'decide', 'design', 'explain')),
  add column research_minutes smallint check (research_minutes between 10 and 600),
  add column origin text not null default 'editor' check (origin in ('editor', 'ai')),
  add column editorial_status text not null default 'needs_revision'
    check (editorial_status in ('approved', 'needs_revision', 'rejected', 'pending_verification')),
  -- { "scores": { "intrigue": 1-5, ... eight criteria }, "weaknesses": "...", "tests": [...],
  --   "recommendation": "...", "assessed_by": "ai" | "editor", "assessed_at": "..." }
  add column quality jsonb,
  add column approved_by uuid references auth.users (id) on delete set null,
  add column approved_at timestamptz;

-- The standard's scenario classifications
alter table public.challenges drop constraint challenges_scenario_kind_check;
update public.challenges set scenario_kind = 'contemporary' where scenario_kind = 'hypothetical';
alter table public.challenges add constraint challenges_scenario_kind_check
  check (scenario_kind in ('historical', 'fictionalized_historical', 'contemporary', 'fictional', 'speculative'));

-- Art direction for each card (for illustrators; not shown to users)
alter table public.challenge_cards add column direction text not null default '' check (char_length(direction) <= 600);

-- Essential: needed for a well-supported answer. Exploratory: could deepen it. Internal only.
alter table public.investigation_questions add column priority text not null default 'essential'
  check (priority in ('essential', 'exploratory'));

-- The rest of the standard's private evaluation guide.
-- approaches: [{ title, summary, strengths, weaknesses, conditions }]
-- sources:    [{ title, note, url, verified, critical }]
alter table public.challenge_reference
  add column core_knowledge text not null default '',
  add column uncertainties text not null default '',
  add column investigation_map text not null default '',
  add column critical_reasoning text not null default '',
  add column evidence_expectations text not null default '',
  add column fairness_notes text not null default '',
  add column difficulty_guide jsonb not null default '{}';

-- What kind of AI call this was, so evaluation and drafting have separate limits.
alter table public.ai_calls add column task text not null default 'evaluate' check (task in ('evaluate', 'generate'));
create index ai_calls_task on public.ai_calls (user_id, task, created_at);

create table public.challenge_feedback (
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  -- 4 Absolutely, I learned something valuable; 3 Yes, it was worth investigating;
  -- 2 Somewhat, it could have been better; 1 No, it wasn't worthwhile
  rating smallint not null check (rating between 1 and 4),
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, challenge_id)
);
alter table public.challenge_feedback enable row level security;
create policy "own feedback" on public.challenge_feedback for select using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.challenge_feedback from anon, authenticated;
revoke all on public.challenge_feedback from anon;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------
create or replace function public._quality_keys() returns text[]
language sql immutable as $$
  select array['intrigue', 'responsibility', 'research_depth', 'integration', 'reasoning', 'researchability', 'clarity', 'articulation']
$$;

-- The standard's publication bar: every criterion at least 4 of 5, and at least 35 of 40 overall.
create or replace function public._quality_problem(q jsonb) returns text
language plpgsql immutable as $$
declare k text; v integer; total integer := 0;
begin
  if q is null or jsonb_typeof(q -> 'scores') <> 'object' then return 'Score the challenge on all eight quality criteria first.'; end if;
  foreach k in array public._quality_keys() loop
    if jsonb_typeof(q -> 'scores' -> k) <> 'number' then return 'Score the challenge on all eight quality criteria first.'; end if;
    v := (q -> 'scores' ->> k)::integer;
    if v not between 1 and 5 then return 'Quality scores run from 1 to 5.'; end if;
    if v < 4 then return format('Every quality criterion needs at least 4 of 5 (%s is %s).', replace(k, '_', ' '), v); end if;
    total := total + v;
  end loop;
  if total < 35 then return format('The quality total needs at least 35 of 40 (it is %s).', total); end if;
  return null;
end $$;

create or replace function public._feedback_summary(cid uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object('count', count(*),
    'ratings', jsonb_build_object('4', count(*) filter (where rating = 4), '3', count(*) filter (where rating = 3),
                                  '2', count(*) filter (where rating = 2), '1', count(*) filter (where rating = 1)))
    from public.challenge_feedback where challenge_id = cid
$$;

-- ---------------------------------------------------------------------------------------------
-- Public challenge content gains its type and research time
-- ---------------------------------------------------------------------------------------------
create or replace function public._challenge_json(cid uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', c.id, 'number', c.number, 'slug', c.slug, 'title', c.title, 'summary', c.summary,
    'subjects', to_jsonb(c.subjects), 'scenario_kind', c.scenario_kind, 'scenario_note', c.scenario_note,
    'challenge_type', c.challenge_type, 'research_minutes', c.research_minutes,
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

-- An attempt now includes the person's answer to "Was this challenge worth your time?"
create or replace function public._attempt_json(aid uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', a.id, 'challenge_id', a.challenge_id, 'difficulty', a.difficulty,
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
               from public.community_responses r where r.submission_id in (select id from public.submissions where attempt_id = a.id)),
    'feedback', (select jsonb_build_object('rating', f.rating, 'comment', f.comment)
                   from public.challenge_feedback f where f.user_id = a.user_id and f.challenge_id = a.challenge_id)
  )
  from public.attempts a where a.id = aid
$$;

-- ---------------------------------------------------------------------------------------------
-- Revisions any time. The first response must be written while the challenge is open; the one
-- revision can come later. Results, averages and progress use first versions only.
-- ---------------------------------------------------------------------------------------------
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
  if p_kind = 'initial' then
    perform public._require_open(a.challenge_id);
  elsif not exists (select 1 from public.submissions where attempt_id = a.id and kind = 'initial') then
    perform public._fail('revision_not_ready', 'You can revise once your first evaluation is ready.');
  end if;
  insert into public.drafts (attempt_id, kind, user_id, body, updated_at) values (a.id, p_kind, a.user_id, b, now())
  on conflict (attempt_id, kind) do update set body = excluded.body, updated_at = excluded.updated_at
  returning updated_at into t;
  update public.attempts set updated_at = now() where id = a.id;
  return jsonb_build_object('updated_at', t, 'word_count', public._word_count(b));
end $$;

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
  if p_kind = 'initial' then
    perform public._require_open(a.challenge_id);
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
-- "Was this challenge worth your time?" Asked after submitting; can be changed later.
-- ---------------------------------------------------------------------------------------------
create or replace function public.rate_challenge(p_number integer, p_rating integer, p_comment text default '')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := public._uid(); cid uuid := public._challenge_by_number(p_number); c text := btrim(public._clean_text(p_comment));
begin
  if not exists (select 1 from public.submissions where user_id = u and challenge_id = cid) then
    perform public._fail('submit_first', 'Submit your response first.');
  end if;
  if p_rating not between 1 and 4 then perform public._fail('invalid_rating'); end if;
  if char_length(c) > 500 then perform public._fail('too_long', 'Keep the comment under 500 characters.'); end if;
  insert into public.challenge_feedback (user_id, challenge_id, rating, comment) values (u, cid, p_rating, c)
  on conflict (user_id, challenge_id) do update set rating = excluded.rating, comment = excluded.comment, updated_at = now();
  return jsonb_build_object('rating', p_rating, 'comment', c);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Evaluation: the evaluator now gets the whole private guide, and evaluation has its own limit.
-- ---------------------------------------------------------------------------------------------
create or replace function public._reference_json(cid uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object('background', r.background, 'core_knowledge', r.core_knowledge, 'uncertainties', r.uncertainties,
           'investigation_map', r.investigation_map, 'approaches', r.approaches, 'critical_reasoning', r.critical_reasoning,
           'misconceptions', r.misconceptions, 'evidence_expectations', r.evidence_expectations,
           'difficulty_guide', r.difficulty_guide, 'fairness_notes', r.fairness_notes,
           'evaluator_notes', r.evaluator_notes, 'sources', r.sources)
    from public.challenge_reference r where r.challenge_id = cid
$$;

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
    from public.ai_calls where user_id = p_user and task = 'evaluate' and created_at > now() - interval '24 hours';
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
  insert into public.ai_calls (user_id, submission_id, task) values (p_user, s.id, 'evaluate');
  return jsonb_build_object('state', 'claimed', 'evaluation_id', e.id, 'context', jsonb_build_object(
    'challenge', public._challenge_json(s.challenge_id),
    'reference', public._reference_json(s.challenge_id) - 'sources',
    'submission', jsonb_build_object('id', s.id, 'kind', s.kind, 'body', s.body, 'word_count', s.word_count, 'difficulty', s.difficulty)
  ));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Challenge management under the standard
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_list_challenges() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  return jsonb_build_object('today', public.app_today(), 'items', coalesce((select jsonb_agg(jsonb_build_object(
    'id', c.id, 'number', c.number, 'title', c.title, 'status', c.status, 'subjects', to_jsonb(c.subjects),
    'challenge_type', c.challenge_type, 'editorial_status', c.editorial_status, 'origin', c.origin,
    'release_date', public._release_date(c.id), 'updated_at', c.updated_at,
    'submissions', (select count(*) from public.submissions s where s.challenge_id = c.id and s.kind = 'initial'),
    'open_reports', (select count(*) from public.reports rp join public.community_responses r on r.id = rp.response_id
                      where r.challenge_id = c.id and rp.status = 'open'),
    'feedback', public._feedback_summary(c.id)
  ) order by c.number) from public.challenges c), '[]'));
end $$;

create or replace function public.admin_get_challenge(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  if not exists (select 1 from public.challenges where id = p_id) then perform public._fail('challenge_not_found'); end if;
  return public._challenge_json(p_id)
    || (select jsonb_build_object('origin', c.origin, 'editorial_status', c.editorial_status, 'quality', c.quality,
          'approved_at', c.approved_at, 'quality_problem', public._quality_problem(c.quality))
        from public.challenges c where c.id = p_id)
    || jsonb_build_object(
      'reference', public._reference_json(p_id),
      'card_directions', coalesce((select jsonb_object_agg(k.kind, k.direction) from public.challenge_cards k where k.challenge_id = p_id), '{}'),
      'question_priorities', coalesce((select jsonb_agg((select coalesce(jsonb_agg(q.priority order by q.position), '[]')
                                 from public.investigation_questions q where q.area_id = a.id) order by a.position)
                               from public.investigation_areas a where a.challenge_id = p_id), '[]'),
      'feedback', public._feedback_summary(p_id),
      'feedback_comments', coalesce((select jsonb_agg(jsonb_build_object('rating', f.rating, 'comment', f.comment, 'created_at', f.created_at)
                                       order by f.updated_at desc)
                                     from public.challenge_feedback f where f.challenge_id = p_id and f.comment <> ''), '[]'));
end $$;

-- Create or update a challenge from one document. Cards, constraints and investigation areas are
-- replaced as a whole. Investigation questions may be strings or { text, priority }. Editing an
-- approved draft sends it back for review; published challenges keep their status.
create or replace function public._save_challenge(p_doc jsonb, u uuid) returns uuid
language plpgsql as $$
declare cid uuid := nullif(p_doc ->> 'id', '')::uuid; num integer;
        item jsonb; v_area uuid; i integer; ref jsonb := coalesce(p_doc -> 'reference', '{}');
        kinds text[] := array['role', 'situation', 'constraints', 'investigation', 'decision'];
        q_type text := coalesce(nullif(p_doc ->> 'challenge_type', ''), 'decide');
        minutes smallint := nullif(p_doc ->> 'research_minutes', '')::smallint;
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
                                   situation, final_task, expectations, created_by, challenge_type, research_minutes, quality)
    values (num, p_doc ->> 'slug', p_doc ->> 'title', p_doc ->> 'summary',
            array(select jsonb_array_elements_text(coalesce(p_doc -> 'subjects', '[]'))),
            coalesce(p_doc ->> 'scenario_kind', 'fictional'), coalesce(p_doc ->> 'scenario_note', ''),
            p_doc #>> '{role,title}', p_doc #>> '{role,body}', p_doc ->> 'situation', p_doc ->> 'final_task',
            p_doc -> 'expectations', u, q_type, minutes, p_doc -> 'quality')
    returning id into cid;
  else
    update public.challenges set number = num, slug = p_doc ->> 'slug', title = p_doc ->> 'title', summary = p_doc ->> 'summary',
           subjects = array(select jsonb_array_elements_text(coalesce(p_doc -> 'subjects', '[]'))),
           scenario_kind = coalesce(p_doc ->> 'scenario_kind', 'fictional'), scenario_note = coalesce(p_doc ->> 'scenario_note', ''),
           role_title = p_doc #>> '{role,title}', role_body = p_doc #>> '{role,body}', situation = p_doc ->> 'situation',
           final_task = p_doc ->> 'final_task', expectations = p_doc -> 'expectations',
           challenge_type = q_type, research_minutes = minutes,
           quality = case when p_doc ? 'quality' then p_doc -> 'quality' else quality end,
           editorial_status = case when status = 'draft' and editorial_status = 'approved' then 'needs_revision' else editorial_status end,
           approved_at = case when status = 'draft' and editorial_status = 'approved' then null else approved_at end,
           updated_at = now()
     where id = cid;
    if not found then perform public._fail('challenge_not_found'); end if;
  end if;
  delete from public.challenge_cards where challenge_id = cid;
  for i in 1..5 loop
    insert into public.challenge_cards (challenge_id, position, kind, image, direction)
    values (cid, i, kinds[i],
            (select c -> 'image' from jsonb_array_elements(coalesce(p_doc -> 'cards', '[]')) c where c ->> 'kind' = kinds[i] limit 1),
            left(coalesce(p_doc -> 'card_directions' ->> kinds[i],
                          (select c ->> 'direction' from jsonb_array_elements(coalesce(p_doc -> 'cards', '[]')) c where c ->> 'kind' = kinds[i] limit 1),
                          ''), 600));
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
    insert into public.investigation_questions (area_id, position, text, priority)
    select v_area, q.ord,
           case when jsonb_typeof(q.val) = 'string' then q.val #>> '{}' else q.val ->> 'text' end,
           case when jsonb_typeof(q.val) = 'object' and q.val ->> 'priority' = 'exploratory' then 'exploratory' else 'essential' end
      from jsonb_array_elements(item -> 'questions') with ordinality q(val, ord);
  end loop;
  insert into public.challenge_reference (challenge_id, background, approaches, misconceptions, evaluator_notes, sources,
      core_knowledge, uncertainties, investigation_map, critical_reasoning, evidence_expectations, fairness_notes, difficulty_guide)
  values (cid, coalesce(ref ->> 'background', ''), coalesce(ref -> 'approaches', '[]'), coalesce(ref -> 'misconceptions', '[]'),
          coalesce(ref ->> 'evaluator_notes', ''), coalesce(ref -> 'sources', '[]'),
          coalesce(ref ->> 'core_knowledge', ''), coalesce(ref ->> 'uncertainties', ''), coalesce(ref ->> 'investigation_map', ''),
          coalesce(ref ->> 'critical_reasoning', ''), coalesce(ref ->> 'evidence_expectations', ''), coalesce(ref ->> 'fairness_notes', ''),
          coalesce(ref -> 'difficulty_guide', '{}'))
  on conflict (challenge_id) do update set background = excluded.background, approaches = excluded.approaches,
     misconceptions = excluded.misconceptions, evaluator_notes = excluded.evaluator_notes, sources = excluded.sources,
     core_knowledge = excluded.core_knowledge, uncertainties = excluded.uncertainties, investigation_map = excluded.investigation_map,
     critical_reasoning = excluded.critical_reasoning, evidence_expectations = excluded.evidence_expectations,
     fairness_notes = excluded.fairness_notes, difficulty_guide = excluded.difficulty_guide;
  return cid;
end $$;

-- Editorial status, set by an admin. Approval applies the standard's bar: reference material,
-- quality scores of at least 4 on every criterion and 35 overall, and no critical claim whose
-- source is unverified.
create or replace function public.admin_set_editorial(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := public._require_admin(); c public.challenges; problem text; unverified integer;
begin
  if p_status not in ('approved', 'needs_revision', 'rejected', 'pending_verification') then perform public._fail('invalid_status'); end if;
  select * into c from public.challenges where id = p_id for update;
  if c.id is null then perform public._fail('challenge_not_found'); end if;
  if p_status = 'approved' then
    if not exists (select 1 from public.challenge_reference where challenge_id = p_id and btrim(background) <> '') then
      perform public._fail('needs_reference', 'Add the factual reference guide for the evaluator before approving.');
    end if;
    select count(*) into unverified from public.challenge_reference r, jsonb_array_elements(r.sources) s
     where r.challenge_id = p_id and coalesce((s ->> 'critical')::boolean, false) and not coalesce((s ->> 'verified')::boolean, false);
    if unverified > 0 then
      perform public._fail('unverified', format('%s critical source%s still unverified. Verify them, or the challenge stays Pending fact verification.',
                                                unverified, case when unverified = 1 then ' is' else 's are' end));
    end if;
    problem := public._quality_problem(c.quality);
    if problem is not null then perform public._fail('quality_bar', problem); end if;
  end if;
  if p_status <> 'approved' and c.status = 'published' then
    perform public._fail('published', 'Unpublish the challenge before changing its editorial status.');
  end if;
  update public.challenges set editorial_status = p_status,
         approved_by = case when p_status = 'approved' then u end, approved_at = case when p_status = 'approved' then now() end,
         updated_at = now()
   where id = p_id;
  return public.admin_get_challenge(p_id);
end $$;

-- Publishing needs an Approved challenge and a release date.
create or replace function public.admin_set_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  if p_status not in ('draft', 'published', 'archived') then perform public._fail('invalid_status'); end if;
  if p_status = 'published' then
    if (select editorial_status from public.challenges where id = p_id) is distinct from 'approved' then
      perform public._fail('not_approved', 'Only an Approved challenge can be published.');
    end if;
    if public._release_date(p_id) is null then
      perform public._fail('needs_date', 'Choose a release date before publishing.');
    end if;
  end if;
  update public.challenges set status = p_status, updated_at = now() where id = p_id;
  if not found then perform public._fail('challenge_not_found'); end if;
  return public.admin_get_challenge(p_id);
end $$;

-- ---------------------------------------------------------------------------------------------
-- AI drafting (service_role only: the generate Edge Function)
-- ---------------------------------------------------------------------------------------------

-- Who may draft, and whether they're within today's limit. Records the call against the limit.
--   { state: 'forbidden' } | { state: 'rate_limited', retry_after } | { state: 'claimed', call_id, recent }
create or replace function public.gen_claim(p_user uuid, p_per_day integer default 10) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer; oldest timestamptz; call_id bigint;
begin
  if not coalesce((select is_admin from public.profiles where id = p_user), false) then
    return jsonb_build_object('state', 'forbidden');
  end if;
  select count(*), min(created_at) into n, oldest from public.ai_calls
   where user_id = p_user and task = 'generate' and created_at > now() - interval '24 hours';
  if n >= p_per_day then
    return jsonb_build_object('state', 'rate_limited',
      'retry_after', greatest(60, extract(epoch from (oldest + interval '24 hours' - now()))::integer));
  end if;
  insert into public.ai_calls (user_id, task) values (p_user, 'generate') returning id into call_id;
  -- the latest challenges, so a new draft can be different from them
  return jsonb_build_object('state', 'claimed', 'call_id', call_id, 'recent', coalesce((select jsonb_agg(x.j) from (
    select jsonb_build_object('title', c.title, 'type', c.challenge_type, 'subjects', to_jsonb(c.subjects),
             'setting', c.scenario_kind, 'note', c.scenario_note, 'role', c.role_title) as j
      from public.challenges c where c.status <> 'archived' and c.editorial_status <> 'rejected'
     order by c.number desc limit 20) x), '[]'));
end $$;

-- Saves an AI draft: always a draft, always Pending fact verification, for a person to review.
create or replace function public.gen_save_draft(p_user uuid, p_call bigint, p_doc jsonb, p_provider text, p_model text,
  p_input_tokens integer default null, p_output_tokens integer default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; base text; num integer := (select coalesce(max(number), 0) + 1 from public.challenges);
begin
  base := coalesce(nullif(regexp_replace(regexp_replace(lower(coalesce(p_doc ->> 'title', 'draft')), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'), ''), 'draft');
  cid := public._save_challenge(p_doc - 'id' - 'number' || jsonb_build_object('number', num,
           'slug', case when exists (select 1 from public.challenges where slug = base) then base || '-' || num else base end), p_user);
  update public.challenges set origin = 'ai', editorial_status = 'pending_verification', status = 'draft' where id = cid;
  update public.ai_calls set ok = true, provider = p_provider, model = p_model, input_tokens = p_input_tokens, output_tokens = p_output_tokens
   where id = p_call;
  return jsonb_build_object('id', cid, 'number', num);
end $$;

create or replace function public.gen_fail(p_call bigint, p_code text, p_provider text default null, p_model text default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.ai_calls set ok = false, error_code = left(p_code, 60), provider = p_provider, model = p_model where id = p_call
$$;

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
  public.my_progress(), public.my_library(), public.rate_challenge(integer, integer, text),
  public.admin_list_challenges(), public.admin_get_challenge(uuid), public.admin_save_challenge(jsonb),
  public.admin_set_status(uuid, text), public.admin_set_editorial(uuid, text), public.admin_schedule(uuid, date),
  public.admin_list_responses(uuid), public.admin_update_response(uuid, text, integer, boolean, boolean)
  to authenticated;
grant execute on function public.eval_claim(uuid, uuid, integer, integer),
  public.eval_complete(uuid, jsonb, jsonb, text, text, integer, integer),
  public.eval_fail(uuid, text, text, text),
  public.gen_claim(uuid, integer), public.gen_save_draft(uuid, bigint, jsonb, text, text, integer, integer),
  public.gen_fail(bigint, text, text, text) to service_role;
