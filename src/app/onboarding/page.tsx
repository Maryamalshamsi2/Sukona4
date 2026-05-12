"use client";

import { useEffect, useState } from "react";
import { completeOnboarding, getCurrentSalon } from "./actions";
import {
  BUSINESS_CATEGORIES,
  COUNTRIES,
  REFERRAL_SOURCES,
  TEAM_SIZES,
  currencyForCountry,
  planForTeamSize,
} from "@/lib/onboarding-options";
import {
  PLAN_LABELS,
  PLAN_PRICING,
  PLAN_TAGLINES,
  type BillingPeriod,
  type Plan,
} from "@/lib/plan";

/**
 * Onboarding wizard — five steps, one question per page, progress
 * bar at the top.
 *
 *   1 — Business name + website (optional) + country
 *   2 — Category (what kind of business)
 *   3 — Team size  (auto-suggests plan on step 4)
 *   4 — Plan + billing period (pre-selected from step 3)
 *   5 — How did you hear about us? (skippable)
 *
 * Currency is derived from country, not asked separately. Trial
 * starts at signup (salons.trial_ends_at default), so this wizard
 * just finalizes the salon profile and flips is_onboarded.
 */

const TOTAL_STEPS = 5;

type WizardData = {
  name: string;
  website: string;
  country: string;
  category: string;
  teamSize: string;
  plan: Plan;
  billingPeriod: BillingPeriod;
  referralSource: string;
};

