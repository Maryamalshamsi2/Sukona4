"use client";

import { useEffect, useState, use } from "react";
import { getReceiptContext } from "./actions";
import type { ReceiptContext } from "@/types";

/**
 * Public receipt page — accessible to anyone with the token, no login.
 *
 * Print-styled: a "Print / Save as PDF" button at the top opens the
 * browser print dialog. We use a `print:` Tailwind variant to hide UI
 * chrome (button, page background) so the printed page is just the
 * receipt body — clean and PDF-ready.
 */
export default function ReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [ctx, setCtx] = useState<ReceiptContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await getReceiptContext(token);
      if (cancelled) return;
      if (!data) setNotFound(true);
      else setCtx(data);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <Shell>
        <p className="text-center text-sm text-text-tertiary">Loading receipt…</p>
      </Shell>
    );
  }

  if (notFound || !ctx) {
    return (
      <Shell>
        <h1 className="text-lg font-bold text-text-primary">Receipt not found</h1>
        <p className="mt-2 text-sm text-text-secondary">
          This receipt link is invalid or has expired. Please contact the salon
          if you believe this is a mistake.
        </p>
      </Shell>
    );
  }

  const brand = ctx.salon_brand_color || "#0A0A0A";
  const showVat = (ctx.vat_percent || 0) > 0;

  return (
    <div className="min-h-screen bg-[#F5F5F7] py-6 px-4 print:bg-white print:py-0 print:px-0">
      {/* Action bar — hidden on print */}
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between print:hidden">
        <div className="text-xs text-text-tertiary">
          Receipt {ctx.receipt_number}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 active:scale-[0.98] transition"
          style={{ backgroundColor: brand }}
        >
          Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 print:rounded-none print:shadow-none print:ring-0 print:p-0">
        {/* Brand stripe */}
        <div
          className="mb-6 h-1.5 w-16 rounded-full print:hidden"
          style={{ backgroundColor: brand }}
        />

        {/* Header — salon left, RECEIPT label right */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
              {ctx.salon_name}
            </h1>
            {ctx.salon_phone && (
              <p className="mt-1 text-sm text-text-secondary">{ctx.salon_phone}</p>
            )}
            {ctx.salon_vat_trn && (
              <p className="mt-0.5 text-xs text-text-tertiary">
                TRN: {ctx.salon_vat_trn}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Receipt
            </p>
            <p className="mt-1 text-base font-bold text-text-primary">
              {ctx.receipt_number}
            </p>
            {ctx.is_voided && (
              <span className="mt-2 inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                VOIDED
              </span>
            )}
          </div>
        </div>

        {/* Customer + date block */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Billed to
            </p>
            <p className="mt-1 text-base font-semibold text-text-primary">
              {ctx.client_name}
            </p>
            {ctx.client_phone && (
              <p className="text-sm text-text-secondary">{ctx.client_phone}</p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Date
            </p>
            <p className="mt-1 text-base text-text-primary">
              {formatDate(ctx.appointment_date)}
            </p>
            <p className="text-sm text-text-secondary">
              {formatTime12(ctx.appointment_time)}
            </p>
          </div>
        </div>

        {/* Service lines table */}
        <div className="mt-6 overflow-hidden rounded-xl ring-1 ring-gray-100 print:rounded-none print:ring-0 print:border print:border-gray-300">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                <th className="px-4 py-2.5">Service</th>
                <th className="px-4 py-2.5 text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ctx.service_lines.map((line, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 text-text-primary">{line.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-text-primary">
                    {formatMoney(line.price)}
                  </td>
                </tr>
              ))}
              {ctx.service_lines.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-text-tertiary">
                    No services on this appointment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals block — right-aligned summary */}
        <div className="mt-5 ml-auto max-w-xs space-y-1.5 text-sm">
          {showVat && (
            <>
              <div className="flex items-center justify-between text-text-secondary">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatMoney(ctx.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-text-secondary">
                <span>VAT ({Number(ctx.vat_percent)}%)</span>
                <span className="tabular-nums">{formatMoney(ctx.vat_amount)}</span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between border-t border-gray-200 pt-2 text-base font-bold text-text-primary">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(ctx.total_due)}</span>
          </div>
        </div>

        {/* Payments block */}
        {ctx.payment_lines.length > 0 && (
          <div className="mt-6 rounded-xl bg-gray-50 p-4 print:bg-transparent print:border print:border-gray-200 print:rounded-none">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Payment{ctx.payment_lines.length > 1 ? "s" : ""}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {ctx.payment_lines.map((p, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="text-text-secondary">
                    {formatMethod(p.method)}
                    <span className="ml-2 text-xs text-text-tertiary">
                      {formatDateShort(p.paid_at)}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-text-primary">
                    {formatMoney(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 text-sm">
              <span className="font-semibold text-text-primary">Total paid</span>
              <span className="font-bold tabular-nums text-text-primary">
                {formatMoney(ctx.total_paid)}
              </span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 border-t border-gray-100 pt-5 text-center text-xs text-text-tertiary">
          {ctx.salon_signoff || `Thank you for visiting ${ctx.salon_name}.`}
        </div>
      </div>
    </div>
  );
}

// ---- Shell for loading / not-found states ----

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
        {children}
      </div>
    </div>
  );
}

// ---- Formatters ----

function formatMoney(amount: number) {
  return `AED ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime12(time24: string) {
  const [h, m] = time24.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${m} ${ampm}`;
}

function formatMethod(method: string) {
  if (method === "cash") return "Cash";
  if (method === "card") return "Card";
  return "Other";
}
