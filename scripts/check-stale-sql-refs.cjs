#!/usr/bin/env node
/**
 * CI check: grep for retired/renamed SQL identifiers in source code.
 *
 * Maintains a denylist of old table/column names that have been renamed.
 * Catches stale raw SQL references that would cause runtime Postgres errors.
 *
 * Usage:  node scripts/check-stale-sql-refs.cjs
 * Exit 0: clean  |  Exit 1: stale references found
 */

const fs = require('fs');
const path = require('path');

// ── Denylist: add entries here after any table/column rename ──
const STALE_IDENTIFIERS = [
  {
    pattern: /\bfnb_tab_lines\b/,
    label: 'fnb_tab_lines',
    replacement: 'fnb_tab_items',
    reason: 'Table renamed — migration 0245',
  },
  {
    // Only flag tc.status in files that also reference fnb_tab_courses
    pattern: /\btc\.status\b/,
    label: 'tc.status',
    replacement: 'tc.course_status',
    reason: 'fnb_tab_courses uses course_status, not status',
    contextPattern: /fnb_tab_courses/,
  },
];

const SEARCH_DIRS = [
  'packages/modules',
  'packages/core',
  'apps/web/src/app/api',
];

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.next', '__tests__', 'coverage',
]);
const SKIP_EXTENSIONS = ['.test.ts', '.test.tsx', '.spec.ts'];

function walk(dir, files = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return files; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      if (SKIP_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      files.push(full);
    }
  }
  return files;
}

const root = process.cwd();
let exitCode = 0;

for (const entry of STALE_IDENTIFIERS) {
  const flagged = [];

  for (const dir of SEARCH_DIRS) {
    const absDir = path.resolve(root, dir);
    if (!fs.existsSync(absDir)) continue;

    for (const filePath of walk(absDir)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!entry.pattern.test(content)) continue;
      if (entry.contextPattern && !entry.contextPattern.test(content)) continue;

      // Find matching lines
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (entry.pattern.test(lines[i])) {
          const rel = path.relative(root, filePath);
          flagged.push(`   ${rel}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
  }

  if (flagged.length > 0) {
    console.error(`\nStale SQL identifier: "${entry.label}"`);
    console.error(`   Use "${entry.replacement}" instead (${entry.reason})`);
    for (const line of flagged) {
      console.error(line);
    }
    exitCode = 1;
  }
}

if (exitCode === 0) {
  console.log('No stale SQL identifiers found.');
} else {
  console.error('\nUpdate the denylist in scripts/check-stale-sql-refs.cjs after fixing.');
}

process.exit(exitCode);
