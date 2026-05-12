/**
 * Service-role Supabase client for *trusted server contexts only*.
 *
 * The normal `createClient` in server.ts attaches the user's JWT and
 * is subject to RLS — which is exactly what we want for everything
 * the logged-in user does. The webhook handler, however, runs in
 * response to Stripe events with no user session — there's no JWT
 * to attach. We need to update `salons.subscription_status` etc.
 * regardless of which user's row it is, so we bypass RLS by using
 * the service-role key.
 *
 * Never expose this client to a client component, never accept its
 * key in `NEXT_PUBLIC_*` env vars, never use it inside a logged-in
 * user's request flow (the per-user `createClient` is correct there).
 * It exists solely for webhook handlers and other internal tasks
 * that don't have an authenticated user.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Untyped client — we don't generate Database types in this project,
// so SupabaseClient<any, "public", any> (the default) is what every
// .update() / .insert() call in the codebase uses. Without an explicit
// type annotation, the generic gets inferred as `never` here and
// every column write breaks at compile time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: SupabaseClient<any, "public", any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminClient(): SupabaseClient<any, "public", any> {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  _admin = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return _admin;
}
