"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Modal from "@/components/modal";
import { useSearchQuery } from "@/lib/search-context";
import { createBrowserClient } from "@supabase/ssr";
import { useCurrentUser } from "@/lib/user-context";
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getPettyCashBalance,
  getPettyCashLog,
  addPettyCashDeposit,
  getUserRole,
} from "./actions";

export interface Expense {
  id: string;
  description: string;
  amount: number;
  expense_type: string;
  date: string;
  time: string | null;
  notes: string | null;
  receipt_url: string | null;
  is_private: boolean;
  paid_from_petty_cash: boolean;
  created_at: string;
  /** Migration 028: who logged this expense. Used to gate edit/delete
   *  for staff so they can only modify their own entries. */
  created_by: string | null;
}

export interface PettyCashEntry {
  id: string;
  amount: number;
  type: string;
  description: string;
  expense_id: string | null;
  created_by: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
}

const EXPENSE_TYPES = [
  "Supplies",
  "Equipment",
  "Rent",
  "Utilities",
  "Transportation",
  "Marketing",
  "Salary",
  "Training",
  "Other",
];

type DatePreset = "today" | "week" | "month" | "custom";

const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
  custom: "Custom",
};

function toISODate(d: Date) {
  // Local-tz YYYY-MM-DD. toISOString() would shift dates back a day for
  // users east of UTC; see (dashboard)/page.tsx for the full reasoning.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPresetRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = toISODate(now);

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { from: toISODate(d), to: today };
    }
    case "month": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { from: toISODate(d), to: today };
    }
    default:
      return { from: today, to: today };
  }
}

