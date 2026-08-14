"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";

async function requireOwnerOrAdmin() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" } as const;
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Not authorized" } as const;
  }
  return { profile };
}

const MONTH_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/** Convert "YYYY-MM" into [YYYY-MM-01, YYYY-MM-<last>] inclusive so
 *  callers can filter appointments/payments by `date >= start AND
 *  date <= end`. UAE-local — we don't need cross-timezone math for
 *  the metric aggregates, which count rows already stamped in the
 *  salon's day. */
function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate(); // day 0 of next month = last of this month
  return {
    start: `${month}-01`,
    end: `${month}-${String(last).padStart(2, "0")}`,
  };
}

// ============================================================
// Read
// ============================================================

export interface StaffMetric {
  staff_id: string;
  full_name: string;
  role: string;
  /** Existing review row for this (staff, month), if any. */
  review: {
    id: string;
    notes: string;
    updated_at: string;
    author_name: string | null;
  } | null;
  /** Auto-computed metrics for the picked month. */
  metrics: {
    appointmentsCompleted: number;
    revenueAttributed: number;
    tipsReceived: number;
    /** Retail (product) sales attributed to this staff in the month.
     *  Sum of retail_sales.amount where staff_id matches. */
    retailSales: number;
  };
}

/**
 * Load the review page for a month:
 *   - every staff profile in this salon
 *   - the review row for each (if any) for the picked month
 *   - the metric snapshot per staff for the picked month
 *
 * One page load = one function call. Metrics are computed in JS from
 * a small set of queries (appointments in window, payments in window)
 * rather than a per-staff round-trip.
 */
