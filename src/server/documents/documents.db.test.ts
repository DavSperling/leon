import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOLDER_MAX_FILES } from '@/lib/documents';
import { deleteAccount } from '@/server/auth/delete-account';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { enqueuePipelineStep, type PipelineJob } from '@/server/pipeline/queue';
import { indexIngestRun } from '@/server/search/index-run';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, createTestUser, seedSource } from '@/test/fixtures';
import {
  addDocument,
  deleteDocument,
  deleteFolder,
  documentText,
  listDocuments,
} from './documents';

// L'ajout met en file l'indexation ; ici on l'appelle à la main. Le point du matin qu'elle prévient est simulé.
vi.mock('@/server/pipeline/queue');
vi.mock('@/server/briefing/queue');

// Alice et Bob dans une organisation, Zoé dans une autre.
const tenantIds: string[] = [];
let alice: TenantContext;
let bob: TenantContext;
let zoe: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Alice', 'Bob']);
  const other = await createTestTenant(['Zoé']);
  [alice, bob] = team.members as [TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
});

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

// Les passages de ces tests ne doivent pas rester dans la file des vecteurs manquants des autres fichiers.
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
});

type Folder = { id: string; name: string; path: string };
const folderOf = (name: string, path: string, id = randomUUID()): Folder => ({ id, name, path });

// Ajoute un document au nom de `ctx` ; rend sa source et le job d'indexation mis en file.
async function upload(
  ctx: TenantContext,
  name = 'devis.txt',
  folder?: Folder,
): Promise<{ sourceId: string; job: PipelineJob }> {
  await addDocument(ctx, new File(['Devis du chantier Lebrun, lot plomberie.'], name), folder);
  const job = vi.mocked(enqueuePipelineStep).mock.lastCall?.[1] as PipelineJob;
  const { rows } = await adminPool.query('select source_id from ingest_runs where id = $1', [
    job.ingestRunId,
  ]);
  return { sourceId: rows[0].source_id, job };
}

const count = async (table: string, sourceId: string): Promise<number> => {
  const { rows } = await adminPool.query(
    `select count(*)::int as n from ${table} where source_id = $1`,
    [sourceId],
  );
  return rows[0].n;
};

const vectorCount = async (passageIds: string[]): Promise<number> => {
  const { rows } = await adminPool.query(
    'select count(*)::int as n from passage_vectors where passage_id = any($1)',
    [passageIds],
  );
  return rows[0].n;
};

describe('suppression d’un document (0034)', () => {
  it('l’auteur supprime son document ; tours, runs, passages et vecteurs partent avec lui', async () => {
    const { sourceId, job } = await upload(alice);
    await indexIngestRun(job, { embedder: createFakeEmbedder() });
    const { rows } = await adminPool.query('select id from passages where source_id = $1', [
      sourceId,
    ]);
    const passageIds = rows.map((row) => row.id as string);
    expect(passageIds.length).toBeGreaterThan(0);
    expect(await vectorCount(passageIds)).toBe(passageIds.length);

    expect(await deleteDocument(alice, sourceId)).toBe(true);

    const { rowCount } = await adminPool.query('select 1 from sources where id = $1', [sourceId]);
    expect(rowCount).toBe(0);
    for (const table of ['turns', 'ingest_runs', 'passages']) {
      expect(await count(table, sourceId), table).toBe(0);
    }
    expect(await vectorCount(passageIds)).toBe(0);
  });

  it('un autre membre de l’organisation ne le supprime pas', async () => {
    const { sourceId } = await upload(alice);

    expect(await deleteDocument(bob, sourceId)).toBe(false);
    expect(await count('turns', sourceId)).toBe(1);
  });

  it('un membre d’une autre organisation non plus', async () => {
    const { sourceId } = await upload(alice);

    expect(await deleteDocument(zoe, sourceId)).toBe(false);
    expect(await count('turns', sourceId)).toBe(1);
  });

  it('une source qui n’est pas un document ne se supprime pas', async () => {
    const { sourceId } = await seedSource(alice, { kind: 'claude_code' });

    expect(await deleteDocument(alice, sourceId)).toBe(false);
    expect(await count('turns', sourceId)).toBe(1);
  });
});

