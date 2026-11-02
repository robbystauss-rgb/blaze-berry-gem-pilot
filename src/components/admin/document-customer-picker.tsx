import { useEffect, useState } from "react";
import { getCustomerProfile, searchCustomerProfiles } from "@/lib/commerce/customer-api";
import type { CustomerProfile } from "@/lib/commerce/customer-schemas";
import { ownerError } from "@/lib/commerce/errors";
import { CustomerProfileEditor } from "./customer-profile-editor";
import * as Dialog from "@radix-ui/react-dialog";

export function DocumentCustomerPicker({
  customerId,
  name,
  email,
  disabled,
  choose,
}: {
  customerId: string | null;
  name: string;
  email: string;
  disabled?: boolean;
  choose: (profile: CustomerProfile | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CustomerProfile[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<"new" | "edit" | null>(null);
  useEffect(() => {
    let active = true;
    if (!customerId) {
      setProfile(null);
      return;
    }
    getCustomerProfile({ data: customerId })
      .then((data) => {
        if (active) setProfile(data.profile);
      })
      .catch((e) => {
        if (active) setError(ownerError(e));
      });
    return () => {
      active = false;
    };
  }, [customerId]);
  useEffect(() => {
    let active = true;
    if (search.trim().length < 2) {
      setRows([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      searchCustomerProfiles({ data: search })
        .then((data) => {
          if (active) setRows(data.filter((c) => !c.archived));
        })
        .catch((e) => {
          if (active) setError(ownerError(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);
  function select(value: CustomerProfile | null) {
    setProfile(value);
    choose(value);
    setSearch("");
    setError("");
  }
  return (
    <section className="cc-form" aria-label="Customer profile for this document">
      <h3>Customer profile</h3>
      <p className="cc-help">
        Find a customer or create their reusable profile while keeping this draft open.
      </p>
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
      {profile ? (
        <div className="cc-records">
          <div>
            <strong>{profile.name}</strong>
            <small>
              C-{profile.number} ·{" "}
              {profile.email || profile.phone_normalized || profile.phone || "Phone-only profile"}
            </small>
          </div>
        </div>
      ) : null}
      {!disabled && (
        <>
          <label className="cc-field">
            Find by name, phone, email or customer number
            <input
              type="search"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {loading && <p role="status">Finding customer profiles…</p>}
          {rows.length > 0 && (
            <ul aria-label="Matching customer profiles" className="cc-form">
              {rows.slice(0, 12).map((row) => (
                <li key={row.id}>
                  <button type="button" className="cc-button secondary" onClick={() => select(row)}>
                    {row.name} · C-{row.number}
                    <small>{row.email || row.phone_normalized || row.phone}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="cc-actions">
            <button type="button" className="cc-button secondary" onClick={() => setEditor("new")}>
              Add customer here
            </button>
            {profile && (
              <>
                <button
                  type="button"
                  className="cc-button secondary"
                  onClick={() => setEditor("edit")}
                >
                  Edit customer contact
                </button>
                <button type="button" className="cc-button secondary" onClick={() => select(null)}>
                  Use a one-off contact
                </button>
              </>
            )}
          </div>
        </>
      )}
      {profile && !profile.email && (
        <p className="cc-help">
          This profile is saved. A genuine email is required for this document.{" "}
          <a className="cc-link" href={`/admin?section=customers&customerId=${profile.id}`}>
            Open customer to start an internal phone order
          </a>
          , or add their email above.
        </p>
      )}
      <Dialog.Root
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw_-_2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-5 text-ink shadow-xl">
            <Dialog.Title className="font-display text-2xl">
              {editor === "edit" ? "Update customer contact" : "Create customer profile"}
            </Dialog.Title>
            <Dialog.Description className="cc-help">
              Save a private customer profile without leaving this document.
            </Dialog.Description>
            {editor && (
              <CustomerProfileEditor
                profile={editor === "edit" && profile ? profile : undefined}
                initial={{ name, email }}
                cancel={() => setEditor(null)}
                onSaved={async (id) => {
                  const data = await getCustomerProfile({ data: id });
                  select(data.profile);
                  setEditor(null);
                }}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
