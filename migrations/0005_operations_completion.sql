-- Additive operational extensions. Original order items and financial records are unchanged.
alter table commerce_products add column if not exists publish_at timestamptz;
create index if not exists commerce_products_publish_idx on commerce_products(state,publish_at);
create table if not exists commerce_production_files (
 id text primary key, order_id text not null references commerce_orders(id),
 name text not null, mime text not null, bytes bytea not null,
 actor_id text not null references "user"(id), reason text not null,
 request_id text unique not null, created_at timestamptz not null default now()
);
create index if not exists commerce_production_files_order_idx on commerce_production_files(order_id,created_at);
create trigger commerce_production_files_immutable before update or delete on commerce_production_files
 for each row execute function commerce_immutable();
create table if not exists commerce_mfa_recovery (
 user_id text not null references "user"(id), digest text not null,
 created_at timestamptz not null default now(), primary key(user_id,digest)
);
