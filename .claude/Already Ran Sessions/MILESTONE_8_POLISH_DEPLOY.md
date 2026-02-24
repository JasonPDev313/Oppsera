# Milestone 8: Polish + Deploy — Sessions 19–21

> **Harden the platform. Ship it to staging. Make it production-ready.**

---

# SESSION 19: Admin Console

## Context

The platform is feature-complete for V1. Now build the internal tools for platform operators to manage tenants, troubleshoot issues, and monitor system health.

Update PROJECT_BRIEF.md state to reflect Milestones 0–7 complete, then paste below.

---

## Part 1: Platform Admin Guard

Create middleware that restricts admin routes to users with `is_platform_admin = true`:

```typescript
export function requirePlatformAdmin() {
  return async (ctx: RequestContext): Promise<void> => {
    if (!ctx.isPlatformAdmin) {
      throw new AuthorizationError('Platform admin access required');
    }
  };
}
```

Update `withMiddleware` to support:
```typescript
export const GET = withMiddleware(handler, { platformAdmin: true });
```

## Part 2: Tenant Management API

Create `apps/web/app/api/v1/admin/tenants/` routes:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/admin/tenants` | List all tenants with stats |
| GET | `/api/v1/admin/tenants/[id]` | Tenant detail with locations, users, entitlements |
| PATCH | `/api/v1/admin/tenants/[id]` | Update tenant (name, status) |
| POST | `/api/v1/admin/tenants/[id]/suspend` | Suspend a tenant |
| POST | `/api/v1/admin/tenants/[id]/reactivate` | Reactivate a suspended tenant |
| POST | `/api/v1/admin/tenants/[id]/entitlements` | Update tenant entitlements (enable/disable modules) |

**GET /api/v1/admin/tenants** response:
```json
{
  "data": {
    "tenants": [
      {
        "id": "...",
        "name": "Sunset Golf & Grill",
        "slug": "sunset-golf",
        "status": "active",
        "plan": "growth",
        "locationCount": 2,
        "userCount": 5,
        "createdAt": "..."
      }
    ]
  }
}
```

**Suspend/Reactivate:**
- Suspend: set tenant.status = 'suspended', audit log, optionally email tenant owner
- Reactivate: set tenant.status = 'active', audit log

**Entitlement management:**
- Enable/disable modules for a tenant
- Update limits (max_seats, max_locations)
- Invalidate entitlement cache after changes

## Part 3: User Impersonation

Allow platform admins to "view as" a specific tenant for debugging:

Create `POST /api/v1/admin/impersonate`:
```typescript
impersonateSchema: {
  tenantId: string,
  reason: string (min 10 chars — require a justification)
}
```

1. Verify caller is platform admin
2. Write an audit log entry: `admin.impersonation.started`
3. Return a short-lived JWT (15 minutes) that has the admin's user ID but the target tenant's context
4. The frontend stores this as a temporary "impersonation token"
5. All API calls during impersonation use this token
6. A banner appears at the top of the dashboard: "Viewing as {tenant name} — Exit Impersonation"

**Stop impersonation:**
- Click "Exit Impersonation" → clear the impersonation token, revert to admin's own context
- Audit log: `admin.impersonation.ended`

## Part 4: System Health Dashboard

Create `apps/web/app/admin/page.tsx`:

Replace the placeholder with a real admin dashboard:

**Overview cards:**
- Total Tenants (active / suspended / churned)
- Total Locations
- Total Users
- Events processed today

**Event System Health** (from `/api/v1/admin/events/stats`):
- Outbox: unpublished count, oldest unpublished age
- Dead Letter: count (red if > 0)
- Published last 24h

**Recent Audit Activity** (from `/api/v1/admin/audit-log?limit=20`):
- Last 20 audit entries across all tenants

**Tenant List:**
- Searchable table of all tenants with status, plan, user/location counts
- Quick actions: view detail, suspend, reactivate

## Part 5: Tests

1. Platform admin can access admin routes
2. Non-admin user gets 403 on admin routes
3. Suspend tenant → status changes, audit logged
4. Reactivate tenant → status changes, audit logged
5. Impersonate: creates scoped token, audit logged
6. Impersonate: non-admin rejected
7. Entitlement update: module enabled/disabled, cache invalidated
8. Admin tenant list: returns all tenants with correct counts

## Verification Checklist — Session 19

- [ ] Platform admin guard works
- [ ] Tenant CRUD: list, detail, suspend, reactivate
- [ ] Entitlement management for tenants
- [ ] Impersonation with audit trail
- [ ] Admin dashboard with system health metrics
- [ ] All 8 tests pass

---

# SESSION 20: Security Hardening

## Context

The app works. Now harden it for production. This session adds security headers, rate limiting, input sanitization, and dependency auditing.

---

## Part 1: HTTP Security Headers

Create `apps/web/middleware.ts` (Next.js middleware):

```typescript
import { NextResponse } from 'next/server';

