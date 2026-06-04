"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { canUsePayroll, type Plan } from "@/lib/plan";

/**
 * Payroll v1 — server actions used by the /payroll page.
 *
 * Conceptual model — for each staff member in the salon, in a given
 * month:
 *
 *   services_revenue = Σ services.price for appointment_services where
 *                        the staff is the assignee AND the appointment
 *                        date falls in the month AND the appointment
 *                        is 'paid'
 *
 *   target           = base_salary × target_multiplier  (migration-039)
 *                        — the revenue the staff must hit before
 *                        commission kicks in. With multiplier=0 the
 *                        target is 0, so commission applies to all
 *                        revenue (old behavior preserved).
 *
 *   excess           = max(0, services_revenue − target)
 *
 *   commission       = excess × commission_percent / 100
 *
 *   tips             = Σ payment.tip_amount where:
 *                        - tip_to_staff_id = this staff (explicit), OR
 *                        - tip_to_staff_id IS NULL  →  split equally
 *                          across the unique staff who did services
 *                          on that appointment
 *
 *   bonuses          = Σ staff_adjustments.amount where type='bonus'
 *                        AND adjustment_date in month
 *
 *   deductions       = Σ staff_adjustments.amount where type='deduction'
 *                        AND adjustment_date in month
 *
 *   net              = base_salary + commission + tips + bonuses − deductions
 *
 * Filter by appointment.date (when the work happened), not payments
 * .created_at — keeps the monthly view aligned with "what shifts the
 * staff worked this month."
 *
 * Owner-only — every action re-checks profile.role at the top. RLS
 * already gates the staff_adjustments table, but the data we expose
 * from /payroll (joined revenue, tip splits) lives across tables
 * normal staff can read for their own purposes. So the gate is in
 * the action.
 */

type Role = "owner" | "admin" | "staff";

// ---------- Shapes returned to the client ----------

export interface PayrollStaffRow {
  staffId: string;
  fullName: string;
  role: Role;
  baseSalary: number;
  commissionPercent: number;
  /** Migration-039 — multiplier × salary = target. 0 means "no target". */
  targetMultiplier: number;
  /** Convenience: baseSalary × targetMultiplier. Surfaced so the UI
   *  can show the target without re-multiplying client-side. */
  target: number;
  servicesRevenue: number;
  /** services_revenue ≥ target portion. Always 0 when target is 0. */
  revenueAboveTarget: number;
  commission: number;
  tips: number;
  bonuses: number;
  deductions: number;
  net: number;
}

export interface PayrollServiceLine {
  appointmentId: string;
  date: string;
  serviceName: string;
  /** Bundle-aware effective price (the row's share of the bundle's
   *  total, NOT the service's list price). For non-bundle rows this
   *  equals the service's list price. See effectivePrice() in actions. */
  price: number;
  /** When the row came from a bundle, the bundle's display name. UI
   *  surfaces it as a small "from <bundleName>" caption so the staff
   *  can see why the price differs from the catalog price. Null for
   *  raw (non-bundle) services. */
  bundleName: string | null;
}

export interface PayrollTipLine {
  appointmentId: string;
  date: string;
  amount: number;
  /** True when this share came from a split (NULL tip_to_staff_id), false
   *  when the customer explicitly attributed the tip to this staff. */
  split: boolean;
}

export interface PayrollAdjustmentLine {
  id: string;
  type: "bonus" | "deduction";
  amount: number;
  reason: string;
  adjustmentDate: string;
}

export interface PayrollDetail {
  staffId: string;
  fullName: string;
  role: Role;
  month: string;
  baseSalary: number;
  commissionPercent: number;
  targetMultiplier: number;
  /** baseSalary × targetMultiplier — surfaced once so the UI doesn't
   *  have to know the formula. */
  target: number;
  services: PayrollServiceLine[];
  tips: PayrollTipLine[];
  adjustments: PayrollAdjustmentLine[];
  totals: {
    servicesRevenue: number;
    /** Always 0 when target is 0. */
    revenueAboveTarget: number;
    commission: number;
    tips: number;
    bonuses: number;
    deductions: number;
    net: number;
  };
}

