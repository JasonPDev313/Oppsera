export const MODULE_KEY = 'ai_support' as const;
export const MODULE_NAME = 'AI Support Assistant';
export const MODULE_VERSION = '0.1.0';

export const MODULE_TABLES = [
  'ai_assistant_threads',
  'ai_assistant_messages',
  'ai_assistant_context_snapshots',
  'ai_assistant_feedback',
  'ai_assistant_reviews',
  'ai_support_documents',
  'ai_support_answer_cards',
  'ai_support_route_manifests',
  'ai_support_action_manifests',
  'ai_assistant_answer_memory',
  'ai_assistant_content_invalidation',
  'ai_support_embeddings_meta',
] as const;

export * from './types';
export * from './constants';

// Re-export commands
export { createThread, closeThread, sendMessage } from './commands/thread-commands';
export { submitFeedback } from './commands/feedback-commands';
export { submitReview, createAnswerCard, updateAnswerCard } from './commands/review-commands';
export type {
  ReviewStatus,
  SubmitReviewInput,
  CreateAnswerCardInput,
  UpdateAnswerCardInput,
} from './commands/review-commands';

// Re-export queries
export { listThreads, getThread, getThreadMessages } from './queries/thread-queries';
export type {
  ListThreadsInput,
  ListThreadsResult,
  ThreadListRow,
  ThreadDetail,
  GetThreadMessagesInput,
  GetThreadMessagesResult,
  MessageRow,
} from './queries/thread-queries';
export { listReviewQueue, listAnswerCards, getAnswerCard, listAnswerMemory } from './queries/review-queries';
export type {
  ReviewQueueFilters,
  ReviewQueueItem,
  AnswerCardFilters,
  AnswerMemoryFilters,
} from './queries/review-queries';

// Re-export services
export { loadRouteManifest, loadActionManifests, loadActiveAnswerCards } from './services/manifest-loader';
export { runOrchestrator } from './services/orchestrator';
export { runGitIndexer, getChangedFilesSince } from './services/git-indexer';
export type { GitIndexerOptions, GitIndexerResult } from './services/git-indexer';
export { summarizePR, ingestPR, ingestRelease } from './services/pr-summarizer';
export type { PRData, ReleaseData, PRSummaryResult, ReleaseIngestResult } from './services/pr-summarizer';
export { invalidateOnCodeChange, checkStaleness, getInvalidationHistory } from './services/content-invalidation';
export type { InvalidationRecord, InvalidateOnCodeChangeResult } from './services/content-invalidation';
export { generateEmbedding, embedDocuments, semanticSearch } from './services/embedding-pipeline';
export type { SemanticSearchResult } from './services/embedding-pipeline';
export { retrieveEvidence } from './services/retrieval';
export type { RetrievalResult, RetrieveEvidenceParams } from './services/retrieval';
export { sanitizeResponse, validateCustomerSafe } from './services/content-guard';
export { seedDemoData } from './services/seed-demo-data';
export { seedTrainingData } from './services/seed-training-data';
export { seedTrainingDataBatch2 } from './services/seed-training-data-batch2';
export { seedTrainingDataBatch3 } from './services/seed-training-data-batch3';
export { checkRateLimit, recordUsage, resetRateLimit, getUsageStats } from './services/rate-limiter';
export type { RateLimitType, RateLimitResult } from './services/rate-limiter';

// Re-export extractors
export { extractRoutes, extractPermissions, extractActions, extractWorkflows } from './extractors';
export type {
  ExtractedRoute,
  ExtractedPermission,
  ExtractedAction,
  ExtractedWorkflow,
} from './extractors';
