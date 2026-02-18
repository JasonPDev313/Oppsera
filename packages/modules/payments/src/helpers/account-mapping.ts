interface Account {
  code: string;
  name: string;
}

// V1: Hardcoded. V2: configurable per department via admin settings
export function getDebitAccountForTenderType(tenderType: string): Account {
  switch (tenderType) {
    case 'cash':
      return { code: '1010', name: 'Cash on Hand' };
    case 'check':
      return { code: '1015', name: 'Checks Receivable' };
    case 'card':
      return { code: '1020', name: 'Undeposited Funds' };
    case 'gift_card':
      return { code: '2200', name: 'Gift Card Liability' };
    case 'store_credit':
      return { code: '2300', name: 'Store Credit Liability' };
    case 'house_account':
      return { code: '1200', name: 'Accounts Receivable' };
    default:
      return { code: '1090', name: 'Other Payment Received' };
  }
}

// V1: All revenue -> single account. V2: split by department
export function getRevenueAccountForDepartment(_departmentKey: string): Account {
  return { code: '4000', name: 'Revenue' };
}
