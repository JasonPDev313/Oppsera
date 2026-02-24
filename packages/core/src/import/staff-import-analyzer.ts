/**
 * Intelligent Column Mapping Engine for staff / employee import.
 *
 * Two-phase scoring:
 *   1. Alias matching — exact/fuzzy match on header names
 *   2. Data pattern detection — statistical analysis of column values
 *
 * Confidence: 0–99 integer. Greedy assignment (no duplicate targets).
 */

import type {
  StaffTargetField,
  StaffColumnMapping,
  StaffColumnMappingCandidate,
  StaffAnalysisResult,
} from './staff-import-types';

// ── Column Aliases ───────────────────────────────────────────────────

const COLUMN_ALIASES: Record<StaffTargetField, string[]> = {
  firstName: [
    'first_name', 'firstname', 'first name', 'fname', 'given_name', 'given name',
    'givenname', 'f name',
  ],
  lastName: [
    'last_name', 'lastname', 'last name', 'lname', 'surname', 'family_name',
    'family name', 'familyname', 'l name',
  ],
  email: [
    'email', 'email_address', 'emailaddress', 'email address', 'email id',
    'emailid', 'email_id', 'e-mail', 'e mail', 'mail',
  ],
  username: [
    'username', 'user_name', 'user name', 'login', 'login_name', 'login name',
    'loginname', 'userid', 'user_id', 'user id', 'logon', 'sign_in', 'signin',
    'account', 'account_name',
  ],
  phone: [
    'phone', 'phone_number', 'phonenumber', 'phone number', 'telephone',
    'tel', 'mobile', 'cell', 'cell_phone', 'cellphone', 'cell phone',
    'work_phone', 'work phone',
  ],
  status: [
    'status', 'active', 'is_active', 'isactive', 'is active', 'enabled',
    'is_enabled', 'user_status', 'account_status', 'state',
  ],
  role: [
    'role', 'role_name', 'rolename', 'role name', 'user_type', 'usertype',
    'user type', 'access_level', 'access level', 'permission_group',
    'permission group', 'security_role', 'security role', 'position',
    'job_title', 'title', 'user_role',
  ],
  location: [
    'location', 'location_name', 'locationname', 'location name', 'site',
    'site_name', 'sitename', 'site name', 'store', 'store_name', 'storename',
    'store name', 'branch', 'branch_name', 'venue', 'venue_name', 'club',
    'club_name', 'course', 'course_name', 'course name', 'facility',
    'facility_name', 'outlet', 'property', 'assigned_location',
  ],
  posPin: [
    'pin', 'pos_pin', 'pospin', 'pos pin', 'id_pin', 'unique_pin',
    'unique pin', 'login_pin', 'login pin', 'clock_in_pin', 'clock in pin',
    'unique id pin', 'unique_id_pin', 'unique identification pin',
    'uniqueidentificationpin', 'identification pin', 'id pin',
  ],
  overridePin: [
    'override_pin', 'overridepin', 'override pin', 'pos_override_pin',
    'pos override pin', 'posoverridepin', 'manager_pin', 'manager pin',
    'mgr_pin', 'mgr pin', 'supervisor_pin', 'supervisor pin', 'admin_pin',
  ],
  tabColor: [
    'tab_color', 'tabcolor', 'tab color', 'user_tab_color', 'user tab color',
    'color', 'user_color',
  ],
  employeeColor: [
    'employee_color', 'employeecolor', 'employee color', 'emp_color',
    'staff_color', 'staff color',
  ],
  externalPayrollEmployeeId: [
    'id', 'employee_id', 'employeeid', 'employee id', 'emp_id', 'empid', 'emp id',
    'payroll_employee_id', 'payroll employee id', 'payroll_id', 'payrollid',
    'payroll id', 'staff_id', 'staffid', 'staff id', 'worker_id',
    'external_id', 'external id', 'badge_number', 'badge number', 'badge',
    'clock_number', 'clock number', 'record_id', 'recordid', 'record id',
    'user_id', 'userid',
  ],
  externalPayrollId: [
    'external_payroll_id', 'payroll_system_id', 'payroll system id',
    'hr_system_id', 'hr system id', 'hris_id', 'hris id',
  ],
};

