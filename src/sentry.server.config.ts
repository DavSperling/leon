import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/server/sentry-scrub';

// Sans SENTRY_DSN (local, tests), le SDK ne fait rien. Chargé par instrumentation.ts, runtime Node seulement.
Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV,
  release: process.env.RAILWAY_GIT_COMMIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
  // Leon garde des conversations privées : rien de ce qui pourrait en contenir ne part chez Sentry. Les défauts du
  // SDK 11 collectent tout (corps de requête, paramètres SQL, arguments des jobs, variables locales) : on coupe chaque
  // catégorie, une par une.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    mcp: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
  },
  beforeSend: scrubEvent,
});
