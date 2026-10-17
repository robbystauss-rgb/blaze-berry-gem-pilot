-- Separate business documents reuse the existing order/payment ledger.
create sequence commerce_studio_invoice_number;
create sequence commerce_studio_proof_number;
create table commerce_studio_documents (
 id text primary key, kind text not null check(kind in ('invoice','proof')),
 number bigint not null, order_id text references commerce_orders(id),
 state text not null default 'draft' check(state in ('draft','issued','void','awaiting_approval','changes_requested','approved','superseded','withdrawn')),
 body jsonb not null, sender jsonb, subtotal integer not null default 0 check(subtotal>=0),
 total integer not null default 0 check(total>=0), version integer not null default 1,
 proof_version integer, token_hash text unique, expires_at timestamptz,
 issued_at timestamptz, responded_at timestamptz, response jsonb,
 pdf bytea, actor_id text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(kind,number), unique(order_id,proof_version), check(kind='invoice' or order_id is not null)
);
create function studio_assign_number() returns trigger language plpgsql as $$
begin new.number:=nextval((case when new.kind='invoice' then 'commerce_studio_invoice_number' else 'commerce_studio_proof_number' end)::regclass);return new;end $$;
create trigger studio_assign_number before insert on commerce_studio_documents for each row execute function studio_assign_number();
create unique index studio_one_order_invoice on commerce_studio_documents(order_id) where kind='invoice' and state<>'void';
create index studio_documents_kind_time on commerce_studio_documents(kind,created_at desc);
create table commerce_proof_controls (
 order_id text primary key references commerce_orders(id), required boolean not null default true,
 current_proof_id text references commerce_studio_documents(id), updated_at timestamptz not null default now()
);
-- Preserve already-declared artwork holds even if their workflow stage changes.
insert into commerce_proof_controls(order_id,required)
 select id,true from commerce_orders where stage='customer_approval';
create table commerce_studio_images (
 document_id text not null references commerce_studio_documents(id), position integer not null,
 mime text not null, bytes bytea not null, primary key(document_id,position)
);
create trigger studio_image_immutable before update or delete on commerce_studio_images for each row execute function commerce_immutable();
create function studio_snapshot_immutable() returns trigger language plpgsql as $$
begin
 if old.kind<>new.kind or old.number<>new.number or old.actor_id<>new.actor_id or
    (old.state<>'draft' and (old.body is distinct from new.body or old.sender is distinct from new.sender or old.pdf is distinct from new.pdf or old.total<>new.total or old.subtotal<>new.subtotal or old.order_id is distinct from new.order_id or old.proof_version is distinct from new.proof_version)) then
   raise exception 'Issued document snapshot is immutable';
 end if;
 return new;
end $$;
create trigger studio_snapshot_immutable before update on commerce_studio_documents for each row execute function studio_snapshot_immutable();
create trigger studio_document_no_delete before delete on commerce_studio_documents for each row execute function commerce_immutable();
create table commerce_studio_emails (
 id text primary key, document_id text not null references commerce_studio_documents(id),
 request_id text unique not null, payload jsonb not null, state text not null default 'pending' check(state in ('pending','sending','accepted','delivered','failed','review_required')),
 provider_id text, attempts integer not null default 0, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table commerce_invoice_history (
 provider_id text primary key, order_id text not null references commerce_orders(id),
 snapshot jsonb not null, actor_id text not null, archived_at timestamptz not null default now()
);
create trigger studio_invoice_history_immutable before update or delete on commerce_invoice_history for each row execute function commerce_immutable();
