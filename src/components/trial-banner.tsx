"use client";

/**
 * Trial banner — shown at the top of the dashboard for salons in (or
 * past) their 7-day free trial. Three states based on `trialEndsAt`:
 *
 *   null       — column not set (existing salons pre-migration-032 or
 *                future paid plans). No banner rendered.
 *   future     — active trial. "X days left in your trial" + soft CTA.
 *   past/now   — expired. "Trial ended — contact us at <email>" with
 *                a mailto link. Still non-blocking; user keeps access.
 */
export default function TrialBanner({
  trialEndsAt,
  contactEmail = "hellosukona@gmail.com",
}: {
  trialEndsAt: string | null;
  contactEmail?: string;
}) {
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
        <a
          href={`mailto:${contactEmail}`}
          className="font-semibold underline-offset-2 hover:underline"
        >
          Contact us to keep going →
        </a>
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
      <a
        href={`mailto:${contactEmail}`}
        className="font-semibold text-text-primary underline-offset-2 hover:underline"
      >
        Get in touch
      </a>
    </div>
  );
}