// ---------- Helpers ----------

/**
 * Owner + plan gate. Returns the profile when allowed; an error object
 * when not.
 *
 * Two checks, in order:
 *   1. Role: must be owner.
 *   2. Plan: payroll requires Team or Multi-Team. is_exempt salons
 *      (migration-035 — founder/demo accounts) bypass the plan check.
 *
 * The /payroll page itself short-circuits to the UpgradeBlock before
 * any action runs, so a happy-path user never sees the "Payroll
 * isn't on your plan" error. This is defense-in-depth: a crafted
 * client call (e.g. directly invoking the server action from devtools)
 * still gets rejected.
 */
async function requireOwner() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" } as const;
  if (profile.role !== "owner") return { error: "Not authorized" } as const;

  const supabase = await createClient();
  const { data: salon } = await supabase
    .from("salons")
    .select("plan, is_exempt")
    .eq("id", profile.salon_id)
    .single();
  const plan = (salon?.plan as Plan | undefined) ?? "solo";
  const isExempt = !!salon?.is_exempt;
  if (!isExempt && !canUsePayroll(plan)) {
    return {
      error: "Payroll isn't included on your plan. Upgrade to Team to unlock it.",
    } as const;
  }
  return { profile };
}

/** Convert "2026-05" to { firstDay: "2026-05-01", lastDay: "2026-05-31" }. */
function monthBoundaries(month: string) {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) throw new Error(`Invalid month: ${month}`);
  // Day 0 of next month = last day of this month (handles 28/29/30/31)
  const lastDate = new Date(y, m, 0).getDate();
  return {
    firstDay: `${y}-${String(m).padStart(2, "0")}-01`,
    lastDay: `${y}-${String(m).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`,
  };
}

interface AppointmentRow {
  id: string;
  date: string;
  status: string;
  appointment_services: Array<{
    id: string;
    staff_id: string | null;
    services: { id: string; name: string; price: number } | null;
    /** Migration-025 bundle fields. Both NULL means "raw service,
     *  not part of a bundle." When set, the effective price for
     *  payroll is a proportional share of bundle_total_price (see
     *  effectivePrice below), not the service's list price. */
    bundle_instance_id: string | null;
    bundle_total_price: number | null;
    bundle_name: string | null;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    tip_amount: number | null;
    tip_to_staff_id: string | null;
  }>;
}

interface ProfileRow {
  id: string;
  full_name: string;
  role: Role;
  salary: number | null;
  commission_percent: number | null;
  target_multiplier: number | null;
  /** team_group this staff belongs to. Used for the v1.7 team filter
   *  on /payroll — when a team is selected, only profiles with this
   *  matching group_id are included in the summary. */
  group_id: string | null;
}

interface AdjustmentRow {
  id: string;
  staff_id: string;
  type: "bonus" | "deduction";
  amount: number;
  reason: string;
  adjustment_date: string;
}

/** Single trip to Supabase — pull every row we need to compute one
 *  month of payroll. JS does the rest. */
