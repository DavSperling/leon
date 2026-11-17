import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createDiscussion } from '@/server/discussion/discussions';
import { adminPool } from '@/test/db';
import { createTestTenant, seedConnection, seedSource } from '@/test/fixtures';
import { readSidebar, searchShell } from './shell';

// Organisation Claire (propriétaire) + Karim (simple membre) + Rémi (ancien membre) ; une autre organisation (Zoé).
// Tout se lit sous les droits de la personne : la barre latérale et la barre de commande ne montrent rien de plus
// que les écrans.

const tenantIds: string[] = [];
let claire: TenantContext;
let karim: TenantContext;
let remi: TenantContext;
let zoe: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Claire Lebrun', 'Karim Benali', 'Rémi Ancien']);
  const other = await createTestTenant(['Zoé Ailleurs']);
  [claire, karim, remi] = team.members as [TenantContext, TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
  await adminPool.query(
    `update member set role = 'owner' where "userId" = $1 and "organizationId" = $2`,
    [claire.userId, claire.tenantId],
  );
  await adminPool.query(`update "user" set deleted_at = now() where id = $1`, [remi.userId]);
});

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from discussions where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
});

const teamDocument = async (owner: TenantContext, title: string) => {
  const { sourceId } = await seedSource(owner, { kind: 'document', title });
  await adminPool.query('update sources set acl = array[tenant_id] where id = $1', [sourceId]);
  return sourceId;
};

describe('readSidebar', () => {
  it('rend les cinq dernières discussions de la personne, la plus récente d’abord, et jamais celles d’un autre', async () => {
    const ids: string[] = [];
    for (let n = 1; n <= 6; n++) {
      ids.push(await createDiscussion(karim, { question: `Question ${n}` }));
      // l'ordre vient de updated_at : chaque discussion une seconde après la précédente
      await adminPool.query(
        `update discussions set updated_at = now() + make_interval(secs => $2) where id = $1`,
        [ids.at(-1), n],
      );
    }
    await createDiscussion(claire, { question: 'Question de Claire' });

    const { recents } = await readSidebar(karim);

    expect(recents.map((d) => d.title)).toEqual([
      'Question 6',
      'Question 5',
      'Question 4',
      'Question 3',
      'Question 2',
    ]);
    expect(recents[0]?.id).toBe(ids[5]);
  });

  it('compte un outil à reconnecter pour son auteur seulement, comme la pastille « Reconnecter » de sa carte', async () => {
    await seedConnection(claire, { provider: 'gmail', status: 'error' });
    await seedConnection(claire, { provider: 'gmail', status: 'error' });
    await seedConnection(claire, { provider: 'notion', status: 'active' });
    await seedConnection(claire, { provider: 'slack', status: 'paused' });
    await seedConnection(karim, { provider: 'linear', status: 'error' });
    await seedConnection(zoe, { provider: 'hubspot', status: 'error' });

    // deux connexions Gmail en erreur : un seul outil ; le Linear en panne de Karim n'est pas à Claire de le réparer,
    // même propriétaire
    expect((await readSidebar(claire)).reconnect).toEqual(['gmail']);
    expect((await readSidebar(karim)).reconnect).toEqual(['linear']);
    expect((await readSidebar(zoe)).reconnect).toEqual(['hubspot']);
  });

  it('ne compte pas une connexion arrêtée (son auteur a quitté l’espace) : personne ne peut la reconnecter', async () => {
    const team = await createTestTenant(['Ana', 'Partie']);
    tenantIds.push(team.tenantId);
    const [ana, gone] = team.members as [TenantContext, TenantContext];
    await adminPool.query(
      `update member set role = 'owner' where "userId" = $1 and "organizationId" = $2`,
      [ana.userId, ana.tenantId],
    );
    await seedConnection(gone, { provider: 'jira', status: 'error' });
    await adminPool.query(`delete from member where "userId" = $1`, [gone.userId]);

    expect((await readSidebar(ana)).reconnect).toEqual([]);
  });

  it('rend la photo du compte quand il en a une', async () => {
    expect((await readSidebar(zoe)).image).toBeNull();
    await adminPool.query(
      `update "user" set image = 'https://exemple.test/zoe.png' where id = $1`,
      [zoe.userId],
    );

    expect((await readSidebar(zoe)).image).toBe('https://exemple.test/zoe.png');
  });
});

