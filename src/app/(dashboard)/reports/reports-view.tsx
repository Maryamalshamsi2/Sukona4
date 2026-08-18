"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  getReportAppointments,
  getReportPayments,
  getReportExpenses,
  getReportReviews,
} from "./actions";
import { getReportRetailSales } from "../sales/actions";
import { getReportGiftCardSummary } from "../gift-cards/actions";
import { getReportPackageSummary } from "../gift-cards/packages-actions";
import { deleteAppointment } from "../calendar/actions";
import MarkPaidModal, { type ExistingPayment } from "@/components/mark-paid-modal";
import type { PaymentMethod } from "@/types";
import { useCurrency } from "@/lib/user-context";
import { formatCurrency as fmtCurrency } from "@/lib/currency";
import { useUndo } from "@/components/undo-toast";

// ---- Types ----

export interface AppointmentService {
  id: string;
  service_id: string;
  staff_id: string | null;
  is_parallel: boolean;
  sort_order: number;
  // Bundle tracking (migration 025). See calendar-shared.AppointmentServiceData.
  bundle_id?: string | null;
  bundle_instance_id?: string | null;
  bundle_total_price?: number | null;
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
  // Adjustment fields (migration 024). Used by the Total computation
  // so revenue lines reflect transport / discount / override.
  transportation_charge?: number | null;
  discount_type?: "percentage" | "fixed" | null;
  discount_value?: number | null;
  total_override?: number | null;
  clients: { id: string; name: string; phone: string | null } | null;
  appointment_services: AppointmentService[];
  // Joined: payment rows.
  payments?: Array<{
    id: string;
    receipt_url: string | null;
    created_at: string;
  }>;
}

export interface ReportPayment {
  id: string;
  appointment_id: string;
  amount: number;
  method: string;
  /** Free-text note (used when method = "other"). */
  note: string | null;
  /** Legacy single URL — populated by writes for backwards compat. */
  receipt_url: string | null;
  /** Migration-026 array of attachment URLs. Reads should prefer this
   *  and fall back to wrapping receipt_url for legacy rows. */
  receipt_urls?: string[] | null;
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

type TabKey = "appointments" | "payments" | "expenses" | "reviews";
type DatePreset = "today" | "week" | "month" | "custom";

// ---- Helpers ----


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
  // Local-tz YYYY-MM-DD; see (dashboard)/page.tsx for the rationale.
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
  no_show: "No-show",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-neutral-100 text-text-primary",
  on_the_way: "bg-blue-50 text-blue-700",
  arrived: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  paid: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-600",
  no_show: "bg-purple-50 text-purple-700",
};

const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
  // Still a valid preset value internally — set when the user edits
  // the inline from/to date inputs. Not exposed in the funnel
  // dropdown; PICKABLE_PRESETS below is the ordered subset that is.
  custom: "Custom",
};
const PICKABLE_PRESETS: Array<Exclude<DatePreset, "custom">> = ["today", "week", "month"];

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
  /** All team_groups in the salon. Empty / 1 → team selector hidden.
   *  Multi-Team v1.7 — owner can drill into a single team's numbers. */
  initialTeams: { id: string; name: string }[];
  /** Aggregate retail sales (migration-043) for the initial date
   *  range. Surfaces in the Finance Revenue breakdown as a separate
   *  caption-sized line ("Services" + "Retail / gift cards"). */
  initialRetailSales: { total: number; count: number };
  /** Gift card summary (migration-044):
   *   - redeemedTotal: revenue recognized in window from redemptions
   *   - soldTotal: nominal cash-in from sales (informational, not revenue)
   *   - outstandingLiability: current sum of active card balances
   *     (snapshot — not date-windowed) */
  initialGiftCards: {
    redeemedTotal: number;
    soldTotal: number;
    outstandingLiability: number;
  };
  /** Package summary (migration-046). Same shape rationale as gift
   *  cards — sale-time revenue recognition. */
  initialPackages: {
    soldTotal: number;        // revenue from package sales in window
    sessionsApplied: number;  // count of redemptions in window (audit)
    outstandingSessions: number; // snapshot of remaining sessions
  };
}

