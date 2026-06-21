import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { APP_URL } from "@/lib/constants";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ url: "" });

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
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
            });
          });
        },
      },
    }
  );

  // Use the deploy-pinned APP_URL constant rather than the spoofable
  // Origin header. A malicious client passing Origin: evil.com would
  // otherwise get the OAuth code redirected to an attacker domain.
  const origin = APP_URL;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ url: data.url });
}
