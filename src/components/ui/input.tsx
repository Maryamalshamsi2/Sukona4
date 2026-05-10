import { forwardRef, type InputHTMLAttributes } from "react";

/* ─────────────────────────────────────────────
   Input
   Design-system compliant text input.
   ~48px touch target on mobile, ~44px on desktop.
   ───────────────────────────────────────────── */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Apply error styling */
  error?: boolean;
}

const base =
  "block w-full rounded-xl border-[1.5px] bg-white px-4 text-body text-text-primary placeholder:text-text-disabled transition focus:outline-none focus:ring-2 disabled:bg-neutral-50 disabled:text-text-disabled disabled:cursor-not-allowed";

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, className = "", ...props }, ref) => {
    const borderClasses = error
      ? "border-error-500 focus:border-error-500 focus:ring-error-500/20"
      : "border-neutral-200 focus:border-neutral-400 focus:ring-primary-100";

    return (
      <input
        ref={ref}
        className={`${base} ${borderClasses} py-3 sm:py-2.5 ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
export default Input;
