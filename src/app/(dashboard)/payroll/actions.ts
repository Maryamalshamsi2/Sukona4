"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";

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
 *   commission       = services_revenue × commission_percent / 100
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
  servicesRevenue: number;
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
  price: number;
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
  services: PayrollServiceLine[];
  tips: PayrollTipLine[];
  adjustments: PayrollAdjustmentLine[];
  totals: {
    servicesRevenue: number;
    commission: number;
    tips: number;
    bonuses: number;
    deductions: number;
    net: number;
  };
}

// ---------- Helpers ----------

/** Owner gate. Returns the profile when allowed; an error object when not. */
async function requireOwner() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" } as const;
  if (profile.role !== "owner") return { error: "Not authorized" } as const;
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
      .select("id, full_name, role, salary, commission_percent")
      .eq("salon_id", salonId),
    supabase
      .from("appointments")
      .select(
        `
        id, date, status,
        appointment_services ( id, staff_id, services:service_id ( id, name, price ) ),
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

  if (profilesRes.error) throw profilesRes.error;
  if (apptsRes.error) throw apptsRes.error;
  if (adjustmentsRes.error) throw adjustmentsRes.error;

  // Normalise Supabase's tendency to return joined rows as either
  // object or array depending on inferred cardinality.
  const appts: AppointmentRow[] = (apptsRes.data ?? []).map(
    (a: Record<string, unknown>) => ({
      id: a.id as string,
      date: a.date as string,
      status: a.status as string,
      appointment_services: ((a.appointment_services as unknown[]) ?? []).map(
        (as) => {
          const r = as as { id: string; staff_id: string | null; services: unknown };
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

/** Summary table — one row per staff for the given month. */
export async function getPayrollSummary(
  month: string,
): Promise<{ rows: PayrollStaffRow[]; error?: string }> {
  const gate = await requireOwner();
  if ("error" in gate) return { rows: [], error: gate.error };

  let data;
  try {
    data = await fetchMonthData(gate.profile.salon_id, month);
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }

  // Initialise per-staff accumulators. We include EVERY salon member,
  // even ones with no work in the month, so the owner sees a row
  // (with 0 revenue + maybe base salary). They can ignore the row
  // by sorting or simply skipping it.
  const accum = new Map<
    string,
    Omit<PayrollStaffRow, "commission" | "net">
  >();
  for (const p of data.profiles) {
    accum.set(p.id, {
      staffId: p.id,
      fullName: p.full_name || "Unnamed",
      role: p.role,
      baseSalary: Number(p.salary) || 0,
      commissionPercent: Number(p.commission_percent) || 0,
      servicesRevenue: 0,
      tips: 0,
      bonuses: 0,
      deductions: 0,
    });
  }

  // Services revenue + tips, walked once per appointment.
  for (const a of data.appointments) {
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
      row.servicesRevenue += as.services.price;
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

  // Compute commission + net last, after revenue is finalised.
  const rows: PayrollStaffRow[] = Array.from(accum.values()).map((r) => {
    const commission = (r.servicesRevenue * r.commissionPercent) / 100;
    const net = r.baseSalary + commission + r.tips + r.bonuses - r.deductions;
    return { ...r, commission, net };
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
        price: as.services.price,
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
  const commission = (servicesRevenue * commissionPercent) / 100;
  const tipsTotal = tips.reduce((sum, t) => sum + t.amount, 0);
  const bonusesTotal = adjustments
    .filter((a) => a.type === "bonus")
    .reduce((sum, a) => sum + a.amount, 0);
  const deductionsTotal = adjustments
    .filter((a) => a.type === "deduction")
    .reduce((sum, a) => sum + a.amount, 0);
  const baseSalary = Number(profile.salary) || 0;
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
      services,
      tips,
      adjustments,
      totals: {
        servicesRevenue,
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
    return { error: "Please add a short reason" };
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
  revalidatePath("/payroll");
  return { success: true };
}

export async function deleteStaffAdjustment(id: string) {
  const gate = await requireOwner();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_adjustments")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/payroll");
  return { success: true };
}

/** Bulk-edit the pay fields on a profile (called from /payroll inline
 *  edit). Reuses the salary column from migration-002 as base salary. */
export async function updateStaffPay(
  staffId: string,
  baseSalary: number,
  commissionPercent: number,
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      salary: baseSalary,
      commission_percent: commissionPercent,
    })
    .eq("id", staffId)
    .eq("salon_id", gate.profile.salon_id);

  if (error) return { error: error.message };
  revalidatePath("/payroll");
  revalidatePath("/team");
  return { success: true };
}
