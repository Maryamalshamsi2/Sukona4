import type { Viewport } from "next";
import Link from "next/link";

/**
 * Tints the iOS Safari URL bar and bottom toolbar so they blend with
 * the gradient on the auth pages instead of showing the default
 * light gray.
 *
 * The auth pages use `bg-gradient-to-br from-violet-50 via-white
 * to-violet-100/60` — note that "violet" is remapped in globals.css
 * to a warm peach palette (--color-violet-50: #FFF8F1, --color-violet-100:
 * #FEEAD2). So the gradient is actually a soft cream → white → soft peach,
 * NOT lavender. Theme color is picked to blend with both edges.
 */
export const viewport: Viewport = {
  themeColor: "#FFFFFF",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Override the root layout's gray body bg so iOS overscroll
          bounce and the Safari chrome both blend with the page's
          pure white. */}
      <style>{`body { background-color: #FFFFFF; }`}</style>
      {/* "Homepage" affordance — top-left, above the auth card. Anon
          visitors hit /login or /signup directly via shared links and
          may want to read the marketing page first. Tiny chevron + text,
          minimal weight so it never competes with the form. */}
      <Link
        href="/landing"
        className="fixed left-4 top-4 z-50 inline-flex items-center gap-1 text-body-sm text-text-secondary transition hover:text-text-primary sm:left-6 sm:top-6"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Homepage
      </Link>
      {children}
    </>
  );
}
