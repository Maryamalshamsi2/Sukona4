"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getTeamScope } from "@/lib/auth-server";
import {
  canAddStaff,
  canAddGroup,
  maxStaff,
  maxGroups,
  PLAN_LABELS,
  type Plan,
} from "@/lib/plan";
import type { StaffSchedule, StaffDayOff } from "@/types";

// ---- TEAM GROUPS ----

export async function getGroups() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_groups")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

export async function addGroup(formData: FormData) {
  const supabase = await createClient();

  // Plan-gate: Solo/Team can only have 1 team_group, Multi-Team unlimited.
  // is_exempt salons (migration-035 — founder/demo accounts) bypass the
  // cap entirely. Returns a stable PLAN_LIMIT_REACHED error code so the
  // UI can swap in the upgrade modal instead of just showing a toast.
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" };
  const { data: salon } = await supabase
    .from("salons")
    .select("plan, is_exempt")
    .eq("id", profile.salon_id)
    .single();
  const plan = (salon?.plan as Plan | undefined) ?? "solo";
  const isExempt = !!salon?.is_exempt;
  if (!isExempt) {
    const { count } = await supabase
      .from("team_groups")
      .select("id", { count: "exact", head: true })
      .eq("salon_id", profile.salon_id);
    const currentCount = count ?? 0;
    if (!canAddGroup(plan, currentCount)) {
      const max = maxGroups(plan);
      return {
        error: `Your ${PLAN_LABELS[plan]} plan allows up to ${max} team${
          max === 1 ? "" : "s"
        }. Upgrade to Multi-Team to run multiple regional teams.`,
        code: "PLAN_LIMIT_REACHED",
      };
    }
  }

  const { error } = await supabase.from("team_groups").insert({
    name: formData.get("name") as string,
  });

  if (error) return { error: error.message };
  revalidatePath("/team");
  return { success: true };
}

export async function updateGroup(id: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("team_groups")
    .update({ name: formData.get("name") as string })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/team");
  return { success: true };
}

export async function deleteGroup(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("team_groups").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/team");
  return { success: true };
}

// ---- TEAM MEMBERS (profiles) ----

export async function getTeamMembers() {
  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select("*, team_groups(*)");

  // Admin team scoping: an admin pinned to a team only sees other
  // members in that same team (Multi-Team v1.5). Owner / unscoped
  // admin / staff see everyone (getTeamScope returns null).
  const { teamScope } = await getTeamScope();
  if (teamScope) query = query.eq("group_id", teamScope);

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

// Build an admin Supabase client (service_role). Centralised so we can
// reuse it for both creating new members and editing auth credentials of
// existing ones — both paths require bypassing RLS to write to auth.users.
async function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return {
      error:
        "Service role key not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local",
    } as const;
  }
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  return { admin } as const;
}

