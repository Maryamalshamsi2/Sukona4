"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Modal from "@/components/modal";
import { useSearchQuery } from "@/lib/search-context";
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
  created_at: string;
}

const CATEGORIES = [
  "Products",
  "Tools",
  "Consumables",
  "Equipment",
  "Other",
];

const UNITS = ["pcs", "bottles", "tubes", "sets", "boxes", "kg", "g", "L", "mL"];

export default function InventoryView({ initialItems }: { initialItems: InventoryItem[] }) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStock, setFilterStock] = useState<"all" | "low" | "out">("all");

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
      const data = await getInventoryItems();
      setItems(data as InventoryItem[]);
    } catch {
      setError("Failed to load inventory");
    }
  }, []);

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
    if (result.error) { setError(result.error); return; }
    loadData();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-title-page font-bold tracking-tight text-text-primary">Inventory</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
            className="hidden shrink-0 sm:flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-body-sm text-error-700">{error}</p>}

      {/* Inventory List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl ring-1 ring-border bg-white px-6 py-16 text-center text-body-sm text-text-tertiary">
          No items found
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
                      {item.cost_per_unit && <> · AED {Number(item.cost_per_unit).toFixed(2)} per {item.unit}</>}
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
          onSubmit={async (name, qty, threshold, category, unit, cost, notes) => {
            setError(null);
            const result = await createInventoryItem(name, qty, threshold, category, unit, cost, notes);
            if (result.error) { setError(result.error); return; }
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
            onSubmit={async (name, qty, threshold, category, unit, cost, notes) => {
              setError(null);
              const result = await updateInventoryItem(selected.id, name, qty, threshold, category, unit, cost, notes);
              if (result.error) { setError(result.error); return; }
              setEditModalOpen(false);
              setSelected(null);
              loadData();
            }}
            onCancel={() => { setEditModalOpen(false); setSelected(null); }}
            onDelete={async () => {
              if (!confirm("Delete this item?")) return;
              const result = await deleteInventoryItem(selected.id);
              if (result.error) { setError(result.error); return; }
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
  onSubmit,
  onCancel,
  onDelete,
  submitLabel,
}: {
  defaultValues?: InventoryItem;
  onSubmit: (name: string, qty: number, threshold: number, category: string, unit: string, cost: number | null, notes: string) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(defaultValues?.name || "");
  const [quantity, setQuantity] = useState(defaultValues?.quantity?.toString() || "0");
  const [threshold, setThreshold] = useState(defaultValues?.low_stock_threshold?.toString() || "5");
  const [category, setCategory] = useState(defaultValues?.category || "Products");
  const [unit, setUnit] = useState(defaultValues?.unit || "pcs");
  const [costPerUnit, setCostPerUnit] = useState(defaultValues?.cost_per_unit?.toString() || "");
  const [notes, setNotes] = useState(defaultValues?.notes || "");
  const [submitting, setSubmitting] = useState(false);

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
      notes.trim()
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
          className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
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
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
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
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
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
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Low Stock Alert</label>
          <input
            type="number"
            min="0"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
      </div>

      {/* Cost per unit */}
      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Cost per Unit (AED, optional)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={costPerUnit}
          onChange={(e) => setCostPerUnit(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
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
          className="rounded-xl bg-neutral-900 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all disabled:opacity-50">
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
