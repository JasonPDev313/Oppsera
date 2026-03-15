import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  jsonb,
  customType,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── pgvector custom type ──────────────────────────────────────────
// drizzle-orm does not have a built-in vector type.
// We store it as text in the ORM layer; the actual column type is
// vector(1536) created by the migration. Raw SQL is used for
// cosine-similarity queries.
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(Number);
  },
});

// ═══════════════════════════════════════════════════════════════════
// AI SUPPORT ASSISTANT — Tables
// ═══════════════════════════════════════════════════════════════════

// ── Threads ──────────────────────────────────────────────────────
export const aiAssistantThreads = pgTable(
  'ai_assistant_threads',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id').notNull(),
    sessionId: text('session_id'),
    channel: text('channel').notNull().default('in_app'),
    currentRoute: text('current_route'),
    moduleKey: text('module_key'),
    status: text('status').notNull().default('open'),
    questionType: text('question_type'),
    outcome: text('outcome'),
    issueTag: text('issue_tag'),
    summary: text('summary'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_threads_tenant_user').on(table.tenantId, table.userId),
    index('idx_ai_threads_tenant_status').on(table.tenantId, table.status),
    index('idx_ai_threads_tenant_module').on(table.tenantId, table.moduleKey),
    index('idx_ai_threads_created').on(table.tenantId, table.createdAt),
  ],
);

// ── Messages ─────────────────────────────────────────────────────
export const aiAssistantMessages = pgTable(
  'ai_assistant_messages',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    threadId: text('thread_id')
      .notNull()
      .references(() => aiAssistantThreads.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    messageText: text('message_text').notNull(),
    modelName: text('model_name'),
    promptVersion: text('prompt_version'),
    answerConfidence: text('answer_confidence'),
    sourceTierUsed: text('source_tier_used'),
    citationsJson: jsonb('citations_json'),
    retrievalTraceJson: jsonb('retrieval_trace_json'),
    feedbackStatus: text('feedback_status'),
    sentiment: text('sentiment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_messages_thread_created').on(table.threadId, table.createdAt),
    index('idx_ai_messages_tenant_created').on(table.tenantId, table.createdAt),
  ],
);

// ── Context Snapshots ────────────────────────────────────────────
export const aiAssistantContextSnapshots = pgTable(
  'ai_assistant_context_snapshots',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    threadId: text('thread_id')
      .notNull()
      .references(() => aiAssistantThreads.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => aiAssistantMessages.id, { onDelete: 'cascade' }),
    route: text('route'),
    screenTitle: text('screen_title'),
    moduleKey: text('module_key'),
    roleKeysJson: jsonb('role_keys_json'),
    featureFlagsJson: jsonb('feature_flags_json'),
    enabledModulesJson: jsonb('enabled_modules_json'),
    visibleActionsJson: jsonb('visible_actions_json'),
    selectedRecordJson: jsonb('selected_record_json'),
    uiStateJson: jsonb('ui_state_json'),
    tenantSettingsJson: jsonb('tenant_settings_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_context_thread').on(table.threadId),
    index('idx_ai_context_message').on(table.messageId),
  ],
);

// ── Feedback ─────────────────────────────────────────────────────
export const aiAssistantFeedback = pgTable(
  'ai_assistant_feedback',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    messageId: text('message_id')
      .notNull()
      .references(() => aiAssistantMessages.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    rating: text('rating').notNull(),
    reasonCode: text('reason_code'),
    freeformComment: text('freeform_comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_ai_feedback_message_user').on(table.messageId, table.userId),
    index('idx_ai_feedback_tenant_rating').on(table.tenantId, table.rating),
  ],
);