// Validate E.164 phone format (matches the public signup page rules)
function isValidPhone(phone: string): boolean {
  return /^\+\d{7,}$/.test(phone);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function addTeamMember(formData: FormData) {
  // Caller's salon — the new member is attached to this salon.
  const inviter = await getCurrentProfile();
  if (!inviter) return { error: "Not authenticated" };
  if (inviter.role !== "owner" && inviter.role !== "admin") {
    return { error: "Not authorized" };
  }

  const adminResult = await getAdminClient();
  if ("error" in adminResult) return { error: adminResult.error };
  const adminSupabase = adminResult.admin;

  // Plan-limit enforcement. Solo = 1 member (just the owner),
  // Team = 5, Multi-Team = unlimited. Reject before we hit Stripe
  // / Supabase to keep the failure mode clean (just an error string
  // the form surfaces). The UI gates this with an upgrade modal
  // before submission too — this is the server-side fence.
  //
  // Exempt salons (migration-035) bypass the cap entirely. They
  // have full feature access regardless of their stored plan.
  const { data: salon } = await adminSupabase
    .from("salons")
    .select("plan, is_exempt")
    .eq("id", inviter.salon_id)
    .single();

  if (salon?.plan && !salon.is_exempt) {
    const plan = salon.plan as Plan;
    const { count } = await adminSupabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("salon_id", inviter.salon_id);
    const current = count ?? 0;

    if (!canAddStaff(plan, current)) {
      const cap = maxStaff(plan);
      const capStr = cap === Infinity ? "unlimited" : `${cap}`;
      const memberWord = cap === 1 ? "member" : "members";
      return {
        error: `Your ${PLAN_LABELS[plan]} plan is limited to ${capStr} ${memberWord}. Upgrade your plan in Settings → Plan & Billing to add more.`,
      };
    }
  }

  const email = ((formData.get("email") as string) || "").trim();
  const phone = ((formData.get("phone") as string) || "").trim();
  const password = ((formData.get("password") as string) || "").trim();
  const fullName = ((formData.get("full_name") as string) || "").trim();
  const requestedRole = ((formData.get("role") as string) || "staff").trim();

  // Validation — phone + password + name are always required, email optional.
  if (!fullName) return { error: "Full name is required" };
  if (!phone) return { error: "Phone number is required" };
  if (!isValidPhone(phone)) {
    return { error: "Phone must be in international format (e.g. +971501234567)" };
  }
  if (!password) return { error: "Password is required" };
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }
  if (email && !isValidEmail(email)) {
    return { error: "Email format is invalid" };
  }

  // Pre-check duplicates so we can return precise per-field errors instead
  // of the raw "User already registered" Supabase error.
  const { data: avail, error: availErr } = await adminSupabase.rpc(
    "check_signup_availability",
    { p_email: email || null, p_phone: phone }
  );
  if (availErr) return { error: availErr.message };
  const row = Array.isArray(avail) ? avail[0] : avail;
  if (row?.email_taken) {
    return { error: "That email is already used by another member." };
  }
  if (row?.phone_taken) {
    return { error: "That phone number is already used by another member." };
  }

  // Pass salon_id and role in user_metadata so the auth trigger
  // (handle_new_user) attaches the profile to the inviter's salon
  // instead of creating a brand-new salon.
  const userMetadata = {
    full_name: fullName,
    salon_id: inviter.salon_id,
    role: requestedRole || "staff",
  };

  // When both email and phone are provided, Supabase stores both on the
  // auth row and the new staff member can sign in with either.
  const { data, error: signUpError } = await adminSupabase.auth.admin.createUser({
    email: email || undefined,
    phone,
    password,
    email_confirm: email ? true : undefined,
    phone_confirm: true,
    user_metadata: userMetadata,
  });

  if (signUpError) {
    // Translate Supabase's raw duplicate errors into per-field messages
    // so the UI stays consistent with the pre-check messages above.
    // This covers any post-race duplicate or normalization mismatch.
    const msg = signUpError.message.toLowerCase();
    if (msg.includes("phone") && (msg.includes("registered") || msg.includes("exists") || msg.includes("duplicate"))) {
      return { error: "That phone number is already used by another member." };
    }
    if (msg.includes("email") && (msg.includes("registered") || msg.includes("exists") || msg.includes("duplicate"))) {
      return { error: "That email is already used by another member." };
    }
    if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("duplicate")) {
      return { error: "That email or phone is already used by another member." };
    }
    return { error: signUpError.message };
  }

  // Update the profile with extra fields the trigger doesn't set.
  if (data.user) {
    const groupId = formData.get("group_id") as string;

    // Small delay to let the trigger create the profile
    await new Promise((r) => setTimeout(r, 500));

    // Whether the new member appears on the calendar — only meaningful
    // for staff role. The form sends "true"/"false" as a string.
    const appearsOnCalendar = (formData.get("appears_on_calendar") as string) !== "false";

    // Migration-038: commission_percent (0..100). Clamped server-side
    // so the DB CHECK constraint can never reject.
    const commissionRaw = parseFloat(formData.get("commission_percent") as string);
    const commissionPercent = Number.isFinite(commissionRaw)
      ? Math.max(0, Math.min(100, commissionRaw))
      : 0;
    // Migration-039: target_multiplier (0..50). 0 = no target.
    const targetRaw = parseFloat(formData.get("target_multiplier") as string);
    const targetMultiplier = Number.isFinite(targetRaw)
      ? Math.max(0, Math.min(50, targetRaw))
      : 0;

    await adminSupabase
      .from("profiles")
      .update({
        phone,
        email: email || null,
        job_title: (formData.get("job_title") as string) || null,
        group_id: groupId || null,
        salary: parseFloat(formData.get("salary") as string) || 0,
        commission_percent: commissionPercent,
        target_multiplier: targetMultiplier,
        appears_on_calendar: requestedRole === "staff" ? appearsOnCalendar : true,
      })
      .eq("id", data.user.id);
  }

  revalidatePath("/team");
  revalidatePath("/payroll");
  return { success: true };
}

