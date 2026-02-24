import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticAlertNotifications } from '@oppsera/db';
import { ValidationError, NotFoundError } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function extractNotificationId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── Validation ────────────────────────────────────────────────────

const updateNotificationSchema = z.object({
  isRead: z.boolean().optional(),
  isDismissed: z.boolean().optional(),
  actionTaken: z.string().max(500).nullable().optional(),
});

// ── PATCH /api/v1/semantic/alerts/notifications/[id] ──────────────
// Mark notification as read, dismissed, or record action taken.

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractNotificationId(request);
    const body = await request.json();
    const parsed = updateNotificationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = parsed.data;
    const updates: Record<string, unknown> = {};

    if (data.isRead !== undefined) {
      updates.isRead = data.isRead;
      updates.readAt = data.isRead ? new Date() : null;
    }
    if (data.isDismissed !== undefined) {
      updates.isDismissed = data.isDismissed;
      updates.dismissedAt = data.isDismissed ? new Date() : null;
    }
    if (data.actionTaken !== undefined) {
      updates.actionTaken = data.actionTaken;
    }

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('Validation failed', [
        { field: 'body', message: 'At least one field (isRead, isDismissed, actionTaken) is required' },
      ]);
    }

    const [row] = await db
      .update(semanticAlertNotifications)
      .set(updates)
      .where(
        and(
          eq(semanticAlertNotifications.id, id),
          eq(semanticAlertNotifications.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Notification not found');
    }

    return NextResponse.json({
      data: {
        id: row.id,
        isRead: row.isRead,
        readAt: row.readAt ?? null,
        isDismissed: row.isDismissed,
        dismissedAt: row.dismissedAt ?? null,
        actionTaken: row.actionTaken ?? null,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
