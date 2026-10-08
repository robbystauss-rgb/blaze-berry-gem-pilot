create table if not exists commerce_webhook_config (
 scope text primary key, id text unique not null,
 provider_id text unique, secret_encrypted text,
 state text not null check(state in ('configuring','ready','active','error')),
 actor_id text not null references "user"(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create or replace function commerce_webhook_secret_immutable() returns trigger language plpgsql as $$
begin
 if old.secret_encrypted is not null and new.secret_encrypted is distinct from old.secret_encrypted then
  raise exception 'Registered signing secrets are immutable; use a controlled rotation procedure';
 end if;
 return new;
end $$;
create trigger commerce_webhook_secret_immutable before update on commerce_webhook_config
 for each row execute function commerce_webhook_secret_immutable();
