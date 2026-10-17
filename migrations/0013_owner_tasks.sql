-- General business tasks are separate from order fulfillment and payment state.
create table commerce_owner_tasks (
 id text primary key, title text not null, details text not null default '',
 due_date date, priority text not null check(priority in ('low','normal','high')),
 state text not null check(state in ('open','done','archived')),
 version integer not null default 1, created_by text not null, updated_by text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 completed_at timestamptz
);
create index commerce_owner_tasks_queue_idx on commerce_owner_tasks(state,due_date,priority);
