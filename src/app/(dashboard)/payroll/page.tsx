import { redirect } from "next/navigation";
import PayrollView from "./payroll-view";
import UpgradeBlock from "@/components/upgrade-block";
import { getCurrentProfile } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { canUsePayroll, type Plan } from "@/lib/plan";
import { getPayrollSummary } from "./actions";
import { getTeamGroups } from "../calendar/actions";

/**
 * Owner-only payroll page. Renders the monthly summary table with
 * one row per salon member, links to a drill-down drawer, and lets
 * the owner add bonuses/deductions and edit pay rates.
 *
 * Gates (defense in depth):
 *   1. Auth: redirect to /login if no session.
 *   2. Role: redirect to / for admin/staff.
 *   3. Plan: if salon is on Solo (and not is_exempt), render an
 *      UpgradeBlock instead of the table. Solo is for freelancers
 *      who don't have anyone else to pay a salary to.
 *   4. The server actions (getPayrollSummary, addStaffAdjustment, ...)
 *      each re-check owner role, so even a crafted client call can't
 *      reach payroll data on a Solo plan.
 */

function defaultMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default async function PayrollPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "owner") redirect("/");

  // Plan + exemption check. is_exempt salons (founder / demo accounts
  // via migration-035) bypass all plan limits including payroll, so
  // they see the real page regardless of the stored plan value.
  const supabase = await createClient();
  const { data: salon } = await supabase
    .from("salons")
    .select("plan, is_exempt")
    .eq("id", profile.salon_id)
    .single();

  const plan = (salon?.plan as Plan | undefined) ?? "solo";
  const isExempt = !!salon?.is_exempt;
  if (!isExempt && !canUsePayroll(plan)) {
    return (
      <div>
        <h1 className="text-title-page font-semibold tracking-tight text-text-primary">
          Payroll
        </h1>
        <UpgradeBlock
          feature="Payroll"
          toPlan="team"
          role="owner"
          description="Track services revenue, tips, bonuses and deductions per staff member, then share a clear monthly salary summary. Useful once you have a team — on Solo you're the only person on the salary line, so there's nothing to break down."
        />
      </div>
    );
  }

  const month = defaultMonth();
  const [{ rows, error }, teams] = await Promise.all([
    getPayrollSummary(month),
    getTeamGroups(),
  ]);

  return (
    <PayrollView
      initialMonth={month}
      initialRows={rows}
      initialError={error || null}
      initialTeams={(teams || []) as { id: string; name: string }[]}
    />
  );
}
