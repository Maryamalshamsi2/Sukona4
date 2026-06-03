import InventoryView, {
  type InventoryItem,
  type TeamRef,
} from "./inventory-view";
import { getInventoryItems } from "./actions";
// Re-using the calendar's getTeamGroups so we have one source of truth
// for "list the salon's teams." It's a server action, fine to import
// across pages.
import { getTeamGroups } from "../calendar/actions";

export default async function InventoryPage() {
  const [data, teamsRaw] = await Promise.all([
    getInventoryItems(),
    getTeamGroups(),
  ]);
  return (
    <InventoryView
      initialItems={(data || []) as InventoryItem[]}
      initialTeams={(teamsRaw || []) as TeamRef[]}
    />
  );
}
