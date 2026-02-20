# Room Layout Builder — Session Plan

## Module Overview

- **Module:** room-layouts (package: @oppsera/module-room-layouts)
- **Entitlement key:** room_layouts
- **Permission prefix:** room_layouts.*
- **Canvas engine:** Konva.js + react-konva
- **State management:** Zustand (editor state)
- **Persistence:** JSONB snapshots per version (not individual object rows)

### Existing Schema to Evolve

The current DB has simpler floor plan tables (floor_plans, floor_plan_templates, event_floor_plans) storing floor_plan_data as JSONB. These will be replaced by the new room-based system with proper versioning.

### Dependency Rule

This module depends ONLY on @oppsera/shared, @oppsera/db, @oppsera/core. No cross-module imports. Integration with events/reservations modules happens via events only.

---

## Session 1: Schema & Module Scaffold

### Goal

Create the Drizzle schema, migration, module scaffold, types, validation schemas, and event type constants for the Room Layout Builder.

### Prompt

CONTEXT: I'm building a Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first for all project conventions.

TASK: Create the Room Layout Builder module scaffold with schema, migration, types, validation, and event contracts.

MODULE: packages/modules/room-layouts/

SCHEMA (packages/db/src/schema/room-layouts.ts):

1. `floor_plan_rooms` table:
   - id (TEXT PK, ULID)
   - tenantId (TEXT NOT NULL, FK tenants)
   - locationId (TEXT NOT NULL, FK locations)
   - name (TEXT NOT NULL) — e.g., "Main Dining", "Patio", "Banquet Hall"
   - slug (TEXT NOT NULL) — URL-safe, generated from name
   - description (TEXT)
   - widthFt (NUMERIC(8,2) NOT NULL) — room width in feet
   - heightFt (NUMERIC(8,2) NOT NULL) — room height in feet
   - gridSizeFt (NUMERIC(4,2) NOT NULL DEFAULT '1.00') — snap grid size in feet
   - scalePxPerFt (INTEGER NOT NULL DEFAULT 20) — pixels per foot for rendering
   - unit (TEXT NOT NULL DEFAULT 'feet') — 'feet' | 'meters'
   - defaultMode (TEXT DEFAULT 'dining') — default room mode/layout profile
   - currentVersionId (TEXT) — FK to floor_plan_versions (nullable, set after first publish)
   - draftVersionId (TEXT) — FK to floor_plan_versions (nullable, set on first save)
   - capacity (INTEGER) — computed total capacity
   - sortOrder (INTEGER NOT NULL DEFAULT 0)
   - isActive (BOOLEAN NOT NULL DEFAULT true)
   - archivedAt (TIMESTAMPTZ)
   - archivedBy (TEXT)
   - createdAt, updatedAt, createdBy
   - UNIQUE constraint: (tenant_id, location_id, slug)
   - Index: (tenant_id, location_id, is_active)

2. `floor_plan_versions` table:
   - id (TEXT PK, ULID)
   - tenantId (TEXT NOT NULL, FK tenants)
   - roomId (TEXT NOT NULL, FK floor_plan_rooms)
   - versionNumber (INTEGER NOT NULL)
   - status (TEXT NOT NULL DEFAULT 'draft') — 'draft' | 'published' | 'archived'
   - snapshotJson (JSONB NOT NULL) — full canvas state (objects, layers, metadata)
   - objectCount (INTEGER NOT NULL DEFAULT 0) — denormalized for list display
   - totalCapacity (INTEGER NOT NULL DEFAULT 0) — computed from table seats in snapshot
   - publishedAt (TIMESTAMPTZ)
   - publishedBy (TEXT)
   - publishNote (TEXT) — optional note when publishing
   - createdAt, updatedAt, createdBy
   - UNIQUE constraint: (room_id, version_number)
   - Index: (room_id, status)

3. `floor_plan_templates` table (REPLACE existing simpler table):
   - id (TEXT PK, ULID)
   - tenantId (TEXT NOT NULL, FK tenants)
   - name (TEXT NOT NULL)
   - description (TEXT)
   - category (TEXT DEFAULT 'custom') — 'dining', 'banquet', 'bar', 'patio', 'custom'
   - snapshotJson (JSONB NOT NULL)
   - thumbnailUrl (TEXT)
   - widthFt (NUMERIC(8,2) NOT NULL)
   - heightFt (NUMERIC(8,2) NOT NULL)
   - objectCount (INTEGER NOT NULL DEFAULT 0)
   - totalCapacity (INTEGER NOT NULL DEFAULT 0)
   - isSystemTemplate (BOOLEAN NOT NULL DEFAULT false)
   - isActive (BOOLEAN NOT NULL DEFAULT true)
   - createdAt, updatedAt, createdBy
   - UNIQUE constraint: (tenant_id, name) WHERE is_active = true

MIGRATION: Create migration file that:
- Creates all 3 new tables with RLS (4 policies each: SELECT, INSERT, UPDATE, DELETE)
- Does NOT drop the old floor_plans/floor_plan_templates tables yet (backward compat)
- Adds indexes listed above

SNAPSHOT JSON SHAPE (document as TypeScript types in shared):

```typescript
interface CanvasSnapshot {
  formatVersion: 1;
  objects: CanvasObject[];
  layers: LayerInfo[];
  metadata: {
    lastEditedAt: string;
    lastEditedBy: string;
    objectCount: number;
    totalCapacity: number;
  };
}

interface CanvasObject {
  id: string;           // ULID
  type: ObjectType;     // 'table' | 'chair' | 'wall' | 'door' | 'window' | 'stage' | 'bar' | 'buffet' | 'dance_floor' | 'divider' | 'text_label' | 'decoration' | 'service_zone'
  x: number;            // position in feet
  y: number;
  width: number;        // in feet
  height: number;
  rotation: number;     // degrees
  layerId: string;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  name: string;         // display name (e.g., "Table 1", "Main Bar")
  properties: Record<string, unknown>; // type-specific properties
  style: ObjectStyle;
}

interface ObjectStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  cornerRadius?: number;
}

interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  sortOrder: number;
}

// Table-specific properties
interface TableProperties {
  tableNumber: string;
  shape: 'round' | 'square' | 'rectangle' | 'oval';
  seats: number;
  minSeats: number;
  maxSeats: number;
  status: 'available' | 'reserved' | 'occupied' | 'blocked';
  section: string;
  serverAssignment: string;
  isJoinable: boolean;
}
```

MODULE STRUCTURE:

```
packages/modules/room-layouts/
├── src/
│   ├── schema.ts           # Re-export from @oppsera/db for module use
│   ├── types.ts             # CanvasSnapshot, CanvasObject, ObjectType, etc.
│   ├── validation.ts        # Zod schemas for all inputs
│   ├── commands/
│   │   └── index.ts
│   ├── queries/
│   │   └── index.ts
│   ├── events/
│   │   ├── types.ts         # Event type constants
│   │   └── index.ts
│   ├── tests/
│   └── index.ts             # Module entry point
├── package.json             # deps: @oppsera/shared, @oppsera/db, @oppsera/core ONLY
├── tsconfig.json
└── vitest.config.ts
```

VALIDATION SCHEMAS (validation.ts):
- createRoomSchema: { name, locationId, description?, widthFt, heightFt, gridSizeFt?, scalePxPerFt?, unit?, defaultMode?, clientRequestId? }
- updateRoomSchema: { name?, description?, widthFt?, heightFt?, gridSizeFt?, scalePxPerFt?, unit?, defaultMode?, sortOrder?, clientRequestId? }
- saveDraftSchema: { snapshotJson (Zod passthrough for JSONB), clientRequestId? }
- publishVersionSchema: { publishNote?, clientRequestId? }
- createTemplateSchema: { name, description?, category?, snapshotJson, widthFt, heightFt, clientRequestId? }
- roomListFilterSchema: { locationId?, isActive?, cursor?, limit? }

EVENT TYPES (events/types.ts):
- room_layouts.room.created.v1
- room_layouts.room.updated.v1
- room_layouts.room.archived.v1
- room_layouts.version.saved.v1
- room_layouts.version.published.v1
- room_layouts.version.reverted.v1
- room_layouts.template.created.v1

SHARED TYPES: Put CanvasSnapshot, CanvasObject, ObjectType, ObjectStyle, LayerInfo, TableProperties, and all object-specific property interfaces in packages/shared/src/types/room-layouts.ts. Export from shared index.

PACKAGE.JSON for the module:

```json
{
  "name": "@oppsera/module-room-layouts",
  "version": "0.1.0",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*.ts"
  },
  "dependencies": {
    "@oppsera/shared": "workspace:*",
    "@oppsera/db": "workspace:*",
    "@oppsera/core": "workspace:*"
  },
  "devDependencies": {
    "vitest": "catalog:"
  }
}
```

Follow ALL conventions from CONVENTIONS.md:
- snake_case Postgres columns, camelCase TypeScript
- ULIDs for all IDs
- tenantId on every table
- RLS with 4 policies per table
- Drizzle pgTable definitions with proper indexes
- generateUlid $defaultFn pattern
- Export everything through module index.ts

### Deliverables

