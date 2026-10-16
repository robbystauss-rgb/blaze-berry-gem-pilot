import { useCallback, useEffect, useState } from "react";
import { getOwnerDocuments, updateOwnerDocument } from "@/lib/commerce/owner-api";
import type { DocumentRow, OwnerScope } from "@/lib/commerce/owner-schemas";
export function useOwnerDocuments<T>(scope: OwnerScope) {
  const [rows, setRows] = useState<DocumentRow<T>[]>([]);
  const [revisions, setRevisions] = useState<
    Awaited<ReturnType<typeof getOwnerDocuments>>["revisions"]
  >([]);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    try {
      const data = await getOwnerDocuments({ data: scope });
      setRows(data.documents as DocumentRow<T>[]);
      setRevisions(data.revisions);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load drafts.");
    } finally {
      setLoading(false);
    }
  }, [scope]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function save(
    key: string,
    body: T,
    action: "draft" | "publish" | "revert" | "unpublish",
    revision?: number,
  ) {
    if (
      action !== "draft" &&
      !window.confirm(
        action === "publish"
          ? "Publish this reviewed version to the storefront?"
          : action === "unpublish"
            ? "Unpublish this version? Its draft and revision history will be preserved; existing storefront defaults apply."
            : "Restore this published revision? A new revision will preserve the current history.",
      )
    )
      return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateOwnerDocument({
        data: {
          scope,
          key,
          body,
          version: rows.find((r) => r.key === key)?.version ?? 0,
          action,
          revision,
        },
      });
      await refresh();
      setMessage(
        action === "draft"
          ? "Draft saved."
          : action === "publish"
            ? "Published."
            : action === "unpublish"
              ? "Unpublished."
              : "Published revision restored.",
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { rows, revisions, error, loading, busy, message, refresh, save };
}
