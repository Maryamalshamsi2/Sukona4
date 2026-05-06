import type { Viewport } from "next";

/**
 * Tints the iOS Safari URL bar and bottom toolbar so they blend with
 * the gradient on the auth pages instead of showing the default
 * light gray. Applies only to pages under the (auth) route group.
 *
 * Picked #F4F2FF — a soft lavender that sits between violet-50 (the
 * gradient's top) and violet-100/60 (the gradient's bottom), so both
 * the top and bottom system bars blend cleanly.
 */
export const viewport: Viewport = {
  themeColor: "#F4F2FF",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Override the root layout's gray body bg for auth routes only.
          Without this, iOS's overscroll/bounce reveals the default
          #F5F5F7 instead of blending with the gradient. */}
      <style>{`body { background-color: #F4F2FF; }`}</style>
      {children}
    </>
  );
}
