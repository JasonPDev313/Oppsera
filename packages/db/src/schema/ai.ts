import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── AI Conversations ────────────────────────────────────────────

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title'),
    chatType: text('chat_type').notNull().default('general'),
    userId: text('user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_conversations_tenant_user').on(table.tenantId, table.userId),
  ],
);

// ── AI Messages ─────────────────────────────────────────────────

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    intent: text('intent'),
    modelId: text('model_id'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    responseTimeMs: integer('response_time_ms'),
    feedbackAction: text('feedback_action'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_messages_tenant_conv_created').on(
      table.tenantId,
      table.conversationId,
      table.createdAt,
    ),
  ],
);

// ── AI Message Metadata ─────────────────────────────────────────

export const aiMessageMetadata = pgTable(
  'ai_message_metadata',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => aiMessages.id, { onDelete: 'cascade' }),
    toolCallerName: text('tool_caller_name'),
    toolCallName: text('tool_call_name'),
    toolCallInput: text('tool_call_input'),
    toolCallOutput: text('tool_call_output'),
    responseTimeMs: integer('response_time_ms'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    isSuccess: boolean('is_success').notNull().default(true),
    errorMessage: text('error_message'),
    modelId: text('model_id'),
    additionalMetadata: jsonb('additional_metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_message_metadata_tenant_message').on(table.tenantId, table.messageId),
  ],
);
