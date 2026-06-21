"use client";

import { useEffect } from "react";

/**
 * Dashboard error boundary. Catches errors thrown from any (dashboard)
 * route's server component, client component, or layout. Without this
 * a transient Supabase failure during a Promise.all (home/calendar/
 * reports all do this) shows a generic Next.js error screen for every
 * staff member at once.
 *
 * `reset` re-renders the segment — the user keeps their auth session
 * and ends up back where they were. Logs the error to the console so
 * Sentry/Vercel logs catch it.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-title-section font-semibold text-text-primary">
          Something went wrong
        </h1>
        <p className="mt-2 text-body-sm text-text-secondary">
          We hit a temporary issue loading this page. Try again — the rest of
          your data is safe.
        </p>
        {error.digest && (
          <p className="mt-3 text-caption font-mono text-text-tertiary">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-neutral-900 px-5 py-2.5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 transition"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-xl border border-border bg-white px-5 py-2.5 text-body-sm font-semibold text-text-primary hover:bg-surface-hover transition"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
