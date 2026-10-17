import { getRequest } from "@tanstack/react-start/server";
import { assertSameSiteRequest, CrossSiteRequestError } from "@/lib/auth/isolation.server";

/** Public quote mutations use private capabilities, never ambient customer identity. */
export function assertQuoteMutationOrigin() {
  assertSameSiteRequest();
  const request = getRequest();
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new CrossSiteRequestError();
}
