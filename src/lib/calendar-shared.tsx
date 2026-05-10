"use client";

import { useState, useEffect } from "react";
import PhoneInput from "@/components/phone-input";

// ---- Types ----

export interface StaffMember {
  id: string;
  full_name: string;
  job_title: string | null;
}

export interface ClientItem {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  map_link: string | null;
}

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  category_id: string | null;
  service_categories: { name: string } | { name: string }[] | null;
}

export interface BundleItemForBooking {
  id: string;
  service_id: string;
  sort_order: number;
  services: { id: string; name: string; price: number; duration_minutes: number } | null;
}

export interface BundleForBooking {
  id: string;
  name: string;
  discount_type: "percentage" | "fixed";
  discount_percentage: number | null;
  fixed_price: number | null;
  duration_override: number | null;
  service_bundle_items: BundleItemForBooking[];
}

export interface AppointmentServiceData {
  id: string;
  service_id: string;
  staff_id: string;
  is_parallel: boolean;
  sort_order: number;
  services: { id: string; name: string; price: number; duration_minutes: number } | null;
  // Bundle tracking (migration 025). Populated when the row was added as
  // part of a bundle pick. bundle_instance_id is fresh per "add bundle"
  // action so two copies of the same bundle on one appointment are
  // distinguishable. bundle_total_price snapshots the effective bundle
  // price at save time; one row per instance carries the full amount and
  // getApptSubtotal dedups by instance.
  bundle_id?: string | null;
  bundle_instance_id?: string | null;
  bundle_total_price?: number | null;
  bundle_name?: string | null;
}

export interface AppointmentData {
  id: string;
  client_id: string;
  service_id: string | null;
  date: string;
  time: string;
  status: string;
  notes: string | null;
  duration_override: number | null;
  // Review request fields. Populated by recordPayment() — null until then.
  review_token?: string | null;
  review_sent_at?: string | null;
  // Receipt fields. Also populated by recordPayment().
  receipt_token?: string | null;
  receipt_number?: string | null;
  receipt_sent_at?: string | null;
  clients: { id: string; name: string; phone: string | null; address: string | null; map_link: string | null } | null;
  appointment_services: AppointmentServiceData[];
  // Payment rows attached to this appointment. Used to:
  //   - surface the uploaded receipt image (paperclip preview)
  //   - feed the Edit Payment modal with the existing values
  payments?: Array<{
    id: string;
    amount: number;
    method: "cash" | "card" | "other";
    note: string | null;
    /** Migration-026 array of attachment URLs. New writes go here. */
    receipt_urls?: string[] | null;
    /** Legacy single URL — populated by writes for backwards compat
     *  with code paths that haven't been migrated. Reads should
     *  prefer receipt_urls and fall back to wrapping this value. */
    receipt_url: string | null;
    created_at?: string;
  }>;
  // Joined: 0 or 1 review rows (unique on appointment_id). Supabase returns
  // it as an array — we treat reviews[0] as "the review for this appointment".
  reviews?: Array<{
    id: string;
    rating: number;
    comment: string | null;
    submitted_at: string;
  }>;
  // Optional appointment-level price adjustments (migration 024). Each
  // defaults to a neutral state so existing appointments behave the same:
  // total = sum of services. With these set, total =
  // total_override ?? (services + transport - discount).
  transportation_charge?: number | null;
  discount_type?: "percentage" | "fixed" | null;
  discount_value?: number | null;
  /** When set, replaces the computed total entirely. */
  total_override?: number | null;
}

/**
 * Appointment-level price adjustments collected by the form. The server
 * action persists these on the `appointments` row (migration 024).
 *
 *   - transportation_charge: flat AED, default 0
 *   - discount_type + discount_value: discount can be % or fixed AED
 *   - total_override: optional manual override; when set, the computed
 *     subtotal/transport/discount are ignored
 */
export interface AppointmentAdjustments {
  transportation_charge: number;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  total_override: number | null;
  /** Manual duration override in minutes. Set when the user types a
   *  custom end time in the form's totals line. null clears any prior
   *  override and falls back to "sum of services". */
  duration_override: number | null;
}

export interface ServiceEntry {
  service_id: string;
  staff_id: string;
  is_parallel: boolean;
  /** Catalog ID of the bundle this entry came from. */
  bundle_id?: string;
  /** Per-instance UUID. Stable across the form's lifetime so two copies
   *  of the same bundle don't collide. Generated fresh on each pick. */
  bundle_instance_id?: string;
  bundle_name?: string;
  /** Snapshot of the bundle's effective price at the time it was picked.
   *  Persisted on save so the appointment retains its price even if the
   *  catalog bundle is later edited. */
  bundle_total_price?: number;
}

// ---- Constants ----

// The linear forward path: each step advances to the next via the
// "next status" button in the detail drawer. Terminal states (cancelled
// / no_show) live in STATUS_LABELS only — they're entered via dedicated
// buttons, not by progression, so they don't appear here.
export const STATUS_FLOW = [
  { value: "scheduled", label: "Scheduled", color: "bg-[#FFF8F0] text-[#CC7700]" },
  { value: "on_the_way", label: "On the Way", color: "bg-[#F0FAF2] text-[#1B8736]" },
  { value: "arrived", label: "Arrived", color: "bg-[#F0F7FF] text-[#0062CC]" },
  { value: "paid", label: "Paid", color: "bg-[#F5F5F7] text-[#48484A]" },
];

// All known statuses including terminals. Lookup table for the status
// pill and other label/color renders. Includes everything in
// STATUS_FLOW plus the off-path terminals.
export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  scheduled:  { label: "Scheduled",  color: "bg-[#FFF8F0] text-[#CC7700]" },
  on_the_way: { label: "On the Way", color: "bg-[#F0FAF2] text-[#1B8736]" },
  arrived:    { label: "Arrived",    color: "bg-[#F0F7FF] text-[#0062CC]" },
  paid:       { label: "Paid",       color: "bg-[#F5F5F7] text-[#48484A]" },
  cancelled:  { label: "Cancelled",  color: "bg-[#FEE7E7] text-[#B91C1C]" },
  no_show:    { label: "No-show",    color: "bg-[#F3E8FF] text-[#6B21A8]" },
};

// ---- Helpers ----

export function formatTime12(time24: string) {
  const [h, m] = time24.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${m} ${ampm}`;
}

export function formatTime12Short(time24: string) {
  const [h, m] = time24.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  if (m === "00") return `${hour12} ${ampm}`;
  return `${hour12}:${m} ${ampm}`;
}

export function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h}h ${m}m`;
}

