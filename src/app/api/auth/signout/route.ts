import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/signout
 *
 * Sign-out endpoint reachable from anywhere (including the
 * onboarding page, which has no header chrome and no signOut
 * server-action form). Previously the only way to log out was via
 * the dashboard layout / settings / paused pages — but middleware
 * redirects unfinished onboarders away from all of them, leaving
 * them with no escape if they signed up with the wrong account.
 *
 * Calls supabase.auth.signOut() through the SSR cookie adapter so
 * the auth cookies are cleared on the response, then returns 200.
 * Client is expected to navigate to /login afterwards.
 */
export async function POST(request: NextRequest) {
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
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
            });
          });
        },
      },
    },
  );

  // signOut deletes the auth row server-side AND triggers the
  // cookie adapter above to clear the sb-* cookies. The Local
  // scope is sufficient — we don't need to invalidate other
  // sessions the user has open on different devices.
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    console.error("[signout] supabase signOut failed:", error.message);
    // Even on error, return success and let the client navigate to
    // /login. The cookies have probably been cleared anyway, and
    // a 500 here just confuses the user who clicked Sign out.
  }
  return response;
}
