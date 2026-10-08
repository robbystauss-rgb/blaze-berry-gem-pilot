import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { z } from "zod";
export const getPublishedProduct = createServerFn({ method: "GET" })
  .validator(z.string().uuid())
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [product] = await sql<
      import("./types").ProductRow
    >`select id,title,description,category,state,images,seo_title,seo_description,version,builder_family from commerce_products where id=${data} and state='active' and (publish_at is null or publish_at<=now()) and builder_family is null`;
    if (!product) return null;
    const variants = await sql<
      import("./types").VariantRow
    >`select * from commerce_variants where product_id=${data} and active order by title`;
    return { product, variants };
  });
export const getBuilderContent = createServerFn({ method: "GET" })
  .validator(z.string().max(20))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [content] = await sql<{
      title: string;
      description: string;
    }>`select title,description from commerce_products where builder_family=${data}`;
    return content ?? null;
  });
export const getPublishedContent = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ key: string; value: string }>`select key,value from commerce_content`;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
});
export const getPublishedProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const products = await sql<
    import("./types").ProductRow
  >`select id,title,description,category,state,images,seo_title,seo_description,version,builder_family from commerce_products where state='active' and (publish_at is null or publish_at<=now()) and builder_family is null order by created_at desc limit 100`;
  const variants = await sql<
    import("./types").VariantRow
  >`select * from commerce_variants where active=true and product_id=any(${products.map((p) => p.id)}::text[]) order by title`;
  return { products, variants };
});
export const buyCatalogProduct = createServerFn({ method: "POST" })
  .validator(
    z.object({
      variantId: z.string().uuid(),
      quantity: z.number().int().min(1).max(250),
      name: z.string().trim().min(1).max(120),
      email: z.email(),
      requestId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const { createCatalogCheckout } = await import("./catalog-checkout.server");
    return createCatalogCheckout(data);
  });
export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const { getSql } = await import("@/lib/db");
    const { ORDER_SELECT } = await import("./core.server");
    const user = await getSessionUser(context.bearerToken);
    if (!user) throw new Error("Unauthorized");
    const sql = await getSql();
    return sql.query<import("./types").OrderRow>(
      `${ORDER_SELECT} where o.customer_user_id=$1 order by o.created_at desc limit 100`,
      [user.id],
    );
  });
