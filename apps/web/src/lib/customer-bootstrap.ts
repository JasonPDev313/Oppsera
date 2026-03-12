import { setCustomerWriteApi } from '@oppsera/core/helpers/customer-write-api';

/**
 * Wire the CustomerWriteApi singleton so PMS and other cross-module
 * code can find-or-create customer records without importing
 * @oppsera/module-customers directly.
 */
export async function initializeCustomerWriteApi(): Promise<void> {
  const { computeDisplayName } = await import('@oppsera/module-customers');
  const { createCustomerWriteApiImpl } = await import('@oppsera/core');
  setCustomerWriteApi(createCustomerWriteApiImpl(computeDisplayName));
}
