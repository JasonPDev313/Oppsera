export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0,
} as const;

export const MAX_MESSAGES_PER_THREAD = 20;
export const MAX_CONCURRENT_THREADS_PER_USER = 5;
export const MAX_MESSAGES_PER_HOUR = 60;
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_FREEFORM_COMMENT_LENGTH = 1000;

export const ANSWER_MODES = ['explain', 'guide', 'diagnose', 'escalate'] as const;
export type AnswerMode = typeof ANSWER_MODES[number];

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type ConfidenceLevel = typeof CONFIDENCE_LEVELS[number];

export const THREAD_CHANNELS = ['in_app', 'admin_review', 'support_internal'] as const;
export type ThreadChannel = typeof THREAD_CHANNELS[number];

export const THREAD_STATUSES = ['open', 'closed', 'flagged', 'reviewed'] as const;
export type ThreadStatus = typeof THREAD_STATUSES[number];

export const QUESTION_TYPES = ['how_to', 'explain', 'diagnose', 'permissions', 'bug_suspicion', 'billing', 'reporting'] as const;
export type QuestionType = typeof QUESTION_TYPES[number];

export const OUTCOMES = ['resolved', 'escalated', 'reviewed', 'unresolved'] as const;
export type Outcome = typeof OUTCOMES[number];

export const ISSUE_TAGS = ['probable_bug', 'probable_config', 'probable_permissions', 'probable_misunderstanding'] as const;
export type IssueTag = typeof ISSUE_TAGS[number];

export const MESSAGE_ROLES = ['user', 'assistant', 'system', 'reviewer'] as const;
export type MessageRole = typeof MESSAGE_ROLES[number];

export const FEEDBACK_RATINGS = ['up', 'down'] as const;
export type FeedbackRating = typeof FEEDBACK_RATINGS[number];

export const REVIEW_STATUSES = ['approved', 'edited', 'rejected', 'needs_kb_update'] as const;
export type ReviewStatus = typeof REVIEW_STATUSES[number];

export const SOURCE_TIERS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'] as const;
export type SourceTier = typeof SOURCE_TIERS[number];

export const ANSWER_CARD_STATUSES = ['draft', 'active', 'stale', 'archived'] as const;
export type AnswerCardStatus = typeof ANSWER_CARD_STATUSES[number];

export const DOCUMENT_SOURCE_TYPES = [
  'support_artifact', 'route_manifest', 'permissions', 'pr_summary',
  'release_note', 'approved_answer', 'kb',
] as const;
export type DocumentSourceType = typeof DOCUMENT_SOURCE_TYPES[number];

// ── Model Waterfall Configuration ──
// Routes questions to the cheapest model that can answer them well.
// Escalation: Haiku (FAQ/curated) → Sonnet (reasoning) → Opus (complex/no evidence)
export const MODEL_TIERS = {
  fast: {
    id: 'claude-haiku-4-5-20251001',
    maxTokens: 1024,
    label: 'haiku',
  },
  standard: {
    id: 'claude-sonnet-4-6',
    maxTokens: 2048,
    label: 'sonnet',
  },
  deep: {
    id: 'claude-opus-4-6',
    maxTokens: 4096,
    label: 'opus',
  },
} as const;

export type ModelTier = keyof typeof MODEL_TIERS;

/** Convenience re-exports — use these instead of hardcoding model ID strings. */
export const FAST_MODEL_ID = MODEL_TIERS.fast.id;
export const STANDARD_MODEL_ID = MODEL_TIERS.standard.id;
export const DEEP_MODEL_ID = MODEL_TIERS.deep.id;

/** Ordered tier list for escalation: fast → standard → deep */
export const TIER_ESCALATION_ORDER: readonly ModelTier[] = ['fast', 'standard', 'deep'] as const;

// Thread history length that triggers a tier bump (conversations getting complex)
export const LONG_THREAD_THRESHOLD = 6;

// Input char threshold that bumps minimum tier to standard (Haiku struggles with large context)
export const LARGE_CONTEXT_CHAR_THRESHOLD = 8_000;

// Thumbs-down rate threshold for feedback-aware routing (route+module combo)
// If >= this fraction of recent Haiku answers got thumbs-down, auto-bump to Sonnet
export const FEEDBACK_DOWNVOTE_RATE_THRESHOLD = 0.4;

// Minimum sample size before feedback-based routing kicks in
export const FEEDBACK_MIN_SAMPLE_SIZE = 5;

// How many recent feedback records to consider per route+module
export const FEEDBACK_LOOKBACK_LIMIT = 20;

export const FEEDBACK_REASON_CODES = [
  'not_accurate', 'didnt_answer', 'show_steps', 'contact_support',
] as const;
export type FeedbackReasonCode = typeof FEEDBACK_REASON_CODES[number];

// ── Escalation (Human Agent Handoff) ──
export const ESCALATION_STATUSES = ['open', 'assigned', 'resolved', 'closed'] as const;
export type EscalationStatus = typeof ESCALATION_STATUSES[number];

export const ESCALATION_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type EscalationPriority = typeof ESCALATION_PRIORITIES[number];

export const ESCALATION_REASONS = ['user_requested', 'low_confidence', 'negative_sentiment', 'auto_escalation'] as const;
export type EscalationReason = typeof ESCALATION_REASONS[number];

// ── Sentiment Detection ──
export const SENTIMENT_VALUES = ['positive', 'neutral', 'frustrated', 'angry'] as const;
export type SentimentValue = typeof SENTIMENT_VALUES[number];

// ── Conversation Tags ──
export const TAG_TYPES = ['topic', 'intent', 'urgency'] as const;
export type TagType = typeof TAG_TYPES[number];

export const INTENT_VALUES = ['how_to', 'troubleshoot', 'feature_request', 'complaint', 'general'] as const;
export type IntentValue = typeof INTENT_VALUES[number];

export const URGENCY_VALUES = ['low', 'medium', 'high', 'critical'] as const;
export type UrgencyValue = typeof URGENCY_VALUES[number];

// ── Proactive Messages ──
export const PROACTIVE_TRIGGER_TYPES = ['page_idle', 'feature_unused', 'onboarding_incomplete', 'first_visit'] as const;
export type ProactiveTriggerType = typeof PROACTIVE_TRIGGER_TYPES[number];

// ── Test Suite ──
export const TEST_RUN_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type TestRunStatus = typeof TEST_RUN_STATUSES[number];
