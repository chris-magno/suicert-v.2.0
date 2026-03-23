-- Full reset: wipe all accounts and app data for test refresh
--
-- Usage:
-- 1) Run this in Supabase SQL Editor as a privileged role.
-- 2) This removes ALL users, including admin.
--
-- What this removes:
-- - ALL rows in user_identities/auth_audit_logs
-- - ALL issuer/event/attendance/certificate data
-- - ALL auth.users accounts

begin;

-- Delete dependent domain rows first.
delete from public.certificates;
delete from public.attendance;
delete from public.events;
delete from public.issuers;

-- Delete identity/auth linkage rows.
delete from public.auth_audit_logs;
delete from public.user_identities;

-- Delete all auth users (including admin).
delete from auth.users;

commit;

-- Post-check summary.
select
  (select count(*) from auth.users) as users_left,
  (select count(*) from public.user_identities) as identities_left,
  (select count(*) from public.issuers) as issuers_left,
  (select count(*) from public.events) as events_left,
  (select count(*) from public.attendance) as attendance_left,
  (select count(*) from public.certificates) as certificates_left;
