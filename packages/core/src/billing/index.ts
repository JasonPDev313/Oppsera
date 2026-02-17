export interface BillingAdapter {
  createCustomer(tenantId: string, email: string, name: string): Promise<{ customerId: string }>;
  createSubscription(
    customerId: string,
    priceIds: string[],
  ): Promise<{ subscriptionId: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  getPortalUrl(customerId: string): Promise<string>;
}

// TODO: Implement in Milestone 7
