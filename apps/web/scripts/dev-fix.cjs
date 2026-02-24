// dev-fix.cjs — Nuclear reset for Windows dev server issues.
// Kills ALL Node processes via PowerShell (bash taskkill can't kill its own parent),
// waits for release, deletes .next, then restarts with Turbopack.
//
// Usage: pnpm dev:fix  (from apps/web)
//    or: pnpm --filter @oppsera/web dev:fix  (from monorepo root)

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const nextDir = path.join(__dirname, '..', '.next');

console.log('\x1b[33m[dev:fix] Step 1/4 — Killing all Node processes via PowerShell...\x1b[0m');
try {
  execSync(
    'powershell.exe -NoProfile -Command "Stop-Process -Name node -Force -ErrorAction SilentlyContinue"',
    { stdio: 'inherit', timeout: 10000 }
  );
} catch {
  // Expected — kills itself too, or no processes found
}

// We may still be alive if PowerShell couldn't kill this process.
// Give OS time to release file handles.
console.log('\x1b[33m[dev:fix] Step 2/4 — Waiting 3s for file handles to release...\x1b[0m');
execSync('powershell.exe -NoProfile -Command "Start-Sleep 3"', { stdio: 'inherit', timeout: 10000 });

console.log('\x1b[33m[dev:fix] Step 3/4 — Removing .next directory...\x1b[0m');
let cleaned = false;
// Try Node fs first
try {
  fs.rmSync(nextDir, { recursive: true, force: true });
  cleaned = true;
} catch {
  // Fall back to PowerShell force-remove
  try {
    execSync(
      `powershell.exe -NoProfile -Command "Remove-Item -Path '${nextDir.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue"`,
      { stdio: 'inherit', timeout: 10000 }
    );
    cleaned = true;
  } catch {
    // Last resort — rename to unblock
    const renamed = nextDir + '-old-' + Date.now();
    try {
      fs.renameSync(nextDir, renamed);
      console.log(`\x1b[33m[dev:fix] Could not delete .next, renamed to ${path.basename(renamed)}\x1b[0m`);
      cleaned = true;
    } catch {
      console.error('\x1b[31m[dev:fix] ERROR: Cannot remove or rename .next directory.\x1b[0m');
      console.error('\x1b[31m         Close VSCode and any other programs, then retry.\x1b[0m');
      process.exit(1);
    }
  }
}

if (cleaned && !fs.existsSync(nextDir)) {
  console.log('\x1b[32m[dev:fix] .next removed successfully.\x1b[0m');
} else if (cleaned) {
  console.log('\x1b[32m[dev:fix] .next handled.\x1b[0m');
}

console.log('\x1b[33m[dev:fix] Step 4/4 — Starting dev server with Turbopack...\x1b[0m\n');

function startDev(useTurbopack) {
  const args = ['next', 'dev', '--port', '3000'];
  if (useTurbopack) args.splice(1, 0, '--turbopack');

  const child = spawn('npx', args, {
    cwd: path.join(__dirname, '..'),
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });

  let stderr = '';
  child.stdout.pipe(process.stdout);
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(chunk);
  });

  child.on('exit', (code) => {
    // If Turbopack crashed with EPERM on .next/trace, auto-retry with webpack
    if (useTurbopack && code !== 0 && stderr.includes('EPERM') && stderr.includes('.next\\trace')) {
      console.log('\n\x1b[33m[dev:fix] Turbopack hit EPERM on .next/trace — retrying with webpack...\x1b[0m\n');
      // Clean .next again before webpack attempt
      try { fs.rmSync(nextDir, { recursive: true, force: true }); } catch {}
      startDev(false);
      return;
    }
    process.exit(code ?? 1);
  });
}

startDev(true);
