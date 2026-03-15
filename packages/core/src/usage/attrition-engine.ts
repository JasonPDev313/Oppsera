/**
 * Attrition Engine — scores every active tenant's health (0–100, higher = better)
 * across 8 risk signals, then generates a narrative summary explaining
 * why each tenant may be at risk. Internal risk score (0–100) is inverted
 * to a health score for display: health = 100 – riskScore.
 *
 * Signals (weighted):
 *  1. Login decline          (20%) — login frequency drop 30d vs prior 30d
 *  2. Usage decline          (20%) — API request volume trending down
 *  3. Module abandonment     (15%) — modules going dark (no activity 14+ days)
 *  4. User shrinkage         (15%) — fewer unique users period-over-period
 *  5. Error frustration      (10%) — elevated error rates may drive users away
 *  6. Breadth narrowing      (10%) — using fewer modules than before
 *  7. Staleness              (5%)  — days since any activity
 *  8. Onboarding stall       (5%)  — never completed onboarding
 */
import { createAdminClient, sqlArray } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

type AdminDb = ReturnType<typeof createAdminClient>;

/**
 * Get the admin DB client for cross-tenant operations.
 * The scoring engine reads locations, memberships, login_records, and rm_usage_*
 * tables across ALL tenants — these all have FORCE ROW LEVEL SECURITY enabled.
 * Without an admin (RLS-bypass) connection, correlated subqueries return 0 rows
 * because no app.current_tenant_id is set.
 */
function getAdminDb(): AdminDb {
  return createAdminClient();
}

// ── Types ────────────────────────────────────────────────────────

interface TenantSnapshot {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  industry: string | null;
  healthGrade: string | null;
  totalLocations: number;
  totalUsers: number;
  onboardingStatus: string;
  lastActivityAt: string | null;
  createdAt: string | null;
}

interface SignalResult {
  score: number; // 0-100, always integer, never NaN
  detail: Record<string, unknown>;
  fragments: string[]; // narrative fragments
}

interface ScoredTenant {
  tenant: TenantSnapshot;
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  signals: {
    loginDecline: SignalResult;
    usageDecline: SignalResult;
    moduleAbandonment: SignalResult;
    userShrinkage: SignalResult;
    errorFrustration: SignalResult;
    breadthNarrowing: SignalResult;
    staleness: SignalResult;
    onboardingStall: SignalResult;
  };
  activeModules: number;
  narrative: string;
}

const WEIGHTS = {
  loginDecline: 0.20,
  usageDecline: 0.20,
  moduleAbandonment: 0.15,
  userShrinkage: 0.15,
  errorFrustration: 0.10,
  breadthNarrowing: 0.10,
  staleness: 0.05,
  onboardingStall: 0.05,
} as const;

const MAX_NARRATIVE_LENGTH = 2000;
const INSERT_BATCH_SIZE = 50; // insert batch size to avoid oversized queries
const FETCH_CHUNK_SIZE = 500; // max tenant IDs per ANY() clause
const MAX_TENANTS = 5000; // safety cap — prevents unbounded work on Vercel
const SCORING_LOCK_ID = 839271; // advisory lock ID for concurrency guard
const NEW_TENANT_DAYS = 30; // tenants younger than this don't get no-data penalties

function riskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

/** Clamp to 0–100 integer, NaN-safe (defaults to 0). */
function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Safe percentage: (a-b)/b * 100. Returns 0 if b is 0 or result is NaN. */
function safePctChange(current: number, prior: number): number {
  if (prior <= 0) return 0;
  const pct = ((prior - current) / prior) * 100;
  return Number.isFinite(pct) ? pct : 0;
}

// ── Public API ───────────────────────────────────────────────────

export interface ScoringResult {
  scored: number;
  highRisk: number;
  errors: number;
  dataAvailability: {
    loginTenants: number;
    usageTenants: number;
    adoptionTenants: number;
    breadthTenants: number;
    errorTenants: number;
    totalTenants: number;
  };
  elapsedMs: number;
}

export async function scoreAllTenants(): Promise<ScoringResult> {
  return await doScoring();
}

