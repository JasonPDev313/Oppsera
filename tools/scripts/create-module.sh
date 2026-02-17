#!/bin/bash
# Usage: ./create-module.sh my-module "My Module"
# Creates the standard OppsEra module directory structure

set -e

MODULE_NAME=$1
DISPLAY_NAME=$2

if [ -z "$MODULE_NAME" ] || [ -z "$DISPLAY_NAME" ]; then
  echo "Usage: ./create-module.sh <module-name> \"<Display Name>\""
  echo "Example: ./create-module.sh pos-restaurant \"Restaurant POS\""
  exit 1
fi

BASE_DIR="packages/modules/${MODULE_NAME}"

if [ -d "$BASE_DIR" ]; then
  echo "Error: Module '${MODULE_NAME}' already exists at ${BASE_DIR}"
  exit 1
fi

echo "Creating module '${MODULE_NAME}' (${DISPLAY_NAME})..."

mkdir -p "${BASE_DIR}/src/commands"
mkdir -p "${BASE_DIR}/src/queries"
mkdir -p "${BASE_DIR}/src/events"

# Convert kebab-case to snake_case for MODULE_KEY
MODULE_KEY=$(echo "$MODULE_NAME" | tr '-' '_')

cat > "${BASE_DIR}/package.json" << EOF
{
  "name": "@oppsera/module-${MODULE_NAME}",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint src/",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
EOF

cat > "${BASE_DIR}/tsconfig.json" << EOF
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
EOF

cat > "${BASE_DIR}/src/index.ts" << EOF
export const MODULE_KEY = '${MODULE_KEY}' as const;
export const MODULE_NAME = '${DISPLAY_NAME}';
export const MODULE_VERSION = '0.0.0';
EOF

cat > "${BASE_DIR}/src/schema.ts" << EOF
// TODO: Implement ${DISPLAY_NAME} schema
EOF

cat > "${BASE_DIR}/src/commands/index.ts" << EOF
// TODO: Implement ${DISPLAY_NAME} commands
EOF

cat > "${BASE_DIR}/src/queries/index.ts" << EOF
// TODO: Implement ${DISPLAY_NAME} queries
EOF

cat > "${BASE_DIR}/src/events/index.ts" << EOF
// TODO: Implement ${DISPLAY_NAME} events
EOF

cat > "${BASE_DIR}/src/routes.ts" << EOF
// TODO: Implement ${DISPLAY_NAME} routes
EOF

echo "Module '${MODULE_NAME}' created at ${BASE_DIR}"
echo ""
echo "Structure:"
echo "  ${BASE_DIR}/"
echo "  ├── package.json"
echo "  ├── tsconfig.json"
echo "  └── src/"
echo "      ├── index.ts"
echo "      ├── schema.ts"
echo "      ├── routes.ts"
echo "      ├── commands/"
echo "      │   └── index.ts"
echo "      ├── queries/"
echo "      │   └── index.ts"
echo "      └── events/"
echo "          └── index.ts"
