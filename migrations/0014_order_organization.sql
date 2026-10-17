-- Private operational metadata only. Financial/item records remain unchanged.
alter table commerce_orders add column priority text not null default 'normal'
 check(priority in ('low','normal','high'));
alter table commerce_orders add column tags jsonb not null default '[]'::jsonb
 check(jsonb_typeof(tags)='array' and jsonb_array_length(tags)<=12);
create index commerce_orders_production_priority_idx on commerce_orders(priority,due_at,created_at)
 where stage not in ('completed','canceled','shipped','delivered');
