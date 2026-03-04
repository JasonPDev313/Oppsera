import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
    enableLogs: true,
    beforeSend(event) {
      // Scrub sensitive data from server-side errors
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
      }
      // Remove DATABASE_URL and other secrets from extra data
      if (event.extra) {
        for (const key of Object.keys(event.extra)) {
          if (/url|secret|key|password|token|dsn/i.test(key)) {
            delete event.extra[key];
          }
        }
      }
      return event;
    },
  });
}
