# OppsEra ERP Security Audit

## Executive Summary
- **Audit date**: 2026-02-18
- **Overall posture**: MODERATE — strong fundamentals (parameterized SQL, RLS, defense-in-depth tenant isolation), but missing several production hardening items (security headers, rate limiting, auth event audit logging)
- ~137 API routes audited (7 public, ~130 authenticated, ~9 platform admin)
- 35 tables with FORCE ROW LEVEL SECURITY
- 64 parameterized SQL queries (zero string-concatenated SQL found)

---

## Phase 1: Authentication Security

### Strengths
- JWT validation with proper algorithm specification (ES256 preferred, HS256 fallback) in `packages/core/src/auth/supabase-adapter.ts:44-46`
- DevAuthAdapter properly guarded by `NODE_ENV !== 'production'` AND `DEV_AUTH_BYPASS === 'true'` in `packages/core/src/auth/get-adapter.ts:9`
- Bearer token authentication (not cookies) eliminates CSRF attack vector
- Refresh token deduplication prevents thundering herd in `apps/web/src/lib/api-client.ts:24-46`
- Token auto-clear on final 401 failure in `apps/web/src/lib/api-client.ts:87-91`
- Email normalization (lowercase + trim) on all auth endpoints

### Issues

#### [CRITICAL] SEC-001: No Rate Limiting on Auth Endpoints
- **Files**: `apps/web/src/app/api/v1/auth/login/route.ts`, `signup/route.ts`, `magic-link/route.ts`
- **Risk**: Credential stuffing, brute force attacks on login, signup abuse
- **Details**: All 5 auth routes are `{ public: true }` with no rate limiting. An attacker can attempt unlimited login attempts.
- **Fix**: Add rate limiting middleware — see Phase 8 implementation

#### [HIGH] SEC-002: No Auth Event Audit Logging
- **Files**: All auth routes in `apps/web/src/app/api/v1/auth/`
- **Risk**: No forensic trail for login failures, signup, logout events
- **Details**: The audit logger (`packages/core/src/audit/audit-logger.ts`) exists but is never called from auth routes. Failed login attempts (credential stuffing signals) are completely invisible.
- **Fix**: Add audit log calls for: `auth.login.success`, `auth.login.failed`, `auth.signup.success`, `auth.logout`, `auth.refresh.failed`

#### [HIGH] SEC-003: Tokens Stored in localStorage
- **Files**: `apps/web/src/lib/api-client.ts:1-22`
- **Risk**: XSS attack can steal tokens. Any successful XSS allows full account takeover.
- **Details**: Standard SPA pattern with Supabase Auth. Mitigated by CSP (once added). httpOnly cookies are more secure but incompatible with current Bearer token architecture.
- **Accepted Risk**: This is the standard Supabase Auth pattern. Mitigate with strict CSP (SEC-005).

#### [MEDIUM] SEC-004: No Password Complexity Beyond Min Length
- **Files**: `apps/web/src/app/api/v1/auth/signup/route.ts:9` — `z.string().min(8).max(128)`
- **Risk**: Weak passwords susceptible to dictionary attacks
- **Details**: Only validates min 8, max 128 chars. No uppercase, number, or special char requirements. Supabase may enforce additional rules server-side.
- **Fix**: Add Zod refinement: require at least 1 uppercase, 1 number, 1 special char

#### [MEDIUM] SEC-005: No Email Verification on Signup
- **Files**: `packages/core/src/auth/supabase-adapter.ts:113-136`
- **Risk**: Fake email registrations, email enumeration
- **Details**: Supabase may handle email verification depending on project config, but the app doesn't check for it
- **Fix**: Enable Supabase email verification; check `email_confirmed_at` in token claims

#### [LOW] SEC-006: No Account Lockout After Failed Attempts
- **Risk**: Without rate limiting or lockout, brute force is unrestricted
- **Fix**: Implement after SEC-001 rate limiting; add temporary lockout after N failed attempts