export function middleware(request) {
  const response = NextResponse.next();
  
  // Content Security Policy
  response.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // tighten in production
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co",
    "frame-ancestors 'none'",
  ].join('; '));
  
  // Other security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '0'); // Deprecated but some scanners check
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

## Part 2: CORS Configuration

Add CORS handling in `next.config.js` or middleware:
- Allow only the app's own origin in production
- Allow localhost:3000 in development
- No wildcard origins in production

## Part 3: Rate Limiting

Create `packages/core/rate-limit/`:

```typescript
interface RateLimiter {
  check(key: string, limit: number, windowSeconds: number): Promise<{
    allowed: boolean;
    remaining: number;
    retryAfter?: number;
  }>;
}
```

Implement using Redis sliding window:
```typescript
// Redis-based sliding window rate limiter
async function check(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);
  
  // Use sorted set: add current request, remove expired, count
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, `${now}:${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, windowSeconds);
  
  const results = await pipeline.exec();
  const count = results[2][1] as number;
  
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfter: count > limit ? windowSeconds : undefined,
  };
}
```

Apply rate limits:
- **Authentication endpoints** (`/api/v1/auth/*`): 10 requests per minute per IP
- **API endpoints**: 100 requests per minute per tenant
- **Admin endpoints**: 30 requests per minute per user
- **Webhook endpoints**: 500 requests per minute (Stripe sends bursts)

Return `429 Too Many Requests` with `Retry-After` header when exceeded.

**Per-tenant fairness:**
Create a tenant-level rate limiter that prevents whale tenants from degrading performance for others:
- Default: 1000 API requests per minute per tenant
- Configurable per tenant via tenant_settings

## Part 4: Request ID Tracking

Ensure every request has a unique ID for debugging:
1. Check for `X-Request-Id` header (from load balancer)
2. If missing, generate one (ULID)
3. Set `ctx.requestId` (already done in Milestone 1)
4. Include `X-Request-Id` in every response header
5. Include requestId in all log entries and error responses

## Part 5: Input Sanitization

- All string inputs: already validated by Zod schemas (max lengths, patterns)
- HTML stripping: for any free-text fields (names, descriptions, notes), strip HTML tags before storage
- SQL injection: prevented by parameterized queries (Drizzle handles this)
- Add a utility: `sanitizeString(input: string): string` that removes HTML tags and trims

## Part 6: CSRF Protection

For the web frontend (cookie-based auth):
- Use `SameSite=Lax` on auth cookies
- Verify `Origin` header on mutation requests (POST, PUT, PATCH, DELETE)
- API calls from the frontend use `Authorization: Bearer` header (inherently CSRF-safe)

## Part 7: Error Response Safety

Ensure production error responses never leak:
- Stack traces
- Internal file paths
- Database connection strings
- SQL queries
- Full error objects with internal details

Update the `withMiddleware` error handler:
```typescript
if (process.env.NODE_ENV === 'production') {
  // Log the full error server-side
  console.error('Unhandled error:', error);
  // Return sanitized error to client
  return NextResponse.json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
  }, { status: 500 });
} else {
  // In development, include more detail
  return NextResponse.json({
    error: { code: 'INTERNAL_ERROR', message: error.message, stack: error.stack }
  }, { status: 500 });
}
```

## Part 8: Dependency Audit

Add to CI pipeline:
```bash
pnpm audit --audit-level=high
```

Review and update any packages with known vulnerabilities.

## Part 9: Tests

1. Security headers present on all responses
2. Rate limiter: blocks after limit exceeded
3. Rate limiter: returns correct Retry-After
4. Rate limiter: different tenants have independent limits
5. Request ID: present in response headers
6. Input sanitization: HTML stripped from string inputs
7. Error responses: no stack traces in production mode
8. CORS: rejects cross-origin requests from unauthorized origins

## Verification Checklist — Session 20

- [ ] Security headers on all responses (CSP, HSTS, X-Frame-Options, etc.)
- [ ] CORS configured correctly
- [ ] Rate limiting: per-IP for auth, per-tenant for API
- [ ] Request ID in every response
- [ ] Input sanitization utility
- [ ] Error responses sanitized in production
- [ ] All 8 tests pass

---

# SESSION 21: CI/CD + Staging Deploy

## Context

The app is hardened. Now set up the deployment pipeline so we can ship to staging and eventually production.

---

## Part 1: Health Check Endpoints

Update `apps/web/app/api/v1/health/route.ts` with two endpoints:

**GET /api/v1/health/live** — Liveness probe (is the process running?)
```json
{ "status": "ok" }
```

**GET /api/v1/health/ready** — Readiness probe (can we serve traffic?)
```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "eventBus": "ok"
  }
}
```

Readiness checks:
- Database: `SELECT 1` succeeds
- Redis: `PING` returns `PONG`
- Event bus: outbox worker is running

If any check fails: return 503 with the failing check.

## Part 2: Dockerfile

Create a multi-stage Dockerfile:

```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/modules/*/package.json ./packages/modules/
RUN corepack enable && pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm turbo build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

