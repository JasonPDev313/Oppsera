import { z } from 'zod';
import { ValidationError } from '../errors';

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const tenantIdSchema = z.string().min(1);
export const locationIdSchema = z.string().min(1);

/**
 * Assert that a Zod safeParse result succeeded, throwing a ValidationError if not.
 * After calling this, `parsed.data` is type-safe.
 *
 * @example
 * ```ts
 * const parsed = schema.safeParse(body);
 * assertValidated(parsed);
 * // parsed.data is now typed
 * ```
 */
export function assertValidated<T>(
  parsed: z.SafeParseReturnType<unknown, T>,
  message = 'Validation failed',
): asserts parsed is z.SafeParseSuccess<T> {
  if (!parsed.success) {
    throw new ValidationError(
      message,
      parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    );
  }
}