async function fetchMonthData(salonId: string, month: string) {
  const supabase = await createClient();
  const { firstDay, lastDay } = monthBoundaries(month);

  const [profilesRes, apptsRes, adjustmentsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, salary, commission_percent, target_multiplier, group_id")
      .eq("salon_id", salonId),
    supabase
      .from("appointments")
      .select(
        `
        id, date, status,
        appointment_services (
          id, staff_id,
          bundle_instance_id, bundle_total_price, bundle_name,
          services:service_id ( id, name, price )
        ),
        payments ( id, amount, tip_amount, tip_to_staff_id )
      `,
      )
      .eq("salon_id", salonId)
      .eq("status", "paid")
      .gte("date", firstDay)
      .lte("date", lastDay),
    supabase
      .from("staff_adjustments")
      .select("id, staff_id, type, amount, reason, adjustment_date")
      .eq("salon_id", salonId)
      .gte("adjustment_date", firstDay)
      .lte("adjustment_date", lastDay),
  ]);

  // Re-throw as a real Error so the .catch in the public actions can
  // pull a clean `.message`. Supabase errors are plain objects
  // ({ message, code, details, hint }) — without wrapping, the
  // `err instanceof Error ? err.message : String(err)` fallback
  // resolves to the string "[object Object]" instead of the real
  // message.
  if (profilesRes.error) throw new Error(`profiles: ${profilesRes.error.message}`);
  if (apptsRes.error) throw new Error(`appointments: ${apptsRes.error.message}`);
  if (adjustmentsRes.error) throw new Error(`adjustments: ${adjustmentsRes.error.message}`);

  // Normalise Supabase's tendency to return joined rows as either
  // object or array depending on inferred cardinality.
  const appts: AppointmentRow[] = (apptsRes.data ?? []).map(
    (a: Record<string, unknown>) => ({
      id: a.id as string,
      date: a.date as string,
      status: a.status as string,
      appointment_services: ((a.appointment_services as unknown[]) ?? []).map(
        (as) => {
          const r = as as {
            id: string;
            staff_id: string | null;
            services: unknown;
            bundle_instance_id: string | null;
            bundle_total_price: number | string | null;
            bundle_name: string | null;
          };
          const svc = Array.isArray(r.services) ? r.services[0] : r.services;
          return {
            id: r.id,
            staff_id: r.staff_id,
            services: svc
              ? {
                  id: (svc as { id: string }).id,
                  name: (svc as { name: string }).name,
                  price: Number((svc as { price: number }).price) || 0,
                }
              : null,
            bundle_instance_id: r.bundle_instance_id,
            bundle_total_price:
              r.bundle_total_price != null ? Number(r.bundle_total_price) : null,
            bundle_name: r.bundle_name,
          };
        },
      ),
      payments: ((a.payments as unknown[]) ?? []).map((p) => {
        const r = p as { id: string; amount: number; tip_amount: number | null; tip_to_staff_id: string | null };
        return {
          id: r.id,
          amount: Number(r.amount) || 0,
          tip_amount: r.tip_amount != null ? Number(r.tip_amount) : 0,
          tip_to_staff_id: r.tip_to_staff_id,
        };
      }),
    }),
  );

  return {
    profiles: (profilesRes.data ?? []) as ProfileRow[],
    appointments: appts,
    adjustments: (adjustmentsRes.data ?? []) as AdjustmentRow[],
  };
}

/**
 * Bundle-aware effective price per appointment_service row.
 *
 * Non-bundle row → uses the service's list price as-is.
 *
 * Bundle row → the row gets a proportional share of bundle_total_price,
 * weighted by the row's list price within the bundle instance. So a
 * "Mani & Pedi" bundle priced at 195 splits across:
 *
 *   Mani share = (95 / (95 + 110)) × 195 = 90.37
 *   Pedi share = (110 / (95 + 110)) × 195 = 104.63
 *
 * Sums back to exactly 195, no rounding drift across the appointment.
 *
 * Caller passes the per-instance metadata (total list + bundle total)
 * already computed once per appointment, so this is O(1) per call.
 *
 * Fallbacks (any of these → use list price as-is):
 *   - bundle_instance_id is null (not part of a bundle)
 *   - bundle_total_price is null or 0 (legacy row pre-migration-025)
 *   - sum of list prices in the instance is 0 (would divide by zero)
 */
function effectivePrice(
  as: AppointmentRow["appointment_services"][number],
  bundleMeta: Map<string, { sumListPrices: number; bundleTotal: number }>,
): number {
  const listPrice = as.services?.price ?? 0;
  if (!as.bundle_instance_id) return listPrice;
  const meta = bundleMeta.get(as.bundle_instance_id);
  if (!meta || meta.sumListPrices <= 0 || meta.bundleTotal <= 0) {
    return listPrice;
  }
  return (listPrice / meta.sumListPrices) * meta.bundleTotal;
}

/** One pass over an appointment's services to build the bundle-instance
 *  lookup table this appointment's payroll math will need.
 *  `bundle_total_price` is stamped on every row of the same instance
 *  (with the same value — see migration-025 + calendar/actions.ts), so
 *  we take whichever non-null value we see first. */
