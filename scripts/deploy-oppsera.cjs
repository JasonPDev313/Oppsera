#!/usr/bin/env node
// deploy-oppsera.cjs — Production deploy sequence for OppsEra
// Usage: node scripts/deploy-oppsera.cjs [commit message]
//   or:  pnpm deploy:prod "commit message"
//
// Sequence:
//   1. Pre-flight checks (branch, env, secrets scan, migration journal)
//   2. Lint (floating-promise detection — prevents Vercel pool exhaustion)
//   3. Build all packages
//   4. Type-check
//   5. Run tests
//   6. Push migrations to remote Supabase (DATABASE_URL_ADMIN via .env.remote)
//   7. Git add (safe — excludes .env, credentials) + commit + push
//
// Flags:
//   --skip-tests     Skip the test step
//   --skip-build     Skip the build step
//   --skip-lint      Skip the lint step
//   --skip-migrate   Skip remote migration (dangerous — only if DB is already up to date)
//   --dry-run        Show what would happen without executing

'use strict';

const { execSync } = require('child_process');
const readline = require('readline');
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
};

function log(msg) { console.log(msg); }
function info(msg) { log(`${C.cyan}[INFO]${C.reset} ${msg}`); }
function success(msg) { log(`${C.green}[OK]${C.reset}   ${msg}`); }
function warn(msg) { log(`${C.yellow}[WARN]${C.reset} ${msg}`); }
function fail(msg) { log(`${C.red}[FAIL]${C.reset} ${msg}`); }
function step(n, total, msg) {
  log(`\n${C.bold}${C.blue}[${n}/${total}]${C.reset} ${C.bold}${msg}${C.reset}`);
}
function divider() { log(`${C.dim}${'─'.repeat(60)}${C.reset}`); }

// ── Helpers ─────────────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  const { dryRun = false, allowFail = false, silent = false } = opts;
  if (dryRun) {
    log(`${C.dim}  [dry-run] ${cmd}${C.reset}`);
    return '';
  }
  try {
    const result = execSync(cmd, {
      cwd: process.cwd(),
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf-8',
      timeout: 15 * 60 * 1000, // 15 min max per command
    });
    return result || '';
  } catch (err) {
    if (allowFail) return '';
    throw err;
  }
}

function runCapture(cmd) {
  try {
    return execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch {
    return '';
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── Parse args ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));

const skipTests = flags.has('--skip-tests');
const skipBuild = flags.has('--skip-build');
const skipLint = flags.has('--skip-lint');
const skipMigrate = flags.has('--skip-migrate');
const dryRun = flags.has('--dry-run');

// ── Safe files to exclude from git add ──────────────────────────────────────
// These patterns are NEVER staged regardless of .gitignore
const NEVER_STAGE_PATTERNS = [
  '.env', '.env.local', '.env.remote', '.env.production', '.env.vercel',
  '.env.local.', '.env.vercel-',
  'credentials.json', 'service-account', 'private_key', '.pem', '.key', '.p12', '.pfx',
  'id_rsa', 'id_ed25519',
];

function isSensitiveFile(filepath) {
  const lower = filepath.toLowerCase();
  return NEVER_STAGE_PATTERNS.some((p) => lower.includes(p));
}

// ── Deploy Lock ─────────────────────────────────────────────────────────────
// Prevents concurrent deploys from the same machine.
const LOCK_FILE = path.join(process.cwd(), '.deploy.lock');
const LOCK_STALE_MS = 30 * 60 * 1000; // 30 minutes = stale

function acquireDeployLock() {
  if (fs.existsSync(LOCK_FILE)) {
    let lock;
    try {
      lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
    } catch {
      warn('Corrupt deploy lock file — removing.');
      fs.unlinkSync(LOCK_FILE);
      lock = null;
    }

    if (lock) {
      const age = Date.now() - new Date(lock.startedAt).getTime();
      let processAlive = false;
      try {
        process.kill(lock.pid, 0); // signal 0 = check existence
        processAlive = true;
      } catch { /* process dead */ }

      if (processAlive && age < LOCK_STALE_MS) {
        fail(`Deploy already in progress (PID ${lock.pid}, started ${lock.startedAt})`);
        fail('If this is stale, delete .deploy.lock manually.');
        process.exit(1);
      }

      warn(`Removing stale deploy lock (PID ${lock.pid}, age ${Math.round(age / 1000)}s)`);
    }
  }

  const lockData = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    branch: runCapture('git rev-parse --abbrev-ref HEAD'),
    user: runCapture('git config user.name') || process.env.USERNAME || 'unknown',
  };

  fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2));
}

function releaseDeployLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const current = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      if (current.pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch { /* best effort */ }
}

// Register cleanup handlers for all exit paths
process.on('exit', releaseDeployLock);
process.on('SIGINT', () => { releaseDeployLock(); process.exit(130); });
process.on('SIGTERM', () => { releaseDeployLock(); process.exit(143); });

// ── Migration journal validation ────────────────────────────────────────────
function validateMigrationJournal() {
  const journalPath = path.join(process.cwd(), 'packages/db/migrations/meta/_journal.json');
  const migrationsDir = path.join(process.cwd(), 'packages/db/migrations');

  if (!fs.existsSync(journalPath)) {
    fail('Migration journal _journal.json not found');
    return false;
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
  const entries = journal.entries || [];
  const journalTags = new Set(entries.map((e) => e.tag));

  const sqlFiles = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace('.sql', ''));

  const sqlFileSet = new Set(sqlFiles);

  const orphans = sqlFiles.filter((f) => !journalTags.has(f));
  const missing = entries.filter((e) => !sqlFileSet.has(e.tag));

  if (orphans.length > 0) {
    fail(`${orphans.length} orphan SQL file(s) without journal entries: ${orphans.join(', ')}`);
    return false;
  }
  if (missing.length > 0) {
    fail(`${missing.length} journal entries without SQL files: ${missing.map((e) => e.tag).join(', ')}`);
    return false;
  }

  // Check sequential idx
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].idx !== i) {
      fail(`Journal idx gap at position ${i}: expected idx ${i}, got ${entries[i].idx}`);
      return false;
    }
  }

  success(`Migration journal: ${entries.length} entries = ${sqlFiles.length} SQL files, idx sequential`);
  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  log('');
  log(`${C.bold}${C.green}  OppsEra Production Deploy${C.reset}`);
  divider();

  if (dryRun) warn('Dry-run mode — no commands will execute\n');

  // Count total steps
  let totalSteps = 6; // pre-flight, migrate, git-add, commit, push, done
  if (!skipLint) totalSteps++;
  if (!skipBuild) totalSteps++;
  totalSteps++; // type-check always
  if (!skipTests) totalSteps++;
  let currentStep = 0;

  // ── Pre-flight ────────────────────────────────────────────────────────────
  currentStep++;
  step(currentStep, totalSteps, 'Pre-flight checks');

  // Branch
  const branch = runCapture('git rev-parse --abbrev-ref HEAD');
  if (branch !== 'main') {
    warn(`You are on branch "${branch}", not "main".`);
    const answer = await ask(`${C.yellow}  Continue anyway? (y/N): ${C.reset}`);
    if (answer.toLowerCase() !== 'y') {
      fail('Aborted — switch to main first.');
      process.exit(1);
    }
  }
  success(`Branch: ${branch}`);

  // Working tree
  const status = runCapture('git status --porcelain');
  if (!status) {
    warn('No changes detected in working tree.');
    const answer = await ask(`${C.yellow}  Continue deploy anyway (e.g. to push existing commits)? (y/N): ${C.reset}`);
    if (answer.toLowerCase() !== 'y') {
      info('Nothing to deploy.');
      process.exit(0);
    }
  } else {
    const fileCount = status.split('\n').filter(Boolean).length;
    info(`${fileCount} file(s) changed`);
  }

  // Secrets scan — check for sensitive files in working tree
  if (status) {
    const changedFiles = status.split('\n').filter(Boolean).map((line) => line.substring(3));
    const sensitiveFiles = changedFiles.filter(isSensitiveFile);
    if (sensitiveFiles.length > 0) {
      fail('Sensitive files detected in working tree:');
      sensitiveFiles.forEach((f) => fail(`  ${f}`));
      fail('These will NOT be staged. If intentional, stage manually with git add <file>.');
      // Don't exit — we handle this in the git add step
    } else {
      success('No sensitive files in working tree');
    }
  }

  // .env.remote for migrations
  if (!skipMigrate) {
    const envRemotePath = path.join(process.cwd(), '.env.remote');
    if (!fs.existsSync(envRemotePath)) {
      fail('.env.remote not found — cannot run remote migrations.');
      fail('Create .env.remote with production DATABASE_URL_ADMIN.');
      process.exit(1);
    }
    success('.env.remote found');
  }

  // Migration journal integrity
  if (!validateMigrationJournal()) {
    fail('Migration journal is inconsistent — fix before deploying.');
    process.exit(1);
  }

  // Deploy lock — prevent concurrent deploys
  if (!dryRun) {
    acquireDeployLock();
    success('Deploy lock acquired');
  }

  // ── Step: Lint ────────────────────────────────────────────────────────────
  if (!skipLint) {
    currentStep++;
    step(currentStep, totalSteps, 'Linting (floating-promise detection)');
    try {
      run('pnpm lint', { dryRun });
      success('Lint passed (no-floating-promises enforced)');
    } catch {
      fail('Lint failed — possible unawaited DB operations.');
      fail('Floating promises cause Vercel pool exhaustion (see outages 2026-02-27/28).');
      process.exit(1);
    }
  } else {
    info('Skipping lint (--skip-lint)');
  }

  // ── Step: Build ───────────────────────────────────────────────────────────
  if (!skipBuild) {
    currentStep++;
    step(currentStep, totalSteps, 'Building all packages');
    try {
      run('pnpm build', { dryRun });
      success('Build passed');
    } catch {
      fail('Build failed — fix errors before deploying.');
      process.exit(1);
    }
  } else {
    info('Skipping build (--skip-build)');
  }

  // ── Step: Type-check ──────────────────────────────────────────────────────
  currentStep++;
  step(currentStep, totalSteps, 'Type-checking');
  try {
    run('pnpm type-check', { dryRun });
    success('Type-check passed');
  } catch {
    fail('Type-check failed — fix type errors before deploying.');
    process.exit(1);
  }

  // ── Step: Tests ───────────────────────────────────────────────────────────
  if (!skipTests) {
    currentStep++;
    step(currentStep, totalSteps, 'Running tests');
    try {
      run('pnpm test', { dryRun });
      success('All tests passed');
    } catch {
      fail('Tests failed — fix failing tests before deploying.');
      process.exit(1);
    }
  } else {
    info('Skipping tests (--skip-tests)');
  }

  // ── Step: Remote migration ────────────────────────────────────────────────
  if (!skipMigrate) {
    currentStep++;
    step(currentStep, totalSteps, 'Pushing migrations to remote Supabase');
    warn('This updates the PRODUCTION database schema.');
    if (!dryRun) {
      const answer = await ask(`${C.yellow}  Proceed with remote migration? (Y/n): ${C.reset}`);
      if (answer.toLowerCase() === 'n') {
        fail('Aborted — migrations not applied.');
        process.exit(1);
      }
    }
    try {
      run('pnpm --filter @oppsera/db db:migrate:remote', { dryRun });
      success('Remote migrations applied');
    } catch {
      fail('Remote migration failed — DO NOT push code.');
      fail('The production DB may be in a partial state.');
      fail('Check Supabase dashboard and migration logs.');
      process.exit(1);
    }
  } else {
    warn('Skipping remote migration (--skip-migrate)');
    warn('Make sure the production DB schema is up to date!');
  }

  // ── Step: Git add (SAFE — excludes sensitive files) ───────────────────────
  currentStep++;
  step(currentStep, totalSteps, 'Staging changes (safe mode)');

  if (!dryRun) {
    // Stage tracked files that are modified/deleted
    run('git add -u', { dryRun, allowFail: true });

    // Stage new untracked files — but filter out sensitive ones
    const untracked = runCapture('git ls-files --others --exclude-standard');
    if (untracked) {
      const newFiles = untracked.split('\n').filter(Boolean);
      const safeFiles = newFiles.filter((f) => !isSensitiveFile(f));
      const blockedFiles = newFiles.filter(isSensitiveFile);

      if (blockedFiles.length > 0) {
        warn(`Skipping ${blockedFiles.length} sensitive file(s):`);
        blockedFiles.forEach((f) => warn(`  ${f}`));
      }

      if (safeFiles.length > 0) {
        // Stage safe files in batches to avoid arg length limits
        const batchSize = 50;
        for (let i = 0; i < safeFiles.length; i += batchSize) {
          const batch = safeFiles.slice(i, i + batchSize);
          const quotedFiles = batch.map((f) => `"${f}"`).join(' ');
          run(`git add ${quotedFiles}`, { dryRun, allowFail: true });
        }
      }
    }

    // Show what was staged
    const stagedStat = runCapture('git diff --cached --stat');
    if (stagedStat) {
      info('Staged changes:');
      log(`${C.dim}${stagedStat}${C.reset}`);
    }
  } else {
    run('git add -u', { dryRun });
    log(`${C.dim}  [dry-run] git add <untracked safe files>${C.reset}`);
  }
  success('Changes staged (sensitive files excluded)');

  // ── Step: Commit ──────────────────────────────────────────────────────────
  currentStep++;
  step(currentStep, totalSteps, 'Committing');

  let commitMsg = positional.join(' ');
  if (!commitMsg) {
    commitMsg = await ask(`${C.cyan}  Commit message: ${C.reset}`);
    if (!commitMsg) {
      fail('No commit message provided — aborting.');
      run('git reset HEAD', { dryRun, allowFail: true });
      process.exit(1);
    }
  }

  try {
    const staged = runCapture('git diff --cached --stat');
    if (!staged && !dryRun) {
      info('Nothing staged to commit — skipping commit.');
    } else {
      const escapedMsg = commitMsg.replace(/"/g, '\\"');
      run(`git commit -m "${escapedMsg}"`, { dryRun });
      success(`Committed: "${commitMsg}"`);
    }
  } catch {
    warn('Commit failed (possibly pre-commit hook or nothing to commit).');
    const answer = await ask(`${C.yellow}  Continue to push existing commits? (y/N): ${C.reset}`);
    if (answer.toLowerCase() !== 'y') {
      process.exit(1);
    }
  }

  // ── Step: Push ────────────────────────────────────────────────────────────
  currentStep++;
  step(currentStep, totalSteps, 'Pushing to origin');
  try {
    run(`git push origin ${branch}`, { dryRun });
    success(`Pushed to origin/${branch}`);
  } catch {
    fail('Push failed — check your remote and auth.');
    process.exit(1);
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  log('');
  divider();
  log(`${C.bold}${C.green}  Deploy complete!${C.reset}`);
  log('');
  log(`  ${C.dim}Sequence completed:${C.reset}`);
  if (!skipLint) log(`    ${C.green}✓${C.reset} Lint (floating-promise detection)`);
  if (!skipBuild) log(`    ${C.green}✓${C.reset} Build`);
  log(`    ${C.green}✓${C.reset} Type-check`);
  if (!skipTests) log(`    ${C.green}✓${C.reset} Tests`);
  if (!skipMigrate) log(`    ${C.green}✓${C.reset} Remote DB migration`);
  log(`    ${C.green}✓${C.reset} Git commit + push (safe staging)`);
  log('');
  log(`  ${C.dim}Vercel will auto-deploy from the push.${C.reset}`);
  log(`  ${C.dim}Monitor: https://vercel.com/dashboard${C.reset}`);
  log('');
}

main().catch((err) => {
  fail(`Unexpected error: ${err.message}`);
  process.exit(1);
});
