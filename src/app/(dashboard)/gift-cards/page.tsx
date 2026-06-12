import { redirect } from "next/navigation";
import GiftCardsView, {
  type GiftCardRow,
  type ClientOption,
} from "./gift-cards-view";
import { listGiftCards } from "./actions";
import { getCurrentProfile } from "@/lib/auth-server";
import { getClients } from "../clients/actions";

/**
 * Owner/admin-only gift cards page. Staff can SELECT from the table
 * (needed for code lookups in the payment modal) but the management
 * UI is hidden from them in the sidebar AND a server-side redirect
 * here keeps direct-URL access blocked.
 *
 * Initial load: all cards, all statuses (the in-view filter chip
 * defaults to "active" and re-fetches on change). Clients are
 * preloaded for the optional "buyer" picker on the sell form.
 */
export default async function GiftCardsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "owner" && profile.role !== "admin") redirect("/");

  const [cards, clients] = await Promise.all([
    listGiftCards("active"),
    getClients(),
  ]);

  return (
    <GiftCardsView
      initialCards={(cards || []) as unknown as GiftCardRow[]}
      initialClients={(clients || []) as unknown as ClientOption[]}
    />
  );
}