- packages/db/src/schema/room-layouts.ts — 3 Drizzle table definitions
- packages/db/migrations/NNNN_room_layouts.sql — migration with RLS
- packages/shared/src/types/room-layouts.ts — shared canvas/object types
- packages/modules/room-layouts/ — full module scaffold
- packages/modules/room-layouts/src/types.ts — module-internal types
- packages/modules/room-layouts/src/validation.ts — Zod schemas
- packages/modules/room-layouts/src/events/types.ts — event constants
- Register schema in packages/db/src/schema/index.ts
- Register module in pnpm-workspace.yaml if needed
- Add room_layouts to entitlement module keys in shared constants

### Tests

- Validation schema tests (valid/invalid inputs for each schema)

---

## Session 2: Backend Commands

### Goal

Implement all write operations (commands) for rooms, versions, and templates.

### Prompt

CONTEXT: I'm building the Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first. Session 1 created the schema, types, validation, and module scaffold in packages/modules/room-layouts/.

TASK: Implement all commands (write operations) for the room-layouts module.

COMMANDS TO IMPLEMENT (one file per command in src/commands/):

1. createRoom(ctx, input) — Create a new room
   - publishWithOutbox pattern
   - Idempotency check/save inside transaction
   - Generate slug from name (use slugify helper from shared)
   - Validate locationId exists (query locations table)
   - Check unique slug per tenant+location
   - Emit room_layouts.room.created.v1
   - Audit log after transaction

2. updateRoom(ctx, input) — Update room metadata (not canvas)
   - publishWithOutbox pattern
   - Idempotency check/save
   - Fetch existing room, validate tenant ownership
   - Regenerate slug if name changed
   - Check unique slug constraint
   - Emit room_layouts.room.updated.v1
   - Audit log with changes

3. archiveRoom(ctx, { roomId, reason }) — Soft-archive a room
   - Set archivedAt, archivedBy, archivedReason, isActive=false
   - Emit room_layouts.room.archived.v1
   - Audit log

4. unarchiveRoom(ctx, { roomId }) — Restore archived room
   - Clear archivedAt/archivedBy, set isActive=true
   - Emit room_layouts.room.restored.v1
   - Audit log

5. saveDraft(ctx, { roomId, snapshotJson }) — Save/update draft version
   - If room has no draftVersionId: create new version (versionNumber = latest + 1, status='draft')
   - If room has draftVersionId: update existing draft version's snapshotJson
   - Compute objectCount and totalCapacity from snapshot
   - Update room.draftVersionId if new
   - Emit room_layouts.version.saved.v1
   - NO idempotency (autosave calls this frequently)

6. publishVersion(ctx, { roomId, publishNote? }) — Publish current draft
   - Require room.draftVersionId exists (error if no draft)
   - Update version: status='published', publishedAt=now, publishedBy=user
   - If room has currentVersionId, set that version status='archived'
   - Update room: currentVersionId = draftVersionId, draftVersionId = null
   - Compute and update room.capacity from snapshot
   - Emit room_layouts.version.published.v1
   - Audit log

7. revertToVersion(ctx, { roomId, versionId }) — Revert to a previous published version
   - Fetch target version, validate it belongs to room and is 'archived' or 'published'
   - Create NEW draft version with snapshotJson copied from target
   - Set room.draftVersionId to new version
   - Emit room_layouts.version.reverted.v1
   - Audit log

8. createTemplate(ctx, input) — Save a layout as a reusable template
   - publishWithOutbox pattern
   - Idempotency check/save
   - Validate unique name per tenant (active only)
   - Compute objectCount, totalCapacity from snapshot
   - Emit room_layouts.template.created.v1
   - Audit log

9. updateTemplate(ctx, input) — Update template metadata
   - Standard update pattern
   - Audit log

10. deleteTemplate(ctx, { templateId }) — Soft-delete (set isActive=false)
    - Audit log

11. applyTemplate(ctx, { roomId, templateId }) — Apply template to room as new draft
    - Fetch template snapshotJson
    - Call saveDraft internally with template's snapshot
    - Audit log

12. duplicateRoom(ctx, { roomId, name, locationId? }) — Clone a room
    - Fetch source room + current published version (or draft)
    - Create new room with copied properties
    - Create new draft version with copied snapshotJson (new IDs for all objects)
    - Emit room_layouts.room.created.v1
    - Audit log

PATTERNS TO FOLLOW:
- publishWithOutbox(ctx, async (tx) => { ... }) for all state changes
- checkIdempotency/saveIdempotencyKey from @oppsera/core/helpers/ INSIDE tx
- buildEventFromContext for events
- auditLog AFTER transaction
- All commands in individual files, re-exported via commands/index.ts
- Zod validation happens in route handlers, NOT in commands
- Commands receive RequestContext as first arg

HELPER: Create src/helpers.ts with:
- computeSnapshotStats(snapshot): { objectCount, totalCapacity } — counts objects and sums table seats
- generateRoomSlug(name): string — URL-safe slug
- reassignObjectIds(snapshot): CanvasSnapshot — generates new ULIDs for all objects (for duplication)

### Deliverables

- 12 command files in src/commands/
- src/commands/index.ts barrel export
- src/helpers.ts — shared command helpers
- Updated src/index.ts with all exports

### Tests

- Command unit tests: create room (happy + duplicate slug), save draft (new + update existing), publish (happy + no draft error), revert, archive/unarchive, template CRUD, duplicate room

---

## Session 3: Backend Queries & API Routes

### Goal

Implement all read operations (queries) and REST API routes.

### Prompt

CONTEXT: I'm building the Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first. Sessions 1-2 created schema, types, validation, commands.

TASK: Implement all queries and API routes for the room-layouts module.

QUERIES TO IMPLEMENT (one file per query in src/queries/):

1. listRooms(input) — List rooms for a location
   - withTenant pattern
   - Filter: locationId (required), isActive (default true), search (name ILIKE)
   - Cursor pagination (limit+1 for hasMore)
   - Return: rooms with currentVersion stats (objectCount, totalCapacity, publishedAt)
   - Sort: sortOrder ASC, then name ASC

2. getRoom(input) — Get single room with version info
   - withTenant pattern
   - Include: current published version stats, draft version exists flag
   - Include: version history (last 10 versions with number, status, publishedAt, publishedBy)

3. getRoomForEditor(input) — Get room + draft snapshot for the editor
   - withTenant pattern
   - Return: room metadata + draft version snapshotJson (or current published if no draft)
   - This is the main data load for the editor page

4. getVersionHistory(input) — Paginated version history
   - withTenant pattern
   - Cursor pagination
   - Return: versionNumber, status, objectCount, totalCapacity, publishedAt, publishedBy, publishNote

5. getVersion(input) — Get a specific version's full snapshot
   - For version comparison or revert preview

6. listTemplates(input) — List available templates
   - withTenant pattern
   - Filter: category, search (name ILIKE), isActive=true
   - Include system templates
   - Cursor pagination

7. getTemplate(input) — Get template with full snapshot

API ROUTES (apps/web/src/app/api/v1/room-layouts/):

Route structure:

```
api/v1/room-layouts/
├── route.ts                           # GET (list), POST (create)
├── [roomId]/
│   ├── route.ts                       # GET (detail), PATCH (update), DELETE (archive)
│   ├── editor/
│   │   └── route.ts                   # GET (editor data with snapshot)
│   ├── draft/
│   │   └── route.ts                   # PUT (save draft / autosave)
│   ├── publish/
│   │   └── route.ts                   # POST (publish current draft)
│   ├── revert/
│   │   └── route.ts                   # POST (revert to version)
│   ├── duplicate/
│   │   └── route.ts                   # POST (clone room)
│   ├── versions/
│   │   └── route.ts                   # GET (version history)
│   └── versions/[versionId]/
│       └── route.ts                   # GET (specific version snapshot)
├── templates/
│   ├── route.ts                       # GET (list), POST (create)
│   └── [templateId]/
│       ├── route.ts                   # GET (detail), PATCH (update), DELETE (soft-delete)
│       └── apply/
│           └── route.ts               # POST (apply to room)
```

PERMISSIONS:
- room_layouts.view — list/get rooms, versions, templates
- room_layouts.manage — create/update/archive rooms, save/publish, templates

ENTITLEMENT: room_layouts

Each route handler:
1. withMiddleware with permission + entitlement
2. Zod validation with safeParse + ValidationError
3. Call command/query
4. Return { data } or { data, cursor, hasMore }
5. Proper HTTP status codes (200, 201, 204)

Follow ALL conventions: camelCase response keys, cursor pagination, error envelope, etc.

### Deliverables

- 7 query files in src/queries/
- ~12 route files under apps/web/src/app/api/v1/room-layouts/
- Updated module index exports

### Tests

- Query unit tests: list rooms (pagination, filters), get room, get editor data, version history
- Route-level tests are optional (covered by integration tests later)

---

## Session 4: Room List Settings Page (Frontend)

### Goal

Build the settings page where users manage rooms — list, create, edit, archive, duplicate.

### Prompt

CONTEXT: I'm building the Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first. Sessions 1-3 built the full backend. Now building the frontend.

TASK: Create the Room List settings page at /settings/room-layouts.

ROUTE: apps/web/src/app/(dashboard)/settings/room-layouts/

FILES TO CREATE:

1. page.tsx — Thin code-split wrapper (next/dynamic, ssr: false)
2. loading.tsx — Page skeleton
3. room-layouts-content.tsx — Main page content

