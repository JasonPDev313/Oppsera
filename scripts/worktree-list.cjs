#!/usr/bin/env node
/**
 * worktree-list.cjs — List active git worktrees with status info.
 *
 * Usage: pnpm wt:list
 *
 * Shows: worktree path, branch, dirty/clean status.
 *
 * NOTE: .cjs extension required because package.json has "type": "module"
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

// ── Get worktree list ─────────────────────────────────────────────

let output;
try {
  output = execSync('git worktree list --porcelain', { cwd: repoRoot, encoding: 'utf-8' });
} catch {
  console.error('Failed to list git worktrees.');
  process.exit(1);
}

// Parse porcelain output — groups separated by blank lines
const entries = output.trim().split('\n\n').filter(Boolean);

if (entries.length <= 1) {
  console.log('No agent worktrees found. (Only the main worktree exists.)');
  console.log('');
  console.log('Create one with: pnpm wt:create <name>');
  process.exit(0);
}

console.log('Active worktrees:');
console.log('');
console.log(
  '  ' +
  'Name'.padEnd(20) +
  'Branch'.padEnd(30) +
  'Status'.padEnd(10) +
  'Path'
);
console.log('  ' + '-'.repeat(80));

for (const entry of entries) {
  const lines = entry.split('\n');
  const wtPath = lines.find((l) => l.startsWith('worktree '))?.replace('worktree ', '') ?? '';
  const branch = lines.find((l) => l.startsWith('branch '))?.replace('branch refs/heads/', '') ?? '(detached)';

  // Skip the main worktree
  if (wtPath === repoRoot || !branch.startsWith('agent/')) {
    continue;
  }

  const name = branch.replace('agent/', '');

  // Check dirty status
  let status = 'clean';
  try {
    const gitStatus = execSync('git status --porcelain', { cwd: wtPath, encoding: 'utf-8' }).trim();
    if (gitStatus) {
      status = 'dirty';
    }
  } catch {
    status = 'error';
  }

  const statusIcon = status === 'clean' ? 'clean' : status === 'dirty' ? 'DIRTY' : 'ERROR';

  console.log(
    '  ' +
    name.padEnd(20) +
    branch.padEnd(30) +
    statusIcon.padEnd(10) +
    wtPath
  );
}

console.log('');
