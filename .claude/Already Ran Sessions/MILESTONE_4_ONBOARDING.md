# Milestone 4: Tenant Onboarding — Session 11

> **Self-service signup: a new customer goes from zero to a working dashboard in under 2 minutes.**

---

## How to Use This Prompt

Update your `PROJECT_BRIEF.md` → "Current Project State" section to:

```
## Current Project State

Milestones 0–3 are complete:
- Monorepo scaffolded: apps/web, packages/core, packages/shared, packages/db, packages/modules
- 13 core platform tables + 7 catalog tables, all with RLS
- Auth: SupabaseAuthAdapter, authenticate/resolveTenant middleware, login/signup pages
- RBAC: PermissionEngine with Redis cache, wildcard + location-scoped permissions
- Entitlements: EntitlementCheck engine, requireEntitlement middleware, module registry
- withMiddleware: authenticate → resolveTenant → resolveLocation → requireEntitlement → requirePermission → handler
- Event bus: InMemoryEventBus, transactional outbox, OutboxWorker, consumer idempotency
- Audit logging: partitioned audit_log, auditLog() helper, computeChanges(), AuditLogViewer
- Catalog module: 7 tables, 9 commands, 5 queries, 16 API routes, internal read API
- Catalog frontend: items CRUD, categories, tax categories, modifier groups
- 10 reusable UI components (DataTable, SearchInput, CurrencyInput, Toast, etc.)
- Seed data: "Sunset Golf & Grill" tenant, 2 locations, 10 items, 4 tax categories

Next: Milestone 4 — Self-service tenant onboarding
```

Then paste everything below.

---

## Your Task: Build the Self-Service Signup Flow

Build the complete tenant onboarding flow. After this session, a new customer can:
1. Visit the marketing landing page
2. Click "Get Started"
3. Create their account (email + password)
4. Name their company
5. Create their first location
6. Choose which modules they want
7. Land on a working dashboard with their tenant fully provisioned

This is a CRITICAL user experience — it's the first impression. It must be fast, clean, and reliable.

### Architecture

The onboarding flow is a multi-step form on the frontend that culminates in a single
transactional API call on the backend. We do NOT create the tenant during signup —
signup only creates the Supabase Auth identity + user record. The tenant, location,
membership, roles, and entitlements are all created in one atomic operation after the
user completes the onboarding wizard.

This means:
- `POST /api/v1/auth/signup` — already exists (creates auth identity + user row, NO tenant)
- `POST /api/v1/onboard` — NEW (creates tenant + location + membership + roles + entitlements in one transaction)

### Part 1: Onboarding API Endpoint

Create `apps/web/app/api/v1/onboard/route.ts`:

**POST /api/v1/onboard**

This is an authenticated endpoint (user must have signed up and logged in first), but
it does NOT require a tenant context (the user has no tenant yet). Use a special middleware
mode:

```typescript
// This route requires authentication but NOT tenant resolution
// (because the user doesn't have a tenant yet)
export const POST = withMiddleware(onboardHandler, {
  authenticated: true,  // requires valid JWT
  requireTenant: false, // skip resolveTenant (user has no membership yet)
});
```

You may need to adjust `withMiddleware` to support this mode. The key difference:
- `authenticate` runs (validates JWT, looks up user by auth_provider_id)
- `resolveTenant` does NOT run (user has no membership)
- The handler receives a partial RequestContext with `user` but no `tenantId`

**Request body:**
```typescript
const onboardSchema = z.object({
  // Company info
  companyName: z.string().min(1).max(200).transform(v => v.trim()),
  
  // First location
  location: z.object({
    name: z.string().min(1).max(200).transform(v => v.trim()),
    timezone: z.string().default('America/New_York'),
    addressLine1: z.string().max(500).optional(),
    city: z.string().max(200).optional(),
    state: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    country: z.string().max(2).default('US'),
  }),

  // Module selection
  modules: z.array(z.string()).min(1), // at least one module key, e.g. ['catalog', 'pos_retail', 'inventory']
});
```

**Handler logic (ALL in a single DB transaction):**

