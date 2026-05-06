import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              // Allow cookies over plain HTTP (local dev via IP address)
              secure: false,
              sameSite: "lax",
            })
          );
        },
      },
    }
  );

  // Refresh the session — important for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not logged in and not on an auth page, redirect to login.
  // /r/* is the public review page and /receipt/* is the public receipt
  // page — anyone with a token can access them, so they must NOT redirect
  // to login.
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/signup") &&
    !request.nextUrl.pathname.startsWith("/auth/") &&
    !request.nextUrl.pathname.startsWith("/api/") &&
    !request.nextUrl.pathname.startsWith("/r/") &&
    !request.nextUrl.pathname.startsWith("/receipt/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Onboarding + role guard. We fetch the profile (joined with the salon's
  // is_onboarded flag) at most once per request, only when the user is
  // authenticated and the path isn't an auth/onboarding/api route.
  if (user) {
    const pathname = request.nextUrl.pathname;

    // Paths that don't require onboarding to be complete (the onboarding
    // page itself, auth flows, the API surface).
    const skipOnboardingCheck =
      pathname.startsWith("/onboarding") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup") ||
      pathname.startsWith("/auth/") ||
      pathname.startsWith("/api/");

    const ownerOnlyPrefixes = ["/team", "/reports"];
    // Routes hidden from staff (admins + owners can still see them).
    const nonStaffPrefixes = ["/clients"];
    const needsOwner = ownerOnlyPrefixes.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
    const blockStaff = nonStaffPrefixes.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );

    if (!skipOnboardingCheck || needsOwner || blockStaff) {
      // Single combined fetch — avoids two round-trips for the common case
      // of an authenticated dashboard request.
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, salons!inner(is_onboarded)")
        .eq("id", user.id)
        .single();

      // Onboarding redirect: any authenticated user whose salon hasn't been
      // onboarded yet gets pushed to /onboarding (the owner is the only one
      // who can complete it; staff/admin will see a stub there).
      if (
        !skipOnboardingCheck &&
        profile &&
        // @ts-expect-error — supabase-js types this as an array but with !inner it's a single row
        profile.salons?.is_onboarded === false
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding";
        return NextResponse.redirect(url);
      }

      // Owner-only URL guard.
      if (needsOwner && profile?.role !== "owner") {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
      }

      // Non-staff URL guard (e.g. /clients — staff don't see customer data).
      if (blockStaff && profile?.role === "staff") {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
