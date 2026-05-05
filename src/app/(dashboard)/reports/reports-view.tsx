"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  getReportAppointments,
  getReportPayments,
  getReportExpenses,
  getReportReviews,
} from "./actions";

// ---- Types ----

export interface AppointmentService {
  id: string;
  service_id: string;
  staff_id: string | null;
  is_parallel: boolean;
  sort_order: number;
  services: { id: string; name: string; price: number; duration_minutes: number } | null;
}

export interface ReportAppointment {
  id: string;
  client_id: string;
  date: string;
  time: string;
  status: string;
  notes: string | null;
  created_at: string;
  clients: { id: string; name: string; phone: string | null } | null;
  appointment_services: AppointmentService[];
}

export interface ReportPayment {
  id: string;
  appointment_id: string;
  amount: number;
  method: string;
  created_at: string;
  appointments: {
    id: string;
    date: string;
    time: string;
    client_id: string;
    clients: { id: string; name: string } | null;
  } | null;
}

export interface ReportExpense {
  id: string;
  description: string;
  amount: number;
  expense_type: string;
  date: string;
  time: string | null;
  notes: string | null;
  created_at: string;
}

export interface ReportReview {
  id: string;
  rating: number;
  comment: string | null;
  wants_followup: boolean;
  redirected_externally: boolean;
  submitted_at: string;
  appointment_id: string;
  appointments: {
    id: string;
    date: string;
    time: string;
    clients: { id: string; name: string } | null;
    appointment_services: Array<{
      staff_id: string | null;
      services: { name: string } | null;
    }>;
  } | null;
}

type TabKey = "overview" | "appointments" | "payments" | "expenses" | "reviews";
type DatePreset = "today" | "30days" | "custom";

// ---- Helpers ----

function formatCurrency(amount: number) {
  return `AED ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function toISODate(d: Date) {
  return d.toISOString().split("T")[0];
}

function getPresetRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = toISODate(now);

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "30days": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { from: toISODate(d), to: today };
    }
    default:
      return { from: today, to: today };
  }
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  on_the_way: "On the Way",
  arrived: "Arrived",
  completed: "Completed",
  paid: "Paid",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-neutral-100 text-text-primary",
  on_the_way: "bg-blue-50 text-blue-700",
  arrived: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  paid: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-600",
};

const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  "30days": "Past 30 Days",
  custom: "Custom",
};

// ---- Stat Card ----

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-border p-4 sm:p-6">
      <p className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className={`mt-1 text-xl font-bold tracking-tight sm:text-2xl ${color || "text-text-primary"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-caption text-text-secondary">{sub}</p>}
    </div>
  );
}

// ---- Main Page ----

export interface ReportsViewProps {
  initialAppointments: ReportAppointment[];
  initialPayments: ReportPayment[];
  initialExpenses: ReportExpense[];
  initialReviews: ReportReview[];
}