async function doScoring(): Promise<ScoringResult> {
  const t0 = Date.now();
  const adminDb = getAdminDb();

  // 1. Get all active tenants (capped to prevent unbounded work on serverless)
  const allTenants = await getActiveTenants(adminDb);
  if (allTenants.length === 0) {
    return {
      scored: 0, highRisk: 0, errors: 0, elapsedMs: Date.now() - t0,
      dataAvailability: { loginTenants: 0, usageTenants: 0, adoptionTenants: 0, breadthTenants: 0, errorTenants: 0, totalTenants: 0 },
    };
  }

  const tenants = allTenants.length > MAX_TENANTS ? allTenants.slice(0, MAX_TENANTS) : allTenants;
  if (allTenants.length > MAX_TENANTS) {
    console.warn(`[Attrition] Capped scoring to ${MAX_TENANTS} of ${allTenants.length} tenants`);
  }

  const tenantIds = tenants.map((t) => t.tenantId);

  // 2. Batch-fetch all signal data in parallel — each fetcher is individually
  //    resilient so a single table failure doesn't kill the entire scoring run.
  const [loginData, usageData, adoptionData, workflowData, errorData] = await Promise.all([
    safeFetch('loginData', () => batchLoginData(adminDb, tenantIds)),
    safeFetch('usageData', () => batchUsageData(adminDb, tenantIds)),
    safeFetch('adoptionData', () => batchAdoptionData(adminDb, tenantIds)),
    safeFetch('workflowData', () => batchWorkflowBreadth(adminDb, tenantIds)),
    safeFetch('errorData', () => batchErrorData(adminDb, tenantIds)),
  ]);

  // Log data availability for observability — helps diagnose empty-signal issues
  const dataAvail = {
    loginTenants: Object.keys(loginData).length,
    usageTenants: Object.keys(usageData).length,
    adoptionTenants: Object.keys(adoptionData).length,
    breadthTenants: Object.keys(workflowData).length,
    errorTenants: Object.keys(errorData).length,
    totalTenants: tenants.length,
  };
  console.log(`[Attrition] Data availability:`, JSON.stringify(dataAvail));

  // 3. Score each tenant — isolate errors per tenant
  const scored: ScoredTenant[] = [];
  let scoreErrors = 0;

  for (const tenant of tenants) {
    try {
      const tid = tenant.tenantId;
      const signals = {
        loginDecline: scoreLoginDecline(loginData[tid]),
        usageDecline: scoreUsageDecline(usageData[tid]),
        moduleAbandonment: scoreModuleAbandonment(adoptionData[tid]),
        userShrinkage: scoreUserShrinkage(usageData[tid]),
        errorFrustration: scoreErrorFrustration(errorData[tid]),
        breadthNarrowing: scoreBreadthNarrowing(workflowData[tid]),
        staleness: scoreStaleness(tenant),
        onboardingStall: scoreOnboardingStall(tenant),
      };

      // For new tenants (<30 days), cap "no data" penalty scores at 50% instead
      // of blanking them entirely. This preserves signal visibility in the UI while
      // reducing noise from genuinely new tenants. Full zeroing hid real issues
      // (e.g., tenant with locations/users but no usage data still showed score=7).
      const tenantAgeMs = tenant.createdAt ? Date.now() - new Date(tenant.createdAt).getTime() : Infinity;
      const isNewTenant = Number.isFinite(tenantAgeMs) && tenantAgeMs < NEW_TENANT_DAYS * 86400000;

      if (isNewTenant) {
        for (const signal of Object.values(signals)) {
          if (signal.detail.reason && String(signal.detail.reason).startsWith('no_')) {
            signal.score = clamp(signal.score * 0.5);
            signal.detail.newTenantCapped = true;
          }
        }
      }

      // Weighted score from all signals
      const weightedScore = Object.entries(WEIGHTS).reduce(
        (sum, [key, weight]) => sum + signals[key as keyof typeof signals].score * weight,
        0,
      );

      // Floor for "never used" tenants: when usage-based signals are all 0 because
      // there's no prior data (not because usage is healthy), the weighted score
      // is misleadingly low. A tenant with high staleness and/or onboarding stall
      // but zero usage signals is clearly at risk — apply a minimum floor.
      const usageBasedSignals = [
        signals.loginDecline, signals.usageDecline,
        signals.userShrinkage, signals.breadthNarrowing,
      ];
      const allUsageSignalsZero = usageBasedSignals.every((s) => s.score === 0);
      const hasHighInactivitySignal = signals.staleness.score >= 60 || signals.onboardingStall.score >= 40;

      let overallScore: number;
      if (allUsageSignalsZero && hasHighInactivitySignal) {
        // Use the average of the two inactivity signals as a floor
        const inactivityAvg = (signals.staleness.score + signals.onboardingStall.score) / 2;
        overallScore = clamp(Math.max(weightedScore, inactivityAvg));
      } else {
        overallScore = clamp(weightedScore);
      }

      const activeModuleCount = adoptionData[tid]?.activeCount ?? 0;
      const narrative = buildNarrative(tenant, signals, overallScore, isNewTenant);

      scored.push({
        tenant,
        overallScore,
        riskLevel: riskLevel(overallScore),
        signals,
        activeModules: activeModuleCount,
        narrative,
      });
    } catch (err) {
      scoreErrors++;
      console.error(`[Attrition] Failed to score tenant ${tenant.tenantId}:`, err);
    }
  }

  // 4. Atomic write: acquire xact-scoped advisory lock, supersede old scores, insert new.
  //    pg_try_advisory_xact_lock is transaction-scoped (auto-released on commit/rollback),
  //    so it works correctly with Supavisor transaction-mode pooling.
  //    If ANY batch fails, the entire transaction rolls back — no scores orphaned.
  //    Uses adminDb for the write transaction too — attrition_risk_scores may have RLS.
  const scoredTenantIds = scored.map((s) => s.tenant.tenantId);

  await adminDb.transaction(async (tx) => {
    // Statement timeout: prevent this transaction from holding a connection
    // indefinitely if Vercel freezes the event loop mid-write.
    await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);

    // Concurrency guard — prevents duplicate scoring runs
    const lockResult = await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(${SCORING_LOCK_ID}) AS acquired`,
    );
    const lockArr = Array.from(lockResult as Iterable<Record<string, unknown>>);
    if (!lockArr[0]?.acquired) {
      throw new Error('SCORING_IN_PROGRESS');
    }

    // Supersede old open scores (chunked for large tenant sets)
    for (let i = 0; i < scoredTenantIds.length; i += FETCH_CHUNK_SIZE) {
      const chunk = scoredTenantIds.slice(i, i + FETCH_CHUNK_SIZE);
      await tx.execute(sql`
        UPDATE attrition_risk_scores
        SET status = 'superseded', updated_at = NOW()
        WHERE tenant_id = ANY(${sqlArray(chunk)})
          AND status = 'open'
      `);
    }

    // Insert new scores in batches
    for (let i = 0; i < scored.length; i += INSERT_BATCH_SIZE) {
      const batch = scored.slice(i, i + INSERT_BATCH_SIZE);
      await insertBatch(tx, batch);
    }
  });

  const highRisk = scored.filter((s) => s.overallScore >= 50).length;
  const elapsed = Date.now() - t0;
  console.log(`[Attrition] Scored ${scored.length} tenants in ${elapsed}ms (${highRisk} high-risk, ${scoreErrors} errors)`);
  return { scored: scored.length, highRisk, errors: scoreErrors, dataAvailability: dataAvail, elapsedMs: elapsed };
}

/** Wraps a data fetcher so a single table failure returns empty data instead of crashing the run. */
async function safeFetch<T extends Record<string, unknown>>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[Attrition] ${label} fetch failed (scoring will continue with empty data):`, err);
    return {} as T;
  }
}

