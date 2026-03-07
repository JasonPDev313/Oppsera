import { NextResponse } from 'next/server';
import { listSignupBusinessTypes } from '@oppsera/module-business-types';

// Public, unauthenticated endpoint
// Returns only: published versions + is_active = true + show_at_signup = true
// Cacheable — stale-while-revalidate 60s

export async function GET() {
  const types = await listSignupBusinessTypes();

  return NextResponse.json(
    { data: types },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60',
      },
    },
  );
}