// ── Reviews ──────────────────────────────────────────────────────
export const aiAssistantReviews = pgTable(
  'ai_assistant_reviews',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    threadId: text('thread_id')
      .notNull()
      .references(() => aiAssistantThreads.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => aiAssistantMessages.id, { onDelete: 'cascade' }),
    reviewerUserId: text('reviewer_user_id').notNull(),
    reviewStatus: text('review_status').notNull(),
    reviewNotes: text('review_notes'),
    correctedAnswer: text('corrected_answer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_reviews_thread').on(table.threadId),
    index('idx_ai_reviews_status').on(table.reviewStatus),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// KNOWLEDGE LAYER
// ═══════════════════════════════════════════════════════════════════

// ── Support Documents ────────────────────────────────────────────
export const aiSupportDocuments = pgTable(
  'ai_support_documents',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .references(() => tenants.id),
    sourceType: text('source_type').notNull(),
    sourceRef: text('source_ref'),
    repoSha: text('repo_sha'),
    moduleKey: text('module_key'),
    route: text('route'),
    title: text('title'),
    contentMarkdown: text('content_markdown'),
    metadataJson: jsonb('metadata_json'),
    // vector(1536) column — populated by the embedding pipeline.
    // Similarity queries use raw SQL with <=> (cosine distance).
    embedding: vector('embedding'),
    indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_docs_module_route').on(table.moduleKey, table.route),
    index('idx_ai_docs_source_type').on(table.sourceType),
    index('idx_ai_docs_tenant').on(table.tenantId),
    uniqueIndex('uq_ai_docs_source_ref').on(table.sourceRef),
  ],
);

// ── Answer Cards ─────────────────────────────────────────────────
export const aiSupportAnswerCards = pgTable(
  'ai_support_answer_cards',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .references(() => tenants.id),
    slug: text('slug').notNull(),
    moduleKey: text('module_key'),
    route: text('route'),
    questionPattern: text('question_pattern').notNull(),
    approvedAnswerMarkdown: text('approved_answer_markdown').notNull(),
    /** Compressed summary of the answer — sent to LLM for lower-ranked evidence (token savings). */
    summary: text('summary'),
    /** vector(1536) embedding of questionPattern + summary for semantic retrieval. */
    embedding: vector('embedding'),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('draft'),
    ownerUserId: text('owner_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_ai_answer_cards_slug').on(table.slug),
    index('idx_ai_answer_cards_module_route').on(table.moduleKey, table.route),
    index('idx_ai_answer_cards_status').on(table.status),
  ],
);

// ── Route Manifests ──────────────────────────────────────────────
export const aiSupportRouteManifests = pgTable(
  'ai_support_route_manifests',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .references(() => tenants.id),
    route: text('route').notNull(),
    moduleKey: text('module_key').notNull(),
    pageTitle: text('page_title').notNull(),
    description: text('description').notNull(),
    tabsJson: jsonb('tabs_json'),
    actionsJson: jsonb('actions_json'),
    permissionsJson: jsonb('permissions_json'),
    warningsJson: jsonb('warnings_json'),
    helpText: text('help_text'),
    repoSha: text('repo_sha'),
    ownerUserId: text('owner_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_ai_route_manifests_route').on(table.route),
    index('idx_ai_route_manifests_module').on(table.moduleKey),
  ],
);

// ── Action Manifests ─────────────────────────────────────────────
export const aiSupportActionManifests = pgTable(
  'ai_support_action_manifests',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .references(() => tenants.id),
    route: text('route').notNull(),
    actionLabel: text('action_label').notNull(),
    handlerDescription: text('handler_description'),
    preconditionsJson: jsonb('preconditions_json'),
    confirmations: text('confirmations'),
    successState: text('success_state'),
    failureState: text('failure_state'),
    permissionKey: text('permission_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_ai_action_manifests_route_label').on(table.route, table.actionLabel),
    index('idx_ai_action_manifests_route').on(table.route),
  ],
);

