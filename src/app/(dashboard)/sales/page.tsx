import { redirect } from "next/navigation";
import SalesView, { type SaleRow, type ClientOption, type StaffOption } from "./sales-view";
import { getRetailSales } from "./actions";
import { listGiftCards } from "../gift-cards/actions";
import { listPackages } from "../gift-cards/packages-actions";
import { getServices, getBundles } from "../catalog/actions";
import { getCurrentProfile } from "@/lib/auth-server";
import { getClients } from "../clients/actions";
import { getStaffMembers } from "../calendar/actions";
import type { GiftCardRow } from "../gift-cards/gift-cards-view";
import type { PackageRow, ServiceOption, BundleOption } from "../gift-cards/packages-tab";

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

  const [sales, clients, staff, giftCards, packages, services, bundles] = await Promise.all([
    getRetailSales(from, today),
    getClients(),
    getStaffMembers(),
    listGiftCards("all"),
    listPackages("all"),
    getServices(),
    getBundles(),
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
      initialBundles={
        (bundles || [])
          .filter((b: { is_active?: boolean }) => b.is_active !== false)
          .map((b: { id: string; name: string; fixed_price: number | null }) => ({
            id: b.id,
            name: b.name,
            // For MVP we don't drive per-line pricing off the bundle
            // price yet (server keeps total_paid at the aggregate the
            // owner types). Pass the fixed_price when set so future
            // per-item price previews have it.
            price: b.fixed_price ?? 0,
          })) as BundleOption[]
      }
    />
  );
}
