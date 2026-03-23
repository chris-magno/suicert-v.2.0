-- Data-only reset for development/testing
--
-- Usage:
-- 1) Run in Supabase SQL Editor as a privileged role.
-- 2) This clears app/domain data but keeps auth.users accounts.
--
-- Keeps:
-- - auth.users accounts (Google sign-in users stay intact)
--
-- Clears:
-- - public.auth_audit_logs
-- - public.user_identities
-- - public.certificates
-- - public.attendance
-- - public.events
-- - public.issuers

begin;

truncate table public.auth_audit_logs restart identity cascade;
truncate table public.user_identities restart identity cascade;
truncate table public.certificates restart identity cascade;
truncate table public.attendance restart identity cascade;
truncate table public.events restart identity cascade;
truncate table public.issuers restart identity cascade;

commit;

-- Post-check summary.
select
  (select count(*) from auth.users) as users_kept,
  (select count(*) from public.user_identities) as identities_left,
  (select count(*) from public.auth_audit_logs) as auth_logs_left,
  (select count(*) from public.issuers) as issuers_left,
  (select count(*) from public.events) as events_left,
  (select count(*) from public.attendance) as attendance_left,
  (select count(*) from public.certificates) as certificates_left;