const INITIAL_DATA: WizardData = {
  name: "",
  website: "",
  country: "AE",
  category: "",
  teamSize: "",
  plan: "solo",
  billingPeriod: "monthly",
  referralSource: "",
};

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [bootLoading, setBootLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After the wizard's final submit succeeds, we don't redirect
  // immediately — we show an interstitial offering to add a payment
  // method now (the "hybrid" trial flow). The user can either start
  // Stripe checkout from here or skip to the dashboard.
  const [finished, setFinished] = useState(false);

  // Pre-fill the name if the signup trigger generated one (e.g.
  // "Mary's Salon"), and bounce out if the salon is already
  // onboarded.
  useEffect(() => {
    async function init() {
      const salon = await getCurrentSalon();
      if (!salon) {
        window.location.replace("/login");
        return;
      }
      if (salon.is_onboarded) {
        window.location.replace("/");
        return;
      }
      setData((d) => ({ ...d, name: salon.name || "" }));
      setBootLoading(false);
    }
    init();
  }, []);

  function patch(updates: Partial<WizardData>) {
    setData((d) => ({ ...d, ...updates }));
  }

  // When the team-size answer changes, pre-select the matching
  // plan. The user can override it on step 4.
  function setTeamSize(code: string) {
    patch({ teamSize: code, plan: planForTeamSize(code) });
  }

  function next() {
    setError(null);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  }

  // Per-step validation. Returning a string surfaces an error;
  // returning null means the step is good to advance.
  function validateCurrent(): string | null {
    switch (step) {
      case 1:
        if (!data.name.trim()) return "Please enter your business name";
        if (data.name.length > 80) return "Business name is too long";
        return null;
      case 2:
        if (!data.category) return "Please pick the category that fits best";
        return null;
      case 3:
        if (!data.teamSize) return "Please pick your team size";
        return null;
      case 4:
        // Plan and billing period are always set (defaults + pre-selection),
        // so this step is always valid.
        return null;
      case 5:
        // Referral source is optional. Always valid.
        return null;
      default:
        return null;
    }
  }

  async function handlePrimary() {
    const msg = validateCurrent();
    if (msg) {
      setError(msg);
      return;
    }
    if (step < TOTAL_STEPS) {
      next();
      return;
    }
    await submit();
  }

  async function submit() {
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("name", data.name.trim());
    formData.set("website", data.website.trim());
    formData.set("country", data.country);
    formData.set("currency", currencyForCountry(data.country));
    formData.set("category", data.category);
    formData.set("team_size", data.teamSize);
    formData.set("plan", data.plan);
    formData.set("billing_period", data.billingPeriod);
    formData.set("referral_source", data.referralSource);

    const result = await completeOnboarding(formData);
    if ("error" in result && result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    // Don't redirect yet — show the "add payment now?" interstitial.
    setFinished(true);
    setSubmitting(false);
  }

  // Hybrid-trial path: user clicks "Add payment method" on the
  // success screen. Hits the checkout API, which creates a Stripe
  // Checkout Session with trial_end = our salons.trial_ends_at, so
  // they're not charged until day 7. Redirects to Stripe's hosted
  // page; on success they come back to /settings/billing.
  async function startCheckout() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: data.plan,
          billing_period: data.billingPeriod,
        }),
      });
      const body = await res.json();
      if (body.url) {
        window.location.href = body.url;
        return;
      }
      setError(body.error || "Could not start checkout.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setSubmitting(false);
  }

  function skipToDashboard() {
    window.location.replace("/");
  }

  if (bootLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-violet-50 via-white to-violet-100/60">
        <p className="text-body-sm text-text-secondary">Loading…</p>
      </div>
    );
  }

  // Post-submit interstitial — the "hybrid trial" choice point.
  if (finished) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4 py-8 bg-gradient-to-br from-violet-50 via-white to-violet-100/60">
        <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/70 px-6 py-8 shadow-xl backdrop-blur-xl sm:px-10 sm:py-12">
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-dark.png" alt="Sukona" className="h-[40px] w-auto sm:h-[44px]" />
          </div>

          <div className="mt-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-text-primary">
              Your trial has started
            </h1>
            <p className="mt-2 text-body-sm text-text-secondary">
              Sukona is yours for the next 7 days, free.
            </p>
          </div>

          {/* Optional payment-now path */}
          <div className="mt-8 rounded-2xl bg-white/80 p-5 ring-1 ring-neutral-200">
            <h2 className="text-body font-semibold text-text-primary">
              Add a payment method now?
            </h2>
            <p className="mt-1.5 text-caption text-text-secondary">
              Avoid interruption when your trial ends. You won&rsquo;t be charged
              until day 7 — and you can cancel anytime before then.
            </p>
          </div>

          {error && (
            <p className="mt-4 text-body-sm text-error-700" role="alert">{error}</p>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={startCheckout}
              disabled={submitting}
              className="w-full rounded-xl bg-neutral-900 px-4 py-3 font-semibold tracking-tight text-text-inverse transition hover:bg-neutral-800 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2 disabled:opacity-50"
            >
              {submitting ? "Opening checkout…" : "Add payment method"}
            </button>
            <button
              type="button"
              onClick={skipToDashboard}
              disabled={submitting}
              className="text-center text-body-sm text-text-tertiary transition hover:text-text-primary"
            >
              Skip for now — go to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isFinalStep = step === TOTAL_STEPS;
  // Step 5 (referral source) is skippable — show "Skip" alongside
  // the primary action.
  const canSkip = step === 5;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-8 bg-gradient-to-br from-violet-50 via-white to-violet-100/60">
      <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/70 px-6 py-8 shadow-xl backdrop-blur-xl sm:px-10 sm:py-12">
        {/* Logo */}
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png" alt="Sukona" className="h-[40px] w-auto sm:h-[44px]" />
        </div>

        {/* Progress bar */}
        <div className="mt-7">
          <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full bg-primary-500 transition-all duration-300"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-caption text-text-tertiary">
            {step > 1 ? (
              <button
                type="button"
                onClick={back}
                className="inline-flex items-center gap-1 transition hover:text-text-primary"
              >
                <span aria-hidden>←</span> Back
              </button>
            ) : (
              <span />
            )}
            <span>Step {step} of {TOTAL_STEPS}</span>
          </div>
        </div>

        {/* Step body */}
        <div className="mt-8">
          {step === 1 && <Step1 data={data} patch={patch} />}
          {step === 2 && <Step2 data={data} patch={patch} />}
          {step === 3 && <Step3 data={data} setTeamSize={setTeamSize} />}
          {step === 4 && <Step4 data={data} patch={patch} />}
          {step === 5 && <Step5 data={data} patch={patch} />}
        </div>

        {/* Error */}
        {error && (
          <p className="mt-6 text-body-sm text-error-700" role="alert">{error}</p>
        )}

        {/* Footer actions */}
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={handlePrimary}
            disabled={submitting}
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 font-semibold tracking-tight text-text-inverse transition hover:bg-neutral-800 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2 disabled:opacity-50"
          >
            {submitting
              ? "Saving…"
              : isFinalStep
                ? "Finish & start free trial"
                : "Continue"}
          </button>
          {canSkip && (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="text-center text-body-sm text-text-tertiary transition hover:text-text-primary"
            >
              Skip this step
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Step 1 — Business name + website + country
// ============================================================

function Step1({
  data,
  patch,
}: {
  data: WizardData;
  patch: (u: Partial<WizardData>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Let&rsquo;s start with your business
        </h1>
        <p className="mt-1.5 text-body-sm text-text-secondary">
          The name your team and clients will see — you can change it anytime.
        </p>
      </div>

      <div>
        <label htmlFor="name" className="block text-body-sm font-semibold text-text-primary mb-1.5">
          Business name
        </label>
        <input
          id="name"
          type="text"
          required
          maxLength={80}
          autoComplete="organization"
          autoFocus
          value={data.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white/80 px-4 py-3 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 text-body sm:text-body-sm sm:py-2.5"
          placeholder="e.g. Ateeq Spa"
        />
      </div>

      <div>
        <label htmlFor="website" className="block text-body-sm font-semibold text-text-primary mb-1.5">
          Website <span className="text-text-tertiary font-normal">(optional)</span>
        </label>
        <input
          id="website"
          type="url"
          maxLength={200}
          autoComplete="url"
          value={data.website}
          onChange={(e) => patch({ website: e.target.value })}
          className="block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white/80 px-4 py-3 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 text-body sm:text-body-sm sm:py-2.5"
          placeholder="https://yourbrand.com"
        />
      </div>

      <div>
        <label htmlFor="country" className="block text-body-sm font-semibold text-text-primary mb-1.5">
          Country
        </label>
        <select
          id="country"
          value={data.country}
          onChange={(e) => patch({ country: e.target.value })}
          className="block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white/80 px-4 py-3 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 text-body sm:text-body-sm sm:py-2.5"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-caption text-text-tertiary">
          We&rsquo;ll set your currency to{" "}
          <span className="font-medium text-text-secondary">
            {currencyForCountry(data.country)}
          </span>{" "}
          — change it in Settings anytime.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Step 2 — Category
// ============================================================

function Step2({
  data,
  patch,
}: {
  data: WizardData;
  patch: (u: Partial<WizardData>) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-text-primary">
        What kind of business is it?
      </h1>
      <p className="mt-1.5 text-body-sm text-text-secondary">
        Helps us personalize Sukona for you. You can switch later.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {BUSINESS_CATEGORIES.map((c) => {
          const active = data.category === c.code;
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => patch({ category: c.code })}
              className={`rounded-xl border-[1.5px] px-4 py-3 text-left text-body-sm font-medium transition ${
                active
                  ? "border-primary-500 bg-primary-50/60 text-text-primary"
                  : "border-neutral-200 bg-white/80 text-text-secondary hover:border-neutral-300 hover:text-text-primary"
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Step 3 — Team size  (drives plan pre-selection on step 4)
// ============================================================

function Step3({
  data,
  setTeamSize,
}: {
  data: WizardData;
  setTeamSize: (code: string) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-text-primary">
        How big is your team?
      </h1>
      <p className="mt-1.5 text-body-sm text-text-secondary">
        We&rsquo;ll suggest the right plan for you on the next step.
      </p>

      <div className="mt-6 space-y-2.5">
        {TEAM_SIZES.map((t) => {
          const active = data.teamSize === t.code;
          return (
            <button
              key={t.code}
              type="button"
              onClick={() => setTeamSize(t.code)}
              className={`flex w-full items-center justify-between rounded-xl border-[1.5px] px-4 py-3 text-left text-body font-medium transition ${
                active
                  ? "border-primary-500 bg-primary-50/60 text-text-primary"
                  : "border-neutral-200 bg-white/80 text-text-secondary hover:border-neutral-300 hover:text-text-primary"
              }`}
            >
              <span>{t.name}</span>
              {active && (
                <span className="text-caption text-primary-700">
                  → {PLAN_LABELS[t.suggestedPlan]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Step 4 — Plan + billing period
// ============================================================

function Step4({
  data,
  patch,
}: {
  data: WizardData;
  patch: (u: Partial<WizardData>) => void;
}) {
  const plans: Plan[] = ["solo", "team", "multi_team"];
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-text-primary">
        Pick your plan
      </h1>
      <p className="mt-1.5 text-body-sm text-text-secondary">
        7-day free trial, no card required. You can change plans anytime.
      </p>

      {/* Billing period toggle */}
      <div className="mt-5 flex justify-center">
        <div className="inline-flex items-center rounded-full bg-[#F5F5F7] p-1">
          <button
            type="button"
            onClick={() => patch({ billingPeriod: "monthly" })}
            className={`rounded-full px-4 py-1.5 text-caption font-medium transition ${
              data.billingPeriod === "monthly"
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-secondary"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => patch({ billingPeriod: "annual" })}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-caption font-medium transition ${
              data.billingPeriod === "annual"
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-secondary"
            }`}
          >
            Annual
            <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">
              Save 17%
            </span>
          </button>
        </div>
      </div>

      {/* Plan list — stacked rows */}
      <div className="mt-5 space-y-2.5">
        {plans.map((p) => {
          const active = data.plan === p;
          const price =
            data.billingPeriod === "annual"
              ? PLAN_PRICING[p].annual
              : PLAN_PRICING[p].monthly;
          return (
            <button
              key={p}
              type="button"
              onClick={() => patch({ plan: p })}
              className={`flex w-full items-start justify-between gap-4 rounded-xl border-[1.5px] px-4 py-3 text-left transition ${
                active
                  ? "border-primary-500 bg-primary-50/60"
                  : "border-neutral-200 bg-white/80 hover:border-neutral-300"
              }`}
            >
              <div>
                <div className="text-body font-semibold text-text-primary">
                  {PLAN_LABELS[p]}
                </div>
                <div className="text-caption text-text-tertiary">
                  {PLAN_TAGLINES[p]}
                </div>
              </div>
              <div className="text-right">
                <div className="text-body font-bold text-text-primary">
                  {price}
                </div>
                <div className="text-caption text-text-tertiary">
                  / mo
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Step 5 — Referral source (skippable)
// ============================================================

function Step5({
  data,
  patch,
}: {
  data: WizardData;
  patch: (u: Partial<WizardData>) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-text-primary">
        How did you hear about Sukona?
      </h1>
      <p className="mt-1.5 text-body-sm text-text-secondary">
        Helps us reach more salons like yours.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {REFERRAL_SOURCES.map((s) => {
          const active = data.referralSource === s.code;
          return (
            <button
              key={s.code}
              type="button"
              onClick={() => patch({ referralSource: s.code })}
              className={`rounded-xl border-[1.5px] px-4 py-3 text-left text-body-sm font-medium transition ${
                active
                  ? "border-primary-500 bg-primary-50/60 text-text-primary"
                  : "border-neutral-200 bg-white/80 text-text-secondary hover:border-neutral-300 hover:text-text-primary"
              }`}
            >
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
