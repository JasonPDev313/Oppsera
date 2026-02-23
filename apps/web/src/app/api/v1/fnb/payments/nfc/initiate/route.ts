import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: { code: 'NOT_IMPLEMENTED', message: 'NFC Tap-to-Pay — Coming Soon' } },
    { status: 501 },
  );
}
