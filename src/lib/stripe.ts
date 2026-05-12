/**
 * Server-side Stripe SDK singleton.
 *
 * Lazy-initialized so a missing STRIPE_SECRET_KEY only fails the
 * request that actually needs Stripe (the checkout / webhook /
 * portal routes), not the whole build. Pinning the API version
 * means upgrading the package won't silently change the request
 * shape — the upgrade is intentional, in code.
 */

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local (dev) or the hosting platform's environment (prod).",
    );
  }
  _stripe = new Stripe(key, {
    // Pin to a known API version. Matches the LatestApiVersion shipped
    // by stripe@22.x. Bumping this is a deliberate upgrade — read the
    // Stripe changelog before changing.
    apiVersion: "2026-04-22.dahlia",
  });
  return _stripe;
}