```typescript
async function onboardHandler(request: NextRequest, ctx: PartialRequestContext) {
  const body = onboardSchema.parse(await request.json());

  // 1. Verify user doesn't already have a membership (prevent double-onboard)
  const existingMembership = await db.query.memberships.findFirst({
    where: eq(memberships.userId, ctx.user.id),
  });
  if (existingMembership) {
    throw new ConflictError('You already belong to an organization');
  }

  // 2. Generate a URL-safe slug from the company name
  const slug = generateSlug(body.companyName);
  
  // 3. Verify slug is unique
  const existingTenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
  });
  if (existingTenant) {
    // Append a random suffix to make it unique
    slug = slug + '-' + generateUlid().slice(-4).toLowerCase();
  }

  // 4. Create everything in one transaction (using admin connection — no RLS context yet)
  const result = await db.transaction(async (tx) => {
    // 4a. Create tenant
    const [tenant] = await tx.insert(tenants).values({
      name: body.companyName,
      slug,
      status: 'active',
    }).returning();

    // 4b. Create first location
    const [location] = await tx.insert(locations).values({
      tenantId: tenant.id,
      name: body.location.name,
      timezone: body.location.timezone,
      addressLine1: body.location.addressLine1,
      city: body.location.city,
      state: body.location.state,
      postalCode: body.location.postalCode,
      country: body.location.country,
      isActive: true,
    }).returning();

    // 4c. Create membership (link user to tenant)
    const [membership] = await tx.insert(memberships).values({
      tenantId: tenant.id,
      userId: ctx.user.id,
      status: 'active',
    }).returning();

    // 4d. Create 5 system roles (same as seed data pattern)
    const systemRoles = [
      {
        name: 'owner',
        description: 'Full access to everything',
        permissions: ['*'],
      },
      {
        name: 'admin',
        description: 'Full access except billing and danger zone',
        permissions: ['catalog.*', 'orders.*', 'inventory.*', 'customers.*', 'reports.*', 'settings.*', 'users.*'],
      },
      {
        name: 'manager',
        description: 'Operational management',
        permissions: ['catalog.*', 'orders.*', 'inventory.*', 'customers.*', 'reports.view', 'settings.view'],
      },
      {
        name: 'cashier',
        description: 'Point of sale operations',
        permissions: ['orders.create', 'orders.view', 'tenders.create', 'tenders.view', 'customers.view', 'customers.create', 'catalog.view'],
      },
      {
        name: 'viewer',
        description: 'Read-only access',
        permissions: ['catalog.view', 'orders.view', 'inventory.view', 'customers.view', 'reports.view'],
      },
    ];

    for (const roleDef of systemRoles) {
      const [role] = await tx.insert(roles).values({
        tenantId: tenant.id,
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true,
      }).returning();

      // Insert permissions
      for (const perm of roleDef.permissions) {
        await tx.insert(rolePermissions).values({
          roleId: role.id,
          permission: perm,
        });
      }

      // Assign 'owner' role to the onboarding user
      if (roleDef.name === 'owner') {
        await tx.insert(roleAssignments).values({
          tenantId: tenant.id,
          userId: ctx.user.id,
          roleId: role.id,
          locationId: null, // tenant-wide
        });
      }
    }

    // 4e. Create entitlements for selected modules
    // Always include platform_core
    const moduleKeys = ['platform_core', ...body.modules.filter(m => m !== 'platform_core')];
    // Deduplicate
    const uniqueModules = [...new Set(moduleKeys)];

    for (const moduleKey of uniqueModules) {
      await tx.insert(entitlements).values({
        tenantId: tenant.id,
        moduleKey,
        planTier: 'standard',
        isEnabled: true,
        limits: { max_seats: 25, max_locations: 10, max_devices: 10 },
      });
    }

    return { tenant, location, membership };
  });

  // 5. Audit log (outside transaction — fire and forget)
  await auditLogSystem(result.tenant.id, 'tenant.onboarded', 'tenant', result.tenant.id, {
    companyName: body.companyName,
    locationName: body.location.name,
    modules: body.modules,
    userId: ctx.user.id,
  });

  // 6. Return the new tenant info
  return NextResponse.json({
    data: {
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
      },
      location: {
        id: result.location.id,
        name: result.location.name,
      },
    },
  }, { status: 201 });
}
```

### Part 2: Slug Generation

