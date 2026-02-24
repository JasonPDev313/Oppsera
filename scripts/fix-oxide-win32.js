/**
 * fix-oxide-win32.js
 *
 * pnpm sometimes fails to create the package.json for the
 * @tailwindcss/oxide-win32-x64-msvc native binding package on Windows.
 * Without it, Node.js can't resolve the package and Tailwind v4 falls back
 * to a broken WASM scanner that returns 0 CSS utility classes.
 *
 * This script runs as a postinstall hook and creates the missing package.json
 * if the .node binary exists but package.json doesn't.
 */
const fs = require('fs');
const path = require('path');

if (process.platform !== 'win32') process.exit(0);

const bindings = [
  {
    pkg: '@tailwindcss/oxide-win32-x64-msvc',
    binary: 'tailwindcss-oxide.win32-x64-msvc.node',
    os: 'win32',
    cpu: 'x64',
  },
  {
    pkg: '@tailwindcss/oxide-win32-arm64-msvc',
    binary: 'tailwindcss-oxide.win32-arm64-msvc.node',
    os: 'win32',
    cpu: 'arm64',
  },
];

for (const b of bindings) {
  const dir = path.join(__dirname, '..', 'node_modules', ...b.pkg.split('/'));
  const binaryPath = path.join(dir, b.binary);
  const pkgPath = path.join(dir, 'package.json');

  if (!fs.existsSync(binaryPath)) continue;
  if (fs.existsSync(pkgPath)) continue;

  // Read the version from the parent @tailwindcss/oxide package
  let version = '0.0.0';
  try {
    const oxidePkg = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', 'node_modules', '@tailwindcss', 'oxide', 'package.json'),
        'utf8'
      )
    );
    version = oxidePkg.version;
  } catch {}

  const pkg = {
    name: b.pkg,
    version,
    os: [b.os],
    cpu: [b.cpu],
    main: b.binary,
    files: [b.binary],
    license: 'MIT',
  };

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log(`[fix-oxide-win32] Created missing ${b.pkg}/package.json (v${version})`);
}
