"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { todayISO } from "@/lib/gift-card-code";

/**
 * Packages — server actions.
 *
 * Selling, voiding, deleting, and listing is owner/admin only. The
 * Mark-as-Paid lookup (getPackagesForClient) is open to any authed
 * user since staff need it at payment time. Redemption itself runs
 * through the SECURITY DEFINER RPC (`redeem_package_session`,
 * migration-046) so staff can decrement without direct UPDATE on
 * package_items.
 *
 * Revenue is recognized at SALE time (matches the gift card model):
 * the cash hits the till on sell day and gets booked then.
 * Redemption days log session usage but don't add revenue — Reports
 * sums `packages.total_paid` for the window, NOT redemption rows.
 */

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

export type PackageStatus = "active" | "expired" | "completed" | "void" | "all";

/** List packages for the management tab. 'expired' is synthesized
 *  (same pattern as gift cards) — status='active' AND expiry past. */
export async function listPackages(status: PackageStatus = "all") {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return [];

  const supabase = await createClient();
  const today = todayISO();
  let query = supabase
    .from("packages")
    .select(`
      id, status, total_paid, purchase_method, expires_at,
      buyer_client_id, recipient_client_id, notes, created_by, created_at,
      buyer:buyer_client_id ( id, name ),
      recipient:recipient_client_id ( id, name ),
      package_items (
        id, service_id, sessions_total, sessions_used,
        services ( id, name )
      ),
      created_by_profile:created_by ( id, full_name )
    `)
    .order("created_at", { ascending: false });

  if (status === "expired") {
    query = query
      .eq("status", "active")
      .not("expires_at", "is", null)
      .lt("expires_at", today);
  } else if (status === "active") {
    query = query
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gte.${today}`);
  } else if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("listPackages failed:", error);
    return [];
  }
  return data ?? [];
}

/** Single package with full history. For the detail panel. */
export async function getPackageDetail(id: string) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return null;

  const supabase = await createClient();
  const [pkgRes, redemptionsRes] = await Promise.all([
    supabase
      .from("packages")
      .select(`
        *,
        buyer:buyer_client_id ( id, name ),
        recipient:recipient_client_id ( id, name ),
        package_items (
          id, service_id, sessions_total, sessions_used,
          services ( id, name, price )
        ),
        created_by_profile:created_by ( id, full_name )
      `)
      .eq("id", id)
      .single(),
    supabase
      .from("package_redemptions")
      .select(`
        *,
        package_items ( id, services ( id, name ) ),
        appointments ( id, date, time ),
        created_by_profile:created_by ( id, full_name )
      `)
      .eq("package_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (pkgRes.error) {
    console.error("getPackageDetail package failed:", pkgRes.error);
    return null;
  }
  return {
    package: pkgRes.data,
    redemptions: redemptionsRes.data ?? [],
  };
}

/** Active packages for a client at Mark-as-Paid time. Returns only
 *  those with at least one session remaining on at least one item,
 *  not voided/completed, not expired. Used by MarkPaidModal to show
 *  "Use package" checkboxes inline.
 *
 *  Returns a flat list of per-ITEM rows (not per-package) since each
 *  item is independently redeemable — the modal renders one checkbox
 *  per service-line. */
export async function getPackagesForClient(clientId: string) {
  const gate = await requireAuthed();
  if ("error" in gate) return [];
  if (!clientId) return [];

  const supabase = await createClient();
  const today = todayISO();
  const { data, error } = await supabase
    .from("packages")
    .select(`
      id, expires_at, status, total_paid,
      package_items (
        id, service_id, sessions_total, sessions_used,
        services ( id, name )
      )
    `)
    .eq("recipient_client_id", clientId)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gte.${today}`);

  if (error) {
    console.error("getPackagesForClient failed:", error);
    return [];
  }
  return data ?? [];
}

// ============================================================
// Sell
// ============================================================

