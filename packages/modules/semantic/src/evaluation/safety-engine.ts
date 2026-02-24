import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { NotFoundError } from '@oppsera/shared';

// ── Types ────────────────────────────────────────────────────────

export type SafetyRuleType =
  | 'pii_detection'
  | 'injection_detection'
  | 'table_access'
  | 'row_limit'
  | 'custom_regex';

export type SafetySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface PiiDetectionConfig {
  patterns: string[]; // regex patterns for email, phone, SSN, etc.
}

export interface InjectionDetectionConfig {
  keywords: string[]; // suspicious prompt injection patterns
}

export interface TableAccessConfig {
  allowedTables: string[];
  blockedTables: string[];
}

export interface RowLimitConfig {
  maxRows: number;
}

export interface CustomRegexConfig {
  pattern: string;
  flags: string;
}

export type SafetyRuleConfig =
  | PiiDetectionConfig
  | InjectionDetectionConfig
  | TableAccessConfig
  | RowLimitConfig
  | CustomRegexConfig;

export interface SafetyRuleInput {
  name: string;
  description?: string;
  ruleType: SafetyRuleType;
  severity: SafetySeverity;
  config: SafetyRuleConfig;
}

export interface SafetyRule {
  id: string;
  name: string;
  description: string | null;
  ruleType: SafetyRuleType;
  severity: SafetySeverity;
  config: SafetyRuleConfig;
  isActive: boolean;
  triggerCount: number;
  lastTriggeredAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyViolation {
  ruleId: string;
  ruleName: string;
  ruleType: SafetyRuleType;
  severity: SafetySeverity;
  details: string;
}

export interface SafetyEvaluationResult {
  violations: SafetyViolation[];
  passed: boolean;
}

export interface SafetyTurnData {
  userMessage: string;
  compiledSql?: string;
  resultSample?: Record<string, unknown>[];
  tablesAccessed?: string[];
  rowCount?: number;
}

export interface PersistedViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  ruleType: SafetyRuleType;
  severity: SafetySeverity;
  details: string;
  turnId: string | null;
  tenantId: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SafetyDashboardData {
  totalViolations: number;
  unresolvedCount: number;
  bySeverity: { severity: SafetySeverity; count: number }[];
  byRuleType: { ruleType: SafetyRuleType; count: number }[];
  recentViolations: PersistedViolation[];
  ruleSummary: { ruleId: string; ruleName: string; triggerCount: number; lastTriggeredAt: string | null }[];
}

export interface ListViolationsFilters {
  resolved?: boolean;
  ruleType?: SafetyRuleType;
  severity?: SafetySeverity;
  cursor?: string;
  limit?: number;
}

export interface ListViolationsResult {
  violations: PersistedViolation[];
  cursor: string | null;
  hasMore: boolean;
}

// ── Table name constants ─────────────────────────────────────────

const RULES_TABLE = 'semantic_eval_safety_rules';
const VIOLATIONS_TABLE = 'semantic_eval_safety_violations';

// ── createSafetyRule ─────────────────────────────────────────────

export async function createSafetyRule(
  adminId: string,
  input: SafetyRuleInput,
): Promise<string> {
  const id = generateUlid();

  await db.execute(
    sql`INSERT INTO ${sql.raw(RULES_TABLE)} (
      id, name, description, rule_type, severity, config,
      is_active, trigger_count, last_triggered_at,
      created_by, created_at, updated_at
    ) VALUES (
      ${id}, ${input.name}, ${input.description ?? null},
      ${input.ruleType}, ${input.severity}, ${JSON.stringify(input.config)}::JSONB,
      TRUE, 0, NULL,
      ${adminId}, NOW(), NOW()
    )`,
  );

  return id;
}

// ── updateSafetyRule ─────────────────────────────────────────────

export async function updateSafetyRule(
  ruleId: string,
  input: Partial<SafetyRuleInput>,
): Promise<void> {
  const rule = await getRuleRow(ruleId);
  if (!rule) {
    throw new NotFoundError('Safety rule', ruleId);
  }

  const setClauses: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];

