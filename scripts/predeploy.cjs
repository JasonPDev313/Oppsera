#!/usr/bin/env node
// predeploy.cjs — Pre-deploy audit for OppsEra
// Usage: node scripts/predeploy.cjs [--fix] [--json]
//   or:  pnpm predeploy
//
// Runs a fast suite of safety checks before deploying to production.
// Exits 1 if any CRITICAL or HIGH issues found; exits 0 on MEDIUM/LOW only.
//
// Checks:
//   1. Secrets safety — no .env files staged, no hardcoded secrets
//   2. Migration journal integrity — SQL files <-> journal 1:1
//   3. Lint (no-floating-promises) — prevents Vercel pool exhaustion
//   4. Type-check — catches TS errors
//   5. Build smoke — ensures production build succeeds
//   6. Test gate — ensures all tests pass
//   7. Git hygiene — branch, large files, sensitive files
//   8. Env var validation — required vars present for target deploy

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
const skipTests = flags.has('--skip-tests');
const skipBuild = flags.has('--skip-build');
const skipLint = flags.has('--skip-lint');

// ── Findings collector ──────────────────────────────────────────────────────
/** @type {Array<{severity: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW', category: string, message: string, file?: string, line?: number}>} */
const findings = [];

function addFinding(severity, category, message, file, line) {
  findings.push({ severity, category, message, file, line });
}