export default function ReportsView({
  initialAppointments,
  initialPayments,
  initialExpenses,
  initialReviews,
}: ReportsViewProps) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [preset, setPreset] = useState<DatePreset>("30days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(false);

  const [appointments, setAppointments] = useState<ReportAppointment[]>(initialAppointments);
  const [payments, setPayments] = useState<ReportPayment[]>(initialPayments);
  const [expenses, setExpenses] = useState<ReportExpense[]>(initialExpenses);
  const [reviews, setReviews] = useState<ReportReview[]>(initialReviews);

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
      const [appts, pays, exps, revs] = await Promise.all([
        getReportAppointments(from, to),
        getReportPayments(from, to),
        getReportExpenses(from, to),
        getReportReviews(from, to),
      ]);
      setAppointments(appts as unknown as ReportAppointment[]);
      setPayments(pays as unknown as ReportPayment[]);
      setExpenses(exps as unknown as ReportExpense[]);
      setReviews(revs as unknown as ReportReview[]);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [getRange]);

  // Skip the very first run because the server already seeded the initial period's data.
  // Subsequent preset/customFrom/customTo changes still trigger a fetch.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    loadData();
  }, [loadData]);

  // ---- Computed stats ----

  const totalRevenue = payments.reduce((s, p) => s + p.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const profit = totalRevenue - totalExpenses;

  const totalAppointments = appointments.length;
  const completedOrPaid = appointments.filter((a) => a.status === "paid" || a.status === "completed").length;
  const cancelledCount = appointments.filter((a) => a.status === "cancelled").length;

  const cashPayments = payments.filter((p) => p.method === "cash");
  const cardPayments = payments.filter((p) => p.method === "card");
  const cashTotal = cashPayments.reduce((s, p) => s + p.amount, 0);
  const cardTotal = cardPayments.reduce((s, p) => s + p.amount, 0);

  // Expense breakdown by type
  const expenseByType: Record<string, number> = {};
  expenses.forEach((e) => {
    expenseByType[e.expense_type] = (expenseByType[e.expense_type] || 0) + e.amount;
  });
  const expenseBreakdown = Object.entries(expenseByType)
    .sort((a, b) => b[1] - a[1]);

  // Revenue per appointment (service prices)
  function getApptRevenue(appt: ReportAppointment) {
    return appt.appointment_services.reduce((s, as2) => s + (as2.services?.price || 0), 0);
  }
  const expectedRevenue = appointments
    .filter((a) => a.status !== "cancelled")
    .reduce((s, a) => s + getApptRevenue(a), 0);

  // ---- Tab content ----

  const TABS: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "appointments", label: "Appointments" },
    { key: "payments", label: "Payments" },
    { key: "expenses", label: "Expenses" },
    { key: "reviews", label: "Reviews" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-title-page font-bold tracking-tight text-text-primary">Reports</h1>

        {/* Date range selector */}
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(PRESET_LABELS) as DatePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`rounded-lg px-2.5 py-1.5 text-caption font-semibold transition-colors sm:px-3 sm:text-body-sm ${
                  preset === p
                    ? "bg-neutral-900 text-text-inverse"
                    : "bg-surface-active text-text-secondary hover:bg-neutral-100"
                }`}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
        </div>
      </div>

      {/* Custom date inputs */}
      {preset === "custom" && (
        <div className="flex items-center gap-3">
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

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-surface-active p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-caption font-semibold transition-colors sm:text-body-sm ${
              tab === t.key
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-16 text-center text-body-sm text-text-tertiary">Loading reports...</p>
      ) : (
        <>
          {/* ===== OVERVIEW TAB ===== */}
          {tab === "overview" && (
            <div className="space-y-6">
              {/* 2x2 stat grid */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <StatCard label="Revenue" value={formatCurrency(totalRevenue)} color="text-green-700" />
                <StatCard label="Expenses" value={formatCurrency(totalExpenses)} color="text-red-600" />
                <StatCard
                  label="Profit"
                  value={formatCurrency(profit)}
                  color={profit >= 0 ? "text-green-700" : "text-red-600"}
                />
                <StatCard label="Appointments" value={String(totalAppointments)} sub={`${completedOrPaid} completed`} />
              </div>

              {/* Trimmed two-column breakdowns */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Revenue breakdown */}
                <div className="rounded-2xl bg-white ring-1 ring-border px-5 py-4">
                  <p className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">Revenue</p>
                  <div className="mt-2 divide-y divide-border">
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-body-sm text-text-secondary">Cash</span>
                      <span className="text-body-sm font-semibold text-text-primary">{formatCurrency(cashTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-body-sm text-text-secondary">Card</span>
                      <span className="text-body-sm font-semibold text-text-primary">{formatCurrency(cardTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Expense breakdown */}
                <div className="rounded-2xl bg-white ring-1 ring-border px-5 py-4">
                  <p className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">Expenses</p>
                  {expenseBreakdown.length === 0 ? (
                    <p className="mt-2 py-2.5 text-body-sm text-text-tertiary">None this period</p>
                  ) : (
                    <div className="mt-2 divide-y divide-border">
                      {expenseBreakdown.map(([type, amount]) => (
                        <div key={type} className="flex items-center justify-between py-2.5">
                          <span className="text-body-sm text-text-secondary">{type}</span>
                          <span className="text-body-sm font-semibold text-text-primary">{formatCurrency(amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ===== APPOINTMENTS TAB ===== */}
          {tab === "appointments" && (
            <div className="rounded-2xl bg-white ring-1 ring-border">
              <div className="border-b border-border px-5 py-4 flex items-center justify-between">
                <h3 className="text-body-sm font-semibold text-text-primary">
                  Appointments
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-caption font-normal text-text-secondary">{appointments.length}</span>
                </h3>
              </div>

              {appointments.length === 0 ? (
                <p className="py-12 text-center text-body-sm text-text-tertiary">No appointments in this period</p>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left text-body-sm">
                      <thead>
                        <tr className="border-b border-border text-caption font-semibold uppercase tracking-wider text-text-tertiary">
                          <th className="px-5 py-3">Date</th>
                          <th className="px-5 py-3">Time</th>
                          <th className="px-5 py-3">Client</th>
                          <th className="px-5 py-3">Services</th>
                          <th className="px-5 py-3 text-right">Amount</th>
                          <th className="px-5 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {appointments.map((appt) => {
                          const total = getApptRevenue(appt);
                          const serviceNames = appt.appointment_services
                            .map((as2) => as2.services?.name || "Unknown")
                            .join(", ");
                          return (
                            <tr key={appt.id} className="hover:bg-surface-hover">
                              <td className="whitespace-nowrap px-5 py-3 text-text-primary">{formatDate(appt.date)}</td>
                              <td className="whitespace-nowrap px-5 py-3 text-text-secondary">{formatTime12(appt.time)}</td>
                              <td className="px-5 py-3 font-normal text-text-primary">{appt.clients?.name || "Unknown"}</td>
                              <td className="px-5 py-3 text-text-secondary max-w-[200px] truncate">{serviceNames}</td>
                              <td className="whitespace-nowrap px-5 py-3 text-right font-normal text-text-primary">{formatCurrency(total)}</td>
                              <td className="px-5 py-3">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-caption font-medium ${STATUS_COLORS[appt.status] || "bg-gray-100 text-text-primary"}`}>
                                  {STATUS_LABELS[appt.status] || appt.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="sm:hidden divide-y divide-border">
                    {appointments.map((appt) => {
                      const total = getApptRevenue(appt);
                      const serviceNames = appt.appointment_services
                        .map((as2) => as2.services?.name || "Unknown")
                        .join(", ");
                      return (
                        <div key={appt.id} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <p className="text-body-sm font-normal text-text-primary">{appt.clients?.name || "Unknown"}</p>
                            <span className={`rounded-full px-2 py-0.5 text-caption font-medium ${STATUS_COLORS[appt.status] || "bg-gray-100 text-text-primary"}`}>
                              {STATUS_LABELS[appt.status] || appt.status}
                            </span>
                          </div>
                          <p className="mt-0.5 text-caption text-text-secondary truncate">{serviceNames}</p>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-caption text-text-tertiary">{formatDate(appt.date)} at {formatTime12(appt.time)}</span>
                            <span className="text-body-sm font-semibold text-text-primary">{formatCurrency(total)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== PAYMENTS TAB ===== */}
          {tab === "payments" && (
            <div className="space-y-4">
              {/* Payment summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Total" value={formatCurrency(totalRevenue)} />
                <StatCard label="Cash" value={formatCurrency(cashTotal)} sub={`${cashPayments.length} payments`} />
                <StatCard label="Card" value={formatCurrency(cardTotal)} sub={`${cardPayments.length} payments`} />
              </div>

              <div className="rounded-2xl bg-white ring-1 ring-border">
                <div className="border-b border-border px-5 py-4 flex items-center justify-between">
                  <h3 className="text-body-sm font-semibold text-text-primary">
                    Payments
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-caption font-normal text-text-secondary">{payments.length}</span>
                  </h3>
                </div>

                {payments.length === 0 ? (
                  <p className="py-12 text-center text-body-sm text-text-tertiary">No payments in this period</p>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-left text-body-sm">
                        <thead>
                          <tr className="border-b border-border text-caption font-semibold uppercase tracking-wider text-text-tertiary">
                            <th className="px-5 py-3">Date</th>
                            <th className="px-5 py-3">Client</th>
                            <th className="px-5 py-3">Method</th>
                            <th className="px-5 py-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {payments.map((pay) => {
                            const clientName = pay.appointments?.clients?.name || "Unknown";
                            const date = pay.appointments?.date
                              ? formatDate(pay.appointments.date)
                              : new Date(pay.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                            return (
                              <tr key={pay.id} className="hover:bg-surface-hover">
                                <td className="whitespace-nowrap px-5 py-3 text-text-primary">{date}</td>
                                <td className="px-5 py-3 font-normal text-text-primary">{clientName}</td>
                                <td className="px-5 py-3">
                                  <span className={`inline-block rounded-full px-2 py-0.5 text-caption font-medium ${
                                    pay.method === "cash"
                                      ? "bg-green-50 text-green-700"
                                      : "bg-blue-50 text-blue-700"
                                  }`}>
                                    {pay.method === "cash" ? "Cash" : "Card"}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-text-primary">{formatCurrency(pay.amount)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="sm:hidden divide-y divide-border">
                      {payments.map((pay) => {
                        const clientName = pay.appointments?.clients?.name || "Unknown";
                        const date = pay.appointments?.date
                          ? formatDate(pay.appointments.date)
                          : new Date(pay.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                        return (
                          <div key={pay.id} className="flex items-center justify-between px-4 py-3">
                            <div>
                              <p className="text-body-sm font-normal text-text-primary">{clientName}</p>
                              <p className="text-caption text-text-tertiary">{date}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-body-sm font-semibold text-text-primary">{formatCurrency(pay.amount)}</p>
                              <span className={`inline-block rounded-full px-2 py-0.5 text-caption font-medium ${
                                pay.method === "cash"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}>
                                {pay.method === "cash" ? "Cash" : "Card"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ===== EXPENSES TAB ===== */}
          {tab === "expenses" && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white ring-1 ring-border">
                <div className="border-b border-border px-5 py-4 flex items-center justify-between">
                  <h3 className="text-body-sm font-semibold text-text-primary">
                    Expenses
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-caption font-normal text-text-secondary">{expenses.length}</span>
                  </h3>
                </div>

                {expenses.length === 0 ? (
                  <p className="py-12 text-center text-body-sm text-text-tertiary">No expenses in this period</p>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-left text-body-sm">
                        <thead>
                          <tr className="border-b border-border text-caption font-semibold uppercase tracking-wider text-text-tertiary">
                            <th className="px-5 py-3">Date</th>
                            <th className="px-5 py-3">Description</th>
                            <th className="px-5 py-3">Category</th>
                            <th className="px-5 py-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {expenses.map((exp) => (
                            <tr key={exp.id} className="hover:bg-surface-hover">
                              <td className="whitespace-nowrap px-5 py-3 text-text-primary">{formatDate(exp.date)}</td>
                              <td className="px-5 py-3 font-normal text-text-primary max-w-[250px] truncate">{exp.description}</td>
                              <td className="px-5 py-3">
                                <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-caption font-medium text-text-primary">
                                  {exp.expense_type}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-red-600">{formatCurrency(exp.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="sm:hidden divide-y divide-border">
                      {expenses.map((exp) => (
                        <div key={exp.id} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <p className="text-body-sm font-normal text-text-primary truncate max-w-[200px]">{exp.description}</p>
                            <p className="text-body-sm font-semibold text-red-600">{formatCurrency(exp.amount)}</p>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-caption text-text-tertiary">{formatDate(exp.date)}</span>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-caption font-medium text-text-secondary">
                              {exp.expense_type}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Total under list */}
                    <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 text-body-sm">
                      <span className="text-text-tertiary">Total</span>
                      <span className="font-semibold text-red-600">{formatCurrency(totalExpenses)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Expense by category breakdown */}
              {expenseBreakdown.length > 0 && (
                <div className="rounded-2xl bg-white ring-1 ring-border">
                  <div className="border-b border-border px-5 py-4">
                    <h3 className="text-body-sm font-semibold text-text-primary">By Category</h3>
                  </div>
                  <div className="p-6 space-y-3">
                    {expenseBreakdown.map(([type, amount]) => {
                      const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
                      return (
                        <div key={type}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-body-sm text-text-primary">{type}</span>
                            <span className="text-body-sm font-normal text-text-primary">{formatCurrency(amount)} <span className="text-caption text-text-tertiary">({pct.toFixed(0)}%)</span></span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-neutral-900 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== REVIEWS TAB ===== */}
          {tab === "reviews" && (
            <div className="space-y-4">
              {/* Recent reviews list (only) */}
              <div className="rounded-2xl bg-white ring-1 ring-border">
                <div className="border-b border-border px-5 py-4 flex items-center justify-between">
                  <h3 className="text-body-sm font-semibold text-text-primary">
                    Recent Reviews
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-caption font-normal text-text-secondary">
                      {reviews.length}
                    </span>
                  </h3>
                </div>

                {reviews.length === 0 ? (
                  <p className="py-12 text-center text-body-sm text-text-tertiary">
                    No reviews in this period yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {reviews.map((r) => {
                      const clientName = r.appointments?.clients?.name || "Anonymous";
                      const services = (r.appointments?.appointment_services || [])
                        .map((as2) => as2.services?.name)
                        .filter(Boolean)
                        .join(", ");
                      const submittedDate = new Date(r.submitted_at).toLocaleDateString(
                        "en-GB",
                        { day: "numeric", month: "short", year: "numeric" }
                      );
                      return (
                        <div key={r.id} className="px-5 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-body-sm font-semibold text-text-primary">
                                  {clientName}
                                </span>
                                <span className="text-amber-500 text-body-sm">
                                  {"★".repeat(r.rating)}
                                  <span className="text-gray-300">
                                    {"★".repeat(5 - r.rating)}
                                  </span>
                                </span>
                                {r.wants_followup && (
                                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-caption font-medium text-amber-700">
                                    Wants follow-up
                                  </span>
                                )}
                                {r.redirected_externally && (
                                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-caption font-medium text-blue-700">
                                    Shared publicly
                                  </span>
                                )}
                              </div>
                              {services && (
                                <p className="mt-0.5 text-caption text-text-tertiary truncate">
                                  {services}
                                </p>
                              )}
                              {r.comment && (
                                <p className="mt-1.5 text-body-sm text-text-secondary whitespace-pre-wrap">
                                  {r.comment}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 text-caption text-text-tertiary">
                              {submittedDate}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
