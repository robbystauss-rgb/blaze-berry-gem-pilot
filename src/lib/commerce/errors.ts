/** Safe, readable form failures. Never echo raw validator JSON or database errors. */
export function ownerError(
  error: unknown,
  fallback = "Unable to save. Your entries are preserved; review them and retry.",
): string {
  if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    return error.issues
      .map(
        (issue: { path?: unknown[]; message?: string }) =>
          `${issue.path?.join(" → ") || "Form"}: ${issue.message || "Check this value."}`,
      )
      .join(" ");
  }
  const message = error instanceof Error ? error.message : "";
  if (/^\s*(?:\[|\{)/.test(message)) {
    try {
      return ownerError({ issues: JSON.parse(message) }, fallback);
    } catch {
      return fallback;
    }
  }
  if (
    !message ||
    /\b(select |insert |update |constraint|postgres|syntax error|stack|ECONN|password|connection string)\b/i.test(
      message,
    )
  )
    return fallback;
  return message;
}
