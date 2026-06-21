"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTeamScope } from "@/lib/auth-server";
import { validateWebUrl } from "@/lib/url-validation";

export async function getClients() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function addClient(formData: FormData) {
  const supabase = await createClient();

  // Defense in depth: the form input has required+pattern, but a
  // direct POST / accessibility tooling / Safari autofill quirk can
  // still slip through without a phone. WhatsApp dispatch then
  // silently fails for that client forever, so enforce server-side.
  const name = ((formData.get("name") as string) || "").trim();
  const phone = ((formData.get("phone") as string) || "").trim();
  if (!name) return { error: "Name is required" };
  if (!phone) return { error: "Phone is required" };

  const address = (formData.get("address") as string) || null;
  const mapLinkResult = validateWebUrl(
    (formData.get("map_link") as string) || null,
    "Map link",
  );
  if ("error" in mapLinkResult) return { error: mapLinkResult.error };
  const mapLink = mapLinkResult.value;

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      name,
      phone,
      address,
      map_link: mapLink,
      notes: (formData.get("notes") as string) || null,
    })
    .select("id")
    .single();

  if (error || !client) return { error: error?.message ?? "Failed to add client" };

  // Migration-047: if an address or map link was provided, also
  // create the client's first saved location (label "Home",
  // default). Fire-and-forget — failure here only means the picker
  // shows nothing until the next manual add; the legacy columns
  // still hold the value for backward-compat reads.
  if (address || mapLink) {
    void supabase
      .from("client_locations")
      .insert({
        client_id: client.id,
        label: "Home",
        address,
        map_link: mapLink,
        is_default: true,
      });
  }

  revalidatePath("/clients");
  return { success: true };
}

export async function updateClient(id: string, formData: FormData) {
  const supabase = await createClient();

  const name = ((formData.get("name") as string) || "").trim();
  const phone = ((formData.get("phone") as string) || "").trim();
  if (!name) return { error: "Name is required" };
  if (!phone) return { error: "Phone is required" };

  // Only patch the fields the form actually submitted. Once Phase 3
  // lands the locations list on the edit modal, the address /
  // map_link inputs are removed from the form — we must not
  // silently NULL the legacy columns when the form didn't touch
  // them. The locations actions keep the legacy mirror in sync
  // via their own writes.
  const updates: Record<string, unknown> = {
    name,
    phone,
    notes: (formData.get("notes") as string) || null,
  };
  const hasAddress = formData.has("address");
  const hasMapLink = formData.has("map_link");
  const address = hasAddress ? (formData.get("address") as string) || null : null;
  let mapLink: string | null = null;
  if (hasMapLink) {
    const r = validateWebUrl(
      (formData.get("map_link") as string) || null,
      "Map link",
    );
    if ("error" in r) return { error: r.error };
    mapLink = r.value;
  }
  if (hasAddress) updates.address = address;
  if (hasMapLink) updates.map_link = mapLink;

  const { error } = await supabase
    .from("clients")
    .update(updates)
    .eq("id", id);
  if (error) return { error: error.message };

  // Legacy form mode (Add modal still uses the single address+map_link
  // inputs): propagate to the client's default saved location so the
  // appointment-form picker doesn't show stale data. Skipped silently
  // when the form didn't carry these fields (Edit modal in Phase 3+).
  if (hasAddress || hasMapLink) {
    void (async () => {
      const { data: defaultLoc } = await supabase
        .from("client_locations")
        .select("id")
        .eq("client_id", id)
        .eq("is_default", true)
        .maybeSingle();
      if (defaultLoc) {
        const patch: Record<string, string | null> = {};
        if (hasAddress) patch.address = address;
        if (hasMapLink) patch.map_link = mapLink;
        await supabase
          .from("client_locations")
          .update(patch)
          .eq("id", defaultLoc.id);
      } else if (address || mapLink) {
        await supabase.from("client_locations").insert({
          client_id: id,
          label: "Home",
          address,
          map_link: mapLink,
          is_default: true,
        });
      }
    })();
  }

  revalidatePath("/clients");
  return { success: true };
}

export async function deleteClient(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("clients").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/clients");
  return { success: true };
}

// Fetch all appointments for a specific client (past + upcoming, including cancelled),
// ordered by date desc, then time desc. Shaped the same as calendar's getAppointmentsForDate
// so it can feed directly into <DetailView> and <AppointmentForm>.
//
// Admin team scoping (Multi-Team v1.5 extension): a scoped admin
// (admin role + group_id set) only sees appointments where at least
// one service was performed by their team. Same rule as the calendar
// / reports / payroll filters. Owner / unscoped admin / staff see
// the unfiltered history.
export async function getClientAppointments(clientId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(`
      *,
      clients ( id, name, phone, address, map_link ),
      location:location_id ( id, label, address, map_link ),
      appointment_services (
        id,
        service_id,
        staff_id,
        is_parallel,
        sort_order,
        bundle_id,
        bundle_instance_id,
        bundle_total_price,
        bundle_name,
        services:service_id ( id, name, price, duration_minutes )
      ),
      reviews ( id, rating, comment, submitted_at )
    `)
    .eq("client_id", clientId)
    .order("date", { ascending: false })
    .order("time", { ascending: false });

  if (error) throw error;

  const { teamScope } = await getTeamScope();
  if (!teamScope) return data ?? [];

  const { data: teamStaff } = await supabase
    .from("profiles")
    .select("id")
    .eq("group_id", teamScope);
  const teamStaffIds = new Set((teamStaff ?? []).map((r) => r.id));
  return (data ?? []).filter((appt: { appointment_services?: { staff_id: string | null }[] }) => {
    const svcs = appt.appointment_services ?? [];
    return svcs.some((as) => as.staff_id && teamStaffIds.has(as.staff_id));
  });
}
