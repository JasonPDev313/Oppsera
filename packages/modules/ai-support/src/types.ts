import { z } from 'zod';
import {
  ANSWER_MODES, CONFIDENCE_LEVELS, THREAD_CHANNELS, THREAD_STATUSES,
  QUESTION_TYPES, OUTCOMES, ISSUE_TAGS, FEEDBACK_RATINGS,
  REVIEW_STATUSES, SOURCE_TIERS, ANSWER_CARD_STATUSES,
  FEEDBACK_REASON_CODES, ESCALATION_STATUSES, ESCALATION_PRIORITIES,
  ESCALATION_REASONS,
  PROACTIVE_TRIGGER_TYPES,
  MAX_MESSAGE_LENGTH, MAX_FREEFORM_COMMENT_LENGTH,
} from './constants';

// Re-export so consumers can import from types
export type {
  AnswerMode, ConfidenceLevel, ThreadChannel, ThreadStatus, QuestionType,
  Outcome, IssueTag, MessageRole, FeedbackRating, ReviewStatus, SourceTier,
  AnswerCardStatus, DocumentSourceType, FeedbackReasonCode, ModelTier,
  EscalationStatus, EscalationPriority, EscalationReason,
  SentimentValue, TagType, IntentValue, UrgencyValue,
  ProactiveTriggerType, TestRunStatus,
} from './constants';

// ── Context Snapshot ──
export const AiAssistantContextSchema = z.object({
  route: z.string(),
  screenTitle: z.string().optional(),
  moduleKey: z.string().optional(),
  tenantId: z.string(),
  locationId: z.string().optional(),
  roleKeys: z.array(z.string()),
  permissionKeys: z.array(z.string()).optional(),
  featureFlags: z.record(z.boolean()).optional(),
  enabledModules: z.array(z.string()).optional(),
  tenantSettings: z.record(z.unknown()).optional(),
  visibleActions: z.array(z.string()).optional(),
  selectedRecord: z.record(z.unknown()).optional(),
  uiState: z.record(z.unknown()).optional(),
});
export type AiAssistantContext = z.infer<typeof AiAssistantContextSchema>;

// ── Thread ──
export const CreateThreadSchema = z.object({
  channel: z.enum(THREAD_CHANNELS).default('in_app'),
  currentRoute: z.string(),
  moduleKey: z.string().optional(),
});
export type CreateThreadInput = z.infer<typeof CreateThreadSchema>;

export const UpdateThreadSchema = z.object({
  status: z.enum(THREAD_STATUSES).optional(),
  questionType: z.enum(QUESTION_TYPES).optional(),
  outcome: z.enum(OUTCOMES).optional(),
  issueTag: z.enum(ISSUE_TAGS).optional(),
});
export type UpdateThreadInput = z.infer<typeof UpdateThreadSchema>;

// ── Message ──
export const SendMessageSchema = z.object({
  threadId: z.string(),
  messageText: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  contextSnapshot: AiAssistantContextSchema,
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

// ── Feedback ──
export const SubmitFeedbackSchema = z.object({
  messageId: z.string(),
  rating: z.enum(FEEDBACK_RATINGS),
  reasonCode: z.enum(FEEDBACK_REASON_CODES).optional(),
  freeformComment: z.string().max(MAX_FREEFORM_COMMENT_LENGTH).optional(),
});
export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackSchema>;

// ── Review ──
export const SubmitReviewSchema = z.object({
  threadId: z.string(),
  messageId: z.string(),
  reviewStatus: z.enum(REVIEW_STATUSES),
  reviewNotes: z.string().optional(),
  correctedAnswer: z.string().optional(),
});
export type SubmitReviewInput = z.infer<typeof SubmitReviewSchema>;

// ── Answer Card ──
export const CreateAnswerCardSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  moduleKey: z.string(),
  route: z.string().optional(),
  questionPattern: z.string(),
  approvedAnswerMarkdown: z.string(),
  ownerUserId: z.string(),
});
export type CreateAnswerCardInput = z.infer<typeof CreateAnswerCardSchema>;

export const UpdateAnswerCardSchema = z.object({
  questionPattern: z.string().optional(),
  approvedAnswerMarkdown: z.string().optional(),
  status: z.enum(ANSWER_CARD_STATUSES).optional(),
  ownerUserId: z.string().optional(),
});
export type UpdateAnswerCardInput = z.infer<typeof UpdateAnswerCardSchema>;

// ── Route Manifest ──
export const RouteManifestSchema = z.object({
  route: z.string(),
  moduleKey: z.string(),
  pageTitle: z.string(),
  description: z.string(),
  tabs: z.array(z.object({
    label: z.string(),
    description: z.string(),
  })).optional(),
  actions: z.array(z.object({
    label: z.string(),
    description: z.string(),
    permissionKey: z.string().optional(),
    preconditions: z.string().optional(),
    confirmations: z.string().optional(),
  })),
  permissions: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
  helpText: z.string().optional(),
  repoSha: z.string().optional(),
  ownerUserId: z.string().optional(),
});
export type RouteManifestInput = z.infer<typeof RouteManifestSchema>;

