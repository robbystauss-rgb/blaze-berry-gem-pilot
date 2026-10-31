-- Persistent single-merchant CRM connected to existing orders, art and documents.
-- No financial/order-item snapshots are rewritten. No public account is created.
create table if not exists commerce_customers (
 id text primary key, number bigserial unique not null,
 name text not null, email text, phone text not null default '', phone_normalized text not null default '',
 preferred_contact text not null default 'phone' check(preferred_contact in ('phone','text','email','none')),
 business_name text not null default '', aliases jsonb not null default '[]', tags jsonb not null default '[]',
 delivery_preference text not null default 'unspecified' check(delivery_preference in ('unspecified','shipping','pickup')),
 address jsonb not null default '{}', preferences text not null default '',
 origin text not null default 'owner', archived boolean not null default false,
 merged_into text references commerce_customers(id), version integer not null default 1,
 created_by text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(merged_into is null or merged_into<>id)
);
create index if not exists commerce_customers_email_idx on commerce_customers(lower(email));
create index if not exists commerce_customers_phone_idx on commerce_customers(phone_normalized);
create index if not exists commerce_customers_name_idx on commerce_customers(lower(name));
create index if not exists commerce_customers_merged_idx on commerce_customers(merged_into);
alter table commerce_orders add column if not exists customer_id text references commerce_customers(id);
alter table commerce_orders alter column customer_email drop not null;
create index if not exists commerce_orders_customer_idx on commerce_orders(customer_id,created_at);
-- One historical profile per order avoids silently combining shared email/name
-- identities. Staff can explicitly review and merge them while retaining lineage.
insert into commerce_customers(id,name,email,origin,created_by,created_at)
 select overlay(overlay(md5('rec-customer:'||o.id) placing '4' from 13 for 1) placing '8' from 17 for 1)::uuid::text,o.customer_name,nullif(lower(o.customer_email),''),'historical_order','migration:0019',o.created_at
 from commerce_orders o where o.customer_id is null
 on conflict(id) do nothing;
update commerce_orders set customer_id=overlay(overlay(md5('rec-customer:'||id) placing '4' from 13 for 1) placing '8' from 17 for 1)::uuid::text where customer_id is null;

alter table commerce_notes add column if not exists customer_id text references commerce_customers(id);
alter table commerce_notes drop constraint if exists commerce_notes_check;
alter table commerce_notes add constraint commerce_note_target check(order_id is not null or customer_email is not null or customer_id is not null);
create index if not exists commerce_notes_customer_idx on commerce_notes(customer_id,created_at);

create table if not exists commerce_customer_assets (
 id text primary key, customer_id text not null references commerce_customers(id),
 kind text not null check(kind in ('original','production','proof','finished')),
 name text not null, mime text not null, bytes bytea not null, checksum text not null,
 byte_size integer not null check(byte_size>0), width integer, height integer, preview bytea,
 provenance text not null, source_item_id text references commerce_order_items(id),
 actor_id text not null, created_at timestamptz not null default now()
);
create index if not exists commerce_customer_assets_customer_idx on commerce_customer_assets(customer_id,created_at);
create unique index if not exists commerce_customer_original_item_idx on commerce_customer_assets(source_item_id) where source_item_id is not null and kind='original';
create trigger commerce_customer_assets_immutable before update or delete on commerce_customer_assets for each row execute function commerce_immutable();
create table if not exists commerce_customer_designs (
 id text primary key, customer_id text not null references commerce_customers(id), name text not null,
 collection text not null default '', state text not null default 'draft' check(state in ('draft','approved','archived')),
 version integer not null default 1, created_by text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists commerce_customer_designs_customer_idx on commerce_customer_designs(customer_id,updated_at);
create table if not exists commerce_customer_design_revisions (
 design_id text not null references commerce_customer_designs(id), revision integer not null,
 configuration jsonb not null, artwork_asset_id text references commerce_customer_assets(id),
 source_item_id text references commerce_order_items(id), approved_proof_id text references commerce_studio_documents(id),
 actor_id text not null, note text not null, created_at timestamptz not null default now(), primary key(design_id,revision)
);
create trigger commerce_customer_design_revisions_immutable before update or delete on commerce_customer_design_revisions for each row execute function commerce_immutable();
create table if not exists commerce_phone_order_requests (
 id text primary key, order_id text not null unique references commerce_orders(id), fingerprint text not null,
 customer_id text not null references commerce_customers(id), design_id text references commerce_customer_designs(id),
 revision integer, actor_id text not null, created_at timestamptz not null default now()
);
create table if not exists commerce_customer_accounts (
 user_id text primary key references "user"(id), customer_id text not null references commerce_customers(id),
 verified_by text not null, reason text not null, created_at timestamptz not null default now()
);
