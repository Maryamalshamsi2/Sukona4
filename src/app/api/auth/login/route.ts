import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, phone, password } = body as {
    email?: string;
    phone?: string;
    password?: string;
  };

  if (!password || (!email && !phone)) {
    return NextResponse.json(
      { error: "Email or phone and password are required" },
      { status: 400 }
    );
  }

  // Build a response we can attach cookies to
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
              // Ensure cookies work on non-HTTPS (local dev over IP)
              secure: false,
              sameSite: "lax",
            });
          });
        },
      },
    }
  );

  // Sign in with whichever identifier was provided. Supabase accepts either
  // { email, password } or { phone, password } — never both.
  const credentials = phone ? { phone, password } : { email: email!, password };
  const { error } = await supabase.auth.signInWithPassword(credentials);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  // Log the full Set-Cookie headers for debugging
  const setCookieHeaders = response.headers.getSetCookie();
  console.log("[LOGIN] Set-Cookie headers:");
  setCookieHeaders.forEach(h => console.log("  ", h.substring(0, 120)));

  return response;
}
