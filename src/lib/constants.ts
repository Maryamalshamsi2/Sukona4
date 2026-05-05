/**
 * App-wide constants. Keep this file tiny and stable — most config lives
 * elsewhere (env, settings, DB).
 */

/**
 * The public URL where Sukona is reachable from the customer's phone.
 *
 * Used by:
 *   - The wa.me fallback message (when WhatsApp Cloud API isn't configured)
 *   - The "Copy receipt link" / "Copy review link" buttons in the calendar
 *     detail view (they prefer window.location.origin when it's available)
 *   - Any server-side code that needs an absolute URL (e.g. a future
 *     scheduled-send job)
 *
 * NOT used for the URLs baked into Meta Cloud API templates — those are
 * configured once in the Template Manager when the template is submitted
 * to Meta. Changing this constant won't change what's already approved.
 *
 * Override per-deploy via the NEXT_PUBLIC_APP_URL env var.
 */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://sukona.com";
