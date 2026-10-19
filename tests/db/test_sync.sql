-- Run after stub.sql and the migrations 0001-0004. Any failed check raises and stops the run.
\set ON_ERROR_STOP on
insert into auth.users values ('00000000-0000-0000-0000-0000000000a2', 'a@example.com'),
                              ('00000000-0000-0000-0000-0000000000b2', 'b@example.com');
set role service_role;
do $$ declare r jsonb; c bigint; begin
  -- Browser A pushes two items; A gets nothing back (it wrote them), and a cursor past them.
  r := public.sync_apply('00000000-0000-0000-0000-0000000000a2', 'devA', 0,
    '[{"kind":"target","id":"t1","rev":100,"data":{"state":"paused","record":{"text":"Fix the sink"}}},
      {"kind":"settings","id":"all","rev":100,"data":{"strict":true}}]');
  assert jsonb_array_length(r->'items') = 0, 'own items not echoed';
  c := (r->>'cursor')::bigint;
  assert c > 0, 'cursor moves';
  -- Browser B, first time: gets both.
  r := public.sync_apply('00000000-0000-0000-0000-0000000000a2', 'devB', 0, '[]');
  assert jsonb_array_length(r->'items') = 2, 'other browser gets them';
  assert r->'items'->0->>'id' = 't1' and (r->'items'->0->'data'->'record'->>'text') = 'Fix the sink', 'data round trip';
  -- B changes t1 with an older rev: refused, and B gets the stored one back.
  r := public.sync_apply('00000000-0000-0000-0000-0000000000a2', 'devB', (r->>'cursor')::bigint,
    '[{"kind":"target","id":"t1","rev":50,"data":{"state":"completed","record":{"text":"old"}}}]');
  assert (select data->'record'->>'text' from public.sync_items where id = 't1') = 'Fix the sink', 'older change loses';
  -- B deletes the settings item with a newer rev; A sees the deletion.
  perform public.sync_apply('00000000-0000-0000-0000-0000000000a2', 'devB', 0, '[{"kind":"settings","id":"all","rev":200,"data":null}]');
  r := public.sync_apply('00000000-0000-0000-0000-0000000000a2', 'devA', c, '[]');
  assert jsonb_array_length(r->'items') = 1 and r->'items'->0->'data' = 'null'::jsonb, 'deletion reaches A';
  -- Other accounts see nothing.
  r := public.sync_apply('00000000-0000-0000-0000-0000000000b2', 'devA', 0, '[]');
  assert jsonb_array_length(r->'items') = 0, 'accounts are separate';
  -- Paging: 5 items, 2 at a time.
  perform public.sync_apply('00000000-0000-0000-0000-0000000000b2', 'devX', 0,
    (select jsonb_agg(jsonb_build_object('kind','saved','id','v' || g,'rev',1,'data',jsonb_build_object('id','v' || g))) from generate_series(1,5) g));
  r := public.sync_apply('00000000-0000-0000-0000-0000000000b2', 'devY', 0, '[]', 2);
  assert jsonb_array_length(r->'items') = 2 and (r->>'more')::boolean, 'first page';
  r := public.sync_apply('00000000-0000-0000-0000-0000000000b2', 'devY', (r->>'cursor')::bigint, '[]', 2);
  r := public.sync_apply('00000000-0000-0000-0000-0000000000b2', 'devY', (r->>'cursor')::bigint, '[]', 2);
  assert jsonb_array_length(r->'items') = 1 and not (r->>'more')::boolean and r->'items'->0->>'id' = 'v5', 'last page';
end $$;
-- Users read only their own rows, and can't call the function.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.sync_items) = 5, 'own rows only';
  begin
    perform public.sync_apply('00000000-0000-0000-0000-0000000000a2', 'x', 0, '[]');
    assert false, 'function not callable by users';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- Deleting the account deletes its synced items.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a2';
do $$ begin assert (select count(*) from public.sync_items where user_id = '00000000-0000-0000-0000-0000000000a2') = 0, 'cascade'; end $$;
select 'sync tests passed';
