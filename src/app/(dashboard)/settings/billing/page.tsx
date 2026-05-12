import BillingView from "./billing-view";
import { getBillingState } from "./actions";

export default async function BillingPage() {
  const state = await getBillingState();
  return <BillingView initial={state} />;
}
