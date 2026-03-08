import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, featureRequests, featureRequestAttachments } from '@oppsera/db';

// ── GET: single attachment with full dataUrl ─────────────────────

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const segments = new URL(_request.url).pathname.split('/').filter(Boolean);
    const frIdx = segments.indexOf('feature-requests');
    const featureRequestId = segments[frIdx + 1]!;
    const attachmentId = segments[segments.length - 1]!;

    const result = await withTenant(ctx.tenantId, async (tx) => {
      // Verify the feature request exists and belongs to this user
      const [fr] = await tx
        .select({ id: featureRequests.id, submittedBy: featureRequests.submittedBy })
        .from(featureRequests)
        .where(
          and(
            eq(featureRequests.id, featureRequestId),
            eq(featureRequests.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!fr) {
        return { error: 'NOT_FOUND' as const, data: null };
      }

      if (fr.submittedBy !== ctx.user.id) {
        return { error: 'FORBIDDEN' as const, data: null };
      }

      const [attachment] = await tx
        .select({
          id: featureRequestAttachments.id,
          fileName: featureRequestAttachments.fileName,
          mimeType: featureRequestAttachments.mimeType,
          dataUrl: featureRequestAttachments.dataUrl,
          sizeBytes: featureRequestAttachments.sizeBytes,
          createdAt: featureRequestAttachments.createdAt,
        })
        .from(featureRequestAttachments)
        .where(
          and(
            eq(featureRequestAttachments.id, attachmentId),
            eq(featureRequestAttachments.featureRequestId, featureRequestId),
          ),
        )
        .limit(1);

      if (!attachment) {
        return { error: 'ATTACHMENT_NOT_FOUND' as const, data: null };
      }

      return { error: null, data: attachment };
    });

    if (result.error === 'NOT_FOUND') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Feature request not found' } },
        { status: 404 },
      );
    }

    if (result.error === 'FORBIDDEN') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You can only view attachments on your own feature requests' } },
        { status: 403 },
      );
    }

    if (result.error === 'ATTACHMENT_NOT_FOUND') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Attachment not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result.data });
  },
  { entitlement: 'platform_core', permission: 'dashboard.view' },
);

// ── DELETE: remove attachment ────────────────────────────────────

export const DELETE = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const segments = new URL(_request.url).pathname.split('/').filter(Boolean);
    const frIdx = segments.indexOf('feature-requests');
    const featureRequestId = segments[frIdx + 1]!;
    const attachmentId = segments[segments.length - 1]!;

    const result = await withTenant(ctx.tenantId, async (tx) => {
      // Verify the feature request exists and belongs to this user
      const [fr] = await tx
        .select({ id: featureRequests.id, submittedBy: featureRequests.submittedBy })
        .from(featureRequests)
        .where(
          and(
            eq(featureRequests.id, featureRequestId),
            eq(featureRequests.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!fr) {
        return 'NOT_FOUND' as const;
      }

      if (fr.submittedBy !== ctx.user.id) {
        return 'FORBIDDEN' as const;
      }

      // Verify the attachment exists
      const [attachment] = await tx
        .select({ id: featureRequestAttachments.id })
        .from(featureRequestAttachments)
        .where(
          and(
            eq(featureRequestAttachments.id, attachmentId),
            eq(featureRequestAttachments.featureRequestId, featureRequestId),
          ),
        )
        .limit(1);

      if (!attachment) {
        return 'ATTACHMENT_NOT_FOUND' as const;
      }

      await tx
        .delete(featureRequestAttachments)
        .where(eq(featureRequestAttachments.id, attachmentId));

      return null;
    });

    if (result === 'NOT_FOUND') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Feature request not found' } },
        { status: 404 },
      );
    }

    if (result === 'FORBIDDEN') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You can only delete attachments on your own feature requests' } },
        { status: 403 },
      );
    }

    if (result === 'ATTACHMENT_NOT_FOUND') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Attachment not found' } },
        { status: 404 },
      );
    }

    return new NextResponse(null, { status: 204 });
  },
  { entitlement: 'platform_core', permission: 'dashboard.view' },
);
