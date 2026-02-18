import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Communication Mailers ──────────────────────────────────────

export const communicationMailers = pgTable(
  'communication_mailers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    mailerClass: text('mailer_class').notNull(),
    mailerAction: text('mailer_action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    recipientEmail: text('recipient_email'),
    recipientName: text('recipient_name'),
    fromToCcBcc: jsonb('from_to_cc_bcc'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_communication_mailers_tenant_entity').on(
      table.tenantId,
      table.entityType,
      table.entityId,
    ),
  ],
);

// ── Email Templates ────────────────────────────────────────────

export const emailTemplates = pgTable(
  'email_templates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    htmlPath: text('html_path'),
    cssPath: text('css_path'),
    logoPath: text('logo_path'),
    courseId: text('course_id'),
    originalBody: text('original_body'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('uq_email_templates_tenant_name').on(table.tenantId, table.name),
    index('idx_email_templates_tenant_course')
      .on(table.tenantId, table.courseId)
      .where(sql`course_id IS NOT NULL`),
  ],
);

// ── Email Template Fields ──────────────────────────────────────

export const emailTemplateFields = pgTable(
  'email_template_fields',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    templateId: text('template_id')
      .notNull()
      .references(() => emailTemplates.id, { onDelete: 'cascade' }),
    fieldName: text('field_name').notNull(),
    fieldDescription: text('field_description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_email_template_fields_tenant_template_field').on(
      table.tenantId,
      table.templateId,
      table.fieldName,
    ),
  ],
);

// ── Mass Messages ──────────────────────────────────────────────

export const massMessages = pgTable(
  'mass_messages',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull().default('draft'),
    recipientType: text('recipient_type'),
    recipientFilter: jsonb('recipient_filter'),
    sentCount: integer('sent_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_mass_messages_tenant_status').on(table.tenantId, table.status),
    index('idx_mass_messages_tenant_created').on(table.tenantId, table.createdAt),
  ],
);

// ── Posts ───────────────────────────────────────────────────────

export const posts = pgTable(
  'posts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    postType: text('post_type').notNull().default('announcement'),
    authorName: text('author_name'),
    title: text('title').notNull(),
    excerpt: text('excerpt'),
    content: text('content'),
    status: text('status').notNull().default('draft'),
    isPinned: boolean('is_pinned').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_posts_tenant_status_published').on(
      table.tenantId,
      table.status,
      table.publishedAt,
    ),
    index('idx_posts_tenant_post_type').on(table.tenantId, table.postType),
  ],
);

// ── Post Customer Groups ───────────────────────────────────────

export const postCustomerGroups = pgTable(
  'post_customer_groups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    customerGroupId: text('customer_group_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_post_customer_groups_tenant_post_group').on(
      table.tenantId,
      table.postId,
      table.customerGroupId,
    ),
  ],
);