function bundleMetaFor(a: AppointmentRow) {
  const m = new Map<string, { sumListPrices: number; bundleTotal: number }>();
  for (const as of a.appointment_services) {
    if (!as.bundle_instance_id) continue;
    const cur = m.get(as.bundle_instance_id) ?? { sumListPrices: 0, bundleTotal: 0 };
    cur.sumListPrices += as.services?.price ?? 0;
    if (cur.bundleTotal === 0 && as.bundle_total_price != null) {
      cur.bundleTotal = as.bundle_total_price;
    }
    m.set(as.bundle_instance_id, cur);
  }
  return m;
}

/** Tip math — given the set of payments on an appointment + the set of
 *  unique staff who did services, return a map of staffId → tip share.
 *
 *  Logic:
 *    - Explicit tip (tip_to_staff_id set) goes 100% to that staff
 *    - Implicit tip (NULL) splits equally across `staffOnAppt`
 *    - If staffOnAppt is empty for a NULL tip, the tip is dropped
 *      (rare — appointment with no assigned staff) */
function tipShares(
  payments: AppointmentRow["payments"],
  staffOnAppt: string[],
): Map<string, { explicit: number; split: number }> {
  const shares = new Map<string, { explicit: number; split: number }>();
  const add = (id: string, kind: "explicit" | "split", amount: number) => {
    const cur = shares.get(id) ?? { explicit: 0, split: 0 };
    cur[kind] += amount;
    shares.set(id, cur);
  };
  for (const p of payments) {
    const tip = p.tip_amount ?? 0;
    if (tip <= 0) continue;
    if (p.tip_to_staff_id) {
      add(p.tip_to_staff_id, "explicit", tip);
    } else if (staffOnAppt.length > 0) {
      const each = tip / staffOnAppt.length;
      for (const sid of staffOnAppt) add(sid, "split", each);
    }
  }
  return shares;
}

// ---------- Public actions ----------

/** Summary table — one row per staff for the given month.
 *
 *  Multi-Team v1.7: optional `teamId` narrows the result to staff
 *  whose group_id matches that team. Tips, services, adjustments
 *  cascade from the filtered staff set, so all the per-row math
 *  stays correct (a non-team staff doing a service contributes
 *  nothing to a team-scoped view, by design). */
