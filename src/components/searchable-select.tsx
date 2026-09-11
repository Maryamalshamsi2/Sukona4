"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Small combobox: click the trigger, get a dropdown with a search
 * box at the top and a filtered option list below. Used in places
 * where a native <select> is too long to scroll comfortably (client
 * list on busy salons, service catalog with 60+ items).
 *
 * Supports both flat options and grouped ones (services + bundles).
 * A hidden <input> under the trigger participates in form
 * validation so `required` still triggers the browser's built-in
 * "please fill this in" flow.
 */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

export type SelectItems = SelectOption[] | SelectGroup[];

export default function SearchableSelect({
  value,
  onChange,
  items,
  placeholder = "Select…",
  emptyLabel,
  required = false,
  name,
  className,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  items: SelectItems;
  placeholder?: string;
  /** Text for the "no selection / clear" row at the top of the list.
   *  When omitted, no such row is shown and the user must pick a real
   *  option to close the picker. */
  emptyLabel?: string;
  required?: boolean;
  /** Optional form field name — set together with `required` so the
   *  hidden input actually participates in form validation. */
  name?: string;
  className?: string;
  /** Open + focus the search input as soon as the component mounts.
   *  Useful when the picker replaces a native select the user was
   *  about to type into. */
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Normalise to grouped shape internally so the render loop is one
  // path regardless of caller shape.
  const groups: SelectGroup[] = useMemo(() => {
    if (items.length === 0) return [];
    const first = items[0] as SelectOption | SelectGroup;
    if ("options" in first) return items as SelectGroup[];
    return [{ label: "", options: items as SelectOption[] }];
  }, [items]);

  // Derive the current selection's label for the trigger button.
  const selectedLabel = useMemo(() => {
    for (const g of groups) {
      const hit = g.options.find((o) => o.value === value);
      if (hit) return hit.label;
    }
    return "";
  }, [groups, value]);

  // Filter groups by the query. Groups with no matching options are
  // dropped so the list doesn't show an empty section header.
  const filteredGroups: SelectGroup[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        label: g.label,
        options: g.options.filter((o) => o.label.toLowerCase().includes(q)),
      }))
      .filter((g) => g.options.length > 0);
  }, [groups, query]);

  // Outside-click close.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Auto-focus the search input every time the panel opens so users
  // can start typing without a second click.
  useEffect(() => {
    if (open) {
      // Small defer so the input is mounted before we focus it.
      const id = requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    } else {
      // Reset the query on close — otherwise reopening shows stale
      // filter state and hides most of the list.
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (autoFocus) setOpen(true);
  }, [autoFocus]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 py-2 text-left text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selectedLabel ? "text-text-primary truncate" : "text-text-tertiary truncate"}>
          {selectedLabel || placeholder}
        </span>
        <svg className="h-4 w-4 shrink-0 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Hidden input so the browser's form validation notices when
          `required` is set and nothing is picked. Kept out of the
          normal tab order — the trigger button gets focus first. */}
      {required && (
        <input
          type="text"
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {
            /* controlled — external onChange updates value */
          }}
          className="pointer-events-none absolute left-0 top-full h-0 w-0 opacity-0"
          name={name}
        />
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5">
          <div className="border-b border-border p-2">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="block w-full rounded-lg border-[1.5px] border-neutral-200 bg-white px-3 py-1.5 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
            />
          </div>
          <div className="max-h-56 overflow-auto py-1">
            {emptyLabel && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className={`flex w-full items-center px-3 py-2 text-body-sm hover:bg-surface-hover ${
                  value === "" ? "text-text-primary font-semibold" : "text-text-secondary"
                }`}
              >
                {emptyLabel}
              </button>
            )}
            {filteredGroups.length === 0 && (
              <p className="px-3 py-2 text-body-sm text-text-tertiary">No matches.</p>
            )}
            {filteredGroups.map((g, gi) => (
              <div key={g.label || `g-${gi}`}>
                {g.label && (
                  <p className="px-3 pt-2 pb-1 text-caption font-semibold uppercase tracking-wide text-text-tertiary">
                    {g.label}
                  </p>
                )}
                {g.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center px-3 py-2 text-body-sm hover:bg-surface-hover ${
                      o.value === value ? "text-text-primary font-semibold" : "text-text-primary"
                    }`}
                  >
                    <span className="truncate text-left">{o.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
