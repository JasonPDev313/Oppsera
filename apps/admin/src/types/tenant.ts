// ── Tenant List ─────────────────────────────────────────────────
export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  industry: string | null;
  onboardingStatus: string;
  healthGrade: string;
  primaryContactEmail: string | null;
  primaryContactName: string | null;
  siteCount: number;
  venueCount: number;
  profitCenterCount: number;
  terminalCount: number;
  userCount: number;
  lastActivityAt: string | null;
  createdAt: string;
}

// ── Tenant Detail ───────────────────────────────────────────────
export interface TenantDetail extends TenantListItem {
  billingCustomerId: string | null;
  primaryContactPhone: string | null;
  internalNotes: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  metadata: Record<string, unknown>;
  totalLocations: number;
  totalUsers: number;
  entitlementCount: number;
  updatedAt: string;
}

// ── Onboarding ─────────────────────────────────────────────────
export type OnboardingStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';

export interface OnboardingStep {
  id: string;
  tenantId: string;
  stepKey: string;
  stepLabel: string;
  stepGroup: string;
  status: OnboardingStepStatus;
  sortOrder: number;
  completedAt: string | null;
  completedBy: string | null;
  blockerNotes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ── Support Notes ──────────────────────────────────────────────
export type NoteType = 'general' | 'support_ticket' | 'escalation' | 'implementation' | 'financial';

export interface SupportNote {
  id: string;
  tenantId: string;
  authorAdminId: string;
  authorName: string;
  authorEmail: string;
  content: string;
  noteType: NoteType;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Location ────────────────────────────────────────────────────
export interface LocationItem {
  id: string;
  tenantId: string;
  name: string;
  locationType: 'site' | 'venue';
  parentLocationId: string | null;
  timezone: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  childVenueCount: number;
  profitCenterCount: number;
  createdAt: string;
}

// ── Profit Center ───────────────────────────────────────────────
export interface ProfitCenterItem {
  id: string;
  tenantId: string;
  locationId: string;
  locationName: string | null;
  name: string;
  code: string | null;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  tipsApplicable: boolean;
  sortOrder: number;
  terminalCount: number;
  createdAt: string;
}

// ── Terminal ────────────────────────────────────────────────────
export interface TerminalItem {
  id: string;
  tenantId: string;
  profitCenterId: string;
  profitCenterName: string;
  locationId: string | null;
  name: string;
  terminalNumber: number | null;
  deviceIdentifier: string | null;
  ipAddress: string | null;
  isActive: boolean;
  createdAt: string;
}

// ── Access Mode ─────────────────────────────────────────────────
export type AccessMode = 'off' | 'view' | 'full';

// ── Entitlement ─────────────────────────────────────────────────
export interface EntitlementItem {
  id: string | null;
  tenantId: string;
  moduleKey: string;
  moduleName: string;
  moduleDescription: string;
  accessMode: AccessMode;
  planTier: string;
  isEnabled: boolean;
  riskLevel: string;
  category: string;
  supportsViewMode: boolean;
  dependencies: string[];
  dependents: string[];
  activatedAt: string | null;
  expiresAt: string | null;
  changedBy: string | null;
  changeReason: string | null;
  lastChangedAt: string | null;
}

export interface EntitlementSummary {
  totalModules: number;
  fullAccess: number;
  viewOnly: number;
  off: number;
}

// ── Change Log ──────────────────────────────────────────────────
export interface ChangeLogEntry {
  id: string;
  tenantId: string;
  moduleKey: string;
  moduleName: string;
  previousMode: AccessMode;
  newMode: AccessMode;
  changedBy: string;
  changeReason: string | null;
  changeSource: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ── Module Template ─────────────────────────────────────────────
export interface ModuleTemplateItem {
  id: string;
  name: string;
  description: string | null;
  businessType: string | null;
  isSystem: boolean;
  modules: { moduleKey: string; accessMode: AccessMode }[];
  createdBy: string | null;
  createdAt: string;
}

export interface TemplateDiffItem {
  moduleKey: string;
  moduleName: string;
  currentMode: AccessMode;
  targetMode: AccessMode;
  action: 'enable' | 'disable' | 'upgrade' | 'downgrade' | 'unchanged';
}

// ── Dependency Check ────────────────────────────────────────────
export interface DependencyCheckResult {
  allowed: boolean;
  missingDependencies: { key: string; name: string; currentMode: AccessMode }[];
  dependents: { key: string; name: string; currentMode: AccessMode }[];
  reasonRequired: boolean;
}

// ── Create Tenant ───────────────────────────────────────────────
export interface CreateTenantInput {
  name: string;
  slug?: string;
  status?: string;
  timezone?: string;
  siteName?: string;
  industry?: string;
  primaryContactEmail?: string;
  primaryContactName?: string;
  primaryContactPhone?: string;
}
