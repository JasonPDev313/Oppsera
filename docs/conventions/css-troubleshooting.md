# CSS Troubleshooting (Windows) — On-Demand

> Read this file when CSS is broken or the page renders unstyled.
> Referenced from CLAUDE.md — do NOT duplicate this content back into CLAUDE.md.

If the page renders unstyled (raw text, no layout), Tailwind utility classes aren't being generated. This is a recurring Windows-specific issue with Tailwind v4's native binary + Turbopack cache corruption.

## Quick fix (90% of cases)

```bash
taskkill /F /IM node.exe          # Kill all Node (Windows file locks prevent .next deletion)
rm -rf apps/web/.next             # Delete corrupted Turbopack cache
pnpm dev                          # Restart dev server
# Then Ctrl+Shift+R in browser    # Hard refresh to bypass browser cache
```

## Verify CSS is healthy

```bash
# After dev server starts, check the CSS file size (should be ~185KB, NOT ~12KB)
curl -s http://localhost:3000/dashboard | grep -oP 'href="(/[^"]*\.css[^"]*)"'
# Then fetch that URL and check size:
curl -s http://localhost:3000/<css-url> | wc -c
```

## If CSS is still broken after clean restart

```bash
# 1. Verify Tailwind oxide native binary loads (should print "Scanner")
node -e "console.log(Object.keys(require('@tailwindcss/oxide')))"

# 2. If oxide fails, reinstall
pnpm install

# 3. Verify @source directive exists in globals.css (REQUIRED for monorepo)
head -2 apps/web/src/app/globals.css
# Must show: @import 'tailwindcss';
#            @source "../../";

# 4. Nuclear option — full cache wipe
rm -rf apps/web/.next node_modules/.cache
pnpm dev
```

## Root causes

- `.next/trace` EPERM file locks (Windows antivirus / lingering Node processes)
- Tailwind v4 oxide WASM fallback (returns 0 scan results on Windows)
- Missing `@source "../../"` directive (monorepo files not scanned)
- Turbopack caching stale empty CSS from a previous broken session
