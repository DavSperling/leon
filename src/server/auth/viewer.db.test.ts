import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ViewerProfileSchema } from '@/capture/api-contract';
import { createUserWithOrganization } from './sign-up';
import { resolveTenantContext } from './tenant-context';
import { getViewerProfile } from './viewer';

describe('getViewerProfile', () => {
  it("renvoie le nom, l'e-mail et l'organisation du lecteur", async () => {
    const email = `amos-${randomUUID()}@example.com`;
    const result = await createUserWithOrganization({
      name: 'Amos',
      email,
      password: 'motdepasse-solide',
      organizationName: "Rénov'Ouest",
    });
    if (!result.ok) throw new Error(`inscription refusée : ${result.error}`);
    const ctx = await resolveTenantContext(result.userId, null);
    if (!ctx) throw new Error('contexte introuvable');

    const profile = await getViewerProfile(ctx);

    expect(ViewerProfileSchema.parse(profile)).toEqual({
      userId: result.userId,
      tenantId: result.tenantId,
      userName: 'Amos',
      email,
      organizationName: "Rénov'Ouest",
    });
  });
});
