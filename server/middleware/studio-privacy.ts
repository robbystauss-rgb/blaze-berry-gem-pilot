/** Protect private HTML documents as well as their data and PDF responses. */
export default async function studioPrivacy(
  event: { url: URL },
  next: () => unknown | Promise<unknown>,
) {
  const result = await next();
  if (
    !/^\/(invoice|design-proof|studio-preview)\//.test(event.url.pathname) ||
    !(result instanceof Response)
  )
    return result;
  const headers = new Headers(result.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}
