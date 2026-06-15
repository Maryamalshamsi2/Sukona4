import { redirect } from "next/navigation";
import GiftCardsView, {
  type GiftCardRow,
  type ClientOption,
} from "./gift-cards-view";
import { listGiftCards } from "./actions";
import { listPackages } from "./packages-actions";
import { getCurrentProfile } from "@/lib/auth-server";
import { getClients } from "../clients/actions";
import { getServices } from "../catalog/actions";
import type { PackageRow, ServiceOption } from "./packages-tab";

/**
 * Owner/admin-only "prepaid" page. Hosts two tabs in the view:
 *   - Gift cards: code-based, $ balance, applied at payment time
 *   - Packages: multi-session, applied per service at payment time
 *
 * Staff CAN read gift_cards + packages (RLS allows SELECT) so they
 * can look them up in MarkPaidModal, but the management UI is hidden
 * from them in the sidebar AND a server-side redirect here keeps
 * direct-URL access blocked.
 *
 * Initial load fetches: all gift cards (filter defaults to "all" in
 * the view — see migration-044 + migration-046 for status semantics),
 * all packages, clients (for sell-form pickers), and services (for
 * package-item pickers).
 */
export default async function GiftCardsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "owner" && profile.role !== "admin") redirect("/");

  const [cards, clients, packages, services] = await Promise.all([
    listGiftCards("all"),
    getClients(),
    listPackages("all"),
    getServices(),
  ]);

  return (
    <GiftCardsView
      initialCards={(cards || []) as unknown as GiftCardRow[]}
      initialClients={(clients || []) as unknown as ClientOption[]}
      initialPackages={(packages || []) as unknown as PackageRow[]}
      initialServices={(services || []).map((s) => ({
        id: s.id,
        name: s.name,
        price: s.price,
      })) as ServiceOption[]}
    />
  );
}