---

## Phase 2: Authorization & Access Control

### Strengths
- Full middleware chain: `authenticate -> resolveTenant -> resolveLocation -> requireEntitlement -> requirePermission` in `packages/core/src/auth/with-middleware.ts`
- Wildcard permission matching with proper module-scoping in `packages/core/src/permissions/engine.ts:7-16`
- Owner role protection — cannot delete the owner role
- Location-scoped role assignments (can have different permissions per location)
- Entitlement system gates module access per tenant

### Issues

#### [HIGH] SEC-007: Permission Cache Allows 60s Stale Access
- **File**: `packages/core/src/permissions/engine.ts:5` — `const CACHE_TTL = 60`
- **Risk**: Revoked permissions remain active for up to 60 seconds
- **Details**: When a user is demoted or fired, they retain full access for up to 60s. For POS operations (void, price override), this is a real risk.
- **Fix**: Reduce TTL to 15s for security-critical permissions; add immediate cache invalidation on role change (already exists at line 78-81 but cache key pattern may not cover all variants)

#### [HIGH] SEC-008: `isPlatformAdmin` Hardcoded to false
- **File**: `packages/core/src/auth/middleware.ts:55` — `isPlatformAdmin: false`
- **Risk**: Platform admin endpoints are unreachable (DoS on admin features). When admin functionality is needed, this becomes a blocker.
- **Details**: Comment says "Will be looked up from users table in a future enhancement"
- **Fix**: Look up `users.isPlatformAdmin` from DB during `resolveTenant()`

#### [MEDIUM] SEC-009: Location Set Config Uses Session Scope
- **File**: `packages/core/src/auth/with-middleware.ts:49` — `set_config('app.current_location_id', ${locationId}, false)`
- **Risk**: Session-scoped variables can leak between requests when using connection pooling
- **Details**: The third parameter `false` means session-scoped (not transaction-scoped). In Vercel serverless with Supavisor pooling, this can leak location context between requests from different tenants.
- **Fix**: Change to `true` (transaction-scoped) and wrap in a transaction, OR use `withTenant()` pattern

#### [MEDIUM] SEC-010: setTenantContext Uses Session Scope
- **File**: `packages/db/src/client.ts:55` — `set_config('app.current_tenant_id', ${tenantId}, false)`
- **Risk**: Same connection pooling leak risk as SEC-009
- **Details**: Already marked as `@deprecated` with note to use `withTenant()` instead. But it's still called from `packages/core/src/auth/middleware.ts:48`
- **Fix**: Migrate all callers to `withTenant()` pattern; remove `setTenantContext()`

---

## Phase 3: Input Validation & Injection Prevention

### Strengths
- **Zero SQL injection vectors**: All 64 SQL queries use Drizzle `sql` template literals (auto-parameterized). No string concatenation found.
- **Comprehensive Zod validation**: All API routes validate input with Zod schemas — min/max constraints, email transforms, integer coercion
- **Type-safe ORM**: Drizzle provides compile-time type checking on all queries
- **Input sanitization**: Email normalization, name trimming on all auth endpoints

### Issues

#### [MEDIUM] SEC-011: Zod Schemas Don't Use `.strict()` Mode
- **Files**: All Zod schemas across modules (catalog, orders, payments, inventory, customers)
- **Risk**: Extra fields in request bodies pass through validation silently — could be stored in JSONB `metadata` columns
- **Details**: Zod's default `strip` mode removes unknown fields, which is usually fine. But `.strict()` would reject requests with unexpected fields, preventing potential payload stuffing.
- **Accepted Risk**: Zod strip mode is the default and is generally sufficient. Extra fields are stripped, not stored.

#### [MEDIUM] SEC-012: No Explicit Request Body Size Limits
- **Files**: All API routes
- **Risk**: Large payload DoS attacks
- **Details**: Next.js has a default 1MB body limit, but it's not explicitly configured. For ERP routes processing bulk data (order imports, customer imports), this should be explicitly set.
- **Fix**: Add `bodyParser: { sizeLimit: '1mb' }` to route segment config for standard routes; increase for bulk import routes

