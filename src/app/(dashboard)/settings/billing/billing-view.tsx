"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BillingState } from "./actions";
import {
  PLAN_LABELS,
  PLAN_PRICING,
  PLAN_TAGLINES,
  trialDaysLeft,
  type BillingPeriod,
  type Plan,
} from "@/lib/plan";

/**
 * Billing settings — current plan + actions.
 *
 * Four distinct UI states based on subscription_status +
 * has_stripe_customer:
 *
 *   trialing, no Stripe customer    → "Add payment method" CTA.
 *                                      Trial countdown banner above.
 *   trialing, has Stripe customer   → Trial countdown + "Manage billing".
 *                                      (Card on file; will charge at trial end.)
 *   active                          → Current plan + next renewal +
 *                                      "Manage billing" button.
 *   past_due / canceled / incomplete→ Recovery CTA: update card or
 *                                      re-subscribe.
 *
 * All Stripe interactions go through API routes (not server actions)
 * because we need to redirect to the Stripe-hosted Checkout / Portal
 * URLs that those routes return.
 */
export default function BillingView({ initial }: { initial: BillingState | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Surface ?checkout=success/cancelled from the Stripe redirect.
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      setFlash("Payment method saved. Welcome to Sukona — you're all set.");
    } else if (checkout === "cancelled") {
      setFlash("Checkout cancelled. No payment method was added.");
    }
    if (checkout) {
      // Clean the URL so a refresh doesn't re-fire the banner.
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  if (!initial) {
    return (
      <div className="p-6">
        <p className="text-body-sm text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (!initial.is_owner) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-title-page font-bold text-text-primary">Billing</h1>
        <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-border">
          <p className="text-body text-text-secondary">
            Only the salon owner can manage billing. Ask them to make the
            change for you.
          </p>
        </div>
      </div>
    );
  }

  async function startCheckout(plan: Plan, period: BillingPeriod) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billing_period: period }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "Could not start checkout.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setBusy(false);
  }

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "Could not open billing portal.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setBusy(false);
  }

  const planLabel = PLAN_LABELS[initial.plan];
  const planTagline = PLAN_TAGLINES[initial.plan];
  const monthlyEquivalent =
    initial.billing_period === "annual"
      ? PLAN_PRICING[initial.plan].annual
      : PLAN_PRICING[initial.plan].monthly;
  const periodLabel = initial.billing_period === "annual" ? "billed annually" : "billed monthly";
  const daysLeft = trialDaysLeft(initial.trial_ends_at);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center gap-2 text-caption text-text-tertiary">
        <Link href="/settings" className="hover:text-text-primary">Settings</Link>
        <span aria-hidden>·</span>
        <span>Billing</span>
      </div>
      <h1 className="mt-2 text-title-page font-bold text-text-primary">Billing</h1>

      {flash && (
        <div className="mt-6 rounded-xl bg-[#F0FAF2] px-4 py-3 text-body-sm font-medium text-[#1B8736]">
          {flash}
        </div>
      )}

      {/* Current plan card */}
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
              Current plan
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-text-primary">
              {planLabel}
            </div>
            <div className="text-caption text-text-secondary">{planTagline}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tracking-tight text-text-primary">
              AED {monthlyEquivalent}
            </div>
            <div className="text-caption text-text-tertiary">{periodLabel}</div>
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-5">
          <StatusBlock state={initial} daysLeft={daysLeft} />
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {actionButtonFor(initial, busy, startCheckout, openPortal)}
        </div>

        {error && (
          <p className="mt-3 text-body-sm text-error-700" role="alert">{error}</p>
        )}
      </div>

      {/* Plan comparison link */}
      <div className="mt-4 rounded-2xl bg-[#F5F5F7] p-5 text-center">
        <p className="text-body-sm text-text-secondary">
          Want to switch plans?
        </p>
        <Link
          href="/landing#pricing"
          className="mt-1 inline-block text-body-sm font-semibold text-primary-600 hover:text-primary-700"
          target="_blank"
          rel="noopener noreferrer"
        >
          Compare all plans →
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function StatusBlock({ state, daysLeft }: { state: BillingState; daysLeft: number }) {
  if (state.subscription_status === "trialing") {
    if (daysLeft <= 0) {
      return (
        <p className="text-body-sm text-error-700">
          <strong className="font-semibold">Trial ended.</strong> Add a payment
          method to keep using Sukona.
        </p>
      );
    }
    return (
      <p className="text-body-sm text-text-secondary">
        <strong className="font-semibold text-text-primary">
          {daysLeft === 1 ? "1 day" : `${daysLeft} days`} left
        </strong>{" "}
        in your free trial.
        {!state.has_stripe_customer && (
          <> Add a payment method to avoid interruption when it ends.</>
        )}
        {state.has_stripe_customer && state.current_period_end && (
          <> Your card will be charged on {formatDate(state.current_period_end)}.</>
        )}
      </p>
    );
  }
  if (state.subscription_status === "active") {
    return (
      <p className="text-body-sm text-text-secondary">
        <strong className="font-semibold text-text-primary">Active.</strong>{" "}
        {state.current_period_end
          ? `Next bill on ${formatDate(state.current_period_end)}.`
          : "Subscription is in good standing."}
      </p>
    );
  }
  if (state.subscription_status === "past_due") {
    return (
      <p className="text-body-sm text-error-700">
        <strong className="font-semibold">Payment failed.</strong> Update your
        card to keep your subscription active.
      </p>
    );
  }
  if (state.subscription_status === "canceled") {
    return (
      <p className="text-body-sm text-text-secondary">
        Your subscription has been canceled. Re-subscribe anytime to continue.
      </p>
    );
  }
  return (
    <p className="text-body-sm text-text-secondary">
      Your subscription is incomplete. Finish checkout to activate.
    </p>
  );
}

function actionButtonFor(
  state: BillingState,
  busy: boolean,
  startCheckout: (plan: Plan, period: BillingPeriod) => void,
  openPortal: () => void,
) {
  // Decide primary action based on whether we already have a Stripe
  // customer + sub. The "right" button changes meaningfully across
  // the four lifecycle states.
  const primaryClasses =
    "inline-flex items-center justify-center rounded-xl bg-neutral-900 px-5 py-3 text-body-sm font-semibold text-text-inverse transition hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-50";
  const secondaryClasses =
    "inline-flex items-center justify-center rounded-xl bg-surface-active px-5 py-3 text-body-sm font-semibold text-text-primary transition hover:bg-neutral-100 active:scale-[0.98] disabled:opacity-50";

  if (!state.has_stripe_customer) {
    // No card on file. Show "Add payment method" — starts a checkout
    // that uses the salon's existing plan + billing_period choice
    // (set during onboarding).
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => startCheckout(state.plan, state.billing_period)}
        className={primaryClasses}
      >
        {busy ? "Opening…" : "Add payment method"}
      </button>
    );
  }

  if (state.subscription_status === "canceled") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => startCheckout(state.plan, state.billing_period)}
        className={primaryClasses}
      >
        {busy ? "Opening…" : "Re-subscribe"}
      </button>
    );
  }

  // Has a customer + an active/trialing/past_due sub. Open the
  // Customer Portal — Stripe handles everything (update card,
  // switch plan, cancel, view invoices).
  return (
    <button
      type="button"
      disabled={busy}
      onClick={openPortal}
      className={primaryClasses}
    >
      {busy ? "Opening…" : "Manage billing"}
    </button>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
