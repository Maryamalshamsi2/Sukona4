"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "@/components/modal";
import { useUndo } from "@/components/undo-toast";
import { useCurrency } from "@/lib/user-context";
import { formatCurrency } from "@/lib/currency";
import {
  getRetailSales,
  addRetailSale,
  updateRetailSale,
  deleteRetailSale,
} from "./actions";

/**
 * /sales — retail sales recording (owner+admin only).
 *
 * Shape: list of recent sales with a "+ Add sale" affordance. Each
 * row shows description, date, method badge, optional client + staff
 * tags, and an amount. Tap to edit, trash to delete.
 *
 * Date range filter matches the pattern used on other report-ish
 * pages (Today / 7 days / 30 days / Custom). Defaults to last 30
 * days.
 */

export interface SaleRow {
  id: string;
  description: string;
  amount: number;
  method: "cash" | "card" | "other";
  sale_date: string;
  notes: string | null;
  client_id: string | null;
  staff_id: string | null;
  clients?: { id: string; name: string } | null;
  staff?: { id: string; full_name: string } | null;
}

export interface ClientOption {
  id: string;
  name: string;
}

export interface StaffOption {
  id: string;
  full_name: string;
}

type DatePreset = "today" | "week" | "month" | "custom";

const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  week: "Last 7 days",
  month: "Last 30 days",
  custom: "Custom",
};

function toISODate(d: Date) {
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
    case "custom":
      return { from: today, to: today };
  }
}

function methodLabel(m: "cash" | "card" | "other") {
  if (m === "cash") return "Cash";
  if (m === "card") return "Card";
  return "Other";
}

function methodColor(m: "cash" | "card" | "other") {
  if (m === "cash") return "bg-[#F0FAF2] text-[#1B8736]";
  if (m === "card") return "bg-[#F0F7FF] text-[#0062CC]";
  return "bg-[#FFF8F0] text-[#CC7700]";
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SalesView({
  initialSales,
  initialClients,
  initialStaff,
  initialFrom,
  initialTo,
}: {
  initialSales: SaleRow[];
  initialClients: ClientOption[];
  initialStaff: StaffOption[];
  initialFrom: string;
  initialTo: string;
}) {
  const undo = useUndo();
  const currency = useCurrency();

  const [sales, setSales] = useState<SaleRow[]>(initialSales);
  const [clients] = useState<ClientOption[]>(initialClients);
  const [staff] = useState<StaffOption[]>(initialStaff);
  const [loading, setLoading] = useState(false);

  // Date range filter — same UX as /reports / /expenses.
  const [preset, setPreset] = useState<DatePreset>("month");
  const [customFrom, setCustomFrom] = useState(initialFrom);
  const [customTo, setCustomTo] = useState(initialTo);
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

  const getRange = useCallback(() => {
    if (preset === "custom" && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getRange();
      const data = await getRetailSales(from, to);
      setSales(data as unknown as SaleRow[]);
    } catch (err) {
      console.error("getRetailSales failed:", err);
    } finally {
      setLoading(false);
    }
  }, [getRange]);

  // Skip first render — page.tsx already seeded last-30-days data
  // for the initial month preset. Re-fetch on any preset / custom
  // change after that.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    void loadData();
  }, [loadData]);

  // Add / edit modal state. editing === null → add mode; otherwise
  // pre-fill from this row.
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SaleRow | null>(null);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(sale: SaleRow) {
    setEditing(sale);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function handleDelete(sale: SaleRow) {
    if (!confirm(`Delete "${sale.description}"?`)) return;
    const res = await deleteRetailSale(sale.id);
    if (res.error) {
      undo.error(res.error);
      return;
    }
    void loadData();
  }

  const total = sales.reduce((sum, s) => sum + (s.amount || 0), 0);

  return (
    <div>
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-title-page font-bold tracking-tight text-text-primary">
          Sales
        </h1>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Period filter funnel — same icon + pattern as /reports
              and /expenses for cross-page consistency. */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((v) => !v)}
              aria-label="Filter"
              className={`rounded-lg p-2 ${
                preset !== "month"
                  ? "bg-surface-active text-text-primary"
                  : "text-text-tertiary hover:bg-surface-hover hover:text-text-secondary"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5">
                <p className="px-3 pt-2 pb-1 text-caption font-semibold uppercase tracking-wide text-text-tertiary">
                  Period
                </p>
                {(Object.keys(PRESET_LABELS) as DatePreset[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setPreset(p); setFilterOpen(false); }}
                    className={`flex w-full items-center px-3 py-2 text-body-sm hover:bg-surface-hover ${
                      preset === p ? "text-text-primary font-semibold" : "text-text-secondary"
                    }`}
                  >
                    {PRESET_LABELS[p]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={openAdd}
            aria-label="Add sale"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Custom date pickers */}
      {preset === "custom" && (
        <div className="mt-4 flex items-center gap-3">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <span className="text-body-sm text-text-tertiary">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
      )}

      {/* ---- List of sales ---- */}
      <div className="mt-6 rounded-2xl bg-white ring-1 ring-border">
        {loading && sales.length === 0 ? (
          <p className="py-12 text-center text-body-sm text-text-tertiary">
            Loading…
          </p>
        ) : sales.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-body-sm text-text-secondary">
              No sales in this period yet.
            </p>
            <button
              onClick={openAdd}
              className="mt-3 text-body-sm font-semibold text-text-primary underline-offset-2 hover:underline"
            >
              Record your first sale
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {sales.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4"
                >
                  <button
                    onClick={() => openEdit(s)}
                    className="flex-1 text-left min-w-0 hover:opacity-75"
                  >
                    <p className="truncate text-body-sm font-semibold text-text-primary">
                      {s.description}
                    </p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-caption text-text-tertiary">
                        {formatDate(s.sale_date)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-caption font-semibold ${methodColor(s.method)}`}
                      >
                        {methodLabel(s.method)}
                      </span>
                      {s.clients?.name && (
                        <span className="text-caption text-text-tertiary">
                          · {s.clients.name}
                        </span>
                      )}
                      {s.staff?.full_name && (
                        <span className="text-caption text-text-tertiary">
                          · by {s.staff.full_name}
                        </span>
                      )}
                    </div>
                  </button>
                  <span className="shrink-0 text-body-sm font-semibold tabular-nums text-text-primary">
                    {formatCurrency(s.amount, currency)}
                  </span>
                  <button
                    onClick={() => handleDelete(s)}
                    aria-label="Delete sale"
                    className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-active hover:text-error-700"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Total footer — inside the same card as the list, with
                a top divider. Matches the per-method totals on the
                /reports Payments tab. Reflects whatever's in the
                currently-visible filtered set. */}
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-body-sm sm:px-6">
              <span className="text-text-secondary">Total</span>
              <span className="font-semibold text-text-primary tabular-nums">
                {formatCurrency(total, currency)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ---- Add/Edit modal ---- */}
      <SaleFormModal
        open={modalOpen}
        editing={editing}
        clients={clients}
        staff={staff}
        onClose={closeModal}
        onSaved={() => {
          closeModal();
          void loadData();
        }}
      />
    </div>
  );
}

