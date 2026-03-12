# Module Architecture Conventions

> Governance rules for the modular monolith. Enforced by ESLint (`no-restricted-imports` in `eslint.config.mjs`), the architecture audit script (`pnpm audit:arch`), and CI preflight checks. Violations should be tracked as temporary exceptions (see bottom of this doc) until resolved.

## 1. Apps Are Delivery / Composition Layers

`apps/web` and `apps/admin` are **not** domain logic. They are delivery shells that:

- Mount API routes (`src/app/api/v1/...`) that call into module commands/queries
- Wire cross-module singletons and event consumers at startup (`instrumentation.ts`)
- Compose UI from module-owned components and shared design system pieces
- Orchestrate cross-module reads in API routes when eventual consistency is insufficient

Apps may import any package. They are the only layer permitted to reference multiple modules in a single file.

## 2. Modules Own Domain Logic

Each module in `packages/modules/*` owns:

- **Schema**: table definitions in `@oppsera/db` (namespaced by module)
- **Commands**: write operations (insert/update/delete) with transactional outbox
- **Queries**: read operations with tenant scoping and cursor pagination
- **Events**: domain events published via `publishWithOutbox`
- **Consumers**: handlers for events from other modules (exported for app-layer registration)

Modules are the source of truth for their domain. No other module or app should write directly to another module's tables.

## 3. Modules Cannot Import Other Modules

```
@oppsera/module-X  ──✗──>  @oppsera/module-Y
```

This is the **hard rule**. A module's `package.json` must never list another module as a dependency. Cross-module communication uses one of:

| Mechanism | When to Use |
|---|---|
| **Events** (preferred) | Eventual consistency is acceptable. Module publishes, others consume. |
| **Internal Read APIs** | Synchronous read needed during a transaction (e.g., catalog lookup during order placement). Singleton registered at startup, read-only. |
| **Internal Write APIs** | Synchronous write needed from another module's context (e.g., PMS creating an order). Singleton registered at startup, write-through. |
| **App-layer orchestration** | API route in `apps/web` queries multiple modules and composes the response. |

Internal APIs live in `@oppsera/core/helpers/` as interfaces + singleton getter/setter. The app layer wires the concrete implementation at startup. This preserves the dependency rule: modules depend on `core` (the interface), not on each other.

## 4. Consumers Are Not Called Directly From Commands

A command must never `import { handleOrderPlaced } from './consumers/...'` and call it inline. The flow is:

```
Command → publishWithOutbox (emits event) → Event Bus → Consumer
```

This ensures:
- Events are persisted in the outbox (crash recovery)
- Consumers are idempotent and retryable
- Adding/removing consumers doesn't require changing the command
- Temporal decoupling (consumer can fail without failing the command)

## 5. Sync Cross-Domain Orchestration Is an Exception

The `packages/core/src/sync/` directory exists for cases where event-driven integration is insufficient — typically when a single user action must atomically affect two modules' data. Current example: PMS guest creation must synchronously create/link a customer record.

Sync orchestrators:
- Live in `@oppsera/core` (not in a module)
- Are consumed via events (not called directly from commands)
- Are explicitly tracked as exceptions (see below)
- Should be migrated to event-driven when the consistency requirement relaxes

## 6. Events Are the Preferred Integration Mechanism

When two modules need to communicate, the default answer is events:

```
Module A: publishWithOutbox → domain.entity.action.v1
Module B: consumer registered in instrumentation.ts
```

Events provide:
- Loose coupling (publisher doesn't know about consumers)
- Crash recovery (transactional outbox + retry)
- Auditability (event log)
- Extensibility (add consumers without modifying the publisher)

Deviate from events only when you need synchronous consistency or synchronous read enrichment.

---

## Temporary Exceptions

Known deviations from the rules above. Each exception should have an owner, rationale, and target resolution.

### E1: App-Owned Orchestration in API Routes

**Where**: `apps/web/src/app/api/v1/` — various routes that query multiple modules and compose responses.

**Example**: POS catalog endpoint cross-joins catalog + inventory + F&B for item enrichment.

**Rationale**: These are read-only compositions where eventual consistency would degrade UX (e.g., showing stale stock counts on POS). The app layer is the designated composition point.

**Status**: Accepted pattern. Not a violation — listed here for visibility. If a route starts doing cross-module *writes*, it should be refactored to events or a core sync orchestrator.

### E2: Core Sync Orchestrators (Direct Cross-Module Writes)

**Where**: `packages/core/src/sync/pms-customer-sync.ts`

**What**: `handlePmsGuestCreated` writes to both `customers` and `pms_guests` tables (two module boundaries) in a single transaction.

**Rationale**: PMS guest creation must atomically create a customer, link external ID, back-link the guest, and apply the Hotel Guest tag. Eventual consistency would leave guests unlinked until the consumer catches up, breaking room-charge flows that depend on the link.

**Owner**: Core team
**Target**: Evaluate after PMS stabilizes. If the room-charge flow can tolerate async linking (with a "linking in progress" state), migrate to event-driven.

### E3: Host-Owned Consumer Registration

**Where**: `apps/web/src/instrumentation.ts`

**What**: The app layer imports module consumers and registers them with the event bus at startup. This means `apps/web` has knowledge of every consumer in the system.

**Rationale**: Next.js `instrumentation.ts` is the only reliable server-startup hook. Modules can't self-register because they don't control the runtime lifecycle. A future plugin/auto-discovery system could replace this, but the current approach is explicit and debuggable.

**Status**: Accepted pattern. The cost is a large `instrumentation.ts` file. The benefit is a single place to see all event wiring.

### E4: Internal Write APIs (Cross-Module Write Singletons)

**Where**: `apps/web/src/lib/orders-bootstrap.ts`, `apps/web/src/lib/payments-bootstrap.ts`

**What**: The app layer wires `OrdersWriteApi` and `PaymentsGatewayApi` singletons so that modules like PMS can create orders or process payments without importing the orders/payments module directly.

**Rationale**: PMS room charges and folio settlements require synchronous order/payment creation within a transaction. The singleton pattern preserves the module boundary while allowing the write.

**Owner**: Core team
**Target**: Long-term, evaluate whether these can become event-driven sagas. Short-term, the singleton indirection is acceptable.

### E5: Event Payload Adaptation in instrumentation.ts

**Where**: `apps/web/src/instrumentation.ts` — inline lambdas that reshape event payloads before passing to consumers.

**What**: Several F&B reporting and table-status consumers receive adapted payloads (e.g., `{ tenantId: event.tenantId, ...(event.data as any) }`), and some do DB enrichment queries inline.

**Rationale**: Consumer signatures were designed before the event bus interface stabilized. Refactoring all consumers to accept `EventEnvelope` directly is planned but not yet done.

**Owner**: F&B team
**Target**: Standardize all consumers to accept `EventEnvelope`. Move enrichment queries into the consumers themselves.