// ── Answer Memory ────────────────────────────────────────────────
export const aiAssistantAnswerMemory = pgTable(
  'ai_assistant_answer_memory',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .references(() => tenants.id),
    questionNormalized: text('question_normalized').notNull(),
    screenKey: text('screen_key'),
    moduleKey: text('module_key'),
    roleScope: text('role_scope'),
    tenantScope: text('tenant_scope').notNull().default('global'),
    answerMarkdown: text('answer_markdown').notNull(),
    sourceRefsJson: jsonb('source_refs_json'),
    sourceTierUsed: text('source_tier_used'),
    sourceCommitSha: text('source_commit_sha'),
    reviewStatus: text('review_status').notNull().default('pending'),
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    supersedesAnswerId: text('supersedes_answer_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_answer_memory_screen_module').on(table.screenKey, table.moduleKey),
    index('idx_ai_answer_memory_review_status').on(table.reviewStatus),
    index('idx_ai_answer_memory_question').on(table.questionNormalized),
  ],
);

// ── Content Invalidation ─────────────────────────────────────────
export const aiAssistantContentInvalidation = pgTable(
  'ai_assistant_content_invalidation',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    answerMemoryId: text('answer_memory_id')
      .references(() => aiAssistantAnswerMemory.id),
    answerCardId: text('answer_card_id')
      .references(() => aiSupportAnswerCards.id),
    invalidationReason: text('invalidation_reason').notNull(),
    changedFilesJson: jsonb('changed_files_json'),
    repoSha: text('repo_sha'),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_invalidation_memory').on(table.answerMemoryId),
    index('idx_ai_invalidation_card').on(table.answerCardId),
  ],
);

// ── Feature Gaps ────────────────────────────────────────────────
// Automatically captures questions the AI assistant cannot answer
// (low confidence / no evidence) and clusters them for backlog prioritization.
export const aiSupportFeatureGaps = pgTable(
  'ai_support_feature_gaps',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .references(() => tenants.id),
    questionNormalized: text('question_normalized').notNull(),
    questionHash: text('question_hash').notNull(),
    moduleKey: text('module_key'),
    route: text('route'),
    occurrenceCount: integer('occurrence_count').notNull().default(1),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    sampleQuestion: text('sample_question').notNull(),
    sampleThreadId: text('sample_thread_id'),
    sampleConfidence: text('sample_confidence'),
    status: text('status').notNull().default('open'),
    priority: text('priority').notNull().default('medium'),
    adminNotes: text('admin_notes'),
    featureRequestId: text('feature_request_id'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_feature_gaps_status').on(table.status),
    index('idx_ai_feature_gaps_frequency').on(table.occurrenceCount),
    index('idx_ai_feature_gaps_module').on(table.moduleKey),
    index('idx_ai_feature_gaps_tenant').on(table.tenantId),
  ],
);

