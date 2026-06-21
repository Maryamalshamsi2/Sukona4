"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  normalizeCode,
  todayISO,
} from "@/lib/gift-card-code";

/**
 * Gift cards — server actions.
 *
 * Selling, voiding, and listing is owner/admin only. Redemption is
 * available to any authenticated user in the salon (because staff
 * need to redeem at the payment screen). The redemption itself runs
 * through a SECURITY DEFINER RPC (`redeem_gift_card`, migration-044)
 * so staff don't need direct UPDATE on `gift_cards`.
 *
 * Code format: 12 characters drawn from an unambiguous alphabet
 * (no 0/O/1/I/L). Displayed dashed every 4 chars (ABCD-EF23-XYZ9)
 * but stored raw. Lookups normalize (strip non-alphanumeric,
 * uppercase) before querying.
 */

/** 12-char code from the unambiguous alphabet. Uses crypto.randomInt
 *  (CSPRNG) for unguessability — these codes are bearer instruments. */
function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

async function requireOwnerOrAdmin() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" } as const;
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Not authorized" } as const;
  }
  return { profile };
}

async function requireAuthed() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" } as const;
  return { profile };
}

// ============================================================
// List / read
// ============================================================

export type GiftCardStatus = "active" | "expired" | "redeemed" | "void" | "all";

/** List of gift cards for the management page. Filterable by status
 *  and (optional) sold-date range. Owner/admin only — the page itself
 *  is gated, but defense-in-depth here too.
 *
 *  'expired' isn't a real DB status — there's no nightly job flipping
 *  cards. We synthesize it: status='active' AND expires_at < today AND
 *  expires_at IS NOT NULL. The matching 'active' filter excludes
 *  expired cards so "Active" means "currently usable." */
