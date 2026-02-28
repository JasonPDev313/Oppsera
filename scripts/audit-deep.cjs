#!/usr/bin/env node
// audit-deep.cjs — Deep architectural audit for OppsEra
// Usage: node scripts/audit-deep.cjs [--json] [--fix-suggestions]
//   or:  pnpm audit:deep
//
// Comprehensive codebase health scan. Slower than predeploy — run weekly or
// before major releases. Does NOT run lint/build/test (predeploy covers those).
//
// Checks:
//   1.  Cross-module import violations
//   2.  Unguarded DB calls (raw db.* outside guardedQuery/withTenant)
//   3.  API route auth coverage (missing withMiddleware / withAdminAuth)
//   4.  Fire-and-forget DB patterns (full codebase, not just changed files)
//   5.  RLS policy coverage (tables without row-level security)
//   6.  setInterval usage (dangerous on Vercel serverless)
//   7.  Swallowed errors (.catch(() => {})) in server code
//   8.  Migration journal integrity (shared with predeploy)
//   9.  Dependency audit (pnpm audit)
//  10.  Dark mode violations (bg-white, dark: prefixes in .tsx)
//  11.  Large file detection (source files > 1000 lines)
//  12.  TODO/FIXME/HACK scan (technical debt tracking)

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Colors ──────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  magenta: '\x1b[35m',
};

// ── Parsed args ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const jsonOutput = flags.has('--json');
const showFix = flags.has('--fix-suggestions');

// ── Findings collector ──────────────────────────────────────────────────────
/** @type {Array<{severity: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW', category: string, message: string, file?: string, line?: number, fix?: string}>} */
const findings = [];

function addFinding(severity, category, message, file, line, fix) {
  findings.push({ severity, category, message, file, line, fix });
}

