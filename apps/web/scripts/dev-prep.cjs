// dev-prep.cjs — Pre-flight checks before starting the dev server.
//
// 1. Detects and auto-cleans corrupted .next cache (missing manifests = all API routes 500)
// 2. Removes stale .next/trace locks (Windows EPERM after crashes)
// 3. Ensures required directories exist
//
// Windows + Next.js Turbopack can leave .next in a corrupt state after crashes:
// the directory exists but manifest files are missing, causing every API route
// to return 500. This is hard to diagnose because the server starts normally
// and pages compile fine — only API calls fail silently.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const nextDir = path.join(__dirname, '..', '.next');
const traceFile = path.join(nextDir, 'trace');

// Step 1: Detect corrupted .next cache
// If .next/server exists but critical manifest files are missing, the cache is
// corrupted. Every API route will 500 with ENOENT on manifest lookups.
// Auto-delete .next to force a clean rebuild.
if (fs.existsSync(path.join(nextDir, 'server'))) {
  const criticalFiles = [
    'server/middleware-manifest.json',
    'server/middleware-build-manifest.js',
  ];

  const missing = criticalFiles.filter(
    (f) => !fs.existsSync(path.join(nextDir, f))
  );

  if (missing.length > 0) {
    console.warn(
      '\x1b[33m⚠ Corrupted .next cache detected (missing: ' +
        missing.join(', ') +
        ')\x1b[0m'
    );
    console.warn('\x1b[33m  Auto-cleaning .next to prevent API 500 errors...\x1b[0m');
    try {
      fs.rmSync(nextDir, { recursive: true, force: true });
      console.log('\x1b[32m✓ Corrupted .next removed — clean rebuild will follow.\x1b[0m');
    } catch {
      // If we can't delete (file locks), try PowerShell as fallback
      try {
        execSync(
          `powershell.exe -NoProfile -Command "Remove-Item -Path '${nextDir.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue"`,
          { stdio: 'inherit', timeout: 10000 }
        );
        console.log('\x1b[32m✓ Corrupted .next removed via PowerShell.\x1b[0m');
      } catch {
        console.error(
          '\x1b[31m✗ Cannot clean corrupted .next — run pnpm dev:fix instead.\x1b[0m'
        );
      }
    }
  }
}

// Step 2: Remove the trace file (the usual lock culprit on Windows)
if (fs.existsSync(traceFile)) {
  try {
    fs.rmSync(traceFile, { force: true });
  } catch {
    // fs.rmSync fails on Windows when the file is locked by another process.
    // Fall back to cmd.exe `del /F` which can sometimes bypass the lock.
    try {
      execSync(`cmd.exe /c "del /F /Q "${traceFile.replace(/\//g, '\\')}""`);
    } catch {
      console.warn(
        '\x1b[33m⚠ Could not remove .next/trace (file locked).\x1b[0m\n' +
        '  Run \x1b[1mpnpm dev:kill\x1b[0m first, then retry.'
      );
    }
  }
}

// Step 3: Ensure .next/static/development exists (prevents Turbopack startup error)
fs.mkdirSync(path.join(nextDir, 'static', 'development'), { recursive: true });

console.log('\x1b[32m✓ dev-prep done\x1b[0m');