PAGE LAYOUT:
- Page header: "Room Layouts" with "Create Room" primary button
- Location selector dropdown (from useAuthContext().locations)
- Search input (debounced, 300ms)
- DataTable with columns:
  - Name (clickable → opens editor)
  - Location (if multi-location)
  - Dimensions (e.g., "40 × 30 ft")
  - Capacity (from current published version)
  - Status (Published / Draft Only / No Layout)
  - Last Published (relative date)
  - Actions menu (Edit Layout, Edit Details, Duplicate, Archive/Restore)

DATA HOOKS (apps/web/src/hooks/use-room-layouts.ts):
- useRoomLayouts(locationId?, filters?) — list rooms with cursor pagination
- useRoom(roomId) — single room detail
- useRoomTemplates(filters?) — list templates
- useMutation pattern for create/update/archive/duplicate

DIALOGS (portal-based, same pattern as POS/catalog):
- CreateRoomDialog — form: name, description, location, width, height, grid size, unit
- EditRoomDialog — same fields, pre-filled
- DuplicateRoomDialog — name field + optional location change
- ConfirmDialog for archive/restore

TYPES (apps/web/src/types/room-layouts.ts):
- RoomRow, RoomDetail, VersionRow, TemplateRow
- Match API response shapes

SIDEBAR NAVIGATION:
- Add "Room Layouts" item under Settings section in sidebar
- Icon: LayoutDashboard from lucide-react
- moduleKey: 'room_layouts' for entitlement gating

PATTERNS:
- 'use client' on all components
- Code-split with next/dynamic + ssr: false
- Portal-based dialogs (createPortal to document.body)
- apiFetch for all API calls
- toast.success/error for feedback
- Responsive: stack on mobile, table on desktop
- Dark mode compatible (inverted gray scale, opacity-based colors)
- Follow existing settings page patterns for layout consistency

### Deliverables

- Settings page with code-split pattern (3 files)
- Data hooks file
- Frontend types file
- Create/Edit/Duplicate dialogs
- Sidebar navigation update
- Loading skeleton

### Tests

- Hook tests (mock apiFetch, verify URL construction, pagination)

---

## Session 5: Editor Shell & Zustand Store

### Goal

Build the editor page shell (toolbar, sidebar panels, canvas area) and the Zustand store that manages all editor state.

### Prompt

CONTEXT: I'm building the Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first. Session 4 built the room list page. Now building the canvas editor.

TASK: Create the editor page shell and Zustand state management store.

ROUTE: apps/web/src/app/(dashboard)/settings/room-layouts/[roomId]/editor/

INSTALL DEPENDENCIES:
- npm install zustand (if not already in web app)
- npm install konva react-konva (for next session, but install now)

EDITOR PAGE FILES:
1. page.tsx — Code-split wrapper
2. loading.tsx — Editor skeleton (toolbar bar + empty canvas area)
3. editor-content.tsx — Main editor shell

EDITOR LAYOUT (fullscreen within dashboard):

```
┌─────────────────────────────────────────────────┐
│ Toolbar (save, publish, undo, redo, zoom, tools)│
├────────┬───────────────────────────┬────────────┤
│Palette │                           │ Inspector  │
│ Panel  │      Canvas Area          │   Panel    │
│ (240px)│   (flex-1, overflow)      │  (280px)   │
│        │                           │            │
│────────│                           │────────────│
│ Layers │                           │            │
│ Panel  │                           │            │
│(collap)│                           │            │
└────────┴───────────────────────────┴────────────┘
```

ZUSTAND STORE (apps/web/src/stores/room-layout-editor.ts):

```typescript
interface EditorState {
  // Room metadata
  roomId: string | null;
  roomName: string;
  widthFt: number;
  heightFt: number;
  gridSizeFt: number;
  scalePxPerFt: number;
  unit: 'feet' | 'meters';

  // Canvas objects
  objects: CanvasObject[];
  layers: LayerInfo[];

  // Selection
  selectedIds: string[];
  hoveredId: string | null;

  // Tool state
  activeTool: 'select' | 'pan' | 'text';

  // History (undo/redo)
  history: CanvasSnapshot[];
  historyIndex: number;

  // UI state
  zoom: number;
  panOffset: { x: number; y: number };
  showGrid: boolean;
  snapToGrid: boolean;
  isPalettePanelOpen: boolean;
  isInspectorPanelOpen: boolean;
  isLayersPanelOpen: boolean;

  // Dirty tracking
  isDirty: boolean;
  lastSavedAt: string | null;
  isSaving: boolean;
  isPublishing: boolean;

  // Actions — Object CRUD
  addObject: (obj: Omit<CanvasObject, 'id'>) => void;
  updateObject: (id: string, updates: Partial<CanvasObject>) => void;
  updateObjects: (updates: Array<{ id: string; changes: Partial<CanvasObject> }>) => void;
  removeObjects: (ids: string[]) => void;

  // Actions — Selection
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Actions — Layers
  addLayer: (name: string) => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<LayerInfo>) => void;
  reorderLayers: (layerIds: string[]) => void;

  // Actions — History
  commitToHistory: () => void; // snapshot current state
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Actions — Viewport
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;

  // Actions — Initialization
  loadFromSnapshot: (snapshot: CanvasSnapshot, roomMeta: RoomMeta) => void;
  getSnapshot: () => CanvasSnapshot;

  // Actions — Persistence
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
}
```

STORE IMPLEMENTATION RULES:
- Use Zustand create() with immer middleware for immutable updates
- History: store snapshots of { objects, layers } only (not UI state)
- History max: 50 entries
- commitToHistory() is called at "commit moments" — NOT on every drag frame
- Commit moments: drop object, finish transform, delete, paste, property change
- Object CRUD actions auto-set isDirty = true
- generateUlid() for new object/layer IDs

TOOLBAR COMPONENT (apps/web/src/components/room-layouts/editor/toolbar.tsx):
- Left: Back button (← to room list), Room name (editable inline)
- Center: Undo, Redo, Separator, Zoom controls (-, percentage, +, Fit)
- Right: Grid toggle, Snap toggle, Separator, Save Draft button, Publish button
- Save shows "Saving..." spinner state, "Saved ✓" on success
- Publish opens confirmation dialog

PALETTE PANEL (apps/web/src/components/room-layouts/editor/palette-panel.tsx):
- Collapsible sidebar (240px)
- Grouped by category:
  - Tables: Round (2/4/6/8 seat), Square (2/4), Rectangle (4/6/8)
  - Seating: Chair, Booth, Bench, Barstool
  - Walls & Structure: Wall, Door, Window, Column, Divider
  - Features: Stage, Bar, Buffet, Dance Floor, Podium, Host Stand
  - Service: Service Zone, Station
  - Labels: Text Label
- Each item shows icon + name, draggable
- Drag creates ghost element, drop onto canvas adds object

INSPECTOR PANEL (apps/web/src/components/room-layouts/editor/inspector-panel.tsx):
- STUB for now (full implementation in Session 8)
- Show: "Select an object to edit properties" when nothing selected
- Show: object type + name when selected
- Placeholder for property fields

LAYERS PANEL (apps/web/src/components/room-layouts/editor/layers-panel.tsx):
- STUB for now (full implementation in Session 9)
- Show list of layers with visibility toggle
- Default layer: "Main" (always exists)

DATA LOADING:
- Editor page calls GET /api/v1/room-layouts/{roomId}/editor
- Loads snapshot into Zustand store via loadFromSnapshot()
- Shows loading skeleton while fetching

AUTOSAVE HOOK (apps/web/src/hooks/use-room-layout-autosave.ts):
- Watches isDirty flag from store
- Debounce 3 seconds after last change
- Calls PUT /api/v1/room-layouts/{roomId}/draft with getSnapshot()
- Updates lastSavedAt on success, shows toast on error
- Does NOT commit to history (autosave is transparent)

COMPONENT STRUCTURE:

```
apps/web/src/components/room-layouts/
├── editor/
│   ├── toolbar.tsx
│   ├── palette-panel.tsx
│   ├── inspector-panel.tsx (stub)
│   ├── layers-panel.tsx (stub)
│   ├── canvas-area.tsx (stub — "Canvas will render here")
│   └── editor-shell.tsx (layout composition)
├── dialogs/
│   ├── create-room-dialog.tsx (from Session 4)
│   └── publish-dialog.tsx
└── index.ts
```

PATTERNS:
- 'use client' everywhere
- Zustand store in apps/web/src/stores/
- Portal-based dialogs
- Responsive: hide palette/inspector panels below 1024px, show as floating panels
- Keyboard shortcuts: Ctrl+S (save), Ctrl+Z (undo), Ctrl+Shift+Z (redo), Ctrl+P (publish) — register in editor shell
- beforeunload warning when isDirty

### Deliverables

- Editor page (code-split, 3 files)
- Zustand store with full state management
- Toolbar, Palette Panel, Inspector stub, Layers stub, Canvas stub
- Editor shell layout component
- Autosave hook
- Publish confirmation dialog
- Keyboard shortcut registration

### Tests

- Zustand store tests: add/update/remove objects, selection, history (undo/redo), load/get snapshot, layer CRUD

---

## Session 6: Konva Canvas Core — Grid, Objects, Drag & Drop

### Goal

Implement the Konva.js canvas with grid rendering, object rendering from Zustand state, and drag-and-drop from the palette.

### Prompt

