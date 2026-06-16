import { redirect } from "next/navigation";

/**
 * /gift-cards is consolidated into /sales as a tab. Anyone hitting
 * the old URL (bookmarks, stale links, copy-pasted email refs) lands
 * on /sales with the default Retail tab — they can switch to Gift
 * cards from there.
 *
 * The server actions in this folder (actions.ts, packages-actions.ts)
 * stay where they are — they're imported by /sales, /reports, and
 * MarkPaidModal.
 */
export default function GiftCardsPage() {
  redirect("/sales");
}
