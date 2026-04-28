"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Sidebar from "@/components/sidebar";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/(dashboard)/actions";
import { UserContext, type CurrentUser } from "@/lib/user-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userInitials, setUserInitials] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Initials (from auth metadata — already works without a round-trip)
      const authName = user.user_metadata?.full_name || user.email || "";
      const authParts = authName.trim().split(" ");
      if (authParts.length >= 2) {
        setUserInitials((authParts[0][0] + authParts[authParts.length - 1][0]).toUpperCase());
      } else if (authParts[0]) {
        setUserInitials(authParts[0][0].toUpperCase());
      }

      // Fetch the profile row so every descendant has access to `role`, `group_id`, and `salon_id`.
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role, full_name, group_id, salon_id")
        .eq("id", user.id)
        .single();

      if (profile) {
        setCurrentUser({
          id: profile.id,
          role: profile.role,
          full_name: profile.full_name,
          group_id: profile.group_id ?? null,
          salon_id: profile.salon_id,
        });
        // Prefer the profile's full_name for initials if it's richer than auth metadata.
        if (profile.full_name) {
          const parts = profile.full_name.trim().split(" ");
          if (parts.length >= 2) {
            setUserInitials((parts[0][0] + parts[parts.length - 1][0]).toUpperCase());
          } else if (parts[0]) {
            setUserInitials(parts[0][0].toUpperCase());
          }
        }
      }
    }
    loadUser();
  }, []);

  return (
    <UserContext.Provider value={currentUser}>
      <div className="flex h-[100dvh] flex-col overflow-hidden">
        {/* Top bar */}
        <header className="relative flex h-16 shrink-0 items-center bg-[#F5F5F7]/80 px-3 sm:h-20 sm:px-4">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="relative z-10 rounded-lg p-2 text-text-tertiary hover:text-text-secondary lg:hidden"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Logo — centered on mobile, left-aligned on desktop — click returns to dashboard */}
          <div className="absolute left-1/2 -translate-x-1/2 lg:static lg:translate-x-0 lg:flex lg:shrink-0">
            <Link href="/" aria-label="Go to dashboard" className="inline-flex transition-opacity hover:opacity-80">
              <img src="/logo-dark.png" alt="Sukona" className="h-[46px] w-auto sm:h-[50px]" />
            </Link>
          </div>

          {/* Spacer pushes search + avatar to the right */}
          <div className="flex-1" />

          {/* Search bar + User avatar (right-aligned) */}
          <div className="flex items-center gap-3">
            {/* Search bar — hidden on small mobile */}
            <div className="hidden sm:block relative">
              <svg
                className="absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-text-tertiary"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search clients, appointments..."
                className="w-56 rounded-xl border-0 bg-surface-active py-2 pl-9 pr-4 text-body-sm text-text-primary placeholder-text-tertiary transition-all focus:bg-white focus:outline-none focus:ring-1 focus:ring-neutral-200 lg:w-72"
              />
            </div>

            {/* User avatar */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-caption font-semibold text-text-inverse transition-transform hover:scale-105 active:scale-95"
              >
                {userInitials || "?"}
              </button>

              {/* Dropdown menu */}
              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 top-full z-50 mt-2 w-40 rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5">
                    <form action={signOut}>
                      <button
                        type="submit"
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-body-sm text-text-primary hover:bg-surface-hover"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                        </svg>
                        Sign out
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 overflow-hidden">
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

          {/* Page content */}
          <main className="relative flex-1 overflow-y-auto bg-[#F5F5F7] px-4 pt-3 pb-4 sm:px-6 sm:pt-4 sm:pb-6 lg:px-8 lg:pt-4 lg:pb-8">
            {children}
          </main>
        </div>
      </div>
    </UserContext.Provider>
  );
}