// ── Pattern Detectors ────────────────────────────────────────────────

function getNonEmpty(values: string[]): string[] {
  return values.filter((v) => v !== '' && v != null);
}

function detectEmailPattern(values: string[]): { confidence: number; explanation: string } | null {
  const nonEmpty = getNonEmpty(values);
  if (nonEmpty.length === 0) return null;
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const matches = nonEmpty.filter((v) => emailRe.test(v.trim()));
  const ratio = matches.length / nonEmpty.length;
  if (ratio < 0.4) return null;
  return {
    confidence: Math.min(90, Math.round(ratio * 95)),
    explanation: `${Math.round(ratio * 100)}% of values are email addresses`,
  };
}

function detectPhonePattern(values: string[]): { confidence: number; explanation: string } | null {
  const nonEmpty = getNonEmpty(values);
  if (nonEmpty.length === 0) return null;
  const phoneRe = /^[\d\s()+\-./]{7,20}$/;
  const matches = nonEmpty.filter((v) => phoneRe.test(v.trim()));
  const ratio = matches.length / nonEmpty.length;
  if (ratio < 0.4) return null;
  return {
    confidence: Math.min(75, Math.round(ratio * 80)),
    explanation: `${Math.round(ratio * 100)}% of values look like phone numbers`,
  };
}

function detectBooleanPattern(values: string[]): { confidence: number; explanation: string } | null {
  const nonEmpty = getNonEmpty(values);
  if (nonEmpty.length === 0) return null;
  const boolSet = new Set(['true', 'false', 'yes', 'no', '0', '1', 'y', 'n', 'active', 'inactive', 'enabled', 'disabled']);
  const matches = nonEmpty.filter((v) => boolSet.has(v.toLowerCase().trim()));
  const ratio = matches.length / nonEmpty.length;
  if (ratio < 0.6) return null;
  return {
    confidence: Math.min(80, Math.round(ratio * 85)),
    explanation: `${Math.round(ratio * 100)}% of values are boolean/status (yes/no, active/inactive)`,
  };
}

function detectPinPattern(values: string[]): { confidence: number; explanation: string } | null {
  const nonEmpty = getNonEmpty(values);
  if (nonEmpty.length === 0) return null;
  const pinRe = /^\d{3,8}$/;
  const matches = nonEmpty.filter((v) => pinRe.test(v.trim()));
  const ratio = matches.length / nonEmpty.length;
  if (ratio < 0.4) return null;
  return {
    confidence: Math.min(70, Math.round(ratio * 75)),
    explanation: `${Math.round(ratio * 100)}% of values are 3-8 digit PINs`,
  };
}

function detectColorPattern(values: string[]): { confidence: number; explanation: string } | null {
  const nonEmpty = getNonEmpty(values);
  if (nonEmpty.length === 0) return null;
  const colorRe = /^#[0-9a-fA-F]{6}$|^(red|blue|green|orange|purple|yellow|pink|teal|cyan|gray|grey|black|white|brown|navy|lime|magenta|olive|maroon|aqua|coral|salmon|gold|indigo|violet)$/i;
  const matches = nonEmpty.filter((v) => colorRe.test(v.trim()));
  const ratio = matches.length / nonEmpty.length;
  if (ratio < 0.3) return null;
  return {
    confidence: Math.min(65, Math.round(ratio * 70)),
    explanation: `${Math.round(ratio * 100)}% of values look like color values`,
  };
}

