// ── Semantic Layer — Event Type Constants ─────────────────────────
//
// Canonical event type strings for all events emitted by the
// semantic module. Use these constants instead of raw strings to
// prevent typos and enable TypeScript autocomplete.
//
// Event naming: {domain}.{entity}.{action}.v{N}
// All event types conform to: ^[a-z][a-z_]*(\.[a-z][a-z_]*)+\.v\d+$

// ── Query execution events ────────────────────────────────────────

/** Fired after a successful natural-language query is executed. */
export const SEMANTIC_QUERY_EXECUTED = 'semantic.query.executed.v1';

/** Fired when a query returns from the in-memory cache (no DB hit). */
export const SEMANTIC_QUERY_CACHE_HIT = 'semantic.query.cache_hit.v1';

/** Fired when a query requires LLM clarification before execution. */
export const SEMANTIC_QUERY_CLARIFICATION = 'semantic.query.clarification.v1';

/** Fired when a query fails due to compilation or execution error. */
export const SEMANTIC_QUERY_FAILED = 'semantic.query.failed.v1';

// ── Chat session events ───────────────────────────────────────────

/** Fired when a conversational chat session starts (first message). */
export const SEMANTIC_CHAT_SESSION_STARTED = 'semantic.chat.session_started.v1';

/** Fired for each assistant message in a chat session. */
export const SEMANTIC_CHAT_MESSAGE = 'semantic.chat.message.v1';

// ── Feedback events ───────────────────────────────────────────────

/** Fired when a user submits thumbs up/down or star rating on a response. */
export const SEMANTIC_FEEDBACK_SUBMITTED = 'semantic.feedback.submitted.v1';

// ── Lens management events ────────────────────────────────────────

/** Fired when a new custom lens is created. */
export const SEMANTIC_LENS_CREATED = 'semantic.lens.created.v1';

/** Fired when an existing lens is updated. */
export const SEMANTIC_LENS_UPDATED = 'semantic.lens.updated.v1';

/** Fired when a lens is deactivated. */
export const SEMANTIC_LENS_DEACTIVATED = 'semantic.lens.deactivated.v1';

// ── Admin events ──────────────────────────────────────────────────

/** Fired when an admin invalidates the query or registry cache. */
export const SEMANTIC_CACHE_INVALIDATED = 'semantic.cache.invalidated.v1';

// ── Aggregated type ───────────────────────────────────────────────

export const SEMANTIC_EVENT_TYPES = {
  QUERY_EXECUTED: SEMANTIC_QUERY_EXECUTED,
  QUERY_CACHE_HIT: SEMANTIC_QUERY_CACHE_HIT,
  QUERY_CLARIFICATION: SEMANTIC_QUERY_CLARIFICATION,
  QUERY_FAILED: SEMANTIC_QUERY_FAILED,
  CHAT_SESSION_STARTED: SEMANTIC_CHAT_SESSION_STARTED,
  CHAT_MESSAGE: SEMANTIC_CHAT_MESSAGE,
  FEEDBACK_SUBMITTED: SEMANTIC_FEEDBACK_SUBMITTED,
  LENS_CREATED: SEMANTIC_LENS_CREATED,
  LENS_UPDATED: SEMANTIC_LENS_UPDATED,
  LENS_DEACTIVATED: SEMANTIC_LENS_DEACTIVATED,
  CACHE_INVALIDATED: SEMANTIC_CACHE_INVALIDATED,
} as const;

export type SemanticEventType = (typeof SEMANTIC_EVENT_TYPES)[keyof typeof SEMANTIC_EVENT_TYPES];