CONTEXT: I'm building the Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first. Session 5 created the editor shell and Zustand store. Now implementing the Konva canvas.

TASK: Implement the Konva canvas with grid, object rendering, and drag-and-drop from palette.

CANVAS COMPONENT (apps/web/src/components/room-layouts/editor/canvas-area.tsx):

STAGE SETUP:
- react-konva `<Stage>` fills the canvas area (flex-1)
- Use useRef for Stage reference
- Three Konva Layers (bottom to top):
  1. Grid Layer — static grid lines, cached, hitGraphEnabled(false)
  2. Objects Layer — all canvas objects
  3. UI Layer — selection box, guides, temporary overlays

GRID RENDERING (components/room-layouts/editor/canvas/grid-layer.tsx):
- Draw grid lines based on room dimensions and gridSizeFt
- Convert feet to pixels: px = ft * scalePxPerFt * zoom
- Minor grid: every gridSizeFt (light gray, 0.5px)
- Major grid: every 5 * gridSizeFt (darker gray, 1px)
- Room boundary: solid border at (0,0) to (widthFt*scale, heightFt*scale)
- Cache the layer (layer.cache()) for performance
- Invalidate cache only when zoom/dimensions change
- hitGraphEnabled(false) — grid is not interactive

OBJECT RENDERING (components/room-layouts/editor/canvas/object-renderer.tsx):
- Read objects from Zustand store
- For each object, render appropriate Konva shape based on type:
  - table (round): `<Circle>` with seat indicators around perimeter
  - table (square/rectangle): `<Rect>` with seat indicators
  - wall: `<Line>` (thick stroke)
  - door: `<Arc>` or custom `<Shape>`
  - text_label: `<Text>`
  - Generic fallback: `<Rect>` with type icon
- Each shape wrapped in `<Group>` for consistent transform handling
- React.memo each object component (props: object data)
- Objects filter by layer visibility (hide if layer.visible=false)
- Objects filter by locked state (non-interactive if locked)
- Selected objects show blue highlight border (2px)

TABLE RENDERERS (components/room-layouts/editor/canvas/objects/):
- table-node.tsx — Renders table shape + seat indicators + table number text
- wall-node.tsx — Thick line segment
- door-node.tsx — Arc indicator
- text-node.tsx — Editable text (double-click to edit)
- generic-node.tsx — Fallback rectangle with label
- service-zone-node.tsx — Semi-transparent overlay rect

OBJECT NODE PATTERN:

```tsx
const TableNode = React.memo(({ obj, isSelected }: { obj: CanvasObject; isSelected: boolean }) => {
  const updateObject = useEditorStore(s => s.updateObject);
  const commitToHistory = useEditorStore(s => s.commitToHistory);
  const scalePxPerFt = useEditorStore(s => s.scalePxPerFt);

  const px = obj.x * scalePxPerFt;
  const py = obj.y * scalePxPerFt;
  const pw = obj.width * scalePxPerFt;
  const ph = obj.height * scalePxPerFt;

  return (
    <Group
      x={px} y={py}
      rotation={obj.rotation}
      draggable={!obj.locked}
      onDragEnd={(e) => {
        // Convert back to feet, snap to grid
        const newX = snapToGrid(e.target.x() / scalePxPerFt, gridSizeFt);
        const newY = snapToGrid(e.target.y() / scalePxPerFt, gridSizeFt);
        updateObject(obj.id, { x: newX, y: newY });
        commitToHistory();
      }}
      // NO state updates on onDragMove — performance rule
    >
      {/* Table shape */}
      {/* Seat indicators */}
      {/* Table number label */}
      {/* Selection highlight if isSelected */}
    </Group>
  );
});
```

SNAP HELPER (components/room-layouts/editor/canvas/snap.ts):

```typescript
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}
```

DRAG FROM PALETTE (DnD between HTML and Konva):
- Palette items are plain HTML divs with draggable=true
- On dragStart: set dataTransfer with object type + default properties
- Canvas area has onDragOver (preventDefault) and onDrop handlers
- On drop:
  1. Get mouse position relative to Stage
  2. Convert to feet coordinates (accounting for zoom/pan)
  3. Snap to grid
  4. Create new CanvasObject with defaults for the type
  5. Call addObject() on Zustand store
  6. commitToHistory()
  7. Auto-select the new object

DEFAULT OBJECT SIZES (in feet):
- Round table (4-seat): 4ft diameter
- Round table (8-seat): 6ft diameter
- Square table (4-seat): 3×3ft
- Rectangle table (6-seat): 3×5ft
- Chair: 1.5×1.5ft
- Wall segment: 10×0.5ft
- Door: 3×0.5ft
- Stage: 20×12ft
- Bar: 15×3ft
- Buffet: 8×3ft
- Dance floor: 15×15ft
- Text label: 5×1ft
- Service zone: 10×10ft

ZOOM & PAN (components/room-layouts/editor/canvas/use-canvas-controls.ts):
- Ctrl+mousewheel: zoom (centered on pointer position)
- Zoom range: 0.1x to 3x (10% to 300%)
- Zoom formula: newZoom = oldZoom * (1 + delta * 0.001)
- Update Stage position to zoom toward pointer:

```
const pointer = stage.getPointerPosition();
const mousePointTo = { x: (pointer.x - stage.x()) / oldZoom, y: (pointer.y - stage.y()) / oldZoom };
stage.position({ x: pointer.x - mousePointTo.x * newZoom, y: pointer.y - mousePointTo.y * newZoom });
```

- Spacebar+drag: pan mode (change cursor to grab)
- Use stage.batchDraw() during zoom/pan for performance
- Update Zustand zoom/panOffset on end (not during)

PERFORMANCE RULES:
- NO state updates on onDragMove — only on onDragEnd
- Grid layer cached with hitGraphEnabled(false)
- React.memo on every object node component
- Use layer.batchDraw() for zoom/pan, not individual redraws
- Keep object count check — warn at 500+ objects

STAGE EVENT HANDLERS:
- onClick (empty area): clearSelection()
- onClick (object): setSelection([id]) or addToSelection(id) if Shift held

### Deliverables

- Canvas area component with Konva Stage + 3 layers
- Grid layer (cached, performant)
- Object renderer (dispatches to type-specific nodes)
- 6+ object node components (table, wall, door, text, generic, service zone)
- Snap helper utility
- Drag-from-palette-to-canvas flow
- Zoom/pan controls hook
- Default object size constants

### Tests

- Snap helper unit tests
- Store integration: add object via drop → verify in objects array
- Object defaults: verify each type gets correct default dimensions

---

## Session 7: Transforms, Selection & Multi-Select

### Goal

Implement Konva Transformer for resize/rotate, multi-select with marquee, snap guides, and drag bounds.

### Prompt

CONTEXT: I'm building the Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first. Session 6 built the Konva canvas with grid, objects, and basic drag-and-drop.

TASK: Implement object transforms (resize/rotate), multi-select, snap guides, and drag bounds.

TRANSFORMER (components/room-layouts/editor/canvas/transform-handler.tsx):

KONVA TRANSFORMER SETUP:
- Single `<Transformer>` instance attached to selected nodes
- On selection change: transformerRef.current.nodes(selectedNodes)
- Scale-bake pattern on transformEnd:

```tsx
onTransformEnd={(e) => {
  const node = e.target;
  const scaleX = node.scaleX();
  const scaleY = node.scaleY();

  // Bake scale into dimensions, reset scale to 1
  node.scaleX(1);
  node.scaleY(1);

  const newWidth = (node.width() * scaleX) / scalePxPerFt;
  const newHeight = (node.height() * scaleY) / scalePxPerFt;
  const newX = snapToGrid(node.x() / scalePxPerFt, gridSizeFt);
  const newY = snapToGrid(node.y() / scalePxPerFt, gridSizeFt);
  const newRotation = node.rotation();

  updateObject(obj.id, {
    x: newX, y: newY,
    width: newWidth, height: newHeight,
    rotation: newRotation
  });
  commitToHistory();
}}
```

- CRITICAL: Always bake scale → reset to 1. Never let scaleX/scaleY accumulate.
- Rotation snap: 15° increments when Shift held (rotationSnaps: [0, 15, 30, ...])
- Minimum size: 0.5ft in any dimension

MULTI-SELECT:
- Click object: select it (replace selection)
- Shift+click: toggle in/out of selection
- Marquee (rubber-band) selection:
  - Mousedown on empty canvas → start drawing rect
  - Track in UI Layer as semi-transparent blue rect
  - On mouseup: find all objects intersecting the rect → setSelection(intersectingIds)
  - Intersection check: use Konva rect intersection or manual AABB check
  - Only select visible, unlocked objects

SELECTION BOX COMPONENT (canvas/selection-box.tsx):
- Renders a dashed blue rectangle during marquee drag
- Lives on UI Layer
- Coordinates: track start point on mousedown, current point on mousemove
- On mouseup: compute selection, clear box

SNAP GUIDES (canvas/snap-guides.tsx):
- When dragging/resizing, show alignment guides to nearby objects
- Guide types: center-to-center, edge-to-edge (top, bottom, left, right)
- Snap threshold: 0.25ft (5px at default zoom)
- Visual: thin magenta lines across the full canvas extent
- Implementation:
  1. Collect all non-selected objects' edge and center points
  2. On drag: compare dragged object's edges/center to collected points
  3. If within threshold: snap to that position, draw guide line
  4. Multiple guides can show simultaneously
