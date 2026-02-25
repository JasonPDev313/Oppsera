/**
 * Types for the staff / employee import system.
 */

// ── Target Fields ────────────────────────────────────────────────────

export type StaffTargetField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'username'
  | 'phone'
  | 'status'
  | 'role'
  | 'location'
  | 'posPin'
  | 'overridePin'
  | 'tabColor'
  | 'employeeColor'
  | 'externalPayrollEmployeeId'
  | 'externalPayrollId';

export const STAFF_TARGET_FIELD_LABELS: Record<StaffTargetField, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email',
  username: 'Username',
  phone: 'Phone Number',
  status: 'Status (Active/Inactive)',
  role: 'Role',
  location: 'Location',
  posPin: 'Unique ID PIN',
  overridePin: 'POS Override PIN',
  tabColor: 'Tab Color',
  employeeColor: 'Employee Color',
  externalPayrollEmployeeId: 'Payroll Employee ID',
  externalPayrollId: 'External Payroll ID',
};

export const STAFF_TARGET_FIELD_GROUPS: Record<string, StaffTargetField[]> = {
  'Identity (Required)': ['firstName', 'lastName', 'email', 'username'],
  'Status & Access': ['status', 'role', 'location'],
  'POS / Security': ['posPin', 'overridePin', 'tabColor', 'employeeColor'],
  'Payroll': ['externalPayrollEmployeeId', 'externalPayrollId'],
  'Contact': ['phone'],
};

// ── Mapping Types ────────────────────────────────────────────────────

export interface StaffColumnMappingCandidate {
  targetField: StaffTargetField;
  confidence: number;
  source: 'alias' | 'fuzzy_alias' | 'pattern' | 'combined';
  explanation: string;
}

export interface StaffColumnMapping {
  columnIndex: number;
  sourceHeader: string;
  targetField: StaffTargetField | null;
  confidence: number;
  explanation: string;
  alternatives: StaffColumnMappingCandidate[];
  sampleValues: string[];
}

export interface StaffAnalysisResult {
  columns: StaffColumnMapping[];
  sampleData: string[][];
  totalRows: number;
  delimiter: string;
  warnings: string[];
  distinctRoles: string[];
  distinctLocations: string[];
}

// ── Value Mapping Types ──────────────────────────────────────────────

export interface RoleValueMapping {
  legacyValue: string;
  oppsEraRoleId: string | null;
  occurrenceCount: number;
  confidence: number;
}

export interface LocationValueMapping {
  legacyValue: string;
  oppsEraLocationIds: string[];
  occurrenceCount: number;
  confidence: number;
}

export interface StaffValueMappings {
  roles: RoleValueMapping[];
  locations: LocationValueMapping[];
}

// ── Validation Types ─────────────────────────────────────────────────

export interface StaffRowError {
  field: string;
  code: string;
  message: string;
}

export type StaffImportMode = 'create_only' | 'update_only' | 'upsert';

export interface ValidatedStaffRow {
  rowNumber: number;
  rawData: Record<string, string>;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  statusValue: string;
  roleId: string | null;
  roleRaw: string | null;
  locationIds: string[];
  locationRaw: string | null;
  posPin: string | null;
  overridePin: string | null;
  tabColor: string | null;
  employeeColor: string | null;
  externalPayrollEmployeeId: string | null;
  externalPayrollId: string | null;
  matchType: string | null;
  matchedUserId: string | null;
  action: 'create' | 'update' | 'skip' | 'error';
  isValid: boolean;
  errors: StaffRowError[];
  warnings: StaffRowError[];
}

export interface StaffValidationResult {
  isValid: boolean;
  rows: ValidatedStaffRow[];
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    createCount: number;
    updateCount: number;
    skipCount: number;
    distinctRolesUnmapped: string[];
    distinctLocationsUnmapped: string[];
    duplicateEmailsInFile: string[];
  };
}

// ── Import Result ────────────────────────────────────────────────────

export interface StaffImportResult {
  jobId: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: Array<{ rowNumber: number; message: string }>;
  /** IDs of users that were created (not updated) during this import — used for rollback */
  createdUserIds?: string[];
}
