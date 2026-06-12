import { redirect } from "next/navigation";
import SalesView, { type SaleRow, type ClientOption, type StaffOption } from "./sales-view";
import { getRetailSales } from "./actions";
import { getCurrentProfile } from "@/lib/auth-server";
import { getClients } from "../clients/actions";
import { getStaffMembers } from "../calendar/actions";

/**
 * Owner/admin-only retail sales page. Staff don't see this in the
 * sidebar OR the mobile bottom nav, and the row-level RLS in
 * migration-043 keeps them out of the data too — this server-side
 * redirect is defense-in-depth.
 *
 * Initial load: last 30 days of sales, plus the client + staff
 * lookup lists for the Add/Edit form's optional pickers.
 */
function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function SalesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "owner" && profile.role !== "admin") redirect("/");

  const now = new Date();
  const today = toISODate(now);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 29);
  const from = toISODate(fromDate);

  const [sales, clients, staff] = await Promise.all([
    getRetailSales(from, today),
    getClients(),
    getStaffMembers(),
  ]);

  return (
    <SalesView
      initialSales={(sales || []) as unknown as SaleRow[]}
      initialClients={(clients || []) as unknown as ClientOption[]}
      initialStaff={(staff || []) as unknown as StaffOption[]}
      initialFrom={from}
      initialTo={today}
    />
  );
}