// Un document laissé par un membre parti n'a plus d'auteur pour le retirer : un administrateur le peut (0042).
describe('document d’un ancien membre (0042)', () => {
  const makeAdmin = (ctx: TenantContext) =>
    adminPool.query(
      `update member set role = 'admin' where "userId" = $1 and "organizationId" = $2`,
      [ctx.userId, ctx.tenantId],
    );
  let claire: TenantContext;
  let zack: TenantContext;

  beforeAll(async () => {
    claire = await createTestUser(alice.tenantId, 'Claire');
    zack = await createTestUser(zoe.tenantId, 'Zack');
    await makeAdmin(claire);
    await makeAdmin(zack);
  });

  async function departed(): Promise<string> {
    const julie = await createTestUser(alice.tenantId, 'Julie');
    const { sourceId } = await upload(julie, 'secret-julie.txt');
    await deleteAccount(julie, null, false);
    return sourceId;
  }

  it('un administrateur le supprime', async () => {
    const sourceId = await departed();

    expect(await deleteDocument(claire, sourceId)).toBe(true);
  });

  it('pas celui d’un membre encore là', async () => {
    const { sourceId } = await upload(alice);

    expect(await deleteDocument(claire, sourceId)).toBe(false);
    expect(await count('turns', sourceId)).toBe(1);
  });

  it('un simple membre ne le supprime pas, ni l’administrateur d’une autre organisation', async () => {
    const sourceId = await departed();

    expect(await deleteDocument(bob, sourceId)).toBe(false);
    expect(await deleteDocument(zack, sourceId)).toBe(false);
    expect(await count('turns', sourceId)).toBe(1);
  });
});

describe('liste des documents', () => {
  it('montre à toute l’organisation ses documents, et seulement eux', async () => {
    const mine = await upload(alice, 'contrat-acme.txt');
    const theirs = await upload(zoe, 'contrat-zoe.txt');
    const capture = await seedSource(alice, { kind: 'claude_code', title: 'Session ACME' });

    const seenByBob = await listDocuments(bob);
    const seenByZoe = await listDocuments(zoe);

    expect(seenByBob).toContainEqual(
      expect.objectContaining({
        id: mine.sourceId,
        title: 'contrat-acme.txt',
        ownerUserId: alice.userId,
        ownerName: 'Alice',
        ownerFormer: false,
      }),
    );
    const bobIds = seenByBob.map((doc) => doc.id);
    expect(bobIds).not.toContain(theirs.sourceId);
    expect(bobIds).not.toContain(capture.sourceId);
    expect(seenByZoe.map((doc) => doc.id)).toEqual([theirs.sourceId]);
  });

  it('dit qu’un document est en cours de lecture tant que son run n’est pas fini', async () => {
    const { sourceId, job } = await upload(alice, 'en-lecture.txt');
    const readingOf = async () =>
      (await listDocuments(bob)).find((doc) => doc.id === sourceId)?.reading;

    expect(await readingOf()).toBe(true);
    await indexIngestRun(job, { embedder: createFakeEmbedder() });
    expect(await readingOf()).toBe(false);
  });

  it('documentText rend ce que Leon a lu, sous les droits du lecteur', async () => {
    const team = await upload(alice, 'lu.txt');
    await addDocument(alice, new File(['Notes privées de Alice.'], 'prive.txt'), undefined, 'moi');
    const [mine] = await listDocuments(alice);
    const capture = await seedSource(alice, { kind: 'claude_code', title: 'Session' });

    expect(await documentText(bob, team.sourceId)).toEqual({
      text: 'Devis du chantier Lebrun, lot plomberie.',
      cut: false,
    });
    expect(await documentText(bob, team.sourceId, 5)).toEqual({ text: 'Devis', cut: true });
    expect(mine?.title).toBe('prive.txt');
    expect(await documentText(alice, mine?.id as string)).toEqual({
      text: 'Notes privées de Alice.',
      cut: false,
    });
    expect(await documentText(bob, mine?.id as string)).toBeNull();
    expect(await documentText(zoe, team.sourceId)).toBeNull();
    expect(await documentText(alice, capture.sourceId)).toBeNull();
  });

  it("garde le document d'un ancien membre, marqué comme tel", async () => {
    const julie = await createTestUser(alice.tenantId, 'Julie');
    const { sourceId } = await upload(julie, 'plan-julie.txt');
    await deleteAccount(julie, null, false);

    expect(await listDocuments(bob)).toContainEqual(
      expect.objectContaining({ id: sourceId, ownerName: 'Julie', ownerFormer: true }),
    );
  });
});

