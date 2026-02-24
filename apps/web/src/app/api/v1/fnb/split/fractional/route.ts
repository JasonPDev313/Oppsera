import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: { code: 'NOT_IMPLEMENTED', message: 'Fractional Item Split — Coming Soon' } },
    { status: 501 },
  );
}
