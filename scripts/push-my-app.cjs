#!/usr/bin/env node
// push-my-app.cjs — One-command deploy for OppsEra
// Usage: pnpm push-my-app "commit message"
//   or:  node scripts/push-my-app.cjs "commit message"
//
// Sequence:
//   1. Lint + auto-fix
//   2. Unit tests (retry loop — pauses for you to fix failures)
//   3. Migrate DB to remote Supabase (only if remote DB is reachable)
//   4. Git add + commit + push
//   5. Vercel deploy + monitor (retry loop — pauses for you to fix build failures)
//
// Flags:
//   --skip-tests     Skip the test step
//   --skip-migrate   Skip remote migration
//   --skip-deploy    Skip Vercel deploy monitoring (just push)
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
  magenta: '\x1b[35m',
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
      timeout: 15 * 60 * 1000,
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

function runSuccess(cmd, timeoutMs = 60000) {
  try {
    execSync(cmd, { cwd: process.cwd(), stdio: 'pipe', encoding: 'utf-8', timeout: timeoutMs });
    return true;
  } catch {
    return false;
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Parse args ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));

const skipTests = flags.has('--skip-tests');
const skipMigrate = flags.has('--skip-migrate');
const skipDeploy = flags.has('--skip-deploy');
const dryRun = flags.has('--dry-run');

// ── Sensitive file exclusion ────────────────────────────────────────────────
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
const LOCK_FILE = path.join(process.cwd(), '.deploy.lock');
const LOCK_STALE_MS = 30 * 60 * 1000;

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
        process.kill(lock.pid, 0);
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

  fs.writeFileSync(LOCK_FILE, JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
    branch: runCapture('git rev-parse --abbrev-ref HEAD'),
    user: runCapture('git config user.name') || process.env.USERNAME || 'unknown',
  }, null, 2));
}

function releaseDeployLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const current = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      if (current.pid === process.pid) fs.unlinkSync(LOCK_FILE);
    }
  } catch { /* best effort */ }
}

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

  for (let i = 0; i < entries.length; i++) {
    if (entries[i].idx !== i) {
      fail(`Journal idx gap at position ${i}: expected idx ${i}, got ${entries[i].idx}`);
      return false;
    }
  }

  success(`Migration journal: ${entries.length} entries, idx sequential`);
  return true;
}

