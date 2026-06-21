/**
 * Validate a user-submitted URL string for safe display/redirect.
 *
 * Why: any URL we later render as `href="..."` or
 * `window.location.href = ...` must be locked to http(s). A
 * `javascript:` URL stored in the DB becomes an XSS vector when
 * customers click it (or when we redirect to it on the public review
 * page). A `data:` URL can hide phishing payloads. Reject anything
 * that isn't a plain web URL.
 *
 * Behaviour:
 *  - empty/whitespace input → `{ value: null }` (clears the field)
 *  - valid http(s) URL → `{ value: trimmedString }`
 *  - anything else → `{ error: "..." }`
 *
 * Used by: settings public_review_url, client map_link, location
 * map_link. Add new call sites whenever a freeform URL field reaches
 * an unauthenticated viewer.
 */
export function validateWebUrl(
  raw: string | null | undefined,
  fieldLabel: string,
): { value: string | null } | { error: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { value: null };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { error: `${fieldLabel} must start with http:// or https://` };
    }
    return { value: trimmed };
  } catch {
    return { error: `${fieldLabel} is not a valid URL` };
  }
}
