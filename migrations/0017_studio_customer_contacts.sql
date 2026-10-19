-- Private owner-managed contacts; no historical documents or financial rows change.
create table commerce_customer_contacts (
 customer_email text primary key,
 phone text not null default '' check(phone='' or phone ~ '^\+[1-9][0-9]{7,14}$'),
 version integer not null default 1 check(version>0),
 actor_id text not null, updated_at timestamptz not null default now()
);
revoke all on commerce_customer_contacts from public;
