## Context7 — Mandatory Documentation Lookup

When generating, modifying, or debugging code that touches ANY of the following
libraries, you MUST use the Context7 MCP tools (`resolve-library-id` → `get-library-docs`)
BEFORE writing code. Do not rely on training data for these — their APIs change frequently.

### Always look up:
- **Next.js 15** (App Router, server actions, middleware, caching, `next/headers`, `next/navigation`)
- **React 19** (`use`, server components, actions, transitions, ref as prop)
- **Tailwind CSS v4** (CSS-first config, new utilities, NO `tailwind.config.js`)
- **Drizzle ORM** (schema, queries, migrations, relations, `drizzle-kit`)
- **Supabase Auth** (SSR helpers, `@supabase/ssr`, JWT verification, RLS policies)
- **postgres.js** (connection, transactions, tagged template queries)
- **Zod** (schemas, transforms, refinements, `z.infer`)
- **Vitest** (config, mocking, coverage, workspace mode)
- **Turborepo** (pipeline config, caching, task dependencies)
- **lucide-react** (icon names, tree-shaking imports)

### Lookup workflow:
1. Call `resolve-library-id` with the library name
2. Call `get-library-docs` with the resolved ID and your specific question
3. Use the returned docs as the source of truth for API signatures, patterns, and config
4. If docs conflict with your training data, ALWAYS trust the Context7 docs

### Do NOT look up (stable enough):
- TypeScript language features
- Node.js core APIs
- pnpm CLI commands
- Postgres SQL syntax
- General JavaScript/CSS
