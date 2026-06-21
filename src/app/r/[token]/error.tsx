"use client";

import { useEffect } from "react";

/**
 * Public review page error boundary. The customer is a real, paying
 * person who's been sent a review link via WhatsApp — a Next.js 500
 * screen on this surface looks like the salon is broken. Show
 * something neutral and reassuring instead.
 */
export default function ReviewError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error("[review token error boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 text-center">
        <h1 className="text-title-section font-semibold text-text-primary">
          We couldn&apos;t load this page
        </h1>
        <p className="mt-2 text-body-sm text-text-secondary">
          Please try again in a moment, or reach out to the salon directly.
        </p>
      </div>
    </div>
  );
}