/** Insert a batch of scored tenants using multi-row VALUES in one statement. */
async function insertBatch(tx: Parameters<Parameters<AdminDb['transaction']>[0]>[0], batch: ScoredTenant[]): Promise<void> {
  if (batch.length === 0) return;

  const valuesClauses = batch.map((s) => {
    const id = generateUlid();
    const details = JSON.stringify({
      loginDecline: s.signals.loginDecline.detail,
      usageDecline: s.signals.usageDecline.detail,
      moduleAbandonment: s.signals.moduleAbandonment.detail,
      userShrinkage: s.signals.userShrinkage.detail,
      errorFrustration: s.signals.errorFrustration.detail,
      breadthNarrowing: s.signals.breadthNarrowing.detail,
      staleness: s.signals.staleness.detail,
      onboardingStall: s.signals.onboardingStall.detail,
    });

    return sql`(
      ${id}, ${s.tenant.tenantId}, ${s.overallScore}, ${s.riskLevel},
      ${s.signals.loginDecline.score}, ${s.signals.usageDecline.score},
      ${s.signals.moduleAbandonment.score}, ${s.signals.userShrinkage.score},
      ${s.signals.errorFrustration.score}, ${s.signals.breadthNarrowing.score},
      ${s.signals.staleness.score}, ${s.signals.onboardingStall.score},
      ${details}::jsonb, ${s.narrative},
      ${s.tenant.tenantName}, ${s.tenant.tenantStatus},
      ${s.tenant.industry}, ${s.tenant.healthGrade},
      ${s.tenant.totalLocations}, ${s.tenant.totalUsers},
      ${s.activeModules}, ${s.tenant.lastActivityAt}::timestamptz,
      NOW(), 'open', NOW(), NOW()
    )`;
  });

  await tx.execute(sql`
    INSERT INTO attrition_risk_scores (
      id, tenant_id, overall_score, risk_level,
      login_decline_score, usage_decline_score, module_abandonment_score,
      user_shrinkage_score, error_frustration_score, breadth_narrowing_score,
      staleness_score, onboarding_stall_score,
      signal_details, narrative,
      tenant_name, tenant_status, industry, health_grade,
      total_locations, total_users, active_modules, last_activity_at,
      scored_at, status, created_at, updated_at
    ) VALUES ${sql.join(valuesClauses, sql`, `)}
  `);
}

