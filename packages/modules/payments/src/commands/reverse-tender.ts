import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import type { ReverseTenderInput } from '../validation';

export async function reverseTender(
  _ctx: RequestContext,
  _tenderId: string,
  _input: ReverseTenderInput,
): Promise<never> {
  throw new AppError(
    'NOT_IMPLEMENTED',
    'Tender reversal is not yet available (V2)',
    501,
  );
}
