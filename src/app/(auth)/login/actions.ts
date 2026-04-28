"use server";

import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const email = (formData.get("email") as string) || "";
  const phone = (formData.get("phone") as string) || "";

  if (!password || (!email && !phone)) {
    return { error: "Email or phone and password are required" };
  }

  const credentials = phone ? { phone, password } : { email, password };
  const { error } = await supabase.auth.signInWithPassword(credentials);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
