-- Durable idempotency and pending-refund commitments; no historical data rewrites.
create table if not exists commerce_refund_requests (
 id text primary key, order_id text not null references commerce_orders(id), payment_id text not null references commerce_payments(id),
 amount integer not null check(amount>0), reason text not null, actor_id text not null,
 state text not null check(state in ('processing','pending','succeeded','failed','review_required')),
 provider_reference text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists commerce_refund_requests_order_idx on commerce_refund_requests(order_id,state);
