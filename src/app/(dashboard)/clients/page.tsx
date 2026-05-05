import ClientsView from "./clients-view";
import { getClients } from "./actions";
import type { Client } from "@/types";

export default async function ClientsPage() {
  const clients = await getClients();
  return <ClientsView initialClients={(clients || []) as Client[]} />;
}
