-- Permission scenario test. Run after supabase_stub.sql + schema.sql. Prints PASS/FAIL lines.
grant all on all tables in schema public to authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'owner@ft.com'),
  ('00000000-0000-0000-0000-00000000000b', 'viewer@brand.com'),
  ('00000000-0000-0000-0000-00000000000c', 'editor@ft.com'),
  ('00000000-0000-0000-0000-00000000000d', 'stranger@x.com');

create or replace function public.t_as(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', case who when 'owner' then '00000000-0000-0000-0000-00000000000a' when 'viewer' then '00000000-0000-0000-0000-00000000000b' when 'editor' then '00000000-0000-0000-0000-00000000000c' else '00000000-0000-0000-0000-00000000000d' end, false);
  perform set_config('request.jwt.claim.email', who || '@test', false);
end $$;

create or replace function public.t_check(name text, ok boolean) returns void language plpgsql as $$
begin raise notice '% %', case when ok then 'PASS' else 'FAIL' end, name; end $$;

create or replace function public.t_err(name text, sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise notice 'FAIL % (no error, expected %)', name, code;
exception when others then
  if sqlstate = code then raise notice 'PASS %', name; else raise notice 'FAIL % (got % %)', name, sqlstate, sqlerrm; end if;
end $$;
create or replace function public.t_affected(sql text) returns int language plpgsql as $$
declare n int;
begin execute sql; get diagnostics n = row_count; return n; end $$;
grant execute on all functions in schema public to authenticated;

create temp table tok (k text, v text);
grant all on tok to authenticated;

\set IID '''11111111-1111-1111-1111-111111111111'''
\set P1 '''{"id":"11111111-1111-1111-1111-111111111111","version":1,"poNumber":"PO-1","verdict":"pass"}'''

set role authenticated;

-- Owner creates an inspection
select t_as('owner');
select t_check('owner can create inspection', upsert_inspection(:P1::jsonb) = 1);
select t_check('idempotent retry of same version by same user', upsert_inspection(:P1::jsonb) = 1);
insert into storage.objects (bucket_id, name) values ('qc-files', '11111111-1111-1111-1111-111111111111/photos/p1.jpg');
select t_check('owner can upload photo', (select count(*) from storage.objects) = 1);

-- Stranger sees nothing
select t_as('stranger');
select t_check('stranger cannot see inspection', (select count(*) from inspections) = 0);
select t_check('stranger cannot see photos', (select count(*) from storage.objects) = 0);
select t_err('stranger cannot overwrite inspection', $$select upsert_inspection('{"id":"11111111-1111-1111-1111-111111111111","version":9}'::jsonb)$$, '42501');
select t_err('stranger cannot upload into the folder', $$insert into storage.objects (bucket_id, name) values ('qc-files', '11111111-1111-1111-1111-111111111111/photos/evil.jpg')$$, '42501');
select t_err('stranger cannot create a share for it', $$insert into shares (inspection_id) values ('11111111-1111-1111-1111-111111111111')$$, '42501');

-- Owner creates two links: view-only and edit
select t_as('owner');
with x as (insert into shares (inspection_id) values (:IID) returning token) insert into tok select 'view', token from x;
with x as (insert into shares (inspection_id, can_edit, can_download) values (:IID, true, true) returning token) insert into tok select 'edit', token from x;
select t_check('owner sees both links', (select count(*) from shares) = 2);

-- Viewer redeems the view-only link
select t_as('viewer');
select t_check('viewer redeems link', redeem_share((select v from tok where k = 'view')) = :IID);
select t_check('viewer can now see inspection', (select count(*) from inspections) = 1);
select t_check('viewer can see photos', (select count(*) from storage.objects) = 1);
select t_check('viewer pull shows view-only flags', (select not can_download and not can_edit and not is_owner from pull_inspections('1970-01-01')));
select t_err('viewer cannot edit via RPC', $$select upsert_inspection('{"id":"11111111-1111-1111-1111-111111111111","version":2}'::jsonb)$$, '42501');
select t_check('viewer cannot edit table directly', t_affected('update inspections set version = 99') = 0);
select t_check('viewer cannot see or change share settings', t_affected('update shares set can_edit = true') = 0);
select t_err('viewer cannot upload files', $$insert into storage.objects (bucket_id, name) values ('qc-files', '11111111-1111-1111-1111-111111111111/attachments/a.pdf')$$, '42501');
select t_err('bad token is rejected', $$select redeem_share('nope')$$, 'P0002');

-- Editor redeems the edit link and edits
select t_as('editor');
select redeem_share((select v from tok where k = 'edit'));
select t_check('editor pull shows edit+download', (select can_download and can_edit from pull_inspections('1970-01-01')));
select t_check('editor can edit', upsert_inspection('{"id":"11111111-1111-1111-1111-111111111111","version":2,"verdict":"fail"}'::jsonb) = 2);
insert into storage.objects (bucket_id, name) values ('qc-files', '11111111-1111-1111-1111-111111111111/attachments/a.pdf');
select t_check('editor can upload attachment', (select count(*) from storage.objects) = 2);

-- Owner's stale offline edit conflicts
select t_as('owner');
select t_err('stale owner edit is a conflict', $$select upsert_inspection('{"id":"11111111-1111-1111-1111-111111111111","version":2}'::jsonb)$$, '40001');
select t_check('owner sees editor''s change', (select verdict from inspections) = 'fail');
select t_check('owner sees who opened links', (select count(*) from share_members) = 2);

-- Owner revokes the edit link
update shares set revoked = true where token = (select v from tok where k = 'edit');
select t_as('editor');
select t_check('revoked editor loses access', (select count(*) from inspections) = 0);
select t_err('revoked editor cannot push', $$select upsert_inspection('{"id":"11111111-1111-1111-1111-111111111111","version":5}'::jsonb)$$, '42501');
select t_err('revoked link cannot be redeemed', $$select redeem_share((select v from tok where k = 'edit'))$$, 'P0002');

-- Viewer still has view access
select t_as('viewer');
select t_check('viewer unaffected by other revocation', (select count(*) from inspections) = 1);

-- Only owner deletes
select t_check('viewer cannot delete', t_affected('delete from inspections') = 0);
select t_as('stranger');
select t_check('stranger cannot delete files', t_affected('delete from storage.objects') = 0);
reset role;
