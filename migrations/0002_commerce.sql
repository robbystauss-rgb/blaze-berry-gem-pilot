-- Additive only: existing provider/auth/catalog data is not rewritten.
create table if not exists merchant_staff (
 user_id text primary key references "user"(id), role text not null check(role in ('owner','manager','production')),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists commerce_orders (
 id text primary key, number bigserial unique, created_at timestamptz not null default now(),
 customer_user_id text, customer_name text not null, customer_email text not null,
 shipping_address jsonb, source text not null, currency text not null default 'usd' check(currency='usd'),
 subtotal integer not null check(subtotal>=0), discount integer not null default 0 check(discount>=0),
 shipping integer not null default 0 check(shipping>=0), tax integer not null default 0 check(tax>=0),
 total integer not null check(total>=0), financial_detail_known boolean not null default true,
 stage text not null default 'new' check(stage in ('new','artwork_review','customer_approval','ready_for_production','engraving','assembly','quality_check','packaging','ready_to_ship','shipped','delivered','completed','canceled')),
 due_at timestamptz, assigned_to text references "user"(id), tracking text, carrier text,
 version integer not null default 1, check(total=subtotal-discount+shipping+tax)
);
create index if not exists commerce_orders_created_idx on commerce_orders(created_at);
create index if not exists commerce_orders_email_idx on commerce_orders(lower(customer_email));
create index if not exists commerce_orders_queue_idx on commerce_orders(stage,due_at);
create table if not exists commerce_order_items (
 id text primary key, order_id text not null references commerce_orders(id), product_key text not null,
 title text not null, quantity integer not null check(quantity>0), fulfilled_quantity integer not null check(fulfilled_quantity>0),
 unit_amount integer not null check(unit_amount>=0), specifications jsonb not null, artwork bytea, artwork_type text
);
create index if not exists commerce_items_order_idx on commerce_order_items(order_id);
create table if not exists commerce_checkouts (
 provider text not null check(provider in ('stripe','paypal')), reference text not null,
 order_id text not null unique references commerce_orders(id), created_at timestamptz not null default now(),
 state text not null default 'pending' check(state in ('pending','failed','expired','paid')), primary key(provider,reference)
);
create table if not exists commerce_payments (
 id text primary key, order_id text not null references commerce_orders(id), provider text not null,
 reference text not null, kind text not null check(kind in ('payment','refund')), amount integer not null check(amount>0),
 currency text not null default 'usd' check(currency='usd'), fee integer, occurred_at timestamptz not null,
 actor_id text, reason text, unique(provider,reference,kind)
);
create index if not exists commerce_payments_order_idx on commerce_payments(order_id);
create index if not exists commerce_payments_time_idx on commerce_payments(occurred_at);
create table if not exists commerce_events (
 provider text not null, event_id text not null, event_type text not null, received_at timestamptz not null default now(),
 primary key(provider,event_id)
);
create table if not exists commerce_invoices (
 order_id text primary key references commerce_orders(id), provider_id text unique, customer_id text,
 state text not null default 'creating', hosted_url text, pdf_url text, sent_at timestamptz,
 last_error text, updated_at timestamptz not null default now()
);
create table if not exists commerce_disputes (
 reference text primary key, order_id text not null references commerce_orders(id), state text not null, updated_at timestamptz not null default now()
);
create table if not exists commerce_notes (
 id text primary key, order_id text references commerce_orders(id), customer_email text,
 actor_id text not null, body text not null, created_at timestamptz not null default now(),
 check(order_id is not null or customer_email is not null)
);
create table if not exists commerce_inventory (
 id text primary key, sku text unique not null, title text not null, category text not null,
 on_hand integer check(on_hand>=0), reserved integer not null default 0 check(reserved>=0),
 committed integer not null default 0 check(committed>=0), incoming integer not null default 0 check(incoming>=0),
 threshold integer not null default 0 check(threshold>=0), version integer not null default 1,
 check(on_hand is null or on_hand>=reserved+committed)
);
create table if not exists commerce_inventory_rules (
 product_key text not null, inventory_id text not null references commerce_inventory(id),
 units_per_item integer not null check(units_per_item>0), primary key(product_key,inventory_id)
);
create table if not exists commerce_allocations (
 order_id text not null references commerce_orders(id), inventory_id text not null references commerce_inventory(id),
 quantity integer not null check(quantity>0), state text not null check(state in ('reserved','committed','consumed','released')),
 primary key(order_id,inventory_id)
);
create table if not exists commerce_movements (
 id text primary key, inventory_id text not null references commerce_inventory(id), order_id text references commerce_orders(id),
 on_hand_delta integer not null, reserved_delta integer not null, committed_delta integer not null,
 reason text not null, actor_id text not null, request_id text unique not null, created_at timestamptz not null default now()
);
create table if not exists commerce_products (
 id text primary key, builder_family text unique, title text not null, description text not null default '',
 category text not null, state text not null check(state in ('draft','active','inactive','archived')),
 images jsonb not null default '[]', seo_title text not null default '', seo_description text not null default '',
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists commerce_variants (
 id text primary key, product_id text not null references commerce_products(id), title text not null,
 sku text unique not null, price integer not null check(price>=0), active boolean not null default true,
 options jsonb not null default '{}'
);
create table if not exists commerce_content (
 key text primary key, value text not null, version integer not null default 1, updated_at timestamptz not null default now()
);
create table if not exists commerce_assets (
 id text primary key, mime text not null, bytes bytea not null, actor_id text not null, created_at timestamptz not null default now()
);
create table if not exists commerce_audit (
 id text primary key, actor_id text not null, action text not null, resource_type text not null, resource_id text not null,
 before_value jsonb, after_value jsonb, created_at timestamptz not null default now()
);
create index if not exists commerce_audit_time_idx on commerce_audit(created_at);
create table if not exists commerce_notifications (
 id text primary key, event_key text unique not null, order_id text references commerce_orders(id),
 title text not null, created_at timestamptz not null default now()
);
create table if not exists commerce_notification_reads (
 notification_id text not null references commerce_notifications(id), user_id text not null,
 read_at timestamptz not null default now(), primary key(notification_id,user_id)
);
create table if not exists commerce_mfa (
 user_id text primary key references "user"(id), secret_encrypted text not null, enabled boolean not null default false,
 last_counter bigint not null default -1, failures integer not null default 0, blocked_until timestamptz
);
create table if not exists commerce_mfa_sessions (
 session_hash text primary key, user_id text not null, expires_at timestamptz not null
);
-- Application code cannot edit item snapshots or audit records. DB triggers also protect against accidental updates.
create or replace function commerce_immutable() returns trigger language plpgsql as $$
begin raise exception 'Historical record is immutable'; end $$;
drop trigger if exists commerce_item_immutable on commerce_order_items;
create trigger commerce_item_immutable before update or delete on commerce_order_items for each row execute function commerce_immutable();
drop trigger if exists commerce_audit_immutable on commerce_audit;
create trigger commerce_audit_immutable before update or delete on commerce_audit for each row execute function commerce_immutable();