Create `packages/shared/utils/slug.ts`:
```typescript
/**
 * Generate a URL-safe slug from a string.
 * "Sunset Golf & Grill" → "sunset-golf-grill"
 * "Bob's Burgers" → "bobs-burgers"
 */
export function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[']/g, '')           // Remove apostrophes
    .replace(/[^a-z0-9]+/g, '-')   // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')       // Trim leading/trailing hyphens
    .slice(0, 60);                  // Max length
}
```

Export from `@oppsera/shared`.

### Part 3: Update withMiddleware for Pre-Tenant Auth

The current `withMiddleware` always resolves a tenant. For the onboard endpoint, we need
a mode where the user is authenticated but has no tenant yet.

Add a new option:
```typescript
interface MiddlewareOptions {
  public?: boolean;
  authenticated?: boolean;    // NEW: requires JWT but not tenant context
  requireTenant?: boolean;    // NEW: default true; set false for pre-tenant endpoints
  entitlement?: string;
  permission?: string;
}
```

When `requireTenant: false`:
- `authenticate` runs (validates JWT, looks up user by auth_provider_id)
- `resolveTenant` is SKIPPED
- The context has `user` populated but `tenantId` is empty string
- No RLS session variable is set
- No entitlement or permission checks run

This mode is ONLY for:
- `POST /api/v1/onboard`
- `GET /api/v1/me` when the user has no membership yet (return user info without tenant)

### Part 4: Frontend Onboarding Wizard

Create `apps/web/app/(auth)/onboard/page.tsx`:

A multi-step wizard with these steps:

**Step 1: Company Info**
- "What's your business called?" — large, friendly heading
- Company name input (required)
- "This will be your organization name in OppsEra"
- Next button

**Step 2: First Location**
- "Where's your first location?"
- Location name input (required) — e.g., "Main Store", "Downtown Location"
- Timezone select (dropdown with common US timezones, default America/New_York)
- Address fields (all optional): street, city, state, zip, country
- Next button, Back button

**Step 3: Choose Your Apps**
- "What do you need?" — grid of module cards
- Fetch available modules from `GET /api/v1/entitlements/modules` (the public endpoint)
- Show only V1 modules (phase: 'v1')
- Each card: module name, description, checkbox
- Pre-select: catalog, pos_retail, payments (the "starter" set)
- V2 modules shown grayed out with "Coming Soon" badge
- "Start Building" button (CTA), Back button

**Step 4: Processing**
- Show a loading animation while the `POST /api/v1/onboard` request is in flight
- On success: brief "You're all set!" message with confetti or checkmark animation (1.5 seconds)
- Then redirect to the dashboard

**Design:**
- Clean, centered layout (max-w-xl)
- Progress indicator (step dots or bar) at the top
- Smooth transitions between steps
- Company name carries forward in the UI ("Setting up {companyName}...")
- Mobile-responsive

**Error handling:**
- If the onboard API fails: show the error message inline, allow retry
- If the user already has a tenant (409 Conflict): show "You already have an account" with a link to the dashboard

### Part 5: Auth Flow Update

Update the auth flow to handle the "user exists but has no tenant" state:

**After Login:**
Currently, after login, the app redirects to `/` (dashboard). But if the user has no
membership (they signed up but didn't complete onboarding), the dashboard will fail
because `resolveTenant` returns null.

Update the post-login flow:
1. After successful login, call `GET /api/v1/me`
2. If the response includes a tenant → redirect to dashboard (normal flow)
3. If the response indicates no tenant (user has no membership) → redirect to `/onboard`

Update `GET /api/v1/me` to handle users without memberships:
- If user has no active membership: return 200 with `tenant: null` instead of throwing 401
- This allows the frontend to distinguish "not authenticated" (401) from "authenticated but no tenant" (200 with tenant: null)

This means updating the auth adapter's `validateToken`:
- Currently returns null if no membership → causes 401
- Change: return the user even without a membership, but with `tenantId: null`
- The `resolveTenant` step handles the "no tenant" case separately

**OR** create a simpler approach:
- Add a `GET /api/v1/auth/status` endpoint that returns:
```json
{
  "data": {
    "authenticated": true,
    "hasOrganization": false,
    "user": { "id": "...", "email": "...", "name": "..." }
  }
}
```
- The frontend calls this after login to determine where to route
- This avoids changing the existing validateToken logic

Choose whichever approach is cleaner. The key UX requirement: after login, a user without
a tenant lands on the onboard wizard, not an error page.

### Part 6: Login Page Updates

Update the login page:
- After successful `POST /api/v1/auth/login`, store tokens
- Call the status/me endpoint to check if user has a tenant
- If has tenant: redirect to `/`
- If no tenant: redirect to `/onboard`

Update the signup page:
- After successful `POST /api/v1/auth/signup`:
  - If Supabase requires email confirmation: show "Check your email to confirm your account"
  - If email is auto-confirmed (dev mode): auto-login and redirect to `/onboard`

### Part 7: Dashboard Guard Update

Update `app/(dashboard)/layout.tsx`:
- Current: redirects to /login if not authenticated
- Add: if authenticated but no tenant → redirect to /onboard
- This prevents a user from manually navigating to /catalog before completing onboarding

### Part 8: Tests

**Test 1: POST /api/v1/onboard — happy path**
- Sign up a new user, log in, call onboard with valid data
- Verify: tenant created with correct name and slug
- Verify: location created with correct details
- Verify: membership created linking user to tenant
- Verify: 5 system roles created with correct permissions
- Verify: owner role assigned to the onboarding user
- Verify: entitlements created for selected modules + platform_core
- Verify: response includes tenant and location IDs

**Test 2: POST /api/v1/onboard — duplicate prevention**
- Complete onboarding, then call onboard again
- Verify: 409 Conflict error

**Test 3: POST /api/v1/onboard — slug uniqueness**
- Onboard with "Test Company", then sign up a new user and onboard with "Test Company"
- Verify: second tenant gets a different slug (e.g., "test-company-ab12")

**Test 4: POST /api/v1/onboard — validation errors**
- Missing company name → 400
- Empty modules array → 400
- Invalid module key → still works (just creates entitlement for it — future-proof)

**Test 5: POST /api/v1/onboard — unauthenticated**
- Call without auth token → 401

**Test 6: Slug generation**
- "Sunset Golf & Grill" → "sunset-golf-grill"
- "Bob's Burgers" → "bobs-burgers"
- "   Spaces   " → "spaces"
- "ALLCAPS" → "allcaps"

**Test 7: After onboard, GET /api/v1/me works**
- Complete onboarding
- Call GET /api/v1/me with the same auth token
- Verify: returns the new tenant, location, and user info

**Test 8: After onboard, authenticated routes work**
- Complete onboarding
- Call GET /api/v1/catalog/items → 200 (empty list, but no auth errors)
- This proves the full middleware chain works for the newly onboarded tenant

**Test 9: Transaction atomicity**
- Mock a failure during role creation (e.g., throw after tenant + location are created)
- Verify: nothing was persisted (tenant, location, membership all rolled back)

**Test 10: Audit log entry**
- Complete onboarding
- Query audit_log → entry exists with action='tenant.onboarded'

### Verification Checklist

- [ ] `POST /api/v1/onboard` creates tenant + location + membership + roles + entitlements atomically
- [ ] `withMiddleware` supports `requireTenant: false` mode for pre-tenant endpoints
- [ ] Slug generation works correctly, handles duplicates
- [ ] Double-onboard returns 409
- [ ] Frontend wizard: 3 steps + processing, clean design, mobile-responsive
- [ ] Module selection fetches from /api/v1/entitlements/modules, pre-selects starter set
- [ ] After login: user with tenant → dashboard, user without tenant → /onboard
- [ ] After signup: redirects to onboard (or email confirmation)
- [ ] Dashboard layout guards against no-tenant state
- [ ] Audit log records the onboarding event
- [ ] All 10 tests pass
- [ ] `pnpm turbo build` — clean
- [ ] `pnpm turbo test` — all tests pass

**Update your PROJECT_BRIEF.md** state after completing this milestone:

```
## Current Project State

Milestones 0–4 are complete:
- [everything from before]
- Tenant onboarding: self-service wizard (company → location → modules → done)
- POST /api/v1/onboard creates everything atomically in one transaction
- Slug generation with uniqueness handling
- Auth flow routes users to /onboard if they have no tenant
- Dashboard guards against no-tenant state

Next: Milestone 5 — Orders + POS
```

Build it now. Don't explain — just write the code.