export async function getPayrollSummary(
  month: string,
  teamId?: string | null,
): Promise<{ rows: PayrollStaffRow[]; error?: string }> {
  const gate = await requireOwner();
  if ("error" in gate) return { rows: [], error: gate.error };

  let data;
  try {
    data = await fetchMonthData(gate.profile.salon_id, month);
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }

  // Scope the profile list before we accumulate. Filtering at the
  // start (vs. dropping rows at the end) means we don't sum up
  // services revenue / tips for staff we'll discard — slightly
  // faster, and the unused-but-non-zero accumulator can never
  // visually leak into a team's totals.
  if (teamId) {
    data = {
      ...data,
      profiles: data.profiles.filter((p) => p.group_id === teamId),
    };
  }

  // Initialise per-staff accumulators. We include EVERY salon member,
  // even ones with no work in the month, so the owner sees a row
  // (with 0 revenue + maybe base salary). They can ignore the row
  // by sorting or simply skipping it.
  //
  // target / revenueAboveTarget are filled in at the very end (once
  // servicesRevenue is finalised) because they depend on the full
  // sum, not the running one.
  const accum = new Map<
    string,
    Omit<PayrollStaffRow, "commission" | "net" | "target" | "revenueAboveTarget">
  >();
  for (const p of data.profiles) {
    accum.set(p.id, {
      staffId: p.id,
      fullName: p.full_name || "Unnamed",
      role: p.role,
      baseSalary: Number(p.salary) || 0,
      commissionPercent: Number(p.commission_percent) || 0,
      targetMultiplier: Number(p.target_multiplier) || 0,
      servicesRevenue: 0,
      tips: 0,
      bonuses: 0,
      deductions: 0,
    });
  }

  // Services revenue + tips, walked once per appointment.
  for (const a of data.appointments) {
    // Pre-compute bundle-instance metadata for this appointment so
    // effectivePrice() is O(1) per row (vs. O(n) per call).
    const bundleMeta = bundleMetaFor(a);

    const staffOnAppt = Array.from(
      new Set(
        a.appointment_services
          .map((as) => as.staff_id)
          .filter((s): s is string => !!s),
      ),
    );

    for (const as of a.appointment_services) {
      if (!as.staff_id || !as.services) continue;
      const row = accum.get(as.staff_id);
      if (!row) continue; // staff not in current profiles (deleted?)
      // Bundle-aware: a bundled row credits the staff with their
      // proportional share of the bundle's effective price, not the
      // service's full list price (which would over-count revenue
      // by the bundle's discount).
      row.servicesRevenue += effectivePrice(as, bundleMeta);
    }

    const shares = tipShares(a.payments, staffOnAppt);
    for (const [sid, s] of shares) {
      const row = accum.get(sid);
      if (!row) continue;
      row.tips += s.explicit + s.split;
    }
  }

  // Adjustments
  for (const adj of data.adjustments) {
    const row = accum.get(adj.staff_id);
    if (!row) continue;
    if (adj.type === "bonus") row.bonuses += Number(adj.amount) || 0;
    else row.deductions += Number(adj.amount) || 0;
  }

  // Compute target / above-target / commission / net last, after
  // revenue is finalised. The threshold formula:
  //   target            = base × multiplier (0 disables → behave as old % model)
  //   revenueAboveTarget= max(0, revenue − target)
  //   commission        = revenueAboveTarget × commission% / 100
  const rows: PayrollStaffRow[] = Array.from(accum.values()).map((r) => {
    const target = r.baseSalary * r.targetMultiplier;
    const revenueAboveTarget = Math.max(0, r.servicesRevenue - target);
    const commission = (revenueAboveTarget * r.commissionPercent) / 100;
    const net = r.baseSalary + commission + r.tips + r.bonuses - r.deductions;
    return { ...r, target, revenueAboveTarget, commission, net };
  });

  // Default sort: net descending so the top earners surface first.
  rows.sort((a, b) => b.net - a.net);

  return { rows };
}

/** Drill-down — list every service / tip / adjustment for one staff
 *  in the given month, plus the rolled-up totals. */
