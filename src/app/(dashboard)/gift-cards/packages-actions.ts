"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { todayISO } from "@/lib/gift-card-code";
import { finalizeAppointmentAfterPayment } from "@/lib/payment-finalization";

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
        id, service_id, bundle_id, sessions_total, sessions_used,
        services ( id, name ),
        service_bundles:bundle_id ( id, name )
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
          id, service_id, bundle_id, sessions_total, sessions_used,
          services ( id, name, price ),
          service_bundles:bundle_id ( id, name, fixed_price )
        ),
        created_by_profile:created_by ( id, full_name )
      `)
      .eq("id", id)
      .single(),
    supabase
      .from("package_redemptions")
      .select(`
        *,
        package_items (
          id,
          services ( id, name ),
          service_bundles:bundle_id ( id, name )
        ),
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

/**
 * Package item target — either a service or a bundle. Callers pass
 * one shape or the other; the server sets the corresponding column
 * (XOR is enforced by the CHECK constraint added in migration 057).
 */
export type PackageItemTarget =
  | { kind: "service"; serviceId: string }
  | { kind: "bundle"; bundleId: string };

interface SellPackagePayload {
  recipientClientId: string;       // required — who uses the sessions
  buyerClientId: string | null;    // who paid (null = same as recipient)
  totalPaid: number;
  purchaseMethod: "cash" | "card" | "other";
  expiresAt: string | null;        // YYYY-MM-DD or null
  notes: string | null;
  items: Array<PackageItemTarget & { sessions: number }>;
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
    return "Package must include at least one service or bundle";
  }
  for (const it of p.items) {
    if (it.kind === "service" && !it.serviceId) return "Each line must pick a service";
    if (it.kind === "bundle" && !it.bundleId) return "Each line must pick a bundle";
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

  // 2. Insert all items in a batch. XOR service_id / bundle_id per
  // migration 057 — the CHECK constraint blocks a row with both or
  // neither.
  const itemsPayload = payload.items.map((it) => ({
    package_id: pkg.id,
    service_id: it.kind === "service" ? it.serviceId : null,
    bundle_id: it.kind === "bundle" ? it.bundleId : null,
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

  revalidatePath("/sales");
  revalidatePath("/reports");
  return { success: true, packageId: pkg.id } as const;
}

// ============================================================
// Update
// ============================================================

interface UpdatePackagePayload {
  id: string;
  expiresAt: string | null;
  notes: string | null;
  /**
   * Full replacement list for the package's items:
   *   - existing rows carry `id`; sessions_total on those may be
   *     raised or lowered, but never below sessions_used
   *   - new rows omit `id` and get inserted
   *   - any existing item not in the list is deleted, but only
   *     when it has zero redemptions (sessions_used === 0)
   *
   * Target is either a service or a bundle (XOR, see migration 057).
   * Existing rows can also switch what they point at (service ↔ bundle,
   * or between two services / bundles), so the UI can correct a
   * miskeyed row without deleting and re-adding it.
   */
  items: Array<PackageItemTarget & { id?: string; sessions: number }>;
}

/**
 * Edit an already-sold package. Editable fields are limited to the
 * ones that don't disturb the money side: expiry, notes, and the
 * items array (add / remove-if-unused / adjust sessions_total).
 * total_paid, purchase_method, recipient, and buyer are frozen at
 * sale time — changing them retroactively would rewrite historical
 * Reports revenue and is safer as a void + resell.
 *
 * After the writes, we recompute the package status:
 *   - if every item has sessions_used == sessions_total → 'completed'
 *   - otherwise → 'active' (even if it was previously completed and
 *     the owner just added more sessions)
 * Void status is preserved — editing a void'd package is disallowed
 * upstream in the UI anyway, but the guard here is belt-and-braces.
 */
export async function updatePackage(payload: UpdatePackagePayload) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };
  if (!payload.id) return { error: "Package id is required" };
  if (payload.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(payload.expiresAt)) {
    return { error: "Invalid expiry date" };
  }
  if (!payload.items || payload.items.length === 0) {
    return { error: "Package must include at least one item" };
  }
  for (const it of payload.items) {
    if (it.kind === "service" && !it.serviceId) return { error: "Each line must pick a service" };
    if (it.kind === "bundle" && !it.bundleId) return { error: "Each line must pick a bundle" };
    if (!Number.isInteger(it.sessions) || it.sessions <= 0) {
      return { error: "Each line must have a positive number of sessions" };
    }
  }

  const supabase = await createClient();

  const { data: pkg, error: fetchErr } = await supabase
    .from("packages")
    .select("id, status")
    .eq("id", payload.id)
    .single();
  if (fetchErr || !pkg) return { error: "Package not found" };
  if (pkg.status === "void") return { error: "Cannot edit a voided package" };

  const { data: existingItems, error: itemsErr } = await supabase
    .from("package_items")
    .select("id, service_id, bundle_id, sessions_total, sessions_used")
    .eq("package_id", payload.id);
  if (itemsErr) return { error: itemsErr.message };

  const existingById = new Map(
    (existingItems ?? []).map((r) => [
      String(r.id),
      {
        serviceId: r.service_id ? String(r.service_id) : null,
        bundleId: r.bundle_id ? String(r.bundle_id) : null,
        sessionsTotal: Number(r.sessions_total),
        sessionsUsed: Number(r.sessions_used),
      },
    ]),
  );

  // Partition the incoming items. On update we set BOTH columns
  // explicitly (one to the id, the other to null) so switching an
  // item from a service to a bundle (or vice versa) writes cleanly.
  const toUpdate: Array<{ id: string; sessions_total: number; service_id: string | null; bundle_id: string | null }> = [];
  const toInsert: Array<{ package_id: string; service_id: string | null; bundle_id: string | null; sessions_total: number; sessions_used: number }> = [];
  const keepIds = new Set<string>();
  for (const it of payload.items) {
    const serviceId = it.kind === "service" ? it.serviceId : null;
    const bundleId = it.kind === "bundle" ? it.bundleId : null;
    if (it.id) {
      const existing = existingById.get(it.id);
      if (!existing) return { error: "One of the items no longer exists — refresh and try again" };
      if (it.sessions < existing.sessionsUsed) {
        return { error: `Cannot reduce sessions below ${existing.sessionsUsed} — already redeemed on this item.` };
      }
      keepIds.add(it.id);
      toUpdate.push({ id: it.id, sessions_total: it.sessions, service_id: serviceId, bundle_id: bundleId });
    } else {
      toInsert.push({
        package_id: payload.id,
        service_id: serviceId,
        bundle_id: bundleId,
        sessions_total: it.sessions,
        sessions_used: 0,
      });
    }
  }
  // Anything in existing that's not in keepIds is a removal candidate;
  // only allowed when the row has zero redemptions.
  const toDelete: string[] = [];
  for (const [id, ex] of existingById) {
    if (keepIds.has(id)) continue;
    if (ex.sessionsUsed > 0) {
      return { error: "Cannot remove an item that already has redemptions." };
    }
    toDelete.push(id);
  }

  // Parent update: expiry + notes.
  const { error: updParentErr } = await supabase
    .from("packages")
    .update({
      expires_at: payload.expiresAt,
      notes: payload.notes?.trim() || null,
    })
    .eq("id", payload.id);
  if (updParentErr) return { error: updParentErr.message };

  // Per-item updates.
  for (const u of toUpdate) {
    const { error: e } = await supabase
      .from("package_items")
      .update({
        sessions_total: u.sessions_total,
        service_id: u.service_id,
        bundle_id: u.bundle_id,
      })
      .eq("id", u.id);
    if (e) return { error: e.message };
  }
  if (toInsert.length > 0) {
    const { error: e } = await supabase.from("package_items").insert(toInsert);
    if (e) return { error: e.message };
  }
  if (toDelete.length > 0) {
    const { error: e } = await supabase.from("package_items").delete().in("id", toDelete);
    if (e) return { error: e.message };
  }

  // Re-derive status: if every remaining item is fully used, mark
  // completed; otherwise active. (Void status was rejected above.)
  const { data: after, error: afterErr } = await supabase
    .from("package_items")
    .select("sessions_total, sessions_used")
    .eq("package_id", payload.id);
  if (!afterErr && after && after.length > 0) {
    const allUsed = after.every((r) => Number(r.sessions_used) >= Number(r.sessions_total));
    const nextStatus = allUsed ? "completed" : "active";
    if (nextStatus !== pkg.status) {
      await supabase.from("packages").update({ status: nextStatus }).eq("id", payload.id);
    }
  }

  revalidatePath("/sales");
  revalidatePath("/reports");
  return { success: true } as const;
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

  revalidatePath("/sales");
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
  revalidatePath("/sales");
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
  revalidatePath("/sales");
  revalidatePath("/reports");
  return {
    success: true,
    redemptionId: row?.redemption_id as string,
    sessionsUsed: Number(row?.sessions_used ?? 0),
    sessionsRemaining: Number(row?.sessions_remaining ?? 0),
    packageCompleted: !!row?.package_completed,
  } as const;
}

interface RedeemWithPaymentPayload {
  packageItemId: string;
  appointmentId: string;
  amount: number;
  note: string;
  tipAmount: number;
  tipToStaffId: string | null;
  receiptUrls: string[];
}

/**
 * Atomic redeem + payment insert for a single package session.
 * Migration-051 RPC bundles both writes into one transaction so we
 * can't end up in the "session consumed but no payment row" failure
 * mode that the pre-launch audit flagged.
 *
 * After the RPC returns, runs the same post-payment side effects
 * recordPayment runs (status flip / review token / receipt mint /
 * activity log / WhatsApp). All idempotent — safe to retry, but
 * not bundled in the transaction because they're not the
 * money-correctness path.
 */
export async function redeemPackageSessionWithPayment(payload: RedeemWithPaymentPayload) {
  const gate = await requireAuthed();
  if ("error" in gate) return { error: gate.error };

  if (!payload.packageItemId || !payload.appointmentId) {
    return { error: "Missing package item or appointment id" };
  }
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    return { error: "Amount must be positive" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "redeem_package_session_with_payment",
    {
      p_package_item_id: payload.packageItemId,
      p_appointment_id: payload.appointmentId,
      p_amount: payload.amount,
      p_note: payload.note,
      p_tip_amount: payload.tipAmount || 0,
      p_tip_to_staff_id: payload.tipToStaffId,
      p_receipt_urls: payload.receiptUrls,
    },
  );

  if (error) return { error: error.message };
  const row = Array.isArray(data) ? data[0] : data;

  // Post-payment side effects. The payment row is already in. If
  // the status flip fails (RLS, etc.), surface a partial-success
  // error message — the redemption + payment are safe, the
  // appointment just shows pre-paid state.
  const finalize = await finalizeAppointmentAfterPayment(supabase, payload.appointmentId);
  if (finalize.error) return { error: finalize.error };

  revalidatePath("/sales");
  revalidatePath("/reports");
  revalidatePath("/calendar");
  revalidatePath("/payroll");
  revalidatePath("/");
  return {
    success: true,
    paymentId: row?.out_payment_id as string,
    redemptionId: row?.out_redemption_id as string,
    sessionsUsed: Number(row?.out_sessions_used ?? 0),
    sessionsRemaining: Number(row?.out_sessions_remaining ?? 0),
    packageCompleted: !!row?.out_package_completed,
  } as const;
}

// ============================================================
// MarkPaidModal helper — applicable packages for an appointment
// ============================================================

/** For MarkPaidModal: returns one "applicable line" per appointment
 *  service where a matching, active, non-expired package item has
 *  sessions remaining for the appointment's client.
 *
 *  Match is by exact service_id (the owner's choice in scoping).
 *  Auto-picks the package_item to apply when multiple match — uses
 *  earliest expiry first, then earliest created package. The staff
 *  can choose whether to apply each line via a checkbox; they don't
 *  pick between candidate packages for the same service (kept simple
 *  for v1 — the common case is one active package per service).
 *
 *  Returns an array (possibly empty) so the modal can just check
 *  length to decide whether to render the section. */
export async function getAppointmentPackageContext(appointmentId: string) {
  const gate = await requireAuthed();
  if ("error" in gate) return [];
  if (!appointmentId) return [];

  const supabase = await createClient();

  // 1. Load the appointment + its service lines + the client_id.
  const { data: appt, error: apptErr } = await supabase
    .from("appointments")
    .select(`
      id, client_id,
      appointment_services (
        id, service_id,
        services ( id, name, price )
      )
    `)
    .eq("id", appointmentId)
    .single();

  if (apptErr || !appt || !appt.client_id) {
    if (apptErr) console.error("getAppointmentPackageContext appt:", apptErr);
    return [];
  }

  type ApptSvc = {
    id: string;
    service_id: string | null;
    services: { id: string; name: string; price: number } | null;
  };
  const apptServices = (appt.appointment_services ?? []) as unknown as ApptSvc[];
  if (apptServices.length === 0) return [];

  // 2. Load client's active, non-expired packages with their items.
  const today = todayISO();
  const { data: packages, error: pkgErr } = await supabase
    .from("packages")
    .select(`
      id, expires_at, status, created_at,
      recipient:recipient_client_id ( id, name ),
      package_items ( id, service_id, sessions_total, sessions_used )
    `)
    .eq("recipient_client_id", appt.client_id)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gte.${today}`)
    .order("expires_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (pkgErr) {
    console.error("getAppointmentPackageContext packages:", pkgErr);
    return [];
  }

  type PkgRow = {
    id: string;
    expires_at: string | null;
    status: string;
    created_at: string;
    recipient: { id: string; name: string } | { id: string; name: string }[] | null;
    package_items: Array<{
      id: string;
      service_id: string;
      sessions_total: number;
      sessions_used: number;
    }>;
  };
  const pkgs = (packages ?? []) as unknown as PkgRow[];

  // 3. For each appointment service, find the first matching package
  //    item with sessions remaining. Track per-item remaining counts
  //    so we don't over-allocate if the same package can cover
  //    multiple appointment lines.
  const remaining: Record<string, number> = {};
  for (const pkg of pkgs) {
    for (const it of pkg.package_items) {
      remaining[it.id] = it.sessions_total - it.sessions_used;
    }
  }

  const applicable: Array<{
    apptServiceId: string;
    serviceId: string;
    serviceName: string;
    servicePrice: number;
    packageItemId: string;
    packageId: string;
    recipientName: string | null;
    expiresAt: string | null;
  }> = [];

  for (const apptSvc of apptServices) {
    if (!apptSvc.service_id || !apptSvc.services) continue;
    // First package whose items include this service AND has sessions
    // remaining on that item.
    for (const pkg of pkgs) {
      const matchItem = pkg.package_items.find(
        (it) => it.service_id === apptSvc.service_id && remaining[it.id] > 0,
      );
      if (matchItem) {
        const recipientObj = Array.isArray(pkg.recipient) ? pkg.recipient[0] : pkg.recipient;
        applicable.push({
          apptServiceId: apptSvc.id,
          serviceId: apptSvc.service_id,
          serviceName: apptSvc.services.name,
          servicePrice: Number(apptSvc.services.price || 0),
          packageItemId: matchItem.id,
          packageId: pkg.id,
          recipientName: recipientObj?.name ?? null,
          expiresAt: pkg.expires_at,
        });
        // Reserve this session locally so a duplicate appointment
        // line doesn't double-pick the same item.
        remaining[matchItem.id] -= 1;
        break;
      }
    }
  }

  return applicable;
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
      // Exclude voided packages — they were refunded and shouldn't
      // count as revenue. Without this filter a single accidental
      // void looks like a phantom sale in the monthly report and
      // bakes a wrong revenue figure into the owner's tax records.
      .neq("status", "void")
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
