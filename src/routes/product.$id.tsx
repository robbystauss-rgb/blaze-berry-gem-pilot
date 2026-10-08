import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { getPublishedProduct } from "@/lib/commerce/public";
import { PublicProduct } from "@/components/layout/public-product";
export const Route = createFileRoute("/product/$id")({
  loader: async ({ params }) => {
    const data = await getPublishedProduct({ data: params.id });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.product.seo_title || loaderData?.product.title || "REC Mama Made" },
      {
        name: "description",
        content: loaderData?.product.seo_description || loaderData?.product.description || "",
      },
    ],
  }),
  component: Product,
});
function Product() {
  const { product, variants } = Route.useLoaderData();
  return (
    <section className="site-container page-top-space page-bottom-space">
      <Link to="/shop" className="cc-button secondary">
        All merchandise
      </Link>
      <h1 className="mt-6 font-display text-4xl">{product.title}</h1>
      <div className="cc-grid mt-8">
        <PublicProduct product={product} variants={variants} />
      </div>
    </section>
  );
}
