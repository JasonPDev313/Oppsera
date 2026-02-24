'use client';

import { PaymentMethodsList } from '@/components/customers/payment-methods-list';

interface ProfilePaymentMethodsTabProps {
  customerId: string;
}

export function ProfilePaymentMethodsTab({ customerId }: ProfilePaymentMethodsTabProps) {
  return <PaymentMethodsList customerId={customerId} />;
}
