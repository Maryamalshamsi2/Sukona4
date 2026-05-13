"use client";

import Link from "next/link";
import { useCurrentUser } from "@/lib/user-context";

/**
 * Trial banner — shown at the top of the dashboard for salons in (or
 * past) their 7-day free trial. Three states based on `trialEndsAt`:
 *
 *   null       — column not set (existing salons pre-migration-032 or
 *                future paid plans). No banner rendered.
 *   future     — active trial. "X days left in your free trial" + CTA
 *                to /settings/billing (owner only — other roles see
 *                the countdown without a link since they can't act).
 *   past/now   — expired. "Your trial has ended" + same gated CTA.
 *                In practice the middleware hard-blocks expired
 *                trials, so the user is already on /settings/billing
 *                when this state shows.
 */
export default function TrialBanner({
  trialEndsAt,
}: {
  trialEndsAt: string | null;
}) {
  const currentUser = useCurrentUser();
  const isOwner = currentUser?.role === "owner";

  // Hide the entire banner from admin/staff. They can't act on the
  // trial state and don't need to see countdowns — the owner is
  // the one who manages billing. Non-owners get redirected to a
  // /paused page when the trial actually expires (see middleware
  // hard-block logic).
  if (!isOwner) return null;

  if (!trialEndsAt) return null;

  const ends = new Date(trialEndsAt);
  const now = new Date();
  const msLeft = ends.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  const expired = msLeft <= 0;

  if (expired) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-caption text-amber-900 sm:text-body-sm"
      >
        <span>Your trial has ended.</span>
        {isOwner && (
          <Link
            href="/settings/billing"
            className="font-semibold underline-offset-2 hover:underline"
          >
            Choose a plan →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-center gap-2 border-b border-border bg-surface-active px-4 py-2 text-caption text-text-secondary sm:text-body-sm"
    >
      <span>
        {daysLeft === 1 ? "1 day" : `${daysLeft} days`} left in your free trial.
      </span>
      {isOwner && (
        <Link
          href="/settings/billing"
          className="font-semibold text-text-primary underline-offset-2 hover:underline"
        >
          Choose a plan
        </Link>
      )}
    </div>
  );
}
