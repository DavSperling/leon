import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Condition positive : webpack élimine alors la branche du bundle edge.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Sentry d'abord, pour qu'il voie aussi les erreurs du démarrage.
    await import('./sentry.server.config');
    const { startNodeInstrumentation } = await import('./instrumentation-node');
    await startNodeInstrumentation();
  }
}

// Les erreurs de rendu, de server actions et de routes que Next attrape lui-même.
export const onRequestError = Sentry.captureRequestError;