// ── Data Fetchers (batch for all tenants) ────────────────────────
// All fetchers accept an adminDb parameter to bypass RLS. Every table queried
// here (tenants, locations, memberships, login_records, rm_usage_*) has
// FORCE ROW LEVEL SECURITY enabled. Without the admin connection, correlated
// subqueries silently return 0 because no app.current_tenant_id is set.

async function getActiveTenants(adminDb: AdminDb): Promise<TenantSnapshot[]> {
  const rows = await adminDb.execute(sql`
    SELECT
      t.id AS tenant_id,
      t.name AS tenant_name,
      COALESCE(t.status, 'active') AS tenant_status,
      t.industry,
      t.health_grade,
      (SELECT COUNT(*)::int FROM locations WHERE tenant_id = t.id AND is_active = true) AS total_locations,
      (SELECT COUNT(*)::int FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = t.id AND m.status = 'active') AS total_users,
      COALESCE(t.onboarding_status, 'pending') AS onboarding_status,
      -- Also fetch entitlement count as a proxy for module setup
      (SELECT COUNT(*)::int FROM entitlements WHERE tenant_id = t.id AND is_active = true) AS total_entitlements,
      GREATEST(
        t.last_activity_at,
        (SELECT MAX(created_at) FROM login_records WHERE tenant_id = t.id AND outcome = 'success'),
        (SELECT MAX(usage_date)::timestamptz FROM rm_usage_daily WHERE tenant_id = t.id),
        (SELECT MAX(created_at) FROM orders WHERE tenant_id = t.id)
      )::text AS last_activity_at,
      t.created_at::text AS created_at
    FROM tenants t
    WHERE t.status IN ('active', 'trial')
    ORDER BY t.name
  `);
  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => {
    const totalLocations = Number(r.total_locations) || 0;
    const totalUsers = Number(r.total_users) || 0;
    const totalEntitlements = Number(r.total_entitlements) || 0;
    const rawOnboarding = String(r.onboarding_status ?? 'pending');

    // Auto-detect onboarding completion: if a tenant has locations + users +
    // entitlements but onboarding_status is still 'pending', infer 'completed'.
    // This prevents false positives from tenants set up outside the formal
    // onboarding wizard (admin-created, seeded, or API-provisioned).
    const onboardingStatus = deriveOnboardingStatus(rawOnboarding, totalLocations, totalUsers, totalEntitlements);

    return {
      tenantId: String(r.tenant_id),
      tenantName: String(r.tenant_name),
      tenantStatus: String(r.tenant_status),
      industry: r.industry ? String(r.industry) : null,
      healthGrade: r.health_grade ? String(r.health_grade) : null,
      totalLocations,
      totalUsers,
      onboardingStatus,
      lastActivityAt: r.last_activity_at ? String(r.last_activity_at) : null,
      createdAt: r.created_at ? String(r.created_at) : null,
    };
  });
}

/**
 * Derive effective onboarding status from raw DB value + actual tenant state.
 *
 * Rules:
 *  - 'completed' or 'stalled' in DB → trust it (explicit admin action)
 *  - 'pending' but tenant has locations + users + entitlements → 'completed'
 *  - 'pending' but tenant has some setup (locations OR users) → 'in_progress'
 *  - 'in_progress' but tenant has locations + users + entitlements → 'completed'
 *  - otherwise → use raw value
 */