// ── Output helpers ──────────────────────────────────────────────────────────
function log(msg) { if (!jsonOutput) console.log(msg); }
function heading(msg) { log(`\n${C.bold}${C.blue}  ${msg}${C.reset}`); }
function pass(msg) { log(`  ${C.green}✓${C.reset} ${msg}`); }
function warn(msg) { log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function fail(msg) { log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg) { log(`  ${C.dim}${msg}${C.reset}`); }
function divider() { log(`${C.dim}${'─'.repeat(60)}${C.reset}`); }

function runCapture(cmd) {
  try {
    return execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8', stdio: 'pipe', timeout: 5 * 60 * 1000 }).trim();
  } catch {
    return '';
  }
}

function runCheck(cmd, timeoutMs = 10 * 60 * 1000) {
  try {
    execSync(cmd, { cwd: process.cwd(), stdio: 'inherit', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 1: Secrets Safety
// ═══════════════════════════════════════════════════════════════════════════
function checkSecretsSafety() {
  heading('Secrets Safety');

  // 1a. Check for .env files in staged area
  const staged = runCapture('git diff --cached --name-only 2>/dev/null') ||
                 runCapture('git diff --name-only HEAD 2>/dev/null') || '';
  const stagedFiles = staged.split('\n').filter(Boolean);

  const envPatterns = ['.env', '.env.local', '.env.remote', '.env.production', '.env.vercel'];
  const stagedEnv = stagedFiles.filter((f) => envPatterns.some((p) => f === p || f.endsWith(`/${p}`)));

  if (stagedEnv.length > 0) {
    stagedEnv.forEach((f) => {
      addFinding('CRITICAL', 'secrets', `Secret file staged for commit: ${f}`, f);
      fail(`${C.red}CRITICAL${C.reset} Env file staged: ${f}`);
    });
  } else {
    pass('No .env files staged');
  }

  // 1b. Check for common secret patterns in modified files
  const modifiedTs = stagedFiles.filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js')) && !f.includes('node_modules'));
  let secretsFound = 0;

  for (const file of modifiedTs.slice(0, 50)) { // cap to avoid slowness
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments and test files
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
        if (file.includes('__tests__') || file.includes('.test.')) continue;

        // Check for hardcoded keys (common patterns)
        if (/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i.test(line) &&
            !line.includes('placeholder') && !line.includes('example') && !line.includes('test') &&
            !line.includes('process.env')) {
          addFinding('HIGH', 'secrets', `Possible hardcoded secret in ${file}:${i + 1}`, file, i + 1);
          secretsFound++;
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  if (secretsFound === 0) {
    pass('No hardcoded secrets detected in changed files');
  } else {
    warn(`${secretsFound} possible hardcoded secret(s) found — review manually`);
  }

  // 1c. Check .gitignore includes critical patterns
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    const requiredPatterns = ['.env.local', '.env.remote'];
    const missing = requiredPatterns.filter((p) => !gitignore.includes(p));
    if (missing.length > 0) {
      addFinding('CRITICAL', 'secrets', `.gitignore missing patterns: ${missing.join(', ')}`);
      fail(`${C.red}CRITICAL${C.reset} .gitignore missing: ${missing.join(', ')}`);
    } else {
      pass('.gitignore covers env files');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 2: Migration Journal Integrity
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

  // Get SQL files
  const sqlFiles = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace('.sql', ''));

  const sqlFileSet = new Set(sqlFiles);

  // Check for orphan SQL files (no journal entry)
  const orphanSql = sqlFiles.filter((f) => !journalTags.has(f));
  if (orphanSql.length > 0) {
    orphanSql.forEach((f) => {
      addFinding('CRITICAL', 'migrations', `Orphan SQL file (no journal entry): ${f}.sql`, `packages/db/migrations/${f}.sql`);
    });
    fail(`${orphanSql.length} orphan SQL file(s) without journal entries`);
  }

  // Check for missing SQL files (journal entry but no file)
  const missingSql = entries.filter((e) => !sqlFileSet.has(e.tag));
  if (missingSql.length > 0) {
    missingSql.forEach((e) => {
      addFinding('CRITICAL', 'migrations', `Missing SQL file for journal entry: ${e.tag}`, `packages/db/migrations/${e.tag}.sql`);
    });
    fail(`${missingSql.length} journal entries without SQL files`);
  }

  // Check sequential idx integrity
  let idxGaps = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].idx !== i) {
      addFinding('HIGH', 'migrations', `Journal idx gap: expected ${i}, got ${entries[i].idx} (tag: ${entries[i].tag})`);
      idxGaps++;
    }
  }

  if (orphanSql.length === 0 && missingSql.length === 0 && idxGaps === 0) {
    pass(`Journal integrity: ${entries.length} entries = ${sqlFiles.length} SQL files, sequential idx OK`);
  } else if (idxGaps > 0) {
    warn(`${idxGaps} idx gap(s) in journal`);
  }

  // Report latest migration
  if (entries.length > 0) {
    const latest = entries[entries.length - 1];
    info(`Latest migration: idx ${latest.idx} — ${latest.tag}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 3: Lint (floating promises)
// ═══════════════════════════════════════════════════════════════════════════
function checkLint() {
  heading('Lint (floating-promise detection)');

  if (skipLint) {
    warn('Skipped (--skip-lint)');
    return;
  }

  const passed = runCheck('pnpm lint');
  if (passed) {
    pass('Lint passed (no-floating-promises enforced on server code)');
  } else {
    addFinding('HIGH', 'lint', 'Lint failed — possible unawaited DB operations that cause pool exhaustion on Vercel');
    fail('Lint failed — floating promises may cause Vercel pool exhaustion');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 4: Type-check
// ═══════════════════════════════════════════════════════════════════════════
function checkTypeCheck() {
  heading('Type-check');

  const passed = runCheck('pnpm type-check');
  if (passed) {
    pass('Type-check passed');
  } else {
    addFinding('HIGH', 'typecheck', 'TypeScript type-check failed');
    fail('Type-check failed');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 5: Build
// ═══════════════════════════════════════════════════════════════════════════
function checkBuild() {
  heading('Build');

  if (skipBuild) {
    warn('Skipped (--skip-build)');
    return;
  }

  const passed = runCheck('pnpm build', 15 * 60 * 1000); // 15 min timeout for builds
  if (passed) {
    pass('Build succeeded');
  } else {
    addFinding('CRITICAL', 'build', 'Production build failed');
    fail('Build failed');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 6: Tests
// ═══════════════════════════════════════════════════════════════════════════
function checkTests() {
  heading('Tests');

  if (skipTests) {
    warn('Skipped (--skip-tests)');
    return;
  }

  const passed = runCheck('pnpm test', 15 * 60 * 1000);
  if (passed) {
    pass('All tests passed');
  } else {
    addFinding('HIGH', 'tests', 'Test suite failed');
    fail('Tests failed');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 7: Git Hygiene
// ═══════════════════════════════════════════════════════════════════════════
function checkGitHygiene() {
  heading('Git Hygiene');

  // 7a. Branch check
  const branch = runCapture('git rev-parse --abbrev-ref HEAD');
  if (branch === 'main') {
    pass(`On branch: ${branch}`);
  } else {
    addFinding('MEDIUM', 'git', `Not on main branch (current: ${branch})`);
    warn(`Not on main branch (current: ${branch})`);
  }

  // 7b. Large files check (>5MB)
  const status = runCapture('git status --porcelain');
  if (status) {
    const changedFiles = status.split('\n').filter(Boolean).map((line) => line.substring(3));
    let largeFiles = 0;
    for (const file of changedFiles) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) continue;
      try {
        const stat = fs.statSync(filePath);
        const sizeMB = stat.size / (1024 * 1024);
        if (sizeMB > 5) {
          addFinding('HIGH', 'git', `Large file (${sizeMB.toFixed(1)}MB): ${file}`, file);
          fail(`Large file: ${file} (${sizeMB.toFixed(1)}MB)`);
          largeFiles++;
        }
      } catch {
        // Skip
      }
    }
    if (largeFiles === 0) {
      pass('No large files (>5MB) in changes');
    }
  } else {
    info('No changed files to check');
  }

  // 7c. Sensitive file patterns in changes
  const sensitivePatterns = [
    'credentials', 'private_key', 'id_rsa', '.pem', '.key', '.p12', '.pfx',
    'service-account', 'firebase-adminsdk',
  ];
  if (status) {
    const changedFiles = status.split('\n').filter(Boolean).map((line) => line.substring(3));
    const sensitiveFiles = changedFiles.filter((f) =>
      sensitivePatterns.some((p) => f.toLowerCase().includes(p))
    );
    if (sensitiveFiles.length > 0) {
      sensitiveFiles.forEach((f) => {
        addFinding('CRITICAL', 'git', `Sensitive file in changes: ${f}`, f);
        fail(`${C.red}CRITICAL${C.reset} Sensitive file: ${f}`);
      });
    } else {
      pass('No sensitive files in changes');
    }
  }

  // 7d. Unpushed commits
  const ahead = runCapture('git rev-list --count HEAD...@{upstream} 2>/dev/null');
  if (ahead && parseInt(ahead) > 0) {
    info(`${ahead} unpushed commit(s)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 8: Env Var Validation
// ═══════════════════════════════════════════════════════════════════════════
function checkEnvVars() {
  heading('Environment Variables');

  // Check turbo.json build.env for required vars
  const turboPath = path.join(process.cwd(), 'turbo.json');
  if (!fs.existsSync(turboPath)) {
    addFinding('MEDIUM', 'env', 'turbo.json not found');
    warn('turbo.json not found');
    return;
  }

  const turbo = JSON.parse(fs.readFileSync(turboPath, 'utf-8'));
  const buildEnv = turbo.tasks?.build?.env || [];

  // Only check NEXT_PUBLIC_ vars — server vars are set on Vercel
  const publicVars = buildEnv.filter((v) => v.startsWith('NEXT_PUBLIC_'));

  info(`turbo.json declares ${buildEnv.length} build env vars (${publicVars.length} public)`);

  // Check that .env.remote exists for migration
  const envRemotePath = path.join(process.cwd(), '.env.remote');
  if (fs.existsSync(envRemotePath)) {
    pass('.env.remote exists (for remote migrations)');

    // Verify it has DATABASE_URL_ADMIN or DATABASE_URL
    const envContent = fs.readFileSync(envRemotePath, 'utf-8');
    if (envContent.includes('DATABASE_URL')) {
      pass('.env.remote contains DATABASE_URL');
    } else {
      addFinding('HIGH', 'env', '.env.remote exists but missing DATABASE_URL');
      fail('.env.remote missing DATABASE_URL');
    }
  } else {
    addFinding('MEDIUM', 'env', '.env.remote not found — remote migrations will fail');
    warn('.env.remote not found (needed for remote migrations)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECK 9: DB Safety Patterns (fast static scan)
// ═══════════════════════════════════════════════════════════════════════════
function checkDbSafety() {
  heading('DB Safety Patterns');

  // Only scan changed files for speed
  const status = runCapture('git status --porcelain');
  if (!status) {
    info('No changed files to scan');
    return;
  }

  const changedFiles = status.split('\n')
    .filter(Boolean)
    .map((line) => line.substring(3))
    .filter((f) => f.endsWith('.ts') && !f.includes('__tests__') && !f.includes('.test.') &&
                   !f.includes('node_modules') && !f.includes('seed') && !f.includes('migrate') &&
                   !f.includes('pool-guard') && !f.includes('client.ts'));

  let fireAndForgetCount = 0;
  let voidDbCount = 0;

  for (const file of changedFiles) {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Skip frontend files
      if (file.includes('components/') || file.includes('hooks/') || file.endsWith('.tsx')) continue;
      // Skip test infrastructure
      if (file.includes('test/') || file.includes('vitest')) continue;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        // Detect fire-and-forget DB patterns in server code
        // void + db/query/insert/transaction/execute
        if (/\bvoid\s+(?:db|guardedQuery|withTenant|publishWithOutbox)\b/.test(trimmed)) {
          addFinding('CRITICAL', 'db-safety', `Fire-and-forget DB call: ${file}:${i + 1}`, file, i + 1);
          voidDbCount++;
        }

        // .catch(() => {}) on DB-like calls (but not GL adapters which are intentional)
        if (/(?:db\.|guardedQuery|withTenant|publishWithOutbox).*\.catch\s*\(\s*\(\)\s*=>\s*\{?\s*\}?\s*\)/.test(trimmed) &&
            !file.includes('adapters/') && !file.includes('adapter')) {
          addFinding('HIGH', 'db-safety', `Swallowed DB error: ${file}:${i + 1}`, file, i + 1);
          fireAndForgetCount++;
        }
      }
    } catch {
      // Skip unreadable
    }
  }

  if (fireAndForgetCount === 0 && voidDbCount === 0) {
    pass('No fire-and-forget DB patterns in changed files');
  }

  info(`Scanned ${changedFiles.length} changed server files`);
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
      summary: {
        total: findings.length,
        critical: criticals.length,
        high: highs.length,
        medium: mediums.length,
        low: lows.length,
        pass: criticals.length === 0 && highs.length === 0,
      },
      findings,
    }, null, 2));
    return;
  }

  log('');
  divider();
  log(`${C.bold}  Predeploy Report${C.reset}`);
  divider();

  if (findings.length === 0) {
    log(`\n  ${C.green}${C.bold}ALL CHECKS PASSED${C.reset} ${C.green}— safe to deploy${C.reset}\n`);
    return;
  }

  // Summary counts
  const statusLine = [
    criticals.length > 0 ? `${C.red}${criticals.length} CRITICAL${C.reset}` : null,
    highs.length > 0 ? `${C.yellow}${highs.length} HIGH${C.reset}` : null,
    mediums.length > 0 ? `${C.cyan}${mediums.length} MEDIUM${C.reset}` : null,
    lows.length > 0 ? `${C.dim}${lows.length} LOW${C.reset}` : null,
  ].filter(Boolean).join('  ');

  log(`\n  ${statusLine}\n`);

  // Detail by severity
  if (criticals.length > 0) {
    log(`  ${C.red}${C.bold}CRITICAL${C.reset} (blocks deploy):`);
    criticals.forEach((f) => log(`    ${C.red}✗${C.reset} [${f.category}] ${f.message}`));
    log('');
  }

  if (highs.length > 0) {
    log(`  ${C.yellow}${C.bold}HIGH${C.reset} (blocks deploy):`);
    highs.forEach((f) => log(`    ${C.yellow}⚠${C.reset} [${f.category}] ${f.message}`));
    log('');
  }

  if (mediums.length > 0) {
    log(`  ${C.cyan}MEDIUM${C.reset} (advisory):`);
    mediums.forEach((f) => log(`    ${C.dim}▸${C.reset} [${f.category}] ${f.message}`));
    log('');
  }

  if (lows.length > 0) {
    log(`  ${C.dim}LOW (informational):${C.reset}`);
    lows.forEach((f) => log(`    ${C.dim}·${C.reset} [${f.category}] ${f.message}`));
    log('');
  }

  // Verdict
  if (criticals.length > 0 || highs.length > 0) {
    log(`  ${C.red}${C.bold}DEPLOY BLOCKED${C.reset} — fix CRITICAL/HIGH issues first\n`);
  } else {
    log(`  ${C.green}${C.bold}DEPLOY OK${C.reset} — only advisory findings\n`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════
function main() {
  const startTime = Date.now();

  if (!jsonOutput) {
    log('');
    log(`${C.bold}${C.magenta}  OppsEra Pre-Deploy Audit${C.reset}`);
    divider();
  }

  // Fast checks (no external commands)
  checkSecretsSafety();
  checkMigrationJournal();
  checkGitHygiene();
  checkEnvVars();
  checkDbSafety();

  // Slow checks (run external tools)
  checkLint();
  checkTypeCheck();
  checkBuild();
  checkTests();

  // Report
  printReport();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (!jsonOutput) {
    log(`  ${C.dim}Completed in ${elapsed}s${C.reset}\n`);
  }

  // Exit code
  const criticals = findings.filter((f) => f.severity === 'CRITICAL');
  const highs = findings.filter((f) => f.severity === 'HIGH');
  if (criticals.length > 0 || highs.length > 0) {
    process.exit(1);
  }
}

main();
