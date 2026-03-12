#!/usr/bin/env node

/**
 * Architecture Boundary Audit
 *
 * Scans the codebase for architectural violations:
 *   1. Module-to-module imports (hard violation)
 *   2. Module imports from non-composition app files
 *   3. Deep imports into module internals
 *
 * Usage:
 *   node scripts/audit-architecture.cjs            # Human-readable report
 *   node scripts/audit-architecture.cjs --json      # JSON output
 *   node scripts/audit-architecture.cjs --ci        # CI mode (exit 0, warnings only)
 *   node scripts/audit-architecture.cjs --strict    # Exit 1 on any violation
 *   node scripts/audit-architecture.cjs --inventory # Print event consumer inventory
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MODULES_DIR = path.join(ROOT, 'packages', 'modules');
const APPS_DIR = path.join(ROOT, 'apps');

// ── Known composition files (allowed to import many modules) ──────────
const COMPOSITION_ALLOWLIST = [
  'apps/web/src/instrumentation.ts',
  'apps/admin/src/instrumentation.ts',
];
const COMPOSITION_PATTERNS = [
  /-bootstrap\.(ts|tsx)$/,
  /reconciliation-bootstrap/,
];

function isCompositionFile(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  if (COMPOSITION_ALLOWLIST.some((a) => normalized.endsWith(a))) return true;
  if (COMPOSITION_PATTERNS.some((p) => p.test(normalized))) return true;
  return false;
}

function isTestFile(relPath) {
  return (
    relPath.includes('__tests__') ||
    relPath.includes('.test.') ||
    relPath.includes('.spec.') ||
    relPath.includes('/test/')
  );
}

// ── File walker ───────────────────────────────────────────────────────
function walkSync(dir, ext, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
      walkSync(fullPath, ext, results);
    } else if (ext.some((e) => entry.name.endsWith(e))) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Import extraction ─────────────────────────────────────────────────
// Matches both static and dynamic imports:
//   import { x } from '@oppsera/module-catalog'
//   from '@oppsera/module-catalog'
//   await import('@oppsera/module-catalog')
//   import('@oppsera/module-catalog')
const STATIC_IMPORT_RE = /(?:import|from)\s+['"](@oppsera\/module-[^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /import\(\s*['"](@oppsera\/module-[^'"]+)['"]\s*\)/g;

function extractModuleImports(content) {
  const imports = [];
  let match;
  while ((match = STATIC_IMPORT_RE.exec(content)) !== null) {
    imports.push(match[1]);
  }
  STATIC_IMPORT_RE.lastIndex = 0;
  while ((match = DYNAMIC_IMPORT_RE.exec(content)) !== null) {
    imports.push(match[1]);
  }
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  return imports;
}

function getModuleName(importPath) {
  // @oppsera/module-catalog → catalog
  // @oppsera/module-catalog/consumers → catalog
  const m = importPath.match(/@oppsera\/module-([^/]+)/);
  return m ? m[1] : importPath;
}

function isDeepImport(importPath) {
  // @oppsera/module-catalog → barrel (ok)
  // @oppsera/module-catalog/consumers → subpath export (ok)
  // @oppsera/module-catalog/src/commands/foo → deep internal (violation)
  const afterModule = importPath.replace(/@oppsera\/module-[^/]+\/?/, '');
  if (!afterModule) return false; // bare barrel
  if (afterModule === 'consumers') return false; // approved subpath
  if (afterModule.startsWith('src/')) return true; // deep internal
  // Other subpaths (e.g., /setup) — flag for review
  return false;
}

// ── Check 1: Module-to-module imports ─────────────────────────────────
function checkModuleToModule() {
  const violations = [];
  const modulePackages = fs.existsSync(MODULES_DIR)
    ? fs.readdirSync(MODULES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  for (const moduleName of modulePackages) {
    const srcDir = path.join(MODULES_DIR, moduleName, 'src');
    const files = walkSync(srcDir, ['.ts', '.tsx']);

    for (const filePath of files) {
      if (isTestFile(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const imports = extractModuleImports(content);

      for (const imp of imports) {
        const importedModule = getModuleName(imp);
        if (importedModule !== moduleName) {
          violations.push({
            file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
            module: moduleName,
            importedModule,
            import: imp,
          });
        }
      }
    }
  }
  return violations;
}

// ── Check 2: App files with many module imports ───────────────────────
function checkAppModuleConcentration() {
  const warnings = [];
  const THRESHOLD = 3;

  const appSrcFiles = walkSync(APPS_DIR, ['.ts', '.tsx']);

  for (const filePath of appSrcFiles) {
    if (isTestFile(filePath)) continue;
    const relPath = path.relative(ROOT, filePath);
    if (isCompositionFile(relPath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const imports = extractModuleImports(content);
    const uniqueModules = [...new Set(imports.map(getModuleName))];

    if (uniqueModules.length > THRESHOLD) {
      warnings.push({
        file: relPath.replace(/\\/g, '/'),
        moduleCount: uniqueModules.length,
        modules: uniqueModules,
      });
    }
  }
  return warnings;
}

// ── Check 3: Deep imports into module internals ───────────────────────
function checkDeepImports() {
  const violations = [];
  const allFiles = [
    ...walkSync(APPS_DIR, ['.ts', '.tsx']),
    ...walkSync(path.join(ROOT, 'packages', 'core', 'src'), ['.ts', '.tsx']),
  ];

  for (const filePath of allFiles) {
    if (isTestFile(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const imports = extractModuleImports(content);

    for (const imp of imports) {
      if (isDeepImport(imp)) {
        violations.push({
          file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
          import: imp,
        });
      }
    }
  }
  return violations;
}

// ── Inventory: Extract bus.subscribe calls from instrumentation.ts ────
function extractEventInventory() {
  const instrPath = path.join(ROOT, 'apps', 'web', 'src', 'instrumentation.ts');
  if (!fs.existsSync(instrPath)) return [];

  const content = fs.readFileSync(instrPath, 'utf8');
  const inventory = [];

  // Split into critical vs deferred sections
  const deferredStart = content.indexOf('async function registerDeferredConsumers');
  const criticalSection = deferredStart > -1 ? content.slice(0, deferredStart) : content;
  const deferredSection = deferredStart > -1 ? content.slice(deferredStart) : '';

  // Multi-line aware: match bus.subscribe('event', <anything>, 'consumer-name')
  // The handler arg can span many lines (inline lambdas), so we use [\s\S] non-greedy.
  const SUB_RE = /bus\.subscribe\(\s*'([^']+)'\s*,\s*[\s\S]*?'([^']+)'\s*\)/g;

  let match;
  while ((match = SUB_RE.exec(criticalSection)) !== null) {
    const eventName = match[1];
    const consumerName = match[2];
    const sourceDomain = eventName.split('.')[0];
    const consumerModule = consumerName.split('/')[0];
    inventory.push({ eventName, sourceDomain, consumerModule, consumerName, path: 'critical' });
  }
  SUB_RE.lastIndex = 0;

  while ((match = SUB_RE.exec(deferredSection)) !== null) {
    const eventName = match[1];
    const consumerName = match[2];
    const sourceDomain = eventName.split('.')[0];
    const consumerModule = consumerName.split('/')[0];
    inventory.push({ eventName, sourceDomain, consumerModule, consumerName, path: 'deferred' });
  }

  return inventory;
}

// ── Output ────────────────────────────────────────────────────────────
function printReport(m2m, concentration, deep) {
  console.log('\n=== Architecture Boundary Audit ===\n');

  // Module-to-module (VIOLATIONS — these fail locally)
  if (m2m.length > 0) {
    console.log(`❌ Module-to-Module Imports (${m2m.length} violations):`);
    for (const v of m2m) {
      console.log(`   ${v.file}`);
      console.log(`     ${v.module} → ${v.importedModule} (${v.import})`);
    }
  } else {
    console.log('✓ No module-to-module imports');
  }
  console.log();

  // Deep imports (WARNINGS — informational, don't fail)
  if (deep.length > 0) {
    console.log(`⚠ Deep Module Imports (${deep.length} warnings):`);
    for (const v of deep) {
      console.log(`   ${v.file}`);
      console.log(`     ${v.import}`);
    }
  } else {
    console.log('✓ No deep module imports');
  }
  console.log();

  // Concentration (WARNINGS — informational, don't fail)
  if (concentration.length > 0) {
    console.log(`⚠ High Module Concentration (${concentration.length} warnings — files with >3 module imports):`);
    for (const w of concentration) {
      console.log(`   ${w.file} (${w.moduleCount} modules: ${w.modules.join(', ')})`);
    }
  } else {
    console.log('✓ No non-composition files with >3 module imports');
  }
  console.log();

  const totalWarnings = deep.length + concentration.length;
  console.log(`Summary: ${m2m.length} violations, ${totalWarnings} warnings`);
  console.log(`  Violations fail local runs. Warnings are informational.`);
}

function printInventory(inventory) {
  console.log('\n=== Event Consumer Inventory ===\n');
  console.log('| Event | Source | Consumer | Consumer Name | Path |');
  console.log('|---|---|---|---|---|');
  for (const row of inventory) {
    console.log(`| ${row.eventName} | ${row.sourceDomain} | ${row.consumerModule} | ${row.consumerName} | ${row.path} |`);
  }
  console.log(`\nTotal: ${inventory.length} consumer registrations`);
}

// ── Main ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isJson = args.includes('--json');
const isCi = args.includes('--ci');
const isStrict = args.includes('--strict');
const showInventory = args.includes('--inventory');

if (showInventory) {
  const inventory = extractEventInventory();
  if (isJson) {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    printInventory(inventory);
  }
  process.exit(0);
}

const m2m = checkModuleToModule();
const concentration = checkAppModuleConcentration();
const deep = checkDeepImports();

if (isJson) {
  console.log(JSON.stringify({
    moduleToModule: m2m,
    highConcentration: concentration,
    deepImports: deep,
    summary: {
      violations: m2m.length,
      warnings: deep.length + concentration.length,
    },
  }, null, 2));
} else {
  printReport(m2m, concentration, deep);
}

if (isStrict && (m2m.length + deep.length + concentration.length) > 0) {
  process.exit(1);
} else if (isCi) {
  // CI warning mode — always pass, just report
  process.exit(0);
} else {
  // Local — exit 1 only on hard violations (module-to-module)
  process.exit(m2m.length > 0 ? 1 : 0);
}