function deriveOnboardingStatus(
  raw: string,
  locations: number,
  users: number,
  entitlements: number,
): string {
  // Explicit terminal states from the admin onboarding flow — trust them
  if (raw === 'completed' || raw === 'stalled') return raw;

  const hasLocations = locations > 0;
  const hasUsers = users > 0;
  const hasEntitlements = entitlements > 0;
  const fullySetUp = hasLocations && hasUsers && hasEntitlements;

  if (fullySetUp) return 'completed';
  if (hasLocations || hasUsers || hasEntitlements) return 'in_progress';
  return raw;
}

interface LoginBatch { [tenantId: string]: { current: number; prior: number } }

async function batchLoginData(adminDb: AdminDb, tenantIds: string[]): Promise<LoginBatch> {
  if (tenantIds.length === 0) return {};
  const result: LoginBatch = {};
  for (let i = 0; i < tenantIds.length; i += FETCH_CHUNK_SIZE) {
    const chunk = tenantIds.slice(i, i + FETCH_CHUNK_SIZE);
    const rows = await adminDb.execute(sql`
      SELECT
        tenant_id,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS current_logins,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days')::int AS prior_logins
      FROM login_records
      WHERE tenant_id = ANY(${sqlArray(chunk)})
        AND created_at >= NOW() - INTERVAL '60 days'
      GROUP BY tenant_id
    `);
    for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
      result[String(r.tenant_id)] = {
        current: Number(r.current_logins) || 0,
        prior: Number(r.prior_logins) || 0,
      };
    }
  }
  return result;
}

interface UsageBatch {
  [tenantId: string]: {
    currentRequests: number;
    priorRequests: number;
    currentUsers: number;
    priorUsers: number;
  };
}

async function batchUsageData(adminDb: AdminDb, tenantIds: string[]): Promise<UsageBatch> {
  if (tenantIds.length === 0) return {};
  const result: UsageBatch = {};
  for (let i = 0; i < tenantIds.length; i += FETCH_CHUNK_SIZE) {
    const chunk = tenantIds.slice(i, i + FETCH_CHUNK_SIZE);
    const rows = await adminDb.execute(sql`
      SELECT
        tenant_id,
        COALESCE(SUM(request_count) FILTER (WHERE usage_date >= CURRENT_DATE - 30), 0)::int AS current_requests,
        COALESCE(SUM(request_count) FILTER (WHERE usage_date >= CURRENT_DATE - 60 AND usage_date < CURRENT_DATE - 30), 0)::int AS prior_requests,
        COALESCE(SUM(unique_users) FILTER (WHERE usage_date >= CURRENT_DATE - 30), 0)::int AS current_users,
        COALESCE(SUM(unique_users) FILTER (WHERE usage_date >= CURRENT_DATE - 60 AND usage_date < CURRENT_DATE - 30), 0)::int AS prior_users
      FROM rm_usage_daily
      WHERE tenant_id = ANY(${sqlArray(chunk)})
        AND usage_date >= CURRENT_DATE - 60
      GROUP BY tenant_id
    `);
    for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
      result[String(r.tenant_id)] = {
        currentRequests: Number(r.current_requests) || 0,
        priorRequests: Number(r.prior_requests) || 0,
        currentUsers: Number(r.current_users) || 0,
        priorUsers: Number(r.prior_users) || 0,
      };
    }
  }
  return result;
}

interface AdoptionBatch {
  [tenantId: string]: {
    activeCount: number;
    totalCount: number;
    abandonedModules: string[];
    lastUsedDaysAgo: Record<string, number>;
  };
}

async function batchAdoptionData(adminDb: AdminDb, tenantIds: string[]): Promise<AdoptionBatch> {
  if (tenantIds.length === 0) return {};
  const result: AdoptionBatch = {};
  for (let i = 0; i < tenantIds.length; i += FETCH_CHUNK_SIZE) {
    const chunk = tenantIds.slice(i, i + FETCH_CHUNK_SIZE);
    const rows = await adminDb.execute(sql`
      SELECT
        tenant_id,
        module_key,
        last_used_at,
        EXTRACT(EPOCH FROM (NOW() - last_used_at)) / 86400 AS days_since_use
      FROM rm_usage_module_adoption
      WHERE tenant_id = ANY(${sqlArray(chunk)})
    `);
    for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
      const tid = String(r.tenant_id);
      if (!result[tid]) {
        result[tid] = { activeCount: 0, totalCount: 0, abandonedModules: [], lastUsedDaysAgo: {} };
      }
      result[tid].totalCount++;
      const daysSince = Number(r.days_since_use) || 999;
      result[tid].lastUsedDaysAgo[String(r.module_key)] = Math.round(daysSince);
      // A module is "active" only if enabled AND used within the last 14 days.
      // This prevents double-counting: a module that is enabled but unused > 14 days
      // should NOT inflate activeCount while also appearing in abandonedModules.
      if (daysSince <= 14) {
        result[tid].activeCount++;
      } else {
        result[tid].abandonedModules.push(String(r.module_key));
      }
    }
  }
  return result;
}