- Performance: pre-compute guide points on selection change, not on every frame
- Only compute during active drag (not idle)

DRAG BOUNDS:
- Objects cannot be dragged outside room boundaries
- Enforce on dragEnd (not dragMove for performance):

```
newX = Math.max(0, Math.min(newX, roomWidthFt - objWidth))
newY = Math.max(0, Math.min(newY, roomHeightFt - objHeight))
```

- Allow partial overlap with room edges (for walls/doors at room boundary)

KEYBOARD SHORTCUTS (update editor shell):
- Delete/Backspace: remove selected objects (commitToHistory)
- Ctrl+A: select all visible, unlocked objects
- Ctrl+C: copy selected to clipboard (store as JSON in component state)
- Ctrl+V: paste from clipboard (offset by 1ft from original, new IDs)
- Ctrl+D: duplicate selected (same as copy+paste)
- Escape: clear selection, cancel current operation
- Arrow keys: nudge selected objects by gridSizeFt (commit on keyup)
- Shift+Arrow: nudge by 0.1ft (fine control)

COPY/PASTE IMPLEMENTATION:
- Store copied objects in a React ref (not system clipboard — Konva objects aren't serializable to clipboard API easily)
- On paste: generate new ULIDs for all objects, offset position by (1ft, 1ft)
- On paste: auto-select pasted objects

RIGHT-CLICK CONTEXT MENU (canvas/context-menu.tsx):
- Portal-based popover at cursor position
- Options vary by selection:
  - Single object: Edit Properties, Duplicate, Lock/Unlock, Delete, Bring to Front, Send to Back
  - Multiple objects: Group (V2), Align, Distribute, Delete All
  - Empty canvas: Paste (if clipboard has content), Select All
- Close on click outside or Escape

### Deliverables

- Transformer component with scale-bake pattern
- Multi-select with shift+click and marquee
- Selection box visual component
- Snap guide system (edge + center alignment)
- Drag bounds enforcement
- Keyboard shortcuts (delete, copy, paste, duplicate, nudge, select all)
- Right-click context menu
- Updated object nodes to work with Transformer

### Tests

- Snap to grid calculations
- Drag bounds clamping
- Copy/paste: verify new IDs generated, offset applied
- Selection: shift+click toggle, marquee rect intersection

---

## Session 8: Inspector Panel — Property Editing

### Goal

Build the full Inspector Panel that shows context-sensitive property editing for selected objects.

### Prompt

CONTEXT: I'm building the Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first. Session 7 implemented transforms and selection. Now building the property inspector.

TASK: Implement the full Inspector Panel with context-sensitive property editing.

INSPECTOR PANEL (components/room-layouts/editor/inspector-panel.tsx):

LAYOUT:
- 280px right sidebar, scrollable
- Shows different content based on selection:
  - Nothing selected → Room properties
  - Single object → Object properties (type-specific)
  - Multiple objects → Common properties only

ROOM PROPERTIES (when nothing selected):
- Room name (text input)
- Dimensions: width × height (number inputs, in feet)
- Grid size (number input)
- Scale (number input)
- Unit toggle (feet/meters)
- Background color picker (optional)
- Total capacity (read-only, computed)
- Object count (read-only)

COMMON OBJECT PROPERTIES (always shown for selected objects):

Section: "Position & Size"
- X position (number, in feet)
- Y position (number, in feet)
- Width (number, in feet)
- Height (number, in feet — or Radius for circles)
- Rotation (number, degrees, with 15° increment buttons)
- Lock toggle

Section: "Appearance"
- Fill color (color picker — hex input + preset swatches)
- Stroke color
- Stroke width (number, px)
- Opacity (slider, 0-100%)
- Corner radius (number, for rectangles only)

Section: "Layer"
- Layer dropdown (select which layer object belongs to)
- Z-index (number, or "Bring Forward" / "Send Backward" buttons)

TYPE-SPECIFIC SECTIONS:

**TABLE PROPERTIES** (when type === 'table'):

Section: "Table Settings"
- Table number (text input)
- Shape (dropdown: round, square, rectangle, oval)
- Seats (number input)
- Min seats (number)
- Max seats (number)
- Section/zone (text input)
- Server assignment (text input)
- Joinable toggle (checkbox)
- Status (dropdown: available, reserved, occupied, blocked)

**WALL PROPERTIES** (when type === 'wall'):
- Thickness (number, feet)
- Material (dropdown: drywall, glass, brick, curtain)

**DOOR PROPERTIES** (when type === 'door'):
- Door type (dropdown: single, double, sliding, revolving)
- Swing direction (dropdown: left, right, both)
- Opening angle (number, degrees)

**TEXT LABEL PROPERTIES** (when type === 'text_label'):
- Text content (textarea)
- Font size (number)
- Font weight (dropdown: normal, bold)
- Text alignment (buttons: left, center, right)
- Text color (color picker)

**SERVICE ZONE PROPERTIES** (when type === 'service_zone'):
- Zone name (text input)
- Zone type (dropdown: bar_service, wait_service, self_service, kitchen_service)
- Color (pre-defined by zone type)
- Assigned staff (text input, comma-separated)

MULTI-SELECT PROPERTIES:
- Only show fields that are common to ALL selected objects
- Changes apply to ALL selected objects simultaneously
- Mixed values show placeholder "Mixed"

PROPERTY CHANGE PATTERN:

```tsx
// Each property input calls updateObject + commitToHistory on blur/enter
const handleChange = (field: string, value: unknown) => {
  if (selectedIds.length === 1) {
    updateObject(selectedIds[0], { [field]: value });
  } else {
    // Multi-select: update all
    updateObjects(selectedIds.map(id => ({ id, changes: { [field]: value } })));
  }
  commitToHistory(); // commit on change, not on every keystroke
};
```

COLOR PICKER COMPONENT (components/room-layouts/editor/color-picker.tsx):
- Hex input field
- 12 preset swatches (common colors for floor plans):
  - Tables: #8B4513 (wood), #D2B48C (light wood), #FFFFFF (white)
  - Walls: #808080 (gray), #4A4A4A (dark gray), #C4A77D (sandstone)
  - Features: #2E75B6 (blue), #548235 (green), #BF8F00 (gold)
  - Zones: rgba versions with alpha
- Opacity slider
- Click swatch to apply instantly

PROPERTY INPUT COMPONENTS:
- NumberInput: with increment/decrement buttons, step size
- AngleInput: circular drag or number input with 15° snap
- ColorInput: hex + swatch picker
- DropdownInput: styled select
- ToggleInput: switch component

PATTERNS:
- All property changes are reflected immediately (optimistic update in Zustand)
- commitToHistory() on blur/enter/dropdown change (not on every keystroke)
- Tab between fields works naturally
- Error states: show red border if value invalid (e.g., negative dimensions)

### Deliverables

- Full Inspector Panel component
- Room properties section
- Type-specific property sections (table, wall, door, text, service zone)
- Multi-select property handling
- Color picker component
- Property input components (number, angle, dropdown, toggle)
- Z-index controls (bring forward, send backward)

### Tests

- Property update flow: change value → verify store updated
- Multi-select: verify all objects updated
- Color picker: verify hex parsing, swatch selection

---

## Session 9: Layers Panel + Align/Distribute + Keyboard Shortcuts

### Goal

Build the full Layers Panel, alignment/distribution tools, and finalize all keyboard shortcuts.

### Prompt

CONTEXT: I'm building the Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first. Session 8 built the Inspector Panel. Now completing the Layers Panel and tools.

TASK: Implement Layers Panel, alignment tools, distribution tools, and finalize keyboard shortcuts.

LAYERS PANEL (components/room-layouts/editor/layers-panel.tsx):

LAYOUT:
- Below Palette Panel in left sidebar (collapsible)
- Or: toggle between Palette and Layers tabs

FEATURES:
- List all layers, sorted by sortOrder (top layer = highest z-index shown first)
- Each layer row shows:
  - Drag handle (for reorder)
  - Layer name (editable inline on double-click)
  - Eye icon toggle (visible/hidden)
  - Lock icon toggle (locked/unlocked)
  - Object count badge
- "Add Layer" button at bottom
- Default layer "Main" cannot be deleted
- Drag-to-reorder layers (update sortOrder in store)
- Right-click layer → Delete Layer (moves objects to "Main")
- Selected objects' layer is highlighted

LAYER REORDER:
- Use HTML drag-and-drop (not Konva)
- On reorder: update sortOrder values for all affected layers
- Konva renders objects sorted by layerId → layer.sortOrder → object.zIndex

LAYER VISIBILITY:
- Toggling layer visibility hides all objects on that layer
- Hidden layers: objects not rendered on canvas, not selectable
- Visual: layer row is dimmed when hidden

LAYER LOCK:
- Locked layers: objects rendered but not draggable/selectable
- Visual: lock icon filled when locked

ALIGNMENT TOOLS (components/room-layouts/editor/align-tools.tsx):
- Available when 2+ objects selected
- Shown in toolbar or as floating toolbar above selection
- Options:
  - Align Left (leftmost edge)
  - Align Center (horizontal center)
  - Align Right (rightmost edge)
  - Align Top
  - Align Middle (vertical center)
  - Align Bottom
  - Distribute Horizontally (equal spacing)
  - Distribute Vertically (equal spacing)

ALIGNMENT IMPLEMENTATION:

```typescript
function alignLeft(objects: CanvasObject[]): Partial<CanvasObject>[] {
  const minX = Math.min(...objects.map(o => o.x));
  return objects.map(o => ({ x: minX }));
}

function distributeHorizontally(objects: CanvasObject[]): Partial<CanvasObject>[] {
  const sorted = [...objects].sort((a, b) => a.x - b.x);
  const totalWidth = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width - sorted[0].x;
  const objectsWidth = sorted.reduce((sum, o) => sum + o.width, 0);
  const gap = (totalWidth - objectsWidth) / (sorted.length - 1);

  let currentX = sorted[0].x;
  return sorted.map((o, i) => {
    const result = { x: currentX };
    currentX += o.width + gap;
    return result;
  });
}
```

COMPLETE KEYBOARD SHORTCUTS (finalize all):

| Shortcut | Action |
|----------|--------|
| Ctrl+S | Save draft |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Delete / Backspace | Delete selected |
| Ctrl+A | Select all (visible, unlocked) |
| Ctrl+C | Copy selected |
| Ctrl+V | Paste |
| Ctrl+D | Duplicate selected |
| Escape | Clear selection / Cancel |
| Arrow keys | Nudge by grid size |
| Shift+Arrow | Fine nudge (0.1ft) |
| Space (hold) | Pan mode |
| Ctrl+0 | Zoom to fit |
| Ctrl+= / Ctrl+- | Zoom in/out |
| [ | Send backward |
| ] | Bring forward |
| Ctrl+[ | Send to back |
| Ctrl+] | Bring to front |
| G | Toggle grid |
| Ctrl+G | Toggle snap |

KEYBOARD SHORTCUT HANDLER:
- Register in editor shell via useEffect
- Only active when editor is focused (not when typing in inputs)
- Prevent default browser behavior for Ctrl+S, Ctrl+Z, etc.
- Check document.activeElement to skip when input/textarea focused

Z-INDEX OPERATIONS:
- Bring Forward: increment zIndex by 1 (swap with next object on same layer)
- Send Backward: decrement zIndex by 1
- Bring to Front: set zIndex to max+1 on layer
- Send to Back: set zIndex to 0, shift others up

STATUS BAR (components/room-layouts/editor/status-bar.tsx):
- Bottom bar showing:
  - Left: Object count, Selection count
  - Center: Cursor position in feet (X: 12.5ft, Y: 8.0ft)
  - Right: Zoom percentage, Grid size, Room dimensions

### Deliverables

- Full Layers Panel with reorder, visibility, lock, add/delete
- Alignment tools (6 align + 2 distribute operations)
- Complete keyboard shortcut system
- Z-index operations
- Status bar component
- Layer-aware rendering updates in canvas

### Tests

- Alignment calculations (align left, distribute horizontally)
- Z-index operations (bring forward, send to back)
- Layer visibility: verify hidden layers excluded from selection
- Keyboard shortcut registration

---

## Session 10: Persistence, Publishing & Version History

### Goal

Complete the save/publish/version workflow with autosave, manual save, publish, version history list, and revert functionality.

### Prompt

CONTEXT: I'm building the Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first. Sessions 5-9 built the complete editor. Now wiring up persistence.

TASK: Complete persistence workflow — autosave, manual save, publish, version history, and revert.

AUTOSAVE (finalize apps/web/src/hooks/use-room-layout-autosave.ts):
- Watch store.isDirty
- Debounce 3 seconds after last change
- On trigger:
  1. Set store.isSaving = true
  2. Call PUT /api/v1/room-layouts/{roomId}/draft with store.getSnapshot()
  3. On success: set isDirty=false, lastSavedAt=now, isSaving=false
  4. On error: show toast error, set isSaving=false, keep isDirty=true
  5. Retry on next change (debounce resets)
- Skip if already saving (don't stack requests)
- Skip if nothing changed since last save

MANUAL SAVE:
- Ctrl+S or Save button
- Same as autosave but immediate (no debounce)
- Show "Saved ✓" in toolbar for 2 seconds
- If autosave is in-flight, skip (dedup)

PUBLISH FLOW:
1. User clicks Publish button
2. PublishDialog opens (portal-based):
   - Shows version number (auto-incremented)
   - Optional publish note textarea
   - Warning if objects < 1 (can't publish empty layout)
   - "Publish" confirm button
3. On confirm:
   - POST /api/v1/room-layouts/{roomId}/publish { publishNote }
   - On success: toast "Version X published", update room state
   - Refresh editor data (new version = no draft, or start new draft)

VERSION HISTORY PANEL (components/room-layouts/editor/version-history.tsx):
- Opened from toolbar button (clock icon) or Ctrl+H
- Slide-in panel from right (or modal)
- Lists all versions:
  - Version number (e.g., v3)
  - Status badge (published/archived/draft)
  - Published date + who
  - Publish note
  - Object count + capacity
  - "Preview" button → loads snapshot read-only
  - "Revert" button → creates new draft from this version
- Cursor pagination with "Load More" button
- Current published version highlighted

REVERT FLOW:
1. User clicks "Revert to this version" on a history entry
2. ConfirmDialog: "This will create a new draft from Version X. Your current draft will be overwritten."
3. On confirm:
   - POST /api/v1/room-layouts/{roomId}/revert { versionId }
   - On success: reload editor with new draft snapshot
   - Toast: "Reverted to Version X"

VERSION PREVIEW (components/room-layouts/editor/version-preview.tsx):
- Read-only canvas rendering of a specific version
- Reuses canvas components but with all interactions disabled
- Overlay: "Preview: Version X — Published on [date]"
- "Close Preview" button returns to editor
- "Revert to this version" button available

UNSAVED CHANGES GUARD:
- beforeunload event: warn if isDirty
- Navigation guard: if user clicks "Back" or navigates away with isDirty:
  - Show ConfirmDialog: "You have unsaved changes. Save before leaving?"
  - Options: Save & Leave, Leave Without Saving, Cancel
  - "Save & Leave": trigger save, then navigate on success
- Works with Next.js router navigation

TOOLBAR STATE UPDATES:
- Save button: shows spinner during save, checkmark for 2s after, then back to "Save"
- Publish button: disabled if no objects, shows spinner during publish
- Undo/Redo: disabled states based on canUndo/canRedo
- Version indicator: "Draft" or "v3 (published)" in toolbar

EDITOR DATA REFRESH:
After publish or revert:
- Re-fetch GET /api/v1/room-layouts/{roomId}/editor
- Reload store via loadFromSnapshot
- Clear history (new editing session)
- Reset isDirty

PATTERNS:
- All API calls use apiFetch
- toast.success/error for user feedback
- Portal-based dialogs
- Optimistic UI where safe (save indicator)

### Deliverables

- Finalized autosave hook with debounce, dedup, error handling
- Manual save integration
- Publish dialog and flow
- Version history panel with pagination
- Revert flow with confirmation
- Version preview (read-only canvas)
- Unsaved changes guard (beforeunload + navigation)
- Toolbar state management (save indicator, button states)

### Tests

- Autosave: verify debounce timing, dedup, error retry
- Publish flow: verify API call, state reset
- Version history: verify pagination, revert creates new draft

---

## Session 11: Templates & Room Duplication

### Goal

Build the template management UI — save as template, apply template, browse template gallery, and room duplication.

### Prompt

CONTEXT: I'm building the Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first. Session 10 completed persistence. Now building templates.

TASK: Implement template management UI and room duplication flows.

TEMPLATE GALLERY (components/room-layouts/templates/):

SAVE AS TEMPLATE (from editor toolbar or room list action menu):
- "Save as Template" button in toolbar overflow menu
- Opens SaveAsTemplateDialog:
  - Name (text, required, pre-filled with room name)
  - Description (textarea, optional)
  - Category (dropdown: dining, banquet, bar, patio, custom)
  - Preview: shows current canvas snapshot as thumbnail
- Calls POST /api/v1/room-layouts/templates with current snapshot
- Toast on success

TEMPLATE GALLERY DIALOG (components/room-layouts/templates/template-gallery.tsx):
- Opened from "New Room from Template" option in Create Room dialog
- Or: standalone route /settings/room-layouts/templates
- Grid of template cards:
  - Template name
  - Category badge
  - Dimensions (W × H ft)
  - Capacity
  - Object count
  - System template indicator (if applicable)
- Filter by category (tabs or dropdown)
- Search by name
- Click template → preview (read-only mini canvas)
- "Use Template" button → apply to new/existing room

APPLY TEMPLATE TO NEW ROOM:
1. User clicks "Create Room" → selects "From Template" tab
2. Template Gallery shown
3. Select template → fill in room name + location
4. Creates room + applies template as initial draft
5. Opens editor

APPLY TEMPLATE TO EXISTING ROOM:
1. From editor: toolbar → "Apply Template" (replaces current draft)
2. Confirm: "This will replace your current draft with the template layout."
3. Calls POST /api/v1/room-layouts/{roomId}/templates/{templateId}/apply
4. Reloads editor with template snapshot

TEMPLATE MANAGEMENT (sub-page or section in room layouts settings):
- List of custom templates (not system templates)
- DataTable: name, category, dimensions, capacity, created date
- Actions: Preview, Edit Details, Delete
- EditTemplateDialog: name, description, category
- Delete: soft-delete (isActive=false)

ROOM DUPLICATION (from room list):
- "Duplicate" action in room row action menu
- Opens DuplicateRoomDialog:
  - New name (pre-filled with "Copy of {original}")
  - Location (dropdown, defaults to same location)
  - Include: checkbox for "Include current published layout"
- Calls POST /api/v1/room-layouts/{roomId}/duplicate
- On success: navigate to new room's editor

UPDATE CREATE ROOM DIALOG:
- Two tabs: "Blank Room" and "From Template"
- Blank Room: original form (name, dimensions, etc.)
- From Template: template gallery → then name/location fields
- Location selection in both tabs

TEMPLATE THUMBNAIL (components/room-layouts/templates/template-thumbnail.tsx):
- Mini canvas renderer (200×150px or similar)
- Renders snapshot objects in miniature
- No interaction (static preview)
- Used in gallery cards and preview modal
- Either: tiny Konva stage, or SVG rendering, or pre-rendered image

PATTERNS:
- Reuse canvas components in read-only mode for previews
- Portal-based dialogs
- apiFetch for all API calls
- Cursor pagination for template list
- Category filtering via query param

### Deliverables

- Save as Template dialog
- Template Gallery (grid with filters, search, preview)
- Apply template to new room flow
- Apply template to existing room flow
- Template management (list, edit, delete)
- Room duplication dialog and flow
- Template thumbnail component
- Updated Create Room dialog with template tab

### Tests

- Template CRUD hooks
- Duplicate room: verify new IDs generated for all objects

---

## Session 12: Service Zones, Room Modes & Golf Add-ons

### Goal

Implement golf-specific features: service zones, station markers, room mode profiles (dining/events/private), and layout switching.

### Prompt

CONTEXT: I'm building the Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first. Sessions 1-11 built the complete Room Layout Builder. Now adding golf-specific features.

TASK: Implement service zones, room modes, and golf-specific add-ons.

SERVICE ZONES:
- Service zones are semi-transparent overlay rectangles on the canvas
- Each zone represents a service area (bar area, wait area, etc.)
- Zone types: bar_service, wait_service, self_service, kitchen_service, valet, coat_check
- Color-coded by type (predefined colors with opacity)
- Zones live on a dedicated "Service Zones" layer (auto-created)
- Objects (tables/chairs) inside a zone inherit the zone's service type
- Zone inspector shows: zone name, type, assigned staff, tables in zone count

SERVICE ZONE RENDERING:
- Rendered as `<Rect>` with low opacity fill (0.15) and dashed border
- Label in top-left corner with zone name
- Zone type icon in corner
- Tables inside zone: determined by center-point containment check
- Zone assignment: computed, not stored per-table (derived from spatial overlap)

STATION MARKERS:
- Small circle markers representing service stations (POS terminals, wait stations, bus stations)
- Station types: pos_terminal, wait_station, bus_station, host_stand, bar_station
- Each station shows an icon and label
- Stations are draggable like other objects
- Station inspector: name, type, terminal assignment

ROOM MODES / LAYOUT PROFILES:
- A room can have multiple layout profiles (e.g., "Lunch", "Dinner", "Event", "Private Party")
- Each mode stores a separate snapshot (different table arrangements)
- Implementation: mode is a version tag, NOT a separate version
  - Add `mode` TEXT column to floor_plan_versions (nullable, default null)
  - Multiple published versions can exist with different mode values
  - Room.defaultMode determines which layout shows by default

SCHEMA UPDATES:
- Add `mode` TEXT column to floor_plan_versions (migration)
- Update UNIQUE constraint: (room_id, version_number) stays; add index on (room_id, mode, status)
- Update room.defaultMode to reference a mode name

MODE MANAGEMENT UI:
- Mode selector dropdown in editor toolbar (next to room name)
- "Manage Modes" opens ModeManagerDialog:
  - List of modes with layout status (has published layout / draft / empty)
  - Add new mode
  - Delete mode (archives its versions)
  - Set default mode
- Switching modes loads that mode's latest draft/published version
- Each mode's layout is independently editable and publishable

MODE WORKFLOW:
1. Create room → default mode "dining" created
2. Build layout → publish for "dining" mode
3. Add "event" mode → starts with blank canvas (or "Copy from dining" option)
4. Build event layout → publish for "event" mode
5. Downstream systems (reservations, events) can request specific mode layout

UPDATED COMMANDS:
- saveDraft: accept optional `mode` parameter
- publishVersion: accept optional `mode` parameter
- createMode(ctx, { roomId, modeName, copyFrom? }): create new mode, optionally copy layout
- deleteMode(ctx, { roomId, modeName }): archive mode's versions
- setDefaultMode(ctx, { roomId, modeName })

UPDATED QUERIES:
- getRoomForEditor: accept optional `mode` parameter, return mode-specific snapshot
- getRoom: include list of available modes with status

UPDATED API ROUTES:
- PUT /api/v1/room-layouts/{roomId}/draft?mode=event
- POST /api/v1/room-layouts/{roomId}/publish?mode=event
- POST /api/v1/room-layouts/{roomId}/modes (create mode)
- DELETE /api/v1/room-layouts/{roomId}/modes/{modeName}
- PATCH /api/v1/room-layouts/{roomId}/modes/default (set default)

PALETTE UPDATES:
- Add "Service" category to palette:
  - Service Zone (drag to create zone area)
  - POS Terminal marker
  - Wait Station marker
  - Bus Station marker
  - Host Stand marker
  - Bar Station marker

READ-ONLY FLOOR PLAN VIEWER (components/room-layouts/floor-plan-viewer.tsx):
- Reusable component for displaying a published layout
- Props: roomId, mode?, showCapacity?, showZones?, interactive?
- Renders Konva stage in read-only mode
- Hover over table → tooltip with table number, seats, server
- Hover over zone → tooltip with zone name, type
- Used by: event module (future), reservation module (future), capacity planning
- Export as standalone component for embedding in other pages

### Deliverables

- Service zone rendering + inspector properties
- Station marker objects (5 types)
- Room mode system (schema update, migration, commands, queries, API routes)
- Mode management UI (selector, dialog)
- Mode-aware editor (load/save/publish per mode)
- Palette updates with service category
- Read-only floor plan viewer component

### Tests

- Service zone containment check (which tables are in zone)
- Mode CRUD commands
- Read-only viewer renders correctly

---

## Session 13: Integration, Polish & Comprehensive Tests

### Goal

Final polish — integration points, export, comprehensive test suite, and validation.

### Prompt

CONTEXT: I'm building the Room Layout Builder module for OppsEra. Read CLAUDE.md and CONVENTIONS.md first. Sessions 1-12 built the complete Room Layout Builder with all features.

TASK: Final integration, polish, and comprehensive test coverage.

INTEGRATION POINTS:

1. ENTITLEMENT REGISTRATION:
   - Add 'room_layouts' to module registry in @oppsera/shared
   - Add room_layouts entitlement to onboarding provisioning (golf + restaurant + hybrid business types)
   - Update onboarding wizard module selection to include Room Layouts option

2. PERMISSION SEEDING:
   - Add permissions to role seeds:
     - Owner/Manager: room_layouts.view, room_layouts.manage
     - Supervisor: room_layouts.view, room_layouts.manage
     - Cashier/Server/Staff: room_layouts.view (read-only)

3. SIDEBAR NAVIGATION (verify):
   - "Room Layouts" under Settings section
   - Icon: LayoutDashboard
   - Gated by 'room_layouts' entitlement
   - Active state on /settings/room-layouts/*

4. SETTINGS PAGE INTEGRATION:
   - Room Layouts appears in Settings page grid (if settings has a grid/overview)
   - Or: direct sidebar link to /settings/room-layouts

5. EVENT CONSUMERS (stubs for future modules):
   - Document which events room-layouts emits for future consumption:
     - room_layouts.version.published.v1 → reservations module (refresh floor plan)
     - room_layouts.room.archived.v1 → events module (warn about missing floor plan)
   - No consumers to build now — just document the contracts

6. EXPORT FUNCTIONALITY:
   - "Export as PNG" toolbar button:
     - Use Konva stage.toDataURL() to generate PNG
     - Download via browser (create link + click pattern)
     - Include room name in filename
   - "Export as JSON" toolbar button:
     - Download current snapshot as JSON file
     - Useful for backup/transfer

VALIDATION & ERROR HANDLING:

1. ROOM VALIDATION:
   - Name: 1-100 chars, required
   - Dimensions: 5-500 ft each, required
   - Grid size: 0.25-10 ft
   - Scale: 5-100 px/ft

2. OBJECT VALIDATION (in snapshot):
   - All objects must have valid type
   - Position must be within room bounds (warn, don't block)
   - Tables must have seats >= 1
   - No duplicate object IDs within snapshot

3. PUBLISH VALIDATION:
   - Must have at least 1 object
   - All tables should have table numbers (warn)
   - No overlapping tables (warn)
   - Total capacity > 0

4. ERROR BOUNDARIES:
   - Wrap Konva Stage in React error boundary
   - On canvas crash: show "Something went wrong" with "Reload Editor" button
   - Preserve snapshot in Zustand (not lost on UI crash)

PERFORMANCE VERIFICATION:
- Test with 500 objects: confirm smooth drag/zoom
- Verify grid layer is cached (not redrawn per frame)
- Verify object nodes use React.memo (no unnecessary re-renders)
- Verify history doesn't grow unbounded (max 50 entries)

ACCESSIBILITY:
- Toolbar buttons have aria-labels
- Keyboard navigation works for all panels
- Screen reader: announce object selection changes
- High contrast mode: objects should be visible

COMPREHENSIVE TESTS:

Backend (packages/modules/room-layouts/src/__tests__/):

1. room-commands.test.ts:
   - createRoom: happy path, duplicate slug, missing location
   - updateRoom: happy, not found, concurrent slug conflict
   - archiveRoom + unarchiveRoom
   - saveDraft: new draft creation, existing draft update
   - publishVersion: happy, no draft error, version numbering
   - revertToVersion: happy, version not found
   - duplicateRoom: new IDs, different location

2. room-queries.test.ts:
   - listRooms: pagination, location filter, search, active filter
   - getRoom: with version history
   - getRoomForEditor: draft vs published fallback
   - getVersionHistory: pagination, ordering

3. template-commands.test.ts:
   - createTemplate, updateTemplate, deleteTemplate
   - applyTemplate

4. helpers.test.ts:
   - computeSnapshotStats: count objects, sum capacity
   - generateRoomSlug: special chars, duplicates
   - reassignObjectIds: verify all new IDs, no duplicates

Frontend (apps/web/src/__tests__/):

5. room-layout-editor-store.test.ts:
   - Object CRUD (add, update, remove)
   - Selection (single, multi, clear, select all)
   - History (undo, redo, max limit, commit moments)
   - Layer CRUD (add, remove, reorder, visibility, lock)
   - Zoom/pan state
   - Load/get snapshot roundtrip
   - isDirty tracking

6. room-layouts-hooks.test.ts:
   - useRoomLayouts: pagination, filters
   - useRoom: detail fetch
   - useRoomTemplates: list, search

7. canvas-utils.test.ts:
   - snapToGrid calculations
   - Alignment functions (align left, center, right, etc.)
   - Distribution functions
   - Drag bounds clamping
   - Object default dimensions

MIGRATION CHECKLIST:
- [ ] Migration file numbered correctly (follows last migration)
- [ ] RLS policies on all 3 tables (12 policies total)
- [ ] Indexes for common queries
- [ ] mode column migration (Session 12 schema update)

DOCUMENTATION:
- Add Room Layouts module to CLAUDE.md "What's Built" section
- Update CONVENTIONS.md "Current Project State" with new milestone
- Update test count

TARGET TEST COUNT: ~60-80 new tests across backend + frontend

### Deliverables

- Entitlement + permission registration
- Sidebar navigation integration
- Export (PNG + JSON)
- Validation rules (room, objects, publish)
- Error boundary for canvas
- Complete test suite (7 test files, 60-80 tests)
- CLAUDE.md and CONVENTIONS.md updates

### Tests

- Full backend command + query coverage
- Store tests
- Canvas utility tests
- Hook tests

---

## Appendix A: Session Dependencies

```
Session 1  (Schema + Scaffold)
    ↓
Session 2  (Commands)
    ↓
Session 3  (Queries + API Routes)
    ↓
Session 4  (Room List Page)         ← can start after Session 3
    ↓
Session 5  (Editor Shell + Store)
    ↓
Session 6  (Konva Canvas Core)
    ↓
Session 7  (Transforms + Selection)
    ↓
Session 8  (Inspector Panel)
    ↓
Session 9  (Layers + Shortcuts)
    ↓
Session 10 (Persistence + Publish)
    ↓
Session 11 (Templates)             ← can start after Session 10
    ↓
Session 12 (Service Zones + Modes) ← can start after Session 10
    ↓
Session 13 (Integration + Tests)   ← must be last
```

## Appendix B: File Inventory (Expected)

### Backend

```
packages/db/src/schema/room-layouts.ts
packages/db/migrations/NNNN_room_layouts.sql
packages/db/migrations/NNNN_room_layout_modes.sql
packages/shared/src/types/room-layouts.ts
packages/modules/room-layouts/
├── src/
│   ├── schema.ts
│   ├── types.ts
│   ├── validation.ts
│   ├── helpers.ts
│   ├── commands/
│   │   ├── index.ts
│   │   ├── create-room.ts
│   │   ├── update-room.ts
│   │   ├── archive-room.ts
│   │   ├── unarchive-room.ts
│   │   ├── save-draft.ts
│   │   ├── publish-version.ts
│   │   ├── revert-to-version.ts
│   │   ├── create-template.ts
│   │   ├── update-template.ts
│   │   ├── delete-template.ts
│   │   ├── apply-template.ts
│   │   ├── duplicate-room.ts
│   │   ├── create-mode.ts
│   │   ├── delete-mode.ts
│   │   └── set-default-mode.ts
│   ├── queries/
│   │   ├── index.ts
│   │   ├── list-rooms.ts
│   │   ├── get-room.ts
│   │   ├── get-room-for-editor.ts
│   │   ├── get-version-history.ts
│   │   ├── get-version.ts
│   │   ├── list-templates.ts
│   │   └── get-template.ts
│   ├── events/
│   │   ├── types.ts
│   │   └── index.ts
│   ├── __tests__/
│   │   ├── room-commands.test.ts
│   │   ├── room-queries.test.ts
│   │   ├── template-commands.test.ts
│   │   └── helpers.test.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### API Routes

```
apps/web/src/app/api/v1/room-layouts/
├── route.ts
├── [roomId]/
│   ├── route.ts
│   ├── editor/route.ts
│   ├── draft/route.ts
│   ├── publish/route.ts
│   ├── revert/route.ts
│   ├── duplicate/route.ts
│   ├── versions/route.ts
│   ├── versions/[versionId]/route.ts
│   └── modes/
│       ├── route.ts
│       └── default/route.ts
└── templates/
    ├── route.ts
    ├── [templateId]/
    │   ├── route.ts
    │   └── apply/route.ts
```

### Frontend

```
apps/web/src/app/(dashboard)/settings/room-layouts/
├── page.tsx
├── loading.tsx
├── room-layouts-content.tsx
├── templates/page.tsx
└── [roomId]/
    └── editor/
        ├── page.tsx
        ├── loading.tsx
        └── editor-content.tsx

apps/web/src/components/room-layouts/
├── editor/
│   ├── editor-shell.tsx
│   ├── toolbar.tsx
│   ├── palette-panel.tsx
│   ├── inspector-panel.tsx
│   ├── layers-panel.tsx
│   ├── canvas-area.tsx
│   ├── status-bar.tsx
│   ├── version-history.tsx
│   ├── version-preview.tsx
│   ├── align-tools.tsx
│   ├── color-picker.tsx
│   ├── canvas/
│   │   ├── grid-layer.tsx
│   │   ├── object-renderer.tsx
│   │   ├── transform-handler.tsx
│   │   ├── selection-box.tsx
│   │   ├── snap-guides.tsx
│   │   ├── context-menu.tsx
│   │   ├── snap.ts
│   │   ├── use-canvas-controls.ts
│   │   └── objects/
│   │       ├── table-node.tsx
│   │       ├── wall-node.tsx
│   │       ├── door-node.tsx
│   │       ├── text-node.tsx
│   │       ├── generic-node.tsx
│   │       ├── service-zone-node.tsx
│   │       └── station-node.tsx
│   └── mode-manager.tsx
├── templates/
│   ├── template-gallery.tsx
│   ├── template-thumbnail.tsx
│   └── save-as-template-dialog.tsx
├── dialogs/
│   ├── create-room-dialog.tsx
│   ├── edit-room-dialog.tsx
│   ├── duplicate-room-dialog.tsx
│   └── publish-dialog.tsx
├── floor-plan-viewer.tsx
└── index.ts

apps/web/src/stores/room-layout-editor.ts
apps/web/src/hooks/use-room-layouts.ts
apps/web/src/hooks/use-room-layout-autosave.ts
apps/web/src/types/room-layouts.ts

apps/web/src/__tests__/
├── room-layout-editor-store.test.ts
├── room-layouts-hooks.test.ts
└── canvas-utils.test.ts
```

## Appendix C: Permission Matrix

| Role | room_layouts.view | room_layouts.manage |
|------|-------------------|---------------------|
| Owner | ✓ | ✓ |
| Manager | ✓ | ✓ |
| Supervisor | ✓ | ✓ |
| Cashier | ✓ | |
| Server | ✓ | |
| Staff | ✓ | |

## Appendix D: Event Contracts

| Event | Payload | Consumers |
|-------|---------|-----------|
| room_layouts.room.created.v1 | { roomId, locationId, name, widthFt, heightFt } | — |
| room_layouts.room.updated.v1 | { roomId, changes } | — |
| room_layouts.room.archived.v1 | { roomId, locationId, reason } | events (future) |
| room_layouts.room.restored.v1 | { roomId } | — |
| room_layouts.version.saved.v1 | { roomId, versionId, objectCount } | — |
| room_layouts.version.published.v1 | { roomId, versionId, versionNumber, capacity, mode } | reservations (future) |
| room_layouts.version.reverted.v1 | { roomId, fromVersionId, toVersionId } | — |
| room_layouts.template.created.v1 | { templateId, name, category } | — |
