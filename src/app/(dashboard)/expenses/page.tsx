import ExpensesView, { type Expense } from "./expenses-view";
import { getExpenses, getPettyCashBalance, getUserRole } from "./actions";

export default async function ExpensesPage() {
  const [expenses, balance, role] = await Promise.all([
    getExpenses(),
    getPettyCashBalance(),
    getUserRole(),
  ]);
  return (
    <ExpensesView
      initialExpenses={(expenses || []) as Expense[]}
      initialPettyCashBalance={balance ?? 0}
      initialUserRole={role ?? null}
    />
  );
}
