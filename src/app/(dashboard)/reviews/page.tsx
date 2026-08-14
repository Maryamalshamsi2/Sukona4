import { redirect } from "next/navigation";
import ReviewsView from "./reviews-view";
import { getCurrentProfile } from "@/lib/auth-server";
import { getReviewsForMonth } from "./actions";

/** Return YYYY-MM in the salon's day. Uses the server's local
 *  timezone — Vercel + our proxy are both UAE-friendly, and the
 *  month picker in the view lets the owner correct if it's ever off
 *  by a day at the boundary. */
function currentMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default async function ReviewsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "owner" && profile.role !== "admin") redirect("/");

  const month = currentMonth();
  const initial = await getReviewsForMonth(month);
  if ("error" in initial) {
    // Rare — likely a transient DB error. Render the view with an
    // empty payload so the owner sees the shell + can retry via the
    // month picker.
    return <ReviewsView initialMonth={month} initialRows={[]} />;
  }
  return <ReviewsView initialMonth={month} initialRows={initial.rows} />;
}
