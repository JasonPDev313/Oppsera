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

## Audit

Run `pnpm audit:arch:inventory` to see all 150+ consumer registrations extracted from `instrumentation.ts`. This is the live inventory — no separate doc to maintain.
