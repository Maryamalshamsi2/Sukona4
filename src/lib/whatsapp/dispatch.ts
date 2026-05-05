/**
 * High-level "dispatch" helpers — one per app event. Callers just say
 * "this appointment was created" or "this appointment was paid" and we
 * do the joined SQL fetch + variable formatting + sendTemplate() call.
 *
 * Why not put this in templates.ts? templates.ts knows variable order
 * but knows nothing about the database schema. Keeping the read-from-DB
 * step here means templates.ts stays a pure function module that's easy
 * to unit-test, and dispatch.ts stays the single place where "what
 * fields go into which template" lives.
 *
 * All dispatch functions are fire-and-forget from the caller's view:
 *   - They never throw — failures are logged and swallowed.
 *   - They short-circuit silently when the customer has no phone or the
 *     salon hasn't configured WABA (NOT_CONFIGURED).
 *   - The actual API call is async; the caller awaits us so the send
 *     log row is written before the request returns, but server actions
 *     don't fail because WhatsApp is slow / down.
 */

"use server";

import { createClient } from "@supabase/supabase-js";
import {
  sendAppointmentConfirmation,
  sendAppointmentUpdated,
  sendAppointmentCancelled,
  sendStaffOnTheWay,
  sendStaffArrived,
  sendPaymentPaid,
} from "./templates";
import type { SendTemplateResult } from "./client";

/** Service-role client — bypasses RLS so dispatch works for any caller role. */
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface AppointmentContext {
  appointmentId: string;
  salonId: string;
  salonName: string;
  salonPhone: string;
  clientName: string | null;
  clientPhone: string | null;
  date: string;
  time: string;
  services: Array<{ name: string }>;
  receiptToken: string | null;
  reviewToken: string | null;
}

/**
 * Single source of truth for the data shape every template needs.
 * Returns null when the appointment isn't found OR the customer doesn't
 * have a phone (no point sending).
 */
