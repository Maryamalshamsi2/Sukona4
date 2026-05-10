import { forwardRef, type SelectHTMLAttributes } from "react";

/* ─────────────────────────────────────────────
   Select
   Design-system compliant native select.
   ~48px touch target on mobile, ~44px on desktop.
   ───────────────────────────────────────────── */

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Apply error styling */
  error?: boolean;
}

const base =
  "block w-full appearance-none rounded-xl border-[1.5px] bg-white px-4 pr-9 text-body text-text-primary transition focus:outline-none focus:ring-2 disabled:bg-neutral-50 disabled:text-text-disabled disabled:cursor-not-allowed";

/*
 * Custom caret — inline SVG as background-image so we
 * keep native <select> behaviour without extra DOM.
 */
const caretStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2386868B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.5rem center",
  backgroundSize: "1rem",
};

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error = false, className = "", style, children, ...props }, ref) => {
    const borderClasses = error
      ? "border-error-500 focus:border-error-500 focus:ring-error-500/20"
      : "border-neutral-200 focus:border-neutral-400 focus:ring-primary-100";

    return (
      <select
        ref={ref}
        className={`${base} ${borderClasses} py-3 sm:py-2.5 ${className}`}
        style={{ ...caretStyle, ...style }}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = "Select";
export default Select;
