import { useState } from "react";
import { saveCustomerProfile } from "@/lib/commerce/customer-api";
import { customerBodySchema, type CustomerProfile } from "@/lib/commerce/customer-schemas";
import { ownerError } from "@/lib/commerce/errors";

export function CustomerProfileEditor({
  profile,
  onSaved,
  cancel,
  initial,
}: {
  profile?: CustomerProfile;
  onSaved: (id: string) => Promise<void>;
  cancel: () => void;
  initial?: { name?: string; email?: string };
}) {
  const [id] = useState(() => profile?.id ?? crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState(false);
  return (
    <form
      className="cc-form cc-customer-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const f = new FormData(event.currentTarget),
          t = (name: string) => String(f.get(name) ?? "");
        const body = customerBodySchema.safeParse({
          name: t("name"),
          email: t("email"),
          phone: t("phone"),
          phoneCountry: t("phoneCountry"),
          businessName: t("businessName"),
          preferredContact: t("preferredContact"),
          deliveryPreference: t("deliveryPreference"),
          tags: t("tags")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          aliases: t("aliases")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          preferences: t("preferences"),
          address: {
            line1: t("line1"),
            line2: t("line2"),
            city: t("city"),
            region: t("region"),
            postalCode: t("postalCode"),
            country: t("country"),
          },
        });
        if (!body.success) {
          setError(ownerError(body.error));
          return;
        }
        setBusy(true);
        setError("");
        try {
          const result = await saveCustomerProfile({
            data: {
              id,
              version: profile?.version ?? 0,
              body: body.data,
              reviewedDuplicate: duplicates,
            },
          });
          await onSaved(result.id);
        } catch (e) {
          setError(ownerError(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <p className="cc-eyebrow">PRIVATE BUSINESS RECORD</p>
        <h2>{profile ? "Edit customer preferences" : "Add a customer"}</h2>
        <p className="cc-help">
          Create the profile now. This saves no public account and sends no invitation, text or
          payment request.
        </p>
      </div>
      <fieldset disabled={busy} className="cc-customer-fields">
        <label className="cc-field">
          Customer name
          <input
            name="name"
            aria-label="Customer name"
            defaultValue={profile?.name ?? initial?.name}
            required
            maxLength={120}
            autoComplete="name"
          />
        </label>
        <label className="cc-field">
          Phone number
          <input
            name="phone"
            aria-label="Phone number"
            defaultValue={
              profile?.phone_normalized.startsWith("+") ? profile.phone_normalized : profile?.phone
            }
            type="tel"
            autoComplete="tel"
            maxLength={40}
          />
        </label>
        <label className="cc-field">
          Phone country
          <select name="phoneCountry" aria-label="Phone country" defaultValue="">
            <option value="">Keep local number / explicit +country code</option>
            <option value="US">United States (+1)</option>
          </select>
        </label>
        <label className="cc-field">
          Email (optional)
          <input
            name="email"
            aria-label="Customer email (optional)"
            type="email"
            defaultValue={profile?.email ?? initial?.email ?? ""}
            autoComplete="email"
          />
        </label>
        <label className="cc-field">
          Preferred contact
          <select
            name="preferredContact"
            aria-label="Preferred contact"
            defaultValue={profile?.preferred_contact ?? "phone"}
          >
            <option value="phone">Phone call</option>
            <option value="text">Text, composed by owner</option>
            <option value="email">Email</option>
            <option value="none">No preference recorded</option>
          </select>
        </label>
        <label className="cc-field">
          Business / team
          <input
            name="businessName"
            aria-label="Business / team"
            defaultValue={profile?.business_name}
            maxLength={160}
          />
        </label>
        <label className="cc-field">
          Other authorized contact names
          <input
            name="aliases"
            aria-label="Other authorized contact names"
            defaultValue={profile?.aliases.join(", ")}
            maxLength={1200}
          />
        </label>
        <label className="cc-field">
          Customer tags
          <input
            name="tags"
            aria-label="Customer tags"
            defaultValue={profile?.tags.join(", ")}
            placeholder="Repeat buyer, team, preferred style"
          />
        </label>
        <label className="cc-field">
          Delivery preference
          <select
            name="deliveryPreference"
            aria-label="Delivery preference"
            defaultValue={profile?.delivery_preference ?? "unspecified"}
          >
            <option value="unspecified">Confirm with customer</option>
            <option value="pickup">Pickup</option>
            <option value="shipping">Shipping</option>
          </select>
        </label>
        <details className="cc-wide">
          <summary>Address, when supplied</summary>
          <div className="cc-customer-fields">
            {(
              [
                ["line1", "Address line 1"],
                ["line2", "Address line 2"],
                ["city", "City"],
                ["region", "State / region"],
                ["postalCode", "Postal code"],
                ["country", "Country"],
              ] as const
            ).map(([name, title]) => (
              <label className="cc-field" key={name}>
                {title}
                <input
                  name={name}
                  aria-label={title}
                  defaultValue={profile?.address?.[name]}
                  maxLength={200}
                />
              </label>
            ))}
          </div>
        </details>
        <label className="cc-field cc-wide">
          Internal preferences
          <textarea
            name="preferences"
            aria-label="Internal preferences"
            defaultValue={profile?.preferences}
            maxLength={4000}
            rows={3}
          />
        </label>
        {!profile && (
          <label className="cc-check cc-wide">
            <input
              type="checkbox"
              checked={duplicates}
              onChange={(e) => setDuplicates(e.target.checked)}
            />
            I searched existing names and phone numbers; create a separate customer if a possible
            duplicate is found.
          </label>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="cc-error">
          {error}
        </p>
      )}
      <div className="cc-actions">
        <button className="cc-button" disabled={busy}>
          {busy ? "Saving profile…" : "Save customer profile"}
        </button>
        <button type="button" className="cc-button secondary" onClick={cancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
