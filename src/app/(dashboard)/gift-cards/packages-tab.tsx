"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Modal from "@/components/modal";
import { useUndo } from "@/components/undo-toast";
import { useCurrency } from "@/lib/user-context";
import { formatCurrency } from "@/lib/currency";
import { isExpired } from "@/lib/gift-card-code";
import {
  listPackages,
  sellPackage,
  voidPackage,
  deletePackage,
  getPackageDetail,
  type PackageStatus,
} from "./packages-actions";

/**
 * Packages tab (lives inside /gift-cards page alongside the Gift
 * cards tab). Sell / list / inspect / void / delete multi-session
 * packages. Owner+admin only.
 *
 * Layout mirrors the Gift cards tab:
 *   - Filter funnel (status) + "+" (sell new) in the header row
 *   - Default shows everything; filter dropdown narrows by status
 *   - List of packages (recipient + items summary + status + sold date)
 *   - Tap a package → detail modal with full session history +
 *     Void / Delete actions
 *
 * Redemption itself does NOT live here — it happens in MarkPaidModal
 * at the appointment payment screen (next commit).
 */

export interface PackageRow {
  id: string;
  status: "active" | "completed" | "void";
  total_paid: number;
  purchase_method: "cash" | "card" | "other";
  expires_at: string | null;
  buyer_client_id: string | null;
  recipient_client_id: string;
  notes: string | null;
  created_at: string;
  buyer?: { id: string; name: string } | null;
  recipient?: { id: string; name: string } | null;
  package_items: Array<{
    id: string;
    service_id: string;
    sessions_total: number;
    sessions_used: number;
    services?: { id: string; name: string } | null;
  }>;
  created_by_profile?: { id: string; full_name: string } | null;
}

export interface ClientOption {
  id: string;
  name: string;
}

export interface ServiceOption {
  id: string;
  name: string;
  price: number;
}

interface RedemptionRow {
  id: string;
  package_id: string;
  package_item_id: string;
  appointment_id: string | null;
  notes: string | null;
  created_at: string;
  package_items?: {
    id: string;
    services?: { id: string; name: string } | null;
  } | null;
  appointments?: { id: string; date: string; time: string } | null;
  created_by_profile?: { id: string; full_name: string } | null;
}

const STATUS_LABEL: Record<PackageStatus, string> = {
  active: "Active",
  expired: "Expired",
  completed: "Completed",
  void: "Voided",
  all: "All",
};

const STATUS_ORDER: PackageStatus[] = [
  "active",
  "expired",
  "completed",
  "void",
  "all",
];

type DisplayStatus = "active" | "expired" | "completed" | "void";
function displayStatus(p: {
  status: PackageRow["status"];
  expires_at: string | null;
}): DisplayStatus {
  if (p.status === "active" && isExpired(p.expires_at)) return "expired";
  return p.status;
}

function statusBadgeColor(s: DisplayStatus) {
  if (s === "active") return "bg-[#F0FAF2] text-[#1B8736]";
  if (s === "expired") return "bg-[#FFF4E5] text-[#B06900]";
  if (s === "completed") return "bg-gray-100 text-text-secondary";
  return "bg-[#FFF0F0] text-[#CC1F1F]"; // void
}