// ── Escalations (Human Agent Handoff) ────────────────────────────
export const aiSupportEscalations = pgTable(
  'ai_support_escalations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    threadId: text('thread_id')
      .notNull()
      .references(() => aiAssistantThreads.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    summary: text('summary'),
    reason: text('reason').notNull().default('user_requested'),
    status: text('status').notNull().default('open'),
    priority: text('priority').notNull().default('medium'),
    assignedTo: text('assigned_to'),
    resolutionNotes: text('resolution_notes'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_escalations_tenant_status').on(table.tenantId, table.status),
    index('idx_ai_escalations_thread').on(table.threadId),
    index('idx_ai_escalations_created').on(table.createdAt),
  ],
);

// ── Agentic Action Audit Log ────────────────────────────────────
export const aiSupportAgenticActions = pgTable(
  'ai_support_agentic_actions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    threadId: text('thread_id')
      .notNull()
      .references(() => aiAssistantThreads.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .references(() => aiAssistantMessages.id, { onDelete: 'set null' }),
    actionName: text('action_name').notNull(),
    actionParams: jsonb('action_params'),
    actionResult: jsonb('action_result'),
    status: text('status').notNull().default('success'),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_agentic_actions_thread').on(table.threadId),
    index('idx_ai_agentic_actions_tenant').on(table.tenantId, table.createdAt),
  ],
);

// ── CSAT Predictions ────────────────────────────────────────────
export const aiSupportCsatPredictions = pgTable(
  'ai_support_csat_predictions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    threadId: text('thread_id')
      .notNull()
      .references(() => aiAssistantThreads.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    score: integer('score').notNull(),
    reasoning: text('reasoning'),
    modelUsed: text('model_used').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_ai_csat_thread').on(table.threadId),
    index('idx_ai_csat_tenant_created').on(table.tenantId, table.createdAt),
  ],
);

// ── Test Suite ──────────────────────────────────────────────────
export const aiSupportTestCases = pgTable(
  'ai_support_test_cases',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    question: text('question').notNull(),
    expectedAnswerPattern: text('expected_answer_pattern').notNull(),
    moduleKey: text('module_key'),
    route: text('route'),
    tags: jsonb('tags').default([]),
    enabled: text('enabled').notNull().default('true'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const aiSupportTestRuns = pgTable(
  'ai_support_test_runs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    name: text('name').notNull(),
    status: text('status').notNull().default('pending'),
    totalCases: integer('total_cases').notNull().default(0),
    passed: integer('passed').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    regressed: integer('regressed').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const aiSupportTestResults = pgTable(
  'ai_support_test_results',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    runId: text('run_id')
      .notNull()
      .references(() => aiSupportTestRuns.id, { onDelete: 'cascade' }),
    testCaseId: text('test_case_id')
      .notNull()
      .references(() => aiSupportTestCases.id, { onDelete: 'cascade' }),
    actualAnswer: text('actual_answer'),
    confidence: text('confidence'),
    sourceTier: text('source_tier'),
    passed: text('passed').notNull().default('false'),
    regression: text('regression').notNull().default('false'),
    score: text('score').default('0'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_test_results_run').on(table.runId),
    index('idx_ai_test_results_case').on(table.testCaseId),
  ],
);

// ── Conversation Tags ───────────────────────────────────────────
export const aiSupportConversationTags = pgTable(
  'ai_support_conversation_tags',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    threadId: text('thread_id')
      .notNull()
      .references(() => aiAssistantThreads.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tagType: text('tag_type').notNull(),
    tagValue: text('tag_value').notNull(),
    confidence: text('confidence').default('0.8'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_conv_tags_thread').on(table.threadId),
    index('idx_ai_conv_tags_tenant_type').on(table.tenantId, table.tagType),
    index('idx_ai_conv_tags_value').on(table.tagValue),
  ],
);

// ── Proactive Rules ─────────────────────────────────────────────
export const aiSupportProactiveRules = pgTable(
  'ai_support_proactive_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .references(() => tenants.id),
    triggerType: text('trigger_type').notNull(),
    triggerConfig: jsonb('trigger_config').notNull().default({}),
    messageTemplate: text('message_template').notNull(),
    moduleKey: text('module_key'),
    routePattern: text('route_pattern'),
    priority: integer('priority').notNull().default(0),
    enabled: text('enabled').notNull().default('true'),
    maxShowsPerUser: integer('max_shows_per_user').notNull().default(1),
    cooldownHours: integer('cooldown_hours').notNull().default(24),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_proactive_rules_enabled').on(table.enabled, table.triggerType),
    index('idx_ai_proactive_rules_tenant').on(table.tenantId),
  ],
);

export const aiSupportProactiveDismissals = pgTable(
  'ai_support_proactive_dismissals',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    ruleId: text('rule_id')
      .notNull()
      .references(() => aiSupportProactiveRules.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    shownAt: timestamp('shown_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_ai_proactive_dismissal_user_rule').on(table.ruleId, table.userId, table.tenantId),
  ],
);

// ── Embeddings Metadata ───────────────────────────────────────────
// Tracks which model/version generated each document embedding,
// so the pipeline can re-embed if the model is upgraded.
export const aiSupportEmbeddingsMeta = pgTable(
  'ai_support_embeddings_meta',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    documentId: text('document_id')
      .notNull()
      .references(() => aiSupportDocuments.id, { onDelete: 'cascade' }),
    modelName: text('model_name').notNull().default('text-embedding-3-small'),
    dimensions: integer('dimensions').notNull().default(1536),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_embeddings_meta_doc').on(table.documentId),
  ],
);
