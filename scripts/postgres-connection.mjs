/** Keep the currently verified TLS behavior explicit across pg driver upgrades.
 * @param {string} value
 */
export function verifiedPostgresConnection(value) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw Error("Database configuration requires a PostgreSQL connection.");
  if (
    url.searchParams.get("uselibpqcompat") !== "true" &&
    ["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode") || "")
  )
    url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
