export interface PricingPlan {
  id: string;
  tier: string;
  displayName: string;
  pricePerSeatCents: number;
  maxSeats: number | null;
  baseFeeCents: number;
  isActive: boolean;
  features: string[];
  sortOrder: number;
  tenantCount: number;
}

export interface ModulePricingItem {
  id: string;
  moduleKey: string;
  displayName: string;
  pricePerSeatCents: number;
  flatFeeCents: number;
  isAddon: boolean;
  includedInTiers: string[];
}

export interface TenantSubscription {
  id: string;
  tenantId: string;
  tenantName: string;
  plan: PricingPlan;
  seatCount: number;
  activeSeatCount: number;
  monthlyTotalCents: number;
  status: string;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  addonModuleKeys: string[];
  addonCostCents: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionChangeLogEntry {
  id: string;
  tenantId: string;
  changedBy: string;
  changeType: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

export interface UpdatePlanInput {
  pricePerSeatCents?: number;
  maxSeats?: number | null;
  baseFeeCents?: number;
  features?: string[];
  isActive?: boolean;
}

export interface ChangeTenantSubscriptionInput {
  pricingPlanId?: string;
  seatCount?: number;
  addonModuleKeys?: string[];
  status?: string;
  notes?: string;
  reason: string;
}
