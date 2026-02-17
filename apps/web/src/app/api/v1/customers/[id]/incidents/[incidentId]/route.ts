import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateIncident, updateIncidentSchema } from '@oppsera/module-customers';

function extractIncidentId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// PATCH /api/v1/customers/:id/incidents/:incidentId — update customer incident
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const incidentId = extractIncidentId(request);
    const body = await request.json();
    const parsed = updateIncidentSchema.safeParse({ ...body, incidentId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const incident = await updateIncident(ctx, parsed.data);
    return NextResponse.json({ data: incident });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
