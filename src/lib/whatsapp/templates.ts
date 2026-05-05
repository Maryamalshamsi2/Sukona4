/**
 * Typed wrappers around `sendTemplate()` — one function per Meta-approved
 * template. The wrappers exist so callers can't accidentally pass vars
 * in the wrong order (the Cloud API doesn't validate variable order; if
 * you swap {{3}} and {{4}} the customer just gets a weirdly worded
 * message). Each wrapper takes a named-field object and formats vars
 * using the helpers in `./format`.
 *
 * v1 templates (locked + ready for Meta Template Manager submission):
 *
 *   1. appointment_confirmation  — sent on appointment create
 *   2. appointment_updated       — sent on material update (date/time/service)
 *   3. appointment_cancelled     — sent on cancel
 *   4. staff_on_the_way          — sent when status flips to on_the_way
 *   5. staff_arrived             — sent when status flips to arrived
 *   6. payment_paid              — sent when an appointment is fully paid
 *                                  (carries receipt + review URLs)
 *
 * Callers should:
 *   - Pass a clean phone number (E.164 with or without "+" — the client
 *     strips non-digits anyway).
 *   - Pass `appointmentId` so the audit log links the row.
 *   - Tolerate `{ ok: false, error: 'NOT_CONFIGURED' }` and fall back to
 *     wa.me / no-op as appropriate.
 */

import { sendTemplate, type SendTemplateResult } from "./client";
import {
  firstName,
  formatDateLong,
  formatServiceSummary,
  formatTime12,
} from "./format";
import { APP_URL } from "@/lib/constants";

interface BaseArgs {
  salonId: string;
  toPhone: string;
  appointmentId?: string | null;
  retriedFrom?: string | null;
}

interface AppointmentArgs extends BaseArgs {
  salonName: string;
  /** Salon contact phone shown in the message body (display-formatted). */
  salonPhone: string;
  customerName: string | null | undefined;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM (24h) */
  time: string;
  /** Service rows as stored in the appointment. */
  services: Array<{ name: string }>;
}

/**
 * 1. Appointment confirmation — fires when an appointment is created.
 *
 * Body:
 *   Hello {{2}}! Your appointment with {{1}} is confirmed for {{3}} at {{4}}.
 *
 *   Service:
 *   {{5}}
 *
 *   Need to change anything? Contact us at {{6}}.
 */
export function sendAppointmentConfirmation(
  args: AppointmentArgs
): Promise<SendTemplateResult> {
  return sendTemplate(
    args.salonId,
    "appointment_confirmation",
    args.toPhone,
    [
      args.salonName, // {{1}}
      firstName(args.customerName), // {{2}}
      formatDateLong(args.date), // {{3}}
      formatTime12(args.time), // {{4}}
      formatServiceSummary(args.services), // {{5}}
      args.salonPhone, // {{6}}
    ],
    { appointmentId: args.appointmentId, retriedFrom: args.retriedFrom }
  );
}

/**
 * 2. Appointment updated — fires when date/time/service materially changes.
 *
 * Body:
 *   Hello {{2}}, your appointment with {{1}} has been updated.
 *
 *   Time: {{3}} at {{4}}
 *   Service:
 *   {{5}}
 *
 *   Need to change anything? Contact us at {{6}}.
 */
export function sendAppointmentUpdated(
  args: AppointmentArgs
): Promise<SendTemplateResult> {
  return sendTemplate(
    args.salonId,
    "appointment_updated",
    args.toPhone,
    [
      args.salonName,
      firstName(args.customerName),
      formatDateLong(args.date),
      formatTime12(args.time),
      formatServiceSummary(args.services),
      args.salonPhone,
    ],
    { appointmentId: args.appointmentId, retriedFrom: args.retriedFrom }
  );
}

interface CancelArgs extends BaseArgs {
  salonName: string;
  salonPhone: string;
  customerName: string | null | undefined;
  date: string;
  time: string;
}