const KNOWN_ROLES = new Set([
  'admin', 'administrator', 'super admin', 'super_admin', 'superadmin',
  'super administrator', 'course administrator',
  'manager', 'mgr', 'general manager', 'gm', 'assistant manager',
  'golf shop manager',
  'supervisor', 'lead', 'shift lead', 'shift_lead',
  'cashier', 'register', 'pos', 'pos operator',
  'server', 'waiter', 'waitress', 'wait staff', 'waitstaff',
  'bartender', 'barista', 'bar', 'bevcart', 'bev cart', 'beer garden',
  'host', 'hostess', 'greeter',
  'cook', 'chef', 'kitchen', 'line cook', 'prep cook', 'sous chef',
  'busser', 'bus', 'runner', 'food runner',
  'staff', 'employee', 'team member', 'associate', 'crew',
  'owner', 'proprietor',
  'pro shop', 'proshop', 'pro_shop', 'golf pro',
  'pro shop user', 'course pro shop user',
  'starter', 'marshal', 'ranger', 'course ranger user',
  'cartie head', 'course cartie head', 'cart attendant',
  'maintenance', 'grounds', 'groundskeeper',
  'admin user',
  'housekeeping', 'housekeeper', 'cleaning',
  'front desk', 'front_desk', 'reception', 'receptionist',
  'all access', 'all_access', 'full access', 'full_access',
  'tee sheet', 'tee_sheet', 'tee sheet & pos only',
  'f&b', 'fnb', 'food and beverage', 'food & beverage',
  'read only', 'read_only', 'viewer', 'view only',
]);

function detectRolePattern(values: string[]): { confidence: number; explanation: string } | null {
  const nonEmpty = getNonEmpty(values);
  if (nonEmpty.length === 0) return null;
  const matches = nonEmpty.filter((v) => KNOWN_ROLES.has(v.toLowerCase().trim()));
  const ratio = matches.length / nonEmpty.length;
  if (ratio < 0.2) return null;
  return {
    confidence: Math.min(80, Math.round(ratio * 85)),
    explanation: `${Math.round(ratio * 100)}% of values match known role names`,
  };
}

// ── Fuzzy Matching ───────────────────────────────────────────────────

