import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, featureRequests, featureRequestAttachments } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

// ── Validation ──────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
const MAX_DATA_URL_LENGTH = 700_000; // ~500KB actual
const MAX_SIZE_BYTES = 524_288; // 512KB
const MAX_ATTACHMENTS_PER_REQUEST = 3;

const uploadAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  dataUrl: z.string().min(1).max(MAX_DATA_URL_LENGTH),
});

// ── POST: upload attachment ──────────────────────────────────────

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = new URL(request.url).pathname.split('/').filter(Boolean);
    const featureRequestId = segments[segments.indexOf('feature-requests') + 1]!;

    // Safe JSON parse
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } },
        { status: 400 },
      );
    }

    const parsed = uploadAttachmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input' } },
        { status: 400 },
      );
    }

    // Calculate approximate file size from base64 data URL
    const sizeBytes = Math.ceil(parsed.data.dataUrl.length * 3 / 4);
    if (sizeBytes > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: { code: 'FILE_TOO_LARGE', message: 'Attachment exceeds 512KB limit' } },
        { status: 400 },
      );
    }

    const id = generateUlid();

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
        return { error: 'NOT_FOUND' as const };
      }

      if (fr.submittedBy !== ctx.user.id) {
        return { error: 'FORBIDDEN' as const };
      }

      // Check attachment count limit
      const [countResult] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(featureRequestAttachments)
        .where(eq(featureRequestAttachments.featureRequestId, featureRequestId));

      if ((countResult?.count ?? 0) >= MAX_ATTACHMENTS_PER_REQUEST) {
        return { error: 'LIMIT_REACHED' as const };
      }

      // Insert attachment
      await tx.insert(featureRequestAttachments).values({
        id,
        tenantId: ctx.tenantId,
        featureRequestId,
        fileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType,
        dataUrl: parsed.data.dataUrl,
        sizeBytes,
        uploadedBy: ctx.user.id,
      });

      return { error: null };
    });

    if (result.error === 'NOT_FOUND') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Feature request not found' } },
        { status: 404 },
      );
    }

    if (result.error === 'FORBIDDEN') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You can only attach files to your own feature requests' } },
        { status: 403 },
      );
    }

    if (result.error === 'LIMIT_REACHED') {
      return NextResponse.json(
        { error: { code: 'LIMIT_REACHED', message: `Maximum ${MAX_ATTACHMENTS_PER_REQUEST} attachments per request` } },
        { status: 400 },
      );
    }

    return NextResponse.json({ data: { id } }, { status: 201 });
  },
  { entitlement: 'platform_core', permission: 'dashboard.view' },
);

// ── GET: list attachments ────────────────────────────────────────

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const segments = new URL(_request.url).pathname.split('/').filter(Boolean);
    const featureRequestId = segments[segments.indexOf('feature-requests') + 1]!;

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
        return { error: 'NOT_FOUND' as const, data: [] };
      }

      if (fr.submittedBy !== ctx.user.id) {
        return { error: 'FORBIDDEN' as const, data: [] };
      }

      const rows = await tx
        .select({
          id: featureRequestAttachments.id,
          fileName: featureRequestAttachments.fileName,
          mimeType: featureRequestAttachments.mimeType,
          sizeBytes: featureRequestAttachments.sizeBytes,
          createdAt: featureRequestAttachments.createdAt,
        })
        .from(featureRequestAttachments)
        .where(eq(featureRequestAttachments.featureRequestId, featureRequestId));

      return { error: null, data: Array.from(rows as Iterable<(typeof rows)[number]>) };
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

    return NextResponse.json({ data: result.data });
  },
  { entitlement: 'platform_core', permission: 'dashboard.view' },
);