#### [LOW] SEC-013: Error Detail Leakage in Development
- **File**: `packages/core/src/auth/with-middleware.ts:104-106`
- **Details**: Properly sanitized in production (`"An unexpected error occurred"`), but dev mode exposes `error.message`. This is correct behavior for development.
- **Accepted**: Correct pattern. No fix needed.

---

## Phase 4: Data Protection & Privacy

### Strengths
- **3-layer tenant isolation**: (1) App-level filtering via `tenantId` in every query, (2) `withTenant()` + `SET LOCAL` in transactions, (3) RLS with FORCE ROW LEVEL SECURITY (35 tables across 6 migration files)
- **RLS policy pattern**: 4 policies per table (_select, _insert, _update, _delete) targeting `oppsera_app` role
- **Append-only financial tables**: `inventory_movements`, `audit_log`, `payment_journal_entries`, `ar_transactions`, `tenders` — never updated/deleted
- **Idempotency keys**: On all financial operations (orders, tenders, inventory movements)
- **Optimistic locking**: On mutable aggregates (orders) to prevent lost updates

### Issues

#### [HIGH] SEC-014: Connection Pool Size Mismatch for Vercel
- **File**: `packages/db/src/client.ts:19` — `{ max: 5 }`
- **Risk**: Connection pool exhaustion on Vercel serverless (many instances x 5 = too many connections)
- **Details**: CLAUDE.md says `max: 2` for Vercel, but code uses `max: 5`. With 100+ Vercel instances, that's 500+ connections vs Supabase's limits.
- **Fix**: Use deployment detection: `getDeploymentConfig().pool.max` (already exists in `packages/core/src/config/deployment.ts`)

#### [MEDIUM] SEC-015: `prepare: false` Not Set
- **File**: `packages/db/src/client.ts:19` — `postgres(connectionString, { max: 5 })`
- **Risk**: Prepared statements fail silently with Supavisor transaction mode
- **Details**: CLAUDE.md gotcha #44 says `prepare: false` is REQUIRED for Supavisor. Missing from client config.
- **Fix**: Add `prepare: false` to postgres options

#### [MEDIUM] SEC-016: No Data Encryption at Rest Beyond Default
- **Risk**: PII (customer names, emails, phone numbers, billing addresses) stored in plain text
- **Details**: Supabase encrypts storage at rest by default (AES-256). No column-level encryption.
- **Accepted Risk**: Default encryption is sufficient for V1. Column-level encryption adds complexity with minimal benefit when using managed DB.

---

## Phase 5: API Security

### Strengths
- Every authenticated route goes through `withMiddleware()` — no way to bypass
- Location validation includes both existence AND tenant ownership check AND active status
- Error responses use consistent structure with proper HTTP status codes
- Production error messages are sanitized (no stack traces)

### Issues

#### [CRITICAL] SEC-017: No Security Headers
- **File**: `apps/web/next.config.ts` — only has `poweredByHeader: false`
- **Risk**: XSS, clickjacking, MIME sniffing, and other browser-side attacks
- **Missing headers**:
  - `Content-Security-Policy` (CSP) — prevents XSS
  - `Strict-Transport-Security` (HSTS) — forces HTTPS
  - `X-Frame-Options` — prevents clickjacking
  - `X-Content-Type-Options` — prevents MIME sniffing
  - `Referrer-Policy` — controls referrer leakage
  - `Permissions-Policy` — restricts browser features
- **Fix**: Add headers array to next.config.ts — see Phase 8 implementation

#### [HIGH] SEC-018: No CORS Configuration
- **File**: `apps/web/next.config.ts`
- **Risk**: Cross-origin requests not explicitly controlled
- **Details**: Next.js API routes are same-origin by default, but explicit CORS headers should be set for defense-in-depth, especially for the API prefix `/api/v1/`
- **Fix**: Add CORS middleware or Next.js headers config restricting to same origin

