import InventoryView, { type InventoryItem } from "./inventory-view";
import { getInventoryItems } from "./actions";

export default async function InventoryPage() {
  const data = await getInventoryItems();
  return <InventoryView initialItems={(data || []) as InventoryItem[]} />;
}
