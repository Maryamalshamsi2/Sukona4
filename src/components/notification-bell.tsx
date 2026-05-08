"use client";

import { useEffect, useRef, useState } from "react";
import {
  getNotifications,
  markNotificationsRead,
  type NotificationItem,
} from "@/app/(dashboard)/actions";

/**
 * Bell icon in the dashboard header with an unread-count badge.
 *
 * - Polls every 60s while mounted so badges update without a refresh
 * - Opens a dropdown listing the most recent activity_log entries
 * - On open, marks notifications as read (sets profile's
 *   notifications_last_read_at to now), then refetches so the badge
 *   clears immediately
 * - Click outside to close
 */
export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // Initial load + 60s polling
  useEffect(() => {
    let cancelled = false;
    async function fetchOnce() {
      const data = await getNotifications(20);
      if (cancelled) return;
      setItems(data.items);
      setUnread(data.unreadCount);
      setLoading(false);
    }
    fetchOnce();
    const t = setInterval(fetchOnce, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function handleOpen() {
    setOpen(true);
    if (unread > 0) {
      // Optimistically clear the badge, then persist.
      setUnread(0);
      await markNotificationsRead();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-active hover:text-text-secondary"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute right-1 top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#F5F5F7]">
            {unread > 20 ? "20+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white shadow-lg ring-1 ring-black/5 sm:w-96">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-body-sm font-semibold text-text-primary">
              Notifications
            </h3>
          </div>

          <div className="max-h-96 overflow-y-auto py-1">
            {loading ? (
              <p className="px-4 py-6 text-center text-body-sm text-text-tertiary">
                Loading…
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-body-sm text-text-tertiary">
                You&apos;re all caught up.
              </p>
            ) : (
              items.map((it) => <NotificationRow key={it.id} item={it} onClose={() => setOpen(false)} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  onClose,
}: {
  item: NotificationItem;
  onClose: () => void;
}) {
  // We navigate to /calendar — the most useful landing place for an
  // appointment event. /appointments would also work but the calendar
  // gives spatial context.
  const href = item.appointment_id ? `/calendar` : "#";

  return (
    <a
      href={href}
      onClick={onClose}
      className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${actionDotColor(item.action)}`} />
      <div className="flex-1 min-w-0">
        <p className="text-body-sm text-text-primary leading-snug">
          {item.description}
        </p>
        <p className="mt-0.5 text-caption text-text-tertiary">
          {relativeTime(item.created_at)}
          {item.performed_by_name ? ` · ${item.performed_by_name}` : ""}
        </p>
      </div>
    </a>
  );
}

function actionDotColor(action: string): string {
  switch (action) {
    case "created":
    case "petty_cash_added":
      return "bg-green-500";
    case "cancelled":
    case "expense_added":
    case "inventory_low_stock":
      return "bg-red-500";
    case "status_updated":
      return "bg-blue-500";
    case "time_changed":
    case "edited":
    case "inventory_adjusted":
      return "bg-amber-500";
    default:
      return "bg-neutral-400";
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}
