# Import Widget Improvements — Session Summary & Reusable Prompt

## Changes Applied to Staff Import (2026-02-24)

### 1. Dark Mode Font Fix
**Problem**: `<select>` elements and text were invisible in dark mode — backgrounds were dark (`dark:bg-gray-700`) but text defaulted to black.

**Files changed**:
- `apps/web/src/components/import/staff/MappingStep.tsx` — Added `text-gray-900 dark:text-gray-100` to all `<select>` elements
- `apps/web/src/components/import/staff/ValueMappingStep.tsx` — Added `text-gray-900 dark:text-gray-100` to all `<select>` elements
- `apps/web/src/components/import/FileUploadZone.tsx` — Added dark mode text colors to file name, instructions, and "browse" link

**Rule**: Every `<select>` with a dark background class MUST have explicit `text-gray-900 dark:text-gray-100`. Also check `<input>`, file names, instruction text, and interactive links.

### 2. Intelligent Auto-Mapping (Role/Location Fuzzy Matching)
**Problem**: Value mapping screen showed all roles/locations as "Not mapped" — only exact name matches worked.

**Solution**: Three-tier intelligent matching system added to the hook:
1. **Exact match** (95% confidence) — role name matches exactly
2. **Keyword-based matching** (70-85% confidence) — a curated keyword map translates common legacy role names to system roles (e.g., "Super Administrator" → Owner, "Course Ranger User" → Staff)
3. **Token overlap** (up to 65% confidence) — splits both strings into tokens and computes overlap score

**Files changed**:
- `apps/web/src/hooks/use-staff-import.ts` — Added `ROLE_KEYWORD_MAP`, `matchLegacyRole()`, `matchLegacyLocation()` functions; updated `buildInitialValueMappings` to use them; auto-set default role to lowest-privilege

### 3. Error/Skip Awareness UX
**Problem**: Users had no visibility into which rows would be skipped, and no confirmation before importing with skipped rows.

**Solution**:
- **ValueMappingStep**: Red warning banner when unmapped roles/locations exist with no default fallback
- **PreviewStep**: Persistent yellow banner showing skip count; inline confirmation prompt with required checkbox acknowledgment before allowing "Proceed with Import"

**Files changed**:
- `apps/web/src/components/import/staff/ValueMappingStep.tsx` — Added warning banner section
- `apps/web/src/components/import/staff/PreviewStep.tsx` — Added skip banner, confirmation prompt with checkbox gate

### 4. Per-Row Error Resilience (Savepoints)
**Problem**: A single DB error (e.g., `duplicate key value violates unique constraint "uq_users_tenant_email"`) aborted the ENTIRE import because all rows ran in one Postgres transaction.

**Solution**: PostgreSQL savepoints around each row — when one row fails, the savepoint rolls back just that row and the rest continue.

**Files changed**:
- `packages/core/src/import/staff-import-executor.ts` — Added `SAVEPOINT`/`RELEASE SAVEPOINT`/`ROLLBACK TO SAVEPOINT` per row; added `formatDbError()` for user-friendly error messages; tracks `createdUserIds` for rollback
- `packages/core/src/import/staff-import-types.ts` — Added `createdUserIds?: string[]` to `StaffImportResult`
- `apps/web/src/app/api/v1/import/staff/execute/route.ts` — Job status now `complete_with_errors` when partial

### 5. Inline Results with Rollback & Go-Back Options
**Problem**: After import with errors, user had no way to undo or go back — only "Import Another File".

**Solution**: ResultsStep now shows inline action cards (NOT popups/modals):
- **"Go Back & Fix"** — returns to preview step with validation data intact
- **"Roll Back Import"** — deletes all newly created users via rollback API endpoint

**Files changed**:
- `apps/web/src/components/import/staff/ResultsStep.tsx` — Added `onGoBack`, `onRollback`, `isRollingBack` props; inline action card UI
- `apps/web/src/hooks/use-staff-import.ts` — Added `goBackFromResults()` and `rollbackImport()` actions
- `apps/web/src/app/(dashboard)/settings/import/staff/staff-import-content.tsx` — Wired new props
- `apps/web/src/app/api/v1/import/staff/rollback/route.ts` — NEW: rollback endpoint using parameterized SQL

---

## Reusable Claude Prompt

Copy the prompt below and give it to Claude along with the specific import widget you want to improve.

---