export async function updateTeamMember(id: string, formData: FormData) {
  const supabase = await createClient();

  // Auth + role guard. Only owners can reach this page (middleware), but
  // we double-check at the action layer for defense in depth.
  const editor = await getCurrentProfile();
  if (!editor) return { error: "Not authenticated" };
  if (editor.role !== "owner") return { error: "Not authorized" };

  // Self-edit guard: when an owner edits their own row, we silently drop
  // any auth-credential changes. The UI hides those fields, but the
  // server is the source of truth — never let an owner change their own
  // password/email/phone via this flow (they have a settings page).
  const isSelf = editor.id === id;

  const groupId = formData.get("group_id") as string;
  const newEmail = ((formData.get("email") as string) || "").trim();
  const newPhone = ((formData.get("phone") as string) || "").trim();
  const newPassword = ((formData.get("password") as string) || "").trim();

  // Profile-only fields. These are always editable.
  const newRole = formData.get("role") as string;
  const appearsOnCalendar = (formData.get("appears_on_calendar") as string) !== "false";
  // Migration-038: commission_percent (0..100), clamped here so the
  // DB CHECK constraint can never reject a slightly out-of-range value.
  const commissionRaw = parseFloat(formData.get("commission_percent") as string);
  const commissionPercent = Number.isFinite(commissionRaw)
    ? Math.max(0, Math.min(100, commissionRaw))
    : 0;
  // Migration-039: target_multiplier (0..50). 0 = no target threshold.
  const targetRaw = parseFloat(formData.get("target_multiplier") as string);
  const targetMultiplier = Number.isFinite(targetRaw)
    ? Math.max(0, Math.min(50, targetRaw))
    : 0;
  const profileUpdate: Record<string, unknown> = {
    full_name: formData.get("full_name") as string,
    job_title: (formData.get("job_title") as string) || null,
    role: newRole,
    group_id: groupId || null,
    salary: parseFloat(formData.get("salary") as string) || 0,
    commission_percent: commissionPercent,
    target_multiplier: targetMultiplier,
    // Calendar visibility — only meaningful for staff role. For owner/admin
    // we force true so toggling them back to staff later doesn't surprise.
    appears_on_calendar: newRole === "staff" ? appearsOnCalendar : true,
  };

  // Auth-credential changes (only when editing someone else).
  if (!isSelf && (newEmail !== "" || newPhone !== "" || newPassword !== "")) {
    // Fetch the existing values so we know whether email/phone actually
    // changed — duplicate-check should skip "you already own this".
    const { data: existing, error: fetchErr } = await supabase
      .from("profiles")
      .select("email, phone, full_name")
      .eq("id", id)
      .single();
    if (fetchErr) return { error: fetchErr.message };

    const emailChanged = newEmail !== "" && newEmail !== (existing.email ?? "");
    const phoneChanged = newPhone !== "" && newPhone !== (existing.phone ?? "");

    // Validate format
    if (newEmail && !isValidEmail(newEmail)) {
      return { error: "Email format is invalid" };
    }
    if (phoneChanged && !isValidPhone(newPhone)) {
      return { error: "Phone must be in international format (e.g. +971501234567)" };
    }
    if (newPassword && newPassword.length < 6) {
      return { error: "Password must be at least 6 characters" };
    }

    // Duplicate check on the *new* values — but only against fields that
    // actually changed, otherwise we'd flag the user's own existing row.
    if (emailChanged || phoneChanged) {
      const adminResult = await getAdminClient();
      if ("error" in adminResult) return { error: adminResult.error };
      const adminSupabase = adminResult.admin;

      const { data: avail, error: availErr } = await adminSupabase.rpc(
        "check_signup_availability",
        {
          p_email: emailChanged ? newEmail : null,
          p_phone: phoneChanged ? newPhone : null,
        }
      );
      if (availErr) return { error: availErr.message };
      const row = Array.isArray(avail) ? avail[0] : avail;
      if (emailChanged && row?.email_taken) {
        return { error: "That email is already used by another member." };
      }
      if (phoneChanged && row?.phone_taken) {
        return { error: "That phone number is already used by another member." };
      }

      // Apply the auth-side update via the admin API. Same client.
      const authPatch: { email?: string; phone?: string; password?: string } = {};
      if (emailChanged) authPatch.email = newEmail;
      if (phoneChanged) authPatch.phone = newPhone;
      if (newPassword) authPatch.password = newPassword;

      const { error: authErr } = await adminSupabase.auth.admin.updateUserById(
        id,
        authPatch
      );
      if (authErr) {
        const msg = authErr.message.toLowerCase();
        if (msg.includes("phone") && (msg.includes("registered") || msg.includes("exists") || msg.includes("duplicate"))) {
          return { error: "That phone number is already used by another member." };
        }
        if (msg.includes("email") && (msg.includes("registered") || msg.includes("exists") || msg.includes("duplicate"))) {
          return { error: "That email is already used by another member." };
        }
        return { error: authErr.message };
      }

      // Mirror the new identifiers onto the profile row so they stay in sync.
      if (emailChanged) profileUpdate.email = newEmail;
      if (phoneChanged) profileUpdate.phone = newPhone;

      // Audit log — one entry per change, with no PII in the description.
      const performerName = editor.full_name || "Owner";
      const targetName = existing.full_name || "team member";
      const logEntries: Array<{ action: string; description: string }> = [];
      if (emailChanged) {
        logEntries.push({
          action: "credential_changed",
          description: `Updated · email for ${targetName}`,
        });
      }
      if (phoneChanged) {
        logEntries.push({
          action: "credential_changed",
          description: `Updated · phone for ${targetName}`,
        });
      }
      if (newPassword) {
        logEntries.push({
          action: "credential_changed",
          description: `Updated · password for ${targetName}`,
        });
      }
      if (logEntries.length > 0) {
        await supabase.from("activity_log").insert(
          logEntries.map((e) => ({
            appointment_id: null,
            action: e.action,
            description: e.description,
            performed_by: editor.id,
          }))
        );
      }
    } else if (newPassword) {
      // Password-only reset (no identifier change).
      const adminResult = await getAdminClient();
      if ("error" in adminResult) return { error: adminResult.error };
      const adminSupabase = adminResult.admin;

      const { error: authErr } = await adminSupabase.auth.admin.updateUserById(id, {
        password: newPassword,
      });
      if (authErr) return { error: authErr.message };

      const targetName = existing.full_name || "team member";
      await supabase.from("activity_log").insert({
        appointment_id: null,
        action: "credential_changed",
        description: `Updated · password for ${targetName}`,
        performed_by: editor.id,
      });
    }
  }

  const { error } = await supabase.from("profiles").update(profileUpdate).eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/team");
  revalidatePath("/payroll");
  return { success: true };
}

