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
  /** Migration-026 array of attachment URLs. Falls back to a single
   *  receipt_url for legacy rows that pre-date the migration. */
  receipt_urls?: string[] | null;
  receipt_url?: string | null;
};

const MAX_ATTACHMENTS = 5;
const MAX_BYTES = 5 * 1024 * 1024;

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
  // Existing attachments fetched from the saved row (edit mode only).
  // Each has a stable URL — removing one drops it from this array.
  const [existingUrls, setExistingUrls] = useState<string[]>([]);
  // Newly-picked files staged for upload on submit. Independent from
  // existingUrls so users can keep some saved attachments AND add more.
  const [newFiles, setNewFiles] = useState<File[]>([]);
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
      // Prefer the array; fall back to the single column for legacy rows.
      const urls = existingPayment.receipt_urls?.length
        ? existingPayment.receipt_urls
        : existingPayment.receipt_url
          ? [existingPayment.receipt_url]
          : [];
      setExistingUrls(urls);
    } else {
      setMethod("cash");
      setAmount(String(defaultAmount || ""));
      setNote("");
      setExistingUrls([]);
    }
    setNewFiles([]);
    setError(null);
  }, [open, defaultAmount, existingPayment]);

  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    const incoming = Array.from(picked);
    const totalAfter = existingUrls.length + newFiles.length + incoming.length;
    if (totalAfter > MAX_ATTACHMENTS) {
      setError(`You can attach at most ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const oversize = incoming.find((f) => f.size > MAX_BYTES);
    if (oversize) {
      setError(`"${oversize.name}" is over 5 MB.`);
      return;
    }
    setError(null);
    setNewFiles((prev) => [...prev, ...incoming]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) {
      setError("Enter a valid amount");
      return;
    }

    setSubmitting(true);
    setError(null);

    // Upload any newly-picked files in parallel, collect their public URLs,
    // then merge with the kept existing URLs in order: existing first,
    // then new (so the order users see in the picker is preserved).
    const uploaded: string[] = [];
    for (const file of newFiles) {
      const fd = new FormData();
      fd.append("file", file);
      const up = await uploadReceipt(fd);
      if (up.error) {
        setError(up.error);
        setSubmitting(false);
        return;
      }
      if (up.url) uploaded.push(up.url);
    }
    const finalUrls = [...existingUrls, ...uploaded];

    const noteToSave = method === "other" ? (note.trim() || null) : null;

    const res = isEdit
      ? await updatePayment(existingPayment!.id, amt, method, noteToSave, finalUrls)
      : appointmentId
        ? await recordPayment(appointmentId, amt, method, noteToSave, finalUrls)
        : { error: "Missing appointment id" };

    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onPaid();
  }

  const totalAttachments = existingUrls.length + newFiles.length;
  const canAddMore = totalAttachments < MAX_ATTACHMENTS;

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
                className={`rounded-xl border-[1.5px] px-3 py-2.5 text-body-sm font-semibold capitalize transition ${
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
              className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 sm:py-2.5 transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
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
            className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 sm:py-2.5 transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          {!isEdit && (
            <p className="mt-1 text-caption text-text-tertiary">
              Auto-filled from the appointment total. Edit if the final amount differs.
            </p>
          )}
        </div>

        {/* Receipt attachments. Up to 5, each ≤ 5 MB. Existing rows
            (edit mode) and newly-picked files coexist in the same list;
            either can be removed individually. */}
        <div>
          <label className="block text-body-sm font-semibold text-text-primary">
            Receipt images <span className="text-text-tertiary font-normal">(optional, up to {MAX_ATTACHMENTS})</span>
          </label>

          {/* List of attachments — existing first, then staged new files. */}
          {(existingUrls.length > 0 || newFiles.length > 0) && (
            <div className="mt-1.5 space-y-1.5">
              {existingUrls.map((url, idx) => (
                <div key={url} className="flex items-center gap-3 rounded-xl border-[1.5px] border-neutral-200 bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Receipt ${idx + 1}`} className="h-12 w-12 rounded-md object-cover ring-1 ring-border" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-body-sm text-text-primary">Receipt {idx + 1}</p>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-caption text-primary-600 hover:text-primary-700">View</a>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExistingUrls((prev) => prev.filter((u) => u !== url))}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-caption font-semibold text-error-700 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {newFiles.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-2 rounded-lg bg-surface-active px-3 py-2">
                  <p className="truncate text-caption text-text-secondary">{file.name}</p>
                  <button
                    type="button"
                    onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== idx))}
                    className="shrink-0 text-caption font-semibold text-text-tertiary hover:text-text-primary"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add buttons — disabled (and dimmed) when at the cap. */}
          <div className={`grid grid-cols-2 gap-2 ${existingUrls.length > 0 || newFiles.length > 0 ? "mt-2" : "mt-1.5"} ${canAddMore ? "" : "opacity-40 pointer-events-none"}`}>
            {/* Camera */}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 py-3 sm:py-2.5 text-body-sm font-semibold text-text-primary hover:border-neutral-400 transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
              Take Photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                className="sr-only"
              />
            </label>
            {/* Upload — multiple, can pick several at once. */}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 py-3 sm:py-2.5 text-body-sm font-semibold text-text-primary hover:border-neutral-400 transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              Upload
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                className="sr-only"
              />
            </label>
          </div>

          {totalAttachments > 0 && (
            <p className="mt-1.5 text-caption text-text-tertiary">
              {totalAttachments} of {MAX_ATTACHMENTS} attached
            </p>
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
            className="rounded-xl bg-neutral-900 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition disabled:opacity-50"
          >
            {submitting ? "Saving..." : isEdit ? "Save" : "Mark as Paid"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
