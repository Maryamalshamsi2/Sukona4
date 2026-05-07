import ReportsView, {
  type ReportAppointment,
  type ReportPayment,
  type ReportExpense,
  type ReportReview,
} from "./reports-view";
import {
  getReportAppointments,
  getReportPayments,
  getReportExpenses,
  getReportReviews,
} from "./actions";

function toISODate(d: Date) {
  // Local-tz YYYY-MM-DD; see (dashboard)/page.tsx for the rationale.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function ReportsPage() {
  // Default tab is "30days" — match that on the server so the initial render
  // shows the same period as the client's default preset.
  const now = new Date();
  const today = toISODate(now);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 29);
  const from = toISODate(fromDate);
  const to = today;

  const [appts, pays, exps, revs] = await Promise.all([
    getReportAppointments(from, to),
    getReportPayments(from, to),
    getReportExpenses(from, to),
    getReportReviews(from, to),
  ]);

  return (
    <ReportsView
      initialAppointments={(appts || []) as unknown as ReportAppointment[]}
      initialPayments={(pays || []) as unknown as ReportPayment[]}
      initialExpenses={(exps || []) as unknown as ReportExpense[]}
      initialReviews={(revs || []) as unknown as ReportReview[]}
    />
  );
}