export async function getReviewsForMonth(month: string): Promise<{
  month: string;
  rows: StaffMetric[];
  /** True when the current viewer is admin (not owner). Drives the
   *  UI: admins see only staff rows and don't see any metric tiles;
   *  owners see staff + admin rows with tiles. */
  viewerIsAdmin: boolean;
  error?: undefined;
} | { error: string }> {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error ?? "Not authorized" };
  if (!MONTH_RE.test(month)) return { error: "Invalid month" };

  const supabase = await createClient();
  const salonId = gate.profile.salon_id;
  const viewerIsAdmin = gate.profile.role === "admin";
  const viewerId = gate.profile.id;
  const { start, end } = monthRange(month);

  // Which profile rows the caller sees:
  //   - owner: staff + admin (excluding themselves; self-review is
  //     out of scope for this page)
  //   - admin: staff only (per the spec)
  const visibleRoles: string[] = viewerIsAdmin ? ["staff"] : ["staff", "admin"];

  const [staffRes, reviewsRes, apptsRes, paysRes, retailRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("salon_id", salonId)
      .in("role", visibleRoles)
      .neq("id", viewerId)
      .order("full_name", { ascending: true }),

    supabase
      .from("performance_reviews")
      .select("id, staff_id, notes, updated_at, created_by")
      .eq("salon_id", salonId)
      .eq("month", month),

    // Appointments in window with their service lines. We use
    // appointment_services.staff_id (not appointments.staff) because
    // multi-staff appointments split the row across staff. Fetch
    // service.price too so revenue attribution doesn't need a
    // per-service round-trip.
    supabase
      .from("appointments")
      .select(`
        id, status, date,
        appointment_services (
          staff_id,
          bundle_instance_id, bundle_total_price,
          services ( price )
        )
      `)
      .eq("salon_id", salonId)
      .gte("date", start)
      .lte("date", end),

    // Payments joined to their appointment date so we can filter on
    // the appointment's day (created_at can drift for historical
    // imports). tip_amount + tip_to_staff_id drive the tip totals.
    supabase
      .from("payments")
      .select(`
        tip_amount, tip_to_staff_id,
        appointments ( date, salon_id )
      `)
      .eq("salon_id", salonId)
      .gt("tip_amount", 0)
      .gte("appointments.date", start)
      .lte("appointments.date", end),

    // Retail sales in the month — per-staff totals for the "Sales"
    // metric tile. Migration 059 makes attribution many-to-many;
    // when a sale credits N staff we split the amount equally. Rows
    // with no attribution don't contribute to any staff's tile.
    supabase
      .from("retail_sales")
      .select(`
        amount,
        sold_by_staff:retail_sale_staff ( staff_id )
      `)
      .eq("salon_id", salonId)
      .gte("sale_date", start)
      .lte("sale_date", end),
  ]);

  if (staffRes.error) return { error: staffRes.error.message };
  if (reviewsRes.error) return { error: reviewsRes.error.message };
  if (apptsRes.error) return { error: apptsRes.error.message };
  if (paysRes.error) return { error: paysRes.error.message };
  if (retailRes.error) return { error: retailRes.error.message };

  // Resolve author names for existing reviews in one lookup so the
  // "Last updated by X" line has a name to show.
  const authorIds = new Set<string>();
  for (const r of reviewsRes.data ?? []) if (r.created_by) authorIds.add(r.created_by);
  const authorMap = new Map<string, string>();
  if (authorIds.size > 0) {
    const { data: authors } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...authorIds]);
    for (const a of authors ?? []) authorMap.set(String(a.id), String(a.full_name ?? ""));
  }

  const reviewByStaff = new Map<string, (typeof reviewsRes.data)[number]>();
  for (const r of reviewsRes.data ?? []) reviewByStaff.set(String(r.staff_id), r);

  // Aggregate per staff.
  interface Agg {
    completed: number;
    revenue: number;
    tips: number;
    retail: number;
    // Bundle prices are stored on the first line-item of an instance;
    // if we naively summed appointment_services.services.price we'd
    // double-count bundle underlyings. Instead, count each bundle
    // instance's bundle_total_price once, and add plain services'
    // service.price. Track which (staff, instance) we've credited.
    countedBundleInstances: Set<string>;
  }
  const agg = new Map<string, Agg>();
  const ensure = (sid: string): Agg => {
    let a = agg.get(sid);
    if (!a) {
      a = { completed: 0, revenue: 0, tips: 0, retail: 0, countedBundleInstances: new Set() };
      agg.set(sid, a);
    }
    return a;
  };

  type ApptSvc = {
    staff_id: string | null;
    bundle_instance_id: string | null;
    bundle_total_price: number | null;
    services: { price: number | null } | { price: number | null }[] | null;
  };
  const svcPrice = (s: ApptSvc["services"]): number => {
    if (!s) return 0;
    if (Array.isArray(s)) return Number(s[0]?.price ?? 0);
    return Number(s.price ?? 0);
  };

  for (const appt of (apptsRes.data ?? []) as unknown as Array<{
    id: string;
    status: string;
    appointment_services: ApptSvc[];
  }>) {
    const isPaid = appt.status === "paid";
    // Count each staff appearing on the appointment once per
    // appointment for the "appointments completed" tally.
    const seenStaffPerAppt = new Set<string>();
    for (const as of appt.appointment_services ?? []) {
      const sid = as.staff_id;
      if (!sid) continue;
      const a = ensure(sid);
      if (!seenStaffPerAppt.has(sid)) {
        if (isPaid) a.completed += 1;
        seenStaffPerAppt.add(sid);
      }
      if (isPaid) {
        if (as.bundle_instance_id) {
          const key = `${sid}|${as.bundle_instance_id}`;
          if (!a.countedBundleInstances.has(key)) {
            a.revenue += Number(as.bundle_total_price ?? 0);
            a.countedBundleInstances.add(key);
          }
        } else {
          a.revenue += svcPrice(as.services);
        }
      }
    }
  }

  // Tips. When tip_to_staff_id is set → all tip goes to that staff.
  // When null → split equally across staff who worked on the
  // appointment (same rule payroll uses). For a small MVP we compute
  // the split by re-scanning the appointment's staff set from apptsRes.
  const staffOnAppt = new Map<string, Set<string>>();
  for (const appt of (apptsRes.data ?? []) as unknown as Array<{
    id: string; appointment_services: ApptSvc[];
  }>) {
    const set = new Set<string>();
    for (const as of appt.appointment_services ?? []) if (as.staff_id) set.add(as.staff_id);
    staffOnAppt.set(appt.id, set);
  }

  type PayRow = {
    tip_amount: number | null;
    tip_to_staff_id: string | null;
    appointments: { date: string | null } | { date: string | null }[] | null;
    /** parent's id — comes via the FK relation, but Supabase-js embed
     *  doesn't expose it unless we ask; skip for MVP, tips will only
     *  be split across staff on paid appointments in the same month
     *  which is what we already loaded. */
  };
  // Because we can't easily correlate a payment back to its
  // appointment.id here without an extra query, keep tips simple:
  // if tip_to_staff_id is set, credit that staff; otherwise credit
  // equally across all staff who worked on ANY paid appointment in
  // the month (a rough approximation). Payroll page has the exact
  // math; this page is a review snapshot, not the settlement.
  const allWorkingStaffIds = new Set<string>();
  for (const set of staffOnAppt.values()) for (const s of set) allWorkingStaffIds.add(s);

  for (const p of (paysRes.data ?? []) as unknown as PayRow[]) {
    const tip = Number(p.tip_amount ?? 0);
    if (tip <= 0) continue;
    if (p.tip_to_staff_id) {
      ensure(p.tip_to_staff_id).tips += tip;
    } else if (allWorkingStaffIds.size > 0) {
      const share = tip / allWorkingStaffIds.size;
      for (const sid of allWorkingStaffIds) ensure(sid).tips += share;
    }
  }

  // Retail sales per staff. Split each sale's amount equally across
  // its attributed staff (migration 059). Sales with no attribution
  // don't contribute anywhere.
  for (const s of (retailRes.data ?? []) as Array<{
    amount: number | null;
    sold_by_staff: Array<{ staff_id: string | null }> | null;
  }>) {
    const attributed = (s.sold_by_staff ?? [])
      .map((j) => j.staff_id)
      .filter((sid): sid is string => !!sid);
    if (attributed.length === 0) continue;
    const share = Number(s.amount ?? 0) / attributed.length;
    for (const sid of attributed) ensure(sid).retail += share;
  }

  const rows: StaffMetric[] = (staffRes.data ?? []).map((s) => {
    const r = reviewByStaff.get(String(s.id));
    const a = agg.get(String(s.id));
    return {
      staff_id: String(s.id),
      full_name: String(s.full_name ?? ""),
      role: String(s.role ?? "staff"),
      review: r
        ? {
            id: String(r.id),
            notes: String(r.notes ?? ""),
            updated_at: String(r.updated_at ?? ""),
            author_name: r.created_by ? authorMap.get(String(r.created_by)) ?? null : null,
          }
        : null,
      metrics: {
        appointmentsCompleted: a?.completed ?? 0,
        revenueAttributed: Math.round((a?.revenue ?? 0) * 100) / 100,
        tipsReceived: Math.round((a?.tips ?? 0) * 100) / 100,
        retailSales: Math.round((a?.retail ?? 0) * 100) / 100,
      },
    };
  });

  return { month, rows, viewerIsAdmin };
}

// ============================================================
// Write
// ============================================================

/**
 * Upsert a review row for (staff, month). Notes text is saved as-is
 * (trimmed on the trailing side only, so intentional trailing blank
 * lines drop). Empty notes are stored as '' — one row exists per
 * (staff, month) as soon as the owner touches the textarea.
 */
export async function upsertReview(
  staffId: string,
  month: string,
  notes: string,
) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };
  if (!MONTH_RE.test(month)) return { error: "Invalid month" };
  if (!staffId) return { error: "Missing staff id" };

  const supabase = await createClient();
  const cleaned = notes.replace(/[ \t\r]+$/gm, "").replace(/\n{3,}/g, "\n\n").trimEnd();

  const { error } = await supabase.from("performance_reviews").upsert(
    {
      salon_id: gate.profile.salon_id,
      staff_id: staffId,
      month,
      notes: cleaned,
      created_by: gate.profile.id,
    },
    { onConflict: "salon_id,staff_id,month" },
  );

  if (error) return { error: error.message };
  revalidatePath("/reviews");
  return { success: true } as const;
}
