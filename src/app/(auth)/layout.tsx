import type { Viewport } from "next";

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
      {children}
    </>
  );
}