#### [MEDIUM] SEC-019: No API Versioning Deprecation Strategy
- **Details**: All routes under `/api/v1/` — good practice. But no mechanism to deprecate v1 when v2 is needed.
- **Accepted Risk**: Premature to implement. Add when v2 is planned.

---

## Phase 6: Infrastructure Security

### Strengths
- Docker images use non-root users (`nextjs:1001`, `worker:1001`)
- Multi-stage builds minimize attack surface
- Healthcheck endpoint on production containers
- `NEXT_TELEMETRY_DISABLED=1` in Dockerfile

### Issues

#### [HIGH] SEC-020: DB Password in Migration File
- **File**: `packages/db/migrations/0000_initial_schema.sql` (or similar) — contains `oppsera_dev_password`
- **Risk**: Credential exposure if repo becomes public
- **Details**: This is a development-only password for local Docker Postgres. Not used in production.
- **Accepted Risk**: Dev-only credential. Add explicit comment. Ensure `.env.local` with production creds is in `.gitignore` (verified: it is).

#### [MEDIUM] SEC-021: No Network Segmentation in Docker Compose
- **Risk**: All containers on same network in Docker Compose
- **Details**: For VPS deployment, the web container shouldn't have direct access to the database admin port
- **Fix**: Add separate networks for frontend/backend/db in docker-compose.yml

#### [LOW] SEC-022: No Container Image Scanning
- **Risk**: Vulnerable base images
- **Fix**: Add `docker scan` or Trivy to CI/CD pipeline

---

## Phase 7: Audit Logging & Forensics

### Strengths
- `DrizzleAuditLogger` with comprehensive entry structure (actor, action, entity, changes diff, metadata)
- Audit log is append-only (partitioned by created_at)
- Retention policy exists (`packages/core/src/audit/retention.ts`)
- Diff helper for change tracking (`packages/core/src/audit/diff.ts`)
- All mutation commands call `auditLog()` after successful writes

### Issues

#### [HIGH] SEC-023: No Auth Event Audit Logging (Duplicate of SEC-002)
- Auth events (login, failed login, signup, logout, token refresh) are not logged
- These are the most important events for security monitoring

#### [MEDIUM] SEC-024: No Audit Log Tamper Detection
- **Risk**: If DB admin access is compromised, audit logs can be modified
- **Details**: No checksums, hash chains, or external log shipping
- **Fix (V2)**: Add log hash chain; ship logs to external SIEM

#### [LOW] SEC-025: Audit Log Query Has No Rate Limiting
- **File**: `packages/core/src/audit/audit-logger.ts:31-109`
- **Risk**: Expensive queries on large audit tables
- **Details**: Already limited to max 100 results per page. Low risk.

---

## Phase 8: Security Hardening Checklist

### Status Legend
- DONE — Already implemented
- FIX — Needs implementation (see priority)
- V2 — Deferred to V2
- N/A — Not applicable

### Authentication
| # | Item | Status | Priority | SEC ID |
|---|------|--------|----------|--------|
| 1 | JWT validation with algorithm specification | DONE | — | — |
| 2 | Bearer token auth (no CSRF needed) | DONE | — | — |
| 3 | Token refresh deduplication | DONE | — | — |
| 4 | Dev adapter guarded by NODE_ENV | DONE | — | — |
| 5 | Rate limiting on auth endpoints | FIX | CRITICAL | SEC-001 |
| 6 | Auth event audit logging | FIX | HIGH | SEC-002 |
| 7 | Password complexity requirements | FIX | MEDIUM | SEC-004 |
| 8 | Email verification | V2 | MEDIUM | SEC-005 |
| 9 | Account lockout | V2 | LOW | SEC-006 |

