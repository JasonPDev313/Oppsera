import { z } from 'zod';
import { FEEDBACK_TAGS } from './types';

// ── User Feedback ───────────────────────────────────────────────

export const userFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  thumbsUp: z.boolean().optional(),
  text: z.string().max(2000).optional(),
  tags: z
    .array(z.enum(FEEDBACK_TAGS as [string, ...string[]]))
    .max(10)
    .optional(),
});

export type UserFeedbackBody = z.input<typeof userFeedbackSchema>;
export type UserFeedbackParsed = z.infer<typeof userFeedbackSchema>;

// ── Admin Review ────────────────────────────────────────────────

export const adminReviewSchema = z.object({
  score: z.number().int().min(1).max(5),
  verdict: z.enum([
    'correct',
    'partially_correct',
    'incorrect',
    'hallucination',
    'needs_improvement',
  ]),
  notes: z.string().max(5000).optional(),
  correctedPlan: z.record(z.unknown()).optional(),
  correctedNarrative: z.string().max(10000).optional(),
  actionTaken: z.enum([
    'none',
    'added_to_examples',
    'adjusted_metric',
    'filed_bug',
    'updated_lens',
  ]),
});

export type AdminReviewBody = z.input<typeof adminReviewSchema>;
export type AdminReviewParsed = z.infer<typeof adminReviewSchema>;

// ── Promote to Example ──────────────────────────────────────────

export const promoteExampleSchema = z.object({
  category: z.enum([
    'sales',
    'golf',
    'inventory',
    'customer',
    'comparison',
    'trend',
    'anomaly',
  ]),
  difficulty: z.enum(['simple', 'medium', 'complex']),
});

export type PromoteExampleBody = z.input<typeof promoteExampleSchema>;
export type PromoteExampleParsed = z.infer<typeof promoteExampleSchema>;

// ── Eval Feed Filters ───────────────────────────────────────────

export const feedFilterSchema = z.object({
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
  status: z.enum(['unreviewed', 'reviewed', 'flagged', 'all']).default('all'),
  minUserRating: z.coerce.number().int().min(1).max(5).optional(),
  maxUserRating: z.coerce.number().int().min(1).max(5).optional(),
  adminVerdict: z
    .enum([
      'correct',
      'partially_correct',
      'incorrect',
      'hallucination',
      'needs_improvement',
    ])
    .optional(),
  qualityFlags: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .optional(),
  userRole: z.string().optional(),
  lensId: z.string().optional(),
  search: z.string().max(200).optional(),
  sortBy: z
    .enum(['newest', 'lowest_rated', 'lowest_confidence', 'slowest', 'most_flagged'])
    .default('newest'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  tenantId: z.string().optional(), // admin-only filter
});

export type FeedFilterBody = z.input<typeof feedFilterSchema>;
export type FeedFilterParsed = z.infer<typeof feedFilterSchema>;