export default function ReportsView({
  initialAppointments,
  initialPayments,
  initialExpenses,
  initialReviews,
  initialTeams,
  initialRetailSales,
  initialGiftCards,
  initialPackages,
}: ReportsViewProps) {
  const currency = useCurrency();
  const formatCurrency = (n: number) => fmtCurrency(n, currency, { decimals: 2 });
  const undo = useUndo();
  const [tab, setTab] = useState<TabKey>("expenses");
  const [preset, setPreset] = useState<DatePreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Receipt-image lightbox state. Multi-attachment payments (migration
  // 026) page through with chevrons; single-image stays the same.
  const [previewUrls, setPreviewUrls] = useState<string[] | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);

  // Resolve a payment row to its attachment list — prefer the array,
  // fall back to wrapping the legacy single column.
  function attachmentsFor(pay: { receipt_url: string | null; receipt_urls?: string[] | null }): string[] {
    if (pay.receipt_urls && pay.receipt_urls.length > 0) return pay.receipt_urls;
    return pay.receipt_url ? [pay.receipt_url] : [];
  }
  function openReceiptPreview(pay: { receipt_url: string | null; receipt_urls?: string[] | null }) {
    const urls = attachmentsFor(pay);
    if (urls.length === 0) return;
    setPreviewUrls(urls);
    setPreviewIdx(0);
  }

  // Edit-payment modal — opens when a payment row is clicked.
  const [editingPayment, setEditingPayment] = useState<ExistingPayment | null>(null);
  const [editingPaymentClient, setEditingPaymentClient] = useState<string | undefined>(undefined);

  function openEditPayment(pay: ReportPayment) {
    setEditingPayment({
      id: pay.id,
      amount: pay.amount,
      method: pay.method as PaymentMethod,
      note: pay.note,
      receipt_url: pay.receipt_url,
      receipt_urls: pay.receipt_urls,
    });
    setEditingPaymentClient(pay.appointments?.clients?.name);
  }

  // Period filter dropdown — funnel icon in the title row replaces the
  // old inline pill row for the preset buttons.
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
  const [loading, setLoading] = useState(false);

  const [appointments, setAppointments] = useState<ReportAppointment[]>(initialAppointments);
  const [payments, setPayments] = useState<ReportPayment[]>(initialPayments);
  const [expenses, setExpenses] = useState<ReportExpense[]>(initialExpenses);
  const [reviews, setReviews] = useState<ReportReview[]>(initialReviews);
  const [retailSales, setRetailSales] = useState(initialRetailSales);
  const [giftCards, setGiftCards] = useState(initialGiftCards);
  const [packages, setPackages] = useState(initialPackages);

  // Team filter — null = "All teams" (current behavior). Only shown
  // when the salon has 2+ teams. Expenses are NOT team-scoped (they're
  // salon-wide business costs, not staff-tied), so they ignore this
  // filter — but appointments/payments/reviews refilter.
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [teams] = useState(initialTeams);

  // PDF export ref + flag — the actual handler is defined below,
  // after getRange().
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const getRange = useCallback(() => {
    if (preset === "custom" && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  // PDF export handler. Rasterizes the report DOM (below exportRef)
  // with html2canvas + jsPDF and downloads as a file. Body picks up
  // `.exporting` during capture so globals.css hides sidebar,
  // filters, and the Export button itself. Libs are dynamically
  // imported so /reports ships fast for owners who never hit Export.
  const handleExportPDF = useCallback(async () => {
    if (!exportRef.current || exporting) return;
    setExporting(true);
    // html2canvas-pro is a maintained fork that understands
    // modern color functions (oklch / oklab / color()). Plain
    // html2canvas 1.x throws on the oklch() Tailwind v4 emits.
    const [{ default: html2canvas }, { default: JsPDF }] = await Promise.all([
      import("html2canvas-pro"),
      import("jspdf"),
    ]);
    try {
      // Apply the export styles to html2canvas's off-screen clone
      // (via onclone) instead of the live document. Without this
      // the user watches the sidebar disappear, the report reflow,
      // and then everything snap back when the download starts —
      // jarring even when it takes only a couple hundred ms.
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        windowWidth: exportRef.current.scrollWidth,
        windowHeight: exportRef.current.scrollHeight,
        onclone: (clonedDoc) => {
          clonedDoc.body.classList.add("exporting");
        },
      });
      const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      // A4 = 210 × 297 mm. Fit width to A4 minus margins and split
      // the tall canvas into page-sized chunks so long reports flow
      // across multiple pages without clipping.
      const pageWmm = 210;
      const pageHmm = 297;
      const marginMm = 10;
      const usableWmm = pageWmm - marginMm * 2;
      const usableHmm = pageHmm - marginMm * 2;
      const fullImgHmm = (canvas.height * usableWmm) / canvas.width;
      if (fullImgHmm <= usableHmm) {
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", marginMm, marginMm, usableWmm, fullImgHmm);
      } else {
        const sliceHeightPx = Math.floor((usableHmm / fullImgHmm) * canvas.height);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        const ctx = slice.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable");
        let cursorPx = 0;
        let firstPage = true;
        while (cursorPx < canvas.height) {
          const thisSlicePx = Math.min(sliceHeightPx, canvas.height - cursorPx);
          slice.height = thisSlicePx;
          ctx.clearRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, cursorPx, canvas.width, thisSlicePx, 0, 0, canvas.width, thisSlicePx);
          const sliceHmm = (thisSlicePx / canvas.height) * fullImgHmm;
          if (!firstPage) pdf.addPage();
          pdf.addImage(slice.toDataURL("image/png"), "PNG", marginMm, marginMm, usableWmm, sliceHmm);
          firstPage = false;
          cursorPx += thisSlicePx;
        }
      }
      const { from, to } = getRange();
      pdf.save(`sukona-report-${from}-to-${to}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      // Surface a snippet so we can debug from a screenshot instead
      // of round-tripping to the console.
      undo.error(`Couldn't build the PDF: ${msg.slice(0, 140)}`);
    } finally {
      setExporting(false);
    }
  }, [exporting, getRange, undo]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getRange();
      const [appts, pays, exps, revs, retail, gift, pkg] = await Promise.all([
        getReportAppointments(from, to, teamFilter),
        getReportPayments(from, to, teamFilter),
        getReportExpenses(from, to), // intentionally not team-scoped
        getReportReviews(from, to, teamFilter),
        // Retail sales aren't team-scoped — they're salon-wide
        // walk-in revenue, not staff-attributed services.
        getReportRetailSales(from, to),
        // Gift cards — sale-time revenue. Salon-wide.
        getReportGiftCardSummary(from, to),
        // Packages — sale-time revenue. Salon-wide.
        getReportPackageSummary(from, to),
      ]);
      setAppointments(appts as unknown as ReportAppointment[]);
      setPayments(pays as unknown as ReportPayment[]);
      setExpenses(exps as unknown as ReportExpense[]);
      setReviews(revs as unknown as ReportReview[]);
      setRetailSales(retail);
      setGiftCards(gift);
      setPackages(pkg);
    } catch (err) {
      // Owner is making money decisions on these numbers — failing
      // silently means they trust the stale period's data. Toast
      // makes the failure explicit; the page still shows what's
      // currently in state, but the user knows it isn't fresh.
      console.error("Reports data fetch failed:", err);
      undo.error("Couldn't refresh reports — showing previous data");
    } finally {
      setLoading(false);
    }
  }, [getRange, teamFilter, undo]);

  // Skip the very first run because the server already seeded the
  // initial period's data. Subsequent preset / customFrom /
  // customTo / teamFilter changes still trigger a fetch — but
  // debounced 400 ms so rapid changes (native date picker firing
  // onChange during a pick, or the user editing both ends in quick
  // succession) collapse into a single request. The 7 report queries
  // are heavy; back-to-back cascades made the page feel sluggish
  // even though each individual request was fine.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const timer = setTimeout(() => loadData(), 400);
    return () => clearTimeout(timer);
  }, [loadData]);

  // ---- Delete appointment (used by the trash button in the appointments tab) ----
  async function handleDeleteAppointment(id: string) {
    if (!confirm("Delete this appointment? It will be removed from records and reports. This cannot be undone.")) return;
    const result = await deleteAppointment(id);
    if (result.error) {
      undo.error(result.error);
      return;
    }
    // Optimistic in-memory update so the row disappears immediately,
    // then reload to keep payments/expenses/reviews in sync.
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    loadData();
  }

  // ---- Computed stats ----

  // Services revenue (appointment payments) — EXCLUDING gift_card AND
  // package payments. Both are recognized at SALE time, not at
  // redemption. Their payment rows on redemption-day appointments are
  // just balance / sessions being applied against services we already
  // booked revenue for; counting them again here would double-book
  // the same money.
  const totalServicesRevenue = payments
    .filter((p) => p.method !== "gift_card" && p.method !== "package")
    .reduce((s, p) => s + p.amount, 0);
  // Retail revenue (migration-043) — sum of standalone sales in range.
  const totalRetailRevenue = retailSales.total;
  // Gift card + package revenue — total cash collected from selling
  // each in this window. Recognized at sale, not redemption. Voids
  // don't subtract (no refund movement in v1; salon keeps the cash).
  const totalGiftCardRevenue = giftCards.soldTotal;
  const totalPackageRevenue = packages.soldTotal;
  // Combined revenue for the headline number + profit math.
  const totalRevenue =
    totalServicesRevenue +
    totalRetailRevenue +
    totalGiftCardRevenue +
    totalPackageRevenue;
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const profit = totalRevenue - totalExpenses;

  const totalAppointments = appointments.length;
  const completedOrPaid = appointments.filter((a) => a.status === "paid" || a.status === "completed").length;
  const cancelledCount = appointments.filter((a) => a.status === "cancelled").length;

  const cashPayments = payments.filter((p) => p.method === "cash");
  const cardPayments = payments.filter((p) => p.method === "card");
  const giftCardPayments = payments.filter((p) => p.method === "gift_card");
  const packagePayments = payments.filter((p) => p.method === "package");
  const otherPayments = payments.filter((p) => p.method === "other");
  const cashTotal = cashPayments.reduce((s, p) => s + p.amount, 0);
  const cardTotal = cardPayments.reduce((s, p) => s + p.amount, 0);
  const giftCardPayTotal = giftCardPayments.reduce((s, p) => s + p.amount, 0);
  const packagePayTotal = packagePayments.reduce((s, p) => s + p.amount, 0);
  const otherPayTotal = otherPayments.reduce((s, p) => s + p.amount, 0);

  // Expense breakdown by type
  const expenseByType: Record<string, number> = {};
  expenses.forEach((e) => {
    expenseByType[e.expense_type] = (expenseByType[e.expense_type] || 0) + e.amount;
  });
  const expenseBreakdown = Object.entries(expenseByType)
    .sort((a, b) => b[1] - a[1]);

  // Revenue per appointment — includes transportation charge, applies
  // discount, and honors a manual total_override. Same logic as
  // getApptTotal in calendar-shared, just inlined here so reports-view
  // doesn't depend on the AppointmentData type (the report type has a
  // narrower shape).
  function getApptRevenue(appt: ReportAppointment) {
    if (appt.total_override != null) return Number(appt.total_override);
    // Bundle-aware subtotal: dedup by bundle_instance_id so two copies of
    // the same bundle each contribute their own bundle price (and a row
    // that's part of a bundle doesn't double up its individual service
    // price). Mirrors getApptSubtotal in calendar-shared.
    let subtotal = 0;
    const seenInstances = new Set<string>();
    for (const as of appt.appointment_services) {
      if (as.bundle_instance_id) {
        if (!seenInstances.has(as.bundle_instance_id)) {
          seenInstances.add(as.bundle_instance_id);
          subtotal += Number(as.bundle_total_price ?? 0);
        }
        continue;
      }
      subtotal += as.services?.price || 0;
    }
    const transport = Number(appt.transportation_charge ?? 0);
    const discountValue = Number(appt.discount_value ?? 0);
    let discount = 0;
    if (discountValue > 0) {
      discount = appt.discount_type === "percentage"
        ? Math.min(subtotal + transport, ((subtotal + transport) * discountValue) / 100)
        : Math.min(subtotal + transport, discountValue);
    }
    return Math.max(0, subtotal + transport - discount);
  }
  // Expected revenue excludes both cancelled and no-show appointments —
  // the client didn't pay (and won't, in a no-show, unless the salon has
  // a separate no-show fee policy outside of the appointment record).
  const expectedRevenue = appointments
    .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
    .reduce((s, a) => s + getApptRevenue(a), 0);

  // ---- Tab content ----

  const TABS: { key: TabKey; label: string }[] = [
    // Renamed from "Expenses" since the dashboard already has a top-level
    // Expenses page; this tab also shows Revenue/Profit alongside the
    // expenses list, so "Finance" is more accurate.
    { key: "expenses", label: "Finance" },
    { key: "payments", label: "Payments" },
    { key: "appointments", label: "Appointments" },
    { key: "reviews", label: "Reviews" },
  ];

  return (
    <div ref={exportRef} className="space-y-4 sm:space-y-6">
      {/* Print-only banner. Renders "Reports · <from> → <to>" at the
          top of the PDF so the printed page is self-describing. See
          the @media print block in globals.css for how it's shown. */}
      <div className="print-only mb-4 border-b border-neutral-300 pb-2 text-body-sm text-text-primary">
        <div className="font-semibold">Reports</div>
        {(() => {
          const { from, to } = getRange();
          return (
            <div className="text-text-secondary">
              {from} → {to}
              {" · Generated "}
              {new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
            </div>
          );
        })()}
      </div>

      {/* Header — title on the left, team selector + period filter on
          the right. Mirrors the expenses + calendar filter pattern. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-title-page font-bold tracking-tight text-text-primary">Reports</h1>

        <div className="flex items-center gap-1.5 shrink-0 print-hide">
          {/* Inline date range. Always visible — the funnel filter
              now only handles the preset step (today / week /
              month). Editing either input switches preset to
              'custom' so getRange() reads from these fields; when a
              preset is active the value shown here mirrors the
              preset's from/to so the user always sees the exact
              range in effect. */}
          {(() => {
            const { from, to } = getRange();
            return (
              <>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setPreset("custom");
                    setCustomFrom(e.target.value);
                    // Seed the other end on the first switch so
                    // getRange doesn't fall back to a preset range
                    // between the two edits.
                    if (!customTo) setCustomTo(to);
                  }}
                  aria-label="From date"
                  className="h-9 rounded-lg border-[1.5px] border-gray-200 bg-white px-2 text-body-sm text-text-primary focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <span className="text-caption text-text-tertiary">to</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setPreset("custom");
                    setCustomTo(e.target.value);
                    if (!customFrom) setCustomFrom(from);
                  }}
                  aria-label="To date"
                  className="h-9 rounded-lg border-[1.5px] border-gray-200 bg-white px-2 text-body-sm text-text-primary focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </>
            );
          })()}
          {/* Team selector (Multi-Team v1.7) — only when the salon
              has 2+ teams. Refetches all data on change. Expenses
              ignore the filter (they're salon-wide business costs,
              not staff-tied). */}
          {teams.length >= 2 && (
            <select
              value={teamFilter ?? ""}
              onChange={(e) => setTeamFilter(e.target.value || null)}
              className={`h-9 rounded-full px-3 text-body-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary-100 ${
                teamFilter
                  ? "bg-neutral-900 text-text-inverse border border-neutral-900"
                  : "bg-white text-text-primary border border-neutral-200 hover:border-neutral-400"
              }`}
              aria-label="Filter reports by team"
            >
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
          </button>

          {filterOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5">
              <p className="px-3 pt-2 pb-1 text-caption font-semibold uppercase tracking-wide text-text-tertiary">
                Period
              </p>
              {PICKABLE_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => { setPreset(p); setFilterOpen(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-body-sm hover:bg-surface-hover ${
                    preset === p ? "text-text-primary font-semibold" : "text-text-secondary"
                  }`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                    preset === p ? "border-gray-900 bg-neutral-900" : "border-neutral-200"
                  }`}>
                    {preset === p && (
                      <svg className="h-3 w-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </span>
                  {PRESET_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Export PDF — rasterizes the report with html2canvas and
            wraps it in a jsPDF file that downloads directly. During
            capture body.exporting hides the sidebar / filters / this
            button itself and reveals the .print-only banner at the
            top (see globals.css). Disabled + spinner while running. */}
        <button
          type="button"
          onClick={handleExportPDF}
          disabled={exporting}
          aria-label="Export PDF"
          title="Export PDF"
          className="rounded-lg p-2 text-text-tertiary hover:bg-surface-hover hover:text-text-secondary disabled:opacity-50 disabled:cursor-wait"
        >
          {exporting ? (
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v10" />
            </svg>
          )}
        </button>
        </div>
      </div>

      {/* Detail tabs — 2x2 grid on mobile, 4-up on desktop. Each tab is
          self-contained: it owns its own counts/totals/summary. The
          page header above is intentionally bare (just title + filter)
          so the user lands somewhere quiet and drills in.

          Sticky on scroll so the user can switch tabs from anywhere
          in a long list without scrolling back up. The negative
          horizontal margins + matching padding extend the bg to the
          page edges so content scrolling underneath doesn't show in
          the dashboard's content gutter. */}
      <div className="sticky top-0 z-20 -mx-4 bg-[#F5F5F7] px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-3 py-3 text-body-sm font-semibold transition-colors ${
                tab === t.key
                  ? "bg-neutral-900 text-text-inverse"
                  : "bg-surface-active text-text-secondary hover:bg-neutral-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-16 text-center text-body-sm text-text-tertiary">Loading reports...</p>
      ) : (
        <>
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
                          <th className="px-3 py-3 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {appointments.map((appt) => {
                          const total = getApptRevenue(appt);
                          const serviceNames = appt.appointment_services
                            .map((as2) => as2.services?.name || "Unknown")
                            .join(", ");
                          return (
                            <tr key={appt.id} className="group hover:bg-surface-hover">
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
                              <td className="px-3 py-3 text-right">
                                <button
                                  onClick={() => handleDeleteAppointment(appt.id)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                                  title="Delete appointment (removes from records)"
                                  aria-label="Delete appointment"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
                                </button>
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
                        <div key={appt.id} className="flex items-start gap-2 px-4 py-3">
                          <div className="min-w-0 flex-1">
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
                          <button
                            onClick={() => handleDeleteAppointment(appt.id)}
                            className="-mr-1 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary hover:bg-red-50 hover:text-red-600"
                            title="Delete appointment"
                            aria-label="Delete appointment"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
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
                              <tr
                                key={pay.id}
                                onClick={() => openEditPayment(pay)}
                                className="cursor-pointer hover:bg-surface-hover"
                              >
                                <td className="whitespace-nowrap px-5 py-3 text-text-primary">{date}</td>
                                <td className="px-5 py-3 font-normal text-text-primary">{clientName}</td>
                                <td className="px-5 py-3">
                                  <div className="inline-flex items-center gap-2">
                                    <span className={`inline-block rounded-full px-2 py-0.5 text-caption font-medium ${
                                      pay.method === "cash"
                                        ? "bg-green-50 text-green-700"
                                        : pay.method === "card"
                                          ? "bg-blue-50 text-blue-700"
                                          : pay.method === "gift_card"
                                            ? "bg-[#F4F0FF] text-[#5B36CC]"
                                            : pay.method === "package"
                                              ? "bg-[#EAF6FF] text-[#0A5BA8]"
                                              : "bg-[#FFF8F0] text-[#CC7700]"
                                    }`}>
                                      {pay.method === "cash"
                                        ? "Cash"
                                        : pay.method === "card"
                                          ? "Card"
                                          : pay.method === "gift_card"
                                            ? "Gift card"
                                            : pay.method === "package"
                                              ? "Package"
                                              : "Other"}
                                    </span>
                                    {(() => {
                                      const urls = attachmentsFor(pay);
                                      if (urls.length === 0) return null;
                                      return (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); openReceiptPreview(pay); }}
                                          aria-label={`View ${urls.length} receipt${urls.length > 1 ? "s" : ""}`}
                                          className="flex h-7 items-center justify-center gap-0.5 rounded-lg px-1.5 text-text-tertiary transition-colors hover:bg-surface-active hover:text-text-primary"
                                        >
                                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                                          </svg>
                                          {urls.length > 1 && (
                                            <span className="text-caption font-semibold tabular-nums">{urls.length}</span>
                                          )}
                                        </button>
                                      );
                                    })()}
                                  </div>
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
                          <div
                            key={pay.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openEditPayment(pay)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openEditPayment(pay);
                              }
                            }}
                            className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-surface-hover"
                          >
                            <div>
                              <p className="text-body-sm font-normal text-text-primary">{clientName}</p>
                              <p className="text-caption text-text-tertiary">{date}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <p className="text-body-sm font-semibold text-text-primary">{formatCurrency(pay.amount)}</p>
                                <span className={`inline-block rounded-full px-2 py-0.5 text-caption font-medium ${
                                  pay.method === "cash"
                                    ? "bg-green-50 text-green-700"
                                    : pay.method === "card"
                                      ? "bg-blue-50 text-blue-700"
                                      : pay.method === "gift_card"
                                        ? "bg-[#F4F0FF] text-[#5B36CC]"
                                        : pay.method === "package"
                                          ? "bg-[#EAF6FF] text-[#0A5BA8]"
                                          : "bg-[#FFF8F0] text-[#CC7700]"
                                }`}>
                                  {pay.method === "cash"
                                    ? "Cash"
                                    : pay.method === "card"
                                      ? "Card"
                                      : pay.method === "gift_card"
                                        ? "Gift card"
                                        : pay.method === "package"
                                          ? "Package"
                                          : "Other"}
                                </span>
                              </div>
                              {(() => {
                                const urls = attachmentsFor(pay);
                                if (urls.length === 0) return null;
                                return (
                                <button
                                  onClick={(e) => { e.stopPropagation(); openReceiptPreview(pay); }}
                                  aria-label={`View ${urls.length} receipt${urls.length > 1 ? "s" : ""}`}
                                  className="flex h-8 shrink-0 items-center justify-center gap-0.5 rounded-lg px-1.5 text-text-tertiary hover:bg-surface-active hover:text-text-primary"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                                  </svg>
                                  {urls.length > 1 && (
                                    <span className="text-caption font-semibold tabular-nums">{urls.length}</span>
                                  )}
                                </button>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Footer totals — per-method breakdown. Gift card
                        and Other rows only render when they have data,
                        so single-method salons stay clean. */}
                    <div className="border-t border-border px-5 py-3 text-body-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-text-secondary">Cash</span>
                        <span className="font-semibold text-text-primary">{formatCurrency(cashTotal)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-text-secondary">Card</span>
                        <span className="font-semibold text-text-primary">{formatCurrency(cardTotal)}</span>
                      </div>
                      {giftCardPayTotal > 0 && (
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-text-secondary">
                            Gift card{" "}
                            <span className="text-text-tertiary text-caption font-normal">
                              (balance applied)
                            </span>
                          </span>
                          <span className="font-semibold text-text-primary">{formatCurrency(giftCardPayTotal)}</span>
                        </div>
                      )}
                      {packagePayTotal > 0 && (
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-text-secondary">
                            Package{" "}
                            <span className="text-text-tertiary text-caption font-normal">
                              (sessions applied)
                            </span>
                          </span>
                          <span className="font-semibold text-text-primary">{formatCurrency(packagePayTotal)}</span>
                        </div>
                      )}
                      {otherPayTotal > 0 && (
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-text-secondary">Other</span>
                          <span className="font-semibold text-text-primary">{formatCurrency(otherPayTotal)}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ===== EXPENSES (Finance) TAB =====
               Top: Revenue / Expenses / Profit — the same KPIs that
               used to live on the page header, presented as a quiet
               three-line list. Below that: the expenses list with a
               total footer. */}
          {tab === "expenses" && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white ring-1 ring-border px-5 py-4">
                <p className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">Summary</p>
                <div className="mt-2 divide-y divide-border">
                  <div className="py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm text-text-secondary">Revenue</span>
                      <span className="text-body-sm font-semibold text-green-700">{formatCurrency(totalRevenue)}</span>
                    </div>
                    {/* Breakdown: Services vs Sales. "Sales" is the
                        combined non-service revenue — retail sales +
                        gift card sales + package sales. Only shown
                        when there's any non-service revenue in the
                        window, so an appointments-only salon stays
                        clean. */}
                    {(retailSales.count > 0 ||
                      totalGiftCardRevenue > 0 ||
                      totalPackageRevenue > 0) && (
                      <div className="mt-1.5 space-y-1">
                        <div className="flex items-center justify-between pl-3">
                          <span className="text-caption text-text-tertiary">Services</span>
                          <span className="text-caption tabular-nums text-text-tertiary">{formatCurrency(totalServicesRevenue)}</span>
                        </div>
                        <div className="flex items-center justify-between pl-3">
                          <span className="text-caption text-text-tertiary">Sales</span>
                          <span className="text-caption tabular-nums text-text-tertiary">
                            {formatCurrency(
                              totalRetailRevenue +
                                totalGiftCardRevenue +
                                totalPackageRevenue,
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-body-sm text-text-secondary">Expenses</span>
                    <span className="text-body-sm font-semibold text-red-600">{formatCurrency(totalExpenses)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-body-sm font-semibold text-text-primary">Profit</span>
                    <span className={`text-body-sm font-bold ${profit >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {formatCurrency(profit)}
                    </span>
                  </div>
                </div>
              </div>

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

      {/* Receipt-image lightbox — opened by tapping a paperclip cell on
          an appointments-tab row. Backdrop or close button dismisses. */}
      {previewUrls && previewUrls.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewUrls(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewUrls(null)}
              aria-label="Close"
              className="absolute -top-3 -right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-text-primary shadow-lg hover:bg-neutral-100"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrls[Math.min(previewIdx, previewUrls.length - 1)]}
              alt={`Receipt ${previewIdx + 1}`}
              className="max-h-[90vh] max-w-[90vw] rounded-lg"
            />
            {previewUrls.length > 1 && (
              <>
                <button
                  onClick={() => setPreviewIdx((i) => (i - 1 + previewUrls.length) % previewUrls.length)}
                  aria-label="Previous receipt"
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-text-primary shadow-lg hover:bg-white"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <button
                  onClick={() => setPreviewIdx((i) => (i + 1) % previewUrls.length)}
                  aria-label="Next receipt"
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-text-primary shadow-lg hover:bg-white"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-caption font-semibold text-white">
                  {previewIdx + 1} / {previewUrls.length}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit-payment modal — opened by clicking a payment row. */}
      <MarkPaidModal
        open={editingPayment !== null}
        clientName={editingPaymentClient}
        existingPayment={editingPayment}
        onClose={() => setEditingPayment(null)}
        onPaid={() => {
          setEditingPayment(null);
          loadData();
        }}
      />
    </div>
  );
}