interface BreadthBatch {
  [tenantId: string]: { currentModules: number; priorModules: number };
}

async function batchWorkflowBreadth(adminDb: AdminDb, tenantIds: string[]): Promise<BreadthBatch> {
  if (tenantIds.length === 0) return {};
  const result: BreadthBatch = {};
  for (let i = 0; i < tenantIds.length; i += FETCH_CHUNK_SIZE) {
    const chunk = tenantIds.slice(i, i + FETCH_CHUNK_SIZE);
    const rows = await adminDb.execute(sql`
      SELECT
        tenant_id,
        (COUNT(DISTINCT module_key) FILTER (WHERE usage_date >= CURRENT_DATE - 30))::int AS current_modules,
        (COUNT(DISTINCT module_key) FILTER (WHERE usage_date >= CURRENT_DATE - 60 AND usage_date < CURRENT_DATE - 30))::int AS prior_modules
      FROM rm_usage_daily
      WHERE tenant_id = ANY(${sqlArray(chunk)})
        AND usage_date >= CURRENT_DATE - 60
      GROUP BY tenant_id
    `);
    for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
      result[String(r.tenant_id)] = {
        currentModules: Number(r.current_modules) || 0,
        priorModules: Number(r.prior_modules) || 0,
      };
    }
  }
  return result;
}

interface ErrorBatch {
  [tenantId: string]: { errorRate: number; totalErrors: number; totalRequests: number };
}

async function batchErrorData(adminDb: AdminDb, tenantIds: string[]): Promise<ErrorBatch> {
  if (tenantIds.length === 0) return {};
  const result: ErrorBatch = {};
  for (let i = 0; i < tenantIds.length; i += FETCH_CHUNK_SIZE) {
    const chunk = tenantIds.slice(i, i + FETCH_CHUNK_SIZE);
    const rows = await adminDb.execute(sql`
      SELECT
        tenant_id,
        COALESCE(SUM(request_count), 0)::int AS total_requests,
        COALESCE(SUM(error_count), 0)::int AS total_errors,
        CASE WHEN SUM(request_count) > 0
          THEN (SUM(error_count)::numeric / SUM(request_count) * 100)
          ELSE 0
        END AS error_rate
      FROM rm_usage_daily
      WHERE tenant_id = ANY(${sqlArray(chunk)})
        AND usage_date >= CURRENT_DATE - 30
      GROUP BY tenant_id
    `);
    for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
      const rate = Number(r.error_rate);
      result[String(r.tenant_id)] = {
        errorRate: Number.isFinite(rate) ? Number(rate.toFixed(2)) : 0,
        totalErrors: Number(r.total_errors) || 0,
        totalRequests: Number(r.total_requests) || 0,
      };
    }
  }
  return result;
}

// ── Signal Scorers ───────────────────────────────────────────────

function scoreLoginDecline(data?: { current: number; prior: number }): SignalResult {
  if (!data || (data.current === 0 && data.prior === 0)) {
    return { score: 50, detail: { current: 0, prior: 0, reason: 'no_login_data' }, fragments: ['No login data recorded — unable to track login trends.'] };
  }
  if (data.prior === 0) {
    // New tenant with logins only in current window — not declining
    return { score: 0, detail: data, fragments: [] };
  }
  const declinePct = safePctChange(data.current, data.prior);
  const score = clamp(declinePct * 1.5); // 66% decline = 100
  const fragments: string[] = [];
  if (declinePct > 30) {
    fragments.push(`Logins dropped ${Math.round(declinePct)}% (${data.prior} → ${data.current}) in the last 30 days.`);
  }
  return { score, detail: { ...data, declinePct: Math.round(declinePct) }, fragments };
}