### Authorization
| # | Item | Status | Priority | SEC ID |
|---|------|--------|----------|--------|
| 10 | Full middleware chain (auth->tenant->location->entitlement->permission) | DONE | — | — |
| 11 | Wildcard permission matching | DONE | — | — |
| 12 | Location-scoped roles | DONE | — | — |
| 13 | Permission cache TTL reduction | FIX | HIGH | SEC-007 |
| 14 | `isPlatformAdmin` lookup | FIX | HIGH | SEC-008 |
| 15 | Location set_config scope fix | FIX | MEDIUM | SEC-009 |
| 16 | Remove deprecated `setTenantContext` | FIX | MEDIUM | SEC-010 |

### Input Validation
| # | Item | Status | Priority | SEC ID |
|---|------|--------|----------|--------|
| 17 | Parameterized SQL (zero injection vectors) | DONE | — | — |
| 18 | Zod validation on all inputs | DONE | — | — |
| 19 | Email normalization | DONE | — | — |
| 20 | Request body size limits | FIX | MEDIUM | SEC-012 |

### Data Protection
| # | Item | Status | Priority | SEC ID |
|---|------|--------|----------|--------|
| 21 | 3-layer tenant isolation (app + SET LOCAL + RLS) | DONE | — | — |
| 22 | 35 tables with FORCE ROW LEVEL SECURITY | DONE | — | — |
| 23 | Append-only financial tables | DONE | — | — |
| 24 | Idempotency keys on financial ops | DONE | — | — |
| 25 | Optimistic locking on aggregates | DONE | — | — |
| 26 | Connection pool size fix | FIX | HIGH | SEC-014 |
| 27 | `prepare: false` for Supavisor | FIX | MEDIUM | SEC-015 |

### API Security
| # | Item | Status | Priority | SEC ID |
|---|------|--------|----------|--------|
| 28 | Consistent middleware chain | DONE | — | — |
| 29 | Error sanitization in production | DONE | — | — |
| 30 | `poweredByHeader: false` | DONE | — | — |
| 31 | Security headers (CSP, HSTS, etc.) | FIX | CRITICAL | SEC-017 |
| 32 | CORS configuration | FIX | HIGH | SEC-018 |

### Infrastructure
| # | Item | Status | Priority | SEC ID |
|---|------|--------|----------|--------|
| 33 | Non-root Docker containers | DONE | — | — |
| 34 | Multi-stage Docker builds | DONE | — | — |
| 35 | Healthcheck endpoints | DONE | — | — |
| 36 | Network segmentation in Docker | FIX | MEDIUM | SEC-021 |
| 37 | Container image scanning | V2 | LOW | SEC-022 |

### Audit & Monitoring
| # | Item | Status | Priority | SEC ID |
|---|------|--------|----------|--------|
| 38 | Append-only audit log | DONE | — | — |
| 39 | Audit retention policy | DONE | — | — |
| 40 | Change diff tracking | DONE | — | — |
| 41 | Auth event logging | FIX | HIGH | SEC-023 |
| 42 | Audit tamper detection | V2 | MEDIUM | SEC-024 |

---

## Summary by Severity

| Severity | Count | Items |
|----------|-------|-------|
| CRITICAL | 2 | SEC-001 (rate limiting), SEC-017 (security headers) |
| HIGH | 7 | SEC-002/023 (auth audit), SEC-003 (localStorage — accepted), SEC-007 (cache TTL), SEC-008 (admin flag), SEC-014 (pool size), SEC-018 (CORS), SEC-020 (dev password — accepted) |
| MEDIUM | 7 | SEC-004, SEC-005, SEC-009, SEC-010, SEC-011, SEC-012, SEC-015 |
| LOW | 3 | SEC-006, SEC-022, SEC-025 |

**Immediately actionable**: SEC-001, SEC-017, SEC-002, SEC-007, SEC-014, SEC-015, SEC-018

**Total items checked**: 42 (24 DONE, 13 FIX, 3 V2, 2 Accepted)
