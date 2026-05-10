import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sukona",
  description: "Beauty business management system",
};

/**
 * Viewport config — applies to every route under the root layout.
 *
 * `interactiveWidget: "resizes-content"` tells Mobile Safari (and
 * Chrome on Android) to SHRINK the layout viewport when the virtual
 * keyboard opens, instead of overlaying it. The visible viewport
 * matches what the user sees, so:
 *
 *   - h-[100dvh] containers shorten to fit above the keyboard
 *   - fixed inset-0 modals stay fully visible
 *   - the bottom-stuck save buttons inside forms don't disappear
 *     behind the keyboard mid-typing
 *
 * Without this, the layout viewport stayed full-screen and any form
 * field below mid-screen would push the submit button under the
 * keyboard once focused — the user had to scroll the page or
 * dismiss the keyboard to commit.
 */
export const viewport: Viewport = {
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#F5F5F7] text-[#1D1D1F] antialiased font-sans">{children}</body>
    </html>
  );
}
