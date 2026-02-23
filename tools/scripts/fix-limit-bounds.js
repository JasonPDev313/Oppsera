#!/usr/bin/env node
/**
 * fix-limit-bounds.js
 * Adds Math.min(..., MAX) bounds to all unbounded parseInt(limit) calls in API routes.
 * Skips routes that already have Math.min wrapping.
 */
const fs = require('fs');
const path = require('path');

const API_DIR = path.resolve(__dirname, '../../apps/web/src/app/api');

// Routes that need higher limits
const HIGHER_LIMITS = {
  'reports/item-sales/export': 10000,
  'reports/item-sales': 200,
  'accounting/reports/detail': 1000,
};

function getMaxForRoute(filePath) {
  const rel = filePath.replace(/\\/g, '/');
  for (const [pattern, max] of Object.entries(HIGHER_LIMITS)) {
    if (rel.includes(pattern)) return max;
  }
  return 100;
}

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.name === 'route.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

let totalFixed = 0;
let filesModified = 0;

const files = walkDir(API_DIR);

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let modified = false;
  const max = getMaxForRoute(filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip lines that already have Math.min
    if (line.includes('Math.min')) continue;

    // Skip lines that don't have parseInt with limit-like context
    if (!line.includes('parseInt')) continue;
    if (!(/limit/i.test(line))) continue;

    // Pattern 1: parseInt(limitParam, 10) — variable form
    // e.g., limitParam ? parseInt(limitParam, 10) : undefined
    const varPattern = /parseInt\((\w+),\s*10\)/g;
    let match;
    let newLine = line;
    let lineModified = false;

    // Check for variable-based patterns
    while ((match = varPattern.exec(line)) !== null) {
      const full = match[0];
      const replacement = `Math.min(${full}, ${max})`;
      newLine = newLine.replace(full, replacement);
      lineModified = true;
    }

    // Pattern 2: parseInt(url.searchParams.get('limit')!, 10)
    // Need to handle the complex expression
    if (!lineModified) {
      const urlPattern = /parseInt\(url\.searchParams\.get\([^)]+\)!?,\s*10\)/g;
      while ((match = urlPattern.exec(line)) !== null) {
        const full = match[0];
        const replacement = `Math.min(${full}, ${max})`;
        newLine = newLine.replace(full, replacement);
        lineModified = true;
      }
    }

    // Pattern 3: parseInt(url.searchParams.get('limit')!) — no radix
    if (!lineModified) {
      const noRadixPattern = /parseInt\(url\.searchParams\.get\([^)]+\)!?\)/g;
      while ((match = noRadixPattern.exec(line)) !== null) {
        const full = match[0];
        // Add radix 10 as well
        const withRadix = full.replace(')', ', 10)');
        const replacement = `Math.min(${withRadix}, ${max})`;
        newLine = newLine.replace(full, replacement);
        lineModified = true;
      }
    }

    if (lineModified) {
      lines[i] = newLine;
      modified = true;
      totalFixed++;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    filesModified++;
    const rel = path.relative(API_DIR, filePath).replace(/\\/g, '/');
    console.log(`  Fixed: ${rel} (max=${max})`);
  }
}

console.log(`\nDone: ${totalFixed} limit params bounded across ${filesModified} files.`);
