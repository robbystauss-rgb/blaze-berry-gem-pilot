import { useState, useEffect } from "react";
import { getCustomerDetail, mutateAdmin } from "@/lib/commerce/api";
import { money } from "@/lib/commerce/types";
import { Field, Badge } from "./command-center";
export function CustomerDetail({ email, open }: { email: string; open: (id: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCustomerDetail>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () =>
    getCustomerDetail({ data: email })
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, [email]);
  return (
    <div className="cc-form">
      <p>{email}</p>
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
      {data ? (
        <>
          <h3>Purchase history</h3>
          <div className="cc-records">
            {data.orders.map((o) => (
              <div key={o.id}>
                <div>
                  <button className="cc-link" onClick={() => open(o.id)}>
                    Order #{o.number}
                  </button>
                  <small>{o.titles}</small>
                </div>
                <span>
                  <Badge value={o.payment_status} />
                  {money(o.paid - o.refunded)}
                </span>
              </div>
            ))}
          </div>
          <h3>Internal customer notes</h3>
          {data.notes.map((n) => (
            <p key={n.id}>
              {n.body}
              <small>
                {n.actor_id} · {new Date(n.created_at).toLocaleString()}
              </small>
            </p>
          ))}
          <p className="cc-help">
            Email delivery / communication history is unavailable without a connected email service.
          </p>
        </>
      ) : (
        <p>Loading customer history…</p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          setBusy(true);
          try {
            await mutateAdmin({
              data: { action: "customer.note", payload: { email, body: String(f.get("body")) } },
            });
            form.reset();
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Note could not be saved.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field name="body" title="Internal note" type="textarea" required />
        <button className="cc-button" disabled={busy}>
          Add customer note
        </button>
      </form>
    </div>
  );
}
