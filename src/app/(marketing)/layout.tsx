import type { Metadata } from "next";

/**
 * Marketing route group. Public-facing pages (the landing page, future
 * pricing/about/legal pages) share this layout and intentionally have
 * NO dashboard chrome — no sidebar, no top header, no bottom tab bar.
 * The sections render against a clean white canvas.
 */

export const metadata: Metadata = {
  title: "Sukona — The operational system for home-service beauty",
  description:
    "Sukona is the operational system for mobile beauty and wellness businesses. Bookings, team, clients, payments, and reports — all in one place. Built specifically for home-service freelancers and small teams.",
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
