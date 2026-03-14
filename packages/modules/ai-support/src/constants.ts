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

export const FEEDBACK_REASON_CODES = [
  'not_accurate', 'didnt_answer', 'show_steps', 'contact_support',
] as const;
export type FeedbackReasonCode = typeof FEEDBACK_REASON_CODES[number];
