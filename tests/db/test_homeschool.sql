-- Run after stub.sql and the migrations 0001-0005. Any failed check raises and stops the run.
\set ON_ERROR_STOP on
insert into auth.users values ('00000000-0000-0000-0000-0000000000a3', 'parent@example.com'),
                              ('00000000-0000-0000-0000-0000000000b3', 'other@example.com'),
                              ('00000000-0000-0000-0000-0000000000c3', null);  -- a student's device (anonymous)
set role service_role;
update public.profiles set plan = 'homeschool' where id = '00000000-0000-0000-0000-0000000000a3';
do $$ declare h uuid; h2 uuid; l uuid; v int; begin
  insert into public.households (owner) values ('00000000-0000-0000-0000-0000000000a3') returning id into h;
  insert into public.households (owner) values ('00000000-0000-0000-0000-0000000000b3') returning id into h2;
  insert into public.learners (account_id, household_id, name, levels) values ('00000000-0000-0000-0000-0000000000a3', h, 'Alex', '{"Math":"Grade 6"}') returning id into l;
  -- Saving: new, then only from the version you read.
  v := public.hs_save(h, 'week', l || ':2026-10-19', '{"status":"proposed"}', 0);
  assert v = 1, 'new document';
  assert public.hs_save(h, 'week', l || ':2026-10-19', '{"status":"x"}', 0) is null, 'can''t create twice';
  v := public.hs_save(h, 'week', l || ':2026-10-19', '{"status":"approved"}', 1);
  assert v = 2, 'saved from version 1';
  assert public.hs_save(h, 'week', l || ':2026-10-19', '{"status":"stale"}', 1) is null, 'a stale copy loses';
  assert (select data->>'status' from public.hs_docs where household_id = h) = 'approved';
  -- Uploads need the parent's confirmation.
  begin
    insert into public.curriculum_uploads (household_id, title, kind, confirmed, text) values (h, 'x', 'own', false, 'y');
    assert false, 'unconfirmed upload refused';
  exception when check_violation then null;
  end;
  insert into public.curriculum_uploads (household_id, title, kind, confirmed, text) values (h, 'Our math', 'purchased', true, 'Unit 1');
  -- A device paired to the student; progress with the curriculum objective and the plan item.
  insert into public.student_devices (user_id, learner_id) values ('00000000-0000-0000-0000-0000000000c3', l);
  insert into public.progress_events (learner_id, source, kind, topic, plan_objective, plan_item) values (l, 'teachback', 'developing', 'Fractions', 'o1', 'i1');
end $$;
-- Parents read their own household only.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
do $$ begin
  assert (select count(*) from public.hs_docs) = 0, 'other families see no plans';
  assert (select count(*) from public.curriculum_uploads) = 0, 'or uploads';
  assert (select count(*) from public.households) = 1, 'only their own household';
  begin
    perform public.hs_save((select id from public.households limit 1), 'week', 'x', '{}', 0);
    assert false, 'users can''t call hs_save';
  exception when insufficient_privilege then null;
  end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  assert (select count(*) from public.hs_docs) = 1 and (select count(*) from public.curriculum_uploads) = 1, 'the parent reads theirs';
  assert (select count(*) from public.student_devices) = 1, 'and their students'' devices';
  assert (select count(*) from public.pairing_codes) = 0, 'codes are server-only';
end $$;
reset role;
-- Deleting the parent's account deletes the family: students, plans, uploads, devices.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  assert (select count(*) from public.learners where name = 'Alex') = 0, 'students';
  assert (select count(*) from public.hs_docs) = 0 and (select count(*) from public.curriculum_uploads) = 0, 'plans and uploads';
  assert (select count(*) from public.student_devices) = 0, 'devices';
end $$;
select 'homeschool tests passed';
