/**
 * POST /api/whatsapp/retry/[id]
 *
 * Re-sends a previously-failed WhatsApp message. The flow:
 *
 *   1. Auth check — only owners/admins of the same salon as the log row
 *      can retry. We use the cookie-based supabase client so RLS does
 *      the gate naturally (owner/admin select on whatsapp_send_log).
 *
 *   2. Reuse the original `template_name`, `recipient_phone`, and
 *      `variables` (the array we stored at send time). This means a
 *      retry sends the *same* message — useful when Meta was down or
 *      the customer's phone was off.
 *
 *   3. The new send writes its own log row with `retried_from = oldId`
 *      so the UI can render a chain ("retry of #abc").
 *
 * We use a route handler (not a server action) so the client-side
 * Settings → WhatsApp panel can hit it from a normal `fetch()` without
 * needing a form submission, and so we get a clean JSON response shape
 * for the inline status update.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { sendTemplate } from "@/lib/whatsapp/client";
import type { WhatsAppTemplateName } from "@/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json(
      { error: "Only owner or admin can retry" },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const { data: original, error } = await supabase
    .from("whatsapp_send_log")
    .select(
      "id, salon_id, appointment_id, template_name, recipient_phone, variables, status"
    )
    .eq("id", id)
    .single();

  if (error || !original) {
    return NextResponse.json({ error: "Log row not found" }, { status: 404 });
  }
  if (original.salon_id !== profile.salon_id) {
    // Defence in depth — RLS should have already filtered this out.
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (original.status !== "failed") {
    return NextResponse.json(
      { error: "Only failed sends can be retried" },
      { status: 400 }
    );
  }

  const variables = Array.isArray(original.variables)
    ? (original.variables as string[])
    : [];

  const result = await sendTemplate(
    original.salon_id,
    original.template_name as WhatsAppTemplateName,
    original.recipient_phone,
    variables,
    {
      appointmentId: original.appointment_id,
      retriedFrom: original.id,
    }
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.error === "NOT_CONFIGURED"
            ? "WhatsApp credentials are missing — re-add them in Settings."
            : result.errorMessage ?? "Retry failed",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    log_id: result.log_id,
    meta_message_id: result.meta_message_id,
  });
}
