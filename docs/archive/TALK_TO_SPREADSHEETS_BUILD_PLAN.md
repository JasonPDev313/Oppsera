# Talk to Spreadsheets — Integration Build Plan
## OppsEra Module: `@oppsera/module-spreadsheets`

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Architecture Decisions](#2-architecture-decisions)
3. [What Gets Reused vs. What's New](#3-reuse-vs-new)
4. [Database Schema (All Tables)](#4-database-schema)
5. [API Route Map](#5-api-route-map)
6. [Session Dependency Map](#6-session-map)
7. [Session 1 — Module Scaffold + DB Schema + Migration](#session-1)
8. [Session 2 — Schema Engine: Auto-Detect from Upload](#session-2)
9. [Session 3 — Import Wizard UI + Record CRUD Backend](#session-3)
10. [Session 4 — Dynamic Record List + Detail UI](#session-4)
11. [Session 5 — Contacts, Notes, Tags & Quick-Add](#session-5)
12. [Session 6 — Search + Saved Views](#session-6)
13. [Session 7 — Chat Pipeline: Schema Builder + Intent + Query Compiler](#session-7)
14. [Session 8 — Chat Pipeline: Write Actions + Confirmation Gate](#session-8)
15. [Session 9 — Chat UI + Streaming + Eval Capture](#session-9)
16. [Session 10 — Google Sheets OAuth + Sync Engine](#session-10)
17. [Session 11 — Admin: Collection/Field Config + Audit + Polish](#session-11)
18. [Session 12 — Testing + Security + Performance](#session-12)
19. [Appendix A — Full File Manifest](#appendix-a)
20. [Appendix B — LLM Contract of Truth Prompt](#appendix-b)
21. [Appendix C — CLAUDE.md Additions](#appendix-c)

---

## 1. Module Overview {#1-module-overview}

"Talk to Spreadsheets" lets any OppsEra tenant upload CSV/Excel files or connect Google Sheets, auto-detect the schema, import the data, and then browse, search, edit, and **chat with their data in plain English** — all without developer involvement. The system builds the database structure from whatever the user uploads.

### Where It Lives

- **Sidebar**: Reports → Talk to Spreadsheets
- **Module key**: `spreadsheets`
- **Entitlement**: `spreadsheets` (tenant-level toggle)
- **Permission namespace**: `spreadsheets.*`
- **Package**: `packages/modules/spreadsheets/` → `@oppsera/module-spreadsheets`
- **Frontend pages**: `apps/web/src/app/(dashboard)/reports/spreadsheets/`
- **API routes**: `apps/web/src/app/api/v1/spreadsheets/`
- **Table prefix**: `ss_`

### Module Boundaries

This module follows OppsEra's module isolation rules:
- Imports: `@oppsera/shared`, `@oppsera/db`, `@oppsera/core` ONLY
- Never imports from `@oppsera/module-semantic` or any other module
- Reuses core infrastructure: `getLLMAdapter()`, `withMiddleware`, `withTenant`, `publishWithOutbox`, `auditLog`, `EventBus`, `getRequestContext`
- Has its own LLM pipeline (does NOT extend the semantic pipeline — parallel, not nested)

---

## 2. Architecture Decisions {#2-architecture-decisions}

| Decision | Choice | Rationale |
|----------|--------|-----------|
| IDs | ULID via `$defaultFn(generateUlid)` | Matches all OppsEra tables |
| Column types | `text` for IDs, `text` for enums | Matches OppsEra convention (no varchar) |
| Custom field storage | JSONB `custom_fields` on `ss_records` | Queryable, indexable with GIN, flexible |
| Tab/collection naming | Sheet name → title case → user can rename | A+B strategy (confirmed) |
| LLM provider | `getLLMAdapter().complete()` from `@oppsera/core` | Same Anthropic adapter already built |
| Chat route | `/api/v1/spreadsheets/chat` (separate from `/semantic/ask`) | Own pipeline, own prompt, own tools — no entanglement |
| Eval capture | Reuses `captureEvalTurnBestEffort()` pattern | Same quality tracking, same admin review |
| Streaming | SSE via `text/event-stream` (same pattern as semantic) | Progressive delivery for chat responses |
| Job queue | Postgres SKIP LOCKED (existing `jobs` table) | Google Sheets polling, bulk imports |
| Connection pool | Goes through `guardedQuery()` / `withTenant()` | Pool protection, concurrency limits, no fire-and-forget |
| Migration prefix | `ss_` on all tables | Namespace isolation |
| Tenant isolation | Application + ORM (`withTenant`) + RLS | Three-layer isolation per OppsEra convention |
| Entitlement | `spreadsheets` module key | Toggle per tenant, seat/location limits available |
| Dark mode | Follows inverted gray scale pattern | All new UI uses semantic tokens from globals.css |

---

## 3. What Gets Reused vs. What's New {#3-reuse-vs-new}

### Reused from OppsEra (zero new code)

| Infrastructure | How It's Used |
|----------------|--------------|
| `getLLMAdapter().complete()` | All LLM calls (intent resolution, narrative generation, SQL retry) |
| `withMiddleware(handler, opts)` | All API routes: `{ entitlement: 'spreadsheets', permission: 'spreadsheets.query' }` |
| `withTenant(tenantId, fn)` | All DB operations — sets `SET LOCAL app.current_tenant_id` |
| `publishWithOutbox(ctx, fn)` | All write commands (create collection, import records, update record) |
| `auditLog(ctx, action, entityType, entityId, changes?)` | Every mutation logged |
| `buildEventFromContext(ctx, type, data)` | Domain events: `spreadsheets.collection.created.v1`, etc. |
| `EventBus` + outbox worker | Event dispatch for sync triggers, import completions |
| `getRequestContext()` | Tenant/user context in pipeline |
| `apiFetch()` | Frontend API calls |
| `AppError` hierarchy | `ValidationError`, `NotFoundError`, `AuthorizationError` |
| Zod `safeParse()` | All input validation |
| `generateUlid` | All primary keys |
| SSE streaming pattern | Chat narrative streaming (same `text/event-stream` pattern) |
| Dark mode tokens | All UI uses existing design tokens |
| Code-split pattern | `page.tsx` thin wrapper → `*-content.tsx` heavy logic |

### New Code (this build plan)

| New | What It Does |
|-----|-------------|
| **Schema engine** (`src/schema/`) | Auto-detect field types, contact groups, subset sheets from uploaded headers + data |
| **DB tables** (7 tables, `ss_` prefix) | Collections, field definitions, contact roles, records, contacts, views, sync connections |
| **Schema dictionary builder** (`src/llm/schema-builder.ts`) | Builds LLM context JSON from tenant's `ss_field_definitions` at query time |
| **Spreadsheet intent resolver** (`src/llm/intent-resolver.ts`) | System prompt + tool definitions for dynamic collections (not ERP metrics) |
| **JSONB query compiler** (`src/llm/query-compiler.ts`) | Translates LLM tool calls into Drizzle queries with `custom_fields->>'slug'` |
| **Plan validator** (`src/llm/plan-validator.ts`) | Validates LLM tool calls against tenant's actual collections/fields/roles |
| **Write action tools + confirmation gate** (`src/llm/action-compiler.ts`, `src/llm/confirmation.ts`) | Create/update/delete records with preview + user approval |
| **Narrative builder** (`src/llm/narrative.ts`) | Formats query results into natural language responses |
| **FieldRenderer component** | Renders any field type (text, select, email, phone, url, boolean, date) in display or edit mode |
| **Import wizard UI** | Upload → sheet selection → schema review → column mapping → import |
| **Dynamic record table/detail/form** | Data-driven UI that renders whatever fields exist for a collection |
| **Contact role UI** | Multi-role contact cards per record |
| **Saved views** | Filter builder, view tabs (like David's BOYD/CAESARS tabs) |
| **Google Sheets sync** | OAuth connect, column mapping, bidirectional sync, conflict resolution |
| **Module setup** | Entitlement registration, RBAC permissions, event types |

---

## 4. Database Schema (All Tables) {#4-database-schema}

All tables use `ss_` prefix. All follow OppsEra conventions: ULID `text` IDs, `tenant_id` FK, `created_at`/`updated_at` timestamptz, snake_case columns.

### ss_collections

Defines what data sets a tenant has (e.g., "Customers", "Suppliers").

```typescript
export const ssCollections = pgTable('ss_collections', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),                          // "Customers"
  slug: text('slug').notNull(),                          // "customers"
  nameFieldLabel: text('name_field_label').notNull().default('Name'), // "Casino"
  icon: text('icon'),                                    // lucide icon name
  color: text('color'),                                  // hex color
  sortOrder: integer('sort_order').notNull().default(0),
  sourceFileName: text('source_file_name'),              // "Client_Folders_by_Color.xlsx"
  sourceSheetName: text('source_sheet_name'),            // "CLIENT FOLDERS"
  isArchived: boolean('is_archived').notNull().default(false),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ss_collections_tenant').on(table.tenantId),
  uniqueIndex('idx_ss_collections_slug').on(table.tenantId, table.slug),
]);
```

### ss_field_definitions

Defines what custom fields exist for each collection.

```typescript
export const ssFieldDefinitions = pgTable('ss_field_definitions', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  collectionId: text('collection_id').notNull().references(() => ssCollections.id),
  slug: text('slug').notNull(),                          // "gaming_corp"
  label: text('label').notNull(),                        // "Gaming Corp"
  type: text('type').notNull(),
    // text | number | select | multi_select | email | phone | url | date | boolean | textarea
  options: jsonb('options'),                             // ["BOYD", "CAESARS", ...]
  isRequired: boolean('is_required').notNull().default(false),
  showInTable: boolean('show_in_table').notNull().default(true),
  isSearchable: boolean('is_searchable').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  defaultValue: text('default_value'),
  helpText: text('help_text'),
  sourceColumn: text('source_column'),                   // Original header: "GAMING CORP"
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ss_field_defs_collection').on(table.collectionId),
  uniqueIndex('idx_ss_field_defs_slug').on(table.collectionId, table.slug),
]);
```

### ss_contact_roles

Defines what contact types exist per collection (Buyer, Property Contact, etc.).

```typescript
export const ssContactRoles = pgTable('ss_contact_roles', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  collectionId: text('collection_id').notNull().references(() => ssCollections.id),
  slug: text('slug').notNull(),                          // "buyer"
  label: text('label').notNull(),                        // "Buyer"
  fields: jsonb('fields').notNull(),                     // ["name", "phone", "mobile", "email"]
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ss_contact_roles_collection').on(table.collectionId),
  uniqueIndex('idx_ss_contact_roles_slug').on(table.collectionId, table.slug),
]);
```

### ss_records

The actual data rows. Thin core + JSONB `custom_fields`.

```typescript
export const ssRecords = pgTable('ss_records', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  collectionId: text('collection_id').notNull().references(() => ssCollections.id),
  name: text('name').notNull(),                          // Primary name field
  customFields: jsonb('custom_fields').notNull().default({}),
  notes: text('notes'),                                  // Core notes field
  searchText: text('search_text'),                       // Concatenated searchable text
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ss_records_tenant').on(table.tenantId),
  index('idx_ss_records_collection').on(table.tenantId, table.collectionId),
  index('idx_ss_records_name').on(table.tenantId, table.collectionId, table.name),
  index('idx_ss_records_custom_gin').using('gin', table.customFields),
]);
```

### ss_contacts

Contacts linked to records with a role.

```typescript
export const ssContacts = pgTable('ss_contacts', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  recordId: text('record_id').notNull().references(() => ssRecords.id),
  roleId: text('role_id').notNull().references(() => ssContactRoles.id),
  roleSlug: text('role_slug').notNull(),                 // Denormalized for queries
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  mobile: text('mobile'),
  title: text('title'),
  notes: text('notes'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ss_contacts_record').on(table.recordId),
  index('idx_ss_contacts_role').on(table.tenantId, table.roleSlug),
  index('idx_ss_contacts_name').on(table.tenantId, table.name),
  index('idx_ss_contacts_email').on(table.tenantId, table.email),
]);
```

### ss_views

Saved filter configurations (like David's BOYD/CAESARS/PINNACLE tabs).

```typescript
export const ssViews = pgTable('ss_views', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  collectionId: text('collection_id').notNull().references(() => ssCollections.id),
  name: text('name').notNull(),                          // "Boyd"
  filters: jsonb('filters').notNull(),                   // [{ field, op, value }]
  sort: jsonb('sort'),                                   // { field, direction }
  columns: jsonb('columns'),                             // field slugs to show
  isDefault: boolean('is_default').notNull().default(false),
  isShared: boolean('is_shared').notNull().default(false),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ss_views_collection').on(table.tenantId, table.collectionId),
]);
```

### ss_sync_connections

Google Sheets OAuth connections.

```typescript
export const ssSyncConnections = pgTable('ss_sync_connections', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  collectionId: text('collection_id').notNull().references(() => ssCollections.id),
  provider: text('provider').notNull().default('google_sheets'),
  accessToken: text('access_token'),                     // Encrypted at rest
  refreshToken: text('refresh_token'),                   // Encrypted at rest
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  sheetId: text('sheet_id'),                             // Google Sheets document ID
  sheetName: text('sheet_name'),                         // Tab name within the sheet
  columnMap: jsonb('column_map').notNull().default({}),  // { "A": "name", "B": "custom_fields.gaming_corp" }
  syncDirection: text('sync_direction').notNull().default('both'), // both | push | pull
  status: text('status').notNull().default('active'),    // active | paused | error
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncError: text('last_sync_error'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ss_sync_tenant').on(table.tenantId),
  index('idx_ss_sync_collection').on(table.collectionId),
]);
```

### ss_notes (polymorphic on records)

```typescript
export const ssNotes = pgTable('ss_notes', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  recordId: text('record_id').notNull().references(() => ssRecords.id),
  content: text('content').notNull(),
  source: text('source').notNull().default('ui'),        // ui | ai | sync | import
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ss_notes_record').on(table.recordId),
]);
```

### RLS Policies

```sql
-- Applied to all ss_* tables
ALTER TABLE ss_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_ss_collections ON ss_collections
  USING (tenant_id = current_setting('app.current_tenant_id', true));
-- Repeat for ss_field_definitions, ss_contact_roles, ss_records,
-- ss_contacts, ss_views, ss_sync_connections, ss_notes
```

---

## 5. API Route Map {#5-api-route-map}

All routes under `apps/web/src/app/api/v1/spreadsheets/`. All use `withMiddleware` with `entitlement: 'spreadsheets'`.

### Collections & Schema

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/collections` | `spreadsheets.view` | List tenant's collections |
| GET | `/collections/[id]` | `spreadsheets.view` | Collection with field definitions + contact roles |
| POST | `/collections` | `spreadsheets.manage` | Create collection (from schema review) |
| PATCH | `/collections/[id]` | `spreadsheets.manage` | Rename, reorder, archive |
| DELETE | `/collections/[id]` | `spreadsheets.manage` | Soft-archive collection |
| POST | `/collections/[id]/fields` | `spreadsheets.manage` | Add field definition |
| PATCH | `/fields/[id]` | `spreadsheets.manage` | Update field definition |
| DELETE | `/fields/[id]` | `spreadsheets.manage` | Remove field definition |
| POST | `/collections/[id]/contact-roles` | `spreadsheets.manage` | Add contact role |
| PATCH | `/contact-roles/[id]` | `spreadsheets.manage` | Update contact role |

### Records

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/records` | `spreadsheets.view` | List records (requires `?collectionId=`) |
| GET | `/records/[id]` | `spreadsheets.view` | Record detail + contacts |
| POST | `/records` | `spreadsheets.edit` | Create record |
| PATCH | `/records/[id]` | `spreadsheets.edit` | Update record (core + custom fields) |
| DELETE | `/records/[id]` | `spreadsheets.manage` | Soft delete |

### Contacts

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/records/[id]/contacts` | `spreadsheets.view` | Contacts for a record |
| POST | `/records/[id]/contacts` | `spreadsheets.edit` | Add contact |
| PATCH | `/contacts/[id]` | `spreadsheets.edit` | Update contact |
| DELETE | `/contacts/[id]` | `spreadsheets.manage` | Remove contact |
| GET | `/contacts` | `spreadsheets.view` | Search contacts (`?roleSlug=&q=`) |

### Notes

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/records/[id]/notes` | `spreadsheets.view` | Notes for a record |
| POST | `/records/[id]/notes` | `spreadsheets.edit` | Add note |

### Views

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/views` | `spreadsheets.view` | Views for a collection (`?collectionId=`) |
| POST | `/views` | `spreadsheets.edit` | Create view |
| PATCH | `/views/[id]` | `spreadsheets.edit` | Update view |
| DELETE | `/views/[id]` | `spreadsheets.edit` | Delete view |

### Import

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/import/detect` | `spreadsheets.manage` | Upload file → return detected schema |
| POST | `/import/execute` | `spreadsheets.manage` | Create collection + import data |
| POST | `/import/append` | `spreadsheets.edit` | Import into existing collection |

### Search

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/search` | `spreadsheets.view` | Full-text search (`?q=&collectionId=`) |

### Chat

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/chat` | `spreadsheets.query` | Send message, get response (JSON) |
| POST | `/chat/stream` | `spreadsheets.query` | Send message, get SSE stream |
| POST | `/chat/confirm` | `spreadsheets.edit` | Confirm a pending write action |
| GET | `/chat/sessions` | `spreadsheets.view` | List chat sessions |
| GET | `/chat/sessions/[id]` | `spreadsheets.view` | Get session with turns |
| DELETE | `/chat/sessions/[id]` | `spreadsheets.view` | Delete own session |

### Sync

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/sync/connect` | `spreadsheets.manage` | Initiate Google OAuth |
| GET | `/sync/callback` | (public, OAuth callback) | Handle OAuth redirect |
| GET | `/sync/connections` | `spreadsheets.manage` | List sync connections |
| POST | `/sync/connections/[id]/trigger` | `spreadsheets.manage` | Manual sync now |
| PATCH | `/sync/connections/[id]` | `spreadsheets.manage` | Update mapping/direction |
| DELETE | `/sync/connections/[id]` | `spreadsheets.manage` | Disconnect |

---

## 6. Session Dependency Map {#6-session-map}

```
S1 (scaffold + schema) → S2 (detect engine) → S3 (import wizard + CRUD backend)
                                                    ↓
                                               S4 (record UI)
                                                    ↓
                                               S5 (contacts + notes + tags)
                                                    ↓
                                          ┌────S6 (search + views)
                                          ↓
                                    S7 (chat pipeline: read)
                                          ↓
                                    S8 (chat pipeline: write)
                                          ↓
                                    S9 (chat UI + streaming)
                                          ↓
                                    S10 (Google Sheets sync)
                                          ↓
                                    S11 (admin + audit + polish)
                                          ↓
                                    S12 (testing + security + perf)
```

| Session | Name | Est. Files | Est. Hours |
|---------|------|-----------|-----------|
| 1 | Module Scaffold + DB Schema + Migration | ~18 | 3–4 |
| 2 | Schema Engine: Auto-Detect | ~12 | 3–4 |
| 3 | Import Wizard UI + Record CRUD Backend | ~20 | 4–5 |
| 4 | Dynamic Record List + Detail UI | ~18 | 4–5 |
| 5 | Contacts, Notes, Tags & Quick-Add | ~16 | 3–4 |
| 6 | Search + Saved Views | ~14 | 3–4 |
| 7 | Chat Pipeline: Schema Builder + Intent + Query Compiler | ~16 | 4–5 |
| 8 | Chat Pipeline: Write Actions + Confirmation Gate | ~12 | 3–4 |
| 9 | Chat UI + Streaming + Eval Capture | ~14 | 3–4 |
| 10 | Google Sheets OAuth + Sync Engine | ~16 | 4–5 |
| 11 | Admin: Collection/Field Config + Audit + Polish | ~14 | 3–4 |
| 12 | Testing + Security + Performance | ~12 | 3–4 |
| **Total** | | **~182** | **40–52** |

---

## Session 1 — Module Scaffold + DB Schema + Migration {#session-1}

### Goal
Scaffold the `@oppsera/module-spreadsheets` package, define all Drizzle schemas, generate the migration, register entitlements and permissions.

### Files to Create

```
packages/modules/spreadsheets/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                              # Barrel exports
│   ├── types.ts                              # All TypeScript types + enums
│   ├── errors.ts                             # SpreadsheetError subclasses
│   ├── permissions.ts                        # SPREADSHEET_PERMISSIONS, SPREADSHEET_ROLE_PERMISSIONS
│   ├── setup/
│   │   ├── register-entitlements.ts          # Entitlement key + default role permissions
│   │   └── register-events.ts               # SPREADSHEET_EVENT_TYPES constant
│   ├── commands/                             # (empty, populated in later sessions)
│   └── queries/                              # (empty, populated in later sessions)

packages/db/src/schema/
├── spreadsheets.ts                           # All ss_* table definitions

packages/db/migrations/
├── NNNN_spreadsheets_module.sql              # Migration file (number from journal)
```

### package.json

```json
{
  "name": "@oppsera/module-spreadsheets",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./llm": "./src/llm/index.ts",
    "./schema-engine": "./src/schema/index.ts",
    "./sync": "./src/sync/index.ts"
  },
  "dependencies": {
    "@oppsera/shared": "workspace:*",
    "@oppsera/db": "workspace:*",
    "@oppsera/core": "workspace:*"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  }
}
```

### Permissions

```typescript
// packages/modules/spreadsheets/src/permissions.ts
export const SPREADSHEET_PERMISSIONS = {
  VIEW: 'spreadsheets.view',
  EDIT: 'spreadsheets.edit',
  QUERY: 'spreadsheets.query',      // AI chat
  MANAGE: 'spreadsheets.manage',    // Collections, fields, sync, import
} as const;

export const SPREADSHEET_ROLE_PERMISSIONS = {
  owner: Object.values(SPREADSHEET_PERMISSIONS),
  admin: Object.values(SPREADSHEET_PERMISSIONS),
  manager: [
    SPREADSHEET_PERMISSIONS.VIEW,
    SPREADSHEET_PERMISSIONS.EDIT,
    SPREADSHEET_PERMISSIONS.QUERY,
  ],
  staff: [
    SPREADSHEET_PERMISSIONS.VIEW,
    SPREADSHEET_PERMISSIONS.QUERY,
  ],
  readonly: [
    SPREADSHEET_PERMISSIONS.VIEW,
  ],
} as const;
```

### Event Types

```typescript
// packages/modules/spreadsheets/src/setup/register-events.ts
export const SPREADSHEET_EVENT_TYPES = {
  COLLECTION_CREATED: 'spreadsheets.collection.created.v1',
  COLLECTION_UPDATED: 'spreadsheets.collection.updated.v1',
  RECORD_CREATED: 'spreadsheets.record.created.v1',
  RECORD_UPDATED: 'spreadsheets.record.updated.v1',
  RECORD_DELETED: 'spreadsheets.record.deleted.v1',
  IMPORT_COMPLETED: 'spreadsheets.import.completed.v1',
  SYNC_COMPLETED: 'spreadsheets.sync.completed.v1',
  SYNC_CONFLICT: 'spreadsheets.sync.conflict.v1',
} as const;
```

### Migration

```sql
-- NNNN_spreadsheets_module.sql

CREATE TABLE IF NOT EXISTS ss_collections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  name_field_label TEXT NOT NULL DEFAULT 'Name',
  icon TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_file_name TEXT,
  source_sheet_name TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ss_collections_tenant ON ss_collections(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ss_collections_slug ON ss_collections(tenant_id, slug);

CREATE TABLE IF NOT EXISTS ss_field_definitions ( ... );
CREATE TABLE IF NOT EXISTS ss_contact_roles ( ... );
CREATE TABLE IF NOT EXISTS ss_records ( ... );
CREATE TABLE IF NOT EXISTS ss_contacts ( ... );
CREATE TABLE IF NOT EXISTS ss_views ( ... );
CREATE TABLE IF NOT EXISTS ss_sync_connections ( ... );
CREATE TABLE IF NOT EXISTS ss_notes ( ... );

-- RLS on all tables
ALTER TABLE ss_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_ss_collections ON ss_collections
  USING (tenant_id = current_setting('app.current_tenant_id', true));
-- ... repeat for all ss_* tables

-- GIN index for JSONB queries on custom_fields
CREATE INDEX IF NOT EXISTS idx_ss_records_custom_gin
  ON ss_records USING gin(custom_fields);

-- pg_trgm for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_ss_records_name_trgm
  ON ss_records USING gin(name gin_trgm_ops);
```

### Checklist

- [ ] Package scaffolded with correct `exports` in package.json
- [ ] All 8 table definitions in `packages/db/src/schema/spreadsheets.ts`
- [ ] Schema barrel-exported from `packages/db/src/schema/index.ts`
- [ ] Migration file created with correct sequence number from `_journal.json`
- [ ] `_journal.json` updated in same commit
- [ ] All DDL uses `IF NOT EXISTS` / `IF EXISTS`
- [ ] RLS policies on all 8 tables
- [ ] GIN index on `ss_records.custom_fields`
- [ ] pg_trgm index on `ss_records.name`
- [ ] Permissions and event types defined
- [ ] `pnpm db:migrate` succeeds locally
- [ ] `pnpm build` succeeds with new package in workspace

---

## Session 2 — Schema Engine: Auto-Detect {#session-2}

### Goal
Build the engine that reads an uploaded file's headers + sample data and produces a proposed schema: field definitions, contact role groups, and subset sheet detection.

### Files to Create

```
packages/modules/spreadsheets/src/schema/
├── index.ts                    # Barrel exports
├── types.ts                    # DetectedSchema, DetectedField, DetectedContactGroup, etc.
├── header-parser.ts            # Raw headers → cleaned, normalized headers with positions
├── value-analyzer.ts           # Sample values → inferred field type (select, text, email, etc.)
├── contact-grouper.ts          # Detect BUYER NAME + BUYER PHONE + ... → contact role group
├── subset-detector.ts          # Detect BOYD tab as a filtered view of CLIENT FOLDERS
├── slug-generator.ts           # "GAMING CORP" → "gaming_corp"
├── detect-schema.ts            # Orchestrator: takes parsed sheets → returns full DetectedSchema
├── __tests__/
│   ├── header-parser.test.ts
│   ├── value-analyzer.test.ts
│   ├── contact-grouper.test.ts
│   └── subset-detector.test.ts
```

### Detection Pipeline

```typescript
// detect-schema.ts
export async function detectSchema(sheets: ParsedSheet[]): Promise<DetectedSchema> {
  // 1. For each sheet: parse headers, skip title rows, skip blank rows
  // 2. Detect subset sheets (sheets whose data is a subset of another)
  // 3. For each primary sheet:
  //    a. Run contact grouper on headers → extract contact role groups
  //    b. For remaining headers: run value analyzer on sample data → infer field types
  //    c. Identify the "name" column (first text column, or column named "name"/"company"/"supplier")
  // 4. Return DetectedSchema with collections, fields, contact roles, subset views
}
```

### Key Types

```typescript
interface DetectedSchema {
  collections: DetectedCollection[];
  subsetViews: DetectedSubsetView[];
}

interface DetectedCollection {
  suggestedName: string;          // Title-cased sheet name
  sourceSheetName: string;        // Raw sheet name
  rowCount: number;
  nameColumn: DetectedField;      // Which column is the primary name
  fields: DetectedField[];        // Custom fields (excluding contact groups)
  contactGroups: DetectedContactGroup[];
}

interface DetectedField {
  sourceHeader: string;           // "GAMING CORP"
  suggestedLabel: string;         // "Gaming Corp"
  suggestedSlug: string;          // "gaming_corp"
  inferredType: FieldType;        // "select"
  options?: string[];             // ["BOYD", "CAESARS", ...]
  sampleValues: string[];         // First 5 non-empty values
  columnIndex: number;
}

interface DetectedContactGroup {
  suggestedLabel: string;         // "Buyer"
  suggestedSlug: string;          // "buyer"
  fields: ('name' | 'phone' | 'mobile' | 'email' | 'title')[];
  sourceHeaders: string[];        // ["BUYER NAME", "BUYER PHONE", ...]
}

interface DetectedSubsetView {
  sheetName: string;              // "BOYD"
  parentSheetName: string;        // "CLIENT FOLDERS"
  suggestedViewName: string;      // "Boyd"
  filterField: string;            // "gaming_corp"
  filterValue: string;            // "BOYD"
  rowCount: number;
}
```

### Contact Grouper Algorithm

```typescript
// contact-grouper.ts
export function detectContactGroups(headers: ParsedHeader[]): DetectedContactGroup[] {
  const contactSuffixes = ['name', 'phone', 'mobile', 'email', 'contact'];
  const groups: Map<string, { headers: ParsedHeader[], fields: string[] }> = new Map();

  // Pass 1: Find headers with contact-like suffixes
  // "BUYER NAME" → prefix "BUYER", suffix "NAME"
  // "BUYER PHONE" → prefix "BUYER", suffix "PHONE"
  // Group by prefix when 2+ contact suffixes share the same prefix

  // Pass 2: Handle "CONTACT" in header name
  // "PROPERTY CONTACT" → this IS the name field, look for adjacent
  // "PROPERTY PHONE", "PROPERTY MOBILE", "PROPERTY EMAIL"

  // Pass 3: Handle "SECONDARY" pattern
  // "SECONDARY CONTACT/REP" → role name "Secondary Contact"

  // Pass 4: Handle flat "CONTACT, PHONE, MOBILE, EMAIL" (no prefix)
  // → role name "Primary Contact"

  return groups;
}
```

### Value Analyzer Rules

| Condition | Inferred Type |
|-----------|--------------|
| All values match email regex | `email` |
| All values match URL pattern | `url` |
| All values match phone pattern (7+ digits) | `phone` |
| ≤20 unique values AND unique < 50% of total | `select` |
| All values are "yes"/"no"/"true"/"false" | `boolean` |
| All values are numeric | `number` |
| All values parse as dates | `date` |
| Any value > 200 chars | `textarea` |
| Default | `text` |

### Checklist

- [ ] `headerParser` correctly strips title rows, blank rows, trailing empty columns
- [ ] `valueAnalyzer` correctly infers: select (low cardinality), email, phone, url, boolean, number, date, textarea, text
- [ ] `contactGrouper` detects grouped contact patterns (PREFIX + NAME/PHONE/MOBILE/EMAIL)
- [ ] `contactGrouper` handles: "BUYER NAME" groups, "PROPERTY CONTACT" naming, "SECONDARY" prefix, flat "CONTACT/PHONE" fallback
- [ ] `subsetDetector` flags sheets whose row names are a subset of another sheet's names
- [ ] `subsetDetector` identifies the filter field + value
- [ ] `detectSchema` orchestrates all detectors and returns a complete `DetectedSchema`
- [ ] Tests cover David's exact file structure (CLIENT FOLDERS + SUPPLIER + BOYD/CAESARS/PINNACLE)
- [ ] Tests cover edge cases: single-sheet file, empty sheet, sheet with no contacts, sheet with only name column

---

## Session 3 — Import Wizard UI + Record CRUD Backend {#session-3}

### Goal
Build the frontend import wizard and the backend commands to create collections and import records.

### Backend: Commands

```
packages/modules/spreadsheets/src/commands/
├── create-collection.ts          # Create collection + field defs + contact roles + views
├── import-records.ts             # Bulk insert records + contacts from parsed data
├── create-record.ts              # Single record creation
├── update-record.ts              # Update record (core + custom_fields merge)
├── delete-record.ts              # Soft delete (set deleted_at)
```

**`create-collection.ts`** — the main command from import:

```typescript
export async function createCollection(
  ctx: RequestContext,
  input: CreateCollectionInput,
): Promise<CollectionWithSchema> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Generate slug from name (slugify + dedup check)
    // 2. Insert ss_collections row
    // 3. Insert ss_field_definitions rows (one per field)
    // 4. Insert ss_contact_roles rows (one per contact group)
    // 5. Insert ss_views rows (for any detected subset views)
    // 6. Build event
    const event = buildEventFromContext(ctx, SPREADSHEET_EVENT_TYPES.COLLECTION_CREATED, {
      collectionId: collection.id,
      name: collection.name,
      fieldCount: input.fields.length,
      contactRoleCount: input.contactRoles.length,
    });
    return { result: collection, events: [event] };
  });
  await auditLog(ctx, 'spreadsheets.collection.created', 'ss_collection', result.id);
  return result;
}
```

**`import-records.ts`** — bulk import:

```typescript
export async function importRecords(
  ctx: RequestContext,
  input: ImportRecordsInput,
): Promise<ImportResult> {
  // Process in batches of 100 to avoid overwhelming the connection
  // For each row:
  //   1. Extract name from name column
  //   2. Build custom_fields JSONB from remaining mapped columns
  //   3. Build search_text from searchable fields
  //   4. Insert ss_records row
  //   5. For each detected contact group: extract contact fields → insert ss_contacts row
  // Return: { imported: number, skipped: number, errors: ImportError[] }
}
```

### Backend: Queries

```
packages/modules/spreadsheets/src/queries/
├── list-collections.ts
├── get-collection.ts             # Collection + field defs + contact roles
├── list-records.ts               # With cursor pagination, filters, sort
├── get-record.ts                 # Record + contacts + notes
```

### Frontend: Import Wizard Pages

```
apps/web/src/app/(dashboard)/reports/spreadsheets/
├── page.tsx                      # Landing: shows collections or empty state
├── import/
│   └── page.tsx                  # Thin wrapper → import-content.tsx
├── layout.tsx                    # Reports/Spreadsheets sub-layout

apps/web/src/components/spreadsheets/import/
├── import-content.tsx            # Main wizard orchestrator (code-split)
├── file-upload-step.tsx          # Drag-drop upload zone
├── sheet-select-step.tsx         # Select which sheets to import
├── schema-review-step.tsx        # Review detected fields, types, contact groups
├── field-type-select.tsx         # Dropdown for changing detected type
├── import-progress-step.tsx      # Progress bar during import
├── import-summary-step.tsx       # Results: X imported, Y skipped, Z errors
```

### File Parsing

Use `xlsx` (SheetJS) for parsing — already available in OppsEra's dependency tree:

```typescript
// packages/modules/spreadsheets/src/helpers/file-parser.ts
import * as XLSX from 'xlsx';

export function parseUploadedFile(buffer: ArrayBuffer): ParsedSheet[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return { name, rows: rows as string[][] };
  });
}
```

### API Routes

```
apps/web/src/app/api/v1/spreadsheets/
├── collections/
│   ├── route.ts                  # GET (list), POST (create)
│   └── [id]/route.ts            # GET (detail), PATCH, DELETE
├── import/
│   ├── detect/route.ts          # POST: upload file → return DetectedSchema
│   └── execute/route.ts         # POST: create collection + import data
├── records/
│   ├── route.ts                  # GET (list), POST (create)
│   └── [id]/route.ts            # GET (detail), PATCH, DELETE
```

### Import Wizard Flow

```
Step 1: Upload
  → User drops a file
  → Frontend reads file, sends to POST /import/detect
  → Backend parses file with SheetJS, runs detectSchema()
  → Returns DetectedSchema JSON

Step 2: Sheet Selection
  → UI shows all detected sheets with row counts
  → Subset sheets marked as "filtered view" with explanation
  → User checks which sheets to import as collections

Step 3: Schema Review (per selected sheet)
  → UI shows detected fields with type dropdowns
  → Collection name pre-filled from sheet name (A+B strategy)
  → User can rename collection, rename fields, change types, remove fields
  → Contact groups shown with editable role names
  → Subset views shown with toggle

Step 4: Execute
  → Frontend sends confirmed schema to POST /import/execute
  → Backend calls createCollection() + importRecords()
  → Progress reported via SSE or polling
  → Returns ImportResult

Step 5: Summary
  → "Created 2 collections: Customers (129 records), Suppliers (45 records)"
  → "3 saved views: Boyd, Caesars, Pinnacle"
  → Button: "Go to Customers →"
```

### Checklist

- [ ] `POST /import/detect` accepts file upload, returns `DetectedSchema`
- [ ] `POST /import/execute` creates collection + field defs + contact roles + records + contacts + views
- [ ] `createCollection` follows OppsEra command pattern (`publishWithOutbox`, `auditLog`)
- [ ] `importRecords` processes in batches of 100
- [ ] `importRecords` builds `custom_fields` JSONB correctly
- [ ] `importRecords` builds `search_text` from searchable fields
- [ ] `importRecords` creates `ss_contacts` rows for each detected contact group
- [ ] File upload step handles drag-drop + click-to-browse
- [ ] Sheet selection step shows row counts, flags subsets
- [ ] Schema review step lets user rename collection, rename/retype/remove fields
- [ ] Collection name pre-filled from sheet name, user can change (A+B strategy)
- [ ] Import progress shows count
- [ ] Summary shows results with navigation to new collection
- [ ] All routes use `withMiddleware({ entitlement: 'spreadsheets', permission: '...' })`
- [ ] Landing page (`/reports/spreadsheets/`) shows empty state when no collections exist

---

## Session 4 — Dynamic Record List + Detail UI {#session-4}

### Goal
Build the data-driven table view and record detail page that renders whatever fields a collection has.

### Frontend Pages

```
apps/web/src/app/(dashboard)/reports/spreadsheets/
├── [collectionSlug]/
│   ├── page.tsx                  # Thin wrapper → collection-content.tsx
│   └── [recordId]/
│       └── page.tsx              # Thin wrapper → record-detail-content.tsx

apps/web/src/components/spreadsheets/
├── collection-content.tsx        # Table view with view tabs, filters, sort
├── record-detail-content.tsx     # Record detail with custom fields, contacts, notes
├── record-form-content.tsx       # Create/edit form
├── fields/
│   ├── field-renderer.tsx        # Display mode: renders any field type
│   ├── field-editor.tsx          # Edit mode: renders correct input for any field type
│   ├── select-field.tsx          # Dropdown for select fields
│   └── multi-select-field.tsx    # Multi-select pills
├── collection-sidebar.tsx        # Collection list in sidebar under Reports
├── view-tabs.tsx                 # Saved view tabs above table
```

### FieldRenderer — The Core Dynamic Component

```typescript
// components/spreadsheets/fields/field-renderer.tsx
interface FieldRendererProps {
  field: FieldDefinition;
  value: unknown;
  mode: 'display' | 'edit';
  onChange?: (value: unknown) => void;
}

// type="text"         → <span> | <Input />
// type="select"       → <Badge color> | <Select options={field.options} />
// type="multi_select" → <BadgeGroup> | <MultiSelect />
// type="email"        → <a href="mailto:"> | <Input type="email" />
// type="phone"        → <a href="tel:"> | <Input type="tel" />
// type="url"          → <a href={v} target="_blank"> | <Input type="url" />
// type="number"       → <span formatted> | <Input type="number" />
// type="date"         → <span formatted> | <DatePicker />
// type="boolean"      → <Badge Yes/No> | <Switch />
// type="textarea"     → <p> | <Textarea />
```

### JSONB Query Patterns (Backend)

```typescript
// queries/list-records.ts — filter by custom field
function buildCustomFieldFilter(field: string, op: string, value: unknown) {
  const slug = field.replace('custom_fields.', '');
  switch (op) {
    case 'eq':
      return sql`${ssRecords.customFields}->>'${sql.raw(slug)}' = ${value}`;
    case 'neq':
      return sql`${ssRecords.customFields}->>'${sql.raw(slug)}' != ${value}`;
    case 'contains':
      return sql`${ssRecords.customFields}->>'${sql.raw(slug)}' ILIKE ${'%' + value + '%'}`;
    case 'in':
      return sql`${ssRecords.customFields}->>'${sql.raw(slug)}' = ANY(${value as string[]})`;
    case 'is_empty':
      return sql`(${ssRecords.customFields}->>'${sql.raw(slug)}' IS NULL
        OR ${ssRecords.customFields}->>'${sql.raw(slug)}' = '')`;
    case 'is_not_empty':
      return sql`(${ssRecords.customFields}->>'${sql.raw(slug)}' IS NOT NULL
        AND ${ssRecords.customFields}->>'${sql.raw(slug)}' != '')`;
  }
}
```

### Hooks

```
apps/web/src/hooks/
├── use-collections.ts            # List collections for sidebar
├── use-collection.ts             # Single collection + field defs + contact roles
├── use-records.ts                # Paginated records with filters/sort
├── use-record.ts                 # Single record + contacts + notes
```

### Sidebar Integration

The collection list renders dynamically in the Reports section of the sidebar. When a tenant has no collections, the sidebar shows "Talk to Spreadsheets" with a subtle "(empty)" indicator. When collections exist, each becomes a clickable sub-item:

```
Reports
  ├── Sales
  ├── Items
  ├── Inventory
  ├── Custom Reports
  ├── Dashboards
  └── Talk to Spreadsheets
      ├── Customers (129)        ← dynamic from ss_collections
      ├── Suppliers (45)         ← dynamic from ss_collections
      └── + Import
```

### Checklist

- [ ] `/reports/spreadsheets/[collectionSlug]` dynamically renders any collection
- [ ] Table columns generated from `showInTable` field definitions
- [ ] `FieldRenderer` correctly displays all 10 field types
- [ ] `FieldEditor` renders correct input widget for each type
- [ ] Cursor-based pagination on record list
- [ ] Sort on any column (including custom JSONB fields)
- [ ] Filter bar with type-aware controls (select → dropdown, text → search input)
- [ ] Record detail page shows all custom fields in a grid
- [ ] Create/edit form generates inputs from field definitions
- [ ] PATCH endpoint correctly merges `custom_fields` JSONB (deep merge, not overwrite)
- [ ] Sidebar shows collections dynamically under Reports → Talk to Spreadsheets
- [ ] Empty state on landing page when no collections exist
- [ ] All UI follows dark mode inverted gray scale

---

## Session 5 — Contacts, Notes, Tags & Quick-Add {#session-5}

### Goal
Contact role cards on record detail, notes timeline, and quick-add tools.

### Contact UI

```
apps/web/src/components/spreadsheets/contacts/
├── contact-role-group.tsx        # Shows all roles for a record, with inline edit
├── contact-card.tsx              # Single contact with name/phone/email as clickable links
├── contact-form.tsx              # Add/edit contact modal
```

### Notes UI

```
apps/web/src/components/spreadsheets/notes/
├── notes-timeline.tsx            # Chronological list with author + source badge
├── add-note-form.tsx             # Inline text input at bottom
```

### Quick-Add

```
apps/web/src/components/spreadsheets/
├── quick-add-modal.tsx           # Minimal form: collection selector + name + save
├── command-palette.tsx           # Cmd+K to search records + actions
```

### API Routes

```
apps/web/src/app/api/v1/spreadsheets/
├── records/[id]/contacts/route.ts   # GET, POST
├── contacts/
│   ├── route.ts                      # GET (search by role)
│   └── [id]/route.ts                # PATCH, DELETE
├── records/[id]/notes/route.ts      # GET, POST
```

### Checklist

- [ ] ContactRoleGroup renders all roles defined for the collection
- [ ] Empty roles show "+ Add" button
- [ ] Inline edit mode for each contact
- [ ] Phone/email are clickable links (`tel:`, `mailto:`)
- [ ] Notes timeline with author, source badge (UI/AI/Sync/Import), timestamp
- [ ] Add note form with text input
- [ ] Quick-add modal creates a record with minimal fields
- [ ] Cmd+K command palette searches across all collections

---

## Session 6 — Search + Saved Views {#session-6}

### Goal
Full-text search across records (including custom fields) and saved filter views.

### Search

```
packages/modules/spreadsheets/src/queries/
├── search-records.ts             # Full-text + pg_trgm fuzzy search

apps/web/src/app/api/v1/spreadsheets/
├── search/route.ts               # GET ?q=&collectionId=

apps/web/src/components/spreadsheets/
├── global-search.tsx             # Search bar scoped to spreadsheet data
```

Search queries `ss_records.name` (trgm fuzzy) + `ss_records.search_text` (tsvector) + `ss_records.custom_fields` (JSONB text extraction for searchable fields).

### Saved Views

```
packages/modules/spreadsheets/src/commands/
├── create-view.ts
├── update-view.ts
├── delete-view.ts

packages/modules/spreadsheets/src/queries/
├── list-views.ts

apps/web/src/app/api/v1/spreadsheets/
├── views/
│   ├── route.ts                  # GET (list), POST (create)
│   └── [id]/route.ts            # PATCH, DELETE

apps/web/src/components/spreadsheets/
├── view-tabs.tsx                 # Tab bar above table (All, Boyd, Caesars, ...)
├── filter-builder.tsx            # Build filters with field-type-aware controls
├── save-view-modal.tsx           # Name + share toggle
```

View tabs render above the record table. "All" is always first. Clicking a tab applies its saved filters. The "+" button opens the filter builder to create a new view.

### Checklist

- [ ] Search endpoint returns ranked results with collection name + matched field
- [ ] pg_trgm fuzzy matching handles typos
- [ ] Search includes custom fields marked `isSearchable`
- [ ] View tabs render dynamically from `ss_views`
- [ ] Clicking a view tab applies its filters to the record list
- [ ] Filter builder has type-aware controls (select → dropdown, text → contains input)
- [ ] "+" creates a new view with name + filters
- [ ] Views can be shared with team or kept personal
- [ ] Auto-created views from import (BOYD, CAESARS, etc.) render correctly

---

## Session 7 — Chat Pipeline: Schema Builder + Intent + Query Compiler {#session-7}

### Goal
Build the read-only chat pipeline. The LLM can query records and contacts but cannot write. This is the core AI integration.

### Files to Create

```
packages/modules/spreadsheets/src/llm/
├── index.ts                      # Barrel exports
├── types.ts                      # PipelineInput, PipelineOutput, tool types
├── schema-builder.ts             # Reads ss_field_definitions → builds schema dict JSON
├── contract.ts                   # Contract of Truth system prompt template
├── tools.ts                      # Tool definitions: query_records, query_contacts, clarify
├── intent-resolver.ts            # Sends message + schema dict + tools → LLM → tool_use response
├── plan-validator.ts             # Validates tool call params against tenant's actual schema
├── query-compiler.ts             # Tool call → Drizzle query with JSONB operators
├── executor.ts                   # Runs query with timeout + row limit
├── narrative.ts                  # Formats results → natural language
├── pipeline.ts                   # Orchestrator: message → intent → compile → execute → narrate
├── cache.ts                      # LRU cache for schema dict (5-min TTL) + query results (1-min TTL)
├── rate-limiter.ts               # Per-tenant sliding window (30/60s, matches semantic pattern)
```

### Schema Dictionary Builder

```typescript
// src/llm/schema-builder.ts
export async function buildSchemaDictionary(tenantId: string): Promise<SchemaDictionary> {
  // 1. Query ss_collections WHERE tenant_id = tenantId AND is_archived = false
  // 2. For each collection: query ss_field_definitions + ss_contact_roles
  // 3. Build JSON structure the LLM can understand
  // 4. Cache with LRU (5-min TTL, keyed by tenantId)
  // 5. Invalidate on field definition changes
}
```

Output matches the structure described in the architecture overview — the LLM sees collection names, field slugs/types/options, and contact roles with their fields.

### Tool Definitions

Three read-only tools (write tools added in Session 8):

```typescript
export const READ_TOOLS = [
  {
    name: 'query_records',
    description: 'Search, filter, and list records from any collection',
    input_schema: {
      type: 'object',
      required: ['collection'],
      properties: {
        collection: { type: 'string', description: 'Collection slug' },
        filters: { type: 'array', items: {
          type: 'object',
          properties: {
            field: { type: 'string', description: 'Field slug or "custom_fields.{slug}"' },
            op: { type: 'string', enum: ['eq', 'neq', 'contains', 'gt', 'lt', 'in', 'is_empty', 'is_not_empty'] },
            value: {},
          },
        }},
        includeContacts: { type: 'boolean' },
        sort: { type: 'object', properties: { field: { type: 'string' }, direction: { type: 'string', enum: ['asc', 'desc'] } } },
        limit: { type: 'integer', maximum: 50, default: 20 },
      },
    },
  },
  {
    name: 'query_contacts',
    description: 'Search contacts across records, optionally filtered by role',
    input_schema: {
      type: 'object',
      required: ['collection'],
      properties: {
        collection: { type: 'string' },
        roleSlug: { type: 'string', description: 'Filter to a specific contact role' },
        search: { type: 'string', description: 'Name, email, or phone to search' },
        includeRecord: { type: 'boolean', description: 'Include parent record info' },
      },
    },
  },
  {
    name: 'clarify',
    description: 'Ask the user for more information when the query is ambiguous',
    input_schema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string' },
        suggestions: { type: 'array', items: { type: 'string' } },
      },
    },
  },
];
```

### Plan Validator

```typescript
// src/llm/plan-validator.ts
export function validateToolCall(
  toolCall: LLMToolCall,
  schema: SchemaDictionary,
): ValidationResult {
  // 1. Check collection slug exists in schema.collections
  // 2. Check all filter field slugs exist in that collection's fields or contact roles
  // 3. Check filter ops are valid for the field type
  // 4. Check sort field exists
  // 5. Check contact role slug exists (for query_contacts)
  // 6. Return { valid: true } or { valid: false, error: string }
}
```

### Pipeline Orchestrator

```typescript
// src/llm/pipeline.ts
export async function runSpreadsheetPipeline(
  input: SpreadsheetPipelineInput,
): Promise<SpreadsheetPipelineOutput> {
  // 1. Rate limit check (30/60s per tenant)
  // 2. Build schema dictionary (cached)
  // 3. Build system prompt = Contract of Truth + schema dict
  // 4. Call getLLMAdapter().complete() with tools + conversation history
  // 5. Parse tool_use response
  // 6. Validate tool call against schema
  // 7. Compile tool call → Drizzle query
  // 8. Execute query within withTenant (timeout 10s, limit 100 rows)
  // 9. Generate narrative from results
  // 10. Return { narrative, data, toolCall, evalTurnId }
}
```

### LLM Adapter Usage

```typescript
// Uses existing adapter — no new LLM code needed
import { getLLMAdapter } from '@oppsera/core/llm/adapter';

const response = await getLLMAdapter().complete(messages, {
  tools: READ_TOOLS,
  maxTokens: 4096,
  systemPromptParts: [
    { text: contractOfTruth, cacheControl: true },  // Static contract
    { text: dynamicSchemaDict },                       // Per-tenant schema
  ],
});
```

### Checklist

- [ ] Schema builder produces correct JSON from `ss_field_definitions` + `ss_contact_roles`
- [ ] Schema dict cached with LRU (5-min TTL, invalidates on field changes)
- [ ] Contract of Truth prompt constrains LLM to only reference tenant's actual schema
- [ ] `query_records` tool compiles to correct JSONB Drizzle queries
- [ ] `query_contacts` tool searches by role + name/email/phone
- [ ] `clarify` tool returns a question to the user
- [ ] Plan validator rejects tool calls with invalid collection/field/role slugs
- [ ] Executor runs within `withTenant` with 10s timeout + 100 row limit
- [ ] Narrative generates natural language from results
- [ ] Pipeline orchestrates all stages end-to-end
- [ ] Rate limiter enforces 30 queries / 60s per tenant
- [ ] Prompt caching used for static Contract of Truth portion
- [ ] Conversation history maintained (10-turn sliding window)

---

## Session 8 — Chat Pipeline: Write Actions + Confirmation Gate {#session-8}

### Goal
Add create, update, and delete tools to the chat pipeline with the confirmation gate pattern.

### Additional Tools

```typescript
export const WRITE_TOOLS = [
  {
    name: 'create_record',
    input_schema: {
      collection: 'string', name: 'string',
      customFields: 'Record<string, any>',
      contacts: [{ roleSlug: 'string', name: 'string', email: 'string', phone: 'string' }],
      preview: 'string', // Human-readable description
    },
  },
  {
    name: 'update_record',
    input_schema: {
      collection: 'string', recordId: 'string',
      changes: 'Record<string, { from: any, to: any }>',
      preview: 'string',
    },
  },
  {
    name: 'update_contact',
    input_schema: {
      recordId: 'string', roleSlug: 'string',
      changes: 'Record<string, { from: any, to: any }>',
      preview: 'string',
    },
  },
  {
    name: 'delete_record',
    input_schema: { collection: 'string', recordId: 'string', preview: 'string' },
  },
];
```

### Confirmation Gate Flow

```
LLM returns write tool_use → Pipeline stores pending action in ss_chat_sessions metadata
  → Response includes { pendingAction: { ... }, confirmationRequired: true }
  → Frontend renders ConfirmationCard with Approve / Cancel
  → User clicks Approve → POST /chat/confirm { sessionId, actionId }
  → Backend validates action is still pending
  → Backend checks user has 'spreadsheets.edit' permission
  → Backend executes: createRecord / updateRecord / deleteRecord
  → Backend wraps in publishWithOutbox + auditLog
  → Returns success narrative
```

### Files

```
packages/modules/spreadsheets/src/llm/
├── action-compiler.ts            # Tool call → mutation plan
├── confirmation.ts               # Store/retrieve/execute pending actions

packages/modules/spreadsheets/src/commands/
├── confirm-action.ts             # Execute a confirmed pending action
```

### Permission Gating

- `spreadsheets.view` users: LLM only receives `READ_TOOLS`
- `spreadsheets.edit` users: LLM receives `READ_TOOLS + WRITE_TOOLS`
- `spreadsheets.manage` users: same as edit (manage is for schema/import/sync)

The pipeline checks the user's permissions before injecting tools into the LLM call.

### Checklist

- [ ] Write tools added to LLM when user has `spreadsheets.edit`
- [ ] Write tools excluded when user only has `spreadsheets.view`
- [ ] LLM returns `preview` string for every write action
- [ ] Pending actions stored in session metadata (not executed immediately)
- [ ] `POST /chat/confirm` validates action is still pending + user has permission
- [ ] `confirm-action` executes via `publishWithOutbox` + `auditLog`
- [ ] Audit log records source as `ai` with `chatSessionId` in metadata
- [ ] Ambiguous record references trigger `clarify` tool
- [ ] Update actions include `from`/`to` diff for confirmation display

---

## Session 9 — Chat UI + Streaming + Eval Capture {#session-9}

### Goal
Build the chat frontend, wire SSE streaming, and integrate eval capture.

### Frontend Pages

```
apps/web/src/app/(dashboard)/reports/spreadsheets/
├── chat/
│   └── page.tsx                  # Thin wrapper → chat-content.tsx

apps/web/src/components/spreadsheets/chat/
├── chat-content.tsx              # Main chat interface (code-split)
├── chat-message-bubble.tsx       # User/AI messages with inline data
├── result-table.tsx              # Inline data table in AI responses
├── contact-result-card.tsx       # Contact info display
├── confirmation-card.tsx         # Approve/Cancel for pending writes
├── suggested-prompts.tsx         # Auto-generated from tenant's schema
├── chat-input.tsx                # Auto-resize input with send button
├── chat-session-sidebar.tsx      # Session history sidebar
```

### Hook

```typescript
// hooks/use-spreadsheet-chat.ts
// Mirrors useSemanticChat pattern:
//   - messages: ChatMessage[]
//   - sendMessage(text): Promise<void>
//   - confirmAction(actionId): Promise<void>
//   - isLoading, isStreaming
//   - activeSessionId
//   - initFromSession(id, turns)
```

### SSE Streaming

Same pattern as semantic pipeline:
```
POST /chat/stream
→ text/event-stream
→ Events: status, data_ready, narrative_chunk, enrichments, complete, error
```

### Eval Capture

```typescript
// Reuses the eval capture pattern from semantic
// At end of pipeline:
const evalTurnId = await captureSpreadsheetEvalTurn({
  tenantId, userId, sessionId,
  userMessage: input.message,
  toolCall, compiledQuery,
  resultSample: rows.slice(0, 5),
  rowCount: rows.length,
  narrative,
  latencyMs,
  cacheStatus,
});
// evalTurnId returned in response for FeedbackWidget
```

Eval turns stored in existing `semantic_eval_turns` table (or a new `ss_eval_turns` — decide during build) with a `source: 'spreadsheets'` discriminator.

### Suggested Prompts

Auto-generated from the tenant's schema:

```typescript
function generateSuggestedPrompts(schema: SchemaDictionary): string[] {
  const prompts: string[] = [];
  for (const [slug, col] of Object.entries(schema.collections)) {
    // "List all [collection]"
    prompts.push(`List all ${col.label}`);

    // "Show [collection] where [select field] is [first option]"
    const selectField = Object.entries(col.customFields).find(([_, f]) => f.type === 'select');
    if (selectField) {
      const [fSlug, fDef] = selectField;
      const firstOption = fDef.options?.[0];
      if (firstOption) prompts.push(`Show ${col.label} where ${fDef.label} is ${firstOption}`);
    }

    // "Who is the [contact role] at [sample record]?"
    for (const [rSlug, role] of Object.entries(col.contactRoles || {})) {
      prompts.push(`Who is the ${role.label} at...?`);
    }
  }
  return prompts.slice(0, 6);
}
```

### Checklist

- [ ] Chat page renders with empty state + suggested prompts
- [ ] Messages send via SSE streaming with progressive narrative display
- [ ] Status events show pipeline progress ("Understanding your question…", "Searching records…")
- [ ] Data results render as inline tables
- [ ] Contact results render as cards with clickable phone/email
- [ ] ConfirmationCard renders for pending write actions with Approve/Cancel
- [ ] Approve calls `POST /chat/confirm` and shows success narrative
- [ ] Session history sidebar shows past conversations
- [ ] Loading old session reconstructs messages
- [ ] FeedbackWidget renders when evalTurnId is present
- [ ] Suggested prompts auto-generated from tenant's schema
- [ ] Chat follows dark mode inverted gray scale

---

## Session 10 — Google Sheets OAuth + Sync Engine {#session-10}

### Goal
Connect a Google Sheet to a collection, map columns to field definitions, and sync bidirectionally.

### Files

```
packages/modules/spreadsheets/src/sync/
├── index.ts
├── google-client.ts              # OAuth2 flow + Sheets API client
├── sheet-reader.ts               # Read rows from a Google Sheet
├── sheet-writer.ts               # Write/update rows in a Google Sheet
├── differ.ts                     # Compare DB records vs sheet rows → compute diff
├── conflict-resolver.ts          # Detect + resolve bidirectional conflicts
├── sync-job.ts                   # The actual sync execution logic

packages/modules/spreadsheets/src/commands/
├── connect-sync.ts               # Store OAuth tokens + sheet ID
├── trigger-sync.ts               # Manual sync now
├── resolve-conflict.ts           # Admin resolves a conflict
```

### Sync Flow

```
1. User initiates Google OAuth → redirect to Google → callback with tokens
2. User selects a sheet + tab → system loads column headers
3. Column mapping UI: map sheet columns → collection field definitions
4. Mapping saved to ss_sync_connections.column_map
5. Polling job runs every 5 minutes (Postgres SKIP LOCKED):
   a. Pull: read sheet rows → diff against DB → apply changes to DB
   b. Push: read DB changes since last sync → write to sheet
6. Conflict: same record changed in both → flag for admin review
```

### Column Map Format

```json
{
  "A": "name",
  "B": "custom_fields.gaming_corp",
  "C": "custom_fields.color_folder",
  "D": "contacts.buyer.name",
  "E": "contacts.buyer.phone",
  "F": "contacts.buyer.email"
}
```

### Frontend

```
apps/web/src/app/(dashboard)/reports/spreadsheets/
├── sync/
│   └── page.tsx                  # Sync settings page

apps/web/src/components/spreadsheets/sync/
├── sync-content.tsx              # Connection list + add new
├── connect-sheet-modal.tsx       # OAuth flow + sheet selector
├── column-mapper.tsx             # Map sheet columns → field definitions
├── sync-status-badge.tsx         # Active/Paused/Error indicator
├── conflict-review.tsx           # Resolve bidirectional conflicts
```

### Environment Variables (new)

```bash
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=https://app.oppsera.com/api/v1/spreadsheets/sync/callback
```

### Checklist

- [ ] Google OAuth connect flow works end-to-end
- [ ] Token storage encrypted at rest
- [ ] Token refresh on expiry
- [ ] Sheet selector shows user's Google Sheets + tabs
- [ ] Column mapper maps to field definitions + contact role fields
- [ ] DB → Sheet push works (new/updated records)
- [ ] Sheet → DB pull works (new/updated rows)
- [ ] Conflict detection flags records changed in both directions
- [ ] Conflict review UI for admin resolution
- [ ] Manual "Sync Now" button
- [ ] Sync status badge in UI
- [ ] Sync job runs via SKIP LOCKED polling
- [ ] All sync changes audited with source = 'sync'

---

## Session 11 — Admin: Collection/Field Config + Audit + Polish {#session-11}

### Goal
Settings pages for managing collections, fields, contact roles. Audit trail viewer. UI polish.

### Settings Pages

```
apps/web/src/app/(dashboard)/reports/spreadsheets/
├── settings/
│   ├── page.tsx                  # Settings hub
│   ├── collections/
│   │   └── [id]/page.tsx        # Edit collection: rename, reorder fields, add/remove fields

apps/web/src/components/spreadsheets/settings/
├── field-editor.tsx              # Add/edit/remove field definitions
├── contact-role-editor.tsx       # Add/edit/remove contact roles
├── collection-settings.tsx       # Rename, change icon/color, archive
```

### Audit Integration

Uses existing `auditLog()` — no new audit infrastructure needed. Every mutation already calls `auditLog(ctx, ...)` in the command pattern.

### Audit Viewer

```
apps/web/src/components/spreadsheets/
├── audit-timeline.tsx            # Change history on record detail page
```

Queries the existing `audit_log` table filtered by `entity_type LIKE 'ss_%'`.

### Polish Items

- Skeleton loading states on all pages
- Error boundaries with retry
- Toast notifications for successful saves
- Empty states with clear CTAs
- Breadcrumbs: Reports → Talk to Spreadsheets → Customers → Caesars Palace
- Mobile responsive: table → card view on small screens
- Keyboard shortcuts: Cmd+K (search), Escape (close modals)

### Checklist

- [ ] Field editor: add new field, change type, rename, toggle showInTable, remove
- [ ] Contact role editor: add new role, edit fields, rename, remove
- [ ] Collection settings: rename, change icon/color, archive
- [ ] Changes to field definitions invalidate schema dictionary cache
- [ ] Audit timeline on record detail page shows change history
- [ ] Skeleton loading states on all major pages
- [ ] Toast notifications on successful actions
- [ ] Empty states guide users to take action
- [ ] Breadcrumb navigation

---

## Session 12 — Testing + Security + Performance {#session-12}

### Goal
Vitest test suites, security hardening, performance verification.

### Test Suites

```
packages/modules/spreadsheets/src/__tests__/
├── schema/
│   ├── header-parser.test.ts
│   ├── value-analyzer.test.ts
│   ├── contact-grouper.test.ts
│   └── subset-detector.test.ts
├── llm/
│   ├── schema-builder.test.ts
│   ├── plan-validator.test.ts
│   ├── query-compiler.test.ts
│   └── pipeline.test.ts
├── commands/
│   ├── create-collection.test.ts
│   ├── import-records.test.ts
│   └── confirm-action.test.ts
├── queries/
│   ├── list-records.test.ts
│   └── search-records.test.ts
```

All tests use OppsEra's `vi.hoisted` mock pattern. LLM tests mock `getLLMAdapter()`. DB tests mock `@oppsera/db`.

### Security Verification

| Check | What to Verify |
|-------|---------------|
| RLS tenant isolation | Tenant A cannot query tenant B's `ss_records` even with raw SQL |
| Permission guards | `spreadsheets.view` user cannot call write endpoints |
| LLM schema constraint | Plan validator rejects field slugs not in tenant's schema |
| Confirmation gate | Write actions cannot execute without explicit confirm call |
| JSONB injection | Filter values are parameterized, never string-interpolated |
| Rate limiting | 31st query in 60s returns 429 |
| Query timeout | 11+ second query is killed |
| Row limit | Queries cannot return > 100 rows |
| Fire-and-forget | No unawaited DB operations (Vercel safety) |

### Performance

- Schema dictionary LRU cache: verify 5-min TTL, cache hit on second request
- JSONB GIN index: `EXPLAIN ANALYZE` on `custom_fields->>'field' = 'value'` uses index
- pg_trgm index: fuzzy search uses index scan, not seq scan
- Record list with 10K records: < 200ms response time
- Chat pipeline end-to-end: < 5s including LLM call

### Checklist

- [ ] Schema engine tests cover David's exact file structure
- [ ] Plan validator tests verify rejection of invalid collections/fields
- [ ] Query compiler tests verify correct JSONB SQL generation
- [ ] Pipeline integration test: message → tool_use → query → narrative
- [ ] RLS isolation test: cross-tenant query returns 0 rows
- [ ] Permission tests: readonly user blocked from write endpoints
- [ ] Rate limit test: 429 on excess queries
- [ ] All DB operations awaited (no fire-and-forget)
- [ ] `EXPLAIN ANALYZE` confirms GIN index usage on custom_fields
- [ ] `pnpm test:coverage` reports > 80% on module

---

## Appendix A — Full File Manifest {#appendix-a}

### Module Package (~80 files)

```
packages/modules/spreadsheets/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── errors.ts
│   ├── permissions.ts
│   ├── setup/
│   │   ├── register-entitlements.ts
│   │   └── register-events.ts
│   ├── schema/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── header-parser.ts
│   │   ├── value-analyzer.ts
│   │   ├── contact-grouper.ts
│   │   ├── subset-detector.ts
│   │   ├── slug-generator.ts
│   │   └── detect-schema.ts
│   ├── llm/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── schema-builder.ts
│   │   ├── contract.ts
│   │   ├── tools.ts
│   │   ├── intent-resolver.ts
│   │   ├── plan-validator.ts
│   │   ├── query-compiler.ts
│   │   ├── action-compiler.ts
│   │   ├── confirmation.ts
│   │   ├── executor.ts
│   │   ├── narrative.ts
│   │   ├── pipeline.ts
│   │   ├── cache.ts
│   │   └── rate-limiter.ts
│   ├── sync/
│   │   ├── index.ts
│   │   ├── google-client.ts
│   │   ├── sheet-reader.ts
│   │   ├── sheet-writer.ts
│   │   ├── differ.ts
│   │   ├── conflict-resolver.ts
│   │   └── sync-job.ts
│   ├── helpers/
│   │   ├── file-parser.ts
│   │   └── search-text-builder.ts
│   ├── commands/
│   │   ├── index.ts
│   │   ├── create-collection.ts
│   │   ├── import-records.ts
│   │   ├── create-record.ts
│   │   ├── update-record.ts
│   │   ├── delete-record.ts
│   │   ├── create-view.ts
│   │   ├── update-view.ts
│   │   ├── delete-view.ts
│   │   ├── connect-sync.ts
│   │   ├── trigger-sync.ts
│   │   ├── resolve-conflict.ts
│   │   └── confirm-action.ts
│   ├── queries/
│   │   ├── index.ts
│   │   ├── list-collections.ts
│   │   ├── get-collection.ts
│   │   ├── list-records.ts
│   │   ├── get-record.ts
│   │   ├── search-records.ts
│   │   ├── list-views.ts
│   │   └── list-contacts.ts
│   └── __tests__/
│       ├── schema/
│       │   ├── header-parser.test.ts
│       │   ├── value-analyzer.test.ts
│       │   ├── contact-grouper.test.ts
│       │   └── subset-detector.test.ts
│       ├── llm/
│       │   ├── schema-builder.test.ts
│       │   ├── plan-validator.test.ts
│       │   ├── query-compiler.test.ts
│       │   └── pipeline.test.ts
│       └── commands/
│           ├── create-collection.test.ts
│           ├── import-records.test.ts
│           └── confirm-action.test.ts
```

### DB Schema + Migration (~2 files)

```
packages/db/src/schema/spreadsheets.ts
packages/db/migrations/NNNN_spreadsheets_module.sql
```

### API Routes (~30 files)

```
apps/web/src/app/api/v1/spreadsheets/
├── collections/
│   ├── route.ts
│   └── [id]/
│       ├── route.ts
│       ├── fields/route.ts
│       └── contact-roles/route.ts
├── records/
│   ├── route.ts
│   └── [id]/
│       ├── route.ts
│       ├── contacts/route.ts
│       └── notes/route.ts
├── contacts/
│   ├── route.ts
│   └── [id]/route.ts
├── fields/[id]/route.ts
├── contact-roles/[id]/route.ts
├── views/
│   ├── route.ts
│   └── [id]/route.ts
├── import/
│   ├── detect/route.ts
│   └── execute/route.ts
├── search/route.ts
├── chat/
│   ├── route.ts
│   ├── stream/route.ts
│   ├── confirm/route.ts
│   └── sessions/
│       ├── route.ts
│       └── [id]/route.ts
└── sync/
    ├── connect/route.ts
    ├── callback/route.ts
    └── connections/
        ├── route.ts
        └── [id]/
            ├── route.ts
            └── trigger/route.ts
```

### Frontend Pages (~16 files)

```
apps/web/src/app/(dashboard)/reports/spreadsheets/
├── page.tsx
├── layout.tsx
├── import/page.tsx
├── chat/page.tsx
├── sync/page.tsx
├── settings/
│   ├── page.tsx
│   └── collections/[id]/page.tsx
├── [collectionSlug]/
│   ├── page.tsx
│   └── [recordId]/page.tsx
```

### Frontend Components (~40 files)

```
apps/web/src/components/spreadsheets/
├── collection-content.tsx
├── record-detail-content.tsx
├── record-form-content.tsx
├── collection-sidebar.tsx
├── view-tabs.tsx
├── filter-builder.tsx
├── save-view-modal.tsx
├── global-search.tsx
├── quick-add-modal.tsx
├── command-palette.tsx
├── audit-timeline.tsx
├── fields/
│   ├── field-renderer.tsx
│   ├── field-editor.tsx
│   ├── select-field.tsx
│   └── multi-select-field.tsx
├── contacts/
│   ├── contact-role-group.tsx
│   ├── contact-card.tsx
│   └── contact-form.tsx
├── notes/
│   ├── notes-timeline.tsx
│   └── add-note-form.tsx
├── import/
│   ├── import-content.tsx
│   ├── file-upload-step.tsx
│   ├── sheet-select-step.tsx
│   ├── schema-review-step.tsx
│   ├── field-type-select.tsx
│   ├── import-progress-step.tsx
│   └── import-summary-step.tsx
├── chat/
│   ├── chat-content.tsx
│   ├── chat-message-bubble.tsx
│   ├── result-table.tsx
│   ├── contact-result-card.tsx
│   ├── confirmation-card.tsx
│   ├── suggested-prompts.tsx
│   ├── chat-input.tsx
│   └── chat-session-sidebar.tsx
├── sync/
│   ├── sync-content.tsx
│   ├── connect-sheet-modal.tsx
│   ├── column-mapper.tsx
│   ├── sync-status-badge.tsx
│   └── conflict-review.tsx
└── settings/
    ├── field-editor.tsx
    ├── contact-role-editor.tsx
    └── collection-settings.tsx
```

### Hooks (~8 files)

```
apps/web/src/hooks/
├── use-collections.ts
├── use-collection.ts
├── use-records.ts
├── use-record.ts
├── use-spreadsheet-chat.ts
├── use-views.ts
├── use-spreadsheet-search.ts
└── use-sync-connections.ts
```

### Types (~2 files)

```
apps/web/src/types/
├── spreadsheets.ts
└── spreadsheet-chat.ts
```

**Grand total: ~182 files**

---

## Appendix B — LLM Contract of Truth Prompt {#appendix-b}

See the full Contract of Truth in the architecture overview. Key rules:

1. Only reference collections/fields/roles that exist in the SCHEMA DICTIONARY
2. Custom field values stored as `custom_fields.{slug}` — use exact slugs
3. Read queries → `query_records` or `query_contacts` tool
4. Write actions → `create_record` / `update_record` / `delete_record` — always include `preview`
5. Writes always require user confirmation — never execute directly
6. Respect user's permission level (readonly blocks writes)
7. Ask clarifying questions when ambiguous
8. Tenant-scoped only — never reference cross-tenant data
9. Never fabricate data — if a query returns 0 results, say so

---

## Appendix C — CLAUDE.md Additions {#appendix-c}

Add to the modules table:

```
| Talk to Spreadsheets (dynamic collections, chat, sync) | spreadsheets | V1 | In Progress |
```

Add to monorepo structure:

```
│       ├── spreadsheets/            # @oppsera/module-spreadsheets — Talk to Spreadsheets
```

Add new convention entry:

```
NNN. **Talk to Spreadsheets uses dynamic schema, not fixed columns** — The `ss_records` table stores custom data in a JSONB `custom_fields` column. Field definitions live in `ss_field_definitions`. The LLM schema dictionary is built dynamically from these definitions at query time (cached 5-min LRU). NEVER hardcode business-specific fields in schema files. JSONB queries use `custom_fields->>'slug'` with GIN index. All `ss_*` tables have RLS policies.
```

Add new convention entry:

```
NNN+1. **Talk to Spreadsheets LLM pipeline is parallel to semantic, not nested** — The spreadsheet chat (`/api/v1/spreadsheets/chat`) is a separate pipeline from semantic insights (`/api/v1/semantic/ask`). It shares `getLLMAdapter()`, eval capture patterns, and SSE streaming conventions, but has its own intent resolver, query compiler, and tool definitions. Never import from `@oppsera/module-semantic`. The two pipelines are independent modules that happen to use the same LLM adapter infrastructure.
```

---

*Talk to Spreadsheets — Integration Build Plan*
*Module: `@oppsera/module-spreadsheets`*
*12 sessions · ~182 files · Est. 40–52 hours*