interface SellPackagePayload {
  recipientClientId: string;       // required — who uses the sessions
  buyerClientId: string | null;    // who paid (null = same as recipient)
  totalPaid: number;
  purchaseMethod: "cash" | "card" | "other";
  expiresAt: string | null;        // YYYY-MM-DD or null
  notes: string | null;
  items: Array<{
    serviceId: string;
    sessions: number;              // sessions_total
  }>;
}

function validateSell(p: SellPackagePayload): string | null {
  if (!p.recipientClientId) return "Recipient is required";
  if (!Number.isFinite(p.totalPaid) || p.totalPaid < 0) {
    return "Total paid must be 0 or greater";
  }
  if (!["cash", "card", "other"].includes(p.purchaseMethod)) {
    return "Invalid purchase method";
  }
  if (p.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(p.expiresAt)) {
    return "Invalid expiry date";
  }
  if (!p.items || p.items.length === 0) {
    return "Package must include at least one service";
  }
  for (const it of p.items) {
    if (!it.serviceId) return "Each line must pick a service";
    if (!Number.isInteger(it.sessions) || it.sessions <= 0) {
      return "Each line must have a positive number of sessions";
    }
  }
  return null;
}

/** Create a new package. Inserts the parent row, then items in a
 *  single batch. If the items insert fails the orphan package is
 *  deleted so we don't leave dangling parents (Supabase JS doesn't
 *  expose multi-statement transactions; this is the best-effort
 *  rollback). */
export async function sellPackage(payload: SellPackagePayload) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const v = validateSell(payload);
  if (v) return { error: v };

  const supabase = await createClient();
  const profile = gate.profile;

  // 1. Insert the parent package.
  const { data: pkg, error: pkgErr } = await supabase
    .from("packages")
    .insert({
      salon_id: profile.salon_id,
      buyer_client_id:
        payload.buyerClientId ?? payload.recipientClientId,
      recipient_client_id: payload.recipientClientId,
      status: "active",
      total_paid: payload.totalPaid,
      purchase_method: payload.purchaseMethod,
      expires_at: payload.expiresAt || null,
      notes: payload.notes?.trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (pkgErr || !pkg) {
    return { error: pkgErr?.message || "Failed to create package" };
  }

  // 2. Insert all items in a batch.
  const itemsPayload = payload.items.map((it) => ({
    package_id: pkg.id,
    service_id: it.serviceId,
    sessions_total: it.sessions,
    sessions_used: 0,
  }));

  const { error: itemsErr } = await supabase
    .from("package_items")
    .insert(itemsPayload);

  if (itemsErr) {
    // Best-effort rollback of the orphan parent.
    await supabase.from("packages").delete().eq("id", pkg.id);
    return { error: itemsErr.message };
  }

  revalidatePath("/gift-cards");
  revalidatePath("/reports");
  return { success: true, packageId: pkg.id } as const;
}

// ============================================================
// Void
// ============================================================

/** Marks a package 'void'. No money movement (matches gift card
 *  semantics — salon handles refund off-platform). Remaining sessions
 *  can no longer be redeemed.
 *
 *  Reason is appended to the package's notes column as
 *  `[Voided: <reason>]` so it shows up in the detail panel. We don't
 *  have a dedicated audit table for packages (gift cards have
 *  gift_card_transactions; packages don't need an equivalent for v1
 *  since redemptions ARE the timeline). */
export async function voidPackage(id: string, reason: string | null) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();
  const { data: pkg, error: fetchErr } = await supabase
    .from("packages")
    .select("id, status, notes")
    .eq("id", id)
    .single();
  if (fetchErr || !pkg) return { error: "Package not found" };
  if (pkg.status === "void") return { error: "Already void" };
  if (pkg.status === "completed") {
    return { error: "Package is already fully redeemed" };
  }

  // Append the void reason to notes if provided; never destroys
  // existing notes content.
  const trimmedReason = reason?.trim();
  const nextNotes = trimmedReason
    ? [pkg.notes, `[Voided: ${trimmedReason}]`].filter(Boolean).join("\n")
    : pkg.notes;

  const { error: updErr } = await supabase
    .from("packages")
    .update({ status: "void", notes: nextNotes })
    .eq("id", id);
  if (updErr) return { error: updErr.message };

  revalidatePath("/gift-cards");
  revalidatePath("/reports");
  return { success: true };
}