```
You are improving an import wizard in the OppsEra codebase. Apply the following 5 improvements that were successfully implemented on the Staff Import wizard. Read each relevant file before making changes.

## 1. Dark Mode Font Fix
Audit ALL `<select>`, `<input>`, and text elements in the import wizard components. Any element with a dark background (`dark:bg-gray-700`, `dark:bg-gray-800`, etc.) MUST have explicit text color: `text-gray-900 dark:text-gray-100`. Also check:
- File names displayed after upload
- Instruction/helper text
- Interactive links (add `dark:text-indigo-400` for links)
- Status badges and labels

## 2. Intelligent Auto-Mapping
If the wizard has a value mapping step (mapping legacy values to OppsEra values), add a three-tier intelligent matching system to the hook that builds initial mappings:

1. **Exact match** (95% confidence) — case-insensitive exact name match
2. **Keyword-based matching** (70-85% confidence) — create a curated `KEYWORD_MAP` array that maps common legacy names/patterns to system values. Order by specificity (most specific first). Include industry-standard terms for the entity type.
3. **Token overlap** (up to 65% confidence) — split both strings into tokens, compute overlap ratio, require >0.3 threshold

Also auto-set sensible defaults (e.g., default to lowest-privilege role, default to primary location).

## 3. Error/Skip Awareness UX
Add two warning mechanisms:

**On the mapping/values step**: If there are unmapped values AND no default fallback is set, show a red warning banner at the top:
```tsx
<div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3">
  <AlertTriangle /> Some rows will be skipped during import
  {/* Detail which values are unmapped and how to fix */}
</div>
```

**On the preview/confirmation step**:
- Persistent yellow notice showing how many rows will be skipped
- When user clicks Import and there are skipped rows, show an inline confirmation prompt with:
  - Summary of what will be skipped and why
  - Required checkbox: "I understand that X rows will be skipped"
  - Cancel and "Proceed with Import" buttons (Import disabled until checkbox checked)

## 4. Per-Row Error Resilience (Savepoints)
In the executor that runs inside `withTenant`, wrap each row's operations in a PostgreSQL savepoint:

```typescript
const sp = `sp_row_${row.rowNumber}`;
try {
  await tx.execute(sql.raw(`SAVEPOINT ${sp}`));
  // ... create/update operations ...
  await tx.execute(sql.raw(`RELEASE SAVEPOINT ${sp}`));
} catch (err) {
  try { await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${sp}`)); } catch { /* ignore */ }
  errorCount++;
  errors.push({ rowNumber: row.rowNumber, message: formatDbError(msg) });
}
```

Add a `formatDbError()` function that converts common Postgres errors to user-friendly messages:
- `duplicate key` → "A record with this [field] already exists"
- `violates foreign key` → "Invalid reference ([entity] does not exist)"
- `violates not-null` → "A required field is missing"

Track created entity IDs in a `createdIds: string[]` array for rollback support.

## 5. Inline Results with Rollback & Go-Back
Update the Results/Summary step component to show inline action cards when there are errors:

- **"Go Back & Fix"** card — navigates back to preview/mapping step with data intact
- **"Roll Back Import"** card — calls a rollback API endpoint that deletes created records

These MUST be inline on the page (card-style buttons with icon + title + description), NOT popups or modals.

Add to the hook:
- `goBackFromResults()` — sets step back to preview, clears result but keeps validation data
- `rollbackImport()` — POSTs to rollback endpoint with jobId and createdIds

Create a rollback API route that:
1. Verifies the job belongs to the tenant
2. Deletes created records using parameterized SQL (NEVER raw string interpolation)
3. Marks the job status as `rolled_back`

## Important Conventions
- Use `sql` template literals for ALL SQL (never raw string interpolation for user data)
- All inline options/actions must be on-page, never popups/modals/prompts
- Follow existing dark mode pattern: `bg-surface` or explicit `dark:` prefixed classes
- Use lucide-react icons consistently
- Maintain the existing wizard step flow pattern
```

---

## Import Widgets That Need These Improvements

| Widget | Hook | Components | Executor |
|--------|------|------------|----------|
| Inventory Import | `use-inventory-import.ts` | `apps/web/src/components/import/` (shared) | `catalog/src/commands/import-inventory.ts` |
| Customer Import | `use-customer-import.ts` | `apps/web/src/components/import/` (shared) | `customers/src/commands/bulk-import-customers.ts` |
| COA Import | — (inline in accounting) | `apps/web/src/components/accounting/csv-import-flow.tsx` | `accounting/src/commands/import-coa-from-csv.ts` |
| Generic Import Jobs | `use-import-wizard.ts` | `apps/web/src/components/import/ImportWizardShell.tsx` | `import/src/commands/execute-import.ts` |
