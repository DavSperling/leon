import { afterAll, describe, expect, it, vi } from 'vitest';
import { API_PATHS } from '@/capture/api-contract';
import { createApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';
import { apiRequest } from '@/test/api-request';
import { dropTeams, newTeam } from '@/test/seed-indexed';

vi.mock('@/server/pipeline/queue');

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

async function tokenOf(ctx: TenantContext) {
  return (await createApiToken(ctx, 'test')).token;
}

describe('routes de passation', () => {
  it('écrit une note, la relit, et date la dernière note de l’auteur', async () => {
    const { members } = await newTeam(['Paul', 'Marie'], tenantIds);
    const [paul, marie] = members as [TenantContext, TenantContext];
    const paulToken = await tokenOf(paul);

    const written = await apiRequest(API_PATHS.passation, {
      method: 'POST',
      token: paulToken,
      body: {
        texte: "## Où j'en suis\nEn cours.\n\n- [décision] Better Auth",
        projet: 'github.com/acme/app',
        branche: 'auth',
        outil: 'claude_code',
      },
    });
    expect(written.status).toBe(201);

    const state = await apiRequest(
      `${API_PATHS.passation}?projet=github.com/acme/app&branche=auth`,
      {
        token: await tokenOf(marie),
      },
    );
    expect(state.status).toBe(200);
    expect((await state.json()).markdown).toContain('Better Auth');

    const last = await apiRequest(
      `${API_PATHS.passationLast}?projet=github.com/acme/app&branche=auth`,
      {
        token: paulToken,
      },
    );
    expect((await last.json()).at).not.toBeNull();
  });

  it('refuse sans jeton, et un corps ou un projet invalide', async () => {
    expect((await apiRequest(API_PATHS.passation, { method: 'POST', body: {} })).status).toBe(401);
    const { members } = await newTeam(['Paul'], tenantIds);
    const token = await tokenOf(members[0] as TenantContext);
    expect(
      (await apiRequest(API_PATHS.passation, { method: 'POST', token, body: { texte: '' } }))
        .status,
    ).toBe(400);
    expect((await apiRequest(`${API_PATHS.passation}?projet=pas%20valide`, { token })).status).toBe(
      400,
    );
  });
});
