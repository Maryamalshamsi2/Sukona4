"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCurrentUser, type UserRole } from "@/lib/user-context";
import { signOut } from "@/app/(dashboard)/actions";

/**
 * Mobile bottom tab bar.
 *
 * Replaces the hamburger → drawer pattern with a permanent thumb-zone
 * navigation strip. Hidden on lg+ screens (where the sidebar lives).
 *
 * Four tabs for all roles: Home / Calendar / Catalog / More. The More
 * tab opens a bottom sheet listing the remaining destinations
 * (Clients, Team, Expenses, Inventory, Reports, Settings, Sign Out),
 * filtered by the user's role so staff don't see Team/Reports/Clients.
 */

type Icon = "home" | "calendar" | "catalog" | "more" | "users" | "team" | "receipt" | "package" | "chart" | "settings" | "logout";

type MoreItem = {
  href?: string;
  label: string;
  icon: Icon;
  allow: UserRole[];
  /** When true, render as a button that triggers signOut instead of a link. */
  signOut?: boolean;
};

const MORE_ITEMS: MoreItem[] = [
  { href: "/clients",   label: "Clients",   icon: "users",    allow: ["owner", "admin"] },
  { href: "/team",      label: "Team",      icon: "team",     allow: ["owner"] },
  { href: "/expenses",  label: "Expenses",  icon: "receipt",  allow: ["owner", "admin", "staff"] },
  { href: "/inventory", label: "Inventory", icon: "package",  allow: ["owner", "admin", "staff"] },
  { href: "/reports",   label: "Reports",   icon: "chart",    allow: ["owner"] },
  { href: "/settings",  label: "Settings",  icon: "settings", allow: ["owner", "admin", "staff"] },
  { signOut: true,      label: "Sign out",  icon: "logout",   allow: ["owner", "admin", "staff"] },
];

const PRIMARY_TABS: Array<{ href: string; label: string; icon: Icon }> = [
  { href: "/",         label: "Home",     icon: "home" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/catalog",  label: "Catalog",  icon: "catalog" },
];

function NavIcon({ icon, className }: { icon: Icon; className?: string }) {
  const cls = className ?? "h-6 w-6";
  switch (icon) {
    case "home":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      );
    case "catalog":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
        </svg>
      );
    case "more":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <circle cx="5" cy="12" r="1.25" fill="currentColor" />
          <circle cx="12" cy="12" r="1.25" fill="currentColor" />
          <circle cx="19" cy="12" r="1.25" fill="currentColor" />
        </svg>
      );
    case "users":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      );
    case "team":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      );
    case "receipt":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      );
    case "package":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      );
    case "chart":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      );
    case "settings":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "logout":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
        </svg>
      );
  }
}

export default function BottomTabBar() {
  const pathname = usePathname();
  const user = useCurrentUser();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the More sheet on route change so navigation feels snappy.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Lock body scroll while the sheet is open so the underlying page
  // doesn't scroll behind it.
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  const visibleMoreItems = user?.role
    ? MORE_ITEMS.filter((item) => item.allow.includes(user.role))
    : [];

  // The More tab is "active" when the current route belongs to one of
  // the items inside the sheet (e.g. /expenses, /settings).
  const moreActive = visibleMoreItems.some(
    (item) => item.href && (item.href === pathname || pathname.startsWith(item.href + "/"))
  );

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-white lg:hidden">
        <div className="flex pb-[env(safe-area-inset-bottom)]">
          {PRIMARY_TABS.map((tab) => {
            const isActive =
              tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-1 flex-col items-center gap-0.5 py-2 active:opacity-60"
                aria-current={isActive ? "page" : undefined}
              >
                <NavIcon
                  icon={tab.icon}
                  className={`h-6 w-6 ${isActive ? "text-text-primary" : "text-text-tertiary"}`}
                />
                <span
                  className={`text-[11px] leading-tight ${
                    isActive ? "font-semibold text-text-primary" : "text-text-tertiary"
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}

          {/* More — opens a bottom sheet */}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 active:opacity-60"
            aria-expanded={moreOpen}
          >
            <NavIcon
              icon="more"
              className={`h-6 w-6 ${moreActive ? "text-text-primary" : "text-text-tertiary"}`}
            />
            <span
              className={`text-[11px] leading-tight ${
                moreActive ? "font-semibold text-text-primary" : "text-text-tertiary"
              }`}
            >
              More
            </span>
          </button>
        </div>
      </nav>

      {/* More sheet (mobile only). Backdrop dismisses; the sheet itself
          slides up from the bottom with a small grabber. */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMoreOpen(false)}
            aria-hidden
          />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl">
            <div className="px-6 pt-3 pb-2">
              <div className="mx-auto h-1 w-10 rounded-full bg-neutral-300" />
            </div>
            <ul className="px-2 pb-3">
              {visibleMoreItems.map((item) => {
                const isActive =
                  item.href &&
                  (item.href === pathname || pathname.startsWith(item.href + "/"));
                const inner = (
                  <>
                    <NavIcon
                      icon={item.icon}
                      className={`h-5 w-5 ${
                        item.signOut ? "text-error-500" : isActive ? "text-text-primary" : "text-text-secondary"
                      }`}
                    />
                    <span
                      className={`flex-1 text-body ${
                        item.signOut ? "text-error-500" : isActive ? "font-semibold text-text-primary" : "text-text-primary"
                      }`}
                    >
                      {item.label}
                    </span>
                  </>
                );

                if (item.signOut) {
                  return (
                    <li key="signout">
                      <form action={signOut}>
                        <button
                          type="submit"
                          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left active:bg-surface-active"
                        >
                          {inner}
                        </button>
                      </form>
                    </li>
                  );
                }

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href!}
                      className="flex items-center gap-3 rounded-xl px-4 py-3 active:bg-surface-active"
                    >
                      {inner}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
