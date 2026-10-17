-- Exact model retirement. No historical orders, prices, uploads, or payment rows change.
insert into commerce_audit(id,actor_id,action,resource_type,resource_id,before_value,after_value)
select 'retire-112pm-'||id,'system:migration:0015','product.archived','product',id,
       jsonb_build_object('state',state,'builder_family',builder_family),
       jsonb_build_object('state','archived','reason','Owner retired exact model 112PM')
from commerce_products where builder_family='112PM' and state<>'archived'
on conflict(id) do nothing;
insert into commerce_audit(id,actor_id,action,resource_type,resource_id,before_value,after_value)
select 'retire-112pm-variant-'||v.id,'system:migration:0015','variant.deactivated','variant',v.id,
       jsonb_build_object('active',true),jsonb_build_object('active',false,'reason','Owner retired exact model 112PM')
from commerce_variants v where v.active and (
  v.product_id in (select id from commerce_products where builder_family='112PM')
  or v.options @> '{"family":"112PM"}'::jsonb
  or v.options @> '{"modelId":"112PM"}'::jsonb
  or v.options @> '{"model":"112PM"}'::jsonb)
on conflict(id) do nothing;
update commerce_variants set active=false where product_id in
  (select id from commerce_products where builder_family='112PM')
  or options @> '{"family":"112PM"}'::jsonb
  or options @> '{"modelId":"112PM"}'::jsonb
  or options @> '{"model":"112PM"}'::jsonb;
update commerce_products set state='archived',version=version+1,updated_at=now()
where builder_family='112PM' and state<>'archived';
