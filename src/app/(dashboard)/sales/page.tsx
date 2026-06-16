import { redirect } from "next/navigation";
import SalesView, { type SaleRow, type ClientOption, type StaffOption } from "./sales-view";
import { getRetailSales } from "./actions";
import { listGiftCards } from "../gift-cards/actions";
import { listPackages } from "../gift-cards/packages-actions";
import { getServices } from "../catalog/actions";
import { getCurrentProfile } from "@/lib/auth-server";
import { getClients } from "../clients/actions";
import { getStaffMembers } from "../calendar/actions";
import type { GiftCardRow } from "../gift-cards/gift-cards-view";
import type { PackageRow, ServiceOption } from "../gift-cards/packages-tab";

/**
 * Owner/admin-only Sales page. Hosts three tabs (Retail / Gift cards
 * / Packages) — the old /gift-cards URL is now a redirect into this
 * page. Staff are blocked at the server (RLS in migration-043 and
 * the sidebar/More gating in components/sidebar+bottom-tab-bar).
 *
 * Initial load fetches everything the three tabs need:
 *   - 30 days of retail sales (Retail tab list)
 *   - All gift cards (Gift cards tab list)
 *   - All packages with items (Packages tab list)
 *   - Clients (sell-form pickers across all three tabs)
 *   - Staff (Retail tab's "sold by" picker)
 *   - Services (Packages tab's per-item service picker)
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

  const [sales, clients, staff, giftCards, packages, services] = await Promise.all([
    getRetailSales(from, today),
    getClients(),
    getStaffMembers(),
    listGiftCards("all"),
    listPackages("all"),
    getServices(),
  ]);

  return (
    <SalesView
      initialSales={(sales || []) as unknown as SaleRow[]}
      initialClients={(clients || []) as unknown as ClientOption[]}
      initialStaff={(staff || []) as unknown as StaffOption[]}
      initialFrom={from}
      initialTo={today}
      initialGiftCards={(giftCards || []) as unknown as GiftCardRow[]}
      initialPackages={(packages || []) as unknown as PackageRow[]}
      initialServices={(services || []).map((s) => ({
        id: s.id,
        name: s.name,
        price: s.price,
      })) as ServiceOption[]}
    />
  );
}
