"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
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
  const { data, error } = await supabase
    .from("profiles")
    .select("*, team_groups(*)")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function addTeamMember(formData: FormData) {
  // Caller's salon — the new member is attached to this salon.
  const inviter = await getCurrentProfile();
  if (!inviter) return { error: "Not authenticated" };
  if (inviter.role !== "owner" && inviter.role !== "admin") {
    return { error: "Not authorized" };
  }

  // Use the Supabase admin client (service_role key) to create users
  // without logging out the current user
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return { error: "Service role key not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local" };
  }

  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const authMethod = ((formData.get("auth_method") as string) || "email").trim();
  const email = ((formData.get("email") as string) || "").trim();
  const phone = ((formData.get("phone") as string) || "").trim();
  const password = (formData.get("password") as string).trim();
  const fullName = (formData.get("full_name") as string).trim();
  const requestedRole = ((formData.get("role") as string) || "staff").trim();

  if (!password || !fullName) {
    return { error: "Password and full name are required" };
  }
  if (authMethod === "phone" && !phone) {
    return { error: "Phone number is required" };
  }
  if (authMethod === "email" && !email) {
    return { error: "Email is required" };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }

  // Pass salon_id and role in user_metadata so the auth trigger
  // (handle_new_user) attaches the profile to the inviter's salon
  // instead of creating a brand-new salon.
  const userMetadata = {
    full_name: fullName,
    salon_id: inviter.salon_id,
    role: requestedRole || "staff",
  };

  // Create the user via admin API (doesn't affect current session).
  // Supabase accepts either email or phone (not both) when creating a user.
  const createUserPayload =
    authMethod === "phone"
      ? {
          phone,
          password,
          phone_confirm: true,
          user_metadata: userMetadata,
        }
      : {
          email,
          password,
          email_confirm: true,
          user_metadata: userMetadata,
        };

  const { data, error: signUpError } =
    await adminSupabase.auth.admin.createUser(createUserPayload);

  if (signUpError) {
    return { error: signUpError.message };
  }

  // Update the profile with extra fields the trigger doesn't set.
  if (data.user) {
    const groupId = formData.get("group_id") as string;

    // Small delay to let the trigger create the profile
    await new Promise((r) => setTimeout(r, 500));

    // Always store phone on the profile if provided (phone is also the
    // auth identifier in phone mode). The trigger has already set
    // role + salon_id from metadata.
    await adminSupabase
      .from("profiles")
      .update({
        phone: phone || null,
        job_title: (formData.get("job_title") as string) || null,
        group_id: groupId || null,
        salary: parseFloat(formData.get("salary") as string) || 0,
      })
      .eq("id", data.user.id);
  }

  revalidatePath("/team");
  return { success: true };
}

export async function updateTeamMember(id: string, formData: FormData) {
  const supabase = await createClient();

  const groupId = formData.get("group_id") as string;

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: formData.get("full_name") as string,
      phone: (formData.get("phone") as string) || null,
      job_title: (formData.get("job_title") as string) || null,
      role: formData.get("role") as string,
      group_id: groupId || null,
      salary: parseFloat(formData.get("salary") as string) || 0,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/team");
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
