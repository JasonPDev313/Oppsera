# ADR-002: Event-Driven Integration vs Synchronous Orchestration

**Status**: Accepted
**Date**: 2026-03-11
**Deciders**: Jason (architecture owner)

## Context

Cross-module communication in a modular monolith can be synchronous (direct function calls, shared APIs) or asynchronous (domain events). OppsEra uses both patterns. We need a decision framework for when to use each, and a default that biases toward loose coupling.

### Current state

The system already has a mature event infrastructure:
- Transactional outbox pattern (events saved in the same transaction as the write)
- In-memory event bus with named consumers and idempotency tracking
- 3x retry with exponential backoff
- ~100+ event consumer registrations across all modules

It also has synchronous integration points:
- `CatalogReadApi` — POS needs real-time item/price data during order placement
- `OrdersWriteApi` / `PaymentsGatewayApi` — PMS needs to create orders and process payments atomically
- `ReconciliationReadApi` — accounting needs cross-module aggregates for day-end reconciliation
- `pms-customer-sync` — PMS guest creation must atomically link to a customer record

## Decision

### Default: events

When two modules need to communicate, the default mechanism is a **domain event**. The publishing module emits an event via `publishWithOutbox`, and consuming modules register handlers in `instrumentation.ts`.

Events are preferred because they provide:
- **Loose coupling**: publisher doesn't know about consumers
- **Crash recovery**: transactional outbox ensures events survive crashes
- **Idempotency**: consumer deduplication via `processed_events` table
- **Extensibility**: new consumers can be added without modifying the publisher
- **Auditability**: event log provides a complete history of domain actions

### Exception: synchronous read APIs

Use a synchronous internal read API when:
- The consumer needs data **during a transaction** (not after)
- Eventual consistency would produce incorrect results (e.g., wrong price on an order line)
- The data is **read-only** from the consumer's perspective

Examples: `CatalogReadApi` (item lookup during order placement), `ReconciliationReadApi` (cross-module aggregates for reconciliation).

Internal read APIs are defined as interfaces in `@oppsera/core/helpers/` and wired at startup. They are the **least invasive** exception — no writes cross module boundaries.

### Exception: synchronous write APIs

Use a synchronous internal write API when:
- A user action must atomically create/modify data in two modules
- The second module's write is a direct consequence of the first (not a side effect)
- Failure of the second write should fail the entire operation

Examples: `OrdersWriteApi` (PMS creating a POS order for room charge), `PaymentsGatewayApi` (PMS processing a folio payment).

These are the **most invasive** exception. Every write API should be reviewed for whether it can be replaced by an event-driven saga.

### Exception: core sync orchestrators

Use a core sync orchestrator (`packages/core/src/sync/`) when:
- Two modules' data must be atomically consistent
- The orchestration logic doesn't belong to either module
- An event consumer can trigger it (it's still event-initiated, just synchronous in execution)

Example: `pms-customer-sync` — triggered by `pms.guest.created.v1`, but executes synchronous writes to both customers and PMS tables.

Core sync orchestrators are consumed via events. They are not called directly from commands.

### Decision matrix

| Need | Mechanism | Example |
|---|---|---|
| Module A happened, Module B should react | Event | `order.placed.v1` → inventory deduction |
| Module A needs Module B's data during a tx | Internal Read API | Catalog lookup during order placement |
| Module A must create data in Module B atomically | Internal Write API | PMS creating a POS order |
| Two modules must be atomically consistent, owned by neither | Core Sync Orchestrator | PMS guest → customer linking |
| API route needs data from multiple modules | App-layer composition | POS catalog enrichment route |

## Consequences

**Positive**:
- Clear decision framework reduces ad-hoc coupling
- Events remain the dominant integration pattern (~95% of cross-module flows)
- Synchronous exceptions are explicitly tracked and periodically reviewed
- New developers have a clear guide for when to use each pattern

**Negative**:
- Synchronous write APIs create hidden coupling (Module A's behavior depends on Module B being wired)
- Core sync orchestrators bypass the "consumers shouldn't write to other modules' tables" ideal
- Deciding which category a new integration falls into requires judgment

**Risks and mitigations**:
- **Risk**: Sync exceptions proliferate and become the norm
  - **Mitigation**: Track all exceptions in [module-architecture.md](../conventions/module-architecture.md). Review quarterly. New sync exceptions require an ADR amendment or a new ADR.
- **Risk**: Event-driven flows are harder to debug than direct calls
  - **Mitigation**: Named consumers, idempotency tracking, and structured logging. Future: event catalog / tracing dashboard.