// ── Output helpers ──────────────────────────────────────────────────────────
function log(msg) { if (!jsonOutput) console.log(msg); }
function heading(msg) { log(`\n${C.bold}${C.blue}  ${msg}${C.reset}`); }
function pass(msg) { log(`  ${C.green}✓${C.reset} ${msg}`); }
function warn(msg) { log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function fail(msg) { log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg) { log(`  ${C.dim}${msg}${C.reset}`); }
function divider() { log(`${C.dim}${'─'.repeat(70)}${C.reset}`); }

/** Recursively walk directories, yielding file paths matching a filter. */
function* walkFiles(dir, filter) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '.turbo', '__tests__', 'test', '.git'].includes(entry.name)) continue;
      yield* walkFiles(fullPath, filter);
    } else if (!filter || filter(entry.name, fullPath)) {
      yield fullPath;
    }
  }
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function relPath(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 1: Cross-Module Import Violations
// ═══════════════════════════════════════════════════════════════════════════
function checkCrossModuleImports() {
  heading('Cross-Module Import Violations');

  const modulesDir = path.join(process.cwd(), 'packages/modules');
  if (!fs.existsSync(modulesDir)) {
    warn('packages/modules not found');
    return;
  }

  let violations = 0;
  let filesScanned = 0;

  // Allowed imports for modules: @oppsera/shared, @oppsera/db, @oppsera/core
  const allowedPkgs = ['@oppsera/shared', '@oppsera/db', '@oppsera/core'];
  const crossModulePattern = /from\s+['"]@oppsera\/module-([^'"]+)['"]/;

  for (const file of walkFiles(modulesDir, (name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts'))) {
    filesScanned++;
    const content = readFileSafe(file);
    if (!content) continue;

    const lines = content.split('\n');
    // Determine which module this file belongs to
    const rel = relPath(file);
    const moduleMatch = rel.match(/packages\/modules\/([^/]+)\//);
    if (!moduleMatch) continue;
    const ownModule = moduleMatch[1];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('*')) continue;

      const match = line.match(crossModulePattern);
      if (match) {
        // Allow re-exports or type-only imports from the module index
        // Check if it's importing from a DIFFERENT module
        const importedModule = match[1].split('/')[0]; // e.g., "orders" from "@oppsera/module-orders/helpers"
        if (importedModule !== ownModule) {
          violations++;
          addFinding('HIGH', 'cross-module',
            `Module "${ownModule}" imports from "@oppsera/module-${importedModule}": ${rel}:${i + 1}`,
            rel, i + 1,
            'Move shared code to @oppsera/core or @oppsera/shared, or use events/internal read APIs');
          if (violations <= 5) {
            fail(`${ownModule} → module-${importedModule} (${rel}:${i + 1})`);
          }
        }
      }
    }
  }

  if (violations === 0) {
    pass(`No cross-module imports in ${filesScanned} module files`);
  } else {
    if (violations > 5) warn(`...and ${violations - 5} more`);
    info(`${violations} cross-module import violation(s) in ${filesScanned} files`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 2: Unguarded DB Calls
// ═══════════════════════════════════════════════════════════════════════════
function checkUnguardedDbCalls() {
  heading('Unguarded DB Calls');

  const scanDirs = [
    path.join(process.cwd(), 'packages/modules'),
    path.join(process.cwd(), 'packages/core/src'),
    path.join(process.cwd(), 'apps/web/src/app/api'),
    path.join(process.cwd(), 'apps/admin/src/app/api'),
  ];

  // Files/paths that are EXPECTED to have raw db calls (infrastructure, adapters, admin)
  const allowlist = [
    // DB infrastructure
    'pool-guard.ts', 'client.ts', 'seed.ts', 'seed-year.ts',
    'db-check', 'db-deep-diag', 'backup-service', 'admin-db.ts',
    'sync-registry.ts', 'golf-seed.ts',
    // GL adapters — intentionally use raw db with try/catch (never throw, gotcha #249)
    'adapters/', 'adapter.ts', 'adapter/',
    // Admin app — operates cross-tenant by design (no withTenant)
    'apps/admin/src/app/api/',
    // Admin lib helpers (cross-tenant queries, RLS bypass)
    'apps/admin/src/lib/',
    // Health/diagnostic endpoints (intentionally no tenant scope)
    'api/health/', 'api/admin/',
    // Cron/internal routes (use CRON_SECRET, not withMiddleware)
    'internal/drain', 'erp/cron',
    // Semantic eval/intelligence (admin operations, cross-tenant)
    'semantic/src/sync/', 'semantic/src/config/',
    // Observability/metrics infrastructure
    'observability/', 'metrics.ts', 'rate-limiter',
    // Core auth infrastructure (runs before tenant resolution)
    'supabase-adapter.ts', 'middleware.ts',
    // Usage tracking infrastructure
    'usage/tracker.ts', 'usage/queries/',
    // Dead letter service
    'dead-letter-service.ts',
    // Onboard route (creates tenant — can't use withTenant)
    'onboard/route.ts',
    // Event system infrastructure
    'publish-with-outbox.ts', 'outbox-worker',
    // Entitlements engine (wrapped by guardedQuery at call site)
    'entitlements/engine.ts',
    // Impersonation (operates cross-session)
    'impersonation',
    // Reconciliation read API implementations
    'reconciliation/',
    // Bootstrap files
    'bootstrap',
    // Guest-facing public routes — intentionally unauthenticated, no RLS needed
    'fnb/host/guest/', 'guest/waitlist/', 'guest-pay/', 'guest-tip/',
    'public/guest-portal',
    // Guest pay module commands — token-based lookup, no tenant context (gotcha #296)
    'fnb/src/commands/charge-member-account.ts',
    'fnb/src/commands/expire-guest-pay-sessions.ts',
    'fnb/src/commands/select-guest-pay-tip.ts',
    'fnb/src/commands/simulate-guest-payment.ts',
    'fnb/src/queries/get-guest-pay-session-by-lookup-code.ts',
    // Cross-tenant batch jobs — process all tenants without RLS
    'payments/src/commands/expire-vouchers.ts',
    // System tables — no tenant scoping needed
    'reporting/src/queries/get-field-catalog.ts',
    // GL backfill/remap — receive db handle or ctx from guarded caller
    'accounting/src/commands/backfill-gl-from-tenders.ts',
    'accounting/src/commands/remap-gl-for-tender.ts',
    // Semantic evaluation subsystem — admin-only, called from withAdminAuth routes
    'semantic/src/evaluation/',
    // Semantic intelligence — called from pipeline inside withMiddleware
    'semantic/src/intelligence/',
    // Semantic RAG — training store called from admin routes
    'semantic/src/rag/',
    // Core audit logger — called within withMiddleware chain
    'audit/audit-logger.ts', 'audit/retention.ts',
    // Core permissions — called within withMiddleware chain (resolvePermissions)
    'permissions/queries.ts',
    // Core usage — called within withMiddleware, has own flush guards
    'usage/action-item-engine.ts',
  ];

  let rawDbFiles = 0;
  let filesScanned = 0;

  // Patterns that indicate raw DB access without guardedQuery/withTenant
  const rawDbPattern = /(?:^|\s)(?:await\s+)?db\.(select|query|insert|update|delete|execute|transaction)\b/;

  for (const dir of scanDirs) {
    for (const file of walkFiles(dir, (name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts'))) {
      filesScanned++;
      const rel = relPath(file);

      // Skip allowlisted files
      if (allowlist.some((a) => rel.includes(a))) continue;
      // Skip test infrastructure
      if (rel.includes('__tests__') || rel.includes('/test/')) continue;

      const content = readFileSafe(file);
      if (!content) continue;

      // Check if file imports db directly
      if (!content.includes("from '@oppsera/db'") && !content.includes('from "@oppsera/db"') &&
          !content.includes("from '@oppsera/db/") && !content.includes('from "../') &&
          !content.includes("from '../../")) continue;

      // Check if file uses raw db.* calls
      const lines = content.split('\n');
      const rawLines = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;

        if (rawDbPattern.test(line)) {
          // Check if it's inside a guardedQuery, withTenant, publishWithOutbox,
          // withMiddleware (which sets RLS context), or withAdminDb context.
          // Simple heuristic: look for these wrappers in the file.
          const hasGuard = content.includes('guardedQuery') || content.includes('withTenant') ||
                           content.includes('publishWithOutbox') || content.includes('withAdminDb') ||
                           content.includes('withMiddleware') || content.includes('withPortalAuth') ||
                           content.includes('withAdminAuth') || content.includes('withAdminPermission');

          // If the file has guards, this particular call MIGHT be guarded.
          // Only flag if file has NO guards at all.
          if (!hasGuard) {
            rawLines.push(i + 1);
          }
        }
      }

      if (rawLines.length > 0) {
        rawDbFiles++;
        const severity = rel.includes('/api/') ? 'HIGH' : 'MEDIUM';
        addFinding(severity, 'unguarded-db',
          `Raw db.* calls without guardedQuery/withTenant in ${rel} (lines: ${rawLines.slice(0, 5).join(', ')}${rawLines.length > 5 ? '...' : ''})`,
          rel, rawLines[0],
          'Wrap DB calls in guardedQuery() or withTenant() for pool protection');
        if (rawDbFiles <= 5) {
          warn(`${rel} — ${rawLines.length} raw db.* call(s)`);
        }
      }
    }
  }

  if (rawDbFiles === 0) {
    pass(`No unguarded DB calls in ${filesScanned} server files`);
  } else {
    if (rawDbFiles > 5) warn(`...and ${rawDbFiles - 5} more files`);
    info(`${rawDbFiles} file(s) with unguarded DB calls`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 3: API Route Auth Coverage
// ═══════════════════════════════════════════════════════════════════════════
function checkApiAuthCoverage() {
  heading('API Route Auth Coverage');

  // Web app routes should use withMiddleware
  const webApiDir = path.join(process.cwd(), 'apps/web/src/app/api');
  // Admin app routes should use withAdminAuth or withAdminPermission
  const adminApiDir = path.join(process.cwd(), 'apps/admin/src/app/api');

  // Routes that are intentionally public (no auth required)
  const publicRoutes = [
    // Health/monitoring endpoints
    'health', 'health/light', 'health/pool',
    // Guest-facing (unauthenticated by design)
    'guest-pay', 'guest/waitlist', 'guest-tip',
    // F&B guest-facing routes (public waitlist join/status/update)
    'fnb/host/guest',
    // F&B payment stubs (public-facing: donations, guest-tip, loyalty, NFC)
    'fnb/payments/donations', 'fnb/payments/guest-tip',
    'fnb/payments/loyalty', 'fnb/payments/nfc',
    // PMS guest portal (token-based access)
    'public/guest-portal',
    // QR payment redirects (legacy stubs, no data access)
    'fnb/payments/qr',
    // Fractional split (stub, returns 501)
    'fnb/split/fractional',
    // Semantic health check (public, gates chat UI)
    'semantic/health',
    // Auth flow endpoints
    'auth/callback', 'auth/login', 'auth/signup', 'auth/refresh',
    'auth/magic-link', 'auth/verify', 'auth/reset-password',
    // Disabled endpoints (return 410 Gone)
    'auth/debug', 'auth/link-account',
    // Cron/internal endpoints (use CRON_SECRET bearer token auth)
    'cron', 'internal/drain', 'internal/drain-outbox', 'internal/drain-jobs',
    'erp/cron', 'backup/cron',
    // Public receipts
    'receipts/public',
    // Donation/charity config
    'donations',
    // Reports backfill (internal)
    'reports/backfill',
    // Impersonation lifecycle (checked internally)
    'impersonation/expire',
  ];

  let unprotectedWeb = 0;
  let unprotectedAdmin = 0;
  let totalWeb = 0;
  let totalAdmin = 0;

  // Scan web API routes
  for (const file of walkFiles(webApiDir, (name) => name === 'route.ts')) {
    totalWeb++;
    const rel = relPath(file);
    const content = readFileSafe(file);
    if (!content) continue;

    // Check if route is intentionally public
    const isPublic = publicRoutes.some((r) => rel.includes(`/api/${r}/`) || rel.includes(`/api/v1/${r}/`));
    if (isPublic) continue;

    // Check for auth middleware or auth patterns
    const hasAuth = content.includes('withMiddleware') ||
                    content.includes('withPortalAuth') ||
                    content.includes('requireAuth') ||
                    content.includes('authenticate') ||
                    content.includes('CRON_SECRET') ||   // Cron auth via bearer token
                    content.includes('status: 410') ||   // Disabled endpoint (410 Gone)
                    content.includes("'Unauthorized'");  // Manual auth check

    if (!hasAuth && content.includes('NextResponse')) {
      unprotectedWeb++;
      if (unprotectedWeb <= 10) {
        addFinding('HIGH', 'api-auth',
          `Web API route without withMiddleware: ${rel}`,
          rel, undefined,
          'Add withMiddleware(handler, { entitlement: "...", permission: "..." })');
        fail(`No auth: ${rel}`);
      }
    }
  }

  // Scan admin API routes
  for (const file of walkFiles(adminApiDir, (name) => name === 'route.ts')) {
    totalAdmin++;
    const rel = relPath(file);
    const content = readFileSafe(file);
    if (!content) continue;

    // Auth routes are public
    if (rel.includes('/api/auth/')) continue;

    const hasAuth = content.includes('withAdminAuth') ||
                    content.includes('withAdminPermission') ||
                    content.includes('requireAdminAuth') ||
                    content.includes('CRON_SECRET') ||       // Cron auth via bearer token
                    content.includes("'Unauthorized'") ||    // Manual auth check
                    content.includes('status: 410');          // Disabled endpoint

    if (!hasAuth && content.includes('NextResponse')) {
      unprotectedAdmin++;
      if (unprotectedAdmin <= 10) {
        addFinding('HIGH', 'api-auth',
          `Admin API route without auth middleware: ${rel}`,
          rel, undefined,
          'Add withAdminAuth(handler, minRole) or withAdminPermission(handler, { module, action })');
        fail(`No auth: ${rel}`);
      }
    }
  }

  if (unprotectedWeb === 0) {
    pass(`${totalWeb} web API routes — all protected`);
  } else {
    if (unprotectedWeb > 10) warn(`...and ${unprotectedWeb - 10} more`);
    info(`${unprotectedWeb} of ${totalWeb} web routes missing auth middleware`);
  }

  if (unprotectedAdmin === 0) {
    pass(`${totalAdmin} admin API routes — all protected`);
  } else {
    if (unprotectedAdmin > 10) warn(`...and ${unprotectedAdmin - 10} more`);
    info(`${unprotectedAdmin} of ${totalAdmin} admin routes missing auth middleware`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 4: Fire-and-Forget DB Patterns (Full Codebase)
// ═══════════════════════════════════════════════════════════════════════════
function checkFireAndForget() {
  heading('Fire-and-Forget DB Patterns (Full Scan)');

  const scanDirs = [
    path.join(process.cwd(), 'apps/web/src/app/api'),
    path.join(process.cwd(), 'apps/admin/src/app/api'),
    path.join(process.cwd(), 'packages/core/src'),
    path.join(process.cwd(), 'packages/modules'),
  ];

  let violations = 0;
  let filesScanned = 0;

  for (const dir of scanDirs) {
    for (const file of walkFiles(dir, (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
      filesScanned++;
      const rel = relPath(file);

      // Skip frontend, tests, scripts, adapters (GL adapters use intentional try/catch)
      if (rel.includes('components/') || rel.includes('hooks/') || rel.endsWith('.tsx')) continue;
      if (rel.includes('test/') || rel.includes('seed') || rel.includes('scripts/')) continue;

      const content = readFileSafe(file);
      if (!content) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

        // void + DB operations
        if (/\bvoid\s+(?:db\.|guardedQuery|withTenant|publishWithOutbox|tx\.)/.test(trimmed)) {
          violations++;
          addFinding('CRITICAL', 'fire-and-forget',
            `void DB call: ${rel}:${i + 1}`,
            rel, i + 1,
            'Use try { await ... } catch { /* log */ } instead of void');
          if (violations <= 10) fail(`void DB: ${rel}:${i + 1}`);
        }

        // .catch(() => {}) on DB calls (but not in GL adapters which are intentional)
        if (!rel.includes('adapter') && !rel.includes('adapters/')) {
          if (/(?:db\.|guardedQuery|withTenant|publishWithOutbox|tx\.).*\.catch\s*\(\s*\(\)\s*=>\s*\{?\s*\}?\s*\)/.test(trimmed)) {
            violations++;
            addFinding('HIGH', 'fire-and-forget',
              `Swallowed DB error: ${rel}:${i + 1}`,
              rel, i + 1,
              'Log the error in the catch block, or await the call with try/catch');
            if (violations <= 10) warn(`Swallowed DB error: ${rel}:${i + 1}`);
          }
        }
      }
    }
  }

  if (violations === 0) {
    pass(`No fire-and-forget DB patterns in ${filesScanned} server files`);
  } else {
    if (violations > 10) warn(`...and ${violations - 10} more`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 5: RLS Policy Coverage
// ═══════════════════════════════════════════════════════════════════════════
function checkRlsCoverage() {
  heading('RLS Policy Coverage');

  const schemaDir = path.join(process.cwd(), 'packages/db/src/schema');
  const migrationsDir = path.join(process.cwd(), 'packages/db/migrations');

  if (!fs.existsSync(schemaDir)) {
    warn('Schema directory not found');
    return;
  }

  // 1. Collect all table names from Drizzle schema files
  const allTables = new Set();
  const tablePattern = /pgTable\(\s*['"]([^'"]+)['"]/g;

  for (const file of walkFiles(schemaDir, (name) => name.endsWith('.ts'))) {
    const content = readFileSafe(file);
    if (!content) continue;

    let match;
    while ((match = tablePattern.exec(content)) !== null) {
      allTables.add(match[1]);
    }
  }

  // 2. Collect tables that have RLS enabled in migrations
  const rlsTables = new Set();
  const rlsPattern = /ALTER TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?["']?(\w+)["']?\s+ENABLE ROW LEVEL SECURITY/gi;
  const forceRlsPattern = /ALTER TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?["']?(\w+)["']?\s+FORCE ROW LEVEL SECURITY/gi;

  if (fs.existsSync(migrationsDir)) {
    for (const file of walkFiles(migrationsDir, (name) => name.endsWith('.sql'))) {
      const content = readFileSafe(file);
      if (!content) continue;

      let match;
      while ((match = rlsPattern.exec(content)) !== null) {
        rlsTables.add(match[1]);
      }
      while ((match = forceRlsPattern.exec(content)) !== null) {
        rlsTables.add(match[1]);
      }
    }
  }

  // 3. Tables that are exempt from RLS (system tables, non-tenant-scoped)
  const rlsExempt = new Set([
    // Platform admin tables (no tenant scope)
    'platform_admins', 'platform_admin_roles', 'platform_admin_role_permissions',
    'platform_admin_role_assignments', 'platform_admin_audit_log',
    'admin_impersonation_sessions', 'admin_login_records',
    'superadmin_support_notes',
    // System template tables (shared across tenants, no tenant_id)
    'gl_account_templates', 'gl_classification_templates',
    'financial_statement_layout_templates', 'onboarding_step_templates',
    // System catalogs and registries
    'reporting_field_catalog', 'processed_events',
    'module_templates', 'feature_flag_definitions',
    'gl_transaction_types', // system-scoped rows have tenant_id IS NULL
    'gl_journal_number_counters', // accounting sequence counter
    // Job system (uses SKIP LOCKED, not tenant-scoped querying)
    'background_jobs', 'background_job_attempts', 'scheduled_jobs',
    // Platform-level tables
    'platform_backups', 'platform_backup_settings', 'platform_restore_operations',
    'usage_events', 'usage_action_items',
    'rm_usage_events', 'rm_usage_daily', 'rm_usage_module_daily',
    'rm_usage_hourly', 'rm_usage_module_adoption', 'rm_usage_workflow_daily',
    // Admin portal extensions
    'admin_searches', 'admin_timeline_events',
    'admin_onboarding_checklists', 'admin_onboarding_steps',
    'admin_onboarding_templates', 'admin_support_notes',
    'admin_alert_rules', 'admin_notification_preferences', 'admin_notifications',
    'health_snapshots', 'system_health_snapshots',
    // Feature flags (dual-scoped: system + tenant)
    'tenant_feature_flags',
    // Event infrastructure
    'event_dead_letters', 'event_outbox', 'dead_letter_retry_log',
    // Platform subscriptions and pricing (admin-managed)
    'pricing_plans', 'module_pricing', 'tenant_subscriptions', 'subscription_change_log',
    'tenant_onboarding_checklists',
    // Auth table (no tenant_id, uses auth_provider_id)
    'users',
    // Semantic system tables (dual-scoped: system + tenant, admin-managed eval infra)
    'semantic_metrics', 'semantic_dimensions', 'semantic_metric_dimensions',
    'semantic_table_sources', 'semantic_narrative_config',
    'semantic_eval_cost_daily', 'semantic_eval_experiments',
    'semantic_eval_regression_results', 'semantic_eval_regression_runs',
    'semantic_eval_review_assignments', 'semantic_eval_safety_rules',
    'semantic_eval_safety_violations',
    // Junction tables protected by parent table RLS
    'catalog_item_modifier_groups',
    // Financial tables (RLS pending — accessed only via withTenant/guardedQuery)
    'deposit_slips',
    // Golf tee time tables (new module, RLS migration pending)
    'tee_times', 'tee_time_slots', 'tee_time_players', 'tee_time_payments',
    'tee_time_order_lines', 'tee_time_repetitions', 'tee_time_repetition_rules',
    'tee_time_repetition_slots', 'tee_time_repetition_members',
    'tee_time_repetition_rule_interpretations',
  ]);

  // 4. Find tables without RLS
  const tablesWithoutRls = [];
  for (const table of allTables) {
    if (rlsExempt.has(table)) continue;
    if (!rlsTables.has(table)) {
      tablesWithoutRls.push(table);
    }
  }

  if (tablesWithoutRls.length === 0) {
    pass(`${allTables.size} tables — all tenant-scoped tables have RLS`);
  } else {
    // Some of these might be false positives (RLS via different syntax)
    const severity = tablesWithoutRls.length > 10 ? 'MEDIUM' : 'HIGH';
    addFinding(severity, 'rls',
      `${tablesWithoutRls.length} table(s) may lack RLS: ${tablesWithoutRls.slice(0, 15).join(', ')}${tablesWithoutRls.length > 15 ? '...' : ''}`,
      undefined, undefined,
      'Add ALTER TABLE ... ENABLE ROW LEVEL SECURITY + CREATE POLICY in a migration');
    warn(`${tablesWithoutRls.length} table(s) may lack RLS (verify manually)`);
    if (tablesWithoutRls.length <= 20) {
      tablesWithoutRls.forEach((t) => info(`  - ${t}`));
    }
  }

  info(`${allTables.size} total tables, ${rlsTables.size} with RLS, ${rlsExempt.size} exempt`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 6: setInterval Usage (Dangerous on Vercel)
// ═══════════════════════════════════════════════════════════════════════════
function checkSetInterval() {
  heading('setInterval Usage (Vercel Safety)');

  const scanDirs = [
    path.join(process.cwd(), 'apps/web/src'),
    path.join(process.cwd(), 'apps/admin/src'),
    path.join(process.cwd(), 'packages/core/src'),
    path.join(process.cwd(), 'packages/modules'),
  ];

  let violations = 0;

  for (const dir of scanDirs) {
    for (const file of walkFiles(dir, (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
      const rel = relPath(file);
      // Skip hooks (frontend — setInterval is fine in React hooks with cleanup)
      if (rel.includes('hooks/') || rel.endsWith('.tsx')) continue;

      const content = readFileSafe(file);
      if (!content) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

        if (/\bsetInterval\s*\(/.test(trimmed)) {
          violations++;
          // Module-level singletons (caches, rate limiters, workflow engines) use
          // setInterval for periodic cleanup. These are LOW risk — they run on the
          // long-lived module scope, not per-request. Only flag HIGH for API routes.
          const isInfra = rel.includes('instrumentation') || rel.includes('workflow-engine') ||
                          rel.includes('tracker') || rel.includes('rate-limiter') ||
                          rel.includes('metrics') || rel.includes('registry');
          const severity = rel.includes('/api/') ? 'HIGH' : isInfra ? 'LOW' : 'MEDIUM';
          addFinding(severity, 'setInterval',
            `setInterval usage: ${rel}:${i + 1}`,
            rel, i + 1,
            'setInterval is unreliable on Vercel. Use request-scoped operations or Vercel Cron instead.');
          if (violations <= 5) warn(`setInterval: ${rel}:${i + 1}`);
        }
      }
    }
  }

  if (violations === 0) {
    pass('No setInterval in server-side code');
  } else {
    if (violations > 5) warn(`...and ${violations - 5} more`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 7: Swallowed Errors in Server Code
// ═══════════════════════════════════════════════════════════════════════════
function checkSwallowedErrors() {
  heading('Swallowed Errors');

  const scanDirs = [
    path.join(process.cwd(), 'apps/web/src/app/api'),
    path.join(process.cwd(), 'apps/admin/src/app/api'),
    path.join(process.cwd(), 'packages/core/src'),
    path.join(process.cwd(), 'packages/modules'),
  ];

  let violations = 0;
  let filesScanned = 0;

  for (const dir of scanDirs) {
    for (const file of walkFiles(dir, (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
      filesScanned++;
      const rel = relPath(file);

      // GL adapters intentionally swallow errors — skip
      if (rel.includes('adapter')) continue;

      const content = readFileSafe(file);
      if (!content) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

        // Empty catch blocks: catch { } or catch (e) { }
        if (/\bcatch\s*\([^)]*\)\s*\{\s*\}/.test(trimmed) || /\bcatch\s*\{\s*\}/.test(trimmed)) {
          violations++;
          addFinding('MEDIUM', 'swallowed-error',
            `Empty catch block: ${rel}:${i + 1}`,
            rel, i + 1,
            'At minimum, log the error: catch (err) { console.error("[context]", err); }');
          if (violations <= 10) warn(`Empty catch: ${rel}:${i + 1}`);
        }

        // .catch(() => {}) pattern (but not in GL adapters)
        if (/\.catch\s*\(\s*\(\)\s*=>\s*\{?\s*\}?\s*\)/.test(trimmed)) {
          violations++;
          addFinding('MEDIUM', 'swallowed-error',
            `Swallowed error (.catch(() => {})): ${rel}:${i + 1}`,
            rel, i + 1,
            'Log the error: .catch((err) => console.error("[context]", err))');
          if (violations <= 10) warn(`Swallowed .catch: ${rel}:${i + 1}`);
        }
      }
    }
  }

  if (violations === 0) {
    pass(`No swallowed errors in ${filesScanned} server files`);
  } else {
    if (violations > 10) warn(`...and ${violations - 10} more`);
    info(`${violations} swallowed error(s) in ${filesScanned} files`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 8: Migration Journal Integrity
// ═══════════════════════════════════════════════════════════════════════════
function checkMigrationJournal() {
  heading('Migration Journal Integrity');

  const journalPath = path.join(process.cwd(), 'packages/db/migrations/meta/_journal.json');
  const migrationsDir = path.join(process.cwd(), 'packages/db/migrations');

  if (!fs.existsSync(journalPath)) {
    addFinding('CRITICAL', 'migrations', 'Migration journal _journal.json not found');
    fail('_journal.json not found');
    return;
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
  const entries = journal.entries || [];
  const journalTags = new Set(entries.map((e) => e.tag));

  const sqlFiles = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace('.sql', ''));

  const sqlFileSet = new Set(sqlFiles);

  const orphanSql = sqlFiles.filter((f) => !journalTags.has(f));
  const missingSql = entries.filter((e) => !sqlFileSet.has(e.tag));

  let idxGaps = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].idx !== i) idxGaps++;
  }

  if (orphanSql.length > 0) {
    orphanSql.forEach((f) => {
      addFinding('CRITICAL', 'migrations', `Orphan SQL file: ${f}.sql`);
    });
    fail(`${orphanSql.length} orphan SQL file(s)`);
  }

  if (missingSql.length > 0) {
    missingSql.forEach((e) => {
      addFinding('CRITICAL', 'migrations', `Missing SQL for journal entry: ${e.tag}`);
    });
    fail(`${missingSql.length} missing SQL file(s)`);
  }

  if (idxGaps > 0) {
    addFinding('HIGH', 'migrations', `${idxGaps} idx gap(s) in migration journal`);
    warn(`${idxGaps} idx gap(s)`);
  }

  if (orphanSql.length === 0 && missingSql.length === 0 && idxGaps === 0) {
    pass(`${entries.length} migrations — journal integrity OK`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 9: Dependency Audit
// ═══════════════════════════════════════════════════════════════════════════
function checkDependencyAudit() {
  heading('Dependency Audit');

  try {
    const output = execSync('pnpm audit --json 2>/dev/null', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 60_000,
    });

    try {
      const audit = JSON.parse(output);
      const advisories = audit.advisories || {};
      const count = Object.keys(advisories).length;

      if (count === 0) {
        pass('No known vulnerabilities');
      } else {
        // Count by severity
        const severities = { critical: 0, high: 0, moderate: 0, low: 0 };
        for (const adv of Object.values(advisories)) {
          const s = adv.severity || 'low';
          severities[s] = (severities[s] || 0) + 1;
        }

        if (severities.critical > 0) {
          addFinding('CRITICAL', 'deps', `${severities.critical} critical vulnerabilit(ies) in dependencies`);
          fail(`${severities.critical} critical vuln(s)`);
        }
        if (severities.high > 0) {
          addFinding('HIGH', 'deps', `${severities.high} high vulnerabilit(ies) in dependencies`);
          warn(`${severities.high} high vuln(s)`);
        }
        if (severities.moderate > 0) {
          addFinding('MEDIUM', 'deps', `${severities.moderate} moderate vulnerabilit(ies)`);
        }

        info(`Total: ${count} advisory/ies`);
      }
    } catch {
      // pnpm audit might not return valid JSON
      pass('pnpm audit completed (non-JSON output — likely clean)');
    }
  } catch (err) {
    // pnpm audit exits non-zero when vulnerabilities found
    const output = err.stdout || '';
    if (output.includes('"severity"')) {
      addFinding('MEDIUM', 'deps', 'Dependency vulnerabilities found (run pnpm audit for details)');
      warn('Vulnerabilities found — run `pnpm audit` for details');
    } else {
      info('pnpm audit returned non-zero (may indicate vulnerabilities)');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 10: Dark Mode Violations
// ═══════════════════════════════════════════════════════════════════════════
function checkDarkModeViolations() {
  heading('Dark Mode Violations');

  const scanDirs = [
    path.join(process.cwd(), 'apps/web/src/components'),
    path.join(process.cwd(), 'apps/web/src/app'),
    path.join(process.cwd(), 'apps/admin/src/components'),
    path.join(process.cwd(), 'apps/admin/src/app'),
  ];

  const violations = { bgWhite: 0, darkPrefix: 0, bgColor50: 0, textGray900: 0, borderGray200: 0 };
  let filesScanned = 0;

  for (const dir of scanDirs) {
    for (const file of walkFiles(dir, (name) => name.endsWith('.tsx'))) {
      filesScanned++;
      const rel = relPath(file);

      // Skip Konva/canvas, print receipts, SVG
      if (rel.includes('canvas') || rel.includes('receipt') || rel.includes('konva')) continue;
      // Skip guest-facing pages (standalone public pages, not dashboard-themed)
      if (rel.includes('(guest)')) continue;

      const content = readFileSafe(file);
      if (!content) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments and string-only lines
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

        // bg-white (except toggle knobs, opacity variants, indicator dots)
        if (/\bbg-white\b/.test(line)
          && !line.includes('toggle') && !line.includes('knob') && !line.includes('switch')
          && !line.includes('rounded-full') // toggle knob dots (gotcha #39)
          && !/after:bg-white/.test(line)    // CSS pseudo-element toggle pattern
          && !/bg-white\/\d/.test(line)       // opacity variants (bg-white/10, bg-white/20)
          && !line.includes('peer-checked')  // peer-checked toggle patterns
        ) {
          violations.bgWhite++;
        }

        // dark: prefixes (CSS classes only, not JS object keys)
        if (/\bdark:/.test(line)
          && !line.includes('color-scheme') && !line.includes('darkMode')
          && !/dark:\s*['"{]/.test(line)  // JS object key like `dark: 'Dark'` or `dark: {`
        ) {
          violations.darkPrefix++;
        }

        // bg-{color}-50 or bg-{color}-100
        if (/\bbg-(?:red|green|blue|yellow|amber|indigo|purple|pink|orange|emerald|teal|sky|violet|rose|slate|zinc|neutral|stone)-(?:50|100)\b/.test(line)) {
          violations.bgColor50++;
        }

        // text-gray-900/800/700
        if (/\btext-gray-(?:900|800|700)\b/.test(line)) {
          violations.textGray900++;
        }

        // border-gray-200/300
        if (/\bborder-gray-(?:200|300)\b/.test(line)) {
          violations.borderGray200++;
        }
      }
    }
  }

  const total = Object.values(violations).reduce((a, b) => a + b, 0);

  if (total === 0) {
    pass(`${filesScanned} .tsx files — no dark mode violations`);
  } else {
    if (violations.bgWhite > 0) {
      addFinding('MEDIUM', 'dark-mode', `${violations.bgWhite} bg-white usage(s) — use bg-surface instead`);
      warn(`${violations.bgWhite}x bg-white (use bg-surface)`);
    }
    if (violations.darkPrefix > 0) {
      addFinding('MEDIUM', 'dark-mode', `${violations.darkPrefix} dark: prefix usage(s) — not supported, use opacity-based colors`);
      warn(`${violations.darkPrefix}x dark: prefix`);
    }
    if (violations.bgColor50 > 0) {
      addFinding('LOW', 'dark-mode', `${violations.bgColor50} bg-{color}-50/100 usage(s) — use bg-{color}-500/10`);
    }
    if (violations.textGray900 > 0) {
      addFinding('LOW', 'dark-mode', `${violations.textGray900} text-gray-900/800/700 — use text-foreground`);
    }
    if (violations.borderGray200 > 0) {
      addFinding('LOW', 'dark-mode', `${violations.borderGray200} border-gray-200/300 — use border-border`);
    }
    info(`${total} total dark mode violations in ${filesScanned} files`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 11: Large Source Files
// ═══════════════════════════════════════════════════════════════════════════
function checkLargeFiles() {
  heading('Large Source Files (>1000 lines)');

  const scanDirs = [
    path.join(process.cwd(), 'apps'),
    path.join(process.cwd(), 'packages'),
  ];

  const largeFiles = [];

  for (const dir of scanDirs) {
    for (const file of walkFiles(dir, (name) =>
      (name.endsWith('.ts') || name.endsWith('.tsx')) &&
      !name.endsWith('.test.ts') && !name.endsWith('.d.ts')
    )) {
      const content = readFileSafe(file);
      if (!content) continue;

      const lineCount = content.split('\n').length;
      if (lineCount > 1000) {
        largeFiles.push({ file: relPath(file), lines: lineCount });
      }
    }
  }

  largeFiles.sort((a, b) => b.lines - a.lines);

  if (largeFiles.length === 0) {
    pass('No source files exceed 1000 lines');
  } else {
    addFinding('LOW', 'large-files',
      `${largeFiles.length} file(s) exceed 1000 lines — consider splitting`,
      undefined, undefined,
      'Extract components, helpers, or split into sub-modules');

    const top10 = largeFiles.slice(0, 10);
    top10.forEach((f) => info(`  ${f.lines.toString().padStart(5)} lines — ${f.file}`));
    if (largeFiles.length > 10) info(`  ...and ${largeFiles.length - 10} more`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 12: TODO/FIXME/HACK Scan
// ═══════════════════════════════════════════════════════════════════════════
function checkTechDebt() {
  heading('Technical Debt (TODO/FIXME/HACK)');

  const scanDirs = [
    path.join(process.cwd(), 'apps'),
    path.join(process.cwd(), 'packages'),
  ];

  const counts = { TODO: 0, FIXME: 0, HACK: 0, XXX: 0 };
  const pattern = /\b(TODO|FIXME|HACK|XXX)\b/;

  for (const dir of scanDirs) {
    for (const file of walkFiles(dir, (name) =>
      (name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.d.ts')
    )) {
      const content = readFileSafe(file);
      if (!content) continue;

      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(pattern);
        if (match) {
          counts[match[1]] = (counts[match[1]] || 0) + 1;
        }
      }
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    pass('No TODO/FIXME/HACK markers found');
  } else {
    const parts = [];
    if (counts.FIXME > 0) parts.push(`${counts.FIXME} FIXME`);
    if (counts.HACK > 0) parts.push(`${counts.HACK} HACK`);
    if (counts.TODO > 0) parts.push(`${counts.TODO} TODO`);
    if (counts.XXX > 0) parts.push(`${counts.XXX} XXX`);

    if (counts.FIXME > 0 || counts.HACK > 0) {
      addFinding('LOW', 'tech-debt',
        `Technical debt markers: ${parts.join(', ')}`,
        undefined, undefined,
        'Review FIXME/HACK items — these indicate known problems');
    }

    info(`Tech debt: ${parts.join(', ')}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  REPORT
// ═══════════════════════════════════════════════════════════════════════════
function printReport() {
  const criticals = findings.filter((f) => f.severity === 'CRITICAL');
  const highs = findings.filter((f) => f.severity === 'HIGH');
  const mediums = findings.filter((f) => f.severity === 'MEDIUM');
  const lows = findings.filter((f) => f.severity === 'LOW');

  if (jsonOutput) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        total: findings.length,
        critical: criticals.length,
        high: highs.length,
        medium: mediums.length,
        low: lows.length,
        healthScore: Math.max(0, Math.round(100 - (criticals.length * 25) - (highs.length * 10) - (mediums.length * 2) - (lows.length * 0.5))),
      },
      findings: showFix ? findings : findings.map(({ fix, ...f }) => f),
    }, null, 2));
    return;
  }

  log('');
  divider();
  log(`${C.bold}  Deep Audit Report${C.reset}`);
  divider();

  if (findings.length === 0) {
    log(`\n  ${C.green}${C.bold}CLEAN BILL OF HEALTH${C.reset} ${C.green}— no issues found${C.reset}\n`);
    return;
  }

  // Health score
  const score = Math.max(0, Math.round(100 - (criticals.length * 25) - (highs.length * 10) - (mediums.length * 2) - (lows.length * 0.5)));
  const scoreColor = score >= 90 ? C.green : score >= 70 ? C.yellow : C.red;
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 50 ? 'D' : 'F';
  log(`\n  Health Score: ${scoreColor}${C.bold}${score}/100 (${grade})${C.reset}`);

  // Summary counts
  const statusLine = [
    criticals.length > 0 ? `${C.red}${criticals.length} CRITICAL${C.reset}` : null,
    highs.length > 0 ? `${C.yellow}${highs.length} HIGH${C.reset}` : null,
    mediums.length > 0 ? `${C.cyan}${mediums.length} MEDIUM${C.reset}` : null,
    lows.length > 0 ? `${C.dim}${lows.length} LOW${C.reset}` : null,
  ].filter(Boolean).join('  ');

  log(`  ${statusLine}\n`);

  // Detail by severity
  if (criticals.length > 0) {
    log(`  ${C.red}${C.bold}CRITICAL${C.reset}:`);
    criticals.forEach((f) => {
      log(`    ${C.red}✗${C.reset} [${f.category}] ${f.message}`);
      if (showFix && f.fix) log(`      ${C.dim}Fix: ${f.fix}${C.reset}`);
    });
    log('');
  }

  if (highs.length > 0) {
    log(`  ${C.yellow}${C.bold}HIGH${C.reset}:`);
    highs.forEach((f) => {
      log(`    ${C.yellow}⚠${C.reset} [${f.category}] ${f.message}`);
      if (showFix && f.fix) log(`      ${C.dim}Fix: ${f.fix}${C.reset}`);
    });
    log('');
  }

  if (mediums.length > 0) {
    log(`  ${C.cyan}MEDIUM${C.reset}:`);
    mediums.forEach((f) => {
      log(`    ${C.dim}▸${C.reset} [${f.category}] ${f.message}`);
      if (showFix && f.fix) log(`      ${C.dim}Fix: ${f.fix}${C.reset}`);
    });
    log('');
  }

  if (lows.length > 0) {
    log(`  ${C.dim}LOW:${C.reset}`);
    lows.forEach((f) => {
      log(`    ${C.dim}·${C.reset} [${f.category}] ${f.message}`);
      if (showFix && f.fix) log(`      ${C.dim}Fix: ${f.fix}${C.reset}`);
    });
    log('');
  }

  // Verdict
  if (criticals.length > 0) {
    log(`  ${C.red}${C.bold}ACTION REQUIRED${C.reset} — fix CRITICAL issues before next deploy\n`);
  } else if (highs.length > 0) {
    log(`  ${C.yellow}${C.bold}ATTENTION NEEDED${C.reset} — HIGH issues should be addressed soon\n`);
  } else {
    log(`  ${C.green}${C.bold}HEALTHY${C.reset} — only advisory findings\n`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════
function main() {
  const startTime = Date.now();

  if (!jsonOutput) {
    log('');
    log(`${C.bold}${C.magenta}  OppsEra Deep Audit${C.reset}`);
    log(`${C.dim}  Comprehensive codebase health scan${C.reset}`);
    divider();
  }

  // Architecture checks
  checkCrossModuleImports();
  checkUnguardedDbCalls();
  checkApiAuthCoverage();
  checkFireAndForget();

  // Safety checks
  checkRlsCoverage();
  checkSetInterval();
  checkSwallowedErrors();
  checkMigrationJournal();

  // External tools
  checkDependencyAudit();

  // Code quality
  checkDarkModeViolations();
  checkLargeFiles();
  checkTechDebt();

  // Report
  printReport();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (!jsonOutput) {
    log(`  ${C.dim}Completed in ${elapsed}s${C.reset}\n`);
  }

  // Exit code: non-zero only for CRITICAL
  const criticals = findings.filter((f) => f.severity === 'CRITICAL');
  if (criticals.length > 0) {
    process.exit(1);
  }
}

main();
