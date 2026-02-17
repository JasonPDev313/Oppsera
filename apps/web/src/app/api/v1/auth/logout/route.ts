import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAuthAdapter } from '@oppsera/core/auth/get-adapter';

export const POST = withMiddleware(async (request) => {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';

  const adapter = getAuthAdapter();
  await adapter.signOut(token);

  return new NextResponse(null, { status: 204 });
});
