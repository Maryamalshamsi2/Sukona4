"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Snackbar with an Undo affordance for destructive actions.
 *
 * Pattern: instead of a blocking confirm() dialog before the action,
 * the action runs immediately (or after a short delay for hard-delete)
 * and the user gets ~6 seconds to take it back via this toast.
 *
 * Flows that use it:
 *   - Cancel appointment      → fires server immediately, undo reverses
 *   - Mark no-show            → fires server immediately, undo reverses
 *   - Delete appointment      → DEFERS server call; undo cancels the timer
 *
 * The provider lives in the dashboard layout so any page can call
 * useUndo().show(...) and get the snackbar at the bottom of the screen.
 */

type ToastVariant = "default" | "error";

type ToastState = {
  message: string;
  variant: ToastVariant;
  onUndo?: () => void;
};

type UndoCtxValue = {
  /**
   * Show the snackbar with an Undo affordance. Auto-dismisses after
   * `durationMs` (default 6 s). If a previous toast is still on
   * screen its timer is cleared so the new one isn't dismissed
   * early; the previous undo is silently abandoned (its action
   * stays committed).
   */
  show: (message: string, onUndo: () => void, durationMs?: number) => void;
  /**
   * Show a plain error toast (red-tinted, no Undo). Used in place of
   * the inline `<p className="text-error-700">{error}</p>` banners
   * that used to push page content around.
   */
  error: (message: string, durationMs?: number) => void;
  /** Manually hide whatever's showing. */
  hide: () => void;
};

const UndoCtx = createContext<UndoCtxValue | null>(null);

export function UndoToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setState(null);
  }, [clearTimer]);

  const show = useCallback(
    (message: string, onUndo: () => void, durationMs = 6000) => {
      clearTimer();
      setState({ message, variant: "default", onUndo });
      timerRef.current = setTimeout(() => {
        setState(null);
        timerRef.current = null;
      }, durationMs);
    },
    [clearTimer],
  );

  const error = useCallback(
    (message: string, durationMs = 5000) => {
      clearTimer();
      setState({ message, variant: "error" });
      timerRef.current = setTimeout(() => {
        setState(null);
        timerRef.current = null;
      }, durationMs);
    },
    [clearTimer],
  );

  // Tidy up if the provider unmounts mid-toast.
  useEffect(() => () => clearTimer(), [clearTimer]);

  // Style varies by variant. Default = neutral-900 (success / undo);
  // error = red-tinted so the user immediately reads it as a problem.
  const toneClasses =
    state?.variant === "error"
      ? "bg-error-700 text-white"
      : "bg-neutral-900 text-text-inverse";
  const dismissClasses =
    state?.variant === "error"
      ? "text-white/70 hover:text-white"
      : "text-white/60 hover:text-white";

  return (
    <UndoCtx.Provider value={{ show, error, hide }}>
      {children}
      {state && (
        <div
          // Sits above the mobile bottom tab bar (~58px) + safe area;
          // on desktop the tab bar is hidden but the offset is still
          // safe. Centered horizontally with a viewport-clamp so long
          // messages don't push the toast off-screen.
          className={`fixed bottom-[calc(100px+env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-3 text-body-sm shadow-lg lg:bottom-6 ${toneClasses}`}
          role={state.variant === "error" ? "alert" : "status"}
          aria-live={state.variant === "error" ? "assertive" : "polite"}
        >
          <span className="truncate">{state.message}</span>
          {state.onUndo && (
            <button
              type="button"
              onClick={() => {
                state.onUndo!();
                hide();
              }}
              className="shrink-0 font-semibold text-white underline-offset-2 hover:underline"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={hide}
            aria-label="Dismiss"
            className={`shrink-0 rounded p-1 ${dismissClasses}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </UndoCtx.Provider>
  );
}

export function useUndo() {
  const ctx = useContext(UndoCtx);
  if (!ctx) throw new Error("useUndo must be used within UndoToastProvider");
  return ctx;
}
