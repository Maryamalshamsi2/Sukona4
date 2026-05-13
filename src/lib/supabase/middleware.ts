import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isHardBlocked, type SubscriptionStatus } from "@/lib/plan";

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

  // Anon routing:
  //   /               → rewrite to /landing (marketing page at the root
  //                     URL; URL stays "/" in the address bar)
  //   /landing        → allow through
  //   public routes   → allow (login / signup / auth / api / r / receipt)
  //   anything else   → redirect to /login
  // /r/* is the public review page and /receipt/* is the public receipt
  // page — anyone with a token can access them, so they must NOT redirect
  // to login.
  if (!user) {
    const path = request.nextUrl.pathname;
    if (path === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/landing";
      return NextResponse.rewrite(url);
    }
    const isPublic =
      path.startsWith("/landing") ||
      path.startsWith("/login") ||
      path.startsWith("/signup") ||
      path.startsWith("/auth/") ||
      path.startsWith("/api/") ||
      path.startsWith("/r/") ||
      path.startsWith("/receipt/") ||
      // Legal pages — needed for anonymous visitors who arrived from
      // the landing page footer or external links. They live in the
      // (marketing) route group so they share the public canvas.
      path.startsWith("/terms") ||
      path.startsWith("/privacy") ||
      path.startsWith("/refund");
    if (!isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  // Authed user lands on /landing? Bounce them to their dashboard so
  // they don't see marketing chrome on top of their actual app.
  if (user && request.nextUrl.pathname.startsWith("/landing")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Onboarding + subscription + role guard. We fetch the profile (joined
  // with the salon's is_onboarded + billing fields) at most once per
  // request, and only when the user is authenticated and the path isn't
  // a fully-bypassed route (login / signup / auth / API).
  if (user) {
    const pathname = request.nextUrl.pathname;

    // Bypass-everything paths: never block, never redirect from these.
    // API routes are bypassed so the Stripe checkout/webhook/portal
    // routes work even for a hard-blocked salon (otherwise the user
    // can't pay to unblock themselves).
    const isBypassed =
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup") ||
      pathname.startsWith("/auth/") ||
      pathname.startsWith("/api/");

    if (!isBypassed) {
      const isOnboarding = pathname.startsWith("/onboarding");
      // Paths the user is allowed to reach even when hard-blocked:
      //   - /settings/billing → owner pays here
      //   - /paused           → admin/staff land here (read-only
      //                          "ask your owner" screen)
      //   - /onboarding       → half-signed-up flow not yet billed
      const allowedWhileBlocked =
        pathname.startsWith("/settings/billing") ||
        pathname.startsWith("/paused") ||
        isOnboarding;

      const ownerOnlyPrefixes = ["/team", "/reports"];
      const nonStaffPrefixes = ["/clients"];
      const needsOwner = ownerOnlyPrefixes.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
      );
      const blockStaff = nonStaffPrefixes.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
      );

      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "role, salons!inner(is_onboarded, subscription_status, trial_ends_at)"
        )
        .eq("id", user.id)
        .single();

      if (profile) {
        // @ts-expect-error — supabase-js types salons!inner as an array
        const salon = profile.salons as {
          is_onboarded: boolean;
          subscription_status: SubscriptionStatus;
          trial_ends_at: string | null;
        } | null;

        // Onboarding redirect: highest priority. If the salon isn't
        // onboarded yet, push the user to /onboarding regardless of
        // anything else.
        if (!isOnboarding && salon?.is_onboarded === false) {
          const url = request.nextUrl.clone();
          url.pathname = "/onboarding";
          return NextResponse.redirect(url);
        }

        // Hard-block: trial expired OR sub past_due/canceled/incomplete.
        // The user can still reach /settings/billing (owner pays),
        // /paused (admin/staff see the "ask your owner" screen),
        // /onboarding (half-signed-up), plus all API routes (so the
        // checkout flow works). Everything else redirects to a
        // role-appropriate destination: owners → billing page (they
        // can fix it); non-owners → /paused (they can't, so we tell
        // them to contact the owner instead of dumping them on the
        // "Only the salon owner can manage billing" page).
        if (
          salon &&
          salon.is_onboarded &&
          !allowedWhileBlocked &&
          isHardBlocked(salon.subscription_status, salon.trial_ends_at)
        ) {
          const url = request.nextUrl.clone();
          url.pathname =
            profile.role === "owner" ? "/settings/billing" : "/paused";
          return NextResponse.redirect(url);
        }

        // Owner-only URL guard.
        if (needsOwner && profile.role !== "owner") {
          const url = request.nextUrl.clone();
          url.pathname = "/";
          return NextResponse.redirect(url);
        }

        // Non-staff URL guard (e.g. /clients — staff don't see
        // customer data).
        if (blockStaff && profile.role === "staff") {
          const url = request.nextUrl.clone();
          url.pathname = "/";
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return supabaseResponse;
}
