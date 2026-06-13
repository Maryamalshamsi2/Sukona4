"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "@/components/modal";
import { useUndo } from "@/components/undo-toast";
import { useCurrency } from "@/lib/user-context";
import { formatCurrency } from "@/lib/currency";
import { formatCode, isExpired } from "@/lib/gift-card-code";
import {
  listGiftCards,
  sellGiftCard,
  voidGiftCard,
  deleteGiftCard,
  getGiftCardDetail,
  type GiftCardStatus,
} from "./actions";

/**
 * /gift-cards — sell, list, inspect, void gift cards. Owner+admin only.
 *
 * Layout:
 *   - Title + filter funnel (status) + "+" → sell modal
 *   - Default shows every card; filter dropdown narrows by status
 *     (Active / Expired / Redeemed / Voided / All)
 *   - List of cards (code, customer, balance, status, sold date)
 *   - Tap a card → detail modal with full tx history + Void / Delete
 *
 * Redemption does NOT happen here — it happens in MarkPaidModal at
 * the appointment payment screen.
 */

export interface GiftCardRow {
  id: string;
  code: string;
  initial_amount: number;
  balance: number;
  status: "active" | "redeemed" | "void";
  purchase_method: "cash" | "card" | "other";
  expires_at: string | null;
  client_id: string | null;
  notes: string | null;
  created_at: string;
  clients?: { id: string; name: string } | null;
  created_by_profile?: { id: string; full_name: string } | null;
}

export interface ClientOption {
  id: string;
  name: string;
}

interface TransactionRow {
  id: string;
  type: "sale" | "redemption" | "void" | "adjust";
  amount: number;
  notes: string | null;
  created_at: string;
  appointment_id: string | null;
  created_by_profile?: { id: string; full_name: string } | null;
  appointments?: { id: string; scheduled_at: string } | null;
}

const STATUS_LABEL: Record<GiftCardStatus, string> = {
  active: "Active",
  expired: "Expired",
  redeemed: "Redeemed",
  void: "Voided",
  all: "All",
};

const STATUS_ORDER: GiftCardStatus[] = ["active", "expired", "redeemed", "void", "all"];

/** Display status that promotes an active-but-past-expiry card to
 *  "expired" for the UI. The DB still stores status='active' —
 *  there's no nightly job — so we synthesize this everywhere the
 *  card is rendered. */
type DisplayStatus = "active" | "expired" | "redeemed" | "void";
function displayStatus(card: { status: GiftCardRow["status"]; expires_at: string | null }): DisplayStatus {
  if (card.status === "active" && isExpired(card.expires_at)) return "expired";
  return card.status;
}

function statusBadgeColor(s: DisplayStatus) {
  if (s === "active") return "bg-[#F0FAF2] text-[#1B8736]";
  if (s === "expired") return "bg-[#FFF4E5] text-[#B06900]";
  if (s === "redeemed") return "bg-gray-100 text-text-secondary";
  return "bg-[#FFF0F0] text-[#CC1F1F]"; // void
}

