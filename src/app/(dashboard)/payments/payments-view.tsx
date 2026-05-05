"use client";

import { useState } from "react";

export type PaymentRow = {
  id: string;
  amount: number;
  method: "cash" | "card" | "other";
  note: string | null;
  receipt_url: string | null;
  created_at: string;
  appointments: {
    id: string;
    date: string;
    time: string;
    status: string;
    clients: { id: string; name: string; phone: string | null } | null;
    appointment_services: { services: { name: string; price: number } | null }[];
  } | null;
};

function formatCurrency(amount: number) {
  return `AED ${amount.toFixed(0)}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatTime12(time24: string) {
  const [hStr, m] = time24.split(":");
  const h = parseInt(hStr);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m} ${period}`;
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

export default function PaymentsView({ initialPayments }: { initialPayments: PaymentRow[] }) {
  const [payments] = useState<PaymentRow[]>(initialPayments);
  const [error] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-title-page font-bold tracking-tight text-text-primary">Payments</h1>
          <p className="mt-0.5 text-body-sm text-text-secondary">
            {payments.length} payment{payments.length !== 1 ? "s" : ""} &middot; {formatCurrency(total)}
          </p>
        </div>
      </div>

      {error && <p className="mt-4 text-body-sm text-error-700">{error}</p>}

      {payments.length === 0 ? (
        <div className="mt-8 rounded-2xl ring-1 ring-border bg-white p-8 text-center text-text-secondary">
          No payments yet. Mark an appointment as paid to see it here.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {payments.map((p) => {
            const appt = p.appointments;
            const clientName = appt?.clients?.name || "Unknown";
            const services = appt?.appointment_services?.map((as2) => as2.services?.name).filter(Boolean) as string[];
            return (
              <div
                key={p.id}
                className="rounded-2xl ring-1 ring-border bg-white p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-text-primary truncate">{clientName}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${methodColor(p.method)}`}>
                        {methodLabel(p.method)}
                      </span>
                    </div>
                    {appt && (
                      <p className="mt-1 text-body-sm text-text-secondary">
                        {formatDate(appt.date)} · {formatTime12(appt.time)}
                      </p>
                    )}
                    {services && services.length > 0 && (
                      <p className="mt-1 text-body-sm text-text-secondary truncate">
                        {services.join(" · ")}
                      </p>
                    )}
                    {p.method === "other" && p.note && (
                      <p className="mt-1 text-caption text-text-tertiary italic">
                        Note: {p.note}
                      </p>
                    )}
                    <p className="mt-1 text-caption text-text-tertiary">
                      Recorded {formatDate(p.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <p className="text-lg font-semibold text-text-primary">
                      {formatCurrency(p.amount)}
                    </p>
                    {p.receipt_url && (
                      <button
                        onClick={() => setPreviewUrl(p.receipt_url)}
                        className="block h-14 w-14 overflow-hidden rounded-lg ring-1 ring-border hover:ring-neutral-400 transition-all"
                        title="View receipt"
                      >
                        <img
                          src={p.receipt_url}
                          alt="Receipt"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Receipt preview overlay */}
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
            <img
              src={previewUrl}
              alt="Receipt"
              className="max-h-[90vh] max-w-[90vw] rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
