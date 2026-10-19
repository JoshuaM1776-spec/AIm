-- Aim Plus sync: Targets (with their study sessions), Saved for later, settings and channel rules,
-- kept on Aim's server so every browser signed in to the account has them. Opt-in, in Settings.
-- Each item is one row; the newest change wins (rev: when the browser made it, in ms). seq orders
-- changes, so a browser asks only for what changed since it last looked.

create sequence public.sync_seq;
create table public.sync_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('target', 'saved', 'settings', 'avoid')),
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  rev bigint not null,
  data jsonb,                                                   -- null: deleted
  device text not null,                                         -- the browser that wrote it
  seq bigint not null default nextval('public.sync_seq'),
  primary key (user_id, kind, id)
);
create index sync_items_user_seq on public.sync_items (user_id, seq);
alter table public.sync_items enable row level security;
create policy "read own synced items" on public.sync_items for select using (auth.uid() = user_id);

-- One round: apply this browser's changes (each only if newer than what's stored), then return what
-- changed since `since` that this browser didn't write, at most p_limit rows, oldest first.
-- One round per account at a time, so seq always grows in the order changes are stored.
create function public.sync_apply(p_user uuid, p_device text, p_since bigint, p_items jsonb, p_limit int default 300)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; rows jsonb; n int; last_seq bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 7));
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into sync_items as s (user_id, kind, id, rev, data, device)
    values (p_user, it->>'kind', it->>'id', (it->>'rev')::bigint, nullif(it->'data', 'null'::jsonb), p_device)
    on conflict (user_id, kind, id) do update
      set rev = excluded.rev, data = excluded.data, device = excluded.device, seq = nextval('public.sync_seq')
      where s.rev < excluded.rev;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'rev', rev, 'data', data) order by seq), '[]'::jsonb),
         count(*), max(seq)
    into rows, n, last_seq
    from (select * from sync_items where user_id = p_user and seq > p_since and device <> p_device order by seq limit p_limit) c;
  if n < p_limit then  -- everything: the cursor moves past this browser's own rows too
    select coalesce(max(seq), p_since) into last_seq from sync_items where user_id = p_user;
  end if;
  return jsonb_build_object('items', rows, 'cursor', coalesce(last_seq, p_since), 'more', n >= p_limit);
end $$;
revoke all on function public.sync_apply(uuid, text, bigint, jsonb, int) from public, anon, authenticated;
grant execute on function public.sync_apply(uuid, text, bigint, jsonb, int) to service_role;
