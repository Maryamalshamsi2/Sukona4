"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { getPayrollSummary } from "../payroll/actions";
import type { Plan } from "@/lib/plan";

async function getCurrentUserRole() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, role: null };
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return { supabase, role: data?.role || "staff" };
}

/**
 * Shared helper — pull the staff ids in a given team_group, used by
 * the appointment / payment / review filters below. Returns an empty
 * set if teamId is falsy so callers can skip filtering cheaply.
 *
 * Memoising across calls isn't needed — Reports page hits these
 * three endpoints once per filter change, in parallel, and each pays
 * one small SELECT on profiles. Cheap.
 */
async function teamStaffIdSet(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string | null | undefined,
): Promise<Set<string> | null> {
  if (!teamId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("group_id", teamId);
  return new Set((data ?? []).map((r) => r.id));
}

export async function getReportAppointments(
  from: string,
  to: string,
  /** Optional team_group id. When set, only appointments where at
   *  least one appointment_services row is performed by a staff in
   *  that team are returned. Same "if my team touched it, it counts"
   *  rule we use in the calendar admin scoping. */
  teamId?: string | null,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(`
      id,
      client_id,
      date,
      time,
      status,
      notes,
      created_at,
      transportation_charge,
      discount_type,
      discount_value,
      total_override,
      clients ( id, name, phone ),
      appointment_services (
        id,
        service_id,
        staff_id,
        is_parallel,
        sort_order,
        bundle_id,
        bundle_instance_id,
        bundle_total_price,
        bundle_name,
        services:service_id ( id, name, price, duration_minutes )
      ),
      payments ( id, receipt_url, receipt_urls, created_at )
    `)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .order("time", { ascending: false });

  if (error) throw error;

  const teamSet = await teamStaffIdSet(supabase, teamId);
  if (!teamSet) return data ?? [];
  return (data ?? []).filter((a: { appointment_services?: { staff_id: string | null }[] }) => {
    const svcs = a.appointment_services ?? [];
    return svcs.some((as) => as.staff_id && teamSet.has(as.staff_id));
  });
}

export async function getReportPayments(
  from: string,
  to: string,
  teamId?: string | null,
) {
  const supabase = await createClient();
  // payments join appointments for date filtering. For team scoping
  // we need the appointment's staff (via appointment_services), so we
  // pull that too — only when a team filter is set, to avoid the
  // joined fetch when it's not needed.
  const select = teamId
    ? `
      id,
      appointment_id,
      amount,
      method,
      note,
      receipt_url,
      receipt_urls,
      created_at,
      appointments:appointment_id (
        id,
        date,
        time,
        client_id,
        clients ( id, name ),
        appointment_services ( staff_id )
      )
    `
    : `
      id,
      appointment_id,
      amount,
      method,
      note,
      receipt_url,
      receipt_urls,
      created_at,
      appointments:appointment_id (
        id,
        date,
        time,
        client_id,
        clients ( id, name )
      )
    `;
  const { data, error } = await supabase
    .from("payments")
    .select(select)
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59`)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const teamSet = await teamStaffIdSet(supabase, teamId);
  if (!teamSet) return data ?? [];
  return (data ?? []).filter((p) => {
    // After the conditional select above, payments in team-filter
    // mode have appointment_services nested under appointments.
    const appt = (p as { appointments?: unknown }).appointments;
    const apptObj = Array.isArray(appt) ? appt[0] : appt;
    const svcs = ((apptObj as { appointment_services?: { staff_id: string | null }[] })?.appointment_services) ?? [];
    return svcs.some((as) => as.staff_id && teamSet.has(as.staff_id));
  });
}

export async function getReportExpenses(from: string, to: string) {
  const { supabase, role } = await getCurrentUserRole();

  let query = supabase
    .from("expenses")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });

  // Staff can only see non-private expenses
  if (role !== "owner") {
    query = query.eq("is_private", false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getStaffMembers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, job_title")
    .eq("role", "staff")
    .order("full_name");

  if (error) throw error;
  return data;
}

/**
 * Total staff salary cost for the date range — used by the Finance
 * summary to compute true profit (Revenue − Expenses − Salaries).
 *
 * Method:
 *   1. Only show this when the date range aligns exactly to whole
 *      calendar months — `from` is day-1 of some month, `to` is the
 *      last day of a (same-or-later) month. Otherwise return
 *      `{ available: false }` so the UI hides the line. Salaries are
 *      a monthly fixed cost; showing them next to a partial-month
 *      range produces confusing profit numbers ("Today" would show a
 *      full month of salary against one day of revenue).
 *   2. For each whole month in the range, reuse getPayrollSummary()
 *      and sum the per-staff `net` field. Same numbers as /payroll.
 *   3. Aggregate across months.
 *
 * Owner-only AND plan-gated. Solo plans return `available: false`
 * because they don't have payroll (per the canUsePayroll matrix).
 * is_exempt salons bypass the plan gate (matches migration-035).
 *
 * Team scope (v1.7): when `teamId` is set, only that team's staff
 * salaries contribute — consistent with the rest of the report
 * filters on the page.
 *
 * To always see the Salaries line, owners should pick a Custom
 * date range that snaps to month boundaries (e.g. 2026-05-01 to
 * 2026-05-31). The default presets (Today / 7 days / 30 days)
 * rarely align this way, so the line will be hidden for those.
 */
export interface ReportSalaries {
  total: number;
  monthsCovered: string[]; // ["2026-04", "2026-05"]
  /** False when the salon is on Solo (or any plan without payroll).
   *  The UI hides the Salaries line entirely in this case. */
  available: boolean;
}

function monthsInRange(fromYMD: string, toYMD: string): string[] {
  const [fY, fM] = fromYMD.split("-").map(Number);
  const [tY, tM] = toYMD.split("-").map(Number);
  if (!fY || !fM || !tY || !tM) return [];
  const out: string[] = [];
  let y = fY;
  let m = fM;
  while (y < tY || (y === tY && m <= tM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * True when the range spans exactly whole calendar months:
 *
 *   from = the 1st of some month
 *   to   = the last day of some (same-or-later) month
 *
 * Used to gate the Salaries line so partial-month ranges hide it
 * (salaries are a monthly fixed cost; pro-rating them by days
 * would misrepresent the owner's actual obligation).
 */
function isFullMonthRange(fromYMD: string, toYMD: string): boolean {
  const [fY, fM, fD] = fromYMD.split("-").map(Number);
  const [tY, tM, tD] = toYMD.split("-").map(Number);
  if (!fY || !fM || !fD || !tY || !tM || !tD) return false;
  if (fD !== 1) return false;
  // Day-0 of next month = last day of current month (handles 28/29/30/31)
  const lastDayOfToMonth = new Date(tY, tM, 0).getDate();
  if (tD !== lastDayOfToMonth) return false;
  // from <= to (already implicit if both pass — but cheap to confirm)
  if (tY < fY || (tY === fY && tM < fM)) return false;
  return true;
}

export async function getReportSalaries(
  from: string,
  to: string,
  teamId?: string | null,
): Promise<ReportSalaries> {
  const empty: ReportSalaries = { total: 0, monthsCovered: [], available: false };

  // Owner gate — Reports is already owner-only at the sidebar, this
  // is defense-in-depth.
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "owner") return empty;

  // Plan gate — Solo has no payroll, so no Salaries line. Exempt
  // salons (founder / demo accounts) bypass.
  const supabase = await createClient();
  const { data: salon } = await supabase
    .from("salons")
    .select("plan, is_exempt")
    .eq("id", profile.salon_id)
    .single();
  const plan = (salon?.plan as Plan | undefined) ?? "solo";
  const isExempt = !!salon?.is_exempt;
  if (!isExempt && plan === "solo") return empty;

  // Only show on whole-month ranges. Partial months would force a
  // pro-rate-or-mismatch decision; hiding the line is cleaner.
  if (!isFullMonthRange(from, to)) return empty;

  const months = monthsInRange(from, to);
  if (months.length === 0) return empty;

  // Sum each month's payroll. The cost here scales linearly with the
  // number of months in the range — a "Last 12 months" pick would
  // hit getPayrollSummary 12 times. Acceptable for now; if owners
  // start picking year-long ranges regularly we could batch into a
  // single multi-month query.
  let total = 0;
  for (const month of months) {
    const { rows } = await getPayrollSummary(month, teamId ?? null);
    total += rows.reduce((sum, r) => sum + r.net, 0);
  }

  return { total, monthsCovered: months, available: true };
}

// Reviews submitted in the date window. We filter by review submitted_at
// (not appointment date) because that's when the customer actually rated us
// — i.e. it's the period that "earned" the rating.
export async function getReportReviews(
  from: string,
  to: string,
  teamId?: string | null,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(`
      id,
      rating,
      comment,
      wants_followup,
      redirected_externally,
      submitted_at,
      appointment_id,
      appointments:appointment_id (
        id,
        date,
        time,
        clients ( id, name ),
        appointment_services (
          staff_id,
          services:service_id ( name )
        )
      )
    `)
    .gte("submitted_at", `${from}T00:00:00`)
    .lte("submitted_at", `${to}T23:59:59`)
    .order("submitted_at", { ascending: false });

  if (error) throw error;

  const teamSet = await teamStaffIdSet(supabase, teamId);
  if (!teamSet) return data ?? [];
  return (data ?? []).filter((r) => {
    const appt = (r as { appointments?: unknown }).appointments;
    const apptObj = Array.isArray(appt) ? appt[0] : appt;
    const svcs = ((apptObj as { appointment_services?: { staff_id: string | null }[] })?.appointment_services) ?? [];
    return svcs.some((as) => as.staff_id && teamSet.has(as.staff_id));
  });
}
