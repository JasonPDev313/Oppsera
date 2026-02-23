import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: { code: 'NOT_IMPLEMENTED', message: 'Loyalty Point Redemption — Coming Soon' } },
    { status: 501 },
  );
}
