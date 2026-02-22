import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateCustomerNote,
  updateCustomerNoteSchema,
  removeCustomerNote,
  removeCustomerNoteSchema,
} from '@oppsera/module-customers';

function extractNoteId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const noteId = extractNoteId(request);
    const body = await request.json();
    const parsed = updateCustomerNoteSchema.safeParse({ ...body, noteId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const updated = await updateCustomerNote(ctx, parsed.data);
    return NextResponse.json({ data: updated });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const noteId = extractNoteId(request);
    await removeCustomerNote(ctx, { noteId });
    return NextResponse.json({ data: { id: noteId, deleted: true } });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
