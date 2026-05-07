"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface NotificationItem {
  id: string;
  appointment_id: string | null;
  action: string;
  description: string;
  created_at: string;
  performed_by_name: string | null;
}

/**
 * Notifications for the bell icon. Returns the most recent
 * activity_log rows in the user's salon plus the unread count
 * (rows newer than the user's `notifications_last_read_at`).
 *
 * RLS already constrains activity_log to the user's salon, so we
 * don't need to filter by salon_id here.
 */
export async function getNotifications(limit = 20): Promise<{
  items: NotificationItem[];
  unreadCount: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], unreadCount: 0 };

  // Fetch the recent activity rows + the user's last-read timestamp in
  // parallel.
  const [activityRes, profileRes] = await Promise.all([
    supabase
      .from("activity_log")
      .select(
        `id, appointment_id, action, description, created_at, performed_by,
         profiles:performed_by ( full_name )`
      )
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("profiles")
      .select("notifications_last_read_at")
      .eq("id", user.id)
      .single(),
  ]);

  if (activityRes.error) {
    return { items: [], unreadCount: 0 };
  }

  const lastRead =
    profileRes.data?.notifications_last_read_at ?? "1970-01-01T00:00:00Z";

  type Row = {
    id: string;
    appointment_id: string | null;
    action: string;
    description: string;
    created_at: string;
    performed_by: string | null;
    profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  };

  const items: NotificationItem[] = (activityRes.data as Row[]).map((r) => {
    // PostgREST may return the joined profile as either an object or a
    // single-element array depending on relationship cardinality.
    const performer = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      appointment_id: r.appointment_id,
      action: r.action,
      description: r.description,
      created_at: r.created_at,
      performed_by_name: performer?.full_name ?? null,
    };
  });

  // Unread count is bounded by the page size — for v1 that's fine.
  // If we hit the limit we show "20+" client-side.
  const unreadCount = items.filter((i) => i.created_at > lastRead).length;

  return { items, unreadCount };
}

/**
 * Mark notifications as read by stamping the user's profile with the
 * current timestamp. Called when the bell dropdown is opened.
 */
export async function markNotificationsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({ notifications_last_read_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function getCurrentUserProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();
  return data;
}

export async function getTodayAppointments(date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(`
      *,
      clients ( id, name, phone, address, map_link ),
      appointment_services (
        id,
        service_id,
        staff_id,
        is_parallel,
        sort_order,
        services:service_id ( id, name, price, duration_minutes )
      ),
      payments ( id, receipt_url, created_at )
    `)
    .eq("date", date)
    .neq("status", "cancelled")
    .order("time", { ascending: true });

  if (error) throw error;
  return data;
}

export async function getRecentActivities(fromDate?: string) {
  const supabase = await createClient();

  let query = supabase
    .from("activity_log")
    .select(`
      id,
      action,
      description,
      old_value,
      new_value,
      created_at,
      performed_by,
      profiles:performed_by ( full_name )
    `)
    .order("created_at", { ascending: false });

  if (fromDate) {
    query = query.gte("created_at", fromDate);
  }

  query = query.limit(100);

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