function normalizeHeader(header: string): string {
  // Split camelCase/PascalCase into words before lowercasing
  // e.g., "POSOverridePin" → "pos override pin", "UniqueIdentificationPin" → "unique identification pin"
  const spaced = header
    .replace(/([a-z])([A-Z])/g, '$1 $2')           // camelCase split
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');    // acronym split (POS Override → POS Override)
  return spaced.toLowerCase().replace(/[^a-z0-9_# ]/g, '').trim();
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(/[\s_-]+/).filter(Boolean));
  const tokensB = new Set(b.split(/[\s_-]+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  return (overlap * 2) / (tokensA.size + tokensB.size);
}

// ── Distinct Value Extraction ────────────────────────────────────────

function extractDistinctValues(
  mappings: StaffColumnMapping[],
  allRows: string[][],
  targetField: StaffTargetField,
): string[] {
  const mapping = mappings.find((m) => m.targetField === targetField);
  if (!mapping) return [];
  const values = new Set<string>();
  for (const row of allRows) {
    const val = row[mapping.columnIndex]?.trim();
    if (val) values.add(val);
  }
  return [...values].sort();
}

// ── Main Analyzer ────────────────────────────────────────────────────

export function analyzeStaffColumns(
  headers: string[],
  sampleRows: string[][],
  allRows: string[][],
): StaffAnalysisResult {
  const warnings: string[] = [];

  // Build raw candidates per column
  const allColumnCandidates: Array<{
    columnIndex: number;
    sourceHeader: string;
    sampleValues: string[];
    candidates: StaffColumnMappingCandidate[];
  }> = [];

  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    const header = headers[colIdx]!;
    const normalizedHeader = normalizeHeader(header);
    const columnValues = sampleRows.map((row) => row[colIdx] ?? '');
    const sampleValues = getNonEmpty(columnValues).slice(0, 5);
    const candidates: StaffColumnMappingCandidate[] = [];

    // ── Phase 1: Alias matching ──
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [StaffTargetField, string[]][]) {
      if (aliases.includes(normalizedHeader)) {
        candidates.push({
          targetField: field,
          confidence: 95,
          source: 'alias',
          explanation: `Header "${header}" matches known column name for ${field}`,
        });
      } else {
        let bestFuzzy = 0;
        for (const alias of aliases) {
          const score = tokenOverlap(normalizedHeader, alias);
          if (score > bestFuzzy) bestFuzzy = score;
        }
        if (bestFuzzy >= 0.6) {
          candidates.push({
            targetField: field,
            confidence: Math.round(60 + bestFuzzy * 15),
            source: 'fuzzy_alias',
            explanation: `Header "${header}" is similar to known names for ${field}`,
          });
        }
      }
    }

    // ── Phase 2: Data pattern detection ──
    const email = detectEmailPattern(columnValues);
    if (email) {
      candidates.push({ targetField: 'email', confidence: email.confidence, source: 'pattern', explanation: email.explanation });
    }

    const phone = detectPhonePattern(columnValues);
    if (phone) {
      candidates.push({ targetField: 'phone', confidence: phone.confidence, source: 'pattern', explanation: phone.explanation });
    }

    const bool = detectBooleanPattern(columnValues);
    if (bool) {
      candidates.push({ targetField: 'status', confidence: bool.confidence, source: 'pattern', explanation: bool.explanation });
    }

    const pin = detectPinPattern(columnValues);
    if (pin && !email) {
      const headerLower = normalizedHeader;
      if (headerLower.includes('override') || headerLower.includes('manager') || headerLower.includes('mgr')) {
        candidates.push({ targetField: 'overridePin', confidence: pin.confidence, source: 'pattern', explanation: pin.explanation });
      } else {
        candidates.push({ targetField: 'posPin', confidence: pin.confidence, source: 'pattern', explanation: pin.explanation });
      }
    }

    const color = detectColorPattern(columnValues);
    if (color) {
      const headerLower = normalizedHeader;
      if (headerLower.includes('employee') || headerLower.includes('emp') || headerLower.includes('staff')) {
        candidates.push({ targetField: 'employeeColor', confidence: color.confidence, source: 'pattern', explanation: color.explanation });
      } else {
        candidates.push({ targetField: 'tabColor', confidence: color.confidence, source: 'pattern', explanation: color.explanation });
      }
    }

    const role = detectRolePattern(columnValues);
    if (role) {
      candidates.push({ targetField: 'role', confidence: role.confidence, source: 'pattern', explanation: role.explanation });
    }

    // ── Phase 3: Combine (boost alias + pattern agreement) ──
    const merged = new Map<StaffTargetField, StaffColumnMappingCandidate>();
    for (const c of candidates) {
      const existing = merged.get(c.targetField);
      if (!existing) {
        merged.set(c.targetField, { ...c });
      } else {
        const hasAlias = existing.source === 'alias' || existing.source === 'fuzzy_alias' || c.source === 'alias' || c.source === 'fuzzy_alias';
        const hasPattern = existing.source === 'pattern' || c.source === 'pattern';
        const best = Math.max(existing.confidence, c.confidence);
        if (hasAlias && hasPattern) {
          merged.set(c.targetField, {
            targetField: c.targetField,
            confidence: Math.min(99, best + 10),
            source: 'combined',
            explanation: `${existing.explanation}; confirmed by data patterns`,
          });
        } else if (c.confidence > existing.confidence) {
          merged.set(c.targetField, { ...c });
        }
      }
    }

    // Penalize sparse columns
    const nonEmptyCount = getNonEmpty(columnValues).length;
    const fillRate = nonEmptyCount / Math.max(columnValues.length, 1);
    if (fillRate < 0.2) {
      for (const c of merged.values()) {
        c.confidence = Math.max(0, c.confidence - 15);
        c.explanation += ' (sparse data)';
      }
    }

    allColumnCandidates.push({
      columnIndex: colIdx,
      sourceHeader: header,
      sampleValues,
      candidates: [...merged.values()].sort((a, b) => b.confidence - a.confidence),
    });
  }

  // ── Phase 4: Greedy assignment ──
  const usedTargets = new Set<StaffTargetField>();
  const assignedColumns = new Set<number>();

  type FlatEntry = {
    columnIndex: number;
    sourceHeader: string;
    sampleValues: string[];
    candidate: StaffColumnMappingCandidate;
    allCandidates: StaffColumnMappingCandidate[];
  };

  const flat: FlatEntry[] = [];
  for (const col of allColumnCandidates) {
    for (const c of col.candidates) {
      flat.push({
        columnIndex: col.columnIndex,
        sourceHeader: col.sourceHeader,
        sampleValues: col.sampleValues,
        candidate: c,
        allCandidates: col.candidates,
      });
    }
  }
  flat.sort((a, b) => b.candidate.confidence - a.candidate.confidence);

  const mappings: StaffColumnMapping[] = [];
  for (const entry of flat) {
    if (assignedColumns.has(entry.columnIndex)) continue;
    if (usedTargets.has(entry.candidate.targetField)) continue;
    if (entry.candidate.confidence < 30) continue;

    usedTargets.add(entry.candidate.targetField);
    assignedColumns.add(entry.columnIndex);

    mappings.push({
      columnIndex: entry.columnIndex,
      sourceHeader: entry.sourceHeader,
      targetField: entry.candidate.targetField,
      confidence: entry.candidate.confidence,
      explanation: entry.candidate.explanation,
      alternatives: entry.allCandidates
        .filter((c) => c.targetField !== entry.candidate.targetField)
        .slice(0, 3),
      sampleValues: entry.sampleValues,
    });
  }

  // Add unmapped columns
  for (const col of allColumnCandidates) {
    if (!assignedColumns.has(col.columnIndex)) {
      mappings.push({
        columnIndex: col.columnIndex,
        sourceHeader: col.sourceHeader,
        targetField: null,
        confidence: 0,
        explanation: 'Could not determine column purpose',
        alternatives: col.candidates.slice(0, 3),
        sampleValues: col.sampleValues,
      });
    }
  }

  mappings.sort((a, b) => a.columnIndex - b.columnIndex);

  // Warnings for required columns
  if (!usedTargets.has('email') && !usedTargets.has('username')) {
    warnings.push('No email or username column detected — at least one is required for identity.');
  }
  if (!usedTargets.has('firstName') && !usedTargets.has('lastName')) {
    warnings.push('No first/last name columns detected — names are required.');
  }

  // Warn about sensitive/unsupported columns
  const SENSITIVE_COLUMNS = new Set(['password', 'pass', 'pwd', 'secret', 'token']);
  const sensitiveFound = mappings.filter(
    (m) => m.targetField === null && SENSITIVE_COLUMNS.has(m.sourceHeader.toLowerCase().trim()),
  );
  if (sensitiveFound.length > 0) {
    const names = sensitiveFound.map((m) => `"${m.sourceHeader}"`).join(', ');
    warnings.push(
      `${names} column${sensitiveFound.length === 1 ? '' : 's'} detected and will be skipped — OppsEra does not import passwords for security reasons. Users will set their own credentials.`,
    );
  }

  // List remaining unmapped columns so the user knows what's being skipped
  const sensitiveSet = new Set(sensitiveFound.map((m) => m.columnIndex));
  const unmappedCols = mappings.filter((m) => m.targetField === null && !sensitiveSet.has(m.columnIndex));
  if (unmappedCols.length > 0) {
    const names = unmappedCols.map((m) => `"${m.sourceHeader}"`).join(', ');
    warnings.push(
      `${unmappedCols.length} column${unmappedCols.length === 1 ? '' : 's'} not recognized and will be skipped: ${names}. You can manually map them in the next step if needed.`,
    );
  }

  // Extract distinct role + location values for the value mapping step
  const distinctRoles = extractDistinctValues(mappings, allRows, 'role');
  const distinctLocations = extractDistinctValues(mappings, allRows, 'location');

  return {
    columns: mappings,
    sampleData: sampleRows.slice(0, 5),
    totalRows: allRows.length,
    delimiter: ',',
    warnings,
    distinctRoles,
    distinctLocations,
  };
}
