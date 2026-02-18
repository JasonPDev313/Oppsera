import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  time,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Charities ─────────────────────────────────────────────────────

export const charities = pgTable(
  'charities',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    creditChartOfAccountId: text('credit_chart_of_account_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_charities_tenant_name').on(table.tenantId, table.name)],
);

// ── Feedback ──────────────────────────────────────────────────────

export const feedback = pgTable(
  'feedback',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id'),
    feedbackText: text('feedback_text').notNull(),
    sendTo: text('send_to'),
    isRead: boolean('is_read').notNull().default(false),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_feedback_tenant_status').on(table.tenantId, table.status)],
);

// ── Flag Types ────────────────────────────────────────────────────

export const flagTypes = pgTable(
  'flag_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_flag_types_tenant_name').on(table.tenantId, table.name)],
);

// ── File Storage ──────────────────────────────────────────────────

export const fileStorage = pgTable(
  'file_storage',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    url: text('url').notNull(),
    fileName: text('file_name'),
    contentType: text('content_type'),
    fileSizeBytes: integer('file_size_bytes'),
    attachmentType: text('attachment_type'),
    filePath: text('file_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_file_storage_tenant_entity').on(table.tenantId, table.entityType, table.entityId),
  ],
);

// ── Tasks ─────────────────────────────────────────────────────────

export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    description: text('description'),
    requestedBy: text('requested_by'),
    dueDate: date('due_date'),
    taskStatus: text('task_status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_tasks_tenant_status').on(table.tenantId, table.taskStatus)],
);

// ── Task Owners ───────────────────────────────────────────────────

export const taskOwners = pgTable(
  'task_owners',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_task_owners_tenant_task_employee').on(
      table.tenantId,
      table.taskId,
      table.employeeId,
    ),
  ],
);

// ── Repetition Rules ──────────────────────────────────────────────

export const repetitionRules = pgTable(
  'repetition_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    repeatableType: text('repeatable_type').notNull(),
    repeatableId: text('repeatable_id').notNull(),
    frequency: text('frequency').notNull(),
    intervalValue: integer('interval_value').notNull().default(1),
    intervalUnit: text('interval_unit').notNull().default('week'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    endType: text('end_type').notNull().default('date'),
    maxOccurrences: integer('max_occurrences'),
    daysOfWeek: jsonb('days_of_week'),
    monthlyRepetitionType: text('monthly_repetition_type'),
    summary: text('summary'),
    repetitionId: text('repetition_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_repetition_rules_tenant_repeatable').on(
      table.tenantId,
      table.repeatableType,
      table.repeatableId,
    ),
  ],
);

// ── Repetition Rule Interpretations ───────────────────────────────

export const repetitionRuleInterpretations = pgTable(
  'repetition_rule_interpretations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    repeatableType: text('repeatable_type').notNull(),
    repeatableId: text('repeatable_id').notNull(),
    repetitionRuleId: text('repetition_rule_id')
      .notNull()
      .references(() => repetitionRules.id, { onDelete: 'cascade' }),
    firstOccurrenceDate: date('first_occurrence_date').notNull(),
    dayDifference: integer('day_difference').notNull().default(0),
    repetitionId: text('repetition_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_repetition_rule_interpretations_tenant_rule').on(
      table.tenantId,
      table.repetitionRuleId,
    ),
  ],
);

// ── Report Options ────────────────────────────────────────────────

export const reportOptions = pgTable(
  'report_options',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    value: jsonb('value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_report_options_tenant_name').on(table.tenantId, table.name)],
);

// ── Lottery Schedules ─────────────────────────────────────────────

