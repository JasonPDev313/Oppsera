import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { aggregateQualityDaily } from '@oppsera/module-semantic';

export const POST = withAdminAuth(
  async (req: NextRequest) => {
    const body = await req.json().catch(() => ({}));
    const { tenantId, date } = body as { tenantId?: string; date?: string };

    const result = await aggregateQualityDaily({
      tenantId: tenantId ?? undefined,
      dateRange: date ? { start: date, end: date } : undefined,
    });

    return NextResponse.json({ data: result });
  },
  'admin',
);
