/**
 * Sentry context helpers — attach tenant/user/business context to errors.
 *
 * Call these from route handlers or event consumers to enrich error reports.
 * All functions are no-ops when @sentry/nextjs is not installed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sentry: any = null;
let _sentryChecked = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSentry(): any {
  if (_sentryChecked) return _sentry;
  _sentryChecked = true;
  try {
    // Use runtime string concatenation to prevent webpack from resolving this
    const pkg = '@sentry/' + 'nextjs';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _sentry = require(pkg);
  } catch {
    _sentry = null;
  }
  return _sentry;
}

export function setSentryRequestContext(ctx: {
  requestId: string;
  tenantId?: string;
  userId?: string;
  path?: string;
  method?: string;
}): void {
  const Sentry = getSentry();
  if (!Sentry) return;
  Sentry.setUser({ id: ctx.userId, tenantId: ctx.tenantId });
  Sentry.setContext('request', {
    requestId: ctx.requestId,
    path: ctx.path,
    method: ctx.method,
  });
  if (ctx.tenantId) {
    Sentry.setContext('tenant', { tenantId: ctx.tenantId });
  }
  Sentry.setTag('tenantId', ctx.tenantId);
  Sentry.setTag('requestId', ctx.requestId);
}

export function setSentryBusinessContext(
  domain: string,
  context: Record<string, unknown>,
): void {
  const Sentry = getSentry();
  if (!Sentry) return;
  Sentry.setContext(domain, context);
}

export function captureException(
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const Sentry = getSentry();
  if (!Sentry) return;
  Sentry.captureException(error, { extra });
}