describe('searchShell', () => {
  it('ne trouve rien sans lettres', async () => {
    expect(await searchShell(claire, '   ')).toEqual({
      tools: [],
      people: [],
      documents: [],
      discussions: [],
    });
  });

  it('trouve les outils du catalogue, ceux qui commencent par les lettres d’abord, et dit leur état comme leur carte', async () => {
    await seedConnection(claire, { provider: 'github', status: 'active' });
    // une connexion saine et une en erreur : l'outil est à reconnecter (la carte montre la panne d'abord)
    await seedConnection(claire, { provider: 'gitlab', status: 'active' });
    await seedConnection(karim, { provider: 'gitlab', status: 'error' });

    const { tools } = await searchShell(karim, 'GIT');

    expect(tools).toEqual([
      { id: 'github', label: 'GitHub', state: 'connected' },
      { id: 'gitlab', label: 'GitLab', state: 'broken' },
    ]);
    expect((await searchShell(zoe, 'git')).tools.every((tool) => tool.state === null)).toBe(true);
  });

  it('dit « en pause » quand toutes les connexions de l’outil le sont, comme sa carte', async () => {
    await seedConnection(claire, { provider: 'granola', status: 'paused' });
    await seedConnection(karim, { provider: 'granola', status: 'paused' });
    await seedConnection(claire, { provider: 'asana', status: 'paused' });
    await seedConnection(karim, { provider: 'asana', status: 'active' });

    expect((await searchShell(claire, 'granola')).tools).toEqual([
      { id: 'granola', label: 'Granola', state: 'paused' },
    ]);
    expect((await searchShell(claire, 'asana')).tools).toEqual([
      { id: 'asana', label: 'Asana', state: 'connected' },
    ]);
  });

  it('dit « à reconnecter » pour un outil dont l’auteur a quitté l’espace', async () => {
    const team = await createTestTenant(['Léa', 'Sortie']);
    tenantIds.push(team.tenantId);
    const [lea, gone] = team.members as [TenantContext, TenantContext];
    await seedConnection(gone, { provider: 'trello', status: 'active' });
    expect((await searchShell(lea, 'trello')).tools).toEqual([
      { id: 'trello', label: 'Trello', state: 'connected' },
    ]);

    await adminPool.query(`delete from member where "userId" = $1`, [gone.userId]);

    expect((await searchShell(lea, 'trello')).tools).toEqual([
      { id: 'trello', label: 'Trello', state: 'broken' },
    ]);
  });

  it('trouve une personne de l’espace sans casse ni accent, jamais un ancien membre ni un membre d’ailleurs', async () => {
    const { people } = await searchShell(claire, 'BENALI');
    expect(people.map((p) => p.name)).toEqual(['Karim Benali']);
    const { rows } = await adminPool.query<{ id: string }>(
      `select id from member where "userId" = $1`,
      [karim.userId],
    );
    expect(people[0]?.id).toBe(rows[0]?.id);

    expect((await searchShell(claire, 'remi')).people).toEqual([]);
    expect((await searchShell(claire, 'zoe')).people).toEqual([]);
    expect((await searchShell(zoe, 'zoe')).people.map((p) => p.name)).toEqual(['Zoé Ailleurs']);
  });

  it('trouve un document que la personne voit, et dit s’il est privé ; pas le document privé d’un autre', async () => {
    const mine = (await seedSource(karim, { kind: 'document', title: 'Procédure privée.pdf' }))
      .sourceId;
    const shared = await teamDocument(claire, 'Procédure d’équipe.pdf');
    await seedSource(claire, { kind: 'document', title: 'Procédure de Claire.pdf' });
    await seedSource(karim, { kind: 'claude_code', title: 'Procédure, session de code' });
    await teamDocument(zoe, 'Procédure d’ailleurs.pdf');

    const { documents } = await searchShell(karim, 'procedure');

    expect(documents).toEqual(
      expect.arrayContaining([
        { id: mine, title: 'Procédure privée.pdf', private: true },
        { id: shared, title: 'Procédure d’équipe.pdf', private: false },
      ]),
    );
    expect(documents).toHaveLength(2);
  });

  it('trouve les discussions de la personne, pas celles d’un autre, et prend % pour un caractère', async () => {
    const id = await createDiscussion(claire, { question: 'Remise de 100% pour ACME ?' });
    await createDiscussion(karim, { question: 'Remise pour Nordia ?' });

    expect((await searchShell(claire, 'remise')).discussions).toEqual([
      { id, title: 'Remise de 100% pour ACME ?' },
    ]);
    expect((await searchShell(claire, '100%')).discussions).toHaveLength(1);
    expect((await searchShell(claire, '%')).discussions).toHaveLength(1);
    expect((await searchShell(claire, '_')).discussions).toEqual([]);
  });

  it('rend cinq résultats par groupe au plus', async () => {
    for (let n = 1; n <= 7; n++) await teamDocument(claire, `Compte rendu ${n}.pdf`);

    expect((await searchShell(karim, 'compte rendu')).documents).toHaveLength(5);
    expect((await searchShell(karim, 'a')).tools).toHaveLength(5);
  });
});
