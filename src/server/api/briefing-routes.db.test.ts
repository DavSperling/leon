import { describe, expect, it } from 'vitest';
import { API_PATHS, BriefingResponseSchema } from '@/capture/api-contract';
import { createApiToken } from '@/server/auth/api-tokens';
import { apiRequest } from '@/test/api-request';
import { seedRightsScenario } from '@/test/rights-scenario';

describe('GET /api/v1/briefing', () => {
  it('répond 401 sans jeton', async () => {
    const response = await apiRequest(API_PATHS.briefing);
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('renvoie à Marie un briefing conforme, sans Orion ni zanzibar', async () => {
    const { marie, ids } = await seedRightsScenario();
    const { token } = await createApiToken(marie, 'test');

    const response = await apiRequest(API_PATHS.briefing, { token });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('Orion');
    expect(text).not.toContain('zanzibar');
    const body = BriefingResponseSchema.parse(JSON.parse(text));
    expect(body.entries.map((entry) => entry.cardId)).toEqual([ids.acmeCard]);
    expect(body.reviewCount).toBe(1);
    expect(body.markdown).toContain('ACME (Client)');
    expect(body.entries[0]?.lastFactAt).toMatch(/Z$/);
  });

  it('renvoie à Paul ses deux fiches et ses deux éléments à vérifier', async () => {
    const { paul } = await seedRightsScenario();
    const { token } = await createApiToken(paul, 'test');

    const body = BriefingResponseSchema.parse(
      await (await apiRequest(API_PATHS.briefing, { token })).json(),
    );

    expect(body.entries.map((entry) => entry.title).sort()).toEqual(['ACME', 'Orion']);
    expect(body.reviewCount).toBe(2);
  });
});
