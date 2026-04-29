"use server";

import { createClient } from "@/lib/supabase/server";
import type { ReviewContext } from "@/types";

/**
 * Resolve a review token into the context needed by the public page.
 * Public — anyone with the token can call this.
 *
 * Uses the `get_review_context` RPC (security definer) so we can read
 * the appointment + salon brand without going through user-scoped RLS.
 */
export async function getReviewContext(token: string): Promise<ReviewContext | null> {
  if (!token || token.length < 8) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_review_context", { p_token: token });

  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return row as ReviewContext;
}

/**
 * Submit a review for the given token. Returns:
 *   - { success: true, redirect_url } when the rating is 4–5 and the
 *     salon has a public_review_url set (caller should redirect there).
 *   - { success: true, redirect_url: null } when the review was saved
 *     internally (1–3 stars, or no public URL configured).
 *   - { error } on validation / token failures.
 */
export async function submitReview(
  token: string,
  rating: number,
  comment: string,
  wantsFollowup: boolean
): Promise<{ success: true; redirect_url: string | null } | { error: string }> {
  if (!token) return { error: "Missing review link" };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Rating must be between 1 and 5" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_review_by_token", {
    p_token: token,
    p_rating: rating,
    p_comment: comment || null,
    p_wants_followup: wantsFollowup,
  });

  if (error) return { error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    return { error: row?.error_message || "Failed to submit review" };
  }
  return { success: true, redirect_url: row.redirect_url ?? null };
}
