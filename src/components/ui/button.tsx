import { forwardRef, type ButtonHTMLAttributes } from "react";

/* ─────────────────────────────────────────────
   Button
   Design-system compliant button component.
   Variants: primary | secondary | outline | danger
   Sizes: sm | md (default) | lg
   ───────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/* Shared base classes applied to every button */
const base =
  "inline-flex items-center justify-center font-semibold rounded-xl transition-all active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:pointer-events-none";

/* Variant-specific classes */
const variantClasses: Record<Variant, string> = {
  primary:
    "bg-neutral-900 text-text-inverse hover:bg-neutral-800 focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2",
  secondary:
    "bg-surface-active text-text-primary hover:bg-neutral-100 focus:ring-2 focus:ring-neutral-200",
  outline:
    "border-[1.5px] border-neutral-200 bg-white text-text-primary hover:bg-surface-hover focus:ring-2 focus:ring-neutral-200",
  danger:
    "border-[1.5px] border-error-500/20 text-error-700 hover:bg-error-50 focus:ring-2 focus:ring-error-500/20",
};

/*
 * Size classes — mobile-first with generous touch targets.
 * sm:  compact, used inside dense UI (tables, inline actions)
 * md:  default, ~48px mobile → ~44px desktop
 * lg:  auth/CTA, ~52px mobile → ~48px desktop
 */
const sizeClasses: Record<Size, string> = {
  sm: "px-4 py-2 text-body-sm gap-2 sm:py-1.5",
  md: "px-4 py-3 text-body gap-2 sm:py-2.5",
  lg: "px-6 py-3.5 text-body gap-2 sm:py-3",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${base} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
export default Button;
