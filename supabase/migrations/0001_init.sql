-- Aim Plus: accounts, plans and AI usage.
-- Users sign in with an emailed code (Supabase Auth). Each user gets a profile with a plan.
-- Only the server (service role) changes plans or records AI usage; users can read their own rows.

-- Profiles ------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

-- No insert/update/delete policies: plans are changed by the service role only (billing, later).

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- AI usage ------------------------------------------------------------------------------------

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  ok boolean,                -- null while the call is running
  created_at timestamptz not null default now()
);

create index ai_usage_user_time on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

create policy "Users read their own AI usage"
  on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);

-- Starts an AI call if the user is within their limits, atomically: two calls at once can't
-- both slip under a limit. Returns the new usage row id, or null with the limit that was hit.
-- Limits are rolling: the last 24 hours and the last minute.
create function public.ai_begin(
  p_user uuid, p_task text,
  p_day_calls integer, p_day_tokens integer, p_minute_calls integer,
  out usage_id bigint, out limited text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_calls integer;
  day_tokens bigint;
  minute_calls integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select count(*), coalesce(sum(input_tokens + output_tokens), 0),
         count(*) filter (where created_at > now() - interval '1 minute')
    into day_calls, day_tokens, minute_calls
    from public.ai_usage
   where user_id = p_user and created_at > now() - interval '24 hours';

  if minute_calls >= p_minute_calls then
    limited := 'minute';
  elsif day_calls >= p_day_calls then
    limited := 'day_calls';
  elsif day_tokens >= p_day_tokens then
    limited := 'day_tokens';
  else
    insert into public.ai_usage (user_id, task) values (p_user, p_task) returning id into usage_id;
  end if;
end;
$$;

-- Records how a call went.
create function public.ai_finish(
  p_id bigint, p_model text, p_input integer, p_output integer, p_ok boolean
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage
     set model = p_model, input_tokens = greatest(p_input, 0), output_tokens = greatest(p_output, 0), ok = p_ok
   where id = p_id;
$$;

-- Only the server may call these.
revoke all on function public.ai_begin(uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.ai_finish(bigint, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.ai_begin(uuid, text, integer, integer, integer) to service_role;
grant execute on function public.ai_finish(bigint, text, integer, integer, boolean) to service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
