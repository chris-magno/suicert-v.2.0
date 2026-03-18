-- Incremental migration for unified Google/zkLogin identity fields
-- Run this in Supabase SQL Editor for existing databases.
-- This migration is additive and does NOT modify existing domain tables
-- such as issuers, events, attendance, or certificates.

create extension if not exists "pgcrypto";

create table if not exists user_identities (
  user_id text primary key,
  auth_provider text not null default 'google'
    check (auth_provider in ('google', 'zklogin')),
  zklogin_address text,
  wallet_bound_address text,
  last_wallet_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_identities_zklogin_address_uniq
  on user_identities (lower(zklogin_address))
  where zklogin_address is not null;

create unique index if not exists user_identities_wallet_bound_address_uniq
  on user_identities (lower(wallet_bound_address))
  where wallet_bound_address is not null;

create index if not exists user_identities_auth_provider_idx
  on user_identities (auth_provider);

create or replace function set_user_identities_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_identities_updated_at on user_identities;

create trigger trg_user_identities_updated_at
before update on user_identities
for each row execute procedure set_user_identities_updated_at();

create table if not exists auth_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  auth_provider text,
  wallet_address text,
  event text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Existing deployments may have UUID + FK based on auth.users from older drafts.
-- This app uses NextAuth user IDs (token.sub), so identity linkage must be auth-provider agnostic.
alter table if exists user_identities
  drop constraint if exists user_identities_user_id_fkey;

alter table if exists auth_audit_logs
  drop constraint if exists auth_audit_logs_user_id_fkey;

-- Policies can depend on user_id type; drop before type conversion and recreate later.
drop policy if exists "Users can view own identity" on user_identities;
drop policy if exists "Users can update own identity" on user_identities;
drop policy if exists "Users can view own auth logs" on auth_audit_logs;

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('user_identities', 'auth_audit_logs')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Some environments may have non-standard FK names; drop any FK attached to user_id columns.
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and t.relname = 'user_identities'
      and exists (
        select 1
        from unnest(c.conkey) as colnum(attnum)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = colnum.attnum
        where a.attname = 'user_id'
      )
  loop
    execute format('alter table public.user_identities drop constraint if exists %I', r.conname);
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and t.relname = 'auth_audit_logs'
      and exists (
        select 1
        from unnest(c.conkey) as colnum(attnum)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = colnum.attnum
        where a.attname = 'user_id'
      )
  loop
    execute format('alter table public.auth_audit_logs drop constraint if exists %I', r.conname);
  end loop;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_identities'
      and column_name = 'user_id'
      and data_type <> 'text'
  ) then
    execute 'alter table public.user_identities alter column user_id type text using user_id::text';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'auth_audit_logs'
      and column_name = 'user_id'
      and data_type <> 'text'
  ) then
    execute 'alter table public.auth_audit_logs alter column user_id type text using user_id::text';
  end if;
end $$;

create index if not exists auth_audit_logs_user_id_idx on auth_audit_logs(user_id);
create index if not exists auth_audit_logs_event_idx on auth_audit_logs(event);
create index if not exists auth_audit_logs_created_at_idx on auth_audit_logs(created_at desc);

alter table user_identities enable row level security;
alter table auth_audit_logs enable row level security;

drop policy if exists "Users can view own identity" on user_identities;
create policy "Users can view own identity" on user_identities
  for select using (auth.uid()::text = user_id);

drop policy if exists "Users can update own identity" on user_identities;
create policy "Users can update own identity" on user_identities
  for update using (auth.uid()::text = user_id);

drop policy if exists "Users can view own auth logs" on auth_audit_logs;
create policy "Users can view own auth logs" on auth_audit_logs
  for select using (auth.uid()::text = user_id);