function statusBadgeLabel(s: DisplayStatus) {
  if (s === "active") return "Active";
  if (s === "expired") return "Expired";
  if (s === "completed") return "Completed";
  return "Voided";
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Sum remaining sessions across all items on a package. */
function remainingSessions(p: PackageRow): number {
  return p.package_items.reduce(
    (s, it) => s + (it.sessions_total - it.sessions_used),
    0,
  );
}

/** Sum total sessions across all items. */
function totalSessions(p: PackageRow): number {
  return p.package_items.reduce((s, it) => s + it.sessions_total, 0);
}

/** Compact one-line summary of what's in the package, for list rows.
 *  Single-service: "5 Basic Manicures". Mixed: "3 Mani + 3 Pedi + 1 Facial". */
function itemsSummary(p: PackageRow): string {
  return p.package_items
    .map((it) => `${it.sessions_total} ${it.services?.name ?? "Service"}`)
    .join(" + ");
}

// ============================================================
// Top-level tab component
// ============================================================

export default function PackagesTab({
  initialPackages,
  initialClients,
  initialServices,
  controlsSlot,
}: {
  initialPackages: PackageRow[];
  initialClients: ClientOption[];
  initialServices: ServiceOption[];
  /** Parent's portal target above the pill strip. See the equivalent
   *  prop on GiftCardsTab for the rationale. */
  controlsSlot: HTMLDivElement | null;
}) {
  const undo = useUndo();
  const currency = useCurrency();

  const [packages, setPackages] = useState<PackageRow[]>(initialPackages);
  const [clients] = useState<ClientOption[]>(initialClients);
  const [services] = useState<ServiceOption[]>(initialServices);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PackageStatus>("all");

  const reload = useCallback(async (s: PackageStatus) => {
    setLoading(true);
    try {
      const data = await listPackages(s);
      setPackages(data as unknown as PackageRow[]);
    } catch (err) {
      console.error("listPackages failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(statusFilter);
  }, [statusFilter, reload]);

  // Filter dropdown
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

  const [sellOpen, setSellOpen] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPkg, setDetailPkg] = useState<PackageRow | null>(null);
  const [detailRedemptions, setDetailRedemptions] = useState<RedemptionRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  async function openDetail(p: PackageRow) {
    setDetailPkg(p);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await getPackageDetail(p.id);
      if (res) {
        setDetailPkg(res.package as unknown as PackageRow);
        setDetailRedemptions(res.redemptions as unknown as RedemptionRow[]);
      }
    } catch (err) {
      console.error("getPackageDetail failed:", err);
    } finally {
      setDetailLoading(false);
    }
  }
  function closeDetail() {
    setDetailOpen(false);
    setDetailPkg(null);
    setDetailRedemptions([]);
  }

  // Header content — filter funnel + "+" button. Portaled into the
  // parent's controls slot so it renders ABOVE the pill strip.
  // See the matching block in GiftCardsTab for the rationale.
  const headerControls = (
    <>
      <div className="relative" ref={filterRef}>
        <button
          onClick={() => setFilterOpen((v) => !v)}
          aria-label="Filter"
          className={`rounded-lg p-2 ${
            statusFilter !== "all"
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
            <p className="px-3 pt-2 pb-1 text-caption font-semibold uppercase tracking-wide text-text-tertiary">
              Status
            </p>
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setFilterOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-body-sm hover:bg-surface-hover ${
                  statusFilter === s ? "text-text-primary font-semibold" : "text-text-secondary"
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                  statusFilter === s ? "border-gray-900 bg-neutral-900" : "border-neutral-200"
                }`}>
                  {statusFilter === s && (
                    <svg className="h-3 w-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </span>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setSellOpen(true)}
        aria-label="Sell package"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </>
  );

  return (
    <div>
      {controlsSlot ? (
        createPortal(headerControls, controlsSlot)
      ) : (
        <div className="mb-3 flex items-center justify-end gap-1">
          {headerControls}
        </div>
      )}

      {/* List */}
      <div className="rounded-2xl bg-white ring-1 ring-border">
        {loading && packages.length === 0 ? (
          <p className="py-12 text-center text-body-sm text-text-tertiary">
            Loading…
          </p>
        ) : packages.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-body-sm text-text-secondary">
              {statusFilter === "all"
                ? "No packages yet."
                : `No ${STATUS_LABEL[statusFilter].toLowerCase()} packages.`}
            </p>
            {statusFilter === "all" && (
              <button
                onClick={() => setSellOpen(true)}
                className="mt-3 text-body-sm font-semibold text-text-primary underline-offset-2 hover:underline"
              >
                Sell your first package
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {packages.map((p) => {
              const remaining = remainingSessions(p);
              const total = totalSessions(p);
              return (
                <button
                  key={p.id}
                  onClick={() => openDetail(p)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover sm:gap-4 sm:px-6 sm:py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-semibold text-text-primary">
                      {p.recipient?.name ?? "Unknown"}
                    </p>
                    <p className="mt-0.5 truncate text-caption text-text-tertiary">
                      {itemsSummary(p)}
                    </p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-caption text-text-tertiary">
                        {formatDateTime(p.created_at)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-caption font-semibold ${statusBadgeColor(displayStatus(p))}`}
                      >
                        {statusBadgeLabel(displayStatus(p))}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-body-sm font-semibold tabular-nums text-text-primary">
                      {remaining}/{total}
                    </p>
                    <p className="text-caption text-text-tertiary">left</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <SellPackageModal
        open={sellOpen}
        clients={clients}
        services={services}
        onClose={() => setSellOpen(false)}
        onSold={() => {
          setSellOpen(false);
          void reload(statusFilter);
        }}
      />

      <PackageDetailModal
        open={detailOpen}
        pkg={detailPkg}
        redemptions={detailRedemptions}
        loading={detailLoading}
        onClose={closeDetail}
        onChanged={() => {
          closeDetail();
          void reload(statusFilter);
        }}
        onError={(msg) => undo.error(msg)}
        currency={currency}
      />
    </div>
  );
}

// ============================================================
// Sell modal
// ============================================================

interface ItemDraft {
  serviceId: string;
  sessions: string; // string so user can type freely; parsed on submit
}

function SellPackageModal({
  open,
  clients,
  services,
  onClose,
  onSold,
}: {
  open: boolean;
  clients: ClientOption[];
  services: ServiceOption[];
  onClose: () => void;
  onSold: () => void;
}) {
  const undo = useUndo();
  const currency = useCurrency();

  // Required fields.
  const [recipientId, setRecipientId] = useState("");
  const [isGift, setIsGift] = useState(false);  // toggle: buyer differs from recipient
  const [buyerId, setBuyerId] = useState("");
  const [totalPaid, setTotalPaid] = useState("");
  const [purchaseMethod, setPurchaseMethod] =
    useState<"cash" | "card" | "other">("cash");

  // Items array. Start with one empty row; user can + Add more.
  const [items, setItems] = useState<ItemDraft[]>([
    { serviceId: "", sessions: "" },
  ]);

  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRecipientId("");
    setIsGift(false);
    setBuyerId("");
    setTotalPaid("");
    setPurchaseMethod("cash");
    setItems([{ serviceId: "", sessions: "" }]);
    setExpiresAt("");
    setNotes("");
    setError(null);
  }, [open]);

  function updateItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function addItem() {
    setItems((prev) => [...prev, { serviceId: "", sessions: "" }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const parsedItems = items.map((it) => ({
      serviceId: it.serviceId,
      sessions: parseInt(it.sessions, 10) || 0,
    }));

    const res = await sellPackage({
      recipientClientId: recipientId,
      buyerClientId: isGift && buyerId ? buyerId : null,
      totalPaid: parseFloat(totalPaid) || 0,
      purchaseMethod,
      expiresAt: expiresAt || null,
      notes: notes.trim() || null,
      items: parsedItems,
    });

    setSubmitting(false);
    if ("error" in res && res.error) {
      setError(res.error);
      undo.error(res.error);
      return;
    }
    onSold();
  }

  return (
    <Modal open={open} onClose={onClose} title="Sell package">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Recipient */}
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
            Recipient * <span className="font-normal text-text-tertiary">(who uses the sessions)</span>
          </label>
          <select
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            required
            className="w-full appearance-none box-border rounded-xl border-[1.5px] border-gray-200 bg-white px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            <option value="">Select a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Gift toggle + buyer (when gift) */}
        <div className="space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isGift}
              onChange={(e) => setIsGift(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-primary-100"
            />
            <span className="text-body-sm text-text-primary">
              This is a gift — buyer is different from recipient
            </span>
          </label>
          {isGift && (
            <div>
              <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
                Buyer <span className="font-normal text-text-tertiary">(who paid)</span>
              </label>
              <select
                value={buyerId}
                onChange={(e) => setBuyerId(e.target.value)}
                className="w-full appearance-none box-border rounded-xl border-[1.5px] border-gray-200 bg-white px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                <option value="">Walk-in / no client on file</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Items */}
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
            Services in this package *
          </label>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={it.serviceId}
                  onChange={(e) => updateItem(idx, { serviceId: e.target.value })}
                  required
                  className="flex-1 min-w-0 appearance-none box-border rounded-xl border-[1.5px] border-gray-200 bg-white px-4 py-3 sm:py-2.5 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">Select service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={it.sessions}
                  onChange={(e) => updateItem(idx, { sessions: e.target.value })}
                  required
                  placeholder="Sessions"
                  className="w-24 shrink-0 appearance-none box-border rounded-xl border-[1.5px] border-gray-200 bg-white px-3 py-3 sm:py-2.5 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    aria-label="Remove service"
                    className="shrink-0 rounded-md p-1.5 text-text-tertiary hover:bg-surface-active hover:text-error-700"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-2 text-body-sm font-semibold text-text-secondary hover:text-text-primary"
          >
            + Add another service
          </button>
        </div>

        {/* Total paid + payment method */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
              Total paid ({currency}) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={totalPaid}
              onChange={(e) => setTotalPaid(e.target.value)}
              required
              placeholder="0"
              className="w-full appearance-none box-border rounded-xl border-[1.5px] border-gray-200 bg-white px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
              Paid with *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["cash", "card", "other"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPurchaseMethod(m)}
                  className={`rounded-xl border-[1.5px] px-3 py-2.5 text-caption font-semibold capitalize transition ${
                    purchaseMethod === m
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

        {/* Expiry */}
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
            Expires <span className="font-normal text-text-tertiary">(optional)</span>
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full appearance-none box-border rounded-xl border-[1.5px] border-gray-200 bg-white px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
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
            placeholder="e.g. birthday gift, 10% loyalty discount"
            className="w-full appearance-none box-border rounded-xl border-[1.5px] border-gray-200 bg-white px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
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
            {submitting ? "Selling…" : "Sell package"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Detail modal — items breakdown + redemption history + actions
// ============================================================

function PackageDetailModal({
  open,
  pkg,
  redemptions,
  loading,
  onClose,
  onChanged,
  onError,
  currency,
}: {
  open: boolean;
  pkg: PackageRow | null;
  redemptions: RedemptionRow[];
  loading: boolean;
  onClose: () => void;
  onChanged: () => void;
  onError: (msg: string) => void;
  currency: string;
}) {
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) {
      setVoidConfirmOpen(false);
      setVoidReason("");
      setDeleteConfirmOpen(false);
    }
  }, [open]);

  if (!pkg) return null;

  async function handleVoid() {
    if (!pkg) return;
    setVoiding(true);
    const res = await voidPackage(pkg.id, voidReason || null);
    setVoiding(false);
    if (res.error) {
      onError(res.error);
      return;
    }
    onChanged();
  }

  async function handleDelete() {
    if (!pkg) return;
    setDeleting(true);
    const res = await deletePackage(pkg.id);
    setDeleting(false);
    if (res.error) {
      onError(res.error);
      return;
    }
    onChanged();
  }

  const remaining = remainingSessions(pkg);
  const total = totalSessions(pkg);

  return (
    <Modal open={open} onClose={onClose} title="Package">
      <div className="space-y-5">
        {/* Recipient + buyer */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-body-sm font-semibold text-text-primary">
              {pkg.recipient?.name ?? "Unknown recipient"}
            </p>
            <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${statusBadgeColor(displayStatus(pkg))}`}>
              {statusBadgeLabel(displayStatus(pkg))}
            </span>
          </div>
          {pkg.buyer && pkg.buyer.id !== pkg.recipient?.id && (
            <p className="text-caption text-text-tertiary">
              Gift from {pkg.buyer.name}
            </p>
          )}
          <p className="text-caption text-text-tertiary">
            Sold {formatDateTime(pkg.created_at)}
            {pkg.expires_at && <> · Expires {pkg.expires_at}</>}
          </p>
        </div>

        {/* Items breakdown */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-body-sm font-semibold text-text-primary">Services</p>
            <p className="text-body-sm font-semibold tabular-nums text-text-primary">
              {remaining}/{total} sessions left
            </p>
          </div>
          <ul className="divide-y divide-border rounded-xl ring-1 ring-border">
            {pkg.package_items.map((it) => {
              const used = it.sessions_used;
              const tot = it.sessions_total;
              const itemRemaining = tot - used;
              return (
                <li key={it.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-body-sm text-text-primary">
                    {it.services?.name ?? "Unknown service"}
                  </span>
                  <span className="text-body-sm tabular-nums text-text-secondary">
                    {itemRemaining} of {tot} left
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl ring-1 ring-border px-4 py-3">
            <p className="text-caption text-text-tertiary">Total paid</p>
            <p className="mt-0.5 text-body-md font-semibold tabular-nums text-text-primary">
              {formatCurrency(pkg.total_paid, currency)}
            </p>
            <p className="text-caption text-text-tertiary capitalize">
              {pkg.purchase_method}
            </p>
          </div>
          <div className="rounded-xl ring-1 ring-border px-4 py-3">
            <p className="text-caption text-text-tertiary">Per session</p>
            <p className="mt-0.5 text-body-md font-semibold tabular-nums text-text-primary">
              {total > 0
                ? formatCurrency(pkg.total_paid / total, currency)
                : "—"}
            </p>
            <p className="text-caption text-text-tertiary">implied value</p>
          </div>
        </div>

        {pkg.notes && (
          <div className="text-body-sm text-text-secondary whitespace-pre-line">
            <span className="text-text-tertiary">Notes: </span>
            {pkg.notes}
          </div>
        )}

        {/* Redemption history */}
        <div>
          <p className="text-body-sm font-semibold text-text-primary mb-2">History</p>
          {loading ? (
            <p className="text-body-sm text-text-tertiary">Loading…</p>
          ) : redemptions.length === 0 ? (
            <p className="text-body-sm text-text-tertiary">
              No sessions used yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl ring-1 ring-border">
              {redemptions.map((r) => (
                <li key={r.id} className="px-4 py-2.5">
                  <p className="text-body-sm text-text-primary">
                    {r.package_items?.services?.name ?? "Session"} used
                  </p>
                  <p className="text-caption text-text-tertiary">
                    {formatDateTime(r.created_at)}
                    {r.created_by_profile?.full_name && (
                      <> · by {r.created_by_profile.full_name}</>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Action buttons. Void only for currently-usable; Delete on
            any status. Same shape as the gift card detail modal. */}
        {!voidConfirmOpen && !deleteConfirmOpen && (
          <div className="flex justify-end gap-2 pt-2">
            {displayStatus(pkg) === "active" && (
              <button
                type="button"
                onClick={() => setVoidConfirmOpen(true)}
                className="rounded-xl bg-white px-4 py-2.5 text-body-sm font-semibold text-error-700 ring-1 ring-error-200 hover:bg-error-50"
              >
                Void package
              </button>
            )}
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="rounded-xl bg-white px-4 py-2.5 text-body-sm font-semibold text-error-700 ring-1 ring-error-200 hover:bg-error-50"
            >
              Delete package
            </button>
          </div>
        )}

        {voidConfirmOpen && (
          <div className="rounded-xl bg-error-50 ring-1 ring-error-200 px-4 py-3 space-y-3">
            <p className="text-body-sm font-semibold text-error-700">
              Void this package?
            </p>
            <p className="text-body-sm text-text-secondary">
              The remaining {remaining} session{remaining === 1 ? "" : "s"}{" "}
              can no longer be redeemed. This doesn&apos;t refund the buyer
              — handle that separately.
            </p>
            <input
              type="text"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-2.5 text-body-sm bg-white focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setVoidConfirmOpen(false)}
                disabled={voiding}
                className="rounded-xl bg-white px-4 py-2 text-body-sm font-semibold text-text-primary ring-1 ring-border hover:bg-surface-hover disabled:opacity-50"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={handleVoid}
                disabled={voiding}
                className="rounded-xl bg-error-700 px-4 py-2 text-body-sm font-semibold text-white hover:bg-error-800 disabled:opacity-50"
              >
                {voiding ? "Voiding…" : "Void"}
              </button>
            </div>
          </div>
        )}

        {deleteConfirmOpen && (
          <div className="rounded-xl bg-error-50 ring-1 ring-error-200 px-4 py-3 space-y-3">
            <p className="text-body-sm font-semibold text-error-700">
              Delete this package?
            </p>
            <p className="text-body-sm text-text-secondary">
              The package and its full session history will be removed.
              {displayStatus(pkg) === "active" && remaining > 0 && (
                <>
                  {" "}
                  The remaining {remaining} session{remaining === 1 ? "" : "s"}{" "}
                  are gone.
                </>
              )}
              {pkg.status !== "void" && (
                <>
                  {" "}
                  Revenue from the original sale will be removed from
                  Reports for that period.
                </>
              )}{" "}
              This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                className="rounded-xl bg-white px-4 py-2 text-body-sm font-semibold text-text-primary ring-1 ring-border hover:bg-surface-hover disabled:opacity-50"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl bg-error-700 px-4 py-2 text-body-sm font-semibold text-white hover:bg-error-800 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
