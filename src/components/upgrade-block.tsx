"use client";

import Link from "next/link";
import { PLAN_LABELS, PLAN_PRICING, type Plan } from "@/lib/plan";
import { useCurrency } from "@/lib/user-context";
import { formatCurrency } from "@/lib/currency";

/**
 * Soft-locked feature card. Use anywhere a plan-gated feature would
 * otherwise be rendered — the user sees what they're missing + a path
 * to upgrade, instead of the feature silently being hidden.
 *
 * Two variants:
 *   - "card" (default): a centred card sized for full-page blocks like
 *     /payroll. Use as the page body when the whole route is gated.
 *   - "inline": a smaller card meant to slot into an existing layout
 *     (e.g. one section of /reports). Less chrome, no full-page height.
 *
 * If the current user is the owner, the CTA is "Upgrade to <plan>"
 * → /settings/billing. For admin/staff we swap to "Ask your owner
 * to upgrade" because they can't take the action themselves.
 *
 * Pricing comes from PLAN_PRICING (single source of truth in plan.ts).
 * If `priceCurrency` is "AED" the line says "from AED 149/mo" — for
 * other currencies we just show the AED price since Stripe charges
 * in one currency regardless of where the customer is. The badge
 * "from AED" makes that explicit.
 */
export interface UpgradeBlockProps {
  /** Human label for the feature, e.g. "Payroll" or "Per-staff reports". */
  feature: string;
  /** The plan the user needs to upgrade to. */
  toPlan: Plan;
  /** A 1–2 sentence sales pitch — what the feature does + why it matters. */
  description: string;
  /** The current role gates the CTA copy. Owner sees "Upgrade", anyone
   *  else sees "Ask your owner" and the link is removed. */
  role: "owner" | "admin" | "staff";
  /** Layout style. */
  variant?: "card" | "inline";
}

export default function UpgradeBlock({
  feature,
  toPlan,
  description,
  role,
  variant = "card",
}: UpgradeBlockProps) {
  // Currency exists so the user sees the price in their salon's currency
  // for context — actual Stripe charge is always in AED (per stripe.ts).
  const currency = useCurrency();
  const monthly = PLAN_PRICING[toPlan].monthly;
  const planLabel = PLAN_LABELS[toPlan];

  // Layout sizing differs but the content is the same — pull it out
  // so we don't duplicate.
  const content = (
    <>
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 text-primary-600">
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
        >
          {/* lock icon — universal "premium feature" cue */}
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
      </div>
      <div className="mt-4 space-y-1.5">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-tertiary">
          Available on {planLabel}
        </p>
        <h2 className="text-title-section font-semibold text-text-primary">
          {feature}
        </h2>
        <p className="text-body-sm text-text-secondary">{description}</p>
      </div>

      {role === "owner" ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href="/settings/billing"
            className="rounded-xl bg-neutral-900 px-5 py-2.5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition"
          >
            Upgrade to {planLabel}
          </Link>
          <span className="text-caption text-text-tertiary">
            from {formatCurrency(monthly, currency)}/mo
          </span>
        </div>
      ) : (
        <div className="mt-5 rounded-xl bg-surface-active px-4 py-3 text-body-sm text-text-secondary">
          Only the salon owner can change the plan. Ask them to upgrade to{" "}
          {planLabel}.
        </div>
      )}
    </>
  );

  if (variant === "inline") {
    return (
      <div className="rounded-2xl ring-1 ring-border bg-white p-5">
        {content}
      </div>
    );
  }

  // Default: full-page card.
  return (
    <div className="mx-auto max-w-md rounded-2xl ring-1 ring-border bg-white p-6 sm:p-8 my-12">
      {content}
    </div>
  );
}