export function getServiceTimings(appt: AppointmentData) {
  const startMin = timeToMinutes(appt.time);
  const sorted = [...appt.appointment_services].sort((a, b) => a.sort_order - b.sort_order);
  const timings: { svc: AppointmentServiceData; startMin: number; endMin: number }[] = [];
  let currentEnd = startMin;

  for (let i = 0; i < sorted.length; i++) {
    const svc = sorted[i];
    const dur = svc.services?.duration_minutes || 30;
    let svcStart: number;
    if (i === 0) {
      svcStart = startMin;
    } else if (svc.is_parallel) {
      svcStart = timings[i - 1].startMin;
    } else {
      svcStart = currentEnd;
    }
    const svcEnd = svcStart + dur;
    timings.push({ svc, startMin: svcStart, endMin: svcEnd });
    if (svcEnd > currentEnd) currentEnd = svcEnd;
  }

  return timings;
}

export function getApptTotalDuration(appt: AppointmentData) {
  if (appt.duration_override) return appt.duration_override;
  const timings = getServiceTimings(appt);
  if (timings.length === 0) return 60;
  const start = timeToMinutes(appt.time);
  const end = Math.max(...timings.map((t) => t.endMin));
  return end - start;
}

export function getApptEndTime(appt: AppointmentData) {
  const startMin = timeToMinutes(appt.time);
  const duration = getApptTotalDuration(appt);
  return minutesToTime(startMin + duration);
}

// ---- Price helpers (migration 024 adjustments) ----
//
// Subtotal: just the sum of service prices.
// Discount amount: resolved to AED (percentage-of-(subtotal+transport) or
//   fixed AED). Cannot exceed subtotal+transport.
// Final total: total_override ?? max(0, subtotal + transport - discount).

export function getApptSubtotal(appt: AppointmentData): number {
  // Bundle-aware sum. Rows with a bundle_instance_id contribute the
  // bundle's total price once per instance (via bundle_total_price);
  // subsequent rows of the same instance contribute 0. Rows without an
  // instance ID are plain services and contribute their service price.
  let total = 0;
  const seenInstances = new Set<string>();
  for (const as of appt.appointment_services) {
    if (as.bundle_instance_id) {
      if (!seenInstances.has(as.bundle_instance_id)) {
        seenInstances.add(as.bundle_instance_id);
        total += Number(as.bundle_total_price ?? 0);
      }
      continue;
    }
    total += as.services?.price || 0;
  }
  return total;
}

export function getApptTransport(appt: AppointmentData): number {
  return Number(appt.transportation_charge ?? 0);
}

export function getApptDiscountAmount(appt: AppointmentData): number {
  const value = Number(appt.discount_value ?? 0);
  if (value <= 0) return 0;
  if (appt.discount_type === "percentage") {
    const base = getApptSubtotal(appt) + getApptTransport(appt);
    return Math.min(base, (base * value) / 100);
  }
  // fixed
  return Math.min(getApptSubtotal(appt) + getApptTransport(appt), value);
}

export function getApptTotal(appt: AppointmentData): number {
  if (appt.total_override != null) return Number(appt.total_override);
  return Math.max(0, getApptSubtotal(appt) + getApptTransport(appt) - getApptDiscountAmount(appt));
}

export function hasAppointmentAdjustments(appt: AppointmentData): boolean {
  return (
    getApptTransport(appt) > 0 ||
    Number(appt.discount_value ?? 0) > 0 ||
    appt.total_override != null
  );
}

export function getStaffServiceBlocks(appt: AppointmentData, staffId: string) {
  const timings = getServiceTimings(appt);
  return timings.filter((t) => t.svc.staff_id === staffId);
}

export function getServiceName(s: ServiceItem) {
  const cat = s.service_categories;
  const catName = cat
    ? Array.isArray(cat) ? cat[0]?.name : cat.name
    : null;
  return catName ? `${catName} — ${s.name}` : s.name;
}

// ---- DetailView Component ----

