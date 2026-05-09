"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Helper to get current user role
async function getCurrentUserRole() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, role: null, userId: null };
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return { supabase, role: data?.role || "staff", userId: user.id };
}

// Helper to log a notification row to activity_log. salon_id auto-fills
// via the column default (migration 014). performed_by = the actor; the
// bell filters out self-actions for these notification types so the
// actor doesn't get notified about their own action.
//
// `isPrivate` (migration 028) marks rows that should be hidden from
// staff at read time — used for private-expense notifications so the
// description (which leaks the amount + type) doesn't reach staff.
async function logNotification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string | null,
  action: string,
  description: string,
  isPrivate: boolean = false,
) {
  await supabase.from("activity_log").insert({
    appointment_id: null,
    action,
    description,
    performed_by: userId,
    is_private: isPrivate,
  });
}

export async function getExpenses() {
  const { supabase, role } = await getCurrentUserRole();

  // Chronological order: oldest at the top, newest at the bottom.
  // Tie-break by created_at so two expenses on the same date appear in
  // the order they were added to the system.
  let query = supabase
    .from("expenses")
    .select("*")
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });

  // Staff can only see non-private expenses
  if (role !== "owner") {
    query = query.eq("is_private", false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createExpense(
  description: string,
  amount: number,
  expenseType: string,
  date: string,
  time: string | null,
  notes: string,
  receiptUrl: string | null,
  isPrivate: boolean = false,
  paidFromPettyCash: boolean = false
) {
  const { supabase, userId } = await getCurrentUserRole();

  const { data, error } = await supabase.from("expenses").insert({
    description,
    amount,
    expense_type: expenseType,
    category: expenseType,
    date,
    time: time || null,
    notes: notes || null,
    receipt_url: receiptUrl || null,
    is_private: isPrivate,
    paid_from_petty_cash: paidFromPettyCash,
  }).select("id").single();

  if (error) return { error: error.message };

  // If paid from petty cash, create a withdrawal log entry
  if (paidFromPettyCash && data) {
    await supabase.from("petty_cash_log").insert({
      amount,
      type: "withdrawal",
      description: `Expense: ${description}`,
      expense_id: data.id,
      created_by: userId,
    });
  }

  // Notification: short, scannable. e.g. "Expense · AED 30 (Supplies)".
  // Private expenses get the is_private flag — the bell + activity
  // feed will hide them from staff (the description would otherwise
  // leak the amount + type).
  await logNotification(
    supabase,
    userId,
    "expense_added",
    `Expense · AED ${amount}${expenseType ? ` (${expenseType})` : ""}`,
    isPrivate,
  );

  revalidatePath("/expenses");
  return { success: true };
}

export async function updateExpense(
  id: string,
  description: string,
  amount: number,
  expenseType: string,
  date: string,
  time: string | null,
  notes: string,
  receiptUrl: string | null,
  isPrivate: boolean = false,
  paidFromPettyCash: boolean = false
) {
  const { supabase, userId } = await getCurrentUserRole();

  // Get old expense to check petty cash change
  const { data: oldExpense } = await supabase
    .from("expenses")
    .select("paid_from_petty_cash, amount")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("expenses")
    .update({
      description,
      amount,
      expense_type: expenseType,
      category: expenseType,
      date,
      time: time || null,
      notes: notes || null,
      receipt_url: receiptUrl || null,
      is_private: isPrivate,
      paid_from_petty_cash: paidFromPettyCash,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // Handle petty cash log changes
  const wasPettyCash = oldExpense?.paid_from_petty_cash;

  if (!wasPettyCash && paidFromPettyCash) {
    // Newly marked as petty cash — add withdrawal
    await supabase.from("petty_cash_log").insert({
      amount,
      type: "withdrawal",
      description: `Expense: ${description}`,
      expense_id: id,
      created_by: userId,
    });
  } else if (wasPettyCash && !paidFromPettyCash) {
    // Removed petty cash — delete the withdrawal log
    await supabase.from("petty_cash_log").delete().eq("expense_id", id);
  } else if (wasPettyCash && paidFromPettyCash) {
    // Still petty cash — update amount/description
    await supabase.from("petty_cash_log")
      .update({ amount, description: `Expense: ${description}` })
      .eq("expense_id", id);
  }

  revalidatePath("/expenses");
  return { success: true };
}

export async function deleteExpense(id: string) {
  const supabase = await createClient();
  // Delete related petty cash log entry first
  await supabase.from("petty_cash_log").delete().eq("expense_id", id);
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/expenses");
  return { success: true };
}

// ---- Petty Cash ----

export async function getPettyCashBalance() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("petty_cash_log")
    .select("amount, type");

  if (error) throw error;

  let balance = 0;
  (data || []).forEach((entry: { amount: number; type: string }) => {
    if (entry.type === "deposit") balance += Number(entry.amount);
    else balance -= Number(entry.amount);
  });

  return balance;
}

export async function getPettyCashLog() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("petty_cash_log")
    .select("*, profiles:created_by ( full_name )")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function addPettyCashDeposit(amount: number, description: string) {
  const { supabase, userId } = await getCurrentUserRole();

  const { error } = await supabase.from("petty_cash_log").insert({
    amount,
    type: "deposit",
    description,
    created_by: userId,
  });

  if (error) return { error: error.message };

  // Notification: e.g. "Petty cash · +AED 200".
  await logNotification(
    supabase,
    userId,
    "petty_cash_added",
    `Petty cash · +AED ${amount}`,
  );

  revalidatePath("/expenses");
  return { success: true };
}

export async function getUserRole() {
  const { role } = await getCurrentUserRole();
  return role;
}
