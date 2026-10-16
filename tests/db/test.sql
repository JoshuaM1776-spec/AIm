-- Run after stub.sql and the migration. Any failed check raises and stops the run.
\set ON_ERROR_STOP on
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
                              ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

do $$ begin
  -- Sign-up creates a free profile.
  assert (select count(*) from public.profiles) = 2, 'profiles created';
  assert (select plan from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'free', 'default plan free';
end $$;

-- Limits: 3 calls/day, 1000 tokens/day, 2/minute.
set role service_role;
do $$ declare r record; begin
  select * into r from public.ai_begin('00000000-0000-0000-0000-00000000000a', 'check', 3, 1000, 2);
  assert r.usage_id is not null and r.limited is null, 'first call allowed';
  perform public.ai_finish(r.usage_id, 'm', 300, 200, true);
  select * into r from public.ai_begin('00000000-0000-0000-0000-00000000000a', 'check', 3, 1000, 2);
  assert r.usage_id is not null, 'second call allowed';
  select * into r from public.ai_begin('00000000-0000-0000-0000-00000000000a', 'check', 3, 1000, 2);
  assert r.usage_id is null and r.limited = 'minute', 'burst limit';
  -- Other users are unaffected.
  select * into r from public.ai_begin('00000000-0000-0000-0000-00000000000b', 'check', 3, 1000, 2);
  assert r.usage_id is not null, 'other user allowed';
end $$;
-- Age a's calls past the minute window and check the token and call limits.
update public.ai_usage set created_at = now() - interval '5 minutes';
do $$ declare r record; begin
  select * into r from public.ai_begin('00000000-0000-0000-0000-00000000000a', 'check', 3, 500, 2);
  assert r.usage_id is null and r.limited = 'day_tokens', 'token limit';
  select * into r from public.ai_begin('00000000-0000-0000-0000-00000000000a', 'check', 2, 1000, 2);
  assert r.usage_id is null and r.limited = 'day_calls', 'call limit';
end $$;
-- Old calls stop counting after 24 hours.
update public.ai_usage set created_at = now() - interval '25 hours';
do $$ declare r record; begin
  select * into r from public.ai_begin('00000000-0000-0000-0000-00000000000a', 'check', 2, 500, 2);
  assert r.usage_id is not null, 'rolling window resets';
end $$;
reset role;

-- A signed-in user sees only their own rows and can't change their plan or call the server functions.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.profiles) = 1, 'own profile only';
  assert (select count(*) from public.ai_usage where user_id <> '00000000-0000-0000-0000-00000000000a') = 0, 'own usage only';
  assert (select count(*) from public.ai_usage) > 0, 'sees own usage';
  update public.profiles set plan = 'plus';
  assert (select plan from public.profiles) = 'free', 'cannot upgrade self';
  begin
    perform public.ai_begin('00000000-0000-0000-0000-00000000000a', 'check', 999, 999999, 999);
    assert false, 'ai_begin must be denied';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ai_usage (user_id, task) values ('00000000-0000-0000-0000-00000000000a', 'x');
    assert false, 'insert must be denied';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role anon;
reset request.jwt.claim.sub;
do $$ begin
  assert (select count(*) from public.profiles) = 0, 'anon sees nothing';
end $$;
reset role;

-- Deleting an account deletes its data.
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.ai_usage where user_id = '00000000-0000-0000-0000-00000000000a') = 0, 'usage deleted';
  assert (select count(*) from public.profiles) = 1, 'profile deleted';
end $$;
select 'db tests passed' as result;
