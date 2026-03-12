# ADR-001: Module Boundaries

**Status**: Accepted
**Date**: 2026-03-11
**Deciders**: Jason (architecture owner)

## Context

OppsEra is a modular monolith serving ~4,000 tenants across retail, restaurant, golf, spa, and hotel verticals. The codebase has 23+ domain modules in `packages/modules/`. As the system grows, the risk of accidental coupling between modules increases — leading to circular dependencies, shared mutable state, and deployment entanglement.

We need a clear, enforceable definition of what a module is, what it owns, and how it interacts with other modules.

## Decision

### Module definition

A module is a package in `packages/modules/` that owns a bounded context. It contains commands, queries, event consumers, and type definitions for its domain. Its schema tables are defined in `@oppsera/db` but are logically owned by the module.

### Dependency rule

```
Module → shared, db, core    (allowed)
Module → Module               (forbidden)
```

Modules may only depend on:
- `@oppsera/shared` — types, Zod schemas, pure utility functions
- `@oppsera/db` — Drizzle schema, `withTenant`, database types
- `@oppsera/core` — auth, RBAC, events, audit, helpers, internal API interfaces

A module must **never** import from another module, directly or transitively. This is enforced by:
1. ESLint `no-restricted-imports` rule — errors on `@oppsera/module-*` imports within `packages/modules/*/src/` (see `eslint.config.mjs`)
2. Architecture audit script — `pnpm audit:arch` scans both static and dynamic imports, runs in CI preflight
3. Code review and `package.json` dependency audits

### Cross-module communication

When modules need to interact, they use one of these mechanisms (in order of preference):

1. **Domain events** — publisher emits, consumer reacts asynchronously
2. **Internal read APIs** — synchronous, read-only singleton registered at startup
3. **Internal write APIs** — synchronous, write-through singleton registered at startup
4. **App-layer orchestration** — API route in `apps/web` composes across modules

All internal APIs are defined as interfaces in `@oppsera/core/helpers/`. The app layer provides the concrete implementation at startup (`instrumentation.ts`). Modules depend on the interface, not on each other.

### App layer role

`apps/web` and `apps/admin` are delivery/composition layers. They are the **only** place where multiple modules can be referenced in a single file. They own:
- API route handlers (thin: validate → call module → format response)
- Event consumer registration (startup wiring)
- Cross-module query composition (read-only orchestration)
- Internal API singleton wiring

## Consequences

**Positive**:
- Each module can be reasoned about, tested, and potentially extracted independently
- No circular dependency chains
- Event-driven integration enables adding new modules without modifying existing ones
- Clear ownership boundaries reduce merge conflicts across teams

**Negative**:
- `instrumentation.ts` grows linearly with the number of event consumers (accepted trade-off for explicitness)
- Internal API singletons add indirection — you can't just `import` and call
- Some cross-module reads require app-layer routes instead of direct queries
- Refactoring a module's event schema requires coordinating with consumers (versioned events mitigate this)

**Neutral**:
- The `packages/core/src/sync/` directory exists as an acknowledged exception for cross-module orchestration that requires atomicity. These are tracked as temporary exceptions.
