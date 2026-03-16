-- SUICERT Production Database Schema
-- Run in your Supabase SQL Editor

-- ── Enable extensions ────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── Issuers ───────────────────────────────────────────────────────────────────
create table if not exists issuers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  name          text not null,
  organization  text not null,
  email         text not null unique,
  website       text,
  description   text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'pending_onchain', 'approved', 'rejected', 'suspended')),
  ai_score      integer check (ai_score >= 0 and ai_score <= 100),
  ai_summary    text,
  verified_at   timestamptz,
  issuer_cap_id text,
  registration_tx_digest text,
  registration_explorer_url text,
  onchain_registered_at timestamptz,
  created_at    timestamptz not null default now(),
  subscription_active boolean not null default false,
  wallet_address text,
  sui_wallet_address text
);

create index on issuers(status);
create index on issuers(user_id);
create index on issuers(wallet_address);
create index on issuers(sui_wallet_address);
create index on issuers(registration_tx_digest);

-- ── Events ────────────────────────────────────────────────────────────────────
create table if not exists events (
  id                uuid primary key default gen_random_uuid(),
  issuer_id         uuid not null references issuers(id) on delete cascade,
  title             text not null,
  description       text,
  category          text not null default 'other'
                      check (category in ('blockchain','tech','business','education','healthcare','finance','other')),
  cover_image       text,
  meet_link         text not null,
  start_time        timestamptz not null,
  end_time          timestamptz not null,
  required_minutes  integer not null default 60 check (required_minutes > 0),
  status            text not null default 'draft'
                      check (status in ('draft','live','ended','cancelled')),
  attendee_count    integer not null default 0,
  minted_count      integer not null default 0,
  metadata_uri      text,
  tags              text[] default '{}',
  created_at        timestamptz not null default now()
);

create index on events(issuer_id);
create index on events(status);
create index on events(start_time);

-- ── Attendance ────────────────────────────────────────────────────────────────
create table if not exists attendance (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references events(id) on delete cascade,
  user_id           uuid,
  user_email        text not null,
  user_name         text not null,
  join_time         timestamptz,
  leave_time        timestamptz,
  total_minutes     integer not null default 0,
  progress_percent  integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  status            text not null default 'not_started'
                      check (status in ('not_started','in_progress','completed','failed')),
  certificate_id    uuid,
  ably_channel      text not null,
  created_at        timestamptz not null default now(),
  unique(event_id, user_email)
);

create index on attendance(event_id);
create index on attendance(user_email);
create index on attendance(status);

-- ── Certificates ──────────────────────────────────────────────────────────────
create table if not exists certificates (
  id                uuid primary key default gen_random_uuid(),
  attendance_id     uuid references attendance(id),
  event_id          uuid not null references events(id),
  user_id           uuid,
  recipient_name    text not null,
  recipient_email   text not null,
  issuer_name       text not null,
  event_title       text not null,
  issued_at         timestamptz not null default now(),
  sui_object_id     text unique,
  ipfs_hash         text,
  metadata_uri      text,
  ai_summary        text,
  qr_code           text,
  verified          boolean not null default false
);

create index on certificates(recipient_email);
create index on certificates(sui_object_id);
create index on certificates(event_id);

-- Add FK back to attendance
alter table attendance
  add constraint fk_attendance_certificate
  foreign key (certificate_id) references certificates(id);

-- ── RLS Policies ──────────────────────────────────────────────────────────────
alter table issuers enable row level security;
alter table events enable row level security;
alter table attendance enable row level security;
alter table certificates enable row level security;

-- Issuers: owners can view/update their own
create policy "Issuers can view own record" on issuers
  for select using (auth.uid() = user_id);

create policy "Issuers can update own record" on issuers
  for update using (auth.uid() = user_id);

-- Events: public can view live/ended events
create policy "Public can view live events" on events
  for select using (status in ('live', 'ended'));

create policy "Issuers can manage own events" on events
  for all using (
    issuer_id in (select id from issuers where user_id = auth.uid())
  );

-- Attendance: users can view own attendance
create policy "Users can view own attendance" on attendance
  for select using (user_id = auth.uid());

-- Certificates: public can verify
create policy "Certificates are publicly verifiable" on certificates
  for select using (true);

-- ── Functions ─────────────────────────────────────────────────────────────────

-- Auto-increment attendee count when attendance record created
create or replace function increment_attendee_count()
returns trigger language plpgsql security definer as $$
begin
  update events set attendee_count = attendee_count + 1 where id = NEW.event_id;
  return NEW;
end;
$$;

create trigger on_attendance_created
  after insert on attendance
  for each row execute procedure increment_attendee_count();

-- Auto-increment minted count when certificate created
create or replace function increment_minted_count()
returns trigger language plpgsql security definer as $$
begin
  update events set minted_count = minted_count + 1 where id = NEW.event_id;
  return NEW;
end;
$$;

create trigger on_certificate_created
  after insert on certificates
  for each row execute procedure increment_minted_count();
