import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Signup creates an auth user with BOTH email AND phone set, so the user
 * can later sign in with either.
 *
 * Supabase's public `auth.signUp` only accepts one identifier per call.
 * To set both we use the admin API (`auth.admin.createUser`) with
 * `email_confirm: true` and `phone_confirm: true` so neither sends an
 * SMS / verification email — the owner can use the app immediately.
 *
 * Before creating, we run a `check_signup_availability` RPC so we can
 * tell the user precisely which field collided (email, phone, or both)
 * instead of relying on Supabase's single-error response.
 *
 * After the admin call we follow up with `signInWithPassword` to set the
 * session cookies on the response.
 */
export async function POST(request: NextRequest) {
  const { email, phone, password, full_name } = await request.json();

  if (!email || !phone || !password || !full_name) {
    return NextResponse.json(
      { error: "Email, phone, password, and full name are all required" },
      { status: 400 }
    );
  }
  if (!phone.startsWith("+")) {
    return NextResponse.json(
      { error: "Phone must include country code (E.164), e.g. +971501234567" },
      { status: 400 }
    );
  }
  if ((password as string).length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Service role key not configured" },
      { status: 500 }
    );
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Pre-check availability so we can give precise errors when an email
  //    or phone is already registered (rather than a generic Supabase one).
  const { data: availability, error: availabilityError } =
    await adminSupabase.rpc("check_signup_availability", {
      p_email: email,
      p_phone: phone,
    });

  if (availabilityError) {
    return NextResponse.json(
      { error: availabilityError.message },
      { status: 500 }
    );
  }

  // RPC returns a single row of { email_taken, phone_taken }
  const result = Array.isArray(availability) ? availability[0] : availability;
  const emailTaken = result?.email_taken === true;
  const phoneTaken = result?.phone_taken === true;

  if (emailTaken && phoneTaken) {
    return NextResponse.json(
      {
        error:
          "An account with this email and phone already exists. Sign in instead.",
        field: "both",
      },
      { status: 409 }
    );
  }
  if (emailTaken) {
    return NextResponse.json(
      {
        error:
          "This email is already registered. Sign in or use a different email.",
        field: "email",
      },
      { status: 409 }
    );
  }
  if (phoneTaken) {
    return NextResponse.json(
      {
        error:
          "This phone number is already registered. Sign in or use a different phone.",
        field: "phone",
      },
      { status: 409 }
    );
  }

  // 2. Create the user with both email and phone, both pre-confirmed.
  //    There's a tiny race window between the availability check and this
  //    call — if it loses, Supabase will return a duplicate-key error and
  //    we surface a generic message below.
  const { error: createError } = await adminSupabase.auth.admin.createUser({
    email,
    phone,
    password,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: { full_name },
  });

  if (createError) {
    // Best-effort detection of post-race duplicates so the user still gets
    // a clear message even if our pre-check just lost the race.
    const msg = createError.message.toLowerCase();
    if (
      msg.includes("already registered") ||
      msg.includes("duplicate") ||
      msg.includes("already exists")
    ) {
      return NextResponse.json(
        { error: "This email or phone is already registered." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  // 3. Sign the user in to establish the session cookies.
  const response = NextResponse.json({ success: true });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              secure: false,
              sameSite: "lax",
            });
          });
        },
      },
    }
  );

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return NextResponse.json({ error: signInError.message }, { status: 400 });
  }

  return response;
}
