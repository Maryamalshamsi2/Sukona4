"use client";

import { useEffect, useState, useCallback } from "react";
import Modal from "@/components/modal";
import {
  getInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  updateInventoryQuantity,
} from "./actions";

interface InventoryItem {
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

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStock, setFilterStock] = useState<"all" | "low" | "out">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = useCallback(async () => {
    try {
      const data = await getInventoryItems();
      setItems(data as InventoryItem[]);
    } catch {
      setError("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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

  const lowStockCount = items.filter((i) => i.quantity > 0 && i.quantity <= i.low_stock_threshold).length;
  const outOfStockCount = items.filter((i) => i.quantity === 0).length;

  async function handleQuickQuantity(item: InventoryItem, delta: number) {
    const newQty = Math.max(0, item.quantity + delta);
    const result = await updateInventoryQuantity(item.id, newQty);
    if (result.error) { setError(result.error); return; }
    loadData();
  }

  if (loading) return <p className="mt-8 text-center text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Inventory</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {items.length} item{items.length !== 1 ? "s" : ""}
            {lowStockCount > 0 && (
              <span className="ml-2 text-amber-600">· {lowStockCount} low stock</span>
            )}
            {outOfStockCount > 0 && (
              <span className="ml-2 text-red-600">· {outOfStockCount} out of stock</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 sm:px-4"
        >
          + Add Item
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          placeholder="Search items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filterStock}
          onChange={(e) => setFilterStock(e.target.value as "all" | "low" | "out")}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="all">All Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
      </div>

      {/* Inventory List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center text-sm text-gray-400">
          No items found
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {filtered.map((item) => {
            const isLow = item.quantity > 0 && item.quantity <= item.low_stock_threshold;
            const isOut = item.quantity === 0;

            return (
              <div
                key={item.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-4"
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
                    <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="truncate text-xs text-gray-500">
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
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-100 text-sm sm:h-7 sm:w-7"
                    >
                      −
                    </button>
                    <span className={`min-w-[3rem] text-center text-sm font-semibold ${
                      isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-gray-900"
                    }`}>
                      {item.quantity} {item.unit}
                    </span>
                    <button
                      onClick={() => handleQuickQuantity(item, 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-100 text-sm sm:h-7 sm:w-7"
                    >
                      +
                    </button>
                  </div>

                  {/* Stock badge */}
                  {isOut && (
                    <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
                      Out of stock
                    </span>
                  )}
                  {isLow && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Gel polish, Nail file"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          required
        />
      </div>

      {/* Category + Unit */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
          <input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Alert</label>
          <input
            type="number"
            min="0"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>

      {/* Cost per unit */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Cost per Unit (AED, optional)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={costPerUnit}
          onChange={(e) => setCostPerUnit(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-2">
        {onDelete && (
          <button type="button" onClick={onDelete}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
            Delete
          </button>
        )}
        <div className="flex-1" />
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
