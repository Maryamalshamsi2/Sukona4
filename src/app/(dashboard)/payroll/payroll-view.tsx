"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/modal";
import { useCurrency } from "@/lib/user-context";
import { formatCurrency } from "@/lib/currency";
import {
  getPayrollSummary,
  getStaffPayrollDetail,
  addStaffAdjustment,
  updateStaffAdjustment,
  deleteStaffAdjustment,
  updateStaffPay,
  type PayrollStaffRow,
  type PayrollDetail,
  type PayrollAdjustmentLine,
} from "./actions";

/**
 * /payroll — owner-only monthly salary summary.
 *
 * Layout
 *   Title row · Month picker · "+ Bonus / − Deduction" buttons
 *   ────────────────────────────────────────────────────────────
 *   Staff summary table (one row per member)
 *     Click → drawer: full breakdown + service list + tip list + adjustments
 *
 * The drawer doubles as "the thing you screenshot and send the staff
 * member at the end of the month" — it shows every line that adds
 * up to the net.
 */

type Props = {
  initialMonth: string; // "YYYY-MM"
  initialRows: PayrollStaffRow[];
  initialError: string | null;
  /** All team_groups in the salon. Empty / 1 → team selector hidden.
   *  Multi-Team v1.7 — owner can drill into a single team's payroll. */
  initialTeams: { id: string; name: string }[];
};