export async function listGiftCards(
  status: GiftCardStatus = "all",
  from?: string,
  to?: string,
) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return [];

  const supabase = await createClient();
  const today = todayISO();
  let query = supabase
    .from("gift_cards")
    .select(`
      id, code, initial_amount, balance, status, expires_at,
      client_id, notes, created_by, created_at,
      clients ( id, name ),
      created_by_profile:created_by ( id, full_name )
    `)
    .order("created_at", { ascending: false });

  if (status === "expired") {
    // Active in the DB but past expiry — synthetic bucket.
    query = query
      .eq("status", "active")
      .not("expires_at", "is", null)
      .lt("expires_at", today);
  } else if (status === "active") {
    // "Currently usable": active in DB AND either no expiry set
    // or expiry is today/future. or() runs as a PostgREST OR clause.
    query = query
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gte.${today}`);
  } else if (status !== "all") {
    query = query.eq("status", status);
  }
  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);

  const { data, error } = await query;
  if (error) {
    console.error("listGiftCards failed:", error);
    return [];
  }
  return data ?? [];
}

/** Single card + full transaction history. For the detail panel. */
export async function getGiftCardDetail(id: string) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return null;

  const supabase = await createClient();
  const [cardRes, txRes] = await Promise.all([
    supabase
      .from("gift_cards")
      .select(`
        *,
        clients ( id, name ),
        created_by_profile:created_by ( id, full_name )
      `)
      .eq("id", id)
      .single(),
    supabase
      .from("gift_card_transactions")
      .select(`
        *,
        created_by_profile:created_by ( id, full_name ),
        appointments ( id, scheduled_at )
      `)
      .eq("gift_card_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (cardRes.error) {
    console.error("getGiftCardDetail card failed:", cardRes.error);
    return null;
  }
  return {
    card: cardRes.data,
    transactions: txRes.data ?? [],
  };
}

/** Look up by code — used by the payment modal. Authed (not gated to
 *  owner/admin) because staff need this for redemption. RLS keeps
 *  cross-salon lookups blocked.
 *
 *  Returns a minimal shape: id, code, balance, status, expiry, client.
 *  Does NOT return the full transaction history (staff doesn't need it
 *  during redemption). */
export async function getGiftCardByCode(rawCode: string) {
  const gate = await requireAuthed();
  if ("error" in gate) return { error: gate.error } as const;

  const code = (normalizeCode(rawCode)).trim();
  if (code.length !== CODE_LENGTH) {
    return { error: "Invalid code format" } as const;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gift_cards")
    .select(`
      id, code, initial_amount, balance, status, expires_at,
      client_id,
      clients ( id, name )
    `)
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("getGiftCardByCode failed:", error);
    return { error: "Lookup failed" } as const;
  }
  if (!data) return { error: "Gift card not found" } as const;
  return { card: data } as const;
}

// ============================================================
// Sell
// ============================================================

interface SellPayload {
  amount: number;
  purchaseMethod: "cash" | "card" | "other";
  clientId: string | null;
  expiresAt: string | null; // YYYY-MM-DD or null
  notes: string | null;
}

function validateSell(p: SellPayload): string | null {
  if (!Number.isFinite(p.amount) || p.amount <= 0) {
    return "Amount must be greater than 0";
  }
  if (!["cash", "card", "other"].includes(p.purchaseMethod)) {
    return "Invalid purchase method";
  }
  if (p.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(p.expiresAt)) {
    return "Invalid expiry date";
  }
  return null;
}

/** Create a new gift card. Generates a code; on the astronomical
 *  chance of a UNIQUE collision, retries up to 3 times.
 *
 *  Revenue is recognized at sale time (Reports reads soldTotal from
 *  the gift_card_transactions log). The 'sale' tx row IS the source
 *  of truth for the Revenue line in Reports — not the gift_card row
 *  itself — so a void doesn't retroactively reverse revenue (matching
 *  the v1 "salon keeps the cash on void" rule). */
export async function sellGiftCard(payload: SellPayload) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const v = validateSell(payload);
  if (v) return { error: v };

  const supabase = await createClient();
  const profile = gate.profile;

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode();
    const { data: card, error: insertErr } = await supabase
      .from("gift_cards")
      .insert({
        // Belt-and-suspenders: the DB DEFAULT is current_user_salon_id()
        // but we set it explicitly here too. If a future schema change
        // drops the default by mistake, this keeps inserts working
        // (the RLS WITH CHECK clause is what actually enforces tenancy).
        salon_id: profile.salon_id,
        code,
        initial_amount: payload.amount,
        balance: payload.amount,
        status: "active",
        purchase_method: payload.purchaseMethod,
        expires_at: payload.expiresAt || null,
        client_id: payload.clientId,
        notes: payload.notes?.trim() || null,
        created_by: profile.id,
      })
      .select("id, code")
      .single();

    if (insertErr) {
      // 23505 = unique_violation. Retry with a fresh code.
      if (insertErr.code === "23505") {
        lastError = insertErr.message;
        continue;
      }
      return { error: insertErr.message };
    }

    // Log the sale transaction for audit. Also THE source-of-truth
    // for the Reports gift card sales revenue line.
    const { error: txErr } = await supabase
      .from("gift_card_transactions")
      .insert({
        salon_id: profile.salon_id,
        gift_card_id: card.id,
        type: "sale",
        amount: payload.amount,
        notes: payload.notes?.trim() || null,
        created_by: profile.id,
      });
    if (txErr) {
      // Don't roll back the card — the card itself is the source
      // of truth for balance. Just log and move on.
      console.error("sellGiftCard: tx log failed:", txErr);
    }

    revalidatePath("/sales");
    revalidatePath("/reports");
    return { success: true, card } as const;
  }
  return { error: lastError ?? "Failed to generate unique code" };
}

// ============================================================
// Void
// ============================================================

/** Marks a card 'void'. No money movement — the salon handles
 *  the refund off-platform. Logs the action for audit. */
export async function voidGiftCard(id: string, reason: string | null) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();
  const { data: card, error: fetchErr } = await supabase
    .from("gift_cards")
    .select("id, status, balance")
    .eq("id", id)
    .single();
  if (fetchErr || !card) return { error: "Gift card not found" };
  if (card.status === "void") return { error: "Already void" };

  const { error: updErr } = await supabase
    .from("gift_cards")
    .update({ status: "void" })
    .eq("id", id);
  if (updErr) return { error: updErr.message };

  const { error: txErr } = await supabase
    .from("gift_card_transactions")
    .insert({
      salon_id: gate.profile.salon_id,
      gift_card_id: id,
      type: "void",
      amount: card.balance, // remaining balance at void time, for audit
      notes: reason?.trim() || null,
      created_by: gate.profile.id,
    });
  if (txErr) console.error("voidGiftCard: tx log failed:", txErr);

  revalidatePath("/sales");
  revalidatePath("/reports");
  return { success: true };
}

// ============================================================
// Delete (hard — owner/admin only)
// ============================================================

/** Hard-delete a gift card. Owner/admin only. The CASCADE on
 *  gift_card_transactions.gift_card_id wipes the card's tx history
 *  in the same operation.
 *
 *  Caveat the caller should already have warned about: this DOES
 *  retroactively change Reports revenue for the period the card was
 *  sold in, because the sale transaction is removed. Any payments
 *  rows that reference this card via the note text (e.g. "Gift card ·
 *  ABCD-EF23-XYZ9") survive — the note becomes a dangling reference
 *  but the appointment payment record stays intact. */
export async function deleteGiftCard(id: string) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("gift_cards")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/sales");
  revalidatePath("/reports");
  return { success: true };
}

// ============================================================
// Redeem (via RPC)
// ============================================================

interface RedeemPayload {
  code: string;
  amount: number;
  appointmentId: string | null;
  notes: string | null;
}

/** Redeem against an appointment. Calls the SECURITY DEFINER RPC
 *  which does the lock+check+update+log atomically. Staff are allowed
 *  here — they can't UPDATE the card directly, but the RPC runs with
 *  elevated privileges. The RPC itself enforces same-salon and all
 *  other invariants.
 *
 *  Returns the new balance so the caller can confirm to the user
 *  ("$30 redeemed, $20 remaining"). */
export async function redeemGiftCard(payload: RedeemPayload) {
  const gate = await requireAuthed();
  if ("error" in gate) return { error: gate.error };

  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    return { error: "Amount must be greater than 0" };
  }
  const code = (normalizeCode(payload.code)).trim();
  if (code.length !== CODE_LENGTH) {
    return { error: "Invalid code format" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_gift_card", {
    p_code: code,
    p_amount: payload.amount,
    p_appointment_id: payload.appointmentId,
    p_notes: payload.notes?.trim() || null,
  });

  if (error) {
    // The RPC raises with a clear message — surface verbatim.
    return { error: error.message };
  }
  // RPC returns a single row: { transaction_id, new_balance }
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/sales");
  revalidatePath("/reports");
  return {
    success: true,
    transactionId: row?.transaction_id as string,
    newBalance: Number(row?.new_balance ?? 0),
  } as const;
}

// ============================================================
// Reports summary
// ============================================================

/** For the Reports page:
 *   - `soldTotal`: revenue from gift card sales in [from, to]. This
 *     is THE gift card revenue number (recognized at sale time, per
 *     the salon owner's preference). Sums tx.amount where type='sale'.
 *   - `redeemedTotal`: total card balance applied to appointments in
 *     window. Informational ONLY — not revenue (the cash was already
 *     counted when the card was sold). Used to help reconcile the
 *     till: "of $X services billed, $Y was paid by card balance".
 *   - `outstandingLiability`: current sum of balances on all 'active'
 *     cards. Snapshot, not date-windowed. Operational ("services still
 *     owed") not accounting.
 */
export async function getReportGiftCardSummary(from: string, to: string) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) {
    return { redeemedTotal: 0, soldTotal: 0, outstandingLiability: 0 };
  }

  const supabase = await createClient();
  const today = todayISO();
  const [txRes, liabRes] = await Promise.all([
    // Join to the parent card so we can drop sales/redemptions whose
    // card was later voided. Without this filter, a sold-then-voided
    // card stays in soldTotal forever even though the salon refunded
    // it off-platform — the monthly revenue figure is permanently
    // inflated by every void.
    supabase
      .from("gift_card_transactions")
      .select("type, amount, gift_cards!inner(status)")
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`)
      .in("type", ["sale", "redemption"])
      .neq("gift_cards.status", "void"),
    // Outstanding liability = currently usable cards only. Expired
    // cards aren't a liability anymore — the salon kept the cash and
    // the customer forfeited the service. Same "no expiry OR
    // expiry >= today" predicate as the Active filter.
    supabase
      .from("gift_cards")
      .select("balance")
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gte.${today}`),
  ]);

  if (txRes.error) console.error("getReportGiftCardSummary tx:", txRes.error);
  if (liabRes.error) console.error("getReportGiftCardSummary liab:", liabRes.error);

  let redeemedTotal = 0;
  let soldTotal = 0;
  for (const row of txRes.data ?? []) {
    const amt = Number(row.amount || 0);
    if (row.type === "redemption") redeemedTotal += amt;
    else if (row.type === "sale") soldTotal += amt;
  }
  const outstandingLiability = (liabRes.data ?? []).reduce(
    (s, r) => s + Number(r.balance || 0),
    0,
  );

  return { redeemedTotal, soldTotal, outstandingLiability };
}
