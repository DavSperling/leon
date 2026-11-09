import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import { adminDb } from '@/test/db';
import { seedConnection } from '@/test/fixtures';
import { dropTeams, emailOf, newTeam } from '@/test/seed-indexed';
import { myAddresses, resolvePeople } from './people';

// Qui est qui : les membres de l'organisation du lecteur, et lui-même.

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

async function setEmail(ctx: TenantContext, email: string) {
  await adminDb.update(users).set({ email }).where(eq(users.id, ctx.userId));
}

// Les adresses des comptes sont uniques dans toute la base de test, qui garde ses utilisateurs d'une exécution
// à l'autre : un domaine propre à chaque équipe.
async function people() {
  const run = randomUUID().slice(0, 8);
  const mail = (local: string) => `${local}@r${run}.test`;
  const { members } = await newTeam(
    ['Alice', 'Julie Martin', 'Julie Durand', 'Bob', 'Éloïse Roy'],
    tenantIds,
  );
  const [alice, julieM, julieD, bob, eloise] = members as TenantContext[] as [
    TenantContext,
    TenantContext,
    TenantContext,
    TenantContext,
    TenantContext,
  ];
  await setEmail(julieM, `Julie.Martin@R${run}.TEST`);
  await setEmail(julieD, mail('julie.durand'));
  await setEmail(bob, mail('bob'));
  await setEmail(eloise, mail('eloise'));
  // Une autre organisation, qui compte aussi une Julie : elle ne se confond jamais avec les nôtres.
  const other = await newTeam(['Julie Autre'], tenantIds);
  const autre = other.members[0] as TenantContext;
  await setEmail(autre, mail('julie.autre'));
  return { alice, julieM, julieD, bob, eloise, autre, mail };
}

describe('resolvePeople', () => {
  it('trouve les membres par le début de leur nom, sans casse ni accent, ou par leur e-mail', async () => {
    const { alice, mail } = await people();
    const resolved = await resolvePeople(alice, ['julie', mail('bob'), 'inconnu']);
    expect(resolved.authorEmails.toSorted()).toEqual([
      mail('bob'),
      mail('julie.durand'),
      mail('julie.martin'),
    ]);
    expect(resolved.unknown).toEqual(['inconnu']);
    expect(resolved.authorNames).toEqual([]);
  });

  it('range les e-mails en minuscules, sans doublon', async () => {
    const { alice, mail } = await people();
    const resolved = await resolvePeople(alice, ['JULIE M', mail('julie.martin'), 'Julie Martin']);
    expect(resolved.authorEmails).toEqual([mail('julie.martin')]);
    expect(resolved.unknown).toEqual([]);
  });

  it('ignore les accents et la casse des deux côtés', async () => {
    const { alice, mail } = await people();
    expect((await resolvePeople(alice, ['eloise'])).authorEmails).toEqual([mail('eloise')]);
    expect((await resolvePeople(alice, ['ÉLOÏSE'])).authorEmails).toEqual([mail('eloise')]);
    expect((await resolvePeople(alice, ['Éloise R'])).authorEmails).toEqual([mail('eloise')]);
  });

  it('ne trouve un nom que par son début, et jamais une personne d’une autre organisation', async () => {
    const { alice, mail } = await people();
    expect(await resolvePeople(alice, ['martin'])).toMatchObject({
      authorEmails: [],
      unknown: ['martin'],
    });
    const julies = (await resolvePeople(alice, ['julie'])).authorEmails;
    expect(julies).not.toContain(mail('julie.autre'));
    // Son adresse, elle, se prend pour ce qu'elle est (voir plus bas) : c'est le nom qui ne la désigne pas.
    expect((await resolvePeople(alice, ['julie.autre'])).unknown).toEqual(['julie.autre']);
  });

  it('prend une adresse e-mail pour ce qu’elle est : l’auteur d’un élément n’est pas toujours un membre', async () => {
    const { alice } = await people();
    const resolved = await resolvePeople(alice, ['Client@Societe.com']);
    expect(resolved.authorEmails).toEqual(['client@societe.com']);
    expect(resolved.unknown).toEqual([]);
  });

  it('ne laisse aucun caractère joker ni guillemet élargir la recherche', async () => {
    const { alice } = await people();
    for (const token of ['%', '_', 'j%', '.*', "' or '1'='1", '']) {
      const resolved = await resolvePeople(alice, [token]);
      expect(resolved.authorEmails).toEqual([]);
    }
  });

  it('ne rend rien pour une liste vide', async () => {
    const { alice } = await people();
    expect(await resolvePeople(alice, [])).toEqual({
      authorEmails: [],
      authorNames: [],
      unknown: [],
    });
  });
});

describe('myAddresses', () => {
  it('rend l’e-mail du compte du lecteur, en minuscules', async () => {
    const { alice, julieM, mail } = await people();
    expect(await myAddresses(alice)).toEqual({
      emails: [(await emailOf(alice)).toLowerCase()],
      names: [],
    });
    expect((await myAddresses(julieM)).emails).toEqual([mail('julie.martin')]);
  });
});

describe('les noms d’auteur GitHub et Slack (T19)', () => {
  const sorted = (names: { kind: string; name: string }[]) =>
    names.map(({ kind, name }) => `${kind}:${name}`).toSorted();

  it('viennent des comptes que chacun a branchés, trouvé par son nom, son adresse, ou soi-même', async () => {
    const { alice, julieM, julieD, bob, mail } = await people();
    await seedConnection(julieM, { provider: 'github', label: 'jmartin' });
    await seedConnection(julieM, {
      provider: 'slack',
      label: 'julie.m (Acme (France))',
      config: { accountKey: 'T1:U1' },
    });
    // Sans pseudo dans le libellé, l'identifiant Slack seul ; un autre outil ne donne rien.
    await seedConnection(bob, {
      provider: 'slack',
      label: 'Acme',
      config: { accountKey: 'T1:U2' },
    });
    await seedConnection(julieD, { provider: 'notion', label: 'julie.d' });

    const julie = ['github:jmartin', 'slack:U1', 'slack:julie.m'];
    expect(sorted((await resolvePeople(alice, ['julie'])).authorNames)).toEqual(julie);
    expect(sorted((await resolvePeople(alice, [mail('julie.martin')])).authorNames)).toEqual(julie);
    expect(sorted((await myAddresses(julieM)).names)).toEqual(julie);
    expect((await resolvePeople(alice, ['bob'])).authorNames).toEqual([
      { kind: 'slack', name: 'U2' },
    ]);
    expect((await myAddresses(alice)).names).toEqual([]);
  });

  it('ne se lisent jamais dans une autre organisation', async () => {
    const { alice, autre, mail } = await people();
    await seedConnection(autre, { provider: 'github', label: 'jautre' });
    expect((await resolvePeople(alice, [mail('julie.autre')])).authorNames).toEqual([]);
    expect((await myAddresses(autre)).names).toEqual([{ kind: 'github', name: 'jautre' }]);
  });
});
