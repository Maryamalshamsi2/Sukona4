"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/modal";
import { recordPayment, uploadReceipt } from "@/app/(dashboard)/payments/actions";
import type { PaymentMethod } from "@/types";

type Props = {
  open: boolean;
  appointmentId: string | null;
  defaultAmount: number;          // auto-filled from appointment total (editable)
  clientName?: string;
  onClose: () => void;
  onPaid: () => void;             // called after payment recorded; caller then flips status → 'paid'
};

/**
 * Modal shown when an appointment is about to be marked as paid.
 * Collects payment method (required), optional note (for "other"),
 * amount (auto-filled, editable), and an optional receipt image.
 *
 * On successful submit, inserts a row in `payments` and calls onPaid().
 */
export default function MarkPaidModal({
  open, appointmentId, defaultAmount, clientName, onClose, onPaid,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<string>(String(defaultAmount || ""));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync default amount / reset state each time the modal (re)opens.
  useEffect(() => {
    if (open) {
      setAmount(String(defaultAmount || ""));
      setMethod("cash");
      setNote("");
      setReceiptFile(null);
      setError(null);
    }
  }, [open, defaultAmount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appointmentId) return;

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) {
      setError("Enter a valid amount");
      return;
    }

    setSubmitting(true);
    setError(null);

    // Step 1 — optional receipt upload
    let receiptUrl: string | null = null;
    if (receiptFile) {
      const fd = new FormData();
      fd.append("file", receiptFile);
      const up = await uploadReceipt(fd);
      if (up.error) {
        setError(up.error);
        setSubmitting(false);
        return;
      }
      receiptUrl = up.url || null;
    }

    // Step 2 — insert payment row
    const res = await recordPayment(
      appointmentId,
      amt,
      method,
      method === "other" ? (note.trim() || null) : null,
      receiptUrl
    );
    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onPaid();
  }

  return (
    <Modal open={open} onClose={onClose} title="Mark as Paid">
      <form onSubmit={handleSubmit} className="space-y-6">
        {clientName && (
          <p className="text-body-sm text-text-secondary">
            Recording payment for <span className="font-semibold text-text-primary">{clientName}</span>.
          </p>
        )}

        {/* Payment method */}
        <div>
          <label className="block text-body-sm font-semibold text-text-primary">
            Payment Method *
          </label>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {(["cash", "card", "other"] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-xl border-[1.5px] px-3 py-2.5 text-body-sm font-semibold capitalize transition-all ${
                  method === m
                    ? "border-neutral-900 bg-neutral-900 text-text-inverse"
                    : "border-neutral-200 bg-white text-text-primary hover:border-neutral-400"
                }`}
              >
                {m === "card" ? "Card Payment" : m}
              </button>
            ))}
          </div>
        </div>

        {/* Optional note when "Other" selected */}
        {method === "other" && (
          <div>
            <label htmlFor="payment-note" className="block text-body-sm font-semibold text-text-primary">
              Note <span className="text-text-tertiary font-normal">(optional)</span>
            </label>
            <input
              id="payment-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Bank transfer, Tabby, voucher..."
              className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 sm:py-2.5 transition-all focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
        )}

        {/* Amount */}
        <div>
          <label htmlFor="payment-amount" className="block text-body-sm font-semibold text-text-primary">
            Amount (AED) *
          </label>
          <input
            id="payment-amount"
            type="number"
            step="0.01"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 sm:py-2.5 transition-all focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <p className="mt-1 text-caption text-text-tertiary">
            Auto-filled from the appointment total. Edit if the final amount differs.
          </p>
        </div>

        {/* Optional receipt image */}
        <div>
          <label className="block text-body-sm font-semibold text-text-primary">
            Receipt image <span className="text-text-tertiary font-normal">(optional)</span>
          </label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {/* Camera: opens rear camera on mobile */}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 py-3 sm:py-2.5 text-body-sm font-semibold text-text-primary hover:border-neutral-400 transition-all">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
              Take Photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                className="sr-only"
              />
            </label>
            {/* Gallery / file picker */}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 py-3 sm:py-2.5 text-body-sm font-semibold text-text-primary hover:border-neutral-400 transition-all">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              Upload
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                className="sr-only"
              />
            </label>
          </div>
          {receiptFile && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-surface-active px-3 py-2">
              <p className="truncate text-caption text-text-secondary">
                {receiptFile.name}
              </p>
              <button
                type="button"
                onClick={() => setReceiptFile(null)}
                className="shrink-0 text-caption font-semibold text-text-tertiary hover:text-text-primary"
              >
                Remove
              </button>
            </div>
          )}
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
            className="rounded-xl bg-neutral-900 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Mark as Paid"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
