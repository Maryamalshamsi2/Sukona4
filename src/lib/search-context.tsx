"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Lightweight search state shared between the dashboard layout's header
 * input and whichever page wants to react to it. Currently consumed by
 * the expenses page; clients/inventory/etc. can opt in the same way.
 *
 * Pages that don't read from it just ignore it — typing in the header
 * is harmless if no page is listening.
 */
type SearchContextValue = {
  query: string;
  setQuery: (value: string) => void;
};

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  return (
    <SearchContext.Provider value={{ query, setQuery }}>
      {children}
    </SearchContext.Provider>
  );
}

/** Read the current search query. Returns "" if no provider is mounted. */
export function useSearchQuery(): string {
  const ctx = useContext(SearchContext);
  return ctx?.query ?? "";
}

/** Write to the search query. No-op if no provider is mounted. */
export function useSetSearchQuery(): (value: string) => void {
  const ctx = useContext(SearchContext);
  return ctx?.setQuery ?? (() => {});
}

/**
 * Controlled search input that's bound to the SearchContext. Drop it in
 * any layout's header to give every page in that layout access to the
 * query. Style classes can be passed via className.
 */
export function HeaderSearchInput({
  placeholder,
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const query = useSearchQuery();
  const setQuery = useSetSearchQuery();
  return (
    <input
      type="text"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder={placeholder ?? "Search..."}
      className={className}
    />
  );
}
