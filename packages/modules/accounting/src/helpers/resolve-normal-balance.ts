const ACCOUNT_TYPE_NORMAL_BALANCE: Record<string, 'debit' | 'credit'> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
};

export function resolveNormalBalance(accountType: string): 'debit' | 'credit' {
  const balance = ACCOUNT_TYPE_NORMAL_BALANCE[accountType];
  if (!balance) {
    throw new Error(`Unknown account type: ${accountType}`);
  }
  return balance;
}
