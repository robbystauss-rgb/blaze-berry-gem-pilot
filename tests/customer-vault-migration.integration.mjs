import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { z } from "zod";
test("0019 links historical orders without merging shared email identities or changing ledger/artwork", async () => {
  const pg = new PGlite();
  try {
    for (const name of readdirSync("migrations")
      .filter((n) => /^\d.*\.sql$/.test(n) && n < "0019_")
      .sort())
      await pg.exec(readFileSync("migrations/" + name, "utf8"));
    const orders = [randomUUID(), randomUUID()],
      bytes = Buffer.from("TEST original historical bytes");
    for (const id of orders) {
      await pg.query(
        "insert into commerce_orders(id,customer_name,customer_email,source,subtotal,total) values($1,'TEST shared family name','shared@example.invalid','historical',3000,3000)",
        [id],
      );
      await pg.query(
        "insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications,artwork,artwork_type) values($1,$2,'test','TEST original',1,1,3000,'{\"original\":true}',$3,'image/png')",
        [randomUUID(), id, bytes],
      );
    }
    await pg.query(
      "insert into commerce_payments(id,order_id,provider,reference,kind,amount,occurred_at) values($1,$2,'manual','TEST-legacy-Venmo','payment',3000,now())",
      [randomUUID(), orders[0]],
    );
    const before = (
      await pg.query("select id,order_id,amount,provider,reference from commerce_payments")
    ).rows;
    await pg.exec(readFileSync("migrations/0019_customer_design_vault.sql", "utf8"));
    const rows = (
      await pg.query("select id,customer_id,total,customer_email from commerce_orders order by id")
    ).rows;
    assert.equal(new Set(rows.map((r) => r.customer_id)).size, 2);
    for (const row of rows) {
      assert.ok(z.string().uuid().safeParse(row.customer_id).success);
      assert.equal(row.total, 3000);
      assert.equal(row.customer_email, "shared@example.invalid");
    }
    assert.deepEqual(
      (await pg.query("select id,order_id,amount,provider,reference from commerce_payments")).rows,
      before,
    );
    for (const row of (await pg.query("select artwork from commerce_order_items")).rows)
      assert.deepEqual(Buffer.from(row.artwork), bytes);
    assert.equal((await pg.query("select * from commerce_customer_accounts")).rows.length, 0);
  } finally {
    await pg.close();
  }
});