function statusBadgeLabel(s: DisplayStatus) {
  if (s === "active") return "Active";
  if (s === "expired") return "Expired";
  if (s === "redeemed") return "Redeemed";
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

export default function GiftCardsView({
  initialCards,
  initialClients,
}: {
  initialCards: GiftCardRow[];
  initialClients: ClientOption[];
}) {
  const undo = useUndo();
  const currency = useCurrency();

  const [cards, setCards] = useState<GiftCardRow[]>(initialCards);
  const [clients] = useState<ClientOption[]>(initialClients);
  const [loading, setLoading] = useState(false);
  // Default = "all" — show every card, regardless of status. The
  // initial seed from page.tsx is "active" cards, so we trigger
  // a refetch on mount to widen the set. Subsequent filter changes
  // refetch as well.
  const [statusFilter, setStatusFilter] = useState<GiftCardStatus>("all");

  const reload = useCallback(async (s: GiftCardStatus) => {
    setLoading(true);
    try {
      const data = await listGiftCards(s);
      setCards(data as unknown as GiftCardRow[]);
    } catch (err) {
      console.error("listGiftCards failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(statusFilter);
  }, [statusFilter, reload]);

  // Filter dropdown — funnel icon next to "+", same dismiss-on-
  // outside-click pattern as /expenses and /sales.
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

  // Sell modal
  const [sellOpen, setSellOpen] = useState(false);

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCard, setDetailCard] = useState<GiftCardRow | null>(null);
  const [detailTx, setDetailTx] = useState<TransactionRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  async function openDetail(card: GiftCardRow) {
    setDetailCard(card);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await getGiftCardDetail(card.id);
      if (res) {
        setDetailCard(res.card as unknown as GiftCardRow);
        setDetailTx(res.transactions as unknown as TransactionRow[]);
      }
    } catch (err) {
      console.error("getGiftCardDetail failed:", err);
    } finally {
      setDetailLoading(false);
    }
  }
  function closeDetail() {
    setDetailOpen(false);
    setDetailCard(null);
    setDetailTx([]);
  }

  return (
    <div>
      {/* ---- Header — title + filter funnel + "+" ---- */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-title-page font-bold tracking-tight text-text-primary">
          Gift cards
        </h1>
        <div className="flex items-center gap-1 shrink-0">
          {/* Status filter funnel — same icon + dropdown shape as
              /expenses for cross-page consistency. Icon highlights
              when a non-default ("all") filter is set. */}
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
            aria-label="Sell gift card"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* ---- List of cards ---- */}
      <div className="mt-6 rounded-2xl bg-white ring-1 ring-border">
        {loading && cards.length === 0 ? (
          <p className="py-12 text-center text-body-sm text-text-tertiary">
            Loading…
          </p>
        ) : cards.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-body-sm text-text-secondary">
              {statusFilter === "all"
                ? "No gift cards yet."
                : `No ${STATUS_LABEL[statusFilter].toLowerCase()} cards.`}
            </p>
            {/* Sell-first CTA only on the empty "all" state — when a
                non-default filter is set, the issue is usually the
                filter, not the absence of cards. */}
            {statusFilter === "all" && (
              <button
                onClick={() => setSellOpen(true)}
                className="mt-3 text-body-sm font-semibold text-text-primary underline-offset-2 hover:underline"
              >
                Sell your first gift card
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cards.map((c) => (
              <button
                key={c.id}
                onClick={() => openDetail(c)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover sm:gap-4 sm:px-6 sm:py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-body-sm font-semibold tracking-wider text-text-primary">
                    {formatCode(c.code)}
                  </p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-caption text-text-tertiary">
                      {formatDateTime(c.created_at)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-caption font-semibold ${statusBadgeColor(displayStatus(c))}`}
                    >
                      {statusBadgeLabel(displayStatus(c))}
                    </span>
                    {c.clients?.name && (
                      <span className="truncate text-caption text-text-tertiary">
                        · {c.clients.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-body-sm font-semibold tabular-nums text-text-primary">
                    {formatCurrency(c.balance, currency)}
                  </p>
                  {c.balance !== c.initial_amount && (
                    <p className="text-caption text-text-tertiary tabular-nums">
                      of {formatCurrency(c.initial_amount, currency)}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- Sell modal ---- */}
      <SellGiftCardModal
        open={sellOpen}
        clients={clients}
        onClose={() => setSellOpen(false)}
        onSold={() => {
          setSellOpen(false);
          void reload(statusFilter);
        }}
      />

      {/* ---- Detail modal ---- */}
      <GiftCardDetailModal
        open={detailOpen}
        card={detailCard}
        transactions={detailTx}
        loading={detailLoading}
        onClose={closeDetail}
        onVoided={() => {
          closeDetail();
          void reload(statusFilter);
        }}
        onError={(msg) => undo.error(msg)}
      />
    </div>
  );
}

// ============================================================
// Sell modal
// ============================================================

function SellGiftCardModal({
  open,
  clients,
  onClose,
  onSold,
}: {
  open: boolean;
  clients: ClientOption[];
  onClose: () => void;
  onSold: (code: string) => void;
}) {
  const undo = useUndo();
  const currency = useCurrency();

  const [amount, setAmount] = useState("");
  const [purchaseMethod, setPurchaseMethod] = useState<"cash" | "card" | "other">("cash");
  const [clientId, setClientId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once we have a code back, show it for copy/print BEFORE closing.
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setPurchaseMethod("cash");
    setClientId("");
    setExpiresAt("");
    setNotes("");
    setError(null);
    setIssuedCode(null);
    setCopied(false);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await sellGiftCard({
      amount: parseFloat(amount) || 0,
      purchaseMethod,
      clientId: clientId || null,
      expiresAt: expiresAt || null,
      notes: notes.trim() || null,
    });
    setSubmitting(false);
    if ("error" in res && res.error) {
      setError(res.error);
      undo.error(res.error);
      return;
    }
    if ("card" in res && res.card) {
      setIssuedCode(res.card.code);
    }
  }

  async function handleCopy() {
    if (!issuedCode) return;
    try {
      await navigator.clipboard.writeText(formatCode(issuedCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older browsers — fall back silently. Code is still on screen.
    }
  }

  function handleDone() {
    if (issuedCode) onSold(issuedCode);
    else onClose();
  }

  return (
    <Modal open={open} onClose={handleDone} title="Sell gift card">
      {issuedCode ? (
        // ---- Success: show the code with a copy button ----
        <div className="space-y-5">
          <p className="text-body-sm text-text-secondary">
            Gift card created. Give this code to the customer:
          </p>
          <div className="rounded-2xl bg-neutral-50 ring-1 ring-border px-5 py-6 text-center">
            <p className="font-mono text-xl font-bold tracking-[0.2em] text-text-primary">
              {formatCode(issuedCode)}
            </p>
            <button
              type="button"
              onClick={handleCopy}
              className="mt-3 text-body-sm font-semibold text-text-secondary hover:text-text-primary"
            >
              {copied ? "✓ Copied" : "Copy code"}
            </button>
          </div>
          <p className="text-caption text-text-tertiary">
            You can also find this code on the gift cards list.
          </p>
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleDone}
              className="rounded-xl bg-neutral-900 px-5 py-2.5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 transition"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        // ---- Form ----
        <form onSubmit={handleSubmit} className="space-y-5">
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
                placeholder="100"
                className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div>
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

          {/* Buyer (optional client) */}
          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
              Buyer <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              <option value="">Walk-in / no client on file</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Expiry (optional) */}
          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
              Expires <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
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
              placeholder="e.g. birthday gift for Sara"
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
              {submitting ? "Issuing…" : "Sell card"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ============================================================
// Detail modal — code + balance + tx history + void action
// ============================================================

function GiftCardDetailModal({
  open,
  card,
  transactions,
  loading,
  onClose,
  onVoided,
  onError,
}: {
  open: boolean;
  card: GiftCardRow | null;
  transactions: TransactionRow[];
  loading: boolean;
  onClose: () => void;
  onVoided: () => void;
  onError: (msg: string) => void;
}) {
  const currency = useCurrency();
  const [voidReason, setVoidReason] = useState("");
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);

  // Delete is a hard-remove path — separate state from void so we
  // don't confuse the two confirm dialogs. Only one can be open at a
  // time (toggling one closes the other).
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) {
      setVoidReason("");
      setVoidConfirmOpen(false);
      setDeleteConfirmOpen(false);
    }
  }, [open]);

  if (!card) return null;

  async function handleVoid() {
    if (!card) return;
    setVoiding(true);
    const res = await voidGiftCard(card.id, voidReason || null);
    setVoiding(false);
    if (res.error) {
      onError(res.error);
      return;
    }
    onVoided();
  }

  async function handleDelete() {
    if (!card) return;
    setDeleting(true);
    const res = await deleteGiftCard(card.id);
    setDeleting(false);
    if (res.error) {
      onError(res.error);
      return;
    }
    // Same callback as void — the list reloads. We don't need a
    // separate onDeleted hook; the modal closes and the parent
    // refetches with the current filter.
    onVoided();
  }

  return (
    <Modal open={open} onClose={onClose} title="Gift card">
      <div className="space-y-5">
        {/* Code block */}
        <div className="rounded-2xl bg-neutral-50 ring-1 ring-border px-5 py-4 text-center">
          <p className="font-mono text-lg font-bold tracking-[0.2em] text-text-primary">
            {formatCode(card.code)}
          </p>
          <p className="mt-1 text-caption text-text-tertiary">
            Sold {formatDateTime(card.created_at)}
          </p>
        </div>

        {/* Balance + status */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl ring-1 ring-border px-4 py-3">
            <p className="text-caption text-text-tertiary">Balance</p>
            <p className="mt-0.5 text-body-md font-semibold tabular-nums text-text-primary">
              {formatCurrency(card.balance, currency)}
            </p>
            <p className="text-caption text-text-tertiary tabular-nums">
              of {formatCurrency(card.initial_amount, currency)}
            </p>
          </div>
          <div className="rounded-xl ring-1 ring-border px-4 py-3">
            <p className="text-caption text-text-tertiary">Status</p>
            <p className="mt-1">
              <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${statusBadgeColor(displayStatus(card))}`}>
                {statusBadgeLabel(displayStatus(card))}
              </span>
            </p>
            {card.expires_at && (
              <p className="mt-1 text-caption text-text-tertiary">
                Expires {formatDateTime(card.expires_at)}
              </p>
            )}
          </div>
        </div>

        {card.clients?.name && (
          <div className="text-body-sm text-text-secondary">
            <span className="text-text-tertiary">Buyer: </span>
            {card.clients.name}
          </div>
        )}
        {card.notes && (
          <div className="text-body-sm text-text-secondary">
            <span className="text-text-tertiary">Notes: </span>
            {card.notes}
          </div>
        )}

        {/* Transaction history */}
        <div>
          <p className="text-body-sm font-semibold text-text-primary mb-2">History</p>
          {loading ? (
            <p className="text-body-sm text-text-tertiary">Loading…</p>
          ) : transactions.length === 0 ? (
            <p className="text-body-sm text-text-tertiary">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl ring-1 ring-border">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-body-sm text-text-primary capitalize">
                      {tx.type}
                      {tx.notes && (
                        <span className="ml-1 text-text-tertiary"> · {tx.notes}</span>
                      )}
                    </p>
                    <p className="text-caption text-text-tertiary">
                      {formatDateTime(tx.created_at)}
                      {tx.created_by_profile?.full_name && (
                        <> · by {tx.created_by_profile.full_name}</>
                      )}
                    </p>
                  </div>
                  <p className={`text-body-sm font-semibold tabular-nums ${
                    tx.type === "redemption" ? "text-text-primary" : "text-text-secondary"
                  }`}>
                    {tx.type === "redemption" ? "−" : tx.type === "sale" ? "+" : ""}
                    {formatCurrency(tx.amount, currency)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Action buttons. Void is available only on currently-usable
            cards — not on already redeemed/voided/expired ones, where
            it'd be a no-op. Delete is owner/admin-only via the action
            gate and works on any status — useful for cleaning up test
            data or removing a card the salon issued by mistake. */}
        {!voidConfirmOpen && !deleteConfirmOpen && (
          <div className="flex justify-end gap-2 pt-2">
            {displayStatus(card) === "active" && (
              <button
                type="button"
                onClick={() => setVoidConfirmOpen(true)}
                className="rounded-xl bg-white px-4 py-2.5 text-body-sm font-semibold text-error-700 ring-1 ring-error-200 hover:bg-error-50"
              >
                Void card
              </button>
            )}
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="rounded-xl bg-white px-4 py-2.5 text-body-sm font-semibold text-error-700 ring-1 ring-error-200 hover:bg-error-50"
            >
              Delete card
            </button>
          </div>
        )}

        {voidConfirmOpen && (
          <div className="rounded-xl bg-error-50 ring-1 ring-error-200 px-4 py-3 space-y-3">
            <p className="text-body-sm font-semibold text-error-700">
              Void this card?
            </p>
            <p className="text-body-sm text-text-secondary">
              The remaining {formatCurrency(card.balance, currency)} can no
              longer be redeemed. This doesn&apos;t refund the buyer —
              handle that separately.
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
              Delete this card?
            </p>
            <p className="text-body-sm text-text-secondary">
              The card and its full transaction history will be removed.
              {displayStatus(card) === "active" && card.balance > 0 && (
                <>
                  {" "}
                  The remaining{" "}
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(card.balance, currency)}
                  </span>{" "}
                  balance is gone.
                </>
              )}
              {card.status !== "void" && (
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