export default function PayrollView({
  initialMonth,
  initialRows,
  initialError,
  initialTeams,
}: Props) {
  const currency = useCurrency();

  const [month, setMonth] = useState(initialMonth);
  const [rows, setRows] = useState<PayrollStaffRow[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  // Team filter (v1.7). null = "All teams" (default). When set, the
  // summary scopes to staff in that team only; the drill-down drawer
  // is unaffected (you've already picked one staff member by then).
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [teams] = useState(initialTeams);

  // Drill-down drawer
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayrollDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Adjustment modal — dual purpose:
  //   - editingAdjustment === null  → "Add bonus / deduction" mode
  //   - editingAdjustment === <row> → "Edit" mode, pre-filled
  // Setting either opens the modal; closing nulls both.
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [editingAdjustment, setEditingAdjustment] =
    useState<PayrollAdjustmentLine | null>(null);

  // Edit pay (base salary + commission %) modal — re-uses Modal,
  // pre-fills from the currently open detail.
  const [editPayOpen, setEditPayOpen] = useState(false);

  // Refetch the summary table when the month OR team filter changes.
  async function refreshSummary(forMonth: string, forTeam: string | null) {
    setLoading(true);
    setError(null);
    const res = await getPayrollSummary(forMonth, forTeam);
    if (res.error) setError(res.error);
    setRows(res.rows);
    setLoading(false);
  }

  // Skip the first render — the server already seeded `initialRows`
  // for (initialMonth, no team filter). Any subsequent month or team
  // change re-fetches.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    void refreshSummary(month, teamFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, teamFilter]);

  // Open the detail drawer — fetches per-staff breakdown.
  async function openDetail(staffId: string) {
    setOpenStaffId(staffId);
    setDetail(null);
    setDetailLoading(true);
    const res = await getStaffPayrollDetail(staffId, month);
    if (res.error) setError(res.error);
    setDetail(res.detail);
    setDetailLoading(false);
  }

  function closeDetail() {
    setOpenStaffId(null);
    setDetail(null);
  }

  async function refreshDetailAndSummary() {
    if (openStaffId) {
      const [s, d] = await Promise.all([
        getPayrollSummary(month, teamFilter),
        getStaffPayrollDetail(openStaffId, month),
      ]);
      setRows(s.rows);
      setDetail(d.detail);
    } else {
      await refreshSummary(month, teamFilter);
    }
  }

  // Totals row for the table footer — quick sanity check for the owner.
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        servicesRevenue: acc.servicesRevenue + r.servicesRevenue,
        commission: acc.commission + r.commission,
        tips: acc.tips + r.tips,
        bonuses: acc.bonuses + r.bonuses,
        deductions: acc.deductions + r.deductions,
        net: acc.net + r.net,
      }),
      {
        servicesRevenue: 0,
        commission: 0,
        tips: 0,
        bonuses: 0,
        deductions: 0,
        net: 0,
      },
    );
  }, [rows]);

  return (
    <div>
      {/* ---- Title row ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title-page font-semibold tracking-tight text-text-primary">
            Payroll
          </h1>
          <p className="mt-1 text-body-sm text-text-secondary">
            Monthly salary breakdown for each member of your team.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Team selector (v1.7) — owner-only page, so we don't bother
              with the admin-scoped-hide logic. Only renders when the
              salon has 2+ teams. */}
          {teams.length >= 2 && (
            <select
              value={teamFilter ?? ""}
              onChange={(e) => setTeamFilter(e.target.value || null)}
              className={`h-9 rounded-full px-3 text-body-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary-100 ${
                teamFilter
                  ? "bg-neutral-900 text-text-inverse border border-neutral-900"
                  : "bg-white text-text-primary border border-neutral-200 hover:border-neutral-400"
              }`}
              aria-label="Filter payroll by team"
            >
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-full border-[1.5px] border-neutral-200 bg-white px-4 text-body-sm font-medium text-text-primary focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-body-sm text-error-700">
          {error}
        </div>
      )}

      {/* ---- Summary table — desktop ---- */}
      <div className="mt-6 hidden overflow-hidden rounded-2xl ring-1 ring-border bg-white sm:block">
        <table className="w-full text-body-sm">
          <thead className="bg-surface-active text-text-secondary">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Staff</th>
              <th className="px-4 py-3 text-right font-medium">Revenue</th>
              <th className="px-4 py-3 text-right font-medium">Commission</th>
              <th className="px-4 py-3 text-right font-medium">Tips</th>
              <th className="px-4 py-3 text-right font-medium">Bonus</th>
              <th className="px-4 py-3 text-right font-medium">Deduct.</th>
              <th className="px-4 py-3 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-tertiary">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-tertiary">
                  No team members yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.staffId}
                  onClick={() => openDetail(r.staffId)}
                  className="cursor-pointer hover:bg-surface-hover"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-primary">{r.fullName}</div>
                    <div className="text-caption text-text-tertiary capitalize">
                      {r.role}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                    {formatCurrency(r.servicesRevenue, currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                    {formatCurrency(r.commission, currency)}
                    {r.commissionPercent > 0 && (
                      <span
                        className="ml-1 text-caption text-text-tertiary"
                        title={
                          r.targetMultiplier > 0
                            ? `${r.commissionPercent}% × (revenue − target ${formatCurrency(r.target, currency)})`
                            : `${r.commissionPercent}% × revenue`
                        }
                      >
                        ({r.commissionPercent}%
                        {r.targetMultiplier > 0 && (
                          <>, {r.targetMultiplier}×</>
                        )}
                        )
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                    {formatCurrency(r.tips, currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                    {r.bonuses > 0 ? formatCurrency(r.bonuses, currency) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-error-700">
                    {r.deductions > 0 ? `−${formatCurrency(r.deductions, currency)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-text-primary">
                    {formatCurrency(r.net, currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-surface-active text-text-secondary">
              <tr>
                <td className="px-4 py-3 font-semibold text-text-primary">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(totals.servicesRevenue, currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(totals.commission, currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(totals.tips, currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(totals.bonuses, currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  −{formatCurrency(totals.deductions, currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-text-primary">
                  {formatCurrency(totals.net, currency)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ---- Summary cards — mobile ---- */}
      <div className="mt-6 space-y-3 sm:hidden">
        {loading && rows.length === 0 ? (
          <p className="text-center text-body-sm text-text-tertiary">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-body-sm text-text-tertiary">
            No team members yet.
          </p>
        ) : (
          rows.map((r) => (
            <button
              key={r.staffId}
              type="button"
              onClick={() => openDetail(r.staffId)}
              className="block w-full rounded-2xl bg-white p-4 text-left ring-1 ring-border active:scale-[0.98] transition"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-text-primary">
                    {r.fullName}
                  </div>
                  <div className="text-caption text-text-tertiary capitalize">
                    {r.role}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-title-section font-semibold tabular-nums text-text-primary">
                    {formatCurrency(r.net, currency)}
                  </div>
                  <div className="text-caption text-text-tertiary">net</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-caption">
                <Mini
                  label="Revenue"
                  value={formatCurrency(r.servicesRevenue, currency)}
                />
                <Mini label="Tips" value={formatCurrency(r.tips, currency)} />
                <Mini
                  label="Bonus/Ded."
                  value={
                    r.bonuses + r.deductions === 0
                      ? "—"
                      : `${r.bonuses > 0 ? "+" : ""}${formatCurrency(r.bonuses - r.deductions, currency)}`
                  }
                />
              </div>
            </button>
          ))
        )}
      </div>

      {/* ---- Detail drawer ---- */}
      <Modal
        open={openStaffId !== null}
        onClose={closeDetail}
        title={detail ? detail.fullName : "Loading…"}
      >
        {detailLoading || !detail ? (
          <p className="text-body-sm text-text-tertiary">Loading breakdown…</p>
        ) : (
          <div className="space-y-6">
            {/* Period label */}
            <p className="text-body-sm text-text-secondary">
              {monthLabel(detail.month)} ·{" "}
              <span className="capitalize text-text-tertiary">{detail.role}</span>
            </p>

            {/* Net summary card */}
            <div className="rounded-2xl bg-neutral-900 p-5 text-text-inverse">
              <p className="text-caption uppercase tracking-wide opacity-70">
                Net payable
              </p>
              <p className="mt-1 text-title-page font-semibold tabular-nums">
                {formatCurrency(detail.totals.net, currency)}
              </p>
            </div>

            {/* Commission breakdown (only when a target is set —
                migration-039). Shows the staff member exactly how
                the commission was calculated. When target_multiplier=0
                we hide this whole card and the Commission row in the
                main breakdown reverts to "% of total revenue" wording. */}
            {detail.targetMultiplier > 0 && (
              <div className="rounded-2xl ring-1 ring-border bg-white">
                <div className="border-b border-border px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-text-tertiary">
                  Commission calculation
                </div>
                <BreakdownRow
                  label="Services revenue"
                  value={formatCurrency(detail.totals.servicesRevenue, currency)}
                />
                <BreakdownRow
                  label={`Target (${detail.targetMultiplier}× salary)`}
                  value={`−${formatCurrency(detail.target, currency)}`}
                />
                <BreakdownRow
                  label="Revenue above target"
                  value={formatCurrency(detail.totals.revenueAboveTarget, currency)}
                />
                <BreakdownRow
                  label={`Commission (${detail.commissionPercent}%)`}
                  value={formatCurrency(detail.totals.commission, currency)}
                  positive
                />
              </div>
            )}

            {/* Main breakdown grid */}
            <div className="rounded-2xl ring-1 ring-border bg-white">
              <BreakdownRow
                label="Base salary"
                value={formatCurrency(detail.baseSalary, currency)}
              />
              <BreakdownRow
                label={
                  detail.targetMultiplier > 0
                    ? `Commission (${detail.commissionPercent}% above target)`
                    : `Commission (${detail.commissionPercent}% of revenue)`
                }
                value={formatCurrency(detail.totals.commission, currency)}
              />
              <BreakdownRow
                label="Tips received"
                value={formatCurrency(detail.totals.tips, currency)}
              />
              {/* Bonuses & deductions are itemised inline — one row per
                  adjustment, labelled with its title — so the salary
                  summary clearly shows what each amount is for. When
                  there are none, fall back to a single "AED 0" row so
                  the totals card stays structurally consistent. */}
              {detail.adjustments.filter((a) => a.type === "bonus").length === 0 ? (
                <BreakdownRow
                  label="Bonuses"
                  value={formatCurrency(0, currency)}
                  positive
                />
              ) : (
                detail.adjustments
                  .filter((a) => a.type === "bonus")
                  .map((a) => (
                    <BreakdownRow
                      key={a.id}
                      label={a.reason}
                      value={`+${formatCurrency(a.amount, currency)}`}
                      positive
                    />
                  ))
              )}
              {detail.adjustments.filter((a) => a.type === "deduction").length === 0 ? (
                <BreakdownRow
                  label="Deductions"
                  value={formatCurrency(0, currency)}
                  negative
                />
              ) : (
                detail.adjustments
                  .filter((a) => a.type === "deduction")
                  .map((a) => (
                    <BreakdownRow
                      key={a.id}
                      label={a.reason}
                      value={`−${formatCurrency(a.amount, currency)}`}
                      negative
                    />
                  ))
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingAdjustment(null); // ensure add-mode, not stale edit
                  setAdjustmentModalOpen(true);
                }}
                className="rounded-xl border-[1.5px] border-neutral-200 bg-white px-4 py-2 text-body-sm font-semibold text-text-primary hover:border-neutral-400"
              >
                + Bonus / − Deduction
              </button>
              <button
                type="button"
                onClick={() => setEditPayOpen(true)}
                className="rounded-xl border-[1.5px] border-neutral-200 bg-white px-4 py-2 text-body-sm font-semibold text-text-primary hover:border-neutral-400"
              >
                Edit pay
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border-[1.5px] border-neutral-200 bg-white px-4 py-2 text-body-sm font-semibold text-text-primary hover:border-neutral-400"
              >
                Print / Save PDF
              </button>
            </div>

            {/* Order: Bonuses & deductions → Tips → Services performed.
                The owner-actionable bits (adjustments) come first since
                that's what's most likely to be edited mid-conversation
                with the staff. Tips next (smallest list). Services last
                because it's the longest list and the staff already
                "knows" what they did. */}

            {/* Adjustments list */}
            <DetailList
              title={`Bonuses & deductions (${detail.adjustments.length})`}
              emptyLabel="No bonuses or deductions in this month."
            >
              {detail.adjustments.map((a) => (
                <AdjustmentRow
                  key={a.id}
                  adjustment={a}
                  currency={currency}
                  onEdit={() => {
                    setEditingAdjustment(a);
                    setAdjustmentModalOpen(true);
                  }}
                  onDeleted={refreshDetailAndSummary}
                />
              ))}
            </DetailList>

            {/* Tips list */}
            <DetailList
              title={`Tips (${detail.tips.length})`}
              emptyLabel="No tips received in this month."
            >
              {detail.tips.map((t, idx) => (
                <div
                  key={`${t.appointmentId}-${idx}-${t.split ? "split" : "exp"}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-body-sm text-text-primary">
                      {formatDate(t.date)}
                      {t.split && (
                        <span className="ml-2 text-caption text-text-tertiary">
                          (split share)
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-body-sm tabular-nums text-emerald-700">
                    +{formatCurrency(t.amount, currency)}
                  </p>
                </div>
              ))}
            </DetailList>

            {/* Services list. Bundle rows show the bundle name as a
                small caption so the staff understands why the price
                isn't the catalog price (it's their share of the
                bundle's discounted total). */}
            <DetailList
              title={`Services performed (${detail.services.length})`}
              emptyLabel="No paid services in this month."
            >
              {detail.services.map((s, idx) => (
                <div
                  key={`${s.appointmentId}-${idx}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body-sm text-text-primary">
                      {s.serviceName}
                    </p>
                    <p className="text-caption text-text-tertiary">
                      {formatDate(s.date)}
                      {s.bundleName && (
                        <span className="ml-1">· from {s.bundleName}</span>
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-body-sm tabular-nums text-text-secondary">
                    {formatCurrency(s.price, currency)}
                  </p>
                </div>
              ))}
            </DetailList>
          </div>
        )}
      </Modal>

      {/* ---- Adjustment modal (add OR edit) ---- */}
      <AdjustmentModal
        open={adjustmentModalOpen}
        staff={detail ? { id: detail.staffId, name: detail.fullName } : null}
        editing={editingAdjustment}
        onClose={() => {
          setAdjustmentModalOpen(false);
          setEditingAdjustment(null);
        }}
        onSaved={() => {
          setAdjustmentModalOpen(false);
          setEditingAdjustment(null);
          void refreshDetailAndSummary();
        }}
      />

      {/* ---- Edit pay modal ---- */}
      <EditPayModal
        open={editPayOpen}
        staff={detail}
        currency={currency}
        onClose={() => setEditPayOpen(false)}
        onSaved={() => {
          setEditPayOpen(false);
          void refreshDetailAndSummary();
        }}
      />
    </div>
  );
}

// ---------- Small presentational helpers ----------

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-active px-2 py-1.5">
      <div className="text-caption text-text-tertiary">{label}</div>
      <div className="font-medium tabular-nums text-text-primary">{value}</div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span className="text-body-sm text-text-secondary">{label}</span>
      <span
        className={`text-body-sm tabular-nums font-medium ${
          positive
            ? "text-emerald-700"
            : negative
              ? "text-error-700"
              : "text-text-primary"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function DetailList({
  title,
  emptyLabel,
  children,
}: {
  title: string;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const isEmpty = items.length === 0;
  return (
    <div>
      <h3 className="text-body-sm font-semibold text-text-primary">{title}</h3>
      <div className="mt-2 rounded-2xl ring-1 ring-border bg-white px-4">
        {isEmpty ? (
          <p className="py-3 text-caption text-text-tertiary">{emptyLabel}</p>
        ) : (
          <div className="divide-y divide-border">{children}</div>
        )}
      </div>
    </div>
  );
}

function AdjustmentRow({
  adjustment,
  currency,
  onEdit,
  onDeleted,
}: {
  adjustment: PayrollAdjustmentLine;
  currency: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    if (!confirm(`Delete this ${adjustment.type}?`)) return;
    setDeleting(true);
    await deleteStaffAdjustment(adjustment.id);
    setDeleting(false);
    onDeleted();
  }
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-body-sm text-text-primary">{adjustment.reason}</p>
        <p className="text-caption text-text-tertiary">
          {formatDate(adjustment.adjustmentDate)} · {adjustment.type}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`text-body-sm tabular-nums font-medium ${
            adjustment.type === "bonus" ? "text-emerald-700" : "text-error-700"
          }`}
        >
          {adjustment.type === "bonus" ? "+" : "−"}
          {formatCurrency(adjustment.amount, currency)}
        </span>
        {/* Edit (pencil) — opens the same modal in edit mode, pre-filled. */}
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-1 text-text-tertiary hover:bg-surface-active hover:text-text-primary"
          aria-label="Edit adjustment"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
        </button>
        {/* Delete (trash) */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-md p-1 text-text-tertiary hover:bg-surface-active hover:text-error-700 disabled:opacity-50"
          aria-label="Delete adjustment"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---------- Adjustment modal ----------

function AdjustmentModal({
  open,
  staff,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  staff: { id: string; name: string } | null;
  /** When non-null, the modal is in edit mode: pre-fills from this
   *  row and calls updateStaffAdjustment on submit. Null = add mode. */
  editing: PayrollAdjustmentLine | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const currency = useCurrency();
  const isEdit = !!editing;
  const [type, setType] = useState<"bonus" | "deduction">("bonus");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayISO);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync state whenever the modal (re)opens. Order matters: when
  // switching between rows (edit one, close, open another) we want
  // the new row's values, not stale state from the previous edit.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amount));
      setReason(editing.reason);
      setDate(editing.adjustmentDate);
    } else {
      setType("bonus");
      setAmount("");
      setReason("");
      setDate(todayISO());
    }
    setError(null);
  }, [open, editing]);

  if (!staff) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staff) return;
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) {
      setError("Enter a positive amount");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = editing
      ? await updateStaffAdjustment(editing.id, type, amt, reason, date)
      : await addStaffAdjustment(staff.id, type, amt, reason, date);
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${isEdit ? "Edit" : "Add"} adjustment · ${staff.name}`}
      variant="center"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-body-sm font-semibold text-text-primary">
            Type *
          </label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {(["bonus", "deduction"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-xl border-[1.5px] px-3 py-2.5 text-body-sm font-semibold capitalize transition ${
                  type === t
                    ? t === "bonus"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                      : "border-red-600 bg-red-50 text-error-700"
                    : "border-neutral-200 bg-white text-text-primary hover:border-neutral-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="adj-amount" className="block text-body-sm font-semibold text-text-primary">
            Amount ({currency}) *
          </label>
          <input
            id="adj-amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 sm:py-2.5 transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>

        <div>
          <label htmlFor="adj-date" className="block text-body-sm font-semibold text-text-primary">
            Date *
          </label>
          <input
            id="adj-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 sm:py-2.5 transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>

        <div>
          <label htmlFor="adj-reason" className="block text-body-sm font-semibold text-text-primary">
            Title *
          </label>
          {/* Single-line input — short label like "Overtime" or
              "Customer praise". Stored in the same `reason` column
              so no DB migration is needed; we just relabel the UI. */}
          <input
            id="adj-reason"
            type="text"
            required
            maxLength={80}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              type === "bonus"
                ? "e.g. Overtime, Customer praise"
                : "e.g. Late arrivals, Missed shift"
            }
            className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 sm:py-2.5 transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <p className="mt-1 text-caption text-text-tertiary">
            This shows on the staff&rsquo;s monthly summary.
          </p>
        </div>

        {error && <p className="text-body-sm text-error-700">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl bg-surface-active px-4 py-2.5 text-body-sm font-semibold text-text-primary hover:bg-neutral-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-neutral-900 px-4 py-2.5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Edit pay modal ----------

function EditPayModal({
  open,
  staff,
  currency,
  onClose,
  onSaved,
}: {
  open: boolean;
  staff: PayrollDetail | null;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [baseSalary, setBaseSalary] = useState("");
  const [commission, setCommission] = useState("");
  const [targetMultiplier, setTargetMultiplier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && staff) {
      setBaseSalary(String(staff.baseSalary));
      setCommission(String(staff.commissionPercent));
      setTargetMultiplier(String(staff.targetMultiplier));
      setError(null);
    }
  }, [open, staff]);

  if (!staff) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staff) return;
    setSubmitting(true);
    setError(null);
    const res = await updateStaffPay(
      staff.staffId,
      parseFloat(baseSalary) || 0,
      parseFloat(commission) || 0,
      parseFloat(targetMultiplier) || 0,
    );
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onSaved();
  }

  // Live preview of the target so the owner sees what their multiplier
  // resolves to before saving. Recomputed on every keystroke from the
  // values currently in the form (not the saved staff record).
  const previewBase = parseFloat(baseSalary) || 0;
  const previewMul = parseFloat(targetMultiplier) || 0;
  const previewTarget = previewBase * previewMul;

  return (
    <Modal open={open} onClose={onClose} title={`Edit pay · ${staff.fullName}`} variant="center">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-body-sm text-text-secondary">
          Changes apply to next month&rsquo;s summary onwards. Past months
          recalculate too, since commission is derived from the current
          values, not snapshotted.
        </p>

        <div>
          <label htmlFor="pay-base" className="block text-body-sm font-semibold text-text-primary">
            Base monthly salary ({currency})
          </label>
          <input
            id="pay-base"
            type="number"
            step="0.01"
            min="0"
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 sm:py-2.5 transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <p className="mt-1 text-caption text-text-tertiary">
            Leave 0 for commission-only staff.
          </p>
        </div>

        <div>
          <label htmlFor="pay-target" className="block text-body-sm font-semibold text-text-primary">
            Target (× salary)
          </label>
          <input
            id="pay-target"
            type="number"
            step="0.01"
            min="0"
            max="50"
            value={targetMultiplier}
            onChange={(e) => setTargetMultiplier(e.target.value)}
            placeholder="0"
            className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 sm:py-2.5 transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <p className="mt-1 text-caption text-text-tertiary">
            {previewMul > 0
              ? `Monthly target: ${formatCurrency(previewTarget, currency)}. Commission applies only to revenue above this.`
              : "Leave 0 to apply commission to all revenue (no target threshold)."}
          </p>
        </div>

        <div>
          <label htmlFor="pay-commission" className="block text-body-sm font-semibold text-text-primary">
            Commission (%)
          </label>
          <input
            id="pay-commission"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 sm:py-2.5 transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <p className="mt-1 text-caption text-text-tertiary">
            {previewMul > 0
              ? `E.g. 10 = 10% of every dirham above the ${formatCurrency(previewTarget, currency)} target.`
              : `E.g. 30 = 30% of every dirham of services revenue.`}
          </p>
        </div>

        {error && <p className="text-body-sm text-error-700">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl bg-surface-active px-4 py-2.5 text-body-sm font-semibold text-text-primary hover:bg-neutral-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-neutral-900 px-4 py-2.5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Date helpers ----------

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatDate(iso: string) {
  // ISO "YYYY-MM-DD" → "Tue, May 27". Parse as local to avoid the
  // off-by-one common when Date interprets the string as UTC.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
