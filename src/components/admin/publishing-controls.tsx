import { useState } from "react";
import { useOwnerDocuments } from "./use-owner-documents";
export function PublishingControls<T>({
  state,
  documentKey,
  body,
}: {
  state: ReturnType<typeof useOwnerDocuments<T>>;
  documentKey: string;
  body: T;
}) {
  const [revision, setRevision] = useState("");
  const row = state.rows.find((r) => r.key === documentKey);
  return (
    <div className="cc-publish-controls">
      <p className="cc-help">
        {row?.published
          ? `Published revision ${row.published_revision} · draft version ${row.version}`
          : "Unpublished draft"}{" "}
        · Changes reach customers when published.
      </p>
      <div className="cc-actions">
        <button
          className="cc-button secondary"
          disabled={state.busy}
          onClick={() => void state.save(documentKey, body, "draft")}
        >
          Save draft
        </button>
        <button
          className="cc-button"
          disabled={state.busy}
          onClick={() => void state.save(documentKey, body, "publish")}
        >
          {state.busy ? "Saving…" : "Publish reviewed version"}
        </button>
      </div>
      {row?.published && (
        <button
          className="cc-button secondary"
          disabled={state.busy}
          onClick={() => void state.save(documentKey, body, "unpublish")}
        >
          Unpublish
        </button>
      )}
      {state.revisions.some((r) => r.key === documentKey) && (
        <div className="cc-actions">
          <label className="cc-field">
            Published history
            <select
              aria-label="Published history"
              value={revision}
              onChange={(e) => setRevision(e.target.value)}
            >
              <option value="">Choose a revision</option>
              {state.revisions
                .filter((r) => r.key === documentKey)
                .map((r) => (
                  <option key={r.id} value={r.revision}>
                    Revision {r.revision} · {new Date(r.created_at).toLocaleString()}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="cc-button secondary"
            disabled={!revision || state.busy}
            onClick={() => void state.save(documentKey, body, "revert", Number(revision))}
          >
            Revert
          </button>
        </div>
      )}
      {state.error && (
        <p className="cc-error" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="cc-success" role="status">
          {state.message}
        </p>
      )}
    </div>
  );
}
