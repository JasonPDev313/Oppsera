import { z } from 'zod';

const idempotencyMixin = {
  clientRequestId: z.string().min(1).max(128).optional(),
};

// ── Room schemas ────────────────────────────────────────────────

export const createRoomSchema = z.object({
  ...idempotencyMixin,
  name: z.string().min(1).max(200),
  locationId: z.string().min(1),
  description: z.string().max(1000).optional(),
  widthFt: z.number().positive().max(9999),
  heightFt: z.number().positive().max(9999),
  gridSizeFt: z.number().positive().max(50).optional(),
  scalePxPerFt: z.number().int().positive().max(200).optional(),
  unit: z.enum(['feet', 'meters']).optional(),
  defaultMode: z.enum(['dining', 'banquet', 'cocktail', 'theater', 'custom']).optional(),
});
export type CreateRoomInput = z.input<typeof createRoomSchema>;

export const updateRoomSchema = z.object({
  ...idempotencyMixin,
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  widthFt: z.number().positive().max(9999).optional(),
  heightFt: z.number().positive().max(9999).optional(),
  gridSizeFt: z.number().positive().max(50).optional(),
  scalePxPerFt: z.number().int().positive().max(200).optional(),
  unit: z.enum(['feet', 'meters']).optional(),
  defaultMode: z.enum(['dining', 'banquet', 'cocktail', 'theater', 'custom']).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateRoomInput = z.input<typeof updateRoomSchema>;

// ── Version schemas ─────────────────────────────────────────────

export const saveDraftSchema = z.object({
  ...idempotencyMixin,
  snapshotJson: z.record(z.unknown()),
});
export type SaveDraftInput = z.input<typeof saveDraftSchema>;

export const publishVersionSchema = z.object({
  ...idempotencyMixin,
  publishNote: z.string().max(500).optional(),
});
export type PublishVersionInput = z.input<typeof publishVersionSchema>;

// ── Template schemas ────────────────────────────────────────────

export const createTemplateSchema = z.object({
  ...idempotencyMixin,
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.enum(['dining', 'banquet', 'bar', 'patio', 'custom']).optional(),
  snapshotJson: z.record(z.unknown()),
  widthFt: z.number().positive().max(9999),
  heightFt: z.number().positive().max(9999),
});
export type CreateTemplateInput = z.input<typeof createTemplateSchema>;

// ── List filter schema ──────────────────────────────────────────

export const roomListFilterSchema = z.object({
  locationId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type RoomListFilterInput = z.input<typeof roomListFilterSchema>;
