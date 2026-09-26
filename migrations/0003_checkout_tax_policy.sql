-- Preserve the merchant's collection policy with each immutable quote.
alter table rec_checkout alter column tax_calculation_id drop not null;
alter table rec_checkout add column if not exists tax_mode text not null default 'automatic'
  check (tax_mode in ('automatic', 'not_collected'));
