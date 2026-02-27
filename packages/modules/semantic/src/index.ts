export const MODULE_KEY = 'semantic' as const;
export const MODULE_NAME = 'AI Insights / Semantic Layer';
export const MODULE_VERSION = '0.1.0';

// ── Evaluation infrastructure ─────────────────────────────────
export * from './evaluation';

// ── Semantic registry ─────────────────────────────────────────
export * from './registry';

// ── Query compiler ────────────────────────────────────────────
export * from './compiler';

// ── LLM integration layer ─────────────────────────────────────
export * from './llm';

// ── Custom Lenses ─────────────────────────────────────────────
export * from './lenses';

// ── Cache layer ───────────────────────────────────────────────
export * from './cache';

// ── Observability ─────────────────────────────────────────────
export * from './observability';

// ── Intelligence services (proactive AI) ─────────────────────
export * from './intelligence';

// ── RAG training store ───────────────────────────────────────
export * from './rag';

// ── Narrative config ─────────────────────────────────────────
export * from './config';

// ── PII masking ──────────────────────────────────────────────
export { maskRowsForLLM, maskFreeText } from './pii/pii-masker';