// ============================================================
// Form modal — add OR edit
// ============================================================

function SaleFormModal({
  open,
  editing,
  clients,
  staff,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: SaleRow | null;
  clients: ClientOption[];
  staff: StaffOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const undo = useUndo();
  const currency = useCurrency();
  const isEdit = !!editing;

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "other">("cash");
  const [saleDate, setSaleDate] = useState("");
  const [clientId, setClientId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDescription(editing.description);
      setAmount(String(editing.amount));
      setMethod(editing.method);
      setSaleDate(editing.sale_date);
      setClientId(editing.client_id ?? "");
      setStaffId(editing.staff_id ?? "");
      setNotes(editing.notes ?? "");
    } else {
      setDescription("");
      setAmount("");
      setMethod("cash");
      // Default sale date = today (local-tz, same as toISODate above).
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      setSaleDate(`${y}-${m}-${d}`);
      setClientId("");
      setStaffId("");
      setNotes("");
    }
    setError(null);
  }, [open, editing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload = {
      description: description.trim(),
      amount: parseFloat(amount) || 0,
      method,
      saleDate,
      clientId: clientId || null,
      staffId: staffId || null,
      notes: notes.trim() || null,
    };
    const res = isEdit
      ? await updateRetailSale(editing!.id, payload)
      : await addRetailSale(payload);
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      undo.error(res.error);
      return;
    }
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit sale" : "Record a sale"}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Description */}
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
            Description *
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Argan shampoo, Gift card 200"
            required
            maxLength={120}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {/* Amount + Method */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
              Amount ({currency}) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
              Method *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["cash", "card", "other"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-xl border-[1.5px] px-3 py-2.5 text-caption font-semibold capitalize transition ${
                    method === m
                      ? "border-neutral-900 bg-neutral-900 text-text-inverse"
                      : "border-neutral-200 bg-white text-text-primary hover:border-neutral-400"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
            Date *
          </label>
          <input
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            required
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {/* Client + Staff (optional) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
              Client <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              <option value="">Walk-in / no client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
              Sold by <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              <option value="">—</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
            Notes <span className="font-normal text-text-tertiary">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {error && <p className="text-body-sm text-error-700">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl bg-surface-active px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-primary hover:bg-neutral-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-neutral-900 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition disabled:opacity-50"
          >
            {submitting ? "Saving…" : isEdit ? "Save" : "Record sale"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