export const lotterySchedules = pgTable(
  'lottery_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    lotteryName: text('lottery_name').notNull(),
    monday: boolean('monday').notNull().default(false),
    tuesday: boolean('tuesday').notNull().default(false),
    wednesday: boolean('wednesday').notNull().default(false),
    thursday: boolean('thursday').notNull().default(false),
    friday: boolean('friday').notNull().default(false),
    saturday: boolean('saturday').notNull().default(false),
    sunday: boolean('sunday').notNull().default(false),
    startMonth: integer('start_month'),
    startDay: integer('start_day'),
    endMonth: integer('end_month'),
    endDay: integer('end_day'),
    startTime: time('start_time'),
    endTime: time('end_time'),
    bookingWindowStart: integer('booking_window_start'),
    bookingWindowEnd: integer('booking_window_end'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_lottery_schedules_tenant_course').on(table.tenantId, table.courseId),
  ],
);

// ── Lottery Class Types ───────────────────────────────────────────

export const lotteryClassTypes = pgTable(
  'lottery_class_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    lotteryScheduleId: text('lottery_schedule_id')
      .notNull()
      .references(() => lotterySchedules.id, { onDelete: 'cascade' }),
    classTypeId: text('class_type_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_lottery_class_types_tenant_schedule').on(table.tenantId, table.lotteryScheduleId),
  ],
);

// ── Lottery Requests ──────────────────────────────────────────────

export const lotteryRequests = pgTable(
  'lottery_requests',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    startTime: time('start_time').notNull(),
    earliestStartTime: time('earliest_start_time'),
    latestStartTime: time('latest_start_time'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_lottery_requests_tenant_course').on(table.tenantId, table.courseId)],
);

// ── Game Play Rounds ──────────────────────────────────────────────

export const gamePlayRounds = pgTable(
  'game_play_rounds',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id').notNull(),
    customerId: text('customer_id').notNull(),
    roundStartFrom: text('round_start_from'),
    scoringType: text('scoring_type'),
    teeType: text('tee_type'),
    isQuit: boolean('is_quit').notNull().default(false),
    weatherData: jsonb('weather_data'),
    status: text('status').notNull().default('in_progress'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_game_play_rounds_tenant_course_customer').on(
      table.tenantId,
      table.courseId,
      table.customerId,
    ),
  ],
);

// ── Game Play Player Info ─────────────────────────────────────────

export const gamePlayPlayerInfo = pgTable(
  'game_play_player_info',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    roundId: text('round_id')
      .notNull()
      .references(() => gamePlayRounds.id, { onDelete: 'cascade' }),
    playerNumber: integer('player_number').notNull(),
    playerName: text('player_name').notNull(),
    customerId: text('customer_id'),
    imageUrl: text('image_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_game_play_player_info_tenant_round').on(table.tenantId, table.roundId),
  ],
);

// ── Game Play Score Cards ─────────────────────────────────────────

export const gamePlayScoreCards = pgTable(
  'game_play_score_cards',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    roundId: text('round_id')
      .notNull()
      .references(() => gamePlayRounds.id, { onDelete: 'cascade' }),
    holeNumber: integer('hole_number').notNull(),
    distance: integer('distance'),
    par: integer('par').notNull(),
    scores: jsonb('scores').notNull(),
    fairways: jsonb('fairways'),
    putts: jsonb('putts'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_game_play_score_cards_tenant_round_hole').on(
      table.tenantId,
      table.roundId,
      table.holeNumber,
    ),
  ],
);

// ── Game Play Score Shots ─────────────────────────────────────────

export const gamePlayScoreShots = pgTable(
  'game_play_score_shots',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    roundId: text('round_id')
      .notNull()
      .references(() => gamePlayRounds.id, { onDelete: 'cascade' }),
    holeNumber: integer('hole_number').notNull(),
    playerId: text('player_id')
      .notNull()
      .references(() => gamePlayPlayerInfo.id, { onDelete: 'cascade' }),
    shotType: text('shot_type'),
    shotClub: text('shot_club'),
    shotResult: text('shot_result'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_game_play_score_shots_tenant_round_hole').on(
      table.tenantId,
      table.roundId,
      table.holeNumber,
    ),
  ],
);
