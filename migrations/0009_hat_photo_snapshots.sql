-- Exact front-photo replacements are immutable, individually verified and calibrated.
create table commerce_hat_photos (
 id text primary key, model_id text not null, colorway text not null,
 asset_id text not null references commerce_assets(id), image_url text not null,
 sha256 text not null, width integer not null, height integer not null,
 provenance text not null, actor_id text not null, created_at timestamptz not null default now()
);
create index commerce_hat_photos_variant_idx on commerce_hat_photos(model_id,colorway);
create trigger commerce_hat_photos_immutable before update or delete on commerce_hat_photos
 for each row execute function commerce_immutable();
