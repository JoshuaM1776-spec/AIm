-- Run after stub.sql, 0001_init.sql, then one user inserted (the "existing account"), then
-- 0002_teachback.sql. Any failed check raises and stops the run.
\set ON_ERROR_STOP on
do $$ begin
  assert (select count(*) from public.learners where account_id = '00000000-0000-0000-0000-0000000000e1' and is_self) = 1,
    'existing accounts get their own learner';
end $$;

insert into auth.users values ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
                              ('00000000-0000-0000-0000-0000000000b1', 'b@example.com');
do $$ begin
  assert (select count(*) from public.learners where is_self) = 3, 'new accounts get a learner';
  assert (select count(*) from public.profiles) = 3, 'profiles still created';
end $$;

-- The server writes an assessment, turns and progress for user a.
set role service_role;
do $$ declare l uuid; a uuid; begin
  select id into l from public.learners where account_id = '00000000-0000-0000-0000-0000000000a1';
  insert into public.assessments (learner_id, topic, objectives) values (l, 'Photosynthesis', '["What it makes"]') returning id into a;
  insert into public.assessment_turns (assessment_id, seq, objective, student, kind, question) values (a, 1, 0, 'milo', 'question', 'What does it make?');
  insert into public.progress_events (learner_id, source, kind, topic) values (l, 'teachback', 'demonstrated', 'Photosynthesis');
  begin
    insert into public.assessment_turns (assessment_id, seq, objective, student, kind, question) values (a, 1, 0, 'milo', 'question', 'Again');
    assert false, 'duplicate seq must fail';
  exception when unique_violation then null;
  end;
  begin
    insert into public.assessments (learner_id, topic, status) values (l, 'x', 'bogus');
    assert false, 'bad status must fail';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- User a reads their own rows; user b sees none and can't write.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select count(*) from public.learners) = 1, 'a sees own learner';
  assert (select count(*) from public.assessments) = 1, 'a sees own assessment';
  assert (select count(*) from public.assessment_turns) = 1, 'a sees own turns';
  assert (select count(*) from public.progress_events) = 1, 'a sees own progress';
  update public.assessments set status = 'complete';
  assert (select status from public.assessments) = 'active', 'users cannot change assessments';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select count(*) from public.assessments) = 0, 'b sees no assessments';
  assert (select count(*) from public.assessment_turns) = 0, 'b sees no turns';
  assert (select count(*) from public.progress_events) = 0, 'b sees no progress';
  begin
    insert into public.assessments (learner_id, topic) select id, 'x' from public.learners limit 1;
    assert false, 'insert must be denied';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Deleting the account deletes everything learned.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select count(*) from public.assessments) = 0, 'assessments deleted';
  assert (select count(*) from public.assessment_turns) = 0, 'turns deleted';
  assert (select count(*) from public.progress_events) = 0, 'progress deleted';
end $$;
select 'teachback db tests passed' as result;