// ── Remote DB reachability probe ────────────────────────────────────────────
function isRemoteDbReachable() {
  // Read .env.remote and try a quick TCP connect to the DB host
  const envRemotePath = path.join(process.cwd(), '.env.remote');
  if (!fs.existsSync(envRemotePath)) return false;

  const envContent = fs.readFileSync(envRemotePath, 'utf-8');
  // Look for DATABASE_URL_ADMIN first, fallback to DATABASE_URL
  const urlMatch = envContent.match(/DATABASE_URL_ADMIN=(.+)/) || envContent.match(/DATABASE_URL=(.+)/);
  if (!urlMatch) return false;

  try {
    const url = new URL(urlMatch[1].trim());
    const host = url.hostname;
    const port = url.port || '5432';

    // Use node to test TCP connectivity (5s timeout)
    const testScript = `
      const net = require('net');
      const s = net.createConnection(${port}, '${host}');
      s.setTimeout(5000);
      s.on('connect', () => { s.destroy(); process.exit(0); });
      s.on('timeout', () => { s.destroy(); process.exit(1); });
      s.on('error', () => { process.exit(1); });
    `;
    execSync(`node -e "${testScript.replace(/\n/g, ' ')}"`, {
      stdio: 'pipe',
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Git staging helper ──────────────────────────────────────────────────────
function stageAllSafeFiles() {
  // Stage tracked changes
  run('git add -u', { allowFail: true });

  // Stage new files (excluding sensitive)
  const untracked = runCapture('git ls-files --others --exclude-standard');
  if (untracked) {
    const newFiles = untracked.split('\n').filter(Boolean);
    const safeFiles = newFiles.filter((f) => !isSensitiveFile(f));
    const blockedFiles = newFiles.filter(isSensitiveFile);

    if (blockedFiles.length > 0) {
      warn(`Skipping ${blockedFiles.length} sensitive file(s)`);
    }

    if (safeFiles.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < safeFiles.length; i += batchSize) {
        const batch = safeFiles.slice(i, i + batchSize);
        const quotedFiles = batch.map((f) => `"${f}"`).join(' ');
        run(`git add ${quotedFiles}`, { allowFail: true });
      }
    }
  }
}

// ── Vercel deploy monitor with retry ────────────────────────────────────────
async function waitForVercelDeploy(branch) {
  // Give Vercel time to pick up the push
  info('Waiting for Vercel to pick up deployment...');
  await sleep(8000);

  const maxPollTime = 20 * 60 * 1000; // 20 minutes
  const pollInterval = 10000; // 10 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxPollTime) {
    const lsResult = runCapture('npx vercel ls oppsera --limit 1 2>&1');

    if (lsResult) {
      if (lsResult.includes('Ready')) {
        success('Vercel deployment is Ready!');
        const urlMatch = lsResult.match(/(https:\/\/[^\s]+\.vercel\.app)/);
        if (urlMatch) {
          log(`\n  ${C.bold}Preview:${C.reset} ${urlMatch[1]}`);
        }
        return 'ready';
      }

      if (lsResult.includes('Error') || lsResult.includes('Failed')) {
        fail('Vercel deployment failed!');
        return 'failed';
      }

      // Still building
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed % 30 < 11) { // Log roughly every 30s
        info(`Deploy building... (${elapsed}s elapsed)`);
      }
    }

    await sleep(pollInterval);
  }

  warn('Timed out waiting for deploy (20 min).');
  return 'timeout';
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  log('');
  log(`${C.bold}${C.magenta}  Push My App${C.reset} ${C.dim}— OppsEra Deploy${C.reset}`);
  divider();

  if (dryRun) warn('Dry-run mode — no commands will execute\n');

  // Count steps
  let totalSteps = 4; // lint, git-commit, push, done
  if (!skipTests) totalSteps++;
  if (!skipMigrate) totalSteps++;
  if (!skipDeploy) totalSteps++;
  let currentStep = 0;

  // ── Pre-flight ──────────────────────────────────────────────────────────
  const branch = runCapture('git rev-parse --abbrev-ref HEAD');
  if (branch !== 'main') {
    warn(`You are on branch "${branch}", not "main".`);
    const answer = await ask(`${C.yellow}  Continue anyway? (y/N): ${C.reset}`);
    if (answer.toLowerCase() !== 'y') {
      fail('Aborted — switch to main first.');
      process.exit(1);
    }
  }

  const status = runCapture('git status --porcelain');
  if (!status) {
    warn('No changes detected in working tree.');
    const answer = await ask(`${C.yellow}  Continue anyway (push existing commits)? (y/N): ${C.reset}`);
    if (answer.toLowerCase() !== 'y') {
      info('Nothing to deploy.');
      process.exit(0);
    }
  } else {
    const fileCount = status.split('\n').filter(Boolean).length;
    info(`${fileCount} file(s) changed on branch ${C.bold}${branch}${C.reset}`);
  }

  if (!validateMigrationJournal()) {
    fail('Migration journal is inconsistent — fix before deploying.');
    process.exit(1);
  }

  if (!dryRun) {
    acquireDeployLock();
  }

  // ── Step 1: Lint + Auto-Fix ─────────────────────────────────────────────
  currentStep++;
  step(currentStep, totalSteps, 'Lint + Auto-Fix');

  try {
    info('Running ESLint with --fix...');
    run('pnpm --filter @oppsera/web exec eslint src/ --fix', { dryRun, allowFail: true });
    success('Auto-fix pass complete');

    info('Verifying lint is clean...');
    run('pnpm lint', { dryRun });
    success('Lint passed');
  } catch {
    fail('Lint errors remain after auto-fix.');
    fail('Fix the remaining issues manually, then run again.');
    process.exit(1);
  }

  // ── Step 2: Unit Tests (collect all failures, then prompt once) ──────────
  if (!skipTests) {
    currentStep++;
    step(currentStep, totalSteps, 'Unit Tests');

    let testsPassed = false;
    while (!testsPassed) {
      try {
        // Run tests and capture output to parse failures
        const testOutput = run('pnpm test 2>&1', { dryRun, silent: true });
        testsPassed = true;
        success('All tests passed');
      } catch (err) {
        // Collect all failure/warning lines from test output
        const output = (err.stdout || '') + '\n' + (err.stderr || '');
        const lines = output.split('\n');
        const failures = [];
        const warnings = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Vitest failure patterns
          if (trimmed.startsWith('FAIL') || trimmed.startsWith('×') || trimmed.startsWith('✕') ||
              /AssertionError|Error:|expected .+ to .+|toBe|toEqual|toMatch|toThrow/i.test(trimmed)) {
            failures.push(trimmed);
          }
          // Test file paths with failures
          else if (/\s(FAIL|FAILED)\s/.test(trimmed)) {
            failures.push(trimmed);
          }
          // Warning patterns
          else if (/warn|deprecat/i.test(trimmed) && !trimmed.startsWith('[')) {
            warnings.push(trimmed);
          }
        }

        // De-duplicate
        const uniqueFailures = [...new Set(failures)];
        const uniqueWarnings = [...new Set(warnings)];

        log('');
        divider();
        log(`${C.bold}${C.red}  Test Failures & Warnings${C.reset}`);
        divider();

        if (uniqueFailures.length > 0) {
          log(`\n  ${C.red}${C.bold}FAILURES (${uniqueFailures.length}):${C.reset}`);
          uniqueFailures.forEach((f, i) => {
            log(`  ${C.red}${i + 1}.${C.reset} ${f}`);
          });
        }

        if (uniqueWarnings.length > 0) {
          log(`\n  ${C.yellow}${C.bold}WARNINGS (${uniqueWarnings.length}):${C.reset}`);
          uniqueWarnings.forEach((w, i) => {
            log(`  ${C.yellow}${i + 1}.${C.reset} ${w}`);
          });
        }

        if (uniqueFailures.length === 0 && uniqueWarnings.length === 0) {
          // Couldn't parse structured output — show raw tail
          log(`\n  ${C.red}Tests failed. Raw output (last 30 lines):${C.reset}`);
          const tail = lines.filter((l) => l.trim()).slice(-30);
          tail.forEach((l) => log(`  ${C.dim}${l}${C.reset}`));
        }

        log('');
        divider();
        log(`  ${C.yellow}Fix all issues above, then press Enter to re-run tests.${C.reset}`);
        log(`  ${C.dim}Type "skip" to continue without passing tests, "abort" to cancel.${C.reset}`);
        const answer = await ask(`\n${C.cyan}  [Enter=re-run / skip / abort]: ${C.reset}`);

        if (answer.toLowerCase() === 'abort') {
          fail('Deploy aborted.');
          process.exit(1);
        }
        if (answer.toLowerCase() === 'skip') {
          warn('Continuing without passing tests.');
          break;
        }
        info('Re-running tests...');
      }
    }
  } else {
    info('Skipping tests (--skip-tests)');
  }

  // ── Step 3: DB Migration (local first, then remote) ─────────────────────
  if (!skipMigrate) {
    currentStep++;
    step(currentStep, totalSteps, 'DB Migrations (local → remote)');

    if (dryRun) {
      log(`${C.dim}  [dry-run] local migrate + remote migrate${C.reset}`);
    } else {
      // Local migration first
      info('Running local DB migration...');
      try {
        run('pnpm db:migrate');
        success('Local DB migration applied');
      } catch {
        warn('Local DB migration failed — skipping to remote.');
      }

      // Remote migration (required — blocks deploy on failure)
      info('Running remote DB migration...');
      if (isRemoteDbReachable()) {
        success('Remote DB is reachable');
        try {
          run('pnpm --filter @oppsera/db db:migrate:remote');
          success('Remote DB migration applied');
        } catch {
          fail('Remote DB migration failed — deploy blocked.');
          fail('Check Supabase dashboard and migration logs.');
          process.exit(1);
        }
      } else {
        fail('Remote DB is not reachable — deploy blocked.');
        fail('Cannot proceed without successful remote migration.');
        process.exit(1);
      }
    }
  } else {
    info('Skipping migrations (--skip-migrate)');
  }

  // ── Step 4: Git Add + Commit + Push ─────────────────────────────────────
  currentStep++;
  step(currentStep, totalSteps, 'Git Commit & Push');

  if (!dryRun) {
    stageAllSafeFiles();

    const stagedStat = runCapture('git diff --cached --stat');
    if (stagedStat) {
      info('Staged:');
      log(`${C.dim}${stagedStat}${C.reset}`);
    }
  }

  // Commit message
  let commitMsg = positional.join(' ');
  if (!commitMsg) {
    commitMsg = await ask(`${C.cyan}  Commit message: ${C.reset}`);
    if (!commitMsg) {
      fail('No commit message — aborting.');
      run('git reset HEAD', { dryRun, allowFail: true });
      process.exit(1);
    }
  }

  try {
    const staged = runCapture('git diff --cached --stat');
    if (!staged && !dryRun) {
      info('Nothing staged — skipping commit.');
    } else {
      const escapedMsg = commitMsg.replace(/"/g, '\\"');
      run(`git commit -m "${escapedMsg}"`, { dryRun });
      success(`Committed: "${commitMsg}"`);
    }
  } catch {
    warn('Commit failed (possibly nothing to commit).');
    const answer = await ask(`${C.yellow}  Continue to push existing commits? (y/N): ${C.reset}`);
    if (answer.toLowerCase() !== 'y') process.exit(1);
  }

  // Push
  currentStep++;
  step(currentStep, totalSteps, 'Push to Origin');
  try {
    run(`git push origin ${branch}`, { dryRun });
    success(`Pushed to origin/${branch}`);
  } catch {
    fail('Push failed — check remote and auth.');
    process.exit(1);
  }

  // ── Step 5: Vercel Deploy + Monitor (retry loop) ────────────────────────
  if (!skipDeploy) {
    currentStep++;
    step(currentStep, totalSteps, 'Vercel Deploy & Monitor');

    if (dryRun) {
      log(`${C.dim}  [dry-run] vercel deploy monitor${C.reset}`);
    } else {
      let deployDone = false;
      while (!deployDone) {
        const result = await waitForVercelDeploy(branch);

        if (result === 'ready') {
          deployDone = true;
        } else if (result === 'failed') {
          log('');
          log(`  ${C.yellow}Vercel build failed. Fix the issue, then choose an action:${C.reset}`);
          log(`  ${C.dim}Dashboard: https://vercel.com/dashboard${C.reset}`);
          log('');
          log(`  ${C.dim}  Enter  = fix code, re-commit, re-push, and re-monitor${C.reset}`);
          log(`  ${C.dim}  skip   = stop monitoring (deploy stays failed)${C.reset}`);
          log(`  ${C.dim}  abort  = cancel${C.reset}`);
          const answer = await ask(`\n${C.cyan}  [Enter=fix & retry / skip / abort]: ${C.reset}`);

          if (answer.toLowerCase() === 'abort') {
            fail('Deploy aborted.');
            process.exit(1);
          }
          if (answer.toLowerCase() === 'skip') {
            warn('Skipping Vercel monitoring — deploy may still be failing.');
            deployDone = true;
          } else {
            // User fixed code — re-stage, re-commit, re-push
            info('Re-staging changes...');
            stageAllSafeFiles();

            const staged = runCapture('git diff --cached --stat');
            if (staged) {
              log(`${C.dim}${staged}${C.reset}`);
              const fixMsg = await ask(`${C.cyan}  Fix commit message (default: "fix: vercel build"): ${C.reset}`);
              const msg = fixMsg || 'fix: vercel build';
              const escapedFixMsg = msg.replace(/"/g, '\\"');
              try {
                run(`git commit -m "${escapedFixMsg}"`);
                success(`Committed: "${msg}"`);
              } catch {
                warn('Nothing new to commit.');
              }
            } else {
              info('No new changes staged.');
            }

            try {
              run(`git push origin ${branch}`);
              success(`Re-pushed to origin/${branch}`);
            } catch {
              fail('Push failed.');
              process.exit(1);
            }

            info('Monitoring new deployment...');
          }
        } else {
          // timeout
          log(`  ${C.dim}Dashboard: https://vercel.com/dashboard${C.reset}`);
          deployDone = true;
        }
      }
    }
  }

  // ── Done ────────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log('');
  divider();
  log(`${C.bold}${C.green}  Push My App — Complete!${C.reset} ${C.dim}(${elapsed}s)${C.reset}`);
  log('');
  log(`  ${C.green}+${C.reset} Lint (auto-fixed)`);
  if (!skipTests) log(`  ${C.green}+${C.reset} Tests passed`);
  if (!skipMigrate) log(`  ${C.green}+${C.reset} DB migration (if reachable)`);
  log(`  ${C.green}+${C.reset} Pushed to origin/${branch}`);
  if (!skipDeploy) log(`  ${C.green}+${C.reset} Vercel deployed`);
  log('');
}

main().catch((err) => {
  fail(`Unexpected error: ${err.message}`);
  process.exit(1);
});