// ── Response Shapes ──
export const StandardAnswerSchema = z.object({
  answer: z.string(),
  steps: z.array(z.string()).optional(),
  confidence: z.enum(['high', 'medium']),
  answerMode: z.enum(ANSWER_MODES),
  usedSources: z.array(z.string()),
  sourceTierUsed: z.enum(SOURCE_TIERS),
  needsReview: z.boolean(),
  suggestedFollowups: z.array(z.string()).optional(),
});
export type StandardAnswer = z.infer<typeof StandardAnswerSchema>;

export const KnownUnknownsSchema = z.object({
  whatIKnow: z.string(),
  whatMayVary: z.string(),
  whatICantConfirm: z.string(),
  recommendedNextStep: z.string(),
});

export const LowConfidenceAnswerSchema = z.object({
  answer: z.string(),
  confidence: z.literal('low'),
  answerMode: z.literal('escalate'),
  knownUnknowns: KnownUnknownsSchema,
  needsReview: z.literal(true),
  usedSources: z.array(z.string()),
  sourceTierUsed: z.enum(SOURCE_TIERS),
});
export type LowConfidenceAnswer = z.infer<typeof LowConfidenceAnswerSchema>;

export const AiAssistantResponseSchema = z.discriminatedUnion('confidence', [
  StandardAnswerSchema.extend({ confidence: z.literal('high') }),
  StandardAnswerSchema.extend({ confidence: z.literal('medium') }),
  LowConfidenceAnswerSchema,
]);
export type AiAssistantResponse = z.infer<typeof AiAssistantResponseSchema>;

// ── Streaming chunks ──
export const StreamChunkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chunk'), text: z.string() }),
  z.object({
    type: z.literal('done'),
    confidence: z.enum(CONFIDENCE_LEVELS),
    sourceTier: z.enum(SOURCE_TIERS),
    sources: z.array(z.string()),
    suggestedFollowups: z.array(z.string()).optional(),
    modelUsed: z.string().optional(),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({
    type: z.literal('action'),
    name: z.string(),
    status: z.enum(['executing', 'complete', 'error']),
    result: z.string().optional(),
  }),
]);
export type StreamChunk = z.infer<typeof StreamChunkSchema>;

// ── Escalation (Human Agent Handoff) ──
export const CreateEscalationSchema = z.object({
  threadId: z.string(),
  reason: z.enum(ESCALATION_REASONS).default('user_requested'),
  priority: z.enum(ESCALATION_PRIORITIES).optional(),
});
export type CreateEscalationInput = z.infer<typeof CreateEscalationSchema>;

export const UpdateEscalationSchema = z.object({
  status: z.enum(ESCALATION_STATUSES).optional(),
  assignedTo: z.string().optional(),
  resolutionNotes: z.string().optional(),
});
export type UpdateEscalationInput = z.infer<typeof UpdateEscalationSchema>;

// ── Agentic Actions ──
export interface ActionDefinition {
  name: string;
  description: string;
  requiredPermission: string;
  paramSchema: z.ZodSchema;
  executor: (params: unknown, context: { tenantId: string; locationId?: string }) => Promise<unknown>;
}

// ── CSAT Prediction ──
export interface CsatPrediction {
  score: number;
  reasoning: string;
}

// ── Test Suite ──
export const CreateTestCaseSchema = z.object({
  question: z.string().min(5),
  expectedAnswerPattern: z.string().min(3),
  moduleKey: z.string().optional(),
  route: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type CreateTestCaseInput = z.infer<typeof CreateTestCaseSchema>;

export const UpdateTestCaseSchema = z.object({
  question: z.string().min(5).optional(),
  expectedAnswerPattern: z.string().min(3).optional(),
  moduleKey: z.string().optional(),
  route: z.string().optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateTestCaseInput = z.infer<typeof UpdateTestCaseSchema>;

// ── Proactive Rules ──
export const CreateProactiveRuleSchema = z.object({
  triggerType: z.enum(PROACTIVE_TRIGGER_TYPES),
  triggerConfig: z.record(z.unknown()).default({}),
  messageTemplate: z.string().min(5),
  moduleKey: z.string().optional(),
  routePattern: z.string().optional(),
  priority: z.number().int().default(0),
  maxShowsPerUser: z.number().int().default(1),
  cooldownHours: z.number().int().default(24),
});
export type CreateProactiveRuleInput = z.infer<typeof CreateProactiveRuleSchema>;

export const UpdateProactiveRuleSchema = z.object({
  triggerConfig: z.record(z.unknown()).optional(),
  messageTemplate: z.string().min(5).optional(),
  moduleKey: z.string().optional(),
  routePattern: z.string().optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
  maxShowsPerUser: z.number().int().optional(),
  cooldownHours: z.number().int().optional(),
});
export type UpdateProactiveRuleInput = z.infer<typeof UpdateProactiveRuleSchema>;

