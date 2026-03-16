-- Incremental migration for issuer on-chain approval workflow
-- Run this in Supabase SQL Editor for existing databases.

alter table issuers
  drop constraint if exists issuers_status_check;

alter table issuers
  add constraint issuers_status_check
  check (status in ('pending', 'pending_onchain', 'approved', 'rejected', 'suspended'));

alter table issuers add column if not exists wallet_address text;
alter table issuers add column if not exists issuer_cap_id text;
alter table issuers add column if not exists registration_tx_digest text;
alter table issuers add column if not exists registration_explorer_url text;
alter table issuers add column if not exists onchain_registered_at timestamptz;

create index if not exists issuers_wallet_address_idx on issuers(wallet_address);
create index if not exists issuers_sui_wallet_address_idx on issuers(sui_wallet_address);
create index if not exists issuers_registration_tx_digest_idx on issuers(registration_tx_digest);
