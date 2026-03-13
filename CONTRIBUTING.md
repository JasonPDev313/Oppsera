# Contributing to OppsEra

Thank you for your interest in contributing to OppsEra! This guide explains how to get started.

## Prerequisites

- Node.js 20+
- pnpm 9 (`corepack enable && corepack prepare pnpm@latest --activate`)
- PostgreSQL 16
- Git

## Getting Started

```bash
# Clone the repository
git clone https://github.com/JasonPDev313/Oppsera.git
cd Oppsera

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your database and Supabase credentials

# Run database migrations
pnpm db:migrate

# Seed development data
pnpm db:seed

# Start the development server
pnpm dev
```

## Making Changes

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code standards below.

3. **Run checks** before submitting:
   ```bash
   pnpm type-check    # TypeScript validation
   pnpm lint          # ESLint
   pnpm test          # Vitest test suite
   pnpm build         # Full build
   ```

4. **Submit a pull request** against `main`. Fill out the PR template, including the architecture checklist and test plan.

## Code Standards

- **Language:** TypeScript with strict mode enabled
- **Formatting:** Prettier (runs automatically)
- **Linting:** ESLint with jsx-a11y accessibility rules
- **Styling:** Tailwind CSS v4, dark mode is the default — never use `bg-white`, `text-gray-900`, or `dark:` prefixes
- **Validation:** Zod for all runtime validation and type inference
- **ORM:** Drizzle (not Prisma)
- **API format:** REST, JSON, camelCase keys

## Project Structure

```
apps/web/              — Next.js frontend + API routes
apps/admin/            — Platform admin panel
packages/shared/       — Types, Zod schemas, utilities
packages/core/         — Auth, RBAC, events, audit
packages/db/           — Drizzle schema and migrations
packages/modules/*     — Domain modules (23 modules)
```

## Key Rules

- **Module isolation:** Modules may only depend on `shared`, `db`, and `core` — never on another module. Use events for cross-module communication.
- **Money:** Catalog/GL = dollars (string). Orders/payments = cents (integer). Convert carefully.
- **Drizzle numeric returns strings** — always convert with `Number()`.
- **Always `await` database operations** — fire-and-forget causes connection pool exhaustion on Vercel.
- **postgres.js returns RowList** — use `Array.from(result as Iterable<T>)`, not `.rows`.

## Reporting Issues

- **General bugs:** Open a [GitHub Issue](https://github.com/JasonPDev313/Oppsera/issues)
- **Security vulnerabilities:** Email security@oppsera.com (see [SECURITY.md](SECURITY.md))

## License

By contributing, you agree that your contributions will be licensed under the project's [Business Source License 1.1](LICENSE).
