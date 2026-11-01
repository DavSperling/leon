import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources, turns } from '@/server/db/schema/memory';
import { passationItems, passationLiens } from '@/server/db/schema/passation';
import { withTenant } from '@/server/db/with-tenant';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { writePassation } from './write';

vi.mock('@/server/pipeline/queue');
beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const PROJECT = 'github.com/acme/app';

async function team() {
  const { members } = await newTeam(['Paul', 'Marie'], tenantIds);
  const other = await newTeam(['Zoé'], tenantIds);
  const [paul, marie] = members as [TenantContext, TenantContext];
  return { paul, marie, zoe: other.members[0] as TenantContext };
}

const note = (body: string) => `## Où j'en suis\nAuth en cours.\n\n${body}`;

describe('writePassation', () => {
  it('enregistre la note, ses éléments et ses liens, visibles par un collègue et pas ailleurs', async () => {
    const { paul, marie, zoe } = await team();

    const result = await writePassation(paul, {
      texte: note('- [décision] Better Auth\n- concerne [[PR #91]]\n- [essai-raté] Pools 10+5'),
      project: PROJECT,
      branch: 'auth',
      tool: 'claude_code',
    });

    expect(result.numeros).toHaveLength(2);
    expect(result.numeros[0]).toMatch(/^D\d+$/);
    expect(result.numeros[1]).toMatch(/^E\d+$/);
    const seenByMarie = await withTenant(marie, (tx) =>
      tx.select().from(passationItems).where(eq(passationItems.sourceId, result.sourceId)),
    );
    expect(seenByMarie.map((row) => row.texte)).toEqual(['Better Auth', 'Pools 10+5']);
    const links = await withTenant(marie, (tx) =>
      tx.select().from(passationLiens).where(eq(passationLiens.sourceId, result.sourceId)),
    );
    expect(links.map((row) => row.cible)).toEqual(['PR #91']);
    const [source] = await withTenant(marie, (tx) =>
      tx.select().from(sources).where(eq(sources.id, result.sourceId)),
    );
    expect(source?.kind).toBe('passation');
    expect(source?.metadata).toMatchObject({
      project: PROJECT,
      branch: 'auth',
      tool: 'claude_code',
    });
    const seenByZoe = await withTenant(zoe, (tx) =>
      tx.select().from(passationItems).where(eq(passationItems.sourceId, result.sourceId)),
    );
    expect(seenByZoe).toEqual([]);
    expect(enqueuePipelineStep).toHaveBeenCalledOnce();
  });

  it('masque les secrets dans le texte de la note et dans les éléments', async () => {
    const { paul } = await team();
    const secret = `sk-ant-api03-${'a'.repeat(90)}`;

    const result = await writePassation(paul, {
      texte: note(`- [essai-raté] La clé ${secret} est refusée`),
      project: PROJECT,
      branch: null,
      tool: 'autre',
    });

    const [turn] = await withTenant(paul, (tx) =>
      tx.select().from(turns).where(eq(turns.sourceId, result.sourceId)),
    );
    expect(turn?.text).not.toContain(secret);
    const [item] = await withTenant(paul, (tx) =>
      tx.select().from(passationItems).where(eq(passationItems.sourceId, result.sourceId)),
    );
    expect(item?.texte).not.toContain(secret);
  });

  it('remplace une décision du même dépôt, ignore un numéro inconnu ou d’un autre dépôt', async () => {
    const { paul, marie } = await team();
    const first = await writePassation(paul, {
      texte: note('- [décision] Garder NextAuth'),
      project: PROJECT,
      branch: 'auth',
      tool: 'claude_code',
    });
    const elsewhere = await writePassation(paul, {
      texte: note('- [décision] Autre dépôt'),
      project: 'github.com/acme/autre',
      branch: null,
      tool: 'claude_code',
    });
    const [old] = first.numeros as [string];
    const [foreign] = elsewhere.numeros as [string];

    const second = await writePassation(marie, {
      texte: note(
        `- [décision] Better Auth\n- remplace [[${old}]]\n- remplace [[${foreign}]]\n- remplace [[D999999999]]`,
      ),
      project: PROJECT,
      branch: 'auth',
      tool: 'codex',
    });

    expect(second.remplaces).toEqual([old]);
    const rows = await withTenant(paul, (tx) => tx.select().from(passationItems));
    const byNumero = new Map(rows.map((row) => [row.numero, row]));
    expect(byNumero.get(old)?.remplaceePar).not.toBeNull();
    expect(byNumero.get(foreign)?.remplaceePar).toBeNull();
  });

  it('garde une note sans aucune ligne au format, sans élément', async () => {
    const { paul } = await team();
    const result = await writePassation(paul, {
      texte: 'Juste du texte libre.',
      project: PROJECT,
      branch: null,
      tool: 'autre',
    });
    expect(result.numeros).toEqual([]);
  });
});
