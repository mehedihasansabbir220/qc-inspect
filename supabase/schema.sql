-- QC Inspect — Supabase schema
-- Run once in Supabase → SQL Editor. Idempotent where practical.
--
-- Security model
--   * Every inspection has one owner (the inspector who created it).
--   * The owner can create share links. A link carries two permissions: can_download, can_edit.
--   * A recipient must be signed in; opening the link "redeems" it and makes them a member.
--   * Row Level Security + storage policies enforce everything server-side. The UI only mirrors it.

create extension if not exists pgcrypto;

-- ───────────────────────── tables ─────────────────────────
create table if not exists public.inspections (
  id           uuid primary key,
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_email  text,
  version      integer not null,
  data         jsonb not null,
  po_number    text generated always as (data->>'poNumber') stored,
  verdict      text generated always as (data->>'verdict') stored,
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists inspections_owner_idx on public.inspections(owner_id);
create index if not exists inspections_updated_idx on public.inspections(updated_at);

create table if not exists public.shares (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique default encode(gen_random_bytes(18), 'hex'),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  created_by    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  can_download  boolean not null default false,
  can_edit      boolean not null default false,
  revoked       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists shares_inspection_idx on public.shares(inspection_id);

create table if not exists public.share_members (
  share_id   uuid not null references public.shares(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text,
  joined_at  timestamptz not null default now(),
  primary key (share_id, user_id)
);

-- Roles: 'inspector' (default) or 'manager' (QA manager: sees & downloads everyone's reports, assigns roles).
-- One Supabase project = one company, so "team" means every user of this project.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'inspector' check (role in ('inspector', 'manager')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill users who signed up before roles existed
insert into public.profiles (id, email) select id, email from auth.users on conflict (id) do nothing;

-- ───────────────────────── permission helpers ─────────────────────────
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'manager');
$$;

-- SECURITY DEFINER so policies can call them without recursive RLS evaluation.
create or replace function public.is_owner(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from inspections where id = iid and owner_id = auth.uid());
$$;

create or replace function public.share_flags(iid uuid)
returns table (can_view boolean, can_download boolean, can_edit boolean)
language sql stable security definer set search_path = public as $$
  select count(*) > 0, coalesce(bool_or(s.can_download), false), coalesce(bool_or(s.can_edit), false)
  from shares s join share_members m on m.share_id = s.id
  where s.inspection_id = iid and m.user_id = auth.uid() and not s.revoked;
$$;

create or replace function public.inspection_exists(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from inspections where id = iid);
$$;

create or replace function public.can_view(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner(iid) or is_manager() or (select can_view from share_flags(iid));
$$;

create or replace function public.can_edit(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner(iid) or (select can_edit from share_flags(iid));
$$;

create or replace function public.can_download(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner(iid) or is_manager() or (select can_download from share_flags(iid));
$$;

-- ───────────────────────── RLS ─────────────────────────
alter table public.inspections   enable row level security;
alter table public.shares        enable row level security;
alter table public.share_members enable row level security;
alter table public.profiles      enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (id = auth.uid() or public.is_manager());
-- No insert/update/delete policies: profiles are created by the trigger and roles change only via set_user_role().

drop policy if exists insp_select on public.inspections;
create policy insp_select on public.inspections for select using (public.can_view(id));
drop policy if exists insp_insert on public.inspections;
create policy insp_insert on public.inspections for insert with check (owner_id = auth.uid());
drop policy if exists insp_update on public.inspections;
create policy insp_update on public.inspections for update using (public.can_edit(id)) with check (public.can_edit(id));
drop policy if exists insp_delete on public.inspections;
create policy insp_delete on public.inspections for delete using (owner_id = auth.uid());

drop policy if exists shares_owner on public.shares;
create policy shares_owner on public.shares for all
  using (created_by = auth.uid() and public.is_owner(inspection_id))
  with check (created_by = auth.uid() and public.is_owner(inspection_id));

drop policy if exists members_read on public.share_members;
create policy members_read on public.share_members for select
  using (user_id = auth.uid() or exists (select 1 from shares s where s.id = share_id and s.created_by = auth.uid()));

-- ───────────────────────── RPCs ─────────────────────────
-- Idempotent upsert with optimistic concurrency. Raises 40001 on a stale version.
create or replace function public.upsert_inspection(p jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  iid uuid := (p->>'id')::uuid;
  v   integer := (p->>'version')::integer;
  cur record;
begin
  select version, updated_by into cur from inspections where id = iid for update;
  if not found then
    -- Row exists but RLS hides it from this user → no access (e.g. share revoked)
    if public.inspection_exists(iid) then
      raise exception 'You do not have access to this inspection' using errcode = '42501';
    end if;
    insert into inspections (id, owner_id, owner_email, version, data, updated_by)
    values (iid, auth.uid(), auth.jwt()->>'email', v, p, auth.uid());
    return v;
  end if;
  if not public.can_edit(iid) then
    raise exception 'You do not have edit permission' using errcode = '42501';
  end if;
  if cur.version > v or (cur.version = v and cur.updated_by is distinct from auth.uid()) then
    raise exception 'conflict' using errcode = '40001', detail = cur.version::text;
  end if;
  update inspections set version = v, data = p, updated_at = now(), updated_by = auth.uid() where id = iid;
  return v;
end $$;

-- Own inspections changed since a timestamp, plus ALL inspections others gave me access to
-- (always, so permission changes and revocations are picked up on every pull). RLS filters
-- visibility. `via` says why I can see it: owner | share (a link) | team (I'm a manager).
drop function if exists public.pull_inspections(timestamptz);
create or replace function public.pull_inspections(since timestamptz)
returns table (id uuid, version integer, data jsonb, owner_email text, is_owner boolean, can_download boolean, can_edit boolean, updated_at timestamptz, via text)
language sql stable security invoker set search_path = public as $$
  select i.id, i.version, i.data, i.owner_email, i.owner_id = auth.uid(),
         public.can_download(i.id), public.can_edit(i.id), i.updated_at,
         case when i.owner_id = auth.uid() then 'owner'
              when (select sf.can_view from public.share_flags(i.id) sf) then 'share'
              else 'team' end
  from inspections i
  where i.updated_at > since or i.owner_id <> auth.uid()
  order by i.updated_at;
$$;

-- Managers: who is on the team, with activity.
create or replace function public.list_team()
returns table (id uuid, email text, role text, inspections bigint, last_activity timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'Managers only' using errcode = '42501'; end if;
  return query
    select p.id, p.email, p.role, count(i.id), max(i.updated_at)
    from profiles p left join inspections i on i.owner_id = p.id
    group by p.id, p.email, p.role
    order by p.role desc, p.email;
end $$;

-- Managers assign roles. You cannot change your own role (prevents locking the team out).
create or replace function public.set_user_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'Only a QA manager can change roles' using errcode = '42501'; end if;
  if target = auth.uid() then raise exception 'You cannot change your own role' using errcode = '42501'; end if;
  if new_role not in ('inspector', 'manager') then raise exception 'Unknown role %', new_role using errcode = '22023'; end if;
  update profiles set role = new_role where id = target;
end $$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()), 'inspector');
$$;

-- Opening a link: join the share (must be signed in). Returns the inspection id.
create or replace function public.redeem_share(t text) returns uuid
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  select * into s from shares where token = t;
  if not found or s.revoked then raise exception 'This link is invalid or was revoked' using errcode = 'P0002'; end if;
  insert into share_members (share_id, user_id, email) values (s.id, auth.uid(), auth.jwt()->>'email')
  on conflict do nothing;
  return s.inspection_id;
end $$;

-- ───────────────────────── storage ─────────────────────────
-- Private bucket. Object paths: <inspection_id>/photos/<id>.jpg, <inspection_id>/attachments/<id>.pdf
insert into storage.buckets (id, name, public, file_size_limit)
values ('qc-files', 'qc-files', false, 20971520)
on conflict (id) do nothing;

drop policy if exists qc_files_read on storage.objects;
create policy qc_files_read on storage.objects for select
  using (bucket_id = 'qc-files' and public.can_view(((storage.foldername(name))[1])::uuid));

drop policy if exists qc_files_write on storage.objects;
create policy qc_files_write on storage.objects for insert
  with check (bucket_id = 'qc-files' and (
    public.can_edit(((storage.foldername(name))[1])::uuid)
    -- First upload may precede the inspection row (photos sync first). Must use the
    -- SECURITY DEFINER check: a plain subquery is filtered by RLS and would treat someone
    -- else's (hidden) inspection as non-existent — letting strangers write into it.
    or not public.inspection_exists(((storage.foldername(name))[1])::uuid)
  ));

drop policy if exists qc_files_update on storage.objects;
create policy qc_files_update on storage.objects for update
  using (bucket_id = 'qc-files' and owner = auth.uid());

drop policy if exists qc_files_delete on storage.objects;
create policy qc_files_delete on storage.objects for delete
  using (bucket_id = 'qc-files' and public.is_owner(((storage.foldername(name))[1])::uuid));

grant execute on function public.upsert_inspection(jsonb), public.pull_inspections(timestamptz), public.redeem_share(text),
  public.list_team(), public.set_user_role(uuid, text), public.my_role() to authenticated;

-- First QA manager: run once in the SQL editor with your own e-mail —
--   update public.profiles set role = 'manager' where email = 'you@company.com';