function scoreUsageDecline(data?: UsageBatch[string]): SignalResult {
  if (!data || (data.currentRequests === 0 && data.priorRequests === 0)) {
    return { score: 40, detail: { reason: 'no_usage_data' }, fragments: ['No API usage recorded in the last 60 days.'] };
  }
  if (data.priorRequests === 0) {
    return { score: 0, detail: data, fragments: [] };
  }
  const declinePct = safePctChange(data.currentRequests, data.priorRequests);
  const score = clamp(declinePct * 1.5);
  const fragments: string[] = [];
  if (declinePct > 20) {
    fragments.push(`API usage declined ${Math.round(declinePct)}% (${data.priorRequests.toLocaleString()} → ${data.currentRequests.toLocaleString()} requests).`);
  }
  return { score, detail: { ...data, declinePct: Math.round(declinePct) }, fragments };
}

function scoreModuleAbandonment(data?: AdoptionBatch[string]): SignalResult {
  if (!data || data.totalCount === 0) {
    return { score: 0, detail: { reason: 'no_modules' }, fragments: [] };
  }
  const abandonedPct = (data.abandonedModules.length / data.totalCount) * 100;
  const score = clamp(abandonedPct * 1.2);
  const fragments: string[] = [];
  if (data.abandonedModules.length > 0) {
    // Cap module list to prevent oversized narratives
    const shown = data.abandonedModules.slice(0, 5);
    const extra = data.abandonedModules.length - shown.length;
    const suffix = extra > 0 ? ` (+${extra} more)` : '';
    fragments.push(`${data.abandonedModules.length} module(s) abandoned (no activity 14+ days): ${shown.join(', ')}${suffix}.`);
  }
  return {
    score,
    detail: { abandoned: data.abandonedModules, total: data.totalCount, abandonedPct: Math.round(abandonedPct) },
    fragments,
  };
}

function scoreUserShrinkage(data?: UsageBatch[string]): SignalResult {
  if (!data || (data.currentUsers === 0 && data.priorUsers === 0)) {
    return { score: 30, detail: { reason: 'no_user_data' }, fragments: ['No unique user data available.'] };
  }
  if (data.priorUsers === 0) {
    return { score: 0, detail: data, fragments: [] };
  }
  const declinePct = safePctChange(data.currentUsers, data.priorUsers);
  const score = clamp(declinePct * 2); // 50% decline = 100
  const fragments: string[] = [];
  if (declinePct > 20) {
    fragments.push(`Active users dropped ${Math.round(declinePct)}% (${data.priorUsers} → ${data.currentUsers}).`);
  }
  return { score, detail: { currentUsers: data.currentUsers, priorUsers: data.priorUsers, declinePct: Math.round(declinePct) }, fragments };
}

function scoreErrorFrustration(data?: ErrorBatch[string]): SignalResult {
  if (!data || data.totalRequests === 0) {
    return { score: 0, detail: { reason: 'no_data' }, fragments: [] };
  }
  // >5% error rate starts scoring, >15% = 100
  const score = clamp((data.errorRate - 5) * 10);
  const fragments: string[] = [];
  if (data.errorRate > 5) {
    fragments.push(`High error rate of ${data.errorRate.toFixed(1)}% (${data.totalErrors} errors) — may be causing user frustration.`);
  }
  return { score, detail: data, fragments };
}

function scoreBreadthNarrowing(data?: BreadthBatch[string]): SignalResult {
  if (!data || (data.currentModules === 0 && data.priorModules === 0)) {
    return { score: 30, detail: { reason: 'no_breadth_data' }, fragments: ['No module breadth data available.'] };
  }
  if (data.priorModules === 0) {
    return { score: 0, detail: data, fragments: [] };
  }
  const dropped = data.priorModules - data.currentModules;
  if (dropped <= 0) {
    return { score: 0, detail: data, fragments: [] };
  }
  const pct = (dropped / data.priorModules) * 100;
  const score = clamp(pct * 1.5);
  const fragments: string[] = [];
  fragments.push(`Using ${dropped} fewer module(s) than last month (${data.priorModules} → ${data.currentModules}).`);
  return { score, detail: { ...data, dropped, declinePct: Math.round(pct) }, fragments };
}

