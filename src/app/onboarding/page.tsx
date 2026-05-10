"use client";

import { useEffect, useState } from "react";
import { getCurrentSalon, completeOnboarding } from "./actions";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

export default function OnboardingPage() {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill with the trigger-generated default name (e.g. "Mary's Salon")
  // and bounce away if onboarding is already done.
  useEffect(() => {
    async function init() {
      const salon = await getCurrentSalon();
      if (!salon) {
        // Should not happen — trigger always creates a salon. Safety bail.
        window.location.replace("/login");
        return;
      }
      if (salon.is_onboarded) {
        window.location.replace("/");
        return;
      }
      setName(salon.name || "");
      setCurrency(salon.currency || "AED");
      setBootLoading(false);
    }
    init();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await completeOnboarding(formData);

    if ("error" in result && result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    window.location.replace("/");
  }

  if (bootLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-violet-50 via-white to-violet-100/60">
        <p className="text-body-sm text-text-secondary">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 bg-gradient-to-br from-violet-50 via-white to-violet-100/60">
      <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/70 px-6 py-8 shadow-xl backdrop-blur-xl sm:px-10 sm:py-12">
        <div className="mb-8 text-center">
          <img src="/logo-dark.png" alt="Sukona" className="mx-auto h-[46px] w-auto sm:h-[50px]" />
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-text-primary">
            Tell us about your salon
          </h1>
          <p className="mt-2 text-body-sm text-text-secondary">
            This is what your team and clients will see. You can change it anytime.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-body-sm font-semibold text-text-primary mb-1.5">
              Salon name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={80}
              autoComplete="organization"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white/80 px-4 py-3 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 text-body sm:text-body-sm sm:py-2.5"
              placeholder="e.g. Ateeq Spa"
            />
          </div>

          <div>
            <label htmlFor="currency" className="block text-body-sm font-semibold text-text-primary mb-1.5">
              Currency
            </label>
            <select
              id="currency"
              name="currency"
              required
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white/80 px-4 py-3 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 text-body sm:text-body-sm sm:py-2.5"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-caption text-text-tertiary">
              All amounts in the app will display with this code. Change anytime in Settings.
            </p>
          </div>

          {error && (
            <p className="text-body-sm text-error-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-text-inverse font-semibold tracking-tight hover:bg-neutral-800 active:scale-[0.98] transition focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2 disabled:opacity-50 sm:py-2.5"
          >
            {loading ? "Saving…" : "Continue"}
          </button>

          <p className="text-center text-caption text-text-tertiary">
            You can fine-tune branding, contact info, and notification templates from <span className="font-medium text-text-secondary">Settings</span> later.
          </p>
        </form>
      </div>
    </div>
  );
}
