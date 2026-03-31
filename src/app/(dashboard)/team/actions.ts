"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const email = (formData.get("email") as string).trim();
  const password = (formData.get("password") as string).trim();
  const fullName = (formData.get("full_name") as string).trim();

  if (!email || !password || !fullName) {
    return { error: "Email, password, and full name are required" };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }

  // Create the user via admin API (doesn't affect current session)
  const { data, error: signUpError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (signUpError) {
    return { error: signUpError.message };
  }

  // Update the profile with extra fields
  if (data.user) {
    const groupId = formData.get("group_id") as string;
    const role = formData.get("role") as string;

    // Small delay to let the trigger create the profile
    await new Promise((r) => setTimeout(r, 500));

    await adminSupabase
      .from("profiles")
      .update({
        phone: (formData.get("phone") as string) || null,
        job_title: (formData.get("job_title") as string) || null,
        role: role || "staff",
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
