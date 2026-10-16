-- Shiplog schema. RLS on, no policies: only the service role (server-side) can read/write.
create table if not exists shiplog_installations (
  id text primary key, namespace text not null default '', status text not null default 'active'
    check (status in ('active','suspended','disconnected')),
  created_at timestamptz not null default now(), disconnected_at timestamptz
);
create table if not exists shiplog_user_keys (
  installation_id text primary key references shiplog_installations(id) on delete cascade,
  ciphertext text not null, iv text not null, tag text not null, key_version int not null default 1,
  last4 text not null, created_at timestamptz not null default now()
);
create table if not exists shiplog_deliveries (id text primary key, received_at timestamptz not null default now());
create table if not exists shiplog_jobs (
  id text primary key, delivery_id text not null, installation_id text not null, repo text not null,
  pr_number text not null default '', pr_url text not null default '', kind text not null, mode text not null,
  status text not null, agent_id text, run_id text, pr_opened text, result text, created_at timestamptz not null default now()
);
create index if not exists shiplog_jobs_inst on shiplog_jobs(installation_id, created_at desc);
create table if not exists shiplog_outbox (
  id text primary key, installation_id text not null, repo text not null, pr_number text not null,
  body text not null, delivered boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists shiplog_changelogs (repo text primary key, markdown text not null, updated_at timestamptz not null default now());
alter table shiplog_installations enable row level security;
alter table shiplog_user_keys enable row level security;
alter table shiplog_deliveries enable row level security;
alter table shiplog_jobs enable row level security;
alter table shiplog_outbox enable row level security;
alter table shiplog_changelogs enable row level security;
