"use server";

import { createClient } from "@/lib/supabase/server";
import type { ReceiptContext } from "@/types";

/**
 * Resolve a receipt token into the context needed by the public receipt
 * page. Public — anyone with the token can call this.
 *
 * Uses the `get_receipt_context` RPC (security definer) so anon callers
 * can read the appointment + salon brand + line items without going
 * through user-scoped RLS.
 */
export async function getReceiptContext(
  token: string
): Promise<ReceiptContext | null> {
  if (!token || token.length < 8) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_receipt_context", {
    p_token: token,
  });

  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return row as ReceiptContext;
}