// ============================================================
// Delete (hard — owner/admin only)
// ============================================================

/** Hard-delete a package. CASCADE on package_items + redemptions
 *  wipes the full history. Caveat (same as deleteGiftCard): this
 *  retroactively removes the sale from Reports for that period. */
export async function deletePackage(id: string) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("packages")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/gift-cards");
  revalidatePath("/reports");
  return { success: true };
}

// ============================================================
// Redeem (via RPC)
// ============================================================

interface RedeemPayload {
  packageItemId: string;
  appointmentId: string | null;
  notes: string | null;
}

/** Decrement one session from a package item. Calls the SECURITY
 *  DEFINER RPC which atomically: locks the row, validates active/
 *  not-expired/sessions-remaining, increments sessions_used by one,
 *  inserts a redemptions row, and flips the parent package to
 *  'completed' when the last session drains. */
export async function redeemPackageSession(payload: RedeemPayload) {
  const gate = await requireAuthed();
  if ("error" in gate) return { error: gate.error };

  if (!payload.packageItemId) {
    return { error: "Missing package item id" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_package_session", {
    p_package_item_id: payload.packageItemId,
    p_appointment_id: payload.appointmentId,
    p_notes: payload.notes?.trim() || null,
  });

  if (error) return { error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/gift-cards");
  revalidatePath("/reports");
  return {
    success: true,
    redemptionId: row?.redemption_id as string,
    sessionsUsed: Number(row?.sessions_used ?? 0),
    sessionsRemaining: Number(row?.sessions_remaining ?? 0),
    packageCompleted: !!row?.package_completed,
  } as const;
}

// ============================================================
// Reports summary
// ============================================================

/** For the Reports page:
 *   - `soldTotal`: revenue from package sales in [from, to]. The
 *     gift-card-style sale-time recognition: sum of `total_paid`
 *     across packages whose created_at falls in the window.
 *   - `sessionsApplied`: count of redemptions in the window —
 *     informational, not revenue. Used in the audit subline so
 *     owners can square the till.
 *   - `outstandingSessions`: sum of (sessions_total - sessions_used)
 *     across all ACTIVE non-expired packages. Snapshot — informational.
 */
export async function getReportPackageSummary(from: string, to: string) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) {
    return { soldTotal: 0, sessionsApplied: 0, outstandingSessions: 0 };
  }

  const supabase = await createClient();
  const today = todayISO();
  const [salesRes, redemptionsRes, outstandingRes] = await Promise.all([
    supabase
      .from("packages")
      .select("total_paid")
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`),
    supabase
      .from("package_redemptions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`),
    supabase
      .from("packages")
      .select("package_items ( sessions_total, sessions_used )")
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gte.${today}`),
  ]);

  if (salesRes.error) console.error("getReportPackageSummary sales:", salesRes.error);
  if (redemptionsRes.error) console.error("getReportPackageSummary tx:", redemptionsRes.error);
  if (outstandingRes.error) console.error("getReportPackageSummary outstanding:", outstandingRes.error);

  const soldTotal = (salesRes.data ?? []).reduce(
    (s, r) => s + Number(r.total_paid || 0),
    0,
  );
  const sessionsApplied = redemptionsRes.count ?? 0;
  const outstandingSessions = (outstandingRes.data ?? []).reduce(
    (sum, pkg) => {
      const items = pkg.package_items as
        | Array<{ sessions_total: number; sessions_used: number }>
        | null;
      if (!items) return sum;
      return (
        sum +
        items.reduce(
          (s, it) => s + (it.sessions_total - it.sessions_used),
          0,
        )
      );
    },
    0,
  );

  return { soldTotal, sessionsApplied, outstandingSessions };
}
