import type { Metadata } from "next";

/**
 * Marketing route group. Public-facing pages (the landing page, future
 * pricing/about/legal pages) share this layout and intentionally have
 * NO dashboard chrome — no sidebar, no top header, no bottom tab bar.
 * The sections render against a clean white canvas.
 */

export const metadata: Metadata = {
  title: "Sukona — Run your home-service business from one place",
  description:
    "Sukona is the calendar, payments, and team app built for freelancers and small home-service salons. Calm, mobile-first, designed for the way you actually work.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white text-text-primary antialiased">
      {/* Smooth scroll for in-page anchor navigation. The dashboard
          layout doesn't set this — keep it scoped to marketing. */}
      <style>{`html { scroll-behavior: smooth; }`}</style>
      {children}
    </div>
  );
}
