import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  purchasePackage,
  redeemPackageSession,
  voidPackageRedemption,
  freezePackage,
  unfreezePackage,
  transferPackage,
  expirePackages,
} from '@oppsera/module-spa';

const ACTIONS: Record<string, true> = {
  purchase: true,
  redeem: true,
  'void-redemption': true,
  freeze: true,
  unfreeze: true,
  transfer: true,
  expire: true,
};

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/spa/packages/balances/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const id = extractId(request);

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // No body is fine for simple transitions
    }

    switch (action) {
      case 'purchase': {
        const customerId = body.customerId as string;
        const packageDefId = body.packageDefId as string;
        if (!customerId || !packageDefId) {
          throw new ValidationError('Validation failed', [
            ...(!customerId ? [{ field: 'customerId', message: 'customerId is required' }] : []),
            ...(!packageDefId ? [{ field: 'packageDefId', message: 'packageDefId is required' }] : []),
          ]);
        }
        const result = await purchasePackage(ctx, {
          clientRequestId: body.clientRequestId as string | undefined,
          customerId,
          packageDefId,
          orderId: body.orderId as string | undefined,
          notes: body.notes as string | undefined,
        });
        return NextResponse.json({ data: result }, { status: 201 });
      }

      case 'redeem': {
        const result = await redeemPackageSession(ctx, {
          clientRequestId: body.clientRequestId as string | undefined,
          balanceId: id,
          appointmentId: body.appointmentId as string | undefined,
          appointmentItemId: body.appointmentItemId as string | undefined,
          sessions: body.sessions as number | undefined,
          credits: body.credits as string | undefined,
        });
        return NextResponse.json({ data: result });
      }

      case 'void-redemption': {
        const redemptionId = body.redemptionId as string;
        if (!redemptionId) {
          throw new ValidationError('Validation failed', [
            { field: 'redemptionId', message: 'redemptionId is required' },
          ]);
        }
        const result = await voidPackageRedemption(ctx, { redemptionId });
        return NextResponse.json({ data: result });
      }

      case 'freeze': {
        const result = await freezePackage(ctx, {
          balanceId: id,
          freezeUntil: body.freezeUntil as string | undefined,
        });
        return NextResponse.json({ data: result });
      }

      case 'unfreeze': {
        const result = await unfreezePackage(ctx, { balanceId: id });
        return NextResponse.json({ data: result });
      }

      case 'transfer': {
        const toCustomerId = body.toCustomerId as string;
        if (!toCustomerId) {
          throw new ValidationError('Validation failed', [
            { field: 'toCustomerId', message: 'toCustomerId is required' },
          ]);
        }
        const result = await transferPackage(ctx, {
          balanceId: id,
          toCustomerId,
        });
        return NextResponse.json({ data: result });
      }

      case 'expire': {
        const result = await expirePackages(ctx, {
          date: body.date as string | undefined,
        });
        return NextResponse.json({ data: result });
      }
    }

    // Unreachable — all actions handled above, unknown actions caught by guard
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Unknown action' } },
      { status: 404 },
    );
  },
  { entitlement: 'spa', permission: 'spa.packages.manage', writeAccess: true },
);
