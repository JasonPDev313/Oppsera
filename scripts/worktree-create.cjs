#!/usr/bin/env node
/**
 * worktree-create.cjs — Create a git worktree for an isolated Claude Code agent session.
 *
 * Usage:  pnpm wt:create <name>
 * Result: ../oppsera-worktrees/<name>/ with branch agent/<name>
 *
 * What it does:
 *   1. Creates a git worktree at ../oppsera-worktrees/<name>
 *   2. Checks out a new branch agent/<name> from current HEAD
 *   3. Copies .env.local and .env.remote (if they exist)
 *   4. Runs pnpm install (pnpm store is shared, so this is fast)
 *
 * NOTE: .cjs extension required because package.json has "type": "module"
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Parse args ────────────────────────────────────────────────────

const name = process.argv[2];
if (!name) {
  console.error('Usage: pnpm wt:create <name>');
  console.error('');
  console.error('Creates a git worktree for an isolated agent session.');
  console.error('Example: pnpm wt:create feature-auth');
  process.exit(1);
}

// Validate name (alphanumeric + hyphens + underscores only)
if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
  console.error(`Error: Invalid worktree name "${name}". Use only letters, numbers, hyphens, and underscores.`);
  process.exit(1);
}

// ── Paths ─────────────────────────────────────────────────────────

const repoRoot = path.resolve(__dirname, '..');
const worktreeBase = path.resolve(repoRoot, '..', 'oppsera-worktrees');
const worktreePath = path.join(worktreeBase, name);
const branchName = `agent/${name}`;

// ── Pre-flight checks ─────────────────────────────────────────────

if (fs.existsSync(worktreePath)) {
  console.error(`Error: Worktree directory already exists: ${worktreePath}`);
  console.error('Run `pnpm wt:remove ' + name + '` first, or choose a different name.');
  process.exit(1);
}

// Check if branch already exists
try {
  execSync(`git rev-parse --verify ${branchName}`, { cwd: repoRoot, stdio: 'pipe' });
  console.error(`Error: Branch "${branchName}" already exists.`);
  console.error('Either remove the existing worktree or choose a different name.');
  process.exit(1);
} catch {
  // Branch doesn't exist — good
}

// ── Create worktree ───────────────────────────────────────────────

console.log(`Creating worktree "${name}"...`);
console.log(`  Path:   ${worktreePath}`);
console.log(`  Branch: ${branchName}`);
console.log('');

// Ensure base directory exists
if (!fs.existsSync(worktreeBase)) {
  fs.mkdirSync(worktreeBase, { recursive: true });
}

// Create the worktree with a new branch from current HEAD
try {
  execSync(`git worktree add -b "${branchName}" "${worktreePath}"`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
} catch (err) {
  console.error('Failed to create git worktree.');
  process.exit(1);
}

// ── Copy env files ────────────────────────────────────────────────

const envFiles = ['.env.local', '.env.remote'];
for (const envFile of envFiles) {
  const src = path.join(repoRoot, envFile);
  const dst = path.join(worktreePath, envFile);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`  Copied ${envFile}`);
  }
}

// ── Install dependencies ──────────────────────────────────────────

console.log('');
console.log('Running pnpm install (shared store — should be fast)...');
try {
  execSync('pnpm install --frozen-lockfile', {
    cwd: worktreePath,
    stdio: 'inherit',
  });
} catch {
  // Non-frozen install as fallback (e.g., if lockfile needs update)
  console.log('Frozen lockfile failed, retrying with regular install...');
  execSync('pnpm install', {
    cwd: worktreePath,
    stdio: 'inherit',
  });
}

// ── Done ──────────────────────────────────────────────────────────

console.log('');
console.log(`Worktree "${name}" created successfully.`);
console.log('');
console.log('To start working:');
console.log(`  cd ${worktreePath}`);
console.log('');
console.log('When done:');
console.log(`  pnpm wt:remove ${name}          # remove worktree`);
console.log(`  pnpm wt:remove ${name} --merge   # merge branch back and remove`);
