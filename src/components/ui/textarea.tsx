import { forwardRef, type TextareaHTMLAttributes } from "react";

/* ─────────────────────────────────────────────
   Textarea
   Design-system compliant multi-line text input.
   Shares visual language with Input.
   ───────────────────────────────────────────── */

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Apply error styling */
  error?: boolean;
}

const base =
  "block w-full rounded-xl border-[1.5px] bg-white px-4 py-3 text-body text-text-primary placeholder:text-text-disabled transition focus:outline-none focus:ring-2 disabled:bg-neutral-50 disabled:text-text-disabled disabled:cursor-not-allowed sm:py-2.5";

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error = false, className = "", ...props }, ref) => {
    const borderClasses = error
      ? "border-error-500 focus:border-error-500 focus:ring-error-500/20"
      : "border-neutral-200 focus:border-neutral-400 focus:ring-primary-100";

    return (
      <textarea
        ref={ref}
        className={`${base} ${borderClasses} ${className}`}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
export default Textarea;
