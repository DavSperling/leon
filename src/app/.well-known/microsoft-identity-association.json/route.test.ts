import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('GET /.well-known/microsoft-identity-association.json', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('donne à Microsoft l’identifiant de l’appli des outils, en JSON', async () => {
    vi.stubEnv('LEON_OAUTH_MICROSOFT_ID', '11111111-2222-3333-4444-555555555555');
    vi.stubEnv('LEON_OAUTH_MICROSOFT_SECRET', 'secret');

    const response = GET();

    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({
      associatedApplications: [{ applicationId: '11111111-2222-3333-4444-555555555555' }],
    });
  });

  it('une liste vide quand aucune appli Microsoft n’est réglée', async () => {
    vi.stubEnv('LEON_OAUTH_MICROSOFT_ID', '');

    expect(await GET().json()).toEqual({ associatedApplications: [] });
  });
});