Update `next.config.js`:
```javascript
output: 'standalone',
```

Add `.dockerignore`:
```
node_modules
.next
.turbo
.git
coverage
*.md
```

## Part 3: GitHub Actions — CI Pipeline

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint
      - run: pnpm turbo type-check

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo test -- --run
        env:
          CI: true

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: oppsera
          POSTGRES_PASSWORD: oppsera_dev
          POSTGRES_DB: oppsera_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo db:migrate
        env:
          DATABASE_URL: postgresql://oppsera:oppsera_dev@localhost:5432/oppsera_test
      - run: pnpm turbo db:seed
        env:
          DATABASE_URL: postgresql://oppsera:oppsera_dev@localhost:5432/oppsera_test
      - run: pnpm turbo test:integration -- --run
        env:
          DATABASE_URL: postgresql://oppsera:oppsera_dev@localhost:5432/oppsera_test
          REDIS_URL: redis://localhost:6379

  security-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level=high
        continue-on-error: true  # Don't block, but report

  build:
    needs: [lint-and-type-check, unit-tests, integration-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
```

## Part 4: Deploy Pipeline

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      # Build Docker image
      - run: docker build -t oppsera-web:${{ github.sha }} .
      # Push to container registry (ECR, GCR, or Docker Hub)
      # Deploy to staging (your hosting platform)
      # Run database migrations against staging DB
      # Run smoke tests

  smoke-tests:
    needs: deploy-staging
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -f https://staging.oppsera.com/api/v1/health/live || exit 1
          curl -f https://staging.oppsera.com/api/v1/health/ready || exit 1

  deploy-production:
    needs: smoke-tests
    runs-on: ubuntu-latest
    environment:
      name: production
      # Manual approval required
    steps:
      # Same as staging but against production
```

## Part 5: Environment Configuration

Create environment-specific config:

```typescript
// packages/shared/config.ts
export const config = {
  isProduction: process.env.NODE_ENV === 'production',
  isStaging: process.env.DEPLOY_ENV === 'staging',
  isDevelopment: process.env.NODE_ENV === 'development',
  
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL!,
    name: 'OppsEra',
  },
  
  database: {
    url: process.env.DATABASE_URL!,
    adminUrl: process.env.DATABASE_URL_ADMIN,
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
  },
  
  redis: {
    url: process.env.REDIS_URL!,
  },
  
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    jwtSecret: process.env.SUPABASE_JWT_SECRET!,
  },
  
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  },
};
```

## Part 6: Structured Logging

Update logging throughout the app:

```typescript
// packages/shared/logger.ts
export function createLogger(module: string) {
  return {
    info: (message: string, data?: Record<string, unknown>) =>
      console.log(JSON.stringify({ level: 'info', module, message, ...data, timestamp: new Date().toISOString() })),
    warn: (message: string, data?: Record<string, unknown>) =>
      console.warn(JSON.stringify({ level: 'warn', module, message, ...data, timestamp: new Date().toISOString() })),
    error: (message: string, error?: Error, data?: Record<string, unknown>) =>
      console.error(JSON.stringify({
        level: 'error', module, message,
        error: error ? { message: error.message, stack: config.isDevelopment ? error.stack : undefined } : undefined,
        ...data, timestamp: new Date().toISOString(),
      })),
    debug: (message: string, data?: Record<string, unknown>) => {
      if (!config.isProduction) {
        console.debug(JSON.stringify({ level: 'debug', module, message, ...data, timestamp: new Date().toISOString() }));
      }
    },
  };
}
```

Replace `console.log` calls in core modules with the structured logger. Include:
- Request ID in all log entries
- Tenant ID where applicable
- Redact sensitive fields (passwords, tokens, API keys)

## Part 7: Migration Script

Create `tools/scripts/migrate.sh`:
```bash
#!/bin/bash
# Run database migrations for deployment
set -e

echo "Running migrations..."
cd packages/db
pnpm tsx migrate.ts

echo "Creating audit log partitions..."
pnpm tsx scripts/create-partitions.ts 6

echo "Migrations complete"
```

## Part 8: Tests

1. Liveness endpoint returns 200
2. Readiness endpoint checks all dependencies
3. Readiness endpoint returns 503 when DB is down
4. Docker build succeeds
5. Structured log output is valid JSON
6. CI pipeline config is valid YAML
7. Environment config throws on missing required vars
8. Migration script runs idempotently

## Verification Checklist — Session 21

- [ ] Health check endpoints: /live and /ready
- [ ] Dockerfile: multi-stage build, <200MB image
- [ ] CI pipeline: lint, type-check, unit tests, integration tests, security audit, build
- [ ] Deploy pipeline: staging → smoke tests → manual approval → production
- [ ] Structured JSON logging throughout
- [ ] Migration script for deployments
- [ ] Environment configuration centralized
- [ ] All 8 tests pass

---

## What "Done" Looks Like After Milestone 8

OppsEra V1 is production-ready:

1. **A new customer** can visit the site, sign up, create their business, pick modules, and start using the POS
2. **A cashier** can ring up sales, apply discounts, take cash payments, and see change due
3. **A manager** can manage the product catalog, receive inventory, adjust stock, transfer between locations
4. **Customer profiles** track visit and spend history
5. **Real-time reporting** shows daily sales, item performance, and inventory levels
6. **Stripe billing** charges customers monthly, handles payment failures gracefully
7. **Platform admins** can manage tenants, impersonate for support, and monitor system health
8. **Security** is hardened: rate limiting, CORS, CSP, input sanitization, no data leakage
9. **CI/CD** runs lint, type-check, tests, and deploys to staging automatically
10. **Multi-tenancy** is rock-solid: RLS on every table, tenant isolation verified by tests, whale protection via rate limiting
11. **Events** flow reliably through the transactional outbox, powering cross-module integrations
12. **Every change** is audit-logged with who, what, when, and the diff

**Final PROJECT_BRIEF.md** state:
```
## Current Project State

V1 is complete and deployed to staging:
- Platform: auth, RBAC, entitlements, events, audit, billing
- Modules: catalog, orders/POS, payments (cash), inventory, customers, reporting
- Admin: tenant management, impersonation, system health
- Security: headers, rate limiting, CORS, input sanitization
- CI/CD: GitHub Actions → staging → smoke tests → production
- All tests passing, all milestones complete

Next: V2 — Restaurant POS + KDS, Golf Pack, Marketing Automation
```

Build it now. Don't explain — just write the code.