/**
 * Permanently remove a team member from the salon.
 *
 * What gets deleted:
 *   - auth.users row → cascades to profiles (setup.sql line 15)
 *   - Anything with `ON DELETE CASCADE` to profiles
 *       (appointment_staff, staff_schedules, staff_days_off,
 *        staff_adjustments)
 *
 * What survives:
 *   - Appointments (appointment_services.staff_id → SET NULL, so the
 *     appointment stays but the assignment becomes "unassigned")
 *   - Payments (tip_to_staff_id → SET NULL, so tip history is kept
 *     but no longer attributed)
 *   - Past activity_log entries (performed_by → SET NULL)
 *
 * Guards:
 *   - Caller must be owner.
 *   - Owner cannot delete themselves (would orphan the salon).
 *   - Owner cannot delete another owner (one-owner-per-salon model;
 *     we don't currently support co-owners, but the guard means a
 *     future "transfer ownership" feature won't accidentally let
 *     ownership disappear).
 *
 * Plan-limit fallout: after delete, the salon's staff count goes
 * down by 1, which may bring an over-cap salon back into compliance.
 * Nothing to do here — canAddStaff() rechecks at add-time.
 */
export async function deleteTeamMember(id: string) {
  const editor = await getCurrentProfile();
  if (!editor) return { error: "Not authenticated" };
  if (editor.role !== "owner") return { error: "Only the owner can delete members" };

  if (editor.id === id) {
    return { error: "You can't delete your own account from here." };
  }

  // Confirm the target is in the same salon and isn't another owner.
  const supabase = await createClient();
  const { data: target, error: fetchErr } = await supabase
    .from("profiles")
    .select("id, role, salon_id, full_name")
    .eq("id", id)
    .single();
  if (fetchErr || !target) return { error: "Member not found" };
  if (target.salon_id !== editor.salon_id) {
    return { error: "Not authorized" };
  }
  if (target.role === "owner") {
    return { error: "Can't delete a salon owner." };
  }

  // Delete from auth.users via the admin (service-role) client. The
  // cascade chain handles the rest: profile → schedules → adjustments →
  // appointment_staff links. The supabase-js admin call removes the
  // auth row first, which also revokes any active sessions for that
  // user (they're immediately signed out everywhere).
  const adminResult = await getAdminClient();
  if ("error" in adminResult) return { error: adminResult.error };
  const adminSupabase = adminResult.admin;

  const { error: delErr } = await adminSupabase.auth.admin.deleteUser(id);
  if (delErr) return { error: delErr.message };

  // Audit log — no appointment_id, just a salon-level record.
  await supabase.from("activity_log").insert({
    appointment_id: null,
    action: "team_member_deleted",
    description: `Removed · ${target.full_name || "team member"}`,
    performed_by: editor.id,
  });

  revalidatePath("/team");
  revalidatePath("/payroll");
  revalidatePath("/calendar");
  return { success: true };
}

