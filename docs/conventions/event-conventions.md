# Event Conventions

> Rules for domain events: naming, versioning, payloads, idempotency, and consumer registration. Referenced from ADR-002.

## Event Naming

Format: `{domain}.{entity}.{action}.v{N}`

| Part | Rule | Examples |
|---|---|---|
| domain | Lowercase module name or subdomain | `order`, `catalog`, `pms`, `fnb`, `spa`, `tender` |
| entity | Singular noun — the thing that changed | `item`, `reservation`, `tab`, `appointment` |
| action | Past tense verb — what happened | `created`, `placed`, `voided`, `checked_in` |
| version | Integer, starts at 1 | `v1`, `v2` |

Examples:
```
order.placed.v1
catalog.item.created.v1
pms.reservation.checked_in.v1
fnb.course.sent.v1
tender.recorded.v1
spa.appointment.completed.v1
```

Compound actions use underscores: `checked_in`, `no_show`, `tip_adjusted`.

## Versioning

- **v1** is the initial schema. Every event starts at v1.
- **Bump the version** when you make a breaking change to the payload shape (removing a field, changing a field's type, renaming a field).
- **Don't bump** for additive changes (new optional fields). Consumers should tolerate unknown fields.
- **Old and new versions can coexist**: consumers register for the version they understand. The outbox stores the version in the event name.
- **Deprecation**: when a version is no longer published, remove its consumers in a follow-up PR. Don't leave dead consumer registrations.

## Payload Expectations

Event payloads must be **self-sufficient** — consumers should not need to query the source module to act on the event.

Required fields in every payload:
- `tenantId` (from EventEnvelope, not payload)
- `locationId` (from EventEnvelope when applicable)
- `occurredAt` (from EventEnvelope)

Self-sufficiency checklist:
- Include all IDs the consumer needs (e.g., `customerId`, `lines[]` with `catalogItemId`, `subDepartmentId`)
- Include denormalized names/labels if consumers need them for read models
- Include monetary amounts in the correct unit (cents for order-layer, dollars for GL-layer)
- Do NOT include the full entity — include the fields the event represents, not a database row dump

Example — good:
```typescript
// order.placed.v1
{
  orderId: string;
  customerId: string | null;
  lines: Array<{
    catalogItemId: string;
    catalogItemName: string;
    qty: number;
    unitPriceCents: number;
    subDepartmentId: string | null;
  }>;
  totalCents: number;
}
```

Example — bad (requires consumer to query orders module):
```typescript
// DON'T: consumer has to look up the order to get lines
{ orderId: string; }
```

## Schema Ownership

The **publishing module** owns the event schema. Consumers adapt to the publisher's schema, not the other way around.

- Event types/schemas should be defined in the publishing module or in `@oppsera/shared` if multiple modules need to reference the type
- If a consumer needs a different shape, it transforms the payload in its handler or in the registration adapter (see `instrumentation.ts` inline lambdas)
- Consumers must not request changes to the event schema for their convenience — if they need extra data, propose it as an additive change to the publisher

## Idempotency

Every consumer **must** be idempotent. The event bus tracks processed events in the `processed_events` table using a unique index on `(eventId, consumerName)`.

Rules:
- Use **stable consumer names** in `bus.subscribe()` (third argument). Auto-generated names break deduplication when registration order changes.
- Consumer names follow: `{consumer_module}/{event_shortname}` — e.g., `inventory/order.placed`, `accounting/tender.recorded`
- If a consumer creates records, use `ON CONFLICT DO NOTHING` or check-before-insert
- If a consumer updates read models, make the update idempotent (e.g., upsert, or set to absolute value rather than incrementing)
- The bus retries failed consumers 3x with exponential backoff. If all retries fail, the event is unclaimed for the outbox worker to redispatch.

## Consumer Registration

Modules expose consumers in one of two ways:

1. **Barrel export** (default): `@oppsera/module-x` — consumers exported alongside commands/queries from `src/index.ts`
2. **Subpath export**: `@oppsera/module-x/consumers` — for heavy modules where the barrel pulls too many deps (e.g., spa)

Registration happens in `apps/web/src/instrumentation.ts`. This is the single source of truth for all event wiring. See exception E3 in [module-architecture.md](module-architecture.md).

Consumer naming pattern in `instrumentation.ts`:
```typescript
bus.subscribe('order.placed.v1', inventory.handleOrderPlaced, 'inventory/order.placed');
//            ^event name        ^handler function              ^stable consumer name
```

## New Command Checklist

When adding a new command that mutates data:

```
[ ] Does it emit a canonical domain event via publishWithOutbox?
[ ] Does the event name follow {domain}.{entity}.{action}.v{N}?
[ ] Is the event payload self-sufficient (no consumer lookups needed)?
[ ] Is auditLog() called after the transaction?
[ ] For each consumer of this event:
    [ ] Is the consumer idempotent?
    [ ] Is the consumer registered with a stable name?
    [ ] Is the consumer registered in instrumentation.ts?
```

## KDS / F&B Event Semantics (Updated March 2026)

KDS events follow the standard naming convention but have domain-specific semantics:

### Course Lifecycle Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `fnb.course.sent.v1` | Course fired to kitchen | KDS ticket creation, customer board |
| `fnb.course.resent.v1` | Course items resent (remake) | KDS delta chit creation |
| `fnb.ticket.cleared.v1` | Ticket bumped off KDS | Reporting, customer board update |
| `fnb.ticket.recalled.v1` | Bumped ticket re-enters queue | KDS view refresh |

**Terminology**: "cleared" (not "resolved") — the kitchen-standard term for bumping a ticket off the display. Migration 0310 renamed `resolved_at` → `cleared_at`.

### KDS Identity & Routing Events

- `fnb.station.heartbeat.v1` — station health check (periodic, not stored in outbox)
- `fnb.kds.action_log.v1` — bump/recall/hold/message actions for audit trail
- Station identity is bound to terminal session — events include `terminalSessionId` and `stationId`

### Course Send/Fire Behavior

```
Course added to tab → status: unsent
Fire course (manual or auto) → emits fnb.course.sent.v1 → creates KDS tickets per routing rules
Refire (remake) → emits fnb.course.resent.v1 → creates delta chit at original station
Void ticket → ticket status updated, but fnb_kds_send_tracking rows preserved (audit trail)
```

### KDS Clear Semantics

- **First bump**: item status `pending/in_progress → ready` (prep complete)
- **Second bump**: item status `ready → served` (expo cleared)
- All bumps include `WHERE item_status = $currentStatus` as optimistic lock (prevents double-bump race)
- Cleared tickets remain in the DB with `cleared_at` timestamp — never hard-deleted

## AI Support Event Semantics (Added March 2026)

AI support uses `auditLog()` (not `publishWithOutbox`) for its mutations. This is intentional — no cross-module consumers need to react to AI support events. If cross-module reactions are needed in the future, these should be promoted to full domain events via the outbox.

### Audit Events (via auditLog)

| Audit Key | Trigger | Notes |
|-----------|---------|-------|
| `ai_support.thread.created` | New conversation thread opened | Thread-level, tenant-scoped |
| `ai_support.thread.closed` | Thread conversation ended | Sets thread status to `closed` |
| `ai_support.escalation.created` | Human agent handoff initiated | Includes reason, priority, summary |
| `ai_support.escalation.updated` | Escalation status changed | Auto-sets `resolvedAt` when `status='resolved'` |
| `ai_support.answer_card.created` | New canned answer added to KB | Via admin review queue |
| `ai_support.answer_card.updated` | Answer card modified | Includes status transitions |

### Analytics Events (Non-Critical, No Outbox)

These run as background analytics and do NOT emit domain events:

| Service | Data Written | Storage |
|---------|-------------|---------|
| Intent classifier | topic, intent, urgency | `ai_support_conversation_tags` (3 rows per thread) |
| Sentiment analyzer | sentiment per message | `ai_assistant_messages.sentiment` column |
| CSAT predictor | score (1–5) + reasoning | `ai_support_csat_predictions` |
| Summarizer | thread summary | `ai_assistant_threads.summary` column |
| Test runner | pass/fail + regression | `ai_support_test_results` |

### Agentic Action Logging

Tool executions by the agentic orchestrator are logged to `ai_support_agentic_actions` with: action name, parameters, result, duration. This is an observability table, not an event stream — no consumers subscribe to it.

### Why Not Full Domain Events?

AI support analytics are **non-critical, tenant-internal, and non-transactional**. They don't trigger cross-module side effects (no GL posting, no inventory changes, no customer state mutations). Using `auditLog()` keeps the outbox clean and avoids unnecessary event processing overhead. If a future feature needs cross-module reaction (e.g., "auto-create support ticket in external system on escalation"), promote the relevant audit key to a full `publishWithOutbox` domain event at that time.

## Audit

Run `pnpm audit:arch:inventory` to see all 150+ consumer registrations extracted from `instrumentation.ts`. This is the live inventory — no separate doc to maintain.
