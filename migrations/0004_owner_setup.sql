-- A private, expiring owner invitation can be redeemed once by its authenticated recipient.
-- Passwords remain exclusively in the existing Better Auth system.
create table if not exists commerce_owner_setup_uses (
  digest text primary key,
  user_id text not null references "user"(id),
  redeemed_at timestamptz not null default now()
);
create trigger commerce_owner_setup_immutable before update or delete on commerce_owner_setup_uses
  for each row execute function commerce_immutable();
