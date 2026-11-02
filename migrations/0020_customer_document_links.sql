-- Explicit owner-selected customer associations; issued financial snapshots stay frozen.
alter table commerce_quotes add column if not exists customer_id text references commerce_customers(id);
alter table commerce_studio_documents add column if not exists customer_id text references commerce_customers(id);
create index if not exists commerce_quotes_customer_idx on commerce_quotes(customer_id,updated_at);
create index if not exists commerce_studio_customer_idx on commerce_studio_documents(customer_id,created_at);