export async function getStaffPayrollDetail(
  staffId: string,
  month: string,
): Promise<{ detail: PayrollDetail | null; error?: string }> {
  const gate = await requireOwner();
  if ("error" in gate) return { detail: null, error: gate.error };

  let data;
  try {
    data = await fetchMonthData(gate.profile.salon_id, month);
  } catch (err) {
    return {
      detail: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const profile = data.profiles.find((p) => p.id === staffId);
  if (!profile) return { detail: null, error: "Staff not found" };

  const services: PayrollServiceLine[] = [];
  const tips: PayrollTipLine[] = [];

  for (const a of data.appointments) {
    const bundleMeta = bundleMetaFor(a);
    const staffOnAppt = Array.from(
      new Set(
        a.appointment_services
          .map((as) => as.staff_id)
          .filter((s): s is string => !!s),
      ),
    );

    for (const as of a.appointment_services) {
      if (as.staff_id !== staffId || !as.services) continue;
      services.push({
        appointmentId: a.id,
        date: a.date,
        serviceName: as.services.name,
        // Bundle-aware effective price (see effectivePrice). For
        // non-bundle rows this is just the catalog price.
        price: effectivePrice(as, bundleMeta),
        bundleName: as.bundle_name,
      });
    }

    const shares = tipShares(a.payments, staffOnAppt);
    const mine = shares.get(staffId);
    if (mine) {
      if (mine.explicit > 0) {
        tips.push({
          appointmentId: a.id,
          date: a.date,
          amount: mine.explicit,
          split: false,
        });
      }
      if (mine.split > 0) {
        tips.push({
          appointmentId: a.id,
          date: a.date,
          amount: mine.split,
          split: true,
        });
      }
    }
  }

  const adjustments: PayrollAdjustmentLine[] = data.adjustments
    .filter((a) => a.staff_id === staffId)
    .map((a) => ({
      id: a.id,
      type: a.type,
      amount: Number(a.amount) || 0,
      reason: a.reason,
      adjustmentDate: a.adjustment_date,
    }))
    .sort((a, b) => b.adjustmentDate.localeCompare(a.adjustmentDate));

  // Same per-line dates put services / tips in reverse chrono so the
  // most recent shifts top the list.
  services.sort((a, b) => b.date.localeCompare(a.date));
  tips.sort((a, b) => b.date.localeCompare(a.date));

  const servicesRevenue = services.reduce((sum, s) => sum + s.price, 0);
  const commissionPercent = Number(profile.commission_percent) || 0;
  const targetMultiplier = Number(profile.target_multiplier) || 0;
  const baseSalary = Number(profile.salary) || 0;
  // Threshold commission (migration-039). target_multiplier=0 reduces
  // to the old "% of full revenue" model for backwards compat.
  const target = baseSalary * targetMultiplier;
  const revenueAboveTarget = Math.max(0, servicesRevenue - target);
  const commission = (revenueAboveTarget * commissionPercent) / 100;
  const tipsTotal = tips.reduce((sum, t) => sum + t.amount, 0);
  const bonusesTotal = adjustments
    .filter((a) => a.type === "bonus")
    .reduce((sum, a) => sum + a.amount, 0);
  const deductionsTotal = adjustments
    .filter((a) => a.type === "deduction")
    .reduce((sum, a) => sum + a.amount, 0);
  const net =
    baseSalary + commission + tipsTotal + bonusesTotal - deductionsTotal;

  return {
    detail: {
      staffId,
      fullName: profile.full_name || "Unnamed",
      role: profile.role,
      month,
      baseSalary,
      commissionPercent,
      targetMultiplier,
      target,
      services,
      tips,
      adjustments,
      totals: {
        servicesRevenue,
        revenueAboveTarget,
        commission,
        tips: tipsTotal,
        bonuses: bonusesTotal,
        deductions: deductionsTotal,
        net,
      },
    },
  };
}

// ---------- Adjustments CRUD ----------

/**
 * Activity-log helper — inline (rather than imported from
 * calendar/actions.ts) to stay within this "use server" boundary and
 * follow the same per-file-owns-its-own-copy pattern used elsewhere
 * (e.g. payments/actions.ts has the same). `appointment_id` is null
 * for these because adjustments aren't tied to an appointment.
 */
async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  performerId: string,
  action: string,
  description: string,
) {
  await supabase.from("activity_log").insert({
    appointment_id: null,
    action,
    description,
    performed_by: performerId,
  });
}

/** Look up a staff member's display name for the activity feed.
 *  Falls back to "team member" when the profile row can't be read. */
async function staffName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  staffId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", staffId)
    .single();
  return data?.full_name || "team member";
}

