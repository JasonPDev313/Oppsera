import { AppError } from '@oppsera/shared';

export class BillStatusError extends AppError {
  constructor(billId: string, currentStatus: string, requiredStatus: string) {
    super(
      'BILL_STATUS_ERROR',
      `Bill ${billId} is ${currentStatus}, must be ${requiredStatus}`,
      409,
    );
  }
}

export class DuplicateBillNumberError extends AppError {
  constructor(vendorId: string, billNumber: string) {
    super(
      'DUPLICATE_BILL_NUMBER',
      `Bill number ${billNumber} already exists for vendor ${vendorId}`,
      409,
    );
  }
}

export class BillTotalMismatchError extends AppError {
  constructor(expectedTotal: string, actualTotal: string) {
    super(
      'BILL_TOTAL_MISMATCH',
      `Bill total ${actualTotal} does not match sum of lines ${expectedTotal}`,
      400,
    );
  }
}

export class PaymentExceedsBillError extends AppError {
  constructor(billId: string, remaining: string, attempted: string) {
    super(
      'PAYMENT_EXCEEDS_BILL',
      `Payment of ${attempted} exceeds remaining balance ${remaining} on bill ${billId}`,
      400,
    );
  }
}

export class BillHasPaymentsError extends AppError {
  constructor(billId: string) {
    super(
      'BILL_HAS_PAYMENTS',
      `Cannot void bill ${billId}: payments have been allocated`,
      409,
    );
  }
}

export class InvalidAccountReferenceError extends AppError {
  constructor(field: string, accountId: string) {
    super(
      'INVALID_ACCOUNT_REFERENCE',
      `GL account ${accountId} referenced by ${field} does not exist or is inactive`,
      400,
    );
  }
}
