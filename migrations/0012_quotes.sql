-- Additive estimates and customer requests. Payment records remain in the existing ledger.
create table if not exists commerce_quote_requests (
 id text primary key, name text not null, email text not null, company text not null default '',
 quantity integer not null check(quantity between 1 and 10000), details text not null,
 permission_to_respond boolean not null check(permission_to_respond),
 state text not null default 'new' check(state in ('new','reviewed','archived')),
 created_at timestamptz not null default now()
);
create table if not exists commerce_quotes (
 id text primary key, number bigserial unique, state text not null default 'draft'
 check(state in ('draft','issued','accepted','declined','revoked')),
 body jsonb not null, subtotal integer not null check(subtotal>=0),
 total integer not null check(total>0 and total<=10000000), currency text not null default 'usd' check(currency='usd'),
 version integer not null default 1, token_hash text unique,
 actor_id text not null, request_id text references commerce_quote_requests(id),
 order_id text unique references commerce_orders(id),
 issued_at timestamptz, responded_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
 check((state='accepted')=(order_id is not null))
);
create index if not exists commerce_quotes_recent_idx on commerce_quotes(updated_at);
create index if not exists commerce_quote_requests_recent_idx on commerce_quote_requests(created_at);
create or replace function commerce_quote_frozen() returns trigger language plpgsql as $$
begin
 if old.state<>'draft' and (new.body is distinct from old.body or new.subtotal<>old.subtotal or new.total<>old.total or new.currency<>old.currency) then
  raise exception 'Issued quote contents are immutable; duplicate to revise';
 end if;
 if old.order_id is not null and new.order_id is distinct from old.order_id then
  raise exception 'Accepted quote order association is immutable';
 end if;
 if old.state in ('accepted','declined','revoked') and new.state<>old.state then
  raise exception 'Completed quote state is immutable';
 end if;
 return new;
end $$;
create trigger commerce_quote_frozen before update on commerce_quotes for each row execute function commerce_quote_frozen();
create trigger commerce_quote_no_delete before delete on commerce_quotes for each row execute function commerce_immutable();
