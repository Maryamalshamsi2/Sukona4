"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { validateWebUrl } from "@/lib/url-validation";

/**
 * Multi-location client server actions (migration-047).
 *
 * Owner/admin only for writes; reads are open to any authed user
 * (matches the RLS on client_locations — staff need SELECT for the
 * appointment-form picker).
 *
 * Setting a default is a two-step operation because the partial
 * unique index `idx_client_locations_one_default` rejects two
 * is_default=true rows for the same client. We clear the previous
 * default first, then mark the new one. If the first step succeeds
 * and the second fails the client transiently has no default — the
 * owner can re-mark one. Acceptable risk for v1; could be tightened
 * with a SECURITY DEFINER function later if it bites.
 */

async function requireOwnerOrAdmin() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" } as const;
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Not authorized" } as const;
  }
  return { profile };
}

async function requireAuthed() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" } as const;
  return { profile };
}

// ============================================================
// Read
// ============================================================

/** List a client's saved locations. Default first (so the picker
 *  pre-selects it), then most-recently-added. */
export async function listClientLocations(clientId: string) {
  const gate = await requireAuthed();
  if ("error" in gate) return [];
  if (!clientId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_locations")
    .select("*")
    .eq("client_id", clientId)
    // Default first via is_default DESC (true sorts above false).
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listClientLocations failed:", error);
    return [];
  }
  return data ?? [];
}

// ============================================================
// Create / update / delete
// ============================================================

interface AddLocationPayload {
  clientId: string;
  label: string;
  address: string | null;
  mapLink: string | null;
  isDefault: boolean;
}

function validateLocation(p: {
  label: string;
  address: string | null;
  mapLink: string | null;
}): string | null {
  // Allow blank label (picker falls back to address). But at least one
  // of label/address must be non-blank — a row with both empty is
  // meaningless.
  if (!p.label.trim() && !(p.address ?? "").trim()) {
    return "Enter a label or an address";
  }
  // map_link gets rendered as <a href={...}> on the appointment
  // detail and possibly redirected from the public review page. Lock
  // it to http/https so an owner can't paste a javascript: URL that
  // would fire on the customer's device.
  if (p.mapLink !== null && p.mapLink.trim()) {
    const r = validateWebUrl(p.mapLink, "Map link");
    if ("error" in r) return r.error;
  }
  return null;
}

/** Add a saved location to a client. If isDefault=true, clears any
 *  previous default first (two-step, see file header). */
export async function addClientLocation(payload: AddLocationPayload) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const v = validateLocation(payload);
  if (v) return { error: v };
  if (!payload.clientId) return { error: "Missing client id" };

  const supabase = await createClient();

  // If this row is being inserted as the new default, clear the
  // previous default first to satisfy the partial unique index.
  if (payload.isDefault) {
    const { error: clearErr } = await supabase
      .from("client_locations")
      .update({ is_default: false })
      .eq("client_id", payload.clientId)
      .eq("is_default", true);
    if (clearErr) return { error: clearErr.message };
  }

  // If this is the client's FIRST location, force is_default=true
  // regardless of what the caller passed — a client should always
  // have a default if it has any locations at all.
  let isDefault = payload.isDefault;
  if (!isDefault) {
    const { count } = await supabase
      .from("client_locations")
      .select("id", { count: "exact", head: true })
      .eq("client_id", payload.clientId);
    if ((count ?? 0) === 0) isDefault = true;
  }

  const { data, error: insertErr } = await supabase
    .from("client_locations")
    .insert({
      salon_id: gate.profile.salon_id,
      client_id: payload.clientId,
      label: payload.label.trim(),
      address: payload.address?.trim() || null,
      map_link: payload.mapLink?.trim() || null,
      is_default: isDefault,
    })
    .select()
    .single();

  if (insertErr) return { error: insertErr.message };

  // If this is the (new) default, keep the legacy clients.address
  // / clients.map_link in sync as a read backward-compat mirror.
  // Will be removed once every read site is migrated.
  if (isDefault) {
    void supabase
      .from("clients")
      .update({
        address: payload.address?.trim() || null,
        map_link: payload.mapLink?.trim() || null,
      })
      .eq("id", payload.clientId);
  }

  revalidatePath("/clients");
  revalidatePath("/calendar");
  revalidatePath("/");
  return { success: true, location: data } as const;
}

interface UpdateLocationPayload {
  label: string;
  address: string | null;
  mapLink: string | null;
}