describe('dossiers', () => {
  const titleOf = async (sourceId: string): Promise<string | null> => {
    const { rows } = await adminPool.query('select title from sources where id = $1', [sourceId]);
    return rows[0]?.title ?? null;
  };

  it('un fichier de dossier a le chemin pour titre, et la liste rend son dossier', async () => {
    const folder = folderOf('chantier-lebrun', 'lots/plomberie.md');
    const alone = await upload(alice, 'seul.txt');

    const { sourceId } = await upload(alice, 'plomberie.md', folder);

    expect(await titleOf(sourceId)).toBe('chantier-lebrun/lots/plomberie.md');
    const seen = await listDocuments(bob);
    expect(seen).toContainEqual(
      expect.objectContaining({
        id: sourceId,
        folderId: folder.id,
        folderName: 'chantier-lebrun',
        ownerUserId: alice.userId,
      }),
    );
    expect(seen).toContainEqual(
      expect.objectContaining({ id: alone.sourceId, folderId: null, folderName: null }),
    );
  });

  it('deleteFolder ne supprime que les fichiers de ce dossier et de son auteur', async () => {
    const folder = folderOf('dossier', 'a.md');
    const first = await upload(alice, 'a.md', folder);
    const second = await upload(alice, 'b.md', { ...folder, path: 'b.md' });
    const otherFolder = await upload(alice, 'c.md', folderOf('autre', 'c.md'));
    const alone = await upload(alice, 'seul.md');
    // Le même identifiant, chez un autre membre de l'organisation.
    const bobs = await upload(bob, 'a.md', folder);

    expect(await deleteFolder(alice, folder.id)).toBe(2);

    for (const gone of [first, second]) expect(await count('turns', gone.sourceId)).toBe(0);
    for (const kept of [otherFolder, alone, bobs])
      expect(await count('turns', kept.sourceId)).toBe(1);
    expect(await deleteFolder(alice, folder.id)).toBe(0);
  });

  it('renvoyer un dossier du même nom remplace le précédent, chez son auteur seulement', async () => {
    const first = folderOf('maj-dossier', 'a.md');
    const old = await upload(alice, 'a.md', first);
    await upload(alice, 'b.md', { ...first, path: 'b.md' });
    const bobs = await upload(bob, 'a.md', folderOf('maj-dossier', 'a.md'));
    const other = await upload(alice, 'c.md', folderOf('autre-dossier', 'c.md'));

    const again = folderOf('maj-dossier', 'a.md');
    const fresh = await upload(alice, 'a.md', again);
    await upload(alice, 'b.md', { ...again, path: 'b.md' });

    expect(await count('turns', old.sourceId)).toBe(0);
    const names = (await listDocuments(alice)).filter((doc) => doc.folderName === 'maj-dossier');
    expect(
      names.filter((doc) => doc.ownerUserId === alice.userId).map((doc) => doc.folderId),
    ).toEqual([again.id, again.id]);
    for (const kept of [fresh, bobs, other]) expect(await count('turns', kept.sourceId)).toBe(1);
  });

  it('un membre d’une autre organisation ne supprime pas le dossier', async () => {
    const folder = folderOf('dossier', 'a.md');
    const { sourceId } = await upload(alice, 'a.md', folder);

    expect(await deleteFolder(zoe, folder.id)).toBe(0);
    expect(await count('turns', sourceId)).toBe(1);
  });

  it('refuse le fichier de trop : 200 au plus par dossier et par auteur', async () => {
    const folder = folderOf('gros-depot', 'un.md');
    // 199 fichiers déjà là, insérés directement : 199 ajouts compléteraient le test sans le rendre plus sûr.
    await adminDb.insert(sources).values(
      Array.from({ length: FOLDER_MAX_FILES - 1 }, (_, index) => ({
        tenantId: alice.tenantId,
        kind: 'document' as const,
        externalId: `upload:${randomUUID()}`,
        ownerUserId: alice.userId,
        title: `gros-depot/${index}.md`,
        acl: [alice.tenantId],
        metadata: { nature: 'fichier', folder: { id: folder.id, name: folder.name } },
      })),
    );

    await upload(alice, 'un.md', folder);
    const refused = await upload(alice, 'deux.md', { ...folder, path: 'deux.md' }).catch(
      (error: unknown) => error,
    );

    expect(refused).toMatchObject({ name: 'DocumentError', code: 'folder_full' });
    // Un autre membre, avec le même identifiant, part de zéro ; l'auteur, lui, peut encore ajouter un fichier seul.
    await upload(bob, 'un.md', folder);
    await upload(alice, 'seul.md');
  });
});
