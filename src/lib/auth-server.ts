"use server";

import { createClient } from "@/lib/supabase/server";

export type UserRole = "owner" | "admin" | "staff";

export interface CurrentProfile {
  id: string;
  role: UserRole;
  salon_id: string;
  full_name: string;
}

/**
 * Resolve the current user's profile (id, role, salon_id, full_name).
 * Returns null if unauthenticated or profile missing.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, role, salon_id, full_name")
    .eq("id", user.id)
    .single();
  if (!data) return null;
  return {
    id: data.id,
    role: data.role as UserRole,
    salon_id: data.salon_id,
    full_name: data.full_name ?? "",
  };
}

/**
 * Resolve just the current user's role. Returns null if unauthenticated.
 * Convenience wrapper around `getCurrentProfile`.
 */
export async function getCurrentRole(): Promise<UserRole | null> {
  const profile = await getCurrentProfile();
  return profile?.role ?? null;
}

/**
 * Resolve the current user's salon_id. Returns null if unauthenticated
 * or not yet assigned to a salon.
 */
export async function getCurrentSalonId(): Promise<string | null> {
  const profile = await getCurrentProfile();
  return profile?.salon_id ?? null;
}

/**
 * Guard a server action: returns `{ ok: true }` if the current user's role
 * is in `allowed`, otherwise `{ ok: false, error }`. Use inside mutation
 * server actions to prevent direct API calls from bypassing the UI.
 *
 * Usage:
 *   const guard = await requireRole(["owner", "admin"]);
 *   if (!guard.ok) return { error: guard.error };
 */
export async function requireRole(
  allowed: UserRole[]
): Promise<{ ok: true; role: UserRole } | { ok: false; error: string }> {
  const role = await getCurrentRole();
  if (!role) return { ok: false, error: "Not authenticated" };
  if (!allowed.includes(role)) return { ok: false, error: "Not authorized" };
  return { ok: true, role };
}
