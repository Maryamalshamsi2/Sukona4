"use client";

import { useEffect } from "react";

/**
 * Public receipt page error boundary. Customer-facing — same rationale
 * as the review boundary. Don't show a Next.js 500 to someone the
 * salon just billed.
 */
export default function ReceiptError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error("[receipt token error boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 text-center">
        <h1 className="text-title-section font-semibold text-text-primary">
          We couldn&apos;t load this receipt
        </h1>
        <p className="mt-2 text-body-sm text-text-secondary">
          Please try again in a moment, or ask the salon to resend the link.
        </p>
      </div>
    </div>
  );
}
