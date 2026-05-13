import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { signOut } from "@/app/(dashboard)/actions";
import { isHardBlocked, type SubscriptionStatus } from "@/lib/plan";

/**
 * /paused — what admin and staff see when their salon's trial has
 * expired (or the subscription has otherwise lapsed) and they have
 * no way to fix it themselves. Only the owner can manage billing,
 * so the right outcome for non-owners is to tell them "ask your
 * owner" with the owner's contact info one tap away — not to dump
 * them on /settings/billing which they can't use.
 *
 * Middleware routes hard-blocked non-owners here. The page itself
 * also guards against direct navigation:
 *   - Unauthenticated → redirect to /login
 *   - Salon not actually blocked → redirect to /
 *   - User is the owner → redirect to /settings/billing (they
 *     should be handling it, not staring at this page)
 */
export default async function PausedPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  // Salon billing + owner_id (we'll fetch owner profile below)
  const { data: salon } = await supabase
    .from("salons")
    .select("name, subscription_status, trial_ends_at, owner_id")
    .eq("id", profile.salon_id)
    .single();

  if (!salon) redirect("/login");

  // Salon is in good standing — user shouldn't be here.
  if (
    !isHardBlocked(
      salon.subscription_status as SubscriptionStatus,
      salon.trial_ends_at,
    )
  ) {
    redirect("/");
  }

  // Owner needs to fix billing themselves.
  if (profile.role === "owner") {
    redirect("/settings/billing");
  }

  // Fetch the owner's profile for contact info — name, email, phone.
  // If owner_id is null (data weirdness), we gracefully show "your
  // salon owner" without contact links.
  const { data: owner } = salon.owner_id
    ? await supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("id", salon.owner_id)
        .single()
    : { data: null };

  const ownerName = owner?.full_name?.trim() || "your salon owner";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-8 bg-gradient-to-br from-violet-50 via-white to-violet-100/60">
      <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/70 px-6 py-10 shadow-xl backdrop-blur-xl sm:px-10 sm:py-12">
        {/* Logo */}
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png" alt="Sukona" className="h-[40px] w-auto sm:h-[44px]" />
        </div>

        {/* Pause icon + headline */}
        <div className="mt-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <svg
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 5.25v13.5m-7.5-13.5v13.5"
              />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-text-primary">
            {salon.name || "Your salon"} is paused
          </h1>
          <p className="mt-2 text-body-sm text-text-secondary">
            The free trial has ended. Ask {ownerName} to choose a plan to
            reactivate Sukona for your team.
          </p>
        </div>

        {/* Owner contact card — only show contact links when the owner
            has the corresponding fields. Tap-to-message / tap-to-call. */}
        {(owner?.email || owner?.phone) && (
          <div className="mt-8 rounded-2xl border border-neutral-200 bg-white/80 p-5">
            <div className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
              Contact your owner
            </div>
            <div className="mt-3 space-y-2">
              <div className="text-body font-semibold text-text-primary">
                {ownerName}
              </div>
              {owner?.email && (
                <a
                  href={`mailto:${owner.email}`}
                  className="flex items-center gap-2.5 text-body-sm text-text-secondary transition hover:text-text-primary"
                >
                  <svg
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                    />
                  </svg>
                  {owner.email}
                </a>
              )}
              {owner?.phone && (
                <a
                  href={`tel:${owner.phone}`}
                  className="flex items-center gap-2.5 text-body-sm text-text-secondary transition hover:text-text-primary"
                >
                  <svg
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                    />
                  </svg>
                  {owner.phone}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Sign out — not strictly needed (their session is fine) but
            useful if they want to sign in with a different account or
            close down for the day. */}
        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-xl bg-surface-active px-4 py-3 text-body-sm font-semibold text-text-primary transition hover:bg-neutral-100"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
