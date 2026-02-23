/**
 * Add `writeAccess: true` to POST/PUT/PATCH/DELETE withMiddleware options
 * that have `entitlement` but are missing `writeAccess: true`.
 *
 * Usage: node tools/scripts/fix-write-access.js [--dry-run]
 */
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const API_DIR = path.join(__dirname, '..', '..', 'apps', 'web', 'src', 'app', 'api');

function findRouteFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(fullPath));
    } else if (entry.name === 'route.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

function findMatchingClose(content, openIdx) {
  // openIdx points to an opening paren '('
  // Returns index of matching closing paren ')'
  let depth = 0;
  let inStr = false;
  let strCh = '';
  for (let i = openIdx; i < content.length; i++) {
    const ch = content[i];

    if (!inStr) {
      if (ch === "'" || ch === '"' || ch === '`') {
        inStr = true;
        strCh = ch;
        continue;
      }
      if (ch === '/' && content[i + 1] === '/') {
        i = content.indexOf('\n', i);
        if (i === -1) return -1;
        continue;
      }
      if (ch === '/' && content[i + 1] === '*') {
        i = content.indexOf('*/', i + 2);
        if (i === -1) return -1;
        i++; // skip past the /
        continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) return i;
      }
    } else {
      if (ch === '\\') { i++; continue; }
      if (ch === strCh) inStr = false;
    }
  }
  return -1;
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;
  const changes = [];

  for (const method of WRITE_METHODS) {
    // Find each write method export
    const re = new RegExp(`export\\s+const\\s+${method}\\s*=\\s*withMiddleware\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(content)) !== null) {
      // Find the opening paren of withMiddleware(
      const parenIdx = content.lastIndexOf('(', m.index + m[0].length);
      const closeIdx = findMatchingClose(content, parenIdx);
      if (closeIdx === -1) continue;

      // Extract the full withMiddleware(...) content
      const fullCall = content.substring(parenIdx, closeIdx + 1);

      // Find the options object - it's the last { ... } before the closing paren
      // Search backwards from closeIdx for the closing } of options
      let optCloseIdx = -1;
      for (let i = closeIdx - 1; i > parenIdx; i--) {
        const c = content[i];
        if (c === '}') { optCloseIdx = i; break; }
        if (c !== ' ' && c !== '\n' && c !== '\r' && c !== '\t' && c !== ',') break;
      }
      if (optCloseIdx === -1) continue;

      // Find the matching opening {
      let braceDepth = 0;
      let optOpenIdx = -1;
      for (let i = optCloseIdx; i > parenIdx; i--) {
        if (content[i] === '}') braceDepth++;
        else if (content[i] === '{') {
          braceDepth--;
          if (braceDepth === 0) { optOpenIdx = i; break; }
        }
      }
      if (optOpenIdx === -1) continue;

      const optionsStr = content.substring(optOpenIdx, optCloseIdx + 1);

      // Must have entitlement and must NOT already have writeAccess: true
      if (!optionsStr.includes('entitlement')) continue;
      if (/writeAccess\s*:\s*true/.test(optionsStr)) continue;

      // Insert writeAccess: true before the closing }
      const isMultiLine = optionsStr.includes('\n');
      let insertion;

      if (isMultiLine) {
        // Find the indentation of the closing brace
        let lineStart = optCloseIdx;
        while (lineStart > 0 && content[lineStart - 1] !== '\n') lineStart--;
        const closingIndent = content.substring(lineStart, optCloseIdx).replace(/[^\s]/g, '');

        // Check if there's a trailing comma on the last property
        const inner = content.substring(optOpenIdx + 1, optCloseIdx).trimEnd();
        const hasComma = inner.endsWith(',');

        insertion = (hasComma ? '' : ',') + `\n${closingIndent}  writeAccess: true,`;
        content = content.substring(0, optCloseIdx) + insertion + '\n' + closingIndent + content.substring(optCloseIdx);
      } else {
        // Single line: { entitlement: 'xxx', permission: 'yyy' }
        // Check for trailing space before }
        const inner = content.substring(optOpenIdx + 1, optCloseIdx).trimEnd();
        const hasComma = inner.endsWith(',');
        insertion = (hasComma ? ' ' : ', ') + 'writeAccess: true ';
        content = content.substring(0, optCloseIdx) + insertion + content.substring(optCloseIdx);
      }

      changes.push(method);
      // Reset regex since content has changed
      re.lastIndex = 0;
    }
  }

  if (changes.length > 0 && !DRY_RUN) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return { modified: changes.length > 0, changes };
}

// Main
const routeFiles = findRouteFiles(API_DIR);
console.log(`Found ${routeFiles.length} route files`);

let totalModified = 0;
let totalChanges = 0;

for (const file of routeFiles) {
  try {
    const { modified, changes } = processFile(file);
    if (modified) {
      const relPath = path.relative(path.join(__dirname, '..', '..'), file);
      console.log(`  ${DRY_RUN ? '[DRY RUN] ' : ''}${relPath} (${changes.join(', ')})`);
      totalModified++;
      totalChanges += changes.length;
    }
  } catch (err) {
    console.error(`  ERROR: ${path.relative(path.join(__dirname, '..', '..'), file)}: ${err.message}`);
  }
}

console.log(`\n${DRY_RUN ? '[DRY RUN] Would modify' : 'Modified'} ${totalModified} files, ${totalChanges} route handlers updated`);