function formatCurrency(amount: number) {
  return `AED ${amount.toFixed(2)}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime12(time24: string) {
  const [h, m] = time24.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${m} ${ampm}`;
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " at " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export interface ExpensesViewProps {
  initialExpenses: Expense[];
  initialPettyCashBalance: number;
  initialUserRole: string | null;
}

export default function ExpensesView({
  initialExpenses,
  initialPettyCashBalance,
  initialUserRole,
}: ExpensesViewProps) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selected, setSelected] = useState<Expense | null>(null);
  // URL of the receipt image being previewed in the lightbox. Tapping the
  // paperclip icon on a row sets this; backdrop or close-button clears it.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Search query is owned by the dashboard layout's header input via
  // SearchContext — typing there filters this list automatically.
  const searchQuery = useSearchQuery();

  // Type filter dropdown — opens via the funnel-icon button next to "+",
  // matching the staff filter on the calendar page for visual consistency.
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filterOpen) return;
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterOpen]);

  // Petty cash
  const [pettyCashBalance, setPettyCashBalance] = useState(initialPettyCashBalance);
  const [pettyCashLog, setPettyCashLog] = useState<PettyCashEntry[]>([]);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [pettyCashLogOpen, setPettyCashLogOpen] = useState(false);

  // Role + identity (used to gate edit/delete on a per-row basis: staff
  // can only modify expenses they themselves created).
  const [userRole, setUserRole] = useState<string | null>(initialUserRole);
  const currentUser = useCurrentUser();

  const isOwner = userRole === "owner";
  const isOwnerOrAdmin = userRole === "owner" || userRole === "admin";

  function canEditExpense(e: Expense): boolean {
    if (isOwnerOrAdmin) return true;
    return !!currentUser && e.created_by === currentUser.id;
  }

  const loadData = useCallback(async () => {
    try {
      const [data, balance, role] = await Promise.all([
        getExpenses(),
        getPettyCashBalance(),
        getUserRole(),
      ]);
      setExpenses(data as Expense[]);
      setPettyCashBalance(balance);
      setUserRole(role);
    } catch {
      setError("Failed to load expenses");
    }
  }, []);

  const dateRange =
    datePreset === "custom" && customFrom && customTo
      ? { from: customFrom, to: customTo }
      : datePreset === "custom"
        ? null
        : getPresetRange(datePreset);

  const filtered = expenses.filter((e) => {
    if (filterType && e.expense_type !== filterType) return false;
    if (dateRange) {
      if (e.date < dateRange.from || e.date > dateRange.to) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return e.description.toLowerCase().includes(q) || e.expense_type.toLowerCase().includes(q);
    }
    return true;
  });

  const totalAmount = filtered.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div>
      {/* Title row */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-title-page font-bold tracking-tight text-text-primary">Expenses</h1>
        <div className="flex items-center gap-1 shrink-0">
          {/* Type filter — funnel icon, mirrors the staff filter on calendar
              for cross-page consistency. */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((v) => !v)}
              aria-label="Filter"
              className={`rounded-lg p-2 ${
                filterType || datePreset !== "month"
                  ? "bg-surface-active text-text-primary"
                  : "text-text-tertiary hover:bg-surface-hover hover:text-text-secondary"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
            </button>

            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5">
                {/* Period section */}
                <p className="px-3 pt-2 pb-1 text-caption font-semibold uppercase tracking-wide text-text-tertiary">
                  Period
                </p>
                {(Object.keys(PRESET_LABELS) as DatePreset[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setDatePreset(p); setFilterOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-body-sm hover:bg-surface-hover ${
                      datePreset === p ? "text-text-primary font-semibold" : "text-text-secondary"
                    }`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                      datePreset === p ? "border-gray-900 bg-neutral-900" : "border-neutral-200"
                    }`}>
                      {datePreset === p && (
                        <svg className="h-3 w-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                    {PRESET_LABELS[p]}
                  </button>
                ))}

                <div className="my-1 border-t border-border" />

                {/* Type section */}
                <p className="px-3 pt-2 pb-1 text-caption font-semibold uppercase tracking-wide text-text-tertiary">
                  Type
                </p>
                <button
                  onClick={() => { setFilterType(""); setFilterOpen(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-body-sm hover:bg-surface-hover ${
                    filterType === "" ? "text-text-primary font-semibold" : "text-text-secondary"
                  }`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                    filterType === "" ? "border-gray-900 bg-neutral-900" : "border-neutral-200"
                  }`}>
                    {filterType === "" && (
                      <svg className="h-3 w-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </span>
                  All Types
                </button>
                {EXPENSE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setFilterType(t); setFilterOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-body-sm hover:bg-surface-hover ${
                      filterType === t ? "text-text-primary font-semibold" : "text-text-secondary"
                    }`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                      filterType === t ? "border-gray-900 bg-neutral-900" : "border-neutral-200"
                    }`}>
                      {filterType === t && (
                        <svg className="h-3 w-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Desktop add button. Mobile gets a thumb-zone FAB at the
              bottom of the screen instead — see below. */}
          <button
            onClick={() => setAddModalOpen(true)}
            aria-label="Add expense"
            className="hidden shrink-0 sm:flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Custom date inputs — only when "Custom" is the selected preset
          (chosen from the filter dropdown). The from/to inputs are too
          wide for the dropdown itself, so they live here below the
          title row. Other presets (Today/Week/Month) render no UI. */}
      {datePreset === "custom" && (
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:flex-none sm:py-2.5 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <span className="text-body-sm text-text-tertiary">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:flex-none sm:py-2.5 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
      )}

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-body-sm text-error-700">{error}</p>}

      {/* Petty Cash Card */}
      <div className="mb-6 rounded-2xl ring-1 ring-border bg-white p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">Petty Cash Balance</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${pettyCashBalance >= 0 ? "text-text-primary" : "text-error-700"}`}>
              {formatCurrency(pettyCashBalance)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const log = await getPettyCashLog();
                setPettyCashLog(log as PettyCashEntry[]);
                setPettyCashLogOpen(true);
              }}
              className="rounded-xl border border-gray-200 px-4 py-2.5 sm:px-5 text-caption font-semibold text-text-secondary hover:bg-surface-hover transition-colors sm:text-body-sm"
            >
              History
            </button>
            <button
              onClick={() => setDepositModalOpen(true)}
              aria-label="Add funds"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Expense List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl ring-1 ring-border bg-white px-6 py-16 text-center text-body-sm text-text-tertiary">
          No expenses found
        </div>
      ) : (
        <div className="rounded-2xl ring-1 ring-border bg-white divide-y divide-border">
          {filtered.map((expense) => {
            const editable = canEditExpense(expense);
            return (
            // Row is a div+role=button (instead of <button>) so the receipt
            // icon inside can be its own real <button> — nested <button>
            // is invalid HTML.
            //
            // Staff who didn't create this expense get a non-interactive
            // div: no click handler, no hover, no focus ring. They can
            // still see the row + tap the receipt icon to view it.
            <div
              key={expense.id}
              {...(editable
                ? {
                    role: "button" as const,
                    tabIndex: 0,
                    onClick: () => { setSelected(expense); setEditModalOpen(true); },
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(expense);
                        setEditModalOpen(true);
                      }
                    },
                  }
                : {})}
              className={`flex w-full items-center gap-3 px-4 py-4 text-left transition-colors sm:gap-4 sm:px-6 ${
                editable ? "cursor-pointer hover:bg-surface-hover" : "cursor-default"
              }`}
            >
              {/* Description */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-body-sm font-semibold text-text-primary">{expense.description}</p>
                  {expense.is_private && (
                    <svg className="h-3.5 w-3.5 shrink-0 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  )}
                </div>
                <p className="text-caption text-text-secondary">
                  {formatDate(expense.date)}
                  {expense.time && <> · {formatTime12(expense.time)}</>}
                </p>
              </div>

              {/* Receipt — tappable preview button. stopPropagation keeps
                  the row's edit-modal click from firing. */}
              {expense.receipt_url && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewUrl(expense.receipt_url);
                  }}
                  aria-label="View receipt"
                  className="shrink-0 rounded-lg p-2 text-text-tertiary transition-colors hover:bg-neutral-100 hover:text-text-primary"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                </button>
              )}

              {/* Amount */}
              <span className="shrink-0 text-body-sm font-semibold text-text-primary">
                {formatCurrency(Number(expense.amount))}
              </span>
            </div>
            );
          })}
        </div>
      )}

      {/* Bottom total — reflects the currently-visible filtered set */}
      {filtered.length > 0 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-body-sm">
          <span className="text-text-tertiary">Total</span>
          <span className="font-semibold text-text-primary">{formatCurrency(totalAmount)}</span>
        </div>
      )}

      {/* Add Expense Modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Expense">
        <ExpenseForm
          isOwner={isOwner}
          onSubmit={async (desc, amount, type, date, time, notes, receiptUrl, isPrivate, paidFromPettyCash) => {
            setError(null);
            const result = await createExpense(desc, amount, type, date, time, notes, receiptUrl, isPrivate, paidFromPettyCash);
            if (result.error) { setError(result.error); return; }
            setAddModalOpen(false);
            loadData();
          }}
          onCancel={() => setAddModalOpen(false)}
          submitLabel="Add Expense"
        />
      </Modal>

      {/* Edit Expense Modal */}
      <Modal open={editModalOpen} onClose={() => { setEditModalOpen(false); setSelected(null); }} title="Edit Expense">
        {selected && (
          <ExpenseForm
            isOwner={isOwner}
            defaultValues={selected}
            onSubmit={async (desc, amount, type, date, time, notes, receiptUrl, isPrivate, paidFromPettyCash) => {
              setError(null);
              const result = await updateExpense(selected.id, desc, amount, type, date, time, notes, receiptUrl, isPrivate, paidFromPettyCash);
              if (result.error) { setError(result.error); return; }
              setEditModalOpen(false);
              setSelected(null);
              loadData();
            }}
            onCancel={() => { setEditModalOpen(false); setSelected(null); }}
            onDelete={async () => {
              if (!confirm("Delete this expense?")) return;
              const result = await deleteExpense(selected.id);
              if (result.error) { setError(result.error); return; }
              setEditModalOpen(false);
              setSelected(null);
              loadData();
            }}
            submitLabel="Save"
          />
        )}
      </Modal>

      {/* Add Funds (Petty Cash Deposit) Modal */}
      <Modal open={depositModalOpen} onClose={() => setDepositModalOpen(false)} title="Add Funds to Petty Cash">
        <DepositForm
          onSubmit={async (amount, description) => {
            setError(null);
            const result = await addPettyCashDeposit(amount, description);
            if (result.error) { setError(result.error); return; }
            setDepositModalOpen(false);
            loadData();
          }}
          onCancel={() => setDepositModalOpen(false)}
        />
      </Modal>

      {/* Petty Cash History Modal */}
      <Modal open={pettyCashLogOpen} onClose={() => setPettyCashLogOpen(false)} title="Petty Cash History">
        <div className="max-h-[60vh] overflow-y-auto -mx-1">
          {pettyCashLog.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-text-tertiary">No transactions yet</p>
          ) : (
            <div className="divide-y divide-border">
              {pettyCashLog.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-1 py-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    entry.type === "deposit"
                      ? "bg-green-50 text-green-600"
                      : "bg-red-50 text-error-500"
                  }`}>
                    {entry.type === "deposit" ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-semibold text-text-primary truncate">{entry.description}</p>
                    <p className="text-caption text-text-tertiary">
                      {formatDateTime(entry.created_at)}
                      {entry.profiles?.full_name && <> · {entry.profiles.full_name}</>}
                    </p>
                  </div>
                  <span className={`shrink-0 text-body-sm font-semibold ${
                    entry.type === "deposit" ? "text-green-600" : "text-error-500"
                  }`}>
                    {entry.type === "deposit" ? "+" : "-"}{formatCurrency(Number(entry.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Receipt preview lightbox — opened by tapping the paperclip on a row.
          Backdrop click + close button both dismiss. */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-3 -right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-text-primary shadow-lg hover:bg-neutral-100"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Receipt"
              className="max-h-[90vh] max-w-[90vw] rounded-lg"
            />
          </div>
        </div>
      )}

      {/* ==== MOBILE FAB ==== */}
      <button
        type="button"
        onClick={() => setAddModalOpen(true)}
        aria-label="Add expense"
        className="fixed bottom-[calc(100px+env(safe-area-inset-bottom))] right-6 z-40 sm:hidden flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-text-inverse shadow-lg active:scale-[0.97] transition-transform"
      >
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    </div>
  );
}

// ---- Deposit Form ----

function DepositForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (amount: number, description: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !description.trim()) return;
    setSubmitting(true);
    await onSubmit(parseFloat(amount), description.trim());
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Amount (AED)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          required
        />
      </div>
      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Monthly top-up, Cash from client payment"
          className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          required
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-xl bg-surface-active hover:bg-neutral-100 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-primary">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="rounded-xl bg-neutral-900 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all disabled:opacity-50">
          {submitting ? "Adding..." : "Add Funds"}
        </button>
      </div>
    </form>
  );
}

// ---- Expense Form ----

function ExpenseForm({
  defaultValues,
  isOwner,
  onSubmit,
  onCancel,
  onDelete,
  submitLabel,
}: {
  defaultValues?: Expense;
  isOwner: boolean;
  onSubmit: (desc: string, amount: number, type: string, date: string, time: string | null, notes: string, receiptUrl: string | null, isPrivate: boolean, paidFromPettyCash: boolean) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const [description, setDescription] = useState(defaultValues?.description || "");
  const [amount, setAmount] = useState(defaultValues?.amount?.toString() || "");
  const [expenseType, setExpenseType] = useState(defaultValues?.expense_type || "Supplies");
  const [date, setDate] = useState(defaultValues?.date || toISODate(new Date()));
  const [time, setTime] = useState(defaultValues?.time?.slice(0, 5) || "");
  const [notes, setNotes] = useState(defaultValues?.notes || "");
  const [receiptUrl, setReceiptUrl] = useState(defaultValues?.receipt_url || "");
  const [isPrivate, setIsPrivate] = useState(defaultValues?.is_private || false);
  // Default ON for new expenses — most expenses are paid from petty cash
  // in practice. When editing an existing row we honor whatever it was
  // saved with (?? handles the false/undefined distinction correctly).
  const [paidFromPettyCash, setPaidFromPettyCash] = useState(
    defaultValues?.paid_from_petty_cash ?? true,
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function getFileName(url: string) {
    try {
      const parts = url.split("/");
      return decodeURIComponent(parts[parts.length - 1]);
    } catch {
      return "Receipt";
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("File must be smaller than 10MB");
      return;
    }

    setUploading(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const filePath = `receipts/${fileName}`;

      const { error } = await supabase.storage
        .from("receipts")
        .upload(filePath, file);

      if (error) {
        alert("Upload failed: " + error.message);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("receipts")
        .getPublicUrl(filePath);

      setReceiptUrl(urlData.publicUrl);
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment() {
    setReceiptUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !amount) return;
    setSubmitting(true);
    await onSubmit(
      description.trim(),
      parseFloat(amount),
      expenseType,
      date,
      time || null,
      notes.trim(),
      receiptUrl || null,
      isPrivate,
      paidFromPettyCash
    );
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Description */}
      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Nail polish supplies"
          className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          required
        />
      </div>

      {/* Amount + Type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Amount (AED)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            required
          />
        </div>
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
            Type <span className="font-normal text-text-tertiary">(optional)</span>
          </label>
          <select
            value={expenseType}
            onChange={(e) => setExpenseType(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            {EXPENSE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Date + Time — full width at every breakpoint so they match the
          width of all other form fields (Description, Notes, etc.) for
          visual consistency. */}
      <div className="space-y-6">
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            required
          />
        </div>
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Time (optional)</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-6">
        {/* Paid from petty cash */}
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={paidFromPettyCash}
            onClick={() => setPaidFromPettyCash(!paidFromPettyCash)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              paidFromPettyCash ? "bg-neutral-900" : "bg-gray-200"
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
              paidFromPettyCash ? "translate-x-[18px]" : "translate-x-[3px]"
            }`} />
          </button>
          <span className="text-body-sm text-text-primary">Paid from petty cash</span>
        </label>

        {/* Private expense (owner only) */}
        {isOwner && (
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              role="switch"
              aria-checked={isPrivate}
              onClick={() => setIsPrivate(!isPrivate)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                isPrivate ? "bg-neutral-900" : "bg-gray-200"
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                isPrivate ? "translate-x-[18px]" : "translate-x-[3px]"
              }`} />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-body-sm text-text-primary">Private expense</span>
              <svg className="h-3.5 w-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
          </label>
        )}
      </div>

      {/* Attachment */}
      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Attachment (optional)</label>
        {receiptUrl ? (
          <div className="flex items-center gap-2 rounded-xl ring-1 ring-border bg-[#F9F9F9] px-3 py-2">
            <svg className="h-5 w-5 shrink-0 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
            <a href={receiptUrl} target="_blank" rel="noopener noreferrer"
              className="flex-1 truncate text-body-sm text-text-secondary hover:text-text-primary hover:underline">
              {getFileName(receiptUrl)}
            </a>
            <button type="button" onClick={removeAttachment}
              className="shrink-0 text-caption text-error-500 hover:text-red-700">
              Remove
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              id="receipt-upload"
            />
            <label
              htmlFor="receipt-upload"
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-body-sm transition-colors hover:border-gray-400 hover:bg-surface-hover ${
                uploading ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {uploading ? (
                <>
                  <svg className="h-5 w-5 animate-spin text-text-secondary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-text-secondary">Uploading...</span>
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <span className="text-text-secondary">Upload receipt (image or PDF)</span>
                </>
              )}
            </label>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-2">
        {onDelete && (
          <button type="button" onClick={onDelete}
            className="rounded-xl border border-red-200 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-error-700 hover:bg-red-50">
            Delete
          </button>
        )}
        <div className="flex-1" />
        <button type="button" onClick={onCancel}
          className="rounded-xl bg-surface-active hover:bg-neutral-100 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-primary">
          Cancel
        </button>
        <button type="submit" disabled={submitting || uploading}
          className="rounded-xl bg-neutral-900 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all disabled:opacity-50">
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
