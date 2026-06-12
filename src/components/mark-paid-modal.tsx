"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/modal";
import { recordPayment, updatePayment, uploadReceipt } from "@/app/(dashboard)/payments/actions";
import {
  getGiftCardByCode,
  redeemGiftCard,
} from "@/app/(dashboard)/gift-cards/actions";
import type { PaymentMethod } from "@/types";
import { useCurrency } from "@/lib/user-context";
import { formatCurrency } from "@/lib/currency";
import { compressImage } from "@/lib/image-compress";
import {
  formatCode as formatGiftCardCode,
  isCompleteCode,
  normalizeCode,
} from "@/lib/gift-card-code";

export type ExistingPayment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  note: string | null;
  /** Migration-026 array of attachment URLs. Falls back to a single
   *  receipt_url for legacy rows that pre-date the migration. */
  receipt_urls?: string[] | null;
  receipt_url?: string | null;
  /** Migration-038 — tip recorded against this payment. */
  tip_amount?: number | null;
  tip_to_staff_id?: string | null;
};

/** Lightweight list of staff who can receive tip attribution on this
 *  payment. Parent passes the staff who actually performed services
 *  on the appointment; "Split equally" is always available as the
 *  default. Empty list → tip selector is hidden entirely. */
export type StaffOption = { id: string; name: string };

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
  /** Staff who can receive a tip on this appointment. Pass the
   *  unique set of staff_ids attached to appointment_services so the
   *  "Tip to" selector only lists people who actually worked on it.
   *  Omit (or pass [])  to hide the attribution selector — the tip
   *  will be split equally at payroll time. */
  appointmentStaff?: StaffOption[];
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
  appointmentStaff,
  onClose,
  onPaid,
}: Props) {
  const isEdit = !!existingPayment;
  const currency = useCurrency();

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<string>("");
  // Tip recorded against this payment (migration-038). Optional, defaults
  // to 0 / empty input. The attribution selector below ("Tip to") only
  // renders when there's a non-zero tip AND the parent passed in staff.
  const [tipAmount, setTipAmount] = useState<string>("");
  const [tipToStaffId, setTipToStaffId] = useState<string>(""); // "" = split equally
  // ---- Gift card redemption state. Only relevant when method='gift_card'.
  // The code lives in display form (with dashes); we normalize when
  // calling the server. Lookup populates giftCard with balance/customer.
  // remainderMethod is the cash/card/other used for whatever portion
  // the card can't cover (partial-redeem scenarios). ----
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCard, setGiftCard] = useState<{
    id: string;
    balance: number;
    status: string;
    expires_at: string | null;
    clientName: string | null;
  } | null>(null);
  const [giftCardLookupErr, setGiftCardLookupErr] = useState<string | null>(null);
  const [giftCardLooking, setGiftCardLooking] = useState(false);
  const [remainderMethod, setRemainderMethod] = useState<"cash" | "card" | "other">("cash");
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
      setTipAmount(
        existingPayment.tip_amount && existingPayment.tip_amount > 0
          ? String(existingPayment.tip_amount)
          : ""
      );
      setTipToStaffId(existingPayment.tip_to_staff_id ?? "");
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
      setTipAmount("");
      setTipToStaffId("");
      setExistingUrls([]);
    }
    setNewFiles([]);
    setError(null);
    // Reset gift-card scratch state on every open. Edit mode for a
    // gift_card-method row just shows the locked method; we don't
    // re-look-up the card because the redemption is immutable.
    setGiftCardCode("");
    setGiftCard(null);
    setGiftCardLookupErr(null);
    setGiftCardLooking(false);
    setRemainderMethod("cash");
  }, [open, defaultAmount, existingPayment]);

  // Auto-look-up the card as soon as a complete code is entered.
  // Prevents the user from having to tap a separate "Look up" button.
  useEffect(() => {
    if (method !== "gift_card") return;
    if (!isCompleteCode(giftCardCode)) {
      setGiftCard(null);
      setGiftCardLookupErr(null);
      return;
    }
    let cancelled = false;
    setGiftCardLooking(true);
    setGiftCardLookupErr(null);
    (async () => {
      const res = await getGiftCardByCode(giftCardCode);
      if (cancelled) return;
      setGiftCardLooking(false);
      if ("error" in res) {
        setGiftCard(null);
        setGiftCardLookupErr(res.error ?? "Lookup failed");
        return;
      }
      const c = res.card;
      const clientObj = Array.isArray(c.clients) ? c.clients[0] : c.clients;
      setGiftCard({
        id: c.id,
        balance: Number(c.balance || 0),
        status: c.status,
        expires_at: c.expires_at,
        clientName: clientObj?.name ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [giftCardCode, method]);

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

    // Compress + upload every newly-picked file in parallel. The
    // previous version did this in a for/await loop, which was the
    // single biggest slowdown reported — 3 attachments meant 3
    // sequential network round-trips of full-size phone photos
    // (often 3–8 MB each).
    //
    // compressImage shrinks the typical 5 MB phone photo to ~300 KB
    // before upload (no perceptible quality loss for a receipt at
    // screen scale). Promise.all then fires all uploads at once.
    // Together: ~10×–20× faster on cellular for multi-file submits.
    //
    // Order is preserved by mapping over newFiles (Promise.all keeps
    // index order) and concatenating with existingUrls first.
    let uploaded: string[] = [];
    try {
      const results = await Promise.all(
        newFiles.map(async (file) => {
          const compressed = await compressImage(file);
          const fd = new FormData();
          fd.append("file", compressed);
          return uploadReceipt(fd);
        }),
      );
      const failure = results.find((r) => r.error);
      if (failure) {
        setError(failure.error ?? "Upload failed");
        setSubmitting(false);
        return;
      }
      uploaded = results.map((r) => r.url).filter((u): u is string => !!u);
    } catch {
      setError("Could not upload one or more receipts. Try again.");
      setSubmitting(false);
      return;
    }
    const finalUrls = [...existingUrls, ...uploaded];

    const noteToSave = method === "other" ? (note.trim() || null) : null;

    // Parse tip — empty / NaN / negative all coerce to 0 (no tip).
    const tipParsed = parseFloat(tipAmount);
    const tipToSave = isNaN(tipParsed) || tipParsed < 0 ? 0 : tipParsed;
    // Attribution only meaningful when there IS a tip. Sending NULL
    // means "split equally across staff who did the appointment" at
    // payroll calc time.
    const tipStaffToSave =
      tipToSave > 0 && tipToStaffId ? tipToStaffId : null;

    // ---- Gift card branch (record mode only — edit mode hides the
    //      gift_card method button entirely). Two paths:
    //
    //        Full coverage (balance >= amount):
    //          - Redeem `amt` from the card
    //          - Insert one payment row, method='gift_card'
    //
    //        Partial coverage (balance < amount):
    //          - Redeem `balance` from the card
    //          - Insert one payment row, method='gift_card', amount=balance
    //          - Insert a second payment row, method=remainderMethod,
    //            amount=amt-balance, for the remainder
    //
    //      The redemption goes FIRST. If it fails (expired, voided,
    //      gone) we abort before touching `payments`. If the payment
    //      INSERTs fail after the redemption succeeded, the card is
    //      already debited — surface a precise error so the user knows
    //      to record the payment row manually. ----
    if (!isEdit && method === "gift_card") {
      if (!appointmentId) {
        setError("Missing appointment id");
        setSubmitting(false);
        return;
      }
      if (!giftCard) {
        setError("Look up the gift card first");
        setSubmitting(false);
        return;
      }
      const cardAmount = Math.min(amt, giftCard.balance);
      const remainder = +(amt - cardAmount).toFixed(2);

      // 1. Redeem from the card.
      const redeem = await redeemGiftCard({
        code: normalizeCode(giftCardCode),
        amount: cardAmount,
        appointmentId,
        notes: noteToSave,
      });
      if ("error" in redeem && redeem.error) {
        setError(redeem.error);
        setSubmitting(false);
        return;
      }

      // 2. Record the gift_card payment row. Tip goes on the
      //    REMAINDER row when there is one (tip is rarely on the
      //    card); otherwise it goes here.
      const tipOnCard = remainder > 0 ? 0 : tipToSave;
      const tipStaffOnCard = remainder > 0 ? null : tipStaffToSave;
      const giftRes = await recordPayment(
        appointmentId,
        cardAmount,
        "gift_card",
        // Embed the displayed code as a note so the receipt shows
        // "Gift card · ABCD-EF23-XYZ9" without needing a join.
        `Gift card · ${formatGiftCardCode(giftCardCode)}`,
        finalUrls,
        tipOnCard,
        tipStaffOnCard,
      );
      if (giftRes.error) {
        setError(
          `Gift card was redeemed (${formatCurrency(cardAmount, currency)}) but recording the payment failed: ${giftRes.error}`,
        );
        setSubmitting(false);
        return;
      }

      // 3. If there's a remainder, record a second payment row.
      if (remainder > 0) {
        const remainderNote =
          remainderMethod === "other" ? (note.trim() || null) : null;
        const remRes = await recordPayment(
          appointmentId,
          remainder,
          remainderMethod,
          remainderNote,
          // Receipts attached to first row only — Supabase storage
          // dedup isn't a concern here, just avoids double-listing.
          [],
          tipToSave,
          tipStaffToSave,
        );
        if (remRes.error) {
          setError(
            `Gift card portion saved. Remainder (${formatCurrency(remainder, currency)}) failed: ${remRes.error}. Record it manually.`,
          );
          setSubmitting(false);
          return;
        }
      }

      setSubmitting(false);
      onPaid();
      return;
    }

    const res = isEdit
      ? await updatePayment(existingPayment!.id, amt, method, noteToSave, finalUrls, tipToSave, tipStaffToSave)
      : appointmentId
        ? await recordPayment(appointmentId, amt, method, noteToSave, finalUrls, tipToSave, tipStaffToSave)
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

        {/* Payment method. Gift card is hidden in edit mode — you
            can't retroactively switch a cash payment into a gift card
            redemption (the card balance change is its own transaction). */}
        <div>
          <label className="block text-body-sm font-semibold text-text-primary">
            Payment Method *
          </label>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {((isEdit
              ? (["cash", "card", "other"] as const)
              : (["cash", "card", "other", "gift_card"] as const)
            ) as PaymentMethod[]).map((m) => (
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
                {m === "card"
                  ? "Card Payment"
                  : m === "gift_card"
                    ? "Gift card"
                    : m}
              </button>
            ))}
          </div>
        </div>

        {/* Gift card section — code lookup + balance preview + (if
            balance < amount) remainder method picker. Only renders when
            method='gift_card'. */}
        {method === "gift_card" && (
          <GiftCardRedeemBlock
            code={giftCardCode}
            onCodeChange={setGiftCardCode}
            card={giftCard}
            lookupErr={giftCardLookupErr}
            looking={giftCardLooking}
            amount={parseFloat(amount) || 0}
            remainderMethod={remainderMethod}
            onRemainderMethodChange={setRemainderMethod}
            currency={currency}
          />
        )}

        {/* Optional note when "Other" is selected — either as the main
            method, or as the remainder method behind a partial gift card. */}
        {(method === "other" ||
          (method === "gift_card" &&
            remainderMethod === "other" &&
            giftCard &&
            parseFloat(amount) > giftCard.balance)) && (
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
            Amount ({currency}) *
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

        {/* Tip — optional. Tracked separately from amount because it
            belongs to the staff member, not the salon. Goes into the
            monthly payroll summary. */}
        <div>
          <label htmlFor="payment-tip" className="block text-body-sm font-semibold text-text-primary">
            Tip <span className="text-text-tertiary font-normal">(optional)</span>
          </label>
          <input
            id="payment-tip"
            type="number"
            step="0.01"
            min="0"
            value={tipAmount}
            onChange={(e) => setTipAmount(e.target.value)}
            placeholder="0"
            className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 sm:py-2.5 transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />

          {/* Attribution picker — only when there's a tip AND the parent
              passed in 2+ staff. Single-staff appointments don't need a
              picker (the tip can only go one place). Default value is
              "Split equally", which stores NULL. */}
          {parseFloat(tipAmount) > 0 &&
            appointmentStaff &&
            appointmentStaff.length >= 2 && (
              <div className="mt-3">
                <label htmlFor="payment-tip-to" className="block text-caption font-medium text-text-secondary">
                  Tip to
                </label>
                <select
                  id="payment-tip-to"
                  value={tipToStaffId}
                  onChange={(e) => setTipToStaffId(e.target.value)}
                  className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">Split equally across staff</option>
                  {appointmentStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
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
            disabled={
              submitting ||
              // Block submit for gift card flow until we have a
              // verified active card looked up.
              (method === "gift_card" &&
                (!giftCard ||
                  giftCard.status !== "active" ||
                  giftCard.balance <= 0))
            }
            className="rounded-xl bg-neutral-900 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition disabled:opacity-50"
          >
            {submitting ? "Saving..." : isEdit ? "Save" : "Mark as Paid"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Gift card sub-block — code input, balance preview, remainder picker
// ============================================================

function GiftCardRedeemBlock({
  code,
  onCodeChange,
  card,
  lookupErr,
  looking,
  amount,
  remainderMethod,
  onRemainderMethodChange,
  currency,
}: {
  code: string;
  onCodeChange: (v: string) => void;
  card:
    | {
        id: string;
        balance: number;
        status: string;
        expires_at: string | null;
        clientName: string | null;
      }
    | null;
  lookupErr: string | null;
  looking: boolean;
  amount: number;
  remainderMethod: "cash" | "card" | "other";
  onRemainderMethodChange: (m: "cash" | "card" | "other") => void;
  currency: string;
}) {
  // Re-display the code with dashes as the user types. Strip first,
  // then re-format — handles paste of "abcd ef23xyz9" cleanly.
  const display = formatGiftCardCode(code);

  const usable = card && card.status === "active" && card.balance > 0;
  const partial = !!(usable && amount > 0 && amount > (card?.balance ?? 0));
  const remainder = partial && card ? +(amount - card.balance).toFixed(2) : 0;

  return (
    <div className="space-y-3 rounded-xl bg-neutral-50 ring-1 ring-border px-4 py-3">
      <div>
        <label
          htmlFor="gift-card-code"
          className="block text-body-sm font-semibold text-text-primary"
        >
          Gift card code *
        </label>
        <input
          id="gift-card-code"
          type="text"
          value={display}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder="ABCD-EF23-XYZ9"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-4 py-3 sm:py-2.5 font-mono tracking-wider transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </div>

      {looking && (
        <p className="text-caption text-text-tertiary">Looking up…</p>
      )}

      {lookupErr && (
        <p className="text-body-sm text-error-700">{lookupErr}</p>
      )}

      {card && card.status !== "active" && (
        <p className="text-body-sm text-error-700">
          This card is {card.status === "void" ? "voided" : "fully redeemed"}{" "}
          and can&apos;t be used.
        </p>
      )}

      {usable && (
        <div className="rounded-lg bg-white ring-1 ring-border px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-tertiary">
              Available balance
            </span>
            <span className="text-body-sm font-semibold tabular-nums text-text-primary">
              {formatCurrency(card.balance, currency)}
            </span>
          </div>
          {card.clientName && (
            <p className="mt-0.5 text-caption text-text-tertiary">
              Issued to {card.clientName}
            </p>
          )}
          {card.expires_at && (
            <p className="mt-0.5 text-caption text-text-tertiary">
              Expires {card.expires_at}
            </p>
          )}
        </div>
      )}

      {/* Partial-cover prompt: show how much the card covers + a
          method picker for the remainder. */}
      {partial && card && (
        <div className="space-y-2.5 rounded-lg bg-[#FFF8F0] ring-1 ring-[#F0D6A8] px-3 py-2.5">
          <p className="text-body-sm text-text-primary">
            Card covers{" "}
            <span className="font-semibold tabular-nums">
              {formatCurrency(card.balance, currency)}
            </span>
            . Remainder of{" "}
            <span className="font-semibold tabular-nums">
              {formatCurrency(remainder, currency)}
            </span>{" "}
            needs another method.
          </p>
          <div>
            <label className="block text-caption font-semibold text-text-secondary">
              Pay remainder with
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(["cash", "card", "other"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onRemainderMethodChange(m)}
                  className={`rounded-lg border-[1.5px] px-2.5 py-1.5 text-caption font-semibold capitalize transition ${
                    remainderMethod === m
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
      )}
    </div>
  );
}
