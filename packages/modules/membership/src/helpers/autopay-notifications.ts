// ── Autopay Notification Templates ────────────────────────────────
// Pure functions that produce notification payloads.
// Actual delivery happens via event consumers in the web app layer.

export type AutopayNotificationType =
  | 'payment_failed'
  | 'payment_succeeded'
  | 'card_expiring'
  | 'autopay_suspended'
  | 'retry_scheduled'
  | 'ach_payment_initiated'
  | 'ach_payment_settled'
  | 'ach_payment_returned';

export interface AutopayNotification {
  type: AutopayNotificationType;
  customerId: string;
  membershipAccountId: string;
  subject: string;
  body: string;
  metadata: Record<string, unknown>;
}

export function buildPaymentFailedNotification(params: {
  customerId: string;
  membershipAccountId: string;
  amountCents: number;
  cardLast4?: string | null;
  failureReason: string;
  attemptNumber: number;
}): AutopayNotification {
  const amount = (params.amountCents / 100).toFixed(2);
  const cardDesc = params.cardLast4 ? ` ending in ${params.cardLast4}` : '';
  return {
    type: 'payment_failed',
    customerId: params.customerId,
    membershipAccountId: params.membershipAccountId,
    subject: 'Payment Declined',
    body: `Your autopay payment of $${amount} to your card${cardDesc} was declined. `
      + `Reason: ${params.failureReason}. `
      + `Please update your payment method to avoid service interruption.`,
    metadata: {
      amountCents: params.amountCents,
      attemptNumber: params.attemptNumber,
      failureReason: params.failureReason,
    },
  };
}

export function buildPaymentSucceededNotification(params: {
  customerId: string;
  membershipAccountId: string;
  amountCents: number;
  cardLast4?: string | null;
}): AutopayNotification {
  const amount = (params.amountCents / 100).toFixed(2);
  const cardDesc = params.cardLast4 ? ` to card ending in ${params.cardLast4}` : '';
  return {
    type: 'payment_succeeded',
    customerId: params.customerId,
    membershipAccountId: params.membershipAccountId,
    subject: 'Payment Received',
    body: `Your autopay payment of $${amount}${cardDesc} has been processed successfully.`,
    metadata: { amountCents: params.amountCents },
  };
}

export function buildCardExpiringNotification(params: {
  customerId: string;
  membershipAccountId: string;
  cardLast4: string;
  expiryMonth: number;
  expiryYear: number;
}): AutopayNotification {
  const expStr = `${String(params.expiryMonth).padStart(2, '0')}/${params.expiryYear}`;
  return {
    type: 'card_expiring',
    customerId: params.customerId,
    membershipAccountId: params.membershipAccountId,
    subject: 'Card Expiring Soon',
    body: `Your card ending in ${params.cardLast4} expires ${expStr}. `
      + `Please update your payment method to avoid autopay interruption.`,
    metadata: {
      cardLast4: params.cardLast4,
      expiryMonth: params.expiryMonth,
      expiryYear: params.expiryYear,
    },
  };
}

export function buildAutopaySuspendedNotification(params: {
  customerId: string;
  membershipAccountId: string;
  failedAttempts: number;
}): AutopayNotification {
  return {
    type: 'autopay_suspended',
    customerId: params.customerId,
    membershipAccountId: params.membershipAccountId,
    subject: 'Autopay Suspended',
    body: `Your autopay has been suspended after ${params.failedAttempts} consecutive failed attempts. `
      + `Please update your payment method and re-enable autopay to resume automatic payments.`,
    metadata: { failedAttempts: params.failedAttempts },
  };
}

export function buildRetryScheduledNotification(params: {
  customerId: string;
  membershipAccountId: string;
  amountCents: number;
  nextRetryDate: string;
  attemptNumber: number;
}): AutopayNotification {
  const amount = (params.amountCents / 100).toFixed(2);
  const retryDate = new Date(params.nextRetryDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return {
    type: 'retry_scheduled',
    customerId: params.customerId,
    membershipAccountId: params.membershipAccountId,
    subject: 'Payment Retry Scheduled',
    body: `We will retry your payment of $${amount} on ${retryDate}. `
      + `If you would like to update your payment method before then, please do so in your account settings.`,
    metadata: {
      amountCents: params.amountCents,
      nextRetryDate: params.nextRetryDate,
      attemptNumber: params.attemptNumber,
    },
  };
}

// ── ACH-Specific Notifications ─────────────────────────────────────

export function buildAchPaymentInitiatedNotification(params: {
  customerId: string;
  membershipAccountId: string;
  amountCents: number;
  bankLast4?: string | null;
}): AutopayNotification {
  const amount = (params.amountCents / 100).toFixed(2);
  const bankDesc = params.bankLast4 ? ` from bank account ending in ${params.bankLast4}` : '';
  return {
    type: 'ach_payment_initiated',
    customerId: params.customerId,
    membershipAccountId: params.membershipAccountId,
    subject: 'ACH Payment Submitted',
    body: `Your ACH payment of $${amount}${bankDesc} has been submitted and will process in 1-3 business days. `
      + `You will receive a confirmation once the payment has been received.`,
    metadata: { amountCents: params.amountCents, bankLast4: params.bankLast4 },
  };
}

export function buildAchPaymentSettledNotification(params: {
  customerId: string;
  membershipAccountId: string;
  amountCents: number;
  bankLast4?: string | null;
}): AutopayNotification {
  const amount = (params.amountCents / 100).toFixed(2);
  const bankDesc = params.bankLast4 ? ` from bank account ending in ${params.bankLast4}` : '';
  return {
    type: 'ach_payment_settled',
    customerId: params.customerId,
    membershipAccountId: params.membershipAccountId,
    subject: 'ACH Payment Received',
    body: `Your ACH payment of $${amount}${bankDesc} has been received and applied to your account.`,
    metadata: { amountCents: params.amountCents, bankLast4: params.bankLast4 },
  };
}

export function buildAchPaymentReturnedNotification(params: {
  customerId: string;
  membershipAccountId: string;
  amountCents: number;
  bankLast4?: string | null;
  returnCode: string;
  returnReason: string;
  willRetry: boolean;
  nextRetryDate?: string | null;
}): AutopayNotification {
  const amount = (params.amountCents / 100).toFixed(2);
  const bankDesc = params.bankLast4 ? ` from bank account ending in ${params.bankLast4}` : '';

  let retryInfo: string;
  if (params.willRetry && params.nextRetryDate) {
    const retryDate = new Date(params.nextRetryDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    retryInfo = `We will retry this payment on ${retryDate}.`;
  } else {
    retryInfo = `Please update your payment method to avoid service interruption.`;
  }

  return {
    type: 'ach_payment_returned',
    customerId: params.customerId,
    membershipAccountId: params.membershipAccountId,
    subject: 'ACH Payment Returned',
    body: `Your ACH payment of $${amount}${bankDesc} was returned by your bank. `
      + `Reason: ${params.returnReason}. ${retryInfo}`,
    metadata: {
      amountCents: params.amountCents,
      bankLast4: params.bankLast4,
      returnCode: params.returnCode,
      returnReason: params.returnReason,
      willRetry: params.willRetry,
      nextRetryDate: params.nextRetryDate,
    },
  };
}
