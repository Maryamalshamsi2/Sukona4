"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTeamScope } from "@/lib/auth-server";

// Helper to log notification rows. salon_id auto-fills via column default
// (migration 014). performed_by = the actor; the notification bell filters
// out self-actions for these types so the actor isn't notified about their
// own action.
async function logNotification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string | null,
  action: string,
  description: string,
) {
  await supabase.from("activity_log").insert({
    appointment_id: null,
    action,
    description,
    performed_by: userId,
  });
}

/**
 * Inventory items list, with optional team filtering.
 *
 * Three scoping modes:
 *
 *   1. Scoped admin (admin role + group_id set, Multi-Team v1.5/1.6):
 *      Always returns items where team_id = their team OR team_id IS
 *      NULL (salon-wide shared pool). The `teamFilter` argument is
 *      ignored — they can't see other teams' stock regardless.
 *
 *   2. Owner / unscoped admin, `teamFilter` argument provided:
 *      Returns items where team_id = teamFilter OR team_id IS NULL.
 *      Lets the owner inspect one team's stock at a time.
 *
 *   3. Owner / unscoped admin, no `teamFilter`:
 *      Returns everything (existing behavior — backwards-compat for
 *      single-team salons).
 *
 * @param teamFilter optional team_group id. Use "shared" to filter to
 *                   shared-only (team_id IS NULL) items.
 */
export async function getInventoryItems(teamFilter?: string | null) {
  const supabase = await createClient();
  let query = supabase.from("inventory").select("*");

  const { teamScope } = await getTeamScope();
  if (teamScope) {
    // Scoped admin: always limit to (their team) OR (shared). The
    // server is the source of truth; even if the client passes
    // teamFilter for another team, we override.
    query = query.or(`team_id.eq.${teamScope},team_id.is.null`);
  } else if (teamFilter === "shared") {
    // Owner explicitly viewing the salon-wide shared pool.
    query = query.is("team_id", null);
  } else if (teamFilter) {
    // Owner viewing one team's items (still includes shared).
    query = query.or(`team_id.eq.${teamFilter},team_id.is.null`);
  }
  // else: owner with no filter → return everything

  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createInventoryItem(
  name: string,
  quantity: number,
  lowStockThreshold: number,
  category: string,
  unit: string,
  costPerUnit: number | null,
  notes: string,
  /** Team this item belongs to. NULL = salon-wide shared item.
   *  Scoped admins always get their own team forced onto the row
   *  regardless of what's passed (server is source of truth). */
  teamId: string | null = null,
) {
  const supabase = await createClient();
  // Scoped admins can only create items in their own team — defense
  // against a tampered client setting teamId to another team's id.
  const { teamScope } = await getTeamScope();
  const effectiveTeamId = teamScope ?? teamId;

  const { error } = await supabase.from("inventory").insert({
    name,
    quantity,
    low_stock_threshold: lowStockThreshold,
    category,
    unit,
    cost_per_unit: costPerUnit,
    notes: notes || null,
    team_id: effectiveTeamId,
  });

  if (error) return { error: error.message };
  revalidatePath("/inventory");
  return { success: true };
}

export async function updateInventoryItem(
  id: string,
  name: string,
  quantity: number,
  lowStockThreshold: number,
  category: string,
  unit: string,
  costPerUnit: number | null,
  notes: string,
  /** Optional reassignment of the item's team. Pass undefined to
   *  keep the existing team; pass null to make it salon-wide. Scoped
   *  admins can't change team away from their own group. */
  teamId?: string | null,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  // Snapshot the old quantity + name + threshold so we can detect a
  // change worth notifying about and a low-stock threshold crossing.
  const { data: before } = await supabase
    .from("inventory")
    .select("name, quantity, low_stock_threshold")
    .eq("id", id)
    .single();

  // Scoped admin → force team_id back to their team so they can't
  // "smuggle" an item out into another team or into the shared pool.
  const { teamScope } = await getTeamScope();
  const update: Record<string, unknown> = {
    name,
    quantity,
    low_stock_threshold: lowStockThreshold,
    category,
    unit,
    cost_per_unit: costPerUnit,
    notes: notes || null,
  };
  if (teamScope) {
    update.team_id = teamScope;
  } else if (teamId !== undefined) {
    update.team_id = teamId;
  }

  const { error } = await supabase
    .from("inventory")
    .update(update)
    .eq("id", id);

  if (error) return { error: error.message };

  if (before && before.quantity !== quantity) {
    // Quantity changed → notify. e.g. "Stock · Gel polish 12 → 10".
    await logNotification(
      supabase,
      userId,
      "inventory_adjusted",
      `Stock · ${before.name} ${before.quantity} → ${quantity}`,
    );
    // Threshold crossing → also fire low-stock notification.
    if (before.quantity > before.low_stock_threshold && quantity <= lowStockThreshold) {
      await logNotification(
        supabase,
        userId,
        "inventory_low_stock",
        `Low stock · ${before.name} (${quantity} left)`,
      );
    }
  }

  revalidatePath("/inventory");
  return { success: true };
}

export async function deleteInventoryItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("inventory").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/inventory");
  return { success: true };
}

export async function updateInventoryQuantity(id: string, quantity: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  // Read before so we can describe the change + detect threshold crossing.
  const { data: before } = await supabase
    .from("inventory")
    .select("name, quantity, low_stock_threshold")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("inventory")
    .update({ quantity })
    .eq("id", id);

  if (error) return { error: error.message };

  if (before && before.quantity !== quantity) {
    await logNotification(
      supabase,
      userId,
      "inventory_adjusted",
      `Stock · ${before.name} ${before.quantity} → ${quantity}`,
    );
    if (before.quantity > before.low_stock_threshold && quantity <= before.low_stock_threshold) {
      await logNotification(
        supabase,
        userId,
        "inventory_low_stock",
        `Low stock · ${before.name} (${quantity} left)`,
      );
    }
  }

  revalidatePath("/inventory");
  return { success: true };
}
