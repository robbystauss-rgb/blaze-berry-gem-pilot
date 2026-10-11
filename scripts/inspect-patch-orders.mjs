// Read-only incident inspection. No order writes, provider mutations or raw uploads in output.
import pg from "pg";
import Stripe from "stripe";
import {recSession,recItems} from "./history-scope.mjs";
if(process.env.REC_ORDER_INSPECT!=="approved"||!process.env.DATABASE_URL||process.env.BETTER_AUTH_URL!=="https://recmamamade.com")throw Error("Explicit REC read-only inspection required.");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const client=await pool.connect();
try{
 await client.query("begin read only");
 const rows=await client.query("select o.id,o.number,o.created_at,o.source,i.specifications,i.artwork is not null as has_artwork,octet_length(i.artwork) as artwork_bytes,(select count(*)::int from commerce_production_files f where f.order_id=o.id) as production_files,(select coalesce(sum(p.amount),0)::int from commerce_payments p where p.order_id=o.id and p.kind='payment') as collected from commerce_orders o join commerce_order_items i on i.order_id=o.id order by o.created_at desc limit 20");
 for(const row of rows.rows){
  const s=row.specifications??{},m=s.providerMetadata??{};
  console.log("[patch-order-inspect] "+JSON.stringify({id:row.id,number:row.number,created:row.created_at,source:row.source,paid:row.collected>0,orderType:s.orderType??m.order_type??null,shape:s.patchShape??m.shape??null,size:s.patchSize??m.size??null,material:s.leatherette??m.material??null,textDesignSaved:!!(s.patchText||(m.design&&m.design!=="uploaded-artwork")),hasArtwork:row.has_artwork,artworkBytes:row.artwork_bytes,productionFiles:row.production_files,specKeys:Object.keys(s),metadataKeys:Object.keys(m)}));
 }
 if(process.env.STRIPE_SECRET_KEY){
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY),sessions=await stripe.checkout.sessions.list({limit:100});
  for(const s of sessions.data){
   if(!recSession(s))continue;
   const lines=await stripe.checkout.sessions.listLineItems(s.id,{limit:100});
   if(!recItems(lines))continue;
   const m=s.metadata??{};
   const linked=await client.query("select o.id,o.number from commerce_orders o join commerce_checkouts c on c.order_id=o.id where c.provider='stripe' and c.reference=$1",[s.id]);
   console.log("[patch-payment-inspect] "+JSON.stringify({created:new Date(s.created*1000).toISOString(),orderNumber:linked.rows[0]?.number??null,orderType:m.order_type??null,shape:m.shape??null,size:m.size??null,material:m.material??null,textDesignSaved:!!(m.design&&m.design!=="uploaded-artwork"),hasCurrentOrderLink:!!m.rec_order_id,metadataKeys:Object.keys(m)}));
  }
  console.log("[patch-order-inspect] "+JSON.stringify({providerListHasMore:sessions.has_more}));
 }
 await client.query("rollback");
}finally{client.release();await pool.end();}
// Deliberately stop before build/output: this inspection can never publish a deployment.
console.log("[patch-order-inspect] Complete; inspection-only, no release.");
process.exit(75);
