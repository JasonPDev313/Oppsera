import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getGuestPortalFolio } from '@oppsera/module-pms';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  // .../guest-portal/[token]/folio -> token is segments[length-2]
  const token = segments[segments.length - 2]!;

  try {
    const folio = await getGuestPortalFolio(token);
    if (!folio) {
      return NextResponse.json(
        { error: { code: 'FOLIO_NOT_FOUND', message: 'No folio found for this reservation' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: folio });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const status = error.statusCode ?? 404;
    return NextResponse.json(
      { error: { code: error.code ?? 'SESSION_NOT_FOUND', message: error.message ?? 'Invalid or expired portal session' } },
      { status },
    );
  }
}
