"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { getReviewContext, submitReview } from "./actions";
import type { ReviewContext } from "@/types";

/**
 * Public review page — accessible to anyone with the token, no login.
 *
 * Flow:
 *   1. Resolve token → ReviewContext (salon brand + appointment summary).
 *   2. Customer taps a star (1–5) and optionally writes a comment.
 *   3. On submit:
 *      - 4–5 stars + salon has public_review_url → redirect outward,
 *        record the rating internally for analytics.
 *      - Otherwise → save internally and show a thank-you screen.
 */
export default function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [ctx, setCtx] = useState<ReviewContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Form state
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [wantsFollowup, setWantsFollowup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await getReviewContext(token);
      if (cancelled) return;
      if (!data) {
        setNotFound(true);
      } else {
        setCtx(data);
        if (data.already_submitted) setSubmitted(true);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError("Please tap a star rating first.");
      return;
    }
    // Comment is required for low ratings (1-3) so we get actionable feedback.
    if (rating <= 3 && comment.trim().length === 0) {
      setError("Please tell us what could have been better.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await submitReview(token, rating, comment.trim(), wantsFollowup);
    if ("error" in result) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (result.redirect_url) {
      // Brief delay so the user sees the rating registered before bouncing.
      window.setTimeout(() => {
        window.location.href = result.redirect_url!;
      }, 350);
    } else {
      setSubmitted(true);
    }
    setSubmitting(false);
  }

  // ---------- States ----------

  if (loading) {
    return (
      <Shell>
        <p className="text-center text-body-sm text-text-tertiary">Loading…</p>
      </Shell>
    );
  }

  if (notFound) {
    return (
      <Shell>
        <h1 className="text-title-section font-semibold text-text-primary">
          This link is no longer valid
        </h1>
        <p className="mt-2 text-body-sm text-text-secondary">
          The review link may have expired or already been used.
        </p>
      </Shell>
    );
  }

  if (!ctx) return null;

  const brand = ctx.brand_color || "#171717";

  if (submitted) {
    return (
      <Shell brandColor={brand}>
        <h1 className="text-title-section font-semibold text-text-primary">
          Thank you{ctx.client_name ? `, ${ctx.client_name.split(" ")[0]}` : ""}!
        </h1>
        <p className="mt-2 text-body-sm text-text-secondary">
          Your feedback has been received. We appreciate you taking the time.
        </p>
      </Shell>
    );
  }

  // ---------- Form ----------

  return (
    <Shell brandColor={brand}>
      <h1 className="text-title-section font-semibold text-text-primary">
        How was your visit{ctx.client_name ? `, ${ctx.client_name.split(" ")[0]}` : ""}?
      </h1>
      <p className="mt-1.5 text-body-sm text-text-secondary">
        {ctx.salon_name} · {ctx.service_summary}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        {/* Star rating */}
        <div className="flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = (hover || rating) >= n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className="p-2 transition-transform hover:scale-110 active:scale-95"
              >
                <svg
                  className="h-10 w-10 transition-colors"
                  fill={active ? brand : "none"}
                  stroke={active ? brand : "#D1D5DB"}
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                  />
                </svg>
              </button>
            );
          })}
        </div>

        {/* Comment — only required when rating ≤ 3 */}
        {rating > 0 && (
          <div>
            <label htmlFor="comment" className="block text-body-sm font-semibold text-text-primary">
              {rating <= 3 ? "What could we have done better?" : "Anything else? (optional)"}
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              required={rating <= 3}
              placeholder={
                rating <= 3
                  ? "Tell us what went wrong — we want to make it right."
                  : "Share what you loved!"
              }
              className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 text-body text-text-primary transition-all focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
        )}

        {/* Follow-up toggle — only shown for low ratings */}
        {rating > 0 && rating <= 3 && (
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={wantsFollowup}
              onChange={(e) => setWantsFollowup(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-primary-100"
            />
            <span className="text-body-sm text-text-secondary">
              Please contact me about this.
            </span>
          </label>
        )}

        {error && <p className="text-body-sm text-error-700">{error}</p>}

        {rating > 0 && (
          <button
            type="submit"
            disabled={submitting}
            style={{ backgroundColor: brand }}
            className="w-full rounded-xl px-5 py-3 text-body-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        )}
      </form>
    </Shell>
  );
}

// ---- Shell (layout chrome) ----

function Shell({ children, brandColor }: { children: React.ReactNode; brandColor?: string }) {
  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
        {brandColor && (
          <div
            className="mb-6 h-1 w-12 rounded-full"
            style={{ backgroundColor: brandColor }}
          />
        )}
        {children}
      </div>
    </div>
  );
}