  if (input.name !== undefined) {
    setClauses.push(sql`name = ${input.name}`);
  }
  if (input.description !== undefined) {
    setClauses.push(sql`description = ${input.description}`);
  }
  if (input.ruleType !== undefined) {
    setClauses.push(sql`rule_type = ${input.ruleType}`);
  }
  if (input.severity !== undefined) {
    setClauses.push(sql`severity = ${input.severity}`);
  }
  if (input.config !== undefined) {
    setClauses.push(sql`config = ${JSON.stringify(input.config)}::JSONB`);
  }

  const setClause = sql.join(setClauses, sql`, `);

  await db.execute(
    sql`UPDATE ${sql.raw(RULES_TABLE)} SET ${setClause} WHERE id = ${ruleId}`,
  );
}

// ── toggleSafetyRule ─────────────────────────────────────────────

export async function toggleSafetyRule(
  ruleId: string,
  isActive: boolean,
): Promise<void> {
  const rule = await getRuleRow(ruleId);
  if (!rule) {
    throw new NotFoundError('Safety rule', ruleId);
  }

  await db.execute(
    sql`UPDATE ${sql.raw(RULES_TABLE)}
        SET is_active = ${isActive}, updated_at = NOW()
        WHERE id = ${ruleId}`,
  );
}

// ── listSafetyRules ──────────────────────────────────────────────

export async function listSafetyRules(): Promise<SafetyRule[]> {
  const rows = await db.execute<SafetyRuleRow>(
    sql`SELECT * FROM ${sql.raw(RULES_TABLE)} ORDER BY created_at DESC`,
  );

  return Array.from(rows as Iterable<SafetyRuleRow>).map(mapRule);
}

// ── getSafetyRule ────────────────────────────────────────────────

export async function getSafetyRule(ruleId: string): Promise<SafetyRule | null> {
  const row = await getRuleRow(ruleId);
  if (!row) return null;
  return mapRule(row);
}

// ── evaluateSafety ───────────────────────────────────────────────
// Runs all active safety rules against the given turn data.
// Returns violations found and whether the turn passed all rules.

export async function evaluateSafety(
  turnData: SafetyTurnData,
): Promise<SafetyEvaluationResult> {
  const rules = await getActiveRules();
  const violations: SafetyViolation[] = [];

  for (const rule of rules) {
    const ruleViolations = evaluateRule(rule, turnData);
    violations.push(...ruleViolations);
  }

  return {
    violations,
    passed: violations.length === 0,
  };
}

// ── recordSafetyViolation ────────────────────────────────────────

export async function recordSafetyViolation(
  violation: SafetyViolation & { turnId?: string; tenantId?: string },
): Promise<string> {
  const id = generateUlid();

  await db.execute(
    sql`INSERT INTO ${sql.raw(VIOLATIONS_TABLE)} (
      id, rule_id, rule_name, rule_type, severity, details,
      turn_id, tenant_id, resolved, resolved_by, resolved_at, created_at
    ) VALUES (
      ${id}, ${violation.ruleId}, ${violation.ruleName},
      ${violation.ruleType}, ${violation.severity}, ${violation.details},
      ${violation.turnId ?? null}, ${violation.tenantId ?? null},
      FALSE, NULL, NULL, NOW()
    )`,
  );

  // Increment trigger count on the rule
  await db.execute(
    sql`UPDATE ${sql.raw(RULES_TABLE)}
        SET trigger_count = trigger_count + 1,
            last_triggered_at = NOW(),
            updated_at = NOW()
        WHERE id = ${violation.ruleId}`,
  );

  return id;
}

// ── getSafetyDashboard ───────────────────────────────────────────

