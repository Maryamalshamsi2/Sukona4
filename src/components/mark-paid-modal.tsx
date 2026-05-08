"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/modal";
import { recordPayment, updatePayment, uploadReceipt } from "@/app/(dashboard)/payments/actions";
import type { PaymentMethod } from "@/types";

export type ExistingPayment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  note: string | null;
  receipt_url: string | null;
};

type Props = {
  open: boolean;
  /** Required when recording a new payment (mark-as-paid flow). Ignored
   *  in edit mode. */
  appointmentId?: string | null;
  defaultAmount?: number; // auto-filled from appointment total (record mode)
  clientName?: string;
  /** When provided, the modal flips to "Edit Payment" mode: title +
   *  submit label change, fields pre-fill from this row, and Save
   *  calls updatePayment(this.id, ...) instead of recordPayment. */
  existingPayment?: ExistingPayment | null;
  onClose: () => void;
  /** Called after a successful submit. In record mode the parent should
   *  flip the appointment status → 'paid'. In edit mode there's nothing
   *  extra to do; just refresh the data. */
  onPaid: () => void;
};

/**
 * Dual-purpose modal:
 *   - Record mode (existingPayment is null/undefined): inserts a new
 *     payments row + mints review/receipt tokens. Used by Mark-as-Paid.
 *   - Edit mode (existingPayment is set): updates the row in place.
 *     Lets owners fix a wrong method/amount/note/receipt after the
 *     appointment is already marked paid.
 */
export default function MarkPaidModal({
  open,
  appointmentId,
  defaultAmount,
  clientName,
  existingPayment,
  onClose,
  onPaid,
}: Props) {
  const isEdit = !!existingPayment;

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  // Track the saved receipt URL separately so the user can keep / remove
  // it independently of uploading a new one. Edit mode only.
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null);
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync state each time the modal (re)opens, with values dependent
  // on whether we're recording a new payment or editing an existing one.
  useEffect(() => {
    if (!open) return;
    if (existingPayment) {
      setMethod(existingPayment.method);
      setAmount(String(existingPayment.amount));
      setNote(existingPayment.note ?? "");
      setExistingReceiptUrl(existingPayment.receipt_url);
    } else {
      setMethod("cash");
      setAmount(String(defaultAmount || ""));
      setNote("");
      setExistingReceiptUrl(null);
    }
    setReceiptFile(null);
    setRemoveExistingReceipt(false);
    setError(null);
  }, [open, defaultAmount, existingPayment]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) {
      setError("Enter a valid amount");
      return;
    }

    setSubmitting(true);
    setError(null);

    // Resolve the receipt URL: new upload wins; else "remove" → null;
    // else keep whatever was already saved.
    let receiptUrl: string | null = existingReceiptUrl;
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
    } else if (removeExistingReceipt) {
      receiptUrl = null;
    }

    const noteToSave = method === "other" ? (note.trim() || null) : null;

    const res = isEdit
      ? await updatePayment(existingPayment!.id, amt, method, noteToSave, receiptUrl)
      : appointmentId
        ? await recordPayment(appointmentId, amt, method, noteToSave, receiptUrl)
        : { error: "Missing appointment id" };

    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onPaid();
  }

  const showCurrentReceipt = isEdit && existingReceiptUrl && !removeExistingReceipt && !receiptFile;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit Payment" : "Mark as Paid"}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {clientName && !isEdit && (
          <p className="text-body-sm text-text-secondary">
            Recording payment for <span className="font-semibold text-text-primary">{clientName}</span>.
          </p>
        )}
        {clientName && isEdit && (
          <p className="text-body-sm text-text-secondary">
            Editing payment for <span className="font-semibold text-text-primary">{clientName}</span>.
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
          {!isEdit && (
            <p className="mt-1 text-caption text-text-tertiary">
              Auto-filled from the appointment total. Edit if the final amount differs.
            </p>
          )}
        </div>

        {/* Receipt — three states: existing-saved (with Remove), staged
            new file (with Remove), or empty (Take Photo / Upload). */}
        <div>
          <label className="block text-body-sm font-semibold text-text-primary">
            Receipt image <span className="text-text-tertiary font-normal">(optional)</span>
          </label>

          {showCurrentReceipt && existingReceiptUrl && (
            <div className="mt-1.5 flex items-center gap-3 rounded-xl border-[1.5px] border-neutral-200 bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={existingReceiptUrl} alt="Receipt" className="h-14 w-14 rounded-md object-cover ring-1 ring-border" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-body-sm text-text-primary">Current receipt</p>
                <a href={existingReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-caption text-primary-600 hover:text-primary-700">View</a>
              </div>
              <button
                type="button"
                onClick={() => setRemoveExistingReceipt(true)}
                className="shrink-0 rounded-lg px-3 py-1.5 text-caption font-semibold text-error-700 hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          )}

          {!showCurrentReceipt && (
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {/* Camera */}
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
              {/* Upload */}
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
          )}

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

          {/* Allow re-attaching after the user removed the existing receipt. */}
          {isEdit && removeExistingReceipt && !receiptFile && (
            <button
              type="button"
              onClick={() => setRemoveExistingReceipt(false)}
              className="mt-2 text-caption text-text-secondary hover:text-text-primary"
            >
              Undo remove
            </button>
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
            {submitting ? "Saving..." : isEdit ? "Save" : "Mark as Paid"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
