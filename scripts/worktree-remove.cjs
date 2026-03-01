#!/usr/bin/env node
/**
 * worktree-remove.cjs — Remove a git worktree created by worktree-create.
 *
 * Usage:  pnpm wt:remove <name> [--merge]
 *
 * Options:
 *   --merge   Merge the agent/<name> branch back into the current branch before removing.
 *
 * NOTE: .cjs extension required because package.json has "type": "module"
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Parse args ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const mergeFlag = args.includes('--merge');
const name = args.find((a) => !a.startsWith('--'));

if (!name) {
  console.error('Usage: pnpm wt:remove <name> [--merge]');
  console.error('');
  console.error('Options:');
  console.error('  --merge   Merge the agent/<name> branch back into current branch first.');
  process.exit(1);
}

// ── Paths ─────────────────────────────────────────────────────────

const repoRoot = path.resolve(__dirname, '..');
const worktreeBase = path.resolve(repoRoot, '..', 'oppsera-worktrees');
const worktreePath = path.join(worktreeBase, name);
const branchName = `agent/${name}`;

// ── Pre-flight checks ─────────────────────────────────────────────

if (!fs.existsSync(worktreePath)) {
  console.error(`Error: Worktree directory not found: ${worktreePath}`);
  console.error('Available worktrees:');
  try {
    execSync('git worktree list', { cwd: repoRoot, stdio: 'inherit' });
  } catch { /* ignore */ }
  process.exit(1);
}

// ── Check for uncommitted changes ─────────────────────────────────

try {
  const status = execSync('git status --porcelain', { cwd: worktreePath, encoding: 'utf-8' }).trim();
  if (status) {
    console.error(`Error: Worktree "${name}" has uncommitted changes:`);
    console.error(status);
    console.error('');
    console.error('Commit or stash your changes first, then retry.');
    process.exit(1);
  }
} catch {
  // If git status fails, the worktree might be corrupted — proceed with force removal
  console.warn('Warning: Could not check worktree status. Proceeding with removal.');
}

// ── Optional merge ────────────────────────────────────────────────

if (mergeFlag) {
  console.log(`Merging ${branchName} into current branch...`);
  try {
    execSync(`git merge ${branchName}`, { cwd: repoRoot, stdio: 'inherit' });
    console.log('Merge successful.');
  } catch {
    console.error('');
    console.error('Merge failed. Resolve conflicts in the main repo, then re-run:');
    console.error(`  pnpm wt:remove ${name}`);
    process.exit(1);
  }
}

// ── Remove worktree ───────────────────────────────────────────────

console.log(`Removing worktree "${name}"...`);

try {
  execSync(`git worktree remove "${worktreePath}" --force`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
} catch {
  // Fallback: manually remove the directory and prune
  console.warn('Standard removal failed. Cleaning up manually...');
  try {
    fs.rmSync(worktreePath, { recursive: true, force: true });
  } catch { /* ignore */ }
  execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' });
}

// ── Delete branch ─────────────────────────────────────────────────

try {
  execSync(`git branch -d "${branchName}"`, { cwd: repoRoot, stdio: 'pipe' });
  console.log(`  Deleted branch ${branchName}`);
} catch {
  // Branch might already be deleted or have unmerged changes
  console.log(`  Branch ${branchName} not deleted (may have unmerged changes — use git branch -D to force).`);
}

// ── Cleanup empty worktree base directory ─────────────────────────

try {
  const remaining = fs.readdirSync(worktreeBase);
  if (remaining.length === 0) {
    fs.rmdirSync(worktreeBase);
  }
} catch { /* ignore */ }

console.log(`Worktree "${name}" removed.`);
