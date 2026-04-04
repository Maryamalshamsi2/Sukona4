"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Modal from "@/components/modal";
import { createBrowserClient } from "@supabase/ssr";
import { getExpenses, createExpense, updateExpense, deleteExpense } from "./actions";

interface Expense {
  id: string;
  description: string;
  amount: number;
  expense_type: string;
  date: string;
  time: string | null;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
}

const EXPENSE_TYPES = [
  "Supplies",
  "Equipment",
  "Rent",
  "Utilities",
  "Transportation",
  "Marketing",
  "Salary",
  "Training",
  "Other",
];

function formatCurrency(amount: number) {
  return `AED ${amount.toFixed(2)}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime12(time24: string) {
  const [h, m] = time24.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${m} ${ampm}`;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [filterType, setFilterType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = useCallback(async () => {
    try {
      const data = await getExpenses();
      setExpenses(data as Expense[]);
    } catch {
      setError("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = expenses.filter((e) => {
    if (filterType && e.expense_type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return e.description.toLowerCase().includes(q) || e.expense_type.toLowerCase().includes(q);
    }
    return true;
  });

  const totalAmount = filtered.reduce((sum, e) => sum + Number(e.amount), 0);

  if (loading) return <p className="mt-8 text-center text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Expenses</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Total: {formatCurrency(totalAmount)} · {filtered.length} expense{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 sm:px-4"
        >
          + Add Expense
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          placeholder="Search expenses..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="">All Types</option>
          {EXPENSE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Expense List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center text-sm text-gray-400">
          No expenses found
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {filtered.map((expense) => (
            <button
              key={expense.id}
              onClick={() => { setSelected(expense); setEditModalOpen(true); }}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
            >
              {/* Type badge */}
              <span className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                {expense.expense_type}
              </span>

              {/* Description */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{expense.description}</p>
                <p className="text-xs text-gray-500">
                  {formatDate(expense.date)}
                  {expense.time && <> · {formatTime12(expense.time)}</>}
                </p>
              </div>

              {/* Receipt indicator */}
              {expense.receipt_url && (
                <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
              )}

              {/* Amount */}
              <span className="shrink-0 text-sm font-semibold text-gray-900">
                {formatCurrency(Number(expense.amount))}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Add Modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Expense">
        <ExpenseForm
          onSubmit={async (desc, amount, type, date, time, notes, receiptUrl) => {
            setError(null);
            const result = await createExpense(desc, amount, type, date, time, notes, receiptUrl);
            if (result.error) { setError(result.error); return; }
            setAddModalOpen(false);
            loadData();
          }}
          onCancel={() => setAddModalOpen(false)}
          submitLabel="Add Expense"
        />
      </Modal>

      {/* Edit Modal */}
      <Modal open={editModalOpen} onClose={() => { setEditModalOpen(false); setSelected(null); }} title="Edit Expense">
        {selected && (
          <ExpenseForm
            defaultValues={selected}
            onSubmit={async (desc, amount, type, date, time, notes, receiptUrl) => {
              setError(null);
              const result = await updateExpense(selected.id, desc, amount, type, date, time, notes, receiptUrl);
              if (result.error) { setError(result.error); return; }
              setEditModalOpen(false);
              setSelected(null);
              loadData();
            }}
            onCancel={() => { setEditModalOpen(false); setSelected(null); }}
            onDelete={async () => {
              if (!confirm("Delete this expense?")) return;
              const result = await deleteExpense(selected.id);
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

// ---- Expense Form ----

function ExpenseForm({
  defaultValues,
  onSubmit,
  onCancel,
  onDelete,
  submitLabel,
}: {
  defaultValues?: Expense;
  onSubmit: (desc: string, amount: number, type: string, date: string, time: string | null, notes: string, receiptUrl: string | null) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const [description, setDescription] = useState(defaultValues?.description || "");
  const [amount, setAmount] = useState(defaultValues?.amount?.toString() || "");
  const [expenseType, setExpenseType] = useState(defaultValues?.expense_type || "Supplies");
  const [date, setDate] = useState(defaultValues?.date || new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState(defaultValues?.time?.slice(0, 5) || "");
  const [notes, setNotes] = useState(defaultValues?.notes || "");
  const [receiptUrl, setReceiptUrl] = useState(defaultValues?.receipt_url || "");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get the filename from a Supabase storage URL
  function getFileName(url: string) {
    try {
      const parts = url.split("/");
      return decodeURIComponent(parts[parts.length - 1]);
    } catch {
      return "Receipt";
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      alert("File must be smaller than 10MB");
      return;
    }

    setUploading(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const filePath = `receipts/${fileName}`;

      const { error } = await supabase.storage
        .from("receipts")
        .upload(filePath, file);

      if (error) {
        alert("Upload failed: " + error.message);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("receipts")
        .getPublicUrl(filePath);

      setReceiptUrl(urlData.publicUrl);
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment() {
    setReceiptUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !amount) return;
    setSubmitting(true);
    await onSubmit(
      description.trim(),
      parseFloat(amount),
      expenseType,
      date,
      time || null,
      notes.trim(),
      receiptUrl || null
    );
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Nail polish supplies"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          required
        />
      </div>

      {/* Amount + Type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount (AED)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={expenseType}
            onChange={(e) => setExpenseType(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            {EXPENSE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Date + Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Time (optional)</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>

      {/* Attachment */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Attachment (optional)</label>
        {receiptUrl ? (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
            <a href={receiptUrl} target="_blank" rel="noopener noreferrer"
              className="flex-1 truncate text-sm text-violet-600 hover:underline">
              {getFileName(receiptUrl)}
            </a>
            <button type="button" onClick={removeAttachment}
              className="shrink-0 text-xs text-red-500 hover:text-red-700">
              Remove
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              id="receipt-upload"
            />
            <label
              htmlFor="receipt-upload"
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm transition-colors hover:border-violet-400 hover:bg-violet-50 ${
                uploading ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {uploading ? (
                <>
                  <svg className="h-4 w-4 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-gray-500">Uploading...</span>
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <span className="text-gray-500">Upload receipt (image or PDF)</span>
                </>
              )}
            </label>
          </div>
        )}
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
        <button type="submit" disabled={submitting || uploading}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