export async function addStaffAdjustment(
  staffId: string,
  type: "bonus" | "deduction",
  amount: number,
  reason: string,
  adjustmentDate: string,
) {
  const gate = await requireOwner();
  if ("error" in gate) return { error: gate.error };

  // Light input validation. The DB CHECK constraints will also reject
  // invalid rows, but a clear message here beats a Postgres error.
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be a positive number" };
  }
  if (!reason.trim()) {
    return { error: "Please add a short title" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(adjustmentDate)) {
    return { error: "Invalid date" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("staff_adjustments").insert({
    salon_id: gate.profile.salon_id,
    staff_id: staffId,
    type,
    amount,
    reason: reason.trim(),
    adjustment_date: adjustmentDate,
    created_by: gate.profile.id,
  });

  if (error) return { error: error.message };

  // Audit trail — surfaces in the notification bell + activity feed
  // so other admins / the owner can see when bonuses/deductions were
  // added. Verb matches the noun pair already used by payments
  // ("payment_added" → "adjustment_added"). Description is plain-
  // English so the bell tooltip doesn't read like raw JSON.
  const target = await staffName(supabase, staffId);
  await logActivity(
    supabase,
    gate.profile.id,
    type === "bonus" ? "bonus_added" : "deduction_added",
    `${type === "bonus" ? "Bonus" : "Deduction"} · ${target} · ${reason.trim()}`,
  );

  revalidatePath("/payroll");
  return { success: true };
}

export async function deleteStaffAdjustment(id: string) {
  const gate = await requireOwner();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();

  // Snapshot the row BEFORE deleting so we can write a meaningful
  // activity log message. Without this, the bell would show
  // "Deleted adjustment" with no context. ON DELETE removes the row,
  // so a post-delete fetch wouldn't give us the data.
  const { data: before } = await supabase
    .from("staff_adjustments")
    .select("type, staff_id, reason")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("staff_adjustments")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  if (before) {
    const target = await staffName(supabase, before.staff_id);
    await logActivity(
      supabase,
      gate.profile.id,
      before.type === "bonus" ? "bonus_removed" : "deduction_removed",
      `${before.type === "bonus" ? "Bonus" : "Deduction"} removed · ${target} · ${before.reason}`,
    );
  }

  revalidatePath("/payroll");
  return { success: true };
}

/** Edit an existing bonus/deduction row. Owner-only (same gate as
 *  add/delete). The staff_id can't be changed — owners who got the
 *  wrong recipient should delete + re-add. Keeping staff_id fixed
 *  here means we don't need to worry about RLS edge cases where
 *  the row "moves" between staff. */
export async function updateStaffAdjustment(
  id: string,
  type: "bonus" | "deduction",
  amount: number,
  reason: string,
  adjustmentDate: string,
) {
  const gate = await requireOwner();
  if ("error" in gate) return { error: gate.error };

  // Same validation as the add path — keeps the DB CHECK constraint
  // from rejecting and gives nicer error messages.
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be a positive number" };
  }
  if (!reason.trim()) {
    return { error: "Please add a short title" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(adjustmentDate)) {
    return { error: "Invalid date" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_adjustments")
    .update({
      type,
      amount,
      reason: reason.trim(),
      adjustment_date: adjustmentDate,
    })
    .eq("id", id)
    // Scope to the owner's salon so a crafted call can't touch another
    // tenant's adjustment even if the id is leaked.
    .eq("salon_id", gate.profile.salon_id);

  if (error) return { error: error.message };

  // Audit log — fetch the staff name on the now-updated row so the
  // message reflects the current state (the type may have flipped
  // bonus↔deduction in the edit).
  const { data: after } = await supabase
    .from("staff_adjustments")
    .select("staff_id")
    .eq("id", id)
    .single();
  if (after) {
    const target = await staffName(supabase, after.staff_id);
    await logActivity(
      supabase,
      gate.profile.id,
      type === "bonus" ? "bonus_updated" : "deduction_updated",
      `${type === "bonus" ? "Bonus" : "Deduction"} updated · ${target} · ${reason.trim()}`,
    );
  }

  revalidatePath("/payroll");
  return { success: true };
}

/** Bulk-edit the pay fields on a profile (called from /payroll inline
 *  edit). Reuses the salary column from migration-002 as base salary.
 *  targetMultiplier (migration-039) defaults to 0 — keeps the old
 *  "% of full revenue" behavior unless the owner sets a threshold. */
export async function updateStaffPay(
  staffId: string,
  baseSalary: number,
  commissionPercent: number,
  targetMultiplier: number,
) {
  const gate = await requireOwner();
  if ("error" in gate) return { error: gate.error };

  if (!Number.isFinite(baseSalary) || baseSalary < 0) {
    return { error: "Base salary must be 0 or more" };
  }
  if (
    !Number.isFinite(commissionPercent) ||
    commissionPercent < 0 ||
    commissionPercent > 100
  ) {
    return { error: "Commission must be between 0 and 100" };
  }
  if (
    !Number.isFinite(targetMultiplier) ||
    targetMultiplier < 0 ||
    targetMultiplier > 50
  ) {
    return { error: "Target multiplier must be between 0 and 50" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      salary: baseSalary,
      commission_percent: commissionPercent,
      target_multiplier: targetMultiplier,
    })
    .eq("id", staffId)
    .eq("salon_id", gate.profile.salon_id);

  if (error) return { error: error.message };
  revalidatePath("/payroll");
  revalidatePath("/team");
  return { success: true };
}
