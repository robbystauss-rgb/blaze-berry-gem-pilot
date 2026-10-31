-- Additive receipt metadata; historical ledger rows and provider references stay intact.
alter table commerce_payments add column if not exists method text;
alter table commerce_payments add column if not exists request_id text;
alter table commerce_payments add column if not exists request_fingerprint text;
alter table commerce_payments add column if not exists recorded_at timestamptz not null default now();
create unique index if not exists commerce_payment_request_idx on commerce_payments(request_id) where request_id is not null;
-- Legacy references are not rewritten. New manual receipts are checked under a
-- transaction advisory lock as well as the existing provider/reference constraint.
create index if not exists commerce_payment_receipt_lookup_idx on commerce_payments(provider,lower(btrim(reference)),kind);