export function DetailView({
  appointment,
  staff,
  onStatusUpdate,
  onEdit,
  onCancel,
  onNoShow,
  onDelete,
  onEditPayment,
  onShareSent,
  canEdit = true,
}: {
  appointment: AppointmentData;
  staff: StaffMember[];
  onStatusUpdate: (status: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  /** Sibling of onCancel: marks the appointment as a no-show.
   *  Optional — caller pages decide whether to expose it. */
  onNoShow?: () => void;
  /** When provided, renders a trash-bin icon button that hard-deletes
   *  the appointment (purges it from records & reports). Optional — only
   *  passed by owner/admin pages. */
  onDelete?: () => void;
  /** When provided AND the appointment has been paid, renders an
   *  "Edit payment" link next to the status pill. The parent owns the
   *  actual edit modal and reads appointment.payments[latest] from the
   *  current selection. */
  onEditPayment?: () => void;
  /** Called after the owner taps "Send via WhatsApp" so the parent can
   *  bump review_sent_at + receipt_sent_at and refresh. Optional — if
   *  absent, the section just opens wa.me without persisting send state. */
  onShareSent?: () => void;
  /** When false, hide the Cancel/Edit/Delete buttons. Staff roles pass false. */
  canEdit?: boolean;
}) {
  const timings = getServiceTimings(appointment);
  const totalDuration = getApptTotalDuration(appointment);
  const endTime = getApptEndTime(appointment);

  const currentStatusIdx = STATUS_FLOW.findIndex((s) => s.value === appointment.status);
  const nextStatus = currentStatusIdx >= 0 && currentStatusIdx < STATUS_FLOW.length - 1
    ? STATUS_FLOW[currentStatusIdx + 1]
    : null;
  const isActive = ["scheduled", "on_the_way", "arrived"].includes(appointment.status);

  // Receipt attachments for the latest payment, surfaced as a paperclip
  // next to the status pill. Prefer migration-026 receipt_urls; fall
  // back to wrapping the legacy single receipt_url for older rows.
  const uploadedReceiptUrls = (() => {
    const latest = [...(appointment.payments ?? [])]
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .find((p) => (p.receipt_urls && p.receipt_urls.length > 0) || p.receipt_url);
    if (!latest) return [] as string[];
    if (latest.receipt_urls && latest.receipt_urls.length > 0) return latest.receipt_urls;
    return latest.receipt_url ? [latest.receipt_url] : [];
  })();
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [receiptPreviewIdx, setReceiptPreviewIdx] = useState(0);

  return (
    <div className="space-y-6">
      {/* ---- Status (top) ---- */}
      <div>
        <h3 className="text-body font-bold text-text-primary mb-2">Status</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-block rounded-full px-3 py-1 text-body-sm font-medium ${STATUS_LABELS[appointment.status]?.color || "bg-gray-100 text-text-primary"}`}>
            {STATUS_LABELS[appointment.status]?.label || appointment.status}
          </span>
          {uploadedReceiptUrls.length > 0 && (
            <button
              type="button"
              onClick={() => { setReceiptPreviewIdx(0); setReceiptPreviewOpen(true); }}
              aria-label={`View ${uploadedReceiptUrls.length} uploaded receipt${uploadedReceiptUrls.length > 1 ? "s" : ""}`}
              className="flex h-8 items-center justify-center gap-1 rounded-lg px-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
              {uploadedReceiptUrls.length > 1 && (
                <span className="text-caption font-semibold tabular-nums">{uploadedReceiptUrls.length}</span>
              )}
            </button>
          )}
          {/* Edit payment — only when the appointment is paid AND the
              caller wired the callback (owner/admin pages do; staff
              don't pass it). Lets the owner fix a wrong method or
              swap the receipt photo without re-doing the whole flow. */}
          {canEdit && onEditPayment && appointment.status === "paid" && (appointment.payments?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={onEditPayment}
              className="text-caption font-semibold text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
            >
              Edit payment
            </button>
          )}
        </div>
      </div>

      {/* ---- Date & Time ---- */}
      <div>
        <h3 className="text-body font-bold text-text-primary mb-2">Date & Time</h3>
        <div className="space-y-1 text-body-sm text-text-secondary">
          <p>{appointment.date}</p>
          <p>{formatTime12(appointment.time)} – {formatTime12(endTime)}</p>
          <p className="flex items-center gap-1.5">
            <span>{formatDuration(totalDuration)} total</span>
            {appointment.duration_override != null && (
              <span className="rounded-full bg-surface-active px-1.5 py-0.5 text-caption font-medium text-text-tertiary">
                adjusted
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ---- Client ---- */}
      <div>
        <h3 className="text-body font-bold text-text-primary mb-2">Client</h3>
        <div className="space-y-1 text-body-sm">
          <p className="font-semibold text-text-primary">{appointment.clients?.name || "Unknown"}</p>
          {appointment.clients?.phone && (
            <p>
              <a
                href={`tel:${appointment.clients.phone}`}
                className="text-text-secondary hover:text-text-primary hover:underline underline-offset-2 transition-colors"
              >
                {appointment.clients.phone}
              </a>
            </p>
          )}
          {appointment.clients?.address && <p className="text-text-secondary">{appointment.clients.address}</p>}
          {appointment.clients?.map_link && (
            <a href={appointment.clients.map_link} target="_blank" rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-2 text-body-sm text-text-secondary hover:text-text-primary transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              Open in Google Maps
            </a>
          )}
        </div>
      </div>

      {/* ---- Services ---- */}
      {timings.length > 0 && (
        <div>
          <h3 className="text-body font-bold text-text-primary mb-2.5">Services</h3>
          <div className="space-y-2.5">
            {timings.map((t, i) => {
              const staffMember = staff.find((s) => s.id === t.svc.staff_id);
              // Bundle grouping (migration 025). When a row carries a
              // bundle_instance_id and the previous row does not share it,
              // we're at the start of a bundle group — render a header
              // with the bundle name + its total price and suppress
              // per-service prices for rows in the group (the bundle
              // price replaces them).
              const inBundle = !!t.svc.bundle_instance_id;
              const prevInstance = i > 0 ? timings[i - 1].svc.bundle_instance_id : null;
              const isFirstInBundle = inBundle && prevInstance !== t.svc.bundle_instance_id;
              return (
                <div key={t.svc.id || i}>
                  {isFirstInBundle && (
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <div className="flex items-center gap-2">
                        <span className="text-body-sm font-semibold text-text-primary">
                          {t.svc.bundle_name || "Bundle"}
                        </span>
                        <span className="rounded-full bg-surface-active px-2 py-0.5 text-caption font-medium text-text-secondary">
                          Bundle
                        </span>
                      </div>
                      {t.svc.bundle_total_price != null && (
                        <span className="text-body-sm font-semibold text-text-primary">
                          AED {Math.round(Number(t.svc.bundle_total_price))}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="rounded-lg bg-surface-hover px-3 py-2.5 text-body-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-text-primary">{t.svc.services?.name || "Unknown"}</p>
                      {!inBundle && (
                        <span className="font-semibold text-text-primary">AED {t.svc.services?.price || 0}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-text-secondary">
                        {formatDuration(t.endMin - t.startMin)}
                        {t.svc.is_parallel && <span className="ml-1">(parallel)</span>}
                      </p>
                      {staffMember && (
                        <span className="rounded-full bg-surface-active px-2 py-0.5 text-caption font-semibold text-text-primary">
                          {staffMember.full_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Subtotal + adjustments + total. The breakdown rows only render
              when their value is non-zero/set so a clean appointment shows
              just one "Total" line. */}
          <div className="mt-3 space-y-1.5 px-1 text-body-sm">
            {hasAppointmentAdjustments(appointment) && (
              <div className="flex items-center justify-between text-text-secondary">
                <span>Subtotal</span>
                <span>AED {getApptSubtotal(appointment)}</span>
              </div>
            )}
            {getApptTransport(appointment) > 0 && (
              <div className="flex items-center justify-between text-text-secondary">
                <span>Transportation</span>
                <span>+ AED {getApptTransport(appointment)}</span>
              </div>
            )}
            {Number(appointment.discount_value ?? 0) > 0 && (
              <div className="flex items-center justify-between text-text-secondary">
                <span>
                  Discount
                  {appointment.discount_type === "percentage" && (
                    <span className="text-text-tertiary"> ({Number(appointment.discount_value)}% off)</span>
                  )}
                </span>
                <span>− AED {getApptDiscountAmount(appointment)}</span>
              </div>
            )}
            {appointment.total_override != null && (
              <div className="flex items-center justify-between text-caption text-text-tertiary">
                <span>Manual total override</span>
                <span></span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-body-sm font-bold text-text-primary">Total</span>
              <span className="text-body-sm font-bold text-text-primary">AED {getApptTotal(appointment)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ---- Notes ---- */}
      {appointment.notes && (
        <div>
          <h3 className="text-body font-bold text-text-primary mb-2">Notes</h3>
          <p className="text-body-sm text-text-secondary">{appointment.notes}</p>
        </div>
      )}

      {/* ---- Share / receipt / review ---- */}
      {/* Only shows once payment is recorded (recordPayment mints both the
          review and receipt tokens at the same time). Combines:
            - "Send receipt + review" WhatsApp CTA (one message, both links)
            - Receipt number + view-receipt link
            - Submitted review readout (if customer already left feedback) */}
      {(appointment.receipt_token || appointment.review_token) && (
        <ShareSection appointment={appointment} onShareSent={onShareSent} />
      )}

      {/* ---- Actions ---- */}
      {/* Secondary shortcut row above the main action buttons.
          - "Mark as No-show" (left) — terminal state; client didn't
            turn up. Distinct from cancel: the slot was held + staff
            time was reserved, so reports treat it differently. Only
            shown while the appointment is still active.
          - "Skip to Mark Paid" (right) — bypasses the linear status
            progression (scheduled → on_the_way → arrived → paid)
            and jumps straight to the Mark Paid modal. Hidden when
            the next step is already "paid". */}
      {canEdit && isActive && (onNoShow || (nextStatus && nextStatus.value !== "paid")) && (
        <div className="-mb-1 flex items-center justify-between gap-2 text-caption font-semibold">
          {onNoShow ? (
            <button
              onClick={onNoShow}
              className="text-text-secondary hover:text-text-primary"
            >
              ← No-show
            </button>
          ) : (
            <span />
          )}
          {nextStatus && nextStatus.value !== "paid" ? (
            <button
              onClick={() => onStatusUpdate("paid")}
              className="text-text-secondary hover:text-text-primary"
            >
              Mark Paid →
            </button>
          ) : (
            <span />
          )}
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-border pt-4 sm:gap-3">
        {nextStatus && (
          <button onClick={() => onStatusUpdate(nextStatus.value)}
            className={`flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-body-sm font-semibold transition-colors ${nextStatus.color} hover:opacity-80`}>
            {nextStatus.label}
          </button>
        )}
        {canEdit && isActive && (
          // Auto-sized (no flex-1) so the primary status button gets the
          // extra horizontal room — was making "On the Way" cramped on
          // mobile when both buttons split the width 50/50.
          <button onClick={onCancel}
            className="shrink-0 whitespace-nowrap rounded-xl border border-red-200 px-3 py-2.5 text-body-sm font-semibold text-error-700 hover:bg-red-50 transition-colors">
            Cancel
          </button>
        )}
        {canEdit && (
          <button onClick={onEdit}
            className="flex shrink-0 h-10 w-10 items-center justify-center rounded-xl bg-surface-active text-text-secondary hover:bg-neutral-100 hover:text-text-primary transition-colors"
            title="Edit appointment">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
        )}
        {canEdit && onDelete && (
          <button onClick={onDelete}
            className="flex shrink-0 h-10 w-10 items-center justify-center rounded-xl bg-surface-active text-text-secondary hover:bg-red-50 hover:text-red-600 transition-colors"
            title="Delete appointment (removes from records)">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        )}
      </div>

      {/* Receipt-image lightbox — opened by tapping the paperclip near
          the status pill above. Backdrop or close button dismisses. */}
      {receiptPreviewOpen && uploadedReceiptUrls.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setReceiptPreviewOpen(false)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setReceiptPreviewOpen(false)}
              aria-label="Close"
              className="absolute -top-3 -right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-text-primary shadow-lg hover:bg-neutral-100"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={uploadedReceiptUrls[Math.min(receiptPreviewIdx, uploadedReceiptUrls.length - 1)]}
              alt={`Receipt ${receiptPreviewIdx + 1}`}
              className="max-h-[90vh] max-w-[90vw] rounded-lg"
            />
            {uploadedReceiptUrls.length > 1 && (
              <>
                <button
                  onClick={() => setReceiptPreviewIdx((i) => (i - 1 + uploadedReceiptUrls.length) % uploadedReceiptUrls.length)}
                  aria-label="Previous receipt"
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-text-primary shadow-lg hover:bg-white"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <button
                  onClick={() => setReceiptPreviewIdx((i) => (i + 1) % uploadedReceiptUrls.length)}
                  aria-label="Next receipt"
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-text-primary shadow-lg hover:bg-white"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-caption font-semibold text-white">
                  {receiptPreviewIdx + 1} / {uploadedReceiptUrls.length}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Returns the most recent of two ISO timestamps, or null if both are null.
function mostRecent(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}


// ---- ShareSection (inside DetailView) ----

/**
 * Combined receipt + review share UI. Renders once payment has been
 * recorded (recordPayment mints both tokens). Composition:
 *
 *   1. Receipt summary  — receipt number + "View receipt" link.
 *   2. Review readout   — stars + comment if the customer already submitted.
 *   3. Send button      — single WhatsApp deep link whose message body
 *                          contains BOTH the receipt and review URLs (when
 *                          a review hasn't been left yet) or just the
 *                          receipt URL (post-review).
 *   4. Copy buttons     — utility fallbacks for receipt + review links.
 *
 * The wa.me deep link is a no-API solution: opens WhatsApp with the
 * message pre-typed. Staff still has to tap "Send" — Phase 4 (Cloud API)
 * removes that last tap.
 */
function ShareSection({
  appointment,
  onShareSent,
}: {
  appointment: AppointmentData;
  onShareSent?: () => void;
}) {
  const review = appointment.reviews?.[0];
  const phone = appointment.clients?.phone || "";
  const clientName = appointment.clients?.name || "there";
  const firstName = clientName.split(" ")[0];

  // Build absolute URLs when on the client; relative ones during SSR fallback.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const receiptUrl = appointment.receipt_token
    ? `${origin}/receipt/${appointment.receipt_token}`
    : null;
  const reviewUrl = appointment.review_token
    ? `${origin}/r/${appointment.review_token}`
    : null;

  // Compose ONE message body. If the review's already in, drop the review
  // line — no point asking again.
  const messageLines: string[] = [`Hi ${firstName}! Thanks for visiting today.`];
  if (receiptUrl) messageLines.push(`Your receipt: ${receiptUrl}`);
  if (reviewUrl && !review) {
    messageLines.push(`We'd love your feedback — it only takes a moment: ${reviewUrl}`);
  }
  const message = messageLines.join("\n\n");

  // wa.me requires the phone WITHOUT the leading "+" and without spaces.
  const waPhone = phone.replace(/[^\d]/g, "");
  const waUrl = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
    : null;

  function handleSend() {
    if (!waUrl) return;
    window.open(waUrl, "_blank");
    if (onShareSent) onShareSent();
  }

  function handleCopy(url: string) {
    navigator.clipboard.writeText(url);
    if (onShareSent) onShareSent();
  }

  // Choose a label depending on what we still need to share.
  const sendLabel = review || !reviewUrl ? "Send receipt via WhatsApp" : "Send receipt + review";
  // The "Last shared" stamp uses whichever timestamp is most recent.
  const lastShared = mostRecent(appointment.receipt_sent_at, appointment.review_sent_at);

  return (
    <div className="space-y-4">
      {/* Receipt summary */}
      {receiptUrl && (
        <div>
          <h3 className="text-body font-bold text-text-primary mb-2">Receipt</h3>
          <div className="flex items-center justify-between rounded-xl bg-surface-hover px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-text-primary truncate">
                {appointment.receipt_number || "Receipt"}
              </p>
              <p className="text-caption text-text-tertiary">Tap to view or print</p>
            </div>
            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-3 shrink-0 rounded-lg bg-white px-3 py-1.5 text-caption font-semibold text-text-primary ring-1 ring-border hover:bg-surface-active"
            >
              View
            </a>
          </div>
        </div>
      )}

      {/* Submitted review readout — shown after the customer rates */}
      {review && (
        <div>
          <h3 className="text-body font-bold text-text-primary mb-2">Review</h3>
          <div className="rounded-xl bg-surface-hover px-3 py-2.5">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <svg
                  key={n}
                  className="h-4 w-4"
                  fill={n <= review.rating ? "#F59E0B" : "none"}
                  stroke={n <= review.rating ? "#F59E0B" : "#D1D5DB"}
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                  />
                </svg>
              ))}
              <span className="ml-2 text-caption text-text-tertiary">
                {new Date(review.submitted_at).toLocaleDateString()}
              </span>
            </div>
            {review.comment && (
              <p className="mt-1.5 text-body-sm text-text-primary">{review.comment}</p>
            )}
          </div>
        </div>
      )}

      {/* Send + copy controls */}
      <div className="space-y-2">
        {waUrl ? (
          <button
            onClick={handleSend}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-body-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            {sendLabel}
          </button>
        ) : (
          <p className="text-caption text-text-tertiary px-1">
            No phone number on file — copy the link instead.
          </p>
        )}

        {/* Copy fallbacks — full-width on every breakpoint so they match
            the Send button's width above. */}
        <div className="grid grid-cols-1 gap-2">
          {receiptUrl && (
            <button
              onClick={() => handleCopy(receiptUrl)}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-caption font-semibold text-text-primary hover:bg-surface-hover"
            >
              Copy receipt link
            </button>
          )}
          {reviewUrl && !review && (
            <button
              onClick={() => handleCopy(reviewUrl)}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-caption font-semibold text-text-primary hover:bg-surface-hover"
            >
              Copy review link
            </button>
          )}
        </div>

        {lastShared && (
          <p className="text-caption text-text-tertiary px-1">
            Last shared {new Date(lastShared).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

// ---- AppointmentForm Component ----

export function AppointmentForm({
  dateStr,
  clients,
  services,
  staff,
  bundles,
  staffSchedules,
  onSubmit,
  onNewClient,
  onCancel,
  submitLabel,
  defaultValues,
  prefillTime,
  prefillStaffId,
}: {
  dateStr: string;
  clients: ClientItem[];
  services: ServiceItem[];
  staff: StaffMember[];
  bundles?: BundleForBooking[];
  staffSchedules?: Map<string, { isOff: boolean; startMin: number; endMin: number }>;
  onSubmit: (
    clientId: string,
    date: string,
    time: string,
    notes: string,
    entries: ServiceEntry[],
    adjustments: AppointmentAdjustments,
  ) => Promise<void>;
  onNewClient: (name: string, phone: string, address: string, mapLink: string, notes: string) => Promise<ClientItem | null>;
  onCancel: () => void;
  submitLabel: string;
  defaultValues?: {
    client_id: string;
    date: string;
    time: string;
    notes: string;
    serviceEntries: ServiceEntry[];
    transportation_charge?: number | null;
    discount_type?: "percentage" | "fixed" | null;
    discount_value?: number | null;
    total_override?: number | null;
    /** Saved manual duration override (minutes). When present, the
     *  totals line shows this as the end time instead of summing
     *  service durations. */
    duration_override?: number | null;
  };
  prefillTime?: string | null;
  prefillStaffId?: string | null;
}) {
  const [clientMode, setClientMode] = useState<"existing" | "new">(defaultValues ? "existing" : "existing");
  const [selectedClientId, setSelectedClientId] = useState(defaultValues?.client_id || "");
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [newClientMapLink, setNewClientMapLink] = useState("");
  const [newClientNotes, setNewClientNotes] = useState("");
  const [date, setDate] = useState(defaultValues?.date || dateStr);
  // Default time: edit mode keeps the saved time; new appointments use
  // the prefill (set by drag-on-grid) when provided; otherwise default
  // to "now rounded up to the next 15-min slot" so walk-ins land near
  // the current minute instead of always reading 09:00.
  const [time, setTime] = useState(() => {
    if (defaultValues?.time) return defaultValues.time;
    if (prefillTime) return prefillTime;
    const now = new Date();
    const rounded = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
    const wrapped = rounded % (24 * 60);
    const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
    const mm = String(wrapped % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  });
  const [notes, setNotes] = useState(defaultValues?.notes || "");
  const [serviceEntries, setServiceEntries] = useState<ServiceEntry[]>(
    defaultValues?.serviceEntries?.length
      ? defaultValues.serviceEntries
      : [{ service_id: "", staff_id: prefillStaffId || "", is_parallel: false }]
  );

  // ---- Adjustments (transport / discount / override) ----
  const [transportCharge, setTransportCharge] = useState<string>(
    defaultValues?.transportation_charge ? String(defaultValues.transportation_charge) : "",
  );
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(
    defaultValues?.discount_type ?? "fixed",
  );
  const [discountValue, setDiscountValue] = useState<string>(
    defaultValues?.discount_value ? String(defaultValues.discount_value) : "",
  );
  const [totalOverride, setTotalOverride] = useState<string>(
    defaultValues?.total_override != null ? String(defaultValues.total_override) : "",
  );
  // Manual duration override (minutes). Driven by the editable end-time
  // in the totals line at the bottom of Services. null = follow the sum
  // of services as before. Persists through service changes — your set
  // value wins until you tap "↺ Reset".
  const [durationOverride, setDurationOverride] = useState<number | null>(
    defaultValues?.duration_override ?? null,
  );
  // Inline edit state for the end-time field.
  const [editingEndTime, setEditingEndTime] = useState(false);
  // Open by default when editing an appointment that already has any
  // non-default adjustment, otherwise collapsed.
  const hasInitialAdjustment =
    !!defaultValues?.transportation_charge ||
    !!defaultValues?.discount_value ||
    defaultValues?.total_override != null;
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(hasInitialAdjustment);

  const [submitting, setSubmitting] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [savedClients, setSavedClients] = useState<ClientItem[]>([]);

  const allClients = [...clients, ...savedClients];

  async function handleSaveClient() {
    // Address is optional in this quick-add path — walk-in / in-store
    // clients don't need a delivery address. Name + phone still required.
    if (!newClientName.trim() || !newClientPhone.trim()) return;
    setSavingClient(true);
    const newClient = await onNewClient(newClientName, newClientPhone, newClientAddress, newClientMapLink, newClientNotes);
    setSavingClient(false);
    if (!newClient) return;
    setSavedClients((prev) => [...prev, newClient]);
    setSelectedClientId(newClient.id);
    setClientMode("existing");
    setNewClientName("");
    setNewClientPhone("");
    setNewClientAddress("");
    setNewClientMapLink("");
    setNewClientNotes("");
  }

  // Sync prefillTime/prefillStaffId when they change (e.g. grid drag-to-create)
  useEffect(() => {
    if (prefillTime) setTime(prefillTime);
  }, [prefillTime]);

  useEffect(() => {
    if (prefillStaffId && !defaultValues) {
      setServiceEntries((prev) =>
        prev.map((e, i) => (i === 0 && !e.staff_id ? { ...e, staff_id: prefillStaffId } : e))
      );
    }
  }, [prefillStaffId, defaultValues]);

  function addServiceEntry() {
    setServiceEntries([...serviceEntries, { service_id: "", staff_id: "", is_parallel: false }]);
  }

  function removeServiceEntry(idx: number) {
    setServiceEntries(serviceEntries.filter((_, i) => i !== idx));
  }

  function handleServiceSelect(idx: number, value: string) {
    if (value.startsWith("bundle:")) {
      const bundleId = value.slice(7);
      const bundle = bundles?.find((b) => b.id === bundleId);
      if (!bundle) return;
      const sorted = [...bundle.service_bundle_items].sort((a, b) => a.sort_order - b.sort_order);
      // Fresh instance ID + price snapshot per pick. Two copies of the
      // same bundle get different instance IDs so they don't collide in
      // the dedup-by-instance subtotal calc.
      const instanceId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${bundle.id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const originalPrice = bundle.service_bundle_items.reduce(
        (sum, item) => sum + (item.services?.price || 0),
        0,
      );
      const bundleTotal =
        bundle.discount_type === "fixed" && bundle.fixed_price != null
          ? bundle.fixed_price
          : bundle.discount_percentage != null
            ? Math.round(originalPrice * (1 - bundle.discount_percentage / 100))
            : originalPrice;
      const bundleEntries: ServiceEntry[] = sorted.map((item) => ({
        service_id: item.service_id,
        staff_id: "",
        is_parallel: false,
        bundle_id: bundle.id,
        bundle_instance_id: instanceId,
        bundle_name: bundle.name,
        bundle_total_price: bundleTotal,
      }));
      // Replace the current entry with the bundle's services
      const before = serviceEntries.slice(0, idx);
      const after = serviceEntries.slice(idx + 1);
      setServiceEntries([...before, ...bundleEntries, ...after]);
    } else {
      updateEntry(idx, "service_id", value);
    }
  }

  function updateEntry(idx: number, field: keyof ServiceEntry, value: string | boolean) {
    const updated = [...serviceEntries];
    updated[idx] = { ...updated[idx], [field]: value };
    // If changing service_id, clear bundle association
    if (field === "service_id") {
      updated[idx] = {
        ...updated[idx],
        bundle_id: undefined,
        bundle_instance_id: undefined,
        bundle_name: undefined,
        bundle_total_price: undefined,
      };
    }
    setServiceEntries(updated);
  }

  function calcTotalDuration() {
    let currentEnd = 0;
    for (let i = 0; i < serviceEntries.length; i++) {
      const svc = services.find((s) => s.id === serviceEntries[i].service_id);
      const dur = svc?.duration_minutes || 0;
      if (i === 0) {
        currentEnd = dur;
      } else if (serviceEntries[i].is_parallel) {
        const prevStart = i > 0 && serviceEntries[i].is_parallel ? 0 : currentEnd - (services.find((s) => s.id === serviceEntries[i - 1].service_id)?.duration_minutes || 0);
        const parallelEnd = prevStart + dur;
        if (parallelEnd > currentEnd) currentEnd = parallelEnd;
      } else {
        currentEnd += dur;
      }
    }
    return currentEnd;
  }

  const totalDuration = calcTotalDuration();

  // Calculate total price with bundle discounts. Dedup by
  // bundle_instance_id (not bundle_id) so two copies of the same bundle
  // each contribute their own bundle price.
  const totalPrice = (() => {
    let total = 0;
    const processedInstances = new Set<string>();
    for (const entry of serviceEntries) {
      if (entry.bundle_instance_id) {
        if (!processedInstances.has(entry.bundle_instance_id)) {
          processedInstances.add(entry.bundle_instance_id);
          // Prefer the snapshot stamped at pick time; fall back to looking
          // up the catalog price (covers legacy entries that were
          // re-hydrated from DB without bundle_total_price).
          if (entry.bundle_total_price != null) {
            total += entry.bundle_total_price;
          } else {
            const bundle = bundles?.find((b) => b.id === entry.bundle_id);
            if (bundle) {
              const originalPrice = bundle.service_bundle_items.reduce(
                (sum, item) => sum + (item.services?.price || 0), 0
              );
              const bundlePrice = bundle.discount_type === "fixed" && bundle.fixed_price != null
                ? bundle.fixed_price
                : bundle.discount_percentage != null
                  ? originalPrice * (1 - bundle.discount_percentage / 100)
                  : originalPrice;
              total += bundlePrice;
            }
          }
        }
        continue;
      }
      const svc = services.find((s) => s.id === entry.service_id);
      total += svc?.price || 0;
    }
    return Math.round(total);
  })();

  const startMin = timeToMinutes(time);
  // Effective duration: the override wins over the calculated sum so
  // adding/removing services after a manual end-time edit doesn't undo
  // the user's intent. Reset link in the totals line clears the override.
  const effectiveDuration = durationOverride ?? totalDuration;
  const endTimeStr = minutesToTime(startMin + effectiveDuration);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const clientId = selectedClientId;
    if (!clientId) { setSubmitting(false); return; }

    const validEntries = serviceEntries.filter((e) => e.service_id && e.staff_id);
    if (validEntries.length === 0) {
      setSubmitting(false);
      return;
    }

    // Check staff schedules for out-of-hours warnings
    if (staffSchedules && staffSchedules.size > 0) {
      const apptStartMin = timeToMinutes(time);
      // Calculate each service's time span
      let currentEnd = 0; // offset from apptStart
      const svcTimings: { entryIdx: number; startOff: number; endOff: number }[] = [];
      for (let i = 0; i < validEntries.length; i++) {
        const svc = services.find((s) => s.id === validEntries[i].service_id);
        const dur = svc?.duration_minutes || 30;
        const startOff = validEntries[i].is_parallel && i > 0 ? svcTimings[i - 1].startOff : currentEnd;
        const endOff = startOff + dur;
        svcTimings.push({ entryIdx: i, startOff, endOff });
        currentEnd = Math.max(currentEnd, endOff);
      }

      const warnings: string[] = [];
      const checkedStaff = new Set<string>();

      for (let i = 0; i < validEntries.length; i++) {
        const entry = validEntries[i];
        const sched = staffSchedules.get(entry.staff_id);
        if (!sched || checkedStaff.has(entry.staff_id)) continue;
        checkedStaff.add(entry.staff_id);

        const staffName = staff.find((s) => s.id === entry.staff_id)?.full_name || "Staff";

        if (sched.isOff) {
          warnings.push(`${staffName} has a day off`);
          continue;
        }

        // Check if any of this staff's services fall outside their work hours
        for (const t of svcTimings) {
          if (validEntries[t.entryIdx].staff_id !== entry.staff_id) continue;
          const svcStart = apptStartMin + t.startOff;
          const svcEnd = apptStartMin + t.endOff;
          if (svcStart < sched.startMin || svcEnd > sched.endMin) {
            warnings.push(`${staffName} works ${formatTime12(minutesToTime(sched.startMin))} – ${formatTime12(minutesToTime(sched.endMin))}`);
            break;
          }
        }
      }

      if (warnings.length > 0) {
        const msg = warnings.join("\n") + "\n\nContinue anyway?";
        if (!window.confirm(msg)) {
          setSubmitting(false);
          return;
        }
      }
    }

    // Bundle the adjustment fields into a single object so the server
    // action signature stays compact. Empty strings → 0 / null.
    const adjustments: AppointmentAdjustments = {
      duration_override: durationOverride,
      transportation_charge: parseFloat(transportCharge) || 0,
      discount_type: discountType,
      discount_value: parseFloat(discountValue) || 0,
      total_override: totalOverride.trim() === "" ? null : parseFloat(totalOverride) || null,
    };

    await onSubmit(clientId, date, time, notes, validEntries, adjustments);
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-body-sm font-semibold text-text-primary">Client *</label>
          <button type="button" onClick={() => setClientMode(clientMode === "existing" ? "new" : "existing")}
            className="text-xs text-text-secondary hover:text-text-primary">
            {clientMode === "existing" ? "Add new client" : "Select existing"}
          </button>
        </div>

        {clientMode === "existing" ? (
          <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} required
            className="block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100">
            <option value="">Select a client</option>
            {allClients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>
            ))}
          </select>
        ) : (
          <div className="space-y-5 rounded-xl border border-border p-4 bg-surface-hover">
            <div>
              <label className="block text-body-sm font-semibold text-text-primary">Name *</label>
              <input type="text" value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)} required
                className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
            </div>
            <div>
              <label className="block text-body-sm font-semibold text-text-primary">Phone *</label>
              <div className="mt-1">
                <PhoneInput value={newClientPhone} onChange={setNewClientPhone} required size="small" />
              </div>
            </div>
            <div>
              <label className="block text-body-sm font-semibold text-text-primary">
                Location <span className="font-normal text-text-tertiary">(optional)</span>
              </label>
              <div className="mt-1 space-y-2 rounded-xl ring-1 ring-border p-2.5 bg-white">
                <div>
                  <label className="block text-caption text-text-secondary mb-0.5">Address</label>
                  <input type="text" value={newClientAddress}
                    onChange={(e) => setNewClientAddress(e.target.value)}
                    placeholder="Skip for walk-in / in-store"
                    className="block w-full rounded-lg border border-neutral-200 px-3 py-2 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-100" />
                </div>
                <div>
                  <label className="block text-caption text-text-secondary mb-0.5">Pin location</label>
                  <input type="url" value={newClientMapLink}
                    onChange={(e) => setNewClientMapLink(e.target.value)}
                    placeholder="https://maps.google.com/..."
                    className="block w-full rounded-lg border border-neutral-200 px-3 py-2 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-100" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-body-sm font-semibold text-text-primary">Notes</label>
              <textarea rows={2} value={newClientNotes}
                onChange={(e) => setNewClientNotes(e.target.value)}
                className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
            </div>
            <button type="button" onClick={handleSaveClient}
              disabled={savingClient || !newClientName.trim() || !newClientPhone.trim()}
              className="w-full rounded-xl bg-neutral-900 px-4 py-2 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 disabled:opacity-50 transition">
              {savingClient ? "Saving..." : "Save Client"}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-body-sm font-semibold text-text-primary">Date *</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
            className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
        </div>
        <div>
          <label className="block text-body-sm font-semibold text-text-primary">Start Time *</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required
            className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
        </div>
      </div>

      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-2">Services *</label>

        <div className="space-y-3">
          {serviceEntries.map((entry, idx) => {
            const selectedService = services.find((s) => s.id === entry.service_id);
            // Show bundle header for the first entry in a bundle group.
            // Compare on instance ID (not bundle ID) so two consecutive
            // copies of the same bundle each get their own header.
            const isFirstInBundle = !!entry.bundle_instance_id && (idx === 0 || serviceEntries[idx - 1].bundle_instance_id !== entry.bundle_instance_id);
            const isInBundle = !!entry.bundle_instance_id;
            // Bundle price for the header — prefer the snapshot stamped
            // when the bundle was picked, fall back to the catalog price.
            let bundlePriceDisplay: number | null = null;
            if (isFirstInBundle) {
              if (entry.bundle_total_price != null) {
                bundlePriceDisplay = Math.round(entry.bundle_total_price);
              } else if (entry.bundle_id) {
                const bundle = bundles?.find((b) => b.id === entry.bundle_id);
                if (bundle) {
                  const originalPrice = bundle.service_bundle_items.reduce(
                    (sum, item) => sum + (item.services?.price || 0), 0
                  );
                  bundlePriceDisplay = bundle.discount_type === "fixed" && bundle.fixed_price != null
                    ? bundle.fixed_price
                    : bundle.discount_percentage != null
                      ? Math.round(originalPrice * (1 - bundle.discount_percentage / 100))
                      : null;
                }
              }
            }

            return (
              <div key={idx}>
                {isFirstInBundle && (
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text-primary">{entry.bundle_name}</span>
                      <span className="rounded-full bg-surface-active px-2 py-0.5 text-caption font-medium text-text-secondary">Bundle</span>
                    </div>
                    {bundlePriceDisplay != null && (
                      <span className="text-xs font-normal text-text-secondary">AED {bundlePriceDisplay}</span>
                    )}
                  </div>
                )}
                <div className={`rounded-xl border border-border p-3 bg-surface-hover ${isInBundle && !isFirstInBundle ? "mt-1.5" : ""}`}>
                  {/* Timing toggle (After previous / Same time). Available
                      on every entry except the very first, including bundle
                      entries — so two staff can run a bundle's services
                      in parallel. */}
                  {idx > 0 && (
                    <div className="flex items-center gap-3 mb-2 pb-2 border-b border-border">
                      <span className="text-caption text-text-secondary">Timing:</span>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`timing-${idx}`}
                          checked={!entry.is_parallel}
                          onChange={() => updateEntry(idx, "is_parallel", false)}
                          className="text-text-primary focus:ring-gray-400"
                        />
                        <span className="text-caption text-text-primary">After previous</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`timing-${idx}`}
                          checked={entry.is_parallel}
                          onChange={() => updateEntry(idx, "is_parallel", true)}
                          className="text-text-primary focus:ring-gray-400"
                        />
                        <span className="text-caption text-text-primary">Same time</span>
                      </label>
                    </div>
                  )}

                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      {isInBundle ? (
                        <div className="rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 py-2 text-body-sm text-text-primary">
                          {selectedService ? getServiceName(selectedService) : "Unknown service"}
                        </div>
                      ) : (
                        <select value={entry.service_id} onChange={(e) => handleServiceSelect(idx, e.target.value)}
                          required
                          className="block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100">
                          <option value="">Select service</option>
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.duration_minutes} min, AED {s.price})
                            </option>
                          ))}
                          {bundles && bundles.length > 0 && (
                            <optgroup label="Bundles">
                              {bundles.map((b) => {
                                const originalPrice = b.service_bundle_items.reduce(
                                  (sum, item) => sum + (item.services?.price || 0), 0
                                );
                                const bundlePrice = b.discount_type === "fixed" && b.fixed_price != null
                                  ? b.fixed_price
                                  : b.discount_percentage != null
                                    ? Math.round(originalPrice * (1 - b.discount_percentage / 100))
                                    : originalPrice;
                                return (
                                  <option key={b.id} value={`bundle:${b.id}`}>
                                    {b.name} ({b.service_bundle_items.length} services, AED {bundlePrice})
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                        </select>
                      )}

                      <select value={entry.staff_id} onChange={(e) => updateEntry(idx, "staff_id", e.target.value)}
                        required
                        className="block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100">
                        <option value="">Assign staff *</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.full_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {serviceEntries.length > 1 && (
                      <button type="button" onClick={() => {
                        if (isInBundle && entry.bundle_instance_id) {
                          // Remove every entry that belongs to THIS bundle
                          // instance (not all instances of the same bundle).
                          setServiceEntries(serviceEntries.filter((e) => e.bundle_instance_id !== entry.bundle_instance_id));
                        } else {
                          removeServiceEntry(idx);
                        }
                      }}
                        className="mt-1 rounded-lg p-1 text-text-tertiary hover:bg-surface-active hover:text-text-secondary">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" onClick={addServiceEntry}
          className="mt-3 w-full rounded-xl border-[1.5px] border-dashed border-neutral-300 px-3 py-2.5 text-body-sm font-semibold text-text-secondary hover:border-neutral-400 hover:text-text-primary transition-colors">
          + Add service
        </button>

        {totalDuration > 0 && (
          <div className="mt-2 rounded-xl bg-surface-hover px-3 py-2 text-body-sm">
            <div className="flex items-center justify-between gap-2 text-text-primary">
              <div className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-semibold">
                <span>{formatTime12Short(time)} -</span>
                {editingEndTime ? (
                  <input
                    type="time"
                    autoFocus
                    // Controlled — commit on every change so durationOverride
                    // is always in sync. Previously this was uncontrolled
                    // with onBlur-only commit, which raced with the form's
                    // Save button on touch devices and saved the old value.
                    value={endTimeStr}
                    onChange={(e) => {
                      const newEndMin = timeToMinutes(e.target.value);
                      if (Number.isFinite(newEndMin) && newEndMin > startMin) {
                        setDurationOverride(newEndMin - startMin);
                      }
                    }}
                    onBlur={() => setEditingEndTime(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditingEndTime(false);
                    }}
                    className="rounded-md border-[1.5px] border-neutral-300 bg-white px-1.5 py-0.5 text-body-sm focus:border-neutral-500 focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingEndTime(true)}
                    className="rounded-md px-1 underline-offset-2 hover:bg-white hover:underline"
                    aria-label="Edit end time"
                  >
                    {formatTime12Short(endTimeStr)}
                  </button>
                )}
                <span className="text-text-secondary font-normal">({formatDuration(effectiveDuration)})</span>
                {durationOverride != null && (
                  <button
                    type="button"
                    onClick={() => setDurationOverride(null)}
                    className="text-caption font-semibold text-text-secondary hover:text-text-primary"
                    title="Reset to sum of services"
                  >
                    ↺ Reset
                  </button>
                )}
              </div>
              <span className="shrink-0 font-semibold">AED {totalPrice}</span>
            </div>
          </div>
        )}
      </div>

      {/* ---- Adjustments (collapsible) ----
           Transportation, discount, and a manual total override. Most
           appointments don't need any of these so the section starts
           collapsed; if the appointment already has any non-default
           adjustment it opens automatically. */}
      <div className="rounded-xl ring-1 ring-border bg-white">
        <button
          type="button"
          onClick={() => setAdjustmentsOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-body-sm font-semibold text-text-primary"
        >
          <span className="flex items-center gap-2">
            Adjustments
            {hasInitialAdjustment && !adjustmentsOpen && (
              <span className="rounded-full bg-primary-50 px-1.5 py-0.5 text-caption font-medium text-primary-700">applied</span>
            )}
          </span>
          <svg
            className={`h-4 w-4 text-text-tertiary transition-transform ${adjustmentsOpen ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {adjustmentsOpen && (
          <div className="space-y-4 border-t border-border px-4 py-4">
            {/* When override is filled, transport + discount are hidden
                because the override replaces them entirely. */}
            {totalOverride.trim() === "" && (
              <>
                <div>
                  <label className="block text-body-sm font-semibold text-text-primary">
                    Transportation charge <span className="font-normal text-text-tertiary">(AED)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={transportCharge}
                    onChange={(e) => setTransportCharge(e.target.value)}
                    placeholder="0"
                    className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>

                <div>
                  <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
                    Discount
                  </label>
                  <div className="flex gap-2">
                    {/* % / AED toggle */}
                    <div className="flex shrink-0 rounded-xl bg-surface-active p-0.5">
                      {(["percentage", "fixed"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDiscountType(m)}
                          className={`rounded-lg px-3 py-1.5 text-caption font-semibold transition-colors ${
                            discountType === m
                              ? "bg-white text-text-primary shadow-sm"
                              : "text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {m === "percentage" ? "%" : "AED"}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={discountType === "percentage" ? "100" : undefined}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder="0"
                      className="block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-body-sm font-semibold text-text-primary">
                Manual total override <span className="font-normal text-text-tertiary">(optional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={totalOverride}
                onChange={(e) => setTotalOverride(e.target.value)}
                placeholder="Leave blank to auto-calculate"
                className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
              <p className="mt-1.5 text-caption text-text-tertiary">
                When set, this replaces the calculated total — transportation and discount are ignored.
              </p>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-body-sm font-semibold text-text-primary">Notes</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-lg bg-surface-active px-4 py-2 text-body-sm font-semibold text-text-primary hover:bg-neutral-100">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 disabled:opacity-50">
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
