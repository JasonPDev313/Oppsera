export const MODULE_KEY = 'expense_management';
export const MODULE_NAME = 'Expense Management';
export const MODULE_VERSION = '0.1.0';

// Validation
export * from './validation';

// Commands
export { createExpense } from './commands/create-expense';
export { updateExpense } from './commands/update-expense';
export { submitExpense } from './commands/submit-expense';
export { approveExpense } from './commands/approve-expense';
export { rejectExpense } from './commands/reject-expense';
export { postExpense } from './commands/post-expense';
export { voidExpense } from './commands/void-expense';
export { markReimbursed } from './commands/mark-reimbursed';
export { createExpensePolicy } from './commands/create-expense-policy';
export { updateExpensePolicy } from './commands/update-expense-policy';

// Queries
export { listExpenses } from './queries/list-expenses';
export { getExpense } from './queries/get-expense';
export { listPendingApprovals } from './queries/list-pending-approvals';
export { getExpenseSummary } from './queries/get-expense-summary';
export { getEmployeeExpenseTotals } from './queries/get-employee-expense-totals';
export { listExpensePolicies } from './queries/list-expense-policies';
export { getExpensePolicy } from './queries/get-expense-policy';

// Consumers (read model projections)
export { handleExpensePosted } from './consumers/expense-posted';
export { handleExpenseVoided } from './consumers/expense-voided';
export { handleExpenseReimbursed } from './consumers/expense-reimbursed';
