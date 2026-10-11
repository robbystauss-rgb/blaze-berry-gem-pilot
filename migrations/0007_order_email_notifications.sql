-- Additive outbox only. No backfill, customer changes, or financial mutations.
create table if not exists commerce_order_emails (
 id text primary key references commerce_notifications(id),
 event_key text not null unique,
 order_id text not null references commerce_orders(id),
 state text not null default 'queued' check(state in ('queued','sending','accepted','failed','review_required')),
 payload text,
 attempts integer not null default 0,
 first_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 lease_until timestamptz,
 lease_token text,
 provider_id text,
 last_error text,
 accepted_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists commerce_order_emails_due_idx
 on commerce_order_emails(next_attempt_at) where state in ('queued','sending');
