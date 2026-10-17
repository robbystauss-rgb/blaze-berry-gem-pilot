-- Additive import receipts; the existing stock and order ledgers stay authoritative.
create table commerce_inventory_imports (
 request_id text primary key, actor_id text not null,
 request_hash text not null, result jsonb not null,
 created_at timestamptz not null default now()
);
create trigger commerce_inventory_imports_immutable before update or delete on commerce_inventory_imports
 for each row execute function commerce_immutable();