export async function updateClientLocation(
  id: string,
  payload: UpdateLocationPayload,
) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const v = validateLocation(payload);
  if (v) return { error: v };

  const supabase = await createClient();

  // Fetch first so we know the client_id + whether this row is the
  // current default (for the legacy mirror update below). Pull
  // salon_id too so we can defense-in-depth tenancy check below —
  // RLS already blocks cross-salon writes, but an explicit assertion
  // means a future RLS misconfiguration during a migration doesn't
  // immediately become a tenancy bypass.
  const { data: existing, error: fetchErr } = await supabase
    .from("client_locations")
    .select("client_id, is_default, salon_id")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) return { error: "Location not found" };
  if (existing.salon_id !== gate.profile.salon_id) {
    return { error: "Location not found" };
  }

  const { error: updErr } = await supabase
    .from("client_locations")
    .update({
      label: payload.label.trim(),
      address: payload.address?.trim() || null,
      map_link: payload.mapLink?.trim() || null,
    })
    .eq("id", id);

  if (updErr) return { error: updErr.message };

  // Legacy mirror: if this is the default location, propagate to
  // clients.address / clients.map_link for backward-compat reads.
  if (existing.is_default) {
    void supabase
      .from("clients")
      .update({
        address: payload.address?.trim() || null,
        map_link: payload.mapLink?.trim() || null,
      })
      .eq("id", existing.client_id);
  }

  revalidatePath("/clients");
  revalidatePath("/calendar");
  revalidatePath("/");
  return { success: true };
}

/** Make the given location the client's default. Two-step swap so
 *  the partial unique index never sees two true rows at once. */
export async function setDefaultLocation(clientId: string, locationId: string) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };
  if (!clientId || !locationId) return { error: "Missing ids" };

  const supabase = await createClient();

  // Tenancy fence: confirm the client belongs to the caller's salon
  // before we mutate any of their locations. RLS catches it too, but
  // an explicit check returns a clean "Client not found" instead of
  // a confusing 0-row update that silently succeeds.
  const { data: clientRow } = await supabase
    .from("clients")
    .select("salon_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!clientRow || clientRow.salon_id !== gate.profile.salon_id) {
    return { error: "Client not found" };
  }

  // 1. Clear the existing default (if any).
  const { error: clearErr } = await supabase
    .from("client_locations")
    .update({ is_default: false })
    .eq("client_id", clientId)
    .eq("is_default", true);
  if (clearErr) return { error: clearErr.message };

  // 2. Mark the new one.
  const { data: newDefault, error: setErr } = await supabase
    .from("client_locations")
    .update({ is_default: true })
    .eq("id", locationId)
    .eq("client_id", clientId)
    .select("address, map_link")
    .single();
  if (setErr) return { error: setErr.message };

  // Legacy mirror — keep clients.address / clients.map_link aligned
  // with the new default during the rollout.
  if (newDefault) {
    void supabase
      .from("clients")
      .update({
        address: newDefault.address,
        map_link: newDefault.map_link,
      })
      .eq("id", clientId);
  }

  revalidatePath("/clients");
  revalidatePath("/calendar");
  revalidatePath("/");
  return { success: true };
}

/** Delete a saved location. If it was the default AND other
 *  locations exist, promote the next-most-recent one to default so
 *  the client never sits with locations-but-no-default. */
export async function deleteClientLocation(id: string) {
  const gate = await requireOwnerOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();

  // Snapshot so we know whether to promote a replacement default.
  // salon_id selected for the defense-in-depth tenancy assertion.
  const { data: existing, error: fetchErr } = await supabase
    .from("client_locations")
    .select("client_id, is_default, salon_id")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) return { error: "Location not found" };
  if (existing.salon_id !== gate.profile.salon_id) {
    return { error: "Location not found" };
  }

  const { error: delErr } = await supabase
    .from("client_locations")
    .delete()
    .eq("id", id);
  if (delErr) return { error: delErr.message };

  if (existing.is_default) {
    // Find a replacement (most-recently-added other row for this client).
    const { data: candidate } = await supabase
      .from("client_locations")
      .select("id, address, map_link")
      .eq("client_id", existing.client_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (candidate) {
      await supabase
        .from("client_locations")
        .update({ is_default: true })
        .eq("id", candidate.id);
      // Legacy mirror to the new default.
      void supabase
        .from("clients")
        .update({
          address: candidate.address,
          map_link: candidate.map_link,
        })
        .eq("id", existing.client_id);
    } else {
      // No remaining locations — clear the legacy mirror columns.
      void supabase
        .from("clients")
        .update({ address: null, map_link: null })
        .eq("id", existing.client_id);
    }
  }

  revalidatePath("/clients");
  revalidatePath("/calendar");
  revalidatePath("/");
  return { success: true };
}
