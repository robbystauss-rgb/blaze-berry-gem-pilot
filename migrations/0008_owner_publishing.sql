-- Additive: no order, payment, artwork, catalog or authentication records are changed.
create table commerce_documents (
 scope text not null check(scope in ('calibration','gallery','storefront','pricing')),
 key text not null, draft jsonb not null, published jsonb,
 version integer not null default 1, published_revision integer not null default 0,
 updated_at timestamptz not null default now(), primary key(scope,key)
);
create table commerce_document_revisions (
 id text primary key, scope text not null, key text not null, revision integer not null,
 body jsonb not null, actor_id text not null, created_at timestamptz not null default now(),
 unique(scope,key,revision), foreign key(scope,key) references commerce_documents(scope,key)
);
create trigger commerce_document_revisions_immutable before update or delete on commerce_document_revisions
 for each row execute function commerce_immutable();
create table commerce_media (
 id text primary key references commerce_assets(id), name text not null,
 original bytea not null, original_mime text not null, thumbnail bytea not null,
 width integer not null check(width>0), height integer not null check(height>0),
 alt text not null default '', tags jsonb not null default '[]',
 archived boolean not null default false, version integer not null default 1,
 created_at timestamptz not null default now()
);
create table commerce_promotions (
 id text primary key, code text unique not null, definition jsonb not null,
 state text not null check(state in ('draft','active','inactive','archived')),
 version integer not null default 1, created_at timestamptz not null default now()
);
create table commerce_promotion_uses (
 order_id text primary key references commerce_orders(id),
 promotion_id text not null references commerce_promotions(id),
 customer_key text not null, discount integer not null check(discount>0),
 state text not null check(state in ('reserved','redeemed','released')),
 created_at timestamptz not null default now()
);
create index commerce_promotion_uses_limit_idx on commerce_promotion_uses(promotion_id,customer_key,state);
create table commerce_rate_limits (
 key text primary key, hits integer not null, resets_at timestamptz not null
);
-- Preserve the already-advertised ZADDY offer. No new campaign is activated.
insert into commerce_promotions(id,code,state,definition) values
 ('00000000-0000-4000-8000-000000000112','ZADDY','active',
 '{"campaign":"Existing Richardson 112 offer","type":"fixed","amount":500,"perItem":true,"startsAt":null,"endsAt":null,"minimumSpend":0,"minimumQuantity":1,"families":["112"],"orderType":"hat","maximumUses":null,"perCustomer":null,"customerEmail":null,"firstOrder":false,"automatic":false}');
