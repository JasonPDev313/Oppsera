import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: { code: 'NOT_IMPLEMENTED', message: 'Donation Config — Coming Soon' } },
    { status: 501 },
  );
}
