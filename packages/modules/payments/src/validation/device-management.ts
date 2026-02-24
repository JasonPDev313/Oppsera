import { z } from 'zod';

export const assignDeviceSchema = z.object({
  terminalId: z.string().min(1, 'Terminal ID is required'),
  providerId: z.string().min(1, 'Provider ID is required'),
  hsn: z.string().min(1, 'Hardware Serial Number (HSN) is required').max(50),
  deviceModel: z.string().optional(),
  deviceLabel: z.string().max(100).optional(),
});

export type AssignDeviceInput = z.input<typeof assignDeviceSchema>;

export const updateDeviceAssignmentSchema = z.object({
  id: z.string().min(1),
  hsn: z.string().min(1).max(50).optional(),
  deviceModel: z.string().nullable().optional(),
  deviceLabel: z.string().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateDeviceAssignmentInput = z.input<typeof updateDeviceAssignmentSchema>;

export const removeDeviceAssignmentSchema = z.object({
  id: z.string().min(1),
});

export type RemoveDeviceAssignmentInput = z.input<typeof removeDeviceAssignmentSchema>;