export async function getSafetyDashboard(
  dateRange: { start: string; end: string },
): Promise<SafetyDashboardData> {
  // Total and unresolved counts
  const summaryRows = await db.execute<{
    total: string;
    unresolved: string;
  }>(
    sql`SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE resolved = FALSE) AS unresolved
    FROM ${sql.raw(VIOLATIONS_TABLE)}
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ`,
  );

  const summary = Array.from(
    summaryRows as Iterable<{ total: string; unresolved: string }>,
  )[0];

  // By severity
  const severityRows = await db.execute<{ severity: string; count: string }>(
    sql`SELECT severity, COUNT(*) AS count
    FROM ${sql.raw(VIOLATIONS_TABLE)}
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
    GROUP BY severity
    ORDER BY count DESC`,
  );

  // By rule type
  const ruleTypeRows = await db.execute<{ rule_type: string; count: string }>(
    sql`SELECT rule_type, COUNT(*) AS count
    FROM ${sql.raw(VIOLATIONS_TABLE)}
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
    GROUP BY rule_type
    ORDER BY count DESC`,
  );

  // Recent violations
  const recentRows = await db.execute<ViolationRow>(
    sql`SELECT * FROM ${sql.raw(VIOLATIONS_TABLE)}
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
    ORDER BY created_at DESC
    LIMIT 20`,
  );

  // Rule summary
  const ruleSummaryRows = await db.execute<{
    id: string;
    name: string;
    trigger_count: string;
    last_triggered_at: string | null;
  }>(
    sql`SELECT id, name, trigger_count, last_triggered_at::TEXT
    FROM ${sql.raw(RULES_TABLE)}
    WHERE trigger_count > 0
    ORDER BY trigger_count DESC
    LIMIT 20`,
  );

  return {
    totalViolations: summary ? parseInt(summary.total, 10) : 0,
    unresolvedCount: summary ? parseInt(summary.unresolved, 10) : 0,
    bySeverity: Array.from(
      severityRows as Iterable<{ severity: string; count: string }>,
    ).map((r) => ({
      severity: r.severity as SafetySeverity,
      count: parseInt(r.count, 10),
    })),
    byRuleType: Array.from(
      ruleTypeRows as Iterable<{ rule_type: string; count: string }>,
    ).map((r) => ({
      ruleType: r.rule_type as SafetyRuleType,
      count: parseInt(r.count, 10),
    })),
    recentViolations: Array.from(
      recentRows as Iterable<ViolationRow>,
    ).map(mapViolation),
    ruleSummary: Array.from(
      ruleSummaryRows as Iterable<{
        id: string;
        name: string;
        trigger_count: string;
        last_triggered_at: string | null;
      }>,
    ).map((r) => ({
      ruleId: r.id,
      ruleName: r.name,
      triggerCount: parseInt(r.trigger_count, 10),
      lastTriggeredAt: r.last_triggered_at,
    })),
  };
}

// ── resolveViolation ─────────────────────────────────────────────

export async function resolveViolation(
  violationId: string,
  adminId: string,
): Promise<void> {
  const rows = await db.execute<{ id: string }>(
    sql`SELECT id FROM ${sql.raw(VIOLATIONS_TABLE)} WHERE id = ${violationId} LIMIT 1`,
  );

  const items = Array.from(rows as Iterable<{ id: string }>);
  if (items.length === 0) {
    throw new NotFoundError('Safety violation', violationId);
  }

  await db.execute(
    sql`UPDATE ${sql.raw(VIOLATIONS_TABLE)}
        SET resolved = TRUE, resolved_by = ${adminId}, resolved_at = NOW()
        WHERE id = ${violationId}`,
  );
}

// ── listViolations ───────────────────────────────────────────────

