import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { MODULE_REGISTRY } from '@oppsera/core/entitlements';

export const GET = withMiddleware(
  async () => {
    return NextResponse.json({
      data: {
        modules: MODULE_REGISTRY.map((m) => ({
          key: m.key,
          name: m.name,
          phase: m.phase,
          description: m.description,
        })),
      },
    });
  },
  { public: true },
);
