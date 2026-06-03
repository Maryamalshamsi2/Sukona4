"use server";

import { createClient } from "@/lib/supabase/server";

export type UserRole = "owner" | "admin" | "staff";

export interface CurrentProfile {
  id: string;
  role: UserRole;
  salon_id: string;
  full_name: string;
  /** team_group the user is assigned to. Drives the per-admin
   *  team scoping (Multi-Team v1.5). NULL = not scoped. */
  group_id: string | null;
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
    .select("id, role, salon_id, full_name, group_id")
    .eq("id", user.id)
    .single();
  if (!data) return null;
  return {
    id: data.id,
    role: data.role as UserRole,
    salon_id: data.salon_id,
    full_name: data.full_name ?? "",
    group_id: data.group_id ?? null,
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

/**
 * Resolve the caller's team-scope rule.
 *
 * Multi-Team v1.5: admins can be pinned to a single team_group so they
 * only see/manage that team's data. This helper centralises the
 * "what team should this caller's queries be filtered to?" decision so
 * every server action applies the rule identically.
 *
 *   - Owner          → null (no scope; sees everything)
 *   - Admin w/ group → that group_id
 *   - Admin no group → null (backward compat — pre-feature admins
 *                            continue to see everything)
 *   - Staff          → null (their own appointment-level RLS already
 *                            applies; team scoping is for admins)
 *   - Unauthenticated→ null (caller should reject before this matters)
 *
 * Use the returned `teamScope` inside server actions like:
 *
 *   const { profile, teamScope } = await getTeamScope();
 *   if (teamScope) query = query.eq("group_id", teamScope);
 */
export async function getTeamScope(): Promise<{
  profile: CurrentProfile | null;
  teamScope: string | null;
}> {
  const profile = await getCurrentProfile();
  if (!profile) return { profile: null, teamScope: null };
  if (profile.role === "admin" && profile.group_id) {
    return { profile, teamScope: profile.group_id };
  }
  return { profile, teamScope: null };
}
