#!/usr/bin/env bash
# Usage:
#   ./scripts/switch-env.sh local   → point to local Supabase (127.0.0.1)
#   ./scripts/switch-env.sh remote  → point to remote Supabase (cloud)
#
# After switching, restart the dev server: pnpm dev

set -e

TARGET="${1:-}"

if [[ "$TARGET" == "local" ]]; then
  if [[ ! -f ".env.local.local" ]]; then
    echo "ERROR: .env.local.local not found. Run 'supabase start' first."
    exit 1
  fi
  cp .env.local.local .env.local
  echo "✓ Switched to LOCAL Supabase (127.0.0.1:54321)"
  echo "  DB:      postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  echo "  Studio:  http://127.0.0.1:54323"
  echo "  Inbucket: http://127.0.0.1:54324 (local email)"
  echo ""
  echo "  Restart dev server: pnpm dev"

elif [[ "$TARGET" == "remote" ]]; then
  if [[ ! -f ".env.local.remote" ]]; then
    echo "ERROR: .env.local.remote not found."
    exit 1
  fi
  cp .env.local.remote .env.local
  echo "✓ Switched to REMOTE Supabase (cloud)"
  echo ""
  echo "  Restart dev server: pnpm dev"

else
  echo "Usage: $0 [local|remote]"
  echo ""
  echo "  local   → use local Supabase (requires: supabase start)"
  echo "  remote  → use remote Supabase cloud"
  exit 1
fi