function scoreStaleness(tenant: TenantSnapshot): SignalResult {
  if (!tenant.lastActivityAt) {
    return { score: 80, detail: { reason: 'never_active' }, fragments: ['No recorded activity — tenant may have never used the platform.'] };
  }
  const ms = Date.now() - new Date(tenant.lastActivityAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return { score: 0, detail: { reason: 'invalid_date', lastActivityAt: tenant.lastActivityAt }, fragments: [] };
  }
  const daysSince = Math.round(ms / 86400000);
  let score = 0;
  if (daysSince > 30) score = 100;
  else if (daysSince > 14) score = clamp((daysSince - 14) * 6);
  else if (daysSince > 7) score = clamp((daysSince - 7) * 3);

  const fragments: string[] = [];
  if (daysSince > 7) {
    fragments.push(`Last activity was ${daysSince} day(s) ago.`);
  }
  return { score, detail: { daysSinceLastActivity: daysSince, lastActivityAt: tenant.lastActivityAt }, fragments };
}

function scoreOnboardingStall(tenant: TenantSnapshot): SignalResult {
  if (tenant.onboardingStatus === 'completed') {
    return { score: 0, detail: { onboardingStatus: 'completed' }, fragments: [] };
  }
  if (tenant.onboardingStatus === 'stalled') {
    return { score: 100, detail: { onboardingStatus: 'stalled' }, fragments: ['Onboarding is stalled — tenant never completed setup.'] };
  }
  if (tenant.onboardingStatus === 'in_progress') {
    return { score: 40, detail: { onboardingStatus: 'in_progress' }, fragments: ['Onboarding still in progress — may need assistance.'] };
  }
  // pending or unknown
  return { score: 60, detail: { onboardingStatus: tenant.onboardingStatus }, fragments: ['Onboarding never started.'] };
}

// ── Narrative Builder ────────────────────────────────────────────

function buildNarrative(
  tenant: TenantSnapshot,
  signals: ScoredTenant['signals'],
  overallScore: number,
  isNewTenant = false,
): string {
  const level = riskLevel(overallScore);
  const healthScore = 100 - overallScore;
  const parts: string[] = [];

  // Opening — health score (higher = better)
  if (level === 'critical') {
    parts.push(`${tenant.tenantName} is at critical risk of churning (health: ${healthScore}/100).`);
  } else if (level === 'high') {
    parts.push(`${tenant.tenantName} shows significant signs of declining engagement (health: ${healthScore}/100).`);
  } else if (level === 'medium') {
    parts.push(`${tenant.tenantName} has moderate attrition risk (health: ${healthScore}/100) — worth monitoring.`);
  } else {
    parts.push(`${tenant.tenantName} is in good standing (health: ${healthScore}/100).`);
  }

  if (isNewTenant) {
    parts.push('Note: This is a new tenant (< 30 days). Some signal scores are capped at 50% to reduce no-data noise.');
  }

  // Collect all signal fragments, sorted by signal score descending
  const allSignals = Object.entries(signals)
    .sort(([, a], [, b]) => b.score - a.score)
    .flatMap(([, s]) => s.fragments);

  if (allSignals.length > 0) {
    parts.push('Key concerns:');
    for (const f of allSignals.slice(0, 5)) {
      parts.push(`  - ${f}`);
    }
  }

  // Data gap warning — if most signals returned "no data", flag it
  const noDataCount = Object.values(signals).filter(
    (s) => s.detail.reason && String(s.detail.reason).startsWith('no_'),
  ).length;
  if (noDataCount >= 4) {
    parts.push(`Warning: ${noDataCount} of 8 signals have no data. Usage tracking may not be flowing — verify the drain-outbox cron is flushing.`);
  }

  // Recommendation
  if (level === 'critical' || level === 'high') {
    parts.push('Recommendation: Proactive outreach recommended. Schedule a check-in call to understand their experience and address any blockers.');
  } else if (level === 'medium') {
    parts.push('Recommendation: Monitor closely over the next 2 weeks. Consider sending a satisfaction survey or usage tips.');
  }

  const narrative = parts.join('\n');
  if (narrative.length <= MAX_NARRATIVE_LENGTH) return narrative;
  // Truncate at the last sentence boundary before the limit
  const truncated = narrative.slice(0, MAX_NARRATIVE_LENGTH - 3);
  const lastSentence = truncated.lastIndexOf('.');
  const lastNewline = truncated.lastIndexOf('\n');
  const breakAt = Math.max(lastSentence, lastNewline);
  return (breakAt > 0 ? truncated.slice(0, breakAt + 1) : truncated) + '...';
}
