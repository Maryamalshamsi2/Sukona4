import { redirect } from "next/navigation";
import PayrollView from "./payroll-view";
import { getCurrentProfile } from "@/lib/auth-server";
import { getPayrollSummary } from "./actions";

/**
 * Owner-only payroll page. Renders the monthly summary table with
 * one row per salon member, links to a drill-down drawer, and lets
 * the owner add bonuses/deductions and edit pay rates.
 *
 * Gate: the sidebar already hides /payroll for non-owners, but the
 * server-side redirect here is the authoritative check — a non-owner
 * who URL-types their way in bounces back to / before the page ever
 * renders. Server actions add another role check inside, so even a
 * crafted client call can't reach payroll data.
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

  const month = defaultMonth();
  const { rows, error } = await getPayrollSummary(month);

  return (
    <PayrollView
      initialMonth={month}
      initialRows={rows}
      initialError={error || null}
    />
  );
}
