import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { submitQuoteRequest } from "@/lib/commerce/quotes-api";

export const Route = createFileRoute("/quote-request")({
  head: () => ({
    meta: [
      { title: "Custom & bulk quote request · REC Mama Made" },
      {
        name: "description",
        content:
          "Request a personal estimate for team hats, company orders and unusual custom projects from REC Mama Made.",
      },
    ],
  }),
  component: QuoteRequestPage,
});
function QuoteRequestPage() {
  const [requestId] = useState(() => crypto.randomUUID()),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="site-container page-top-space page-bottom-space max-w-3xl">
      <p className="tech-label">CUSTOM PROJECTS / TEAMS / COMPANIES</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">
        Let’s plan your project.
      </h1>
      <p className="mt-4 max-w-prose leading-7 text-bark">
        Tell us what you need, your quantity and any customization details. The shop will review
        availability and provide an estimate. This request does not place an order or collect
        payment.
      </p>
      {sent ? (
        <p role="status" className="mt-7 rounded-2xl border border-border bg-white p-6">
          Your request is saved for REC Mama Made to review. The shop can respond using the contact
          details you provided.
        </p>
      ) : (
        <form
          className="mt-8 grid gap-5 rounded-3xl border border-border bg-white p-5 sm:p-8"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              if (form.get("permission") !== "on")
                throw Error("Allow the shop to respond before submitting this request.");
              await submitQuoteRequest({
                data: {
                  id: requestId,
                  name: String(form.get("name")),
                  email: String(form.get("email")),
                  company: String(form.get("company")),
                  quantity: Number(form.get("quantity")),
                  details: String(form.get("details")),
                  permissionToRespond: true,
                  website: String(form.get("website") ?? "") as "",
                },
              });
              setSent(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Your request could not be saved.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="grid gap-2 text-sm font-semibold">
            Your name
            <input
              name="name"
              required
              maxLength={120}
              autoComplete="name"
              className="min-h-11 rounded-xl border border-border bg-paper px-3"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Email
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              className="min-h-11 rounded-xl border border-border bg-paper px-3"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Team or company (optional)
            <input
              name="company"
              maxLength={160}
              autoComplete="organization"
              className="min-h-11 rounded-xl border border-border bg-paper px-3"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Estimated quantity
            <input
              name="quantity"
              type="number"
              min={1}
              max={10000}
              defaultValue={12}
              required
              className="min-h-11 rounded-xl border border-border bg-paper px-3"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Project details
            <textarea
              name="details"
              required
              minLength={10}
              maxLength={5000}
              rows={5}
              placeholder="Products, exact hat models or colors, artwork needs, and your preferred timeline. The shop will confirm what is available."
              className="rounded-xl border border-border bg-paper p-3 font-normal"
            />
          </label>
          <div aria-hidden="true" className="hidden">
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <label className="flex items-start gap-3 text-sm leading-6">
            <input type="checkbox" name="permission" required className="mt-1 size-5" />
            REC Mama Made may use these details to respond to this project request.
          </label>
          {error && (
            <p role="alert" className="text-sm text-bark">
              {error}
            </p>
          )}
          <button className={buttonVariants()} disabled={busy}>
            {busy ? "Saving request…" : "Request an estimate"}
          </button>
        </form>
      )}
    </section>
  );
}
