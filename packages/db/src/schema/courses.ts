import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  date,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── Courses ─────────────────────────────────────────────────────
export const courses = pgTable(
  'courses',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    name: text('name').notNull(),
    courseType: text('course_type').notNull().default('standard'),
    totalHoles: integer('total_holes').notNull().default(18),
    totalPar: integer('total_par'),
    slopeRating: numeric('slope_rating', { precision: 5, scale: 1 }),
    courseRating: numeric('course_rating', { precision: 5, scale: 1 }),
    greenGrassType: text('green_grass_type'),
    fairwayGrassType: text('fairway_grass_type'),
    yearBuilt: integer('year_built'),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_courses_tenant_location').on(table.tenantId, table.locationId)],
);

// ── Course Holes ────────────────────────────────────────────────
export const courseHoles = pgTable(
  'course_holes',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    holeNumber: integer('hole_number').notNull(),
    par: integer('par').notNull(),
    yardageWhite: integer('yardage_white'),
    yardageBlue: integer('yardage_blue'),
    yardageRed: integer('yardage_red'),
    handicap: integer('handicap'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_course_holes_tenant_course_hole').on(
      table.tenantId,
      table.courseId,
      table.holeNumber,
    ),
  ],
);

// ── Course Layouts ──────────────────────────────────────────────
export const courseLayouts = pgTable(
  'course_layouts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    title: text('title').notNull(),
    coordinateType: text('coordinate_type').notNull().default('gps'),
    isActive: boolean('is_active').notNull().default(true),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_course_layouts_tenant_course').on(table.tenantId, table.courseId)],
);

// ── Course Layout Holes ─────────────────────────────────────────
export const courseLayoutHoles = pgTable(
  'course_layout_holes',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    layoutId: text('layout_id')
      .notNull()
      .references(() => courseLayouts.id, { onDelete: 'cascade' }),
    holeNumber: integer('hole_number').notNull(),
    longitude: numeric('longitude', { precision: 11, scale: 8 }),
    latitude: numeric('latitude', { precision: 11, scale: 8 }),
    markerType: text('marker_type').notNull().default('pin'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_course_layout_holes_tenant_layout_hole').on(
      table.tenantId,
      table.layoutId,
      table.holeNumber,
    ),
  ],
);

// ── Course Blocked Users ────────────────────────────────────────
export const courseBlockedUsers = pgTable(
  'course_blocked_users',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    blockedUserId: text('blocked_user_id').notNull(),
    blockedBy: text('blocked_by'),
    isGolfer: boolean('is_golfer').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_course_blocked_users_tenant_course_user').on(
      table.tenantId,
      table.courseId,
      table.blockedUserId,
    ),
  ],
);

// ── Course Suggestions ──────────────────────────────────────────
export const courseSuggestions = pgTable(
  'course_suggestions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    requestedBy: text('requested_by'),
    requestedServices: text('requested_services'),
    nearbyCourseId: text('nearby_course_id'),
    status: text('status').notNull().default('pending'),
    notes: text('notes'),
    deviceInfo: text('device_info'),
    platform: text('platform'),
    coordinates: jsonb('coordinates'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_course_suggestions_tenant_status').on(table.tenantId, table.status)],
);

// ── Course Layout Rec Dates ────────────────────────────────────
export const courseLayoutRecDates = pgTable(
  'course_layout_rec_dates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseLayoutId: text('course_layout_id')
      .notNull()
      .references(() => courseLayouts.id, { onDelete: 'cascade' }),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    recDate: timestamp('rec_date', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_course_layout_rec_dates_tenant_layout').on(table.tenantId, table.courseLayoutId),
  ],
);

// ── Course Suggestion Coordinates ─────────────────────────────
export const courseSuggestionCoordinates = pgTable(
  'course_suggestion_coordinates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    status: text('status').notNull().default('pending'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_course_suggestion_coordinates_tenant_course').on(table.tenantId, table.courseId),
  ],
);

// ── Course Suggestion Coordinate Details ──────────────────────
export const courseSuggestionCoordinateDetails = pgTable(
  'course_suggestion_coordinate_details',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    suggestionCoordinateId: text('suggestion_coordinate_id')
      .notNull()
      .references(() => courseSuggestionCoordinates.id, { onDelete: 'cascade' }),
    holeNumber: integer('hole_number').notNull(),
    longitude: numeric('longitude', { precision: 11, scale: 8 }),
    latitude: numeric('latitude', { precision: 11, scale: 8 }),
    markerType: text('marker_type').notNull().default('pin'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_course_suggestion_coord_details_tenant_coord').on(
      table.tenantId,
      table.suggestionCoordinateId,
    ),
  ],
);

// ── Channel Partner Course Availability ─────────────────────────
export const channelPartnerCourseAvailability = pgTable(
  'channel_partner_course_availability',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    partnerCode: text('partner_code').notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_cp_course_avail_tenant_course_partner').on(
      table.tenantId,
      table.courseId,
      table.partnerCode,
    ),
  ],
);

// ── Channel Partner Rate Availability ───────────────────────────
export const channelPartnerRateAvailability = pgTable(
  'channel_partner_rate_availability',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    partnerCode: text('partner_code').notNull(),
    rackRateId: text('rack_rate_id'),
    classRuleId: text('class_rule_id'),
    isAvailable: boolean('is_available').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_cp_rate_avail_tenant_partner').on(table.tenantId, table.partnerCode),
  ],
);