export async function listViolations(
  filters: ListViolationsFilters = {},
): Promise<ListViolationsResult> {
  const { resolved, ruleType, severity, cursor, limit = 50 } = filters;
  const pageSize = Math.min(limit, 100);

  const conditions: ReturnType<typeof sql>[] = [sql`1=1`];

  if (resolved !== undefined) {
    conditions.push(sql`resolved = ${resolved}`);
  }
  if (ruleType) {
    conditions.push(sql`rule_type = ${ruleType}`);
  }
  if (severity) {
    conditions.push(sql`severity = ${severity}`);
  }
  if (cursor) {
    conditions.push(sql`id < ${cursor}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const rows = await db.execute<ViolationRow>(
    sql`SELECT * FROM ${sql.raw(VIOLATIONS_TABLE)}
        WHERE ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT ${pageSize + 1}`,
  );

  const items = Array.from(rows as Iterable<ViolationRow>);
  const hasMore = items.length > pageSize;
  const page = hasMore ? items.slice(0, pageSize) : items;

  return {
    violations: page.map(mapViolation),
    cursor: hasMore ? page[page.length - 1]!.id : null,
    hasMore,
  };
}

// ── Internal helpers ─────────────────────────────────────────────

type SafetyRuleRow = {
  id: string;
  name: string;
  description: string | null;
  rule_type: string;
  severity: string;
  config: unknown;
  is_active: boolean;
  trigger_count: string;
  last_triggered_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

type ViolationRow = {
  id: string;
  rule_id: string;
  rule_name: string;
  rule_type: string;
  severity: string;
  details: string;
  turn_id: string | null;
  tenant_id: string | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  [key: string]: unknown;
};

async function getRuleRow(ruleId: string): Promise<SafetyRuleRow | null> {
  const rows = await db.execute<SafetyRuleRow>(
    sql`SELECT * FROM ${sql.raw(RULES_TABLE)} WHERE id = ${ruleId} LIMIT 1`,
  );

  const items = Array.from(rows as Iterable<SafetyRuleRow>);
  return items[0] ?? null;
}

async function getActiveRules(): Promise<SafetyRule[]> {
  const rows = await db.execute<SafetyRuleRow>(
    sql`SELECT * FROM ${sql.raw(RULES_TABLE)} WHERE is_active = TRUE ORDER BY severity DESC`,
  );

  return Array.from(rows as Iterable<SafetyRuleRow>).map(mapRule);
}

function evaluateRule(
  rule: SafetyRule,
  turnData: SafetyTurnData,
): SafetyViolation[] {
  const violations: SafetyViolation[] = [];

  switch (rule.ruleType) {
    case 'pii_detection':
      violations.push(...evaluatePiiDetection(rule, turnData));
      break;
    case 'injection_detection':
      violations.push(...evaluateInjectionDetection(rule, turnData));
      break;
    case 'table_access':
      violations.push(...evaluateTableAccess(rule, turnData));
      break;
    case 'row_limit':
      violations.push(...evaluateRowLimit(rule, turnData));
      break;
    case 'custom_regex':
      violations.push(...evaluateCustomRegex(rule, turnData));
      break;
  }

  return violations;
}

function evaluatePiiDetection(
  rule: SafetyRule,
  turnData: SafetyTurnData,
): SafetyViolation[] {
  const config = rule.config as PiiDetectionConfig;
  const violations: SafetyViolation[] = [];

  // Check result sample for PII patterns
  const resultText = turnData.resultSample
    ? JSON.stringify(turnData.resultSample)
    : '';

  // Also check the compiled SQL for potential PII exposure
  const textsToCheck = [resultText, turnData.compiledSql ?? ''];

  for (const pattern of config.patterns) {
    try {
      const regex = new RegExp(pattern, 'gi');
      for (const text of textsToCheck) {
        if (text && regex.test(text)) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            ruleType: rule.ruleType,
            severity: rule.severity,
            details: `PII pattern matched: ${pattern}`,
          });
          break; // One violation per pattern is enough
        }
      }
    } catch {
      // Skip invalid regex patterns
    }
  }

  return violations;
}

function evaluateInjectionDetection(
  rule: SafetyRule,
  turnData: SafetyTurnData,
): SafetyViolation[] {
  const config = rule.config as InjectionDetectionConfig;
  const violations: SafetyViolation[] = [];

  const messageLC = turnData.userMessage.toLowerCase();

  for (const keyword of config.keywords) {
    if (messageLC.includes(keyword.toLowerCase())) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity: rule.severity,
        details: `Potential injection detected: keyword '${keyword}' found in user message`,
      });
    }
  }

  // Also check the compiled SQL for suspicious patterns
  if (turnData.compiledSql) {
    const sqlLC = turnData.compiledSql.toLowerCase();
    for (const keyword of config.keywords) {
      if (sqlLC.includes(keyword.toLowerCase())) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          ruleType: rule.ruleType,
          severity: rule.severity,
          details: `Potential injection detected: keyword '${keyword}' found in compiled SQL`,
        });
      }
    }
  }

  return violations;
}

function evaluateTableAccess(
  rule: SafetyRule,
  turnData: SafetyTurnData,
): SafetyViolation[] {
  const config = rule.config as TableAccessConfig;
  const violations: SafetyViolation[] = [];

  if (!turnData.tablesAccessed || turnData.tablesAccessed.length === 0) {
    return violations;
  }

  for (const table of turnData.tablesAccessed) {
    // Check if table is in the blocked list
    if (config.blockedTables.length > 0 && config.blockedTables.includes(table)) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity: rule.severity,
        details: `Blocked table accessed: ${table}`,
      });
    }

    // Check if table is NOT in the allowed list (when allowedTables is non-empty)
    if (
      config.allowedTables.length > 0 &&
      !config.allowedTables.includes(table)
    ) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity: rule.severity,
        details: `Unauthorized table accessed: ${table} (not in allowed list)`,
      });
    }
  }

  return violations;
}

function evaluateRowLimit(
  rule: SafetyRule,
  turnData: SafetyTurnData,
): SafetyViolation[] {
  const config = rule.config as RowLimitConfig;
  const violations: SafetyViolation[] = [];

  if (
    turnData.rowCount !== undefined &&
    turnData.rowCount !== null &&
    turnData.rowCount > config.maxRows
  ) {
    violations.push({
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.ruleType,
      severity: rule.severity,
      details: `Row limit exceeded: ${turnData.rowCount} rows returned, maximum is ${config.maxRows}`,
    });
  }

  return violations;
}

function evaluateCustomRegex(
  rule: SafetyRule,
  turnData: SafetyTurnData,
): SafetyViolation[] {
  const config = rule.config as CustomRegexConfig;
  const violations: SafetyViolation[] = [];

  try {
    const regex = new RegExp(config.pattern, config.flags);

    // Check user message
    if (regex.test(turnData.userMessage)) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity: rule.severity,
        details: `Custom regex matched in user message: /${config.pattern}/${config.flags}`,
      });
    }

    // Check compiled SQL
    if (turnData.compiledSql && regex.test(turnData.compiledSql)) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType,
        severity: rule.severity,
        details: `Custom regex matched in compiled SQL: /${config.pattern}/${config.flags}`,
      });
    }

    // Check result sample
    if (turnData.resultSample) {
      const resultText = JSON.stringify(turnData.resultSample);
      if (regex.test(resultText)) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          ruleType: rule.ruleType,
          severity: rule.severity,
          details: `Custom regex matched in query results: /${config.pattern}/${config.flags}`,
        });
      }
    }
  } catch {
    // Skip invalid regex patterns
  }

  return violations;
}

function mapRule(row: SafetyRuleRow): SafetyRule {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ruleType: row.rule_type as SafetyRuleType,
    severity: row.severity as SafetySeverity,
    config: row.config as SafetyRuleConfig,
    isActive: row.is_active,
    triggerCount: parseInt(row.trigger_count, 10),
    lastTriggeredAt: row.last_triggered_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapViolation(row: ViolationRow): PersistedViolation {
  return {
    id: row.id,
    ruleId: row.rule_id,
    ruleName: row.rule_name,
    ruleType: row.rule_type as SafetyRuleType,
    severity: row.severity as SafetySeverity,
    details: row.details,
    turnId: row.turn_id,
    tenantId: row.tenant_id,
    resolved: row.resolved,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}
