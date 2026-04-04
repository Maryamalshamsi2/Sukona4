"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getExpenses() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("date", { ascending: false });

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
  receiptUrl: string | null
) {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    description,
    amount,
    expense_type: expenseType,
    category: expenseType,
    date,
    time: time || null,
    notes: notes || null,
    receipt_url: receiptUrl || null,
  });

  if (error) return { error: error.message };
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
  receiptUrl: string | null
) {
  const supabase = await createClient();
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
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/expenses");
  return { success: true };
}

export async function deleteExpense(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/expenses");
  return { success: true };
}