// ---- STAFF SCHEDULES ----

export async function getStaffSchedules(profileId: string): Promise<StaffSchedule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_schedules")
    .select("*")
    .eq("profile_id", profileId)
    .order("day_of_week", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function upsertStaffSchedules(
  profileId: string,
  schedules: Array<{
    day_of_week: number;
    is_day_off: boolean;
    start_time: string | null;
    end_time: string | null;
  }>
) {
  const supabase = await createClient();

  const rows = schedules.map((s) => ({
    profile_id: profileId,
    day_of_week: s.day_of_week,
    is_day_off: s.is_day_off,
    start_time: s.is_day_off ? null : s.start_time,
    end_time: s.is_day_off ? null : s.end_time,
  }));

  const { error } = await supabase
    .from("staff_schedules")
    .upsert(rows, { onConflict: "profile_id,day_of_week" });

  if (error) return { error: error.message };
  revalidatePath("/team");
  return { success: true };
}

// ---- STAFF DAYS OFF ----

export async function getStaffDaysOff(profileId: string): Promise<StaffDayOff[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_days_off")
    .select("*")
    .eq("profile_id", profileId)
    .order("date", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function addStaffDayOff(profileId: string, date: string, reason: string | null) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("staff_days_off")
    .insert({ profile_id: profileId, date, reason: reason || null });

  if (error) return { error: error.message };
  revalidatePath("/team");
  return { success: true };
}

export async function deleteStaffDayOff(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("staff_days_off").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/team");
  return { success: true };
}
