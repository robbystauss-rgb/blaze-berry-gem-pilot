create table if not exists legal_acceptances (
  id uuid primary key,
  payment_method text not null,
  provider_order_id text not null,
  accepted_at timestamptz not null,
  artwork_authorized boolean not null,
  portfolio_consent boolean not null,
  has_artwork boolean not null,
  terms_version text not null,
  artwork_policy_version text not null,
  custom_order_policy_version text not null,
  privacy_policy_version text not null,
  proof_policy_version text not null,
  proof_version text,
  proof_approved_at timestamptz,
  artwork_identifier text,
  customer_account_id text,
  created_at timestamptz not null default now(),
  unique (payment_method, provider_order_id)
);

create index if not exists legal_acceptances_accepted_at_idx on legal_acceptances (accepted_at);