/**
 * 3. Appointment cancelled.
 *
 * Body:
 *   Hello {{2}}, your appointment with {{1}} on {{3}} at {{4}} has been
 *   cancelled.
 *
 *   To reschedule, please contact us at {{5}}.
 */
export function sendAppointmentCancelled(
  args: CancelArgs
): Promise<SendTemplateResult> {
  return sendTemplate(
    args.salonId,
    "appointment_cancelled",
    args.toPhone,
    [
      args.salonName, // {{1}}
      firstName(args.customerName), // {{2}}
      formatDateLong(args.date), // {{3}}
      formatTime12(args.time), // {{4}}
      args.salonPhone, // {{5}}
    ],
    { appointmentId: args.appointmentId, retriedFrom: args.retriedFrom }
  );
}

interface StaffArrivalArgs extends BaseArgs {
  salonName: string;
  customerName: string | null | undefined;
}

/**
 * 4. Staff on the way — "prepare yourself" nudge.
 *
 * Body:
 *   Hello {{1}}! The staff from {{2}} is on the way and will arrive
 *   shortly. See you soon!
 */
export function sendStaffOnTheWay(
  args: StaffArrivalArgs
): Promise<SendTemplateResult> {
  return sendTemplate(
    args.salonId,
    "staff_on_the_way",
    args.toPhone,
    [
      firstName(args.customerName), // {{1}}
      args.salonName, // {{2}}
    ],
    { appointmentId: args.appointmentId, retriedFrom: args.retriedFrom }
  );
}

/**
 * 5. Staff arrived — "open the door" nudge.
 *
 * Body:
 *   Hello {{1}}! The staff from {{2}} have arrived.
 */
export function sendStaffArrived(
  args: StaffArrivalArgs
): Promise<SendTemplateResult> {
  return sendTemplate(
    args.salonId,
    "staff_arrived",
    args.toPhone,
    [
      firstName(args.customerName), // {{1}}
      args.salonName, // {{2}}
    ],
    { appointmentId: args.appointmentId, retriedFrom: args.retriedFrom }
  );
}

interface PaymentPaidArgs extends BaseArgs {
  salonName: string;
  customerName: string | null | undefined;
  /** Token from appointments.receipt_token. URL is built here. */
  receiptToken: string;
  /** Token from appointments.review_token. URL is built here. */
  reviewToken: string;
}

/**
 * 6. Payment paid — sent when an appointment is fully paid. Carries the
 * receipt link AND the review prompt in one message (single template
 * keeps the customer experience tidy).
 *
 * Body:
 *   Thank you, {{1}}! We hope you enjoyed your service with {{2}}.
 *
 *   We'd love your feedback: https://sukona.com/r/{{4}}
 *
 *   Receipt: https://sukona.com/receipt/{{3}}
 *
 * NOTE: The literal "https://sukona.com/" prefix is baked into the
 * Meta-approved template (URL buttons / parameterised URLs aren't used
 * for v1; we just send the *token* and Meta substitutes it into the
 * template's static URL prefix). If APP_URL is overridden via env, that
 * affects the wa.me fallback only — the customer-visible URL is whatever
 * you submitted to Meta. Keep `APP_URL` in sync with the template's
 * URL prefix when you ship.
 */
export function sendPaymentPaid(
  args: PaymentPaidArgs
): Promise<SendTemplateResult> {
  // Strip the path/host parts so we send just the token. Meta templates
  // store the prefix; we substitute the variable portion only.
  return sendTemplate(
    args.salonId,
    "payment_paid",
    args.toPhone,
    [
      firstName(args.customerName), // {{1}}
      args.salonName, // {{2}}
      args.receiptToken, // {{3}}
      args.reviewToken, // {{4}}
    ],
    { appointmentId: args.appointmentId, retriedFrom: args.retriedFrom }
  );
}

/**
 * Re-export APP_URL so callers using these helpers in client components
 * (for the wa.me fallback path) can grab the same constant.
 */
export { APP_URL };
