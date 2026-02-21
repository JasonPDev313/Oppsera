export interface ProfitCenter {
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
  updatedAt: string;
}

export interface Terminal {
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
  updatedAt: string;
}

export interface TerminalSession {
  locationId: string;
  locationName: string;
  /** The top-level site location (null if locationId IS the site) */
  siteLocationId: string | null;
  siteLocationName: string | null;
  profitCenterId: string;
  profitCenterName: string;
  terminalId: string;
  terminalName: string;
  terminalNumber: number | null;
}
