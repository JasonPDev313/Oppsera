// dev-prep.js — Cleans stale .next/trace locks before starting dev server.
// Windows + Next.js Turbopack can leave .next/trace file-locked after crashes,
// preventing subsequent dev/build commands (EPERM). This script removes it
// safely before starting, and ensures the .next/static/development dir exists.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const nextDir = path.join(__dirname, '..', '.next');
const traceFile = path.join(nextDir, 'trace');

// Step 1: Remove the trace file (the usual lock culprit)
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

// Step 2: Ensure .next/static/development exists (prevents Turbopack startup error)
fs.mkdirSync(path.join(nextDir, 'static', 'development'), { recursive: true });

console.log('\x1b[32m✓ dev-prep done\x1b[0m');
