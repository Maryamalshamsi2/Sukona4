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

  // Action types where the actor shouldn't see their own action in their
  // bell (per UX spec: "only fire when someone other than the recipient
  // adjusts"). Other action types — appointment_created, status_updated,
  // etc. — are still useful as confirmations for the actor.
  const SELF_FILTERED_ACTIONS = [
    "expense_added",
    "petty_cash_added",
    "inventory_adjusted",
    "inventory_low_stock",
  ];

  // Fetch the recent activity rows + the user's last-read timestamp in
  // parallel. We over-fetch (limit*2) so the post-filter still has room
  // for `limit` items in the worst case where many were the user's own.
  const [activityRes, profileRes] = await Promise.all([
    supabase
      .from("activity_log")
      .select(
        `id, appointment_id, action, description, created_at, performed_by,
         profiles:performed_by ( full_name )`
      )
      .order("created_at", { ascending: false })
      .limit(limit * 2),
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

  const items: NotificationItem[] = (activityRes.data as Row[])
    // Skip self-actions for the filtered types (no "you added an expense" toasts).
    .filter((r) =>
      !(SELF_FILTERED_ACTIONS.includes(r.action) && r.performed_by === user.id),
    )
    .slice(0, limit)
    .map((r) => {
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
        bundle_id,
        bundle_instance_id,
        bundle_total_price,
        bundle_name,
        services:service_id ( id, name, price, duration_minutes )
      ),
      payments ( id, amount, method, note, receipt_url, created_at )
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

