"use client";

import { useEffect, useRef } from "react";

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  variant = "drawer",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "md" | "lg";
  /**
   * "drawer" (default) — on desktop, slides in as a right-side panel
   *                      (full page height, ~480px wide, no rounded corners).
   * "center"           — classic centered dialog.
   * Mobile behavior is identical for both variants (full-screen sheet).
   */
  variant?: "center" | "drawer";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  // Click outside the drawer content (i.e. on the backdrop / empty dialog area)
  // closes the modal. The native <dialog> fires click on itself for backdrop clicks.
  const handleClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const desktopClasses =
    variant === "drawer"
      ? // Right-side drawer — no rounded corners, square panel flush with viewport edge.
        "sm:left-auto sm:right-0 sm:top-0 sm:bottom-0 sm:translate-x-0 sm:translate-y-0 sm:m-0 sm:h-screen sm:max-h-screen sm:w-[480px] sm:max-w-[92vw] sm:rounded-none sm:shadow-xl sm:ring-1 sm:ring-black/5"
      : // Centered dialog.
        `sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:m-auto sm:h-auto sm:max-h-[90vh] sm:w-full sm:rounded-2xl sm:shadow-lg sm:ring-1 sm:ring-black/5 ${
          size === "lg" ? "sm:max-w-lg" : "sm:max-w-md"
        }`;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleClick}
      data-variant={variant}
      className={`modal-root fixed inset-0 m-0 h-full w-full max-w-none max-h-none bg-white p-0 shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-sm ${desktopClasses}`}
    >
      <div
        className={`flex h-full flex-col ${
          variant === "drawer" ? "sm:h-full sm:max-h-none" : "sm:h-auto sm:max-h-[90vh]"
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-title-section font-semibold tracking-tight text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-tertiary hover:bg-surface-active hover:text-text-secondary -mr-1"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Scrollable body. On mobile, extra bottom padding lifts the
            content above the iOS home-indicator gesture bar — without
            this the last action row of a long form/drawer crowded the
            edge of the screen. Desktop keeps the original 24 px floor. */}
        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-[max(1.5rem,calc(1rem+env(safe-area-inset-bottom)))] sm:pb-6">
          {children}
        </div>
      </div>
    </dialog>
  );
}
