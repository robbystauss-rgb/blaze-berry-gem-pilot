-- Guest checkout records are private. Access requires an unguessable capability
-- token whose hash is stored here. No public list or draft-read endpoint exists.
create table if not exists rec_checkout (
  id uuid primary key,
  token_hash text not null,
  draft jsonb not null,
  amount_cents integer not null check (amount_cents > 0),
  subtotal_cents integer not null,
  shipping_cents integer not null,
  tax_cents integer not null,
  tax_calculation_id text not null,
  tax_transaction_id text,
  delivery jsonb not null,
  currency text not null default 'usd',
  provider text check (provider in ('stripe', 'paypal')),
  provider_id text unique,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired')),
  payment_id text,
  shipping jsonb,
  proof_status text not null default 'awaiting-proof',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create table if not exists rec_payment_events (
  provider text not null,
  event_id text not null,
  checkout_id uuid not null references rec_checkout(id),
  received_at timestamptz not null default now(),
  primary key(provider, event_id)
);
create table if not exists rec_artwork_uploads (
  id uuid primary key, token_hash text not null, content_hash text not null,
  parts integer not null check(parts between 1 and 17),
  created_at timestamptz not null default now()
);
create table if not exists rec_artwork_parts (
  upload_id uuid not null references rec_artwork_uploads(id) on delete cascade,
  part integer not null check(part between 0 and 16),
  content text not null,
  primary key(upload_id,part)
);
create table if not exists rec_checkout_limits (
  key text primary key, window_start timestamptz not null, hits integer not null
);
