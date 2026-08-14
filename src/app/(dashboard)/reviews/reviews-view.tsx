"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUndo } from "@/components/undo-toast";
import { useCurrency } from "@/lib/user-context";
import { formatCurrency } from "@/lib/currency";
import { getReviewsForMonth, upsertReview, type StaffMetric } from "./actions";

/**
 * Monthly performance review board.
 *
 * Layout:
 *   - Top: month picker (← current-label →). Default = current month.
 *   - Below: one card per staff member with a metric snapshot
 *     (appointments, revenue, tips, no-shows) and a notes textarea.
 *
 * Saving: notes auto-save 800 ms after the last keystroke (debounced
 * per-staff). Small "Saved · <time ago>" chip next to the name
 * confirms without a modal. Owners can revisit past months — same
 * layout, still writable.
 *
 * Owner + admin only. Server + RLS enforce that, but the sidebar link
 * is hidden for staff so they don't even see the URL.
 */

interface Props {
  initialMonth: string;
  initialRows: StaffMetric[];
  /** Admin viewers see only staff rows and no metric tiles (per spec).
   *  Owner viewers see staff + admin rows with tiles. Server-side is
   *  the authority — this prop just spares the client a re-derivation. */
  viewerIsAdmin: boolean;
}

/** Ex: "2026-08" → "August 2026". */
function humanMonth(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(y, mm - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Step by ±1 month within the "YYYY-MM" grammar. */
function stepMonth(m: string, delta: number): string {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(y, mm - 1 + delta, 1);
  const yy = d.getFullYear();
  const mm2 = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm2}`;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ReviewsView({ initialMonth, initialRows, viewerIsAdmin }: Props) {
  const undo = useUndo();
  const currency = useCurrency();

  const [month, setMonth] = useState(initialMonth);
  const [rows, setRows] = useState<StaffMetric[]>(initialRows);
  const [loading, setLoading] = useState(false);

  // Per-staff draft state — separate from `rows[i].review.notes` so
  // typing feels instant and doesn't cause the whole card to re-mount.
  // Keyed by staff_id.
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const r of initialRows) d[r.staff_id] = r.review?.notes ?? "";
    return d;
  });
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const reload = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const res = await getReviewsForMonth(m);
      if ("error" in res) {
        undo.error(res.error ?? "Failed to load reviews");
        return;
      }
      setRows(res.rows);
      // Refresh drafts for the new month — never overwrite unsaved
      // in-flight text, but on month switch the previous drafts
      // don't apply; take the fresh persisted notes.
      const next: Record<string, string> = {};
      for (const r of res.rows) next[r.staff_id] = r.review?.notes ?? "";
      setDrafts(next);
      setSavedAt({});
    } finally {
      setLoading(false);
    }
  }, [undo]);

  useEffect(() => {
    if (month === initialMonth) return; // initial payload already rendered
    void reload(month);
  }, [month, initialMonth, reload]);

  // Cancel any pending timers on unmount so a stale save doesn't
  // fire after the user leaves the page.
  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
    };
  }, []);

  function onNotesChange(staffId: string, next: string) {
    setDrafts((prev) => ({ ...prev, [staffId]: next }));
    // Debounce a save 800 ms after the last keystroke.
    const existing = saveTimersRef.current[staffId];
    if (existing) clearTimeout(existing);
    saveTimersRef.current[staffId] = setTimeout(() => {
      void saveNotes(staffId, next);
    }, 800);
  }

  async function saveNotes(staffId: string, notes: string) {
    setSavingIds((prev) => new Set(prev).add(staffId));
    const res = await upsertReview(staffId, month, notes);
    setSavingIds((prev) => {
      const next = new Set(prev);
      next.delete(staffId);
      return next;
    });
    if ("error" in res && res.error) {
      undo.error(`Failed to save note: ${res.error}`);
      return;
    }
    setSavedAt((prev) => ({ ...prev, [staffId]: new Date().toISOString() }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-title-page font-bold tracking-tight text-text-primary">
            Performance
          </h1>
        </div>

        {/* Month picker. Prev / Human label / Next. */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth((m) => stepMonth(m, -1))}
            aria-label="Previous month"
            className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="min-w-[140px] text-center text-body-sm font-semibold text-text-primary tabular-nums">
            {humanMonth(month)}
          </span>
          <button
            type="button"
            onClick={() => setMonth((m) => stepMonth(m, +1))}
            aria-label="Next month"
            className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {loading && (
        <p className="mt-4 text-body-sm text-text-tertiary">Loading…</p>
      )}

      {!loading && rows.length === 0 && (
        <div className="mt-8 rounded-2xl border border-border bg-surface-subtle px-6 py-10 text-center">
          <p className="text-body-sm text-text-secondary">
            No staff in this salon yet. Add team members on the /team page to start reviewing.
          </p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rows.map((r) => {
          const draft = drafts[r.staff_id] ?? "";
          const saving = savingIds.has(r.staff_id);
          const lastSavedTs = savedAt[r.staff_id] ?? r.review?.updated_at ?? "";
          const authored = r.review?.author_name;
          return (
            <div
              key={r.staff_id}
              className="rounded-2xl border border-border bg-white px-5 py-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body font-semibold text-text-primary truncate">
                    {r.full_name || "Unnamed"}
                  </p>
                  <p className="text-caption text-text-tertiary capitalize">{r.role}</p>
                </div>
                <div className="shrink-0 text-right text-caption">
                  {saving ? (
                    <span className="text-text-tertiary">Saving…</span>
                  ) : lastSavedTs ? (
                    <span className="text-text-tertiary">
                      Saved {timeAgo(lastSavedTs)}
                      {authored && <> · by {authored}</>}
                    </span>
                  ) : (
                    <span className="text-text-tertiary">Not written yet</span>
                  )}
                </div>
              </div>

              {/* Metric snapshot — owner-only. Admins see notes
                  without the numeric context per spec. */}
              {!viewerIsAdmin && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MetricTile label="Completed" value={String(r.metrics.appointmentsCompleted)} />
                  <MetricTile
                    label="Revenue"
                    value={formatCurrency(r.metrics.revenueAttributed, currency)}
                  />
                  <MetricTile
                    label="Tips"
                    value={formatCurrency(r.metrics.tipsReceived, currency)}
                  />
                  <MetricTile
                    label="Sales"
                    value={formatCurrency(r.metrics.retailSales, currency)}
                  />
                </div>
              )}

              {/* Notes */}
              <textarea
                value={draft}
                onChange={(e) => onNotesChange(r.staff_id, e.target.value)}
                rows={4}
                placeholder={`Notes for ${r.full_name || "this staff"} in ${humanMonth(month)}…`}
                className="mt-4 block w-full resize-y rounded-xl border-[1.5px] border-gray-200 bg-white px-4 py-3 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-subtle px-3 py-2 ring-1 ring-border">
      <p className="text-caption text-text-tertiary">{label}</p>
      <p className="mt-0.5 text-body-sm font-semibold tabular-nums text-text-primary">
        {value}
      </p>
    </div>
  );
}
