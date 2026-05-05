import PaymentsView, { type PaymentRow } from "./payments-view";
import { getPayments } from "./actions";

export default async function PaymentsPage() {
  const data = await getPayments();
  return <PaymentsView initialPayments={(data || []) as PaymentRow[]} />;
}
