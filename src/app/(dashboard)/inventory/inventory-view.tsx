"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Modal from "@/components/modal";
import { useSearchQuery } from "@/lib/search-context";
import { useUndo } from "@/components/undo-toast";
import { useCurrency, useCurrentUser } from "@/lib/user-context";
import {
  getInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  updateInventoryQuantity,
} from "./actions";

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  low_stock_threshold: number;
  category: string;
  unit: string;
  cost_per_unit: number | null;
  notes: string | null;
  /** Migration-042 — optional team scoping. NULL = salon-wide shared. */
  team_id: string | null;
  created_at: string;
}

/** Light team_groups shape for the inventory team selector + badges. */
export interface TeamRef {
  id: string;
  name: string;
}

const CATEGORIES = [
  "Products",
  "Tools",
  "Consumables",
  "Equipment",
  "Other",
];

const UNITS = ["pcs", "bottles", "tubes", "sets", "boxes", "kg", "g", "L", "mL"];

export default function InventoryView({
  initialItems,
  initialTeams,
}: {
  initialItems: InventoryItem[];
  /** All team_groups in the salon. Empty array = single-team salon
   *  (or Solo/Team plan) → no team UI rendered. */
  initialTeams: TeamRef[];
}) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  const undo = useUndo();
  const currency = useCurrency();
  const currentUser = useCurrentUser();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStock, setFilterStock] = useState<"all" | "low" | "out">("all");

  // Team filter (Multi-Team v1.6). null = "All teams". "shared" =
  // only the salon-wide pool (team_id IS NULL). A team_group id =
  // that team's items + shared.
  //
  // Scoped admins (admin role + group_id set) are server-locked to
  // their own team + shared, so they don't get a team selector —
  // showing one would be misleading.
  const [teams] = useState<TeamRef[]>(initialTeams);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const isScopedAdmin = currentUser?.role === "admin" && !!currentUser?.group_id;
  const showTeamSelector = teams.length >= 2 && !isScopedAdmin;

  // Search query is owned by the dashboard layout's header input via
  // SearchContext — typing there filters this list automatically.
  const searchQuery = useSearchQuery();

  // Combined Category + Stock filter dropdown — opens via the funnel-icon
  // button next to "+", matching the expenses + calendar filter pattern.
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filterOpen) return;
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterOpen]);

  const hasActiveFilter = filterCategory !== "" || filterStock !== "all";

  const loadData = useCallback(async () => {
    try {
      const data = await getInventoryItems(teamFilter);
      setItems(data as InventoryItem[]);
    } catch {
      undo.error("Failed to load inventory");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamFilter]);

  // Re-fetch whenever the team filter changes (owner switching between
  // teams to inspect each one's stock).
  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = items.filter((item) => {
    if (filterCategory && item.category !== filterCategory) return false;
    if (filterStock === "low" && item.quantity > item.low_stock_threshold) return false;
    if (filterStock === "out" && item.quantity > 0) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    }
    return true;
  });

  async function handleQuickQuantity(item: InventoryItem, delta: number) {
    const newQty = Math.max(0, item.quantity + delta);
    const result = await updateInventoryQuantity(item.id, newQty);
    if (result.error) { undo.error(result.error); return; }
    loadData();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-title-page font-bold tracking-tight text-text-primary">Inventory</h1>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Team selector — Multi-Team v1.6. Only renders when the
              salon has 2+ teams AND the caller isn't a team-scoped
              admin (they're server-locked to their own team + shared,
              so a switcher would be misleading). */}
          {showTeamSelector && (
            <select
              value={teamFilter ?? ""}
              onChange={(e) => setTeamFilter(e.target.value || null)}
              className={`h-9 rounded-full px-3 text-body-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary-100 ${
                teamFilter
                  ? "bg-neutral-900 text-text-inverse border border-neutral-900"
                  : "bg-white text-text-primary border border-neutral-200 hover:border-neutral-400"
              }`}
              aria-label="Filter inventory by team"
            >
              <option value="">All teams</option>
              <option value="shared">Shared (salon-wide)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {/* Combined Category + Stock filter — funnel icon, mirrors the
              expenses + calendar filter for cross-page consistency. */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((v) => !v)}
              aria-label="Filter"
              className={`rounded-lg p-2 ${
                hasActiveFilter
                  ? "bg-surface-active text-text-primary"
                  : "text-text-tertiary hover:bg-surface-hover hover:text-text-secondary"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
            </button>

            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5">
                {/* Category section */}
                <p className="px-3 pt-2 pb-1 text-caption font-semibold uppercase tracking-wide text-text-tertiary">
                  Category
                </p>
                {[{ value: "", label: "All Categories" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))].map((opt) => (
                  <button
                    key={`cat-${opt.value || "all"}`}
                    onClick={() => setFilterCategory(opt.value)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-body-sm hover:bg-surface-hover ${
                      filterCategory === opt.value ? "text-text-primary font-semibold" : "text-text-secondary"
                    }`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                      filterCategory === opt.value ? "border-gray-900 bg-neutral-900" : "border-neutral-200"
                    }`}>
                      {filterCategory === opt.value && (
                        <svg className="h-3 w-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                    {opt.label}
                  </button>
                ))}

                <div className="my-1 border-t border-border" />

                {/* Stock section */}
                <p className="px-3 pt-2 pb-1 text-caption font-semibold uppercase tracking-wide text-text-tertiary">
                  Stock
                </p>
                {([
                  { value: "all", label: "All Stock" },
                  { value: "low", label: "Low Stock" },
                  { value: "out", label: "Out of Stock" },
                ] as const).map((opt) => (
                  <button
                    key={`stock-${opt.value}`}
                    onClick={() => setFilterStock(opt.value)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-body-sm hover:bg-surface-hover ${
                      filterStock === opt.value ? "text-text-primary font-semibold" : "text-text-secondary"
                    }`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                      filterStock === opt.value ? "border-gray-900 bg-neutral-900" : "border-neutral-200"
                    }`}>
                      {filterStock === opt.value && (
                        <svg className="h-3 w-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Desktop add button. Mobile gets a thumb-zone FAB at the
              bottom of the screen instead — see below. */}
          <button
            onClick={() => setAddModalOpen(true)}
            aria-label="Add item"
            className="hidden shrink-0 sm:flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>


      {/* Inventory List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl ring-1 ring-border bg-white px-6 py-14 text-center">
          <svg className="h-12 w-12 text-neutral-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          {items.length === 0 ? (
            <>
              <h2 className="mt-4 text-body font-semibold text-text-primary">No items yet</h2>
              <p className="mt-1 text-body-sm text-text-secondary">
                Track supplies and stock so you know when to reorder.
              </p>
              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add your first item
              </button>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-body font-semibold text-text-primary">No items match</h2>
              <p className="mt-1 text-body-sm text-text-secondary">Try a different filter or search term.</p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-2xl ring-1 ring-border bg-white divide-y divide-border">
          {filtered.map((item) => {
            const isLow = item.quantity > 0 && item.quantity <= item.low_stock_threshold;
            const isOut = item.quantity === 0;

            return (
              <div
                key={item.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-4"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Status indicator */}
                  <div className={`h-2 w-2 shrink-0 rounded-full ${
                    isOut ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-green-500"
                  }`} />

                  {/* Info — clickable to edit */}
                  <button
                    onClick={() => { setSelected(item); setEditModalOpen(true); }}
                    className="min-w-0 flex-1 text-left hover:opacity-75"
                  >
                    <p className="truncate text-body-sm font-semibold text-text-primary">{item.name}</p>
                    <p className="truncate text-caption text-text-secondary">
                      {item.category}
                      {/* Team chip — only renders when the salon has
                          2+ teams AND this row is non-shared. Keeps
                          single-team salons' rows visually clean. */}
                      {showTeamSelector && item.team_id && (
                        <>
                          {" · "}
                          <span className="inline-flex items-center rounded-full bg-primary-50 px-1.5 py-0.5 text-caption font-medium text-primary-700">
                            {teams.find((t) => t.id === item.team_id)?.name ?? "Team"}
                          </span>
                        </>
                      )}
                      {item.cost_per_unit && <> · {currency} {Number(item.cost_per_unit).toFixed(2)} per {item.unit}</>}
                    </p>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 pl-5 sm:pl-0">
                  {/* Quick quantity controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleQuickQuantity(item, -1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface-hover text-body-sm sm:h-7 sm:w-7"
                    >
                      −
                    </button>
                    <span className={`min-w-[3rem] text-center text-body-sm font-semibold ${
                      isOut ? "text-error-700" : isLow ? "text-amber-600" : "text-text-primary"
                    }`}>
                      {item.quantity} {item.unit}
                    </span>
                    <button
                      onClick={() => handleQuickQuantity(item, 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface-hover text-body-sm sm:h-7 sm:w-7"
                    >
                      +
                    </button>
                  </div>

                  {/* Stock badge */}
                  {isOut && (
                    <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-caption font-medium text-red-700">
                      Out of stock
                    </span>
                  )}
                  {isLow && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-caption font-medium text-amber-700">
                      Low stock
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Item">
        <InventoryForm
          teams={teams}
          // Hide the team picker entirely for scoped admins — server
          // forces team_id = their group anyway.
          hideTeamPicker={isScopedAdmin}
          // Pre-select the team currently in view (so adding while
          // viewing "Dubai" defaults to Dubai). "shared" → NULL.
          defaultTeamId={
            teamFilter === "shared"
              ? null
              : (teamFilter as string | null)
          }
          onSubmit={async (name, qty, threshold, category, unit, cost, notes, teamId) => {
            const result = await createInventoryItem(name, qty, threshold, category, unit, cost, notes, teamId);
            if (result.error) { undo.error(result.error); return; }
            setAddModalOpen(false);
            loadData();
          }}
          onCancel={() => setAddModalOpen(false)}
          submitLabel="Add Item"
        />
      </Modal>

      {/* Edit Modal */}
      <Modal open={editModalOpen} onClose={() => { setEditModalOpen(false); setSelected(null); }} title="Edit Item">
        {selected && (
          <InventoryForm
            defaultValues={selected}
            teams={teams}
            hideTeamPicker={isScopedAdmin}
            onSubmit={async (name, qty, threshold, category, unit, cost, notes, teamId) => {
                const result = await updateInventoryItem(selected.id, name, qty, threshold, category, unit, cost, notes, teamId);
              if (result.error) { undo.error(result.error); return; }
              setEditModalOpen(false);
              setSelected(null);
              loadData();
            }}
            onCancel={() => { setEditModalOpen(false); setSelected(null); }}
            onDelete={async () => {
              if (!confirm("Delete this item?")) return;
              const result = await deleteInventoryItem(selected.id);
              if (result.error) { undo.error(result.error); return; }
              setEditModalOpen(false);
              setSelected(null);
              loadData();
            }}
            submitLabel="Save"
          />
        )}
      </Modal>

      {/* ==== MOBILE FAB ==== */}
      <button
        type="button"
        onClick={() => setAddModalOpen(true)}
        aria-label="Add item"
        className="fixed bottom-[calc(100px+env(safe-area-inset-bottom))] right-6 z-40 sm:hidden flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-text-inverse shadow-lg active:scale-[0.97] transition-transform"
      >
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    </div>
  );
}

// ---- Inventory Form ----

function InventoryForm({
  defaultValues,
  teams,
  hideTeamPicker,
  defaultTeamId,
  onSubmit,
  onCancel,
  onDelete,
  submitLabel,
}: {
  defaultValues?: InventoryItem;
  /** All team_groups in the salon. When length >= 1 and hideTeamPicker
   *  is false, the form shows a Team picker; otherwise it's hidden. */
  teams: TeamRef[];
  /** Force-hide the team picker (used for scoped admins — the server
   *  forces team_id = their group regardless of what's submitted). */
  hideTeamPicker?: boolean;
  /** Pre-select this team when creating a new item (no defaultValues).
   *  Ignored in edit mode where defaultValues.team_id wins. */
  defaultTeamId?: string | null;
  onSubmit: (name: string, qty: number, threshold: number, category: string, unit: string, cost: number | null, notes: string, teamId: string | null) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const currency = useCurrency();
  const [name, setName] = useState(defaultValues?.name || "");
  const [quantity, setQuantity] = useState(defaultValues?.quantity?.toString() || "0");
  const [threshold, setThreshold] = useState(defaultValues?.low_stock_threshold?.toString() || "5");
  const [category, setCategory] = useState(defaultValues?.category || "Products");
  const [unit, setUnit] = useState(defaultValues?.unit || "pcs");
  const [costPerUnit, setCostPerUnit] = useState(defaultValues?.cost_per_unit?.toString() || "");
  const [notes, setNotes] = useState(defaultValues?.notes || "");
  // Team picker state. Empty string = "Shared (salon-wide)" → NULL.
  const [teamId, setTeamId] = useState<string>(
    defaultValues?.team_id ?? defaultTeamId ?? "",
  );
  const [submitting, setSubmitting] = useState(false);

  const showTeamPicker = !hideTeamPicker && teams.length >= 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    await onSubmit(
      name.trim(),
      parseInt(quantity) || 0,
      parseInt(threshold) || 5,
      category,
      unit,
      costPerUnit ? parseFloat(costPerUnit) : null,
      notes.trim(),
      // Empty string from the <select> = NULL (salon-wide shared).
      teamId || null,
    );
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Item Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Gel polish, Nail file"
          className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          required
        />
      </div>

      {/* Category + Unit */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Unit</label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Quantity + Low Stock Threshold */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Quantity</label>
          <input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Low Stock Alert</label>
          <input
            type="number"
            min="0"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
      </div>

      {/* Cost per unit */}
      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Cost per Unit ({currency}, optional)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={costPerUnit}
          onChange={(e) => setCostPerUnit(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </div>

      {/* Team — only shown for Multi-Team salons (teams.length >= 1).
          Empty value = "Shared (salon-wide)" → NULL in the DB, meaning
          every team can see + use this item. */}
      {showTeamPicker && (
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
            Team
          </label>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            <option value="">Shared (visible to all teams)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-caption text-text-tertiary">
            Shared items appear in every team&rsquo;s view; assigning a team
            scopes the stock to that team only.
          </p>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-2">
        {onDelete && (
          <button type="button" onClick={onDelete}
            className="rounded-xl border border-red-200 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-error-700 hover:bg-red-50">
            Delete
          </button>
        )}
        <div className="flex-1" />
        <button type="button" onClick={onCancel}
          className="rounded-xl bg-surface-active hover:bg-neutral-100 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-primary">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="rounded-xl bg-neutral-900 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition disabled:opacity-50">
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
