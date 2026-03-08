import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';

// ── Feature Requests ─────────────────────────────────────────────
// Stores user-submitted feature requests, enhancement ideas, and bug reports.
// Schema MUST match migrations 0292 + 0293 exactly.

export const featureRequests = pgTable(
  'feature_requests',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id'),
    submittedBy: text('submitted_by').notNull(), // user ID
    submittedByName: text('submitted_by_name'),
    submittedByEmail: text('submitted_by_email'),

    // Classification
    requestType: text('request_type').notNull(), // 'feature' | 'enhancement' | 'bug'
    module: text('module').notNull(),
    submodule: text('submodule'),

    // Content
    title: text('title').notNull(),
    description: text('description').notNull(),
    businessImpact: text('business_impact'),
    priority: text('priority').notNull().default('medium'), // 'critical' | 'high' | 'medium' | 'low'
    additionalNotes: text('additional_notes'),
    currentWorkaround: text('current_workaround'),

    // Status tracking
    status: text('status').notNull().default('submitted'), // 'submitted' | 'under_review' | 'planned' | 'in_progress' | 'completed' | 'declined'
    adminNotes: text('admin_notes'),

    // Resolution tracking (migration 0293)
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
    resolvedByName: text('resolved_by_name'),
    voteCount: integer('vote_count').notNull().default(0),

    // Admin tagging (migration 0294)
    tags: text('tags').array(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_feature_requests_tenant').on(t.tenantId),
    index('idx_feature_requests_status').on(t.tenantId, t.status),
    index('idx_feature_requests_submitted_by').on(t.tenantId, t.submittedBy),
    index('idx_feature_requests_user_created').on(t.tenantId, t.submittedBy, t.createdAt),
    index('idx_feature_requests_vote_count').on(t.tenantId, t.voteCount, t.createdAt),
  ],
);

// ── Feature Request Votes ─────────────────────────────────────────

export const featureRequestVotes = pgTable(
  'feature_request_votes',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    featureRequestId: text('feature_request_id').notNull(),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_feature_request_vote').on(t.featureRequestId, t.userId),
    index('idx_fr_votes_request').on(t.featureRequestId),
    index('idx_fr_votes_user').on(t.tenantId, t.userId),
  ],
);

// ── Feature Request Attachments ───────────────────────────────────

export const featureRequestAttachments = pgTable(
  'feature_request_attachments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    featureRequestId: text('feature_request_id').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    dataUrl: text('data_url').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedBy: text('uploaded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_fr_attachments_request').on(t.featureRequestId),
  ],
);
