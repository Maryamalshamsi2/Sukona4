"use client";

import { createContext, useContext } from "react";

export type UserRole = "owner" | "admin" | "staff";

export interface CurrentUser {
  id: string;
  role: UserRole;
  full_name: string;
  group_id: string | null;
  salon_id: string;
  /** ISO 4217 code from the salons row (migration 030). Default 'AED'. */
  currency: string;
}

/**
 * Convenience hook for reading just the salon's currency code.
 * Falls back to 'AED' when the user isn't loaded yet so currency-
 * dependent renders don't flash undefined during the first paint.
 */
export function useCurrency(): string {
  const u = useContext(UserContext);
  return u?.currency || "AED";
}

/**
 * Dashboard-wide current-user context.
 * Populated once by `(dashboard)/layout.tsx` on mount; any descendant
 * component (Sidebar, pages, DetailView wrappers) can read it to gate UI.
 */
export const UserContext = createContext<CurrentUser | null>(null);

export function useCurrentUser(): CurrentUser | null {
  return useContext(UserContext);
}

// ------ Role-based permission helpers (UI) ------

export function canAccessTeam(role: UserRole | undefined | null): boolean {
  return role === "owner";
}

export function canAccessReports(role: UserRole | undefined | null): boolean {
  return role === "owner";
}

export function canEditCatalog(role: UserRole | undefined | null): boolean {
  return role === "owner" || role === "admin";
}

export function canCreateAppointments(role: UserRole | undefined | null): boolean {
  return role === "owner" || role === "admin";
}

export function canEditAppointments(role: UserRole | undefined | null): boolean {
  // Staff can only change status + cancel (handled in DetailView), not the time/services.
  return role === "owner" || role === "admin";
}

export function canViewPrivateExpenses(role: UserRole | undefined | null): boolean {
  return role === "owner";
}
