import { ConnectorAuthError, ConnectorHttpError } from '../http';

// Une ressource secondaire ou retirée n'arrête pas le passage : 403 (droit manquant) et 404 (retirée
// depuis) rendent la valeur de repli. Tout le reste remonte, 401 compris.
export async function ignoring<T>(call: Promise<T>, statuses: number[], fallback: T): Promise<T> {
  try {
    return await call;
  } catch (error) {
    const known = error instanceof ConnectorAuthError || error instanceof ConnectorHttpError;
    if (known && error.status !== null && statuses.includes(error.status)) return fallback;
    throw error;
  }
}