async function getAppointmentContext(
  appointmentId: string
): Promise<AppointmentContext | null> {
  const supabase = adminClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      id, salon_id, date, time, receipt_token, review_token,
      clients ( name, phone ),
      appointment_services (
        services:service_id ( name )
      )
    `
    )
    .eq("id", appointmentId)
    .single();

  if (error || !data) return null;

  // The joined client/services come back as either {} or an array
  // depending on Supabase's inference — normalize both.
  const client = Array.isArray(data.clients) ? data.clients[0] : data.clients;
  const services = (data.appointment_services ?? [])
    .map((row: { services: { name: string } | { name: string }[] | null }) => {
      const s = Array.isArray(row.services) ? row.services[0] : row.services;
      return s ? { name: s.name } : null;
    })
    .filter((x): x is { name: string } => x !== null);

  if (!client?.phone) return null;

  // Fetch the salon name + display phone in a second query (cheap, and
  // keeps the appointments select simple).
  const { data: salon } = await supabase
    .from("salons")
    .select("name, contact_phone")
    .eq("id", data.salon_id)
    .single();

  if (!salon) return null;

  return {
    appointmentId: data.id,
    salonId: data.salon_id,
    salonName: salon.name,
    salonPhone: salon.contact_phone ?? "",
    clientName: client.name ?? null,
    clientPhone: client.phone,
    date: data.date,
    time: data.time,
    services,
    receiptToken: data.receipt_token ?? null,
    reviewToken: data.review_token ?? null,
  };
}

/**
 * Wrap a dispatch in a try/catch + NOT_CONFIGURED short-circuit.
 * Every public dispatch* function below funnels through this so we
 * never crash a server action because of WhatsApp.
 */
async function safeDispatch(
  label: string,
  fn: () => Promise<SendTemplateResult>
): Promise<SendTemplateResult> {
  try {
    const r = await fn();
    if (!r.ok && r.error === "NOT_CONFIGURED") {
      // Salon hasn't connected WABA yet — completely fine, not an error.
      return r;
    }
    return r;
  } catch (err) {
    console.error(`[whatsapp.dispatch:${label}]`, err);
    return {
      ok: false,
      error: "INTERNAL",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------
// Public dispatchers
// ---------------------------------------------------------------------

export async function dispatchAppointmentConfirmation(
  appointmentId: string
): Promise<SendTemplateResult> {
  return safeDispatch("appointment_confirmation", async () => {
    const ctx = await getAppointmentContext(appointmentId);
    if (!ctx) return { ok: false, error: "NO_CONTEXT" };
    return sendAppointmentConfirmation({
      salonId: ctx.salonId,
      toPhone: ctx.clientPhone!,
      appointmentId: ctx.appointmentId,
      salonName: ctx.salonName,
      salonPhone: ctx.salonPhone,
      customerName: ctx.clientName,
      date: ctx.date,
      time: ctx.time,
      services: ctx.services,
    });
  });
}

export async function dispatchAppointmentUpdated(
  appointmentId: string
): Promise<SendTemplateResult> {
  return safeDispatch("appointment_updated", async () => {
    const ctx = await getAppointmentContext(appointmentId);
    if (!ctx) return { ok: false, error: "NO_CONTEXT" };
    return sendAppointmentUpdated({
      salonId: ctx.salonId,
      toPhone: ctx.clientPhone!,
      appointmentId: ctx.appointmentId,
      salonName: ctx.salonName,
      salonPhone: ctx.salonPhone,
      customerName: ctx.clientName,
      date: ctx.date,
      time: ctx.time,
      services: ctx.services,
    });
  });
}

export async function dispatchAppointmentCancelled(
  appointmentId: string
): Promise<SendTemplateResult> {
  return safeDispatch("appointment_cancelled", async () => {
    const ctx = await getAppointmentContext(appointmentId);
    if (!ctx) return { ok: false, error: "NO_CONTEXT" };
    return sendAppointmentCancelled({
      salonId: ctx.salonId,
      toPhone: ctx.clientPhone!,
      appointmentId: ctx.appointmentId,
      salonName: ctx.salonName,
      salonPhone: ctx.salonPhone,
      customerName: ctx.clientName,
      date: ctx.date,
      time: ctx.time,
    });
  });
}

export async function dispatchStaffOnTheWay(
  appointmentId: string
): Promise<SendTemplateResult> {
  return safeDispatch("staff_on_the_way", async () => {
    const ctx = await getAppointmentContext(appointmentId);
    if (!ctx) return { ok: false, error: "NO_CONTEXT" };
    return sendStaffOnTheWay({
      salonId: ctx.salonId,
      toPhone: ctx.clientPhone!,
      appointmentId: ctx.appointmentId,
      salonName: ctx.salonName,
      customerName: ctx.clientName,
    });
  });
}

export async function dispatchStaffArrived(
  appointmentId: string
): Promise<SendTemplateResult> {
  return safeDispatch("staff_arrived", async () => {
    const ctx = await getAppointmentContext(appointmentId);
    if (!ctx) return { ok: false, error: "NO_CONTEXT" };
    return sendStaffArrived({
      salonId: ctx.salonId,
      toPhone: ctx.clientPhone!,
      appointmentId: ctx.appointmentId,
      salonName: ctx.salonName,
      customerName: ctx.clientName,
    });
  });
}

/**
 * Sends after status flips to 'paid'. Requires both tokens to exist on
 * the appointment row — they're minted in `recordPayment()` before the
 * status transition, so they should always be present, but we guard
 * anyway and skip silently if missing.
 */
export async function dispatchPaymentPaid(
  appointmentId: string
): Promise<SendTemplateResult> {
  return safeDispatch("payment_paid", async () => {
    const ctx = await getAppointmentContext(appointmentId);
    if (!ctx) return { ok: false, error: "NO_CONTEXT" };
    if (!ctx.receiptToken || !ctx.reviewToken) {
      return { ok: false, error: "MISSING_TOKENS" };
    }
    return sendPaymentPaid({
      salonId: ctx.salonId,
      toPhone: ctx.clientPhone!,
      appointmentId: ctx.appointmentId,
      salonName: ctx.salonName,
      customerName: ctx.clientName,
      receiptToken: ctx.receiptToken,
      reviewToken: ctx.reviewToken,
    });
  });
}
