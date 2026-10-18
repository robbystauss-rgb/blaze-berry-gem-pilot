import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("0016 preserves populated historical order/payment/artwork and retains existing approval requirements", async () => {
  const db = new PGlite();
  try {
    for (const name of readdirSync("migrations")
      .filter((n) => /^\d{4}_.*\.sql$/.test(n) && n < "0016")
      .sort())
      await db.exec(readFileSync("migrations/" + name, "utf8"));
    await db.exec(
      "insert into commerce_orders(id,customer_name,customer_email,source,subtotal,total,stage) values('old-approval','TEST ONLY','old@example.invalid','test_fixture',1200,1200,'customer_approval'),('old-normal','TEST ONLY','normal@example.invalid','test_fixture',500,500,'new'); insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications,artwork,artwork_type) values('old-item','old-approval','test-old','TEST historical item',1,1,1200,'{\"instructions\":\"original\"}','\\x01020304','image/png'); insert into commerce_payments(id,order_id,provider,reference,kind,amount,occurred_at) values('old-payment','old-approval','test_fixture','test-reference','payment',1200,now());",
    );
    const before = {
      orders: (await db.query("select * from commerce_orders order by id")).rows,
      items: (await db.query("select * from commerce_order_items")).rows,
      payments: (await db.query("select * from commerce_payments")).rows,
    };
    await db.exec(readFileSync("migrations/0016_signature_documents.sql", "utf8"));
    assert.deepEqual(
      (await db.query("select * from commerce_orders order by id")).rows,
      before.orders,
    );
    assert.deepEqual((await db.query("select * from commerce_order_items")).rows, before.items);
    assert.deepEqual((await db.query("select * from commerce_payments")).rows, before.payments);
    assert.deepEqual(
      (await db.query("select order_id,required,current_proof_id from commerce_proof_controls"))
        .rows,
      [{ order_id: "old-approval", required: true, current_proof_id: null }],
    );
  } finally {
    await db.close();
  }
});
