import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
  integrations: [Sentry.replayIntegration()],
  beforeSend(event) {
    // Scrub PII: remove Authorization headers, cookies, passwords
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['x-api-key'];
    }
    if (event.request?.data && typeof event.request.data === 'string') {
      try {
        const body = JSON.parse(event.request.data);
        delete body.password;
        delete body.token;
        delete body.refreshToken;
        delete body.pin;
        delete body.posPin;
        delete body.overridePin;
        event.request.data = JSON.stringify(body);
      } catch { /* not JSON */ }
    }
    return event;
  },
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
