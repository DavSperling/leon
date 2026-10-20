import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { briefings } from '@/server/db/schema/search';
import { createFakeLlm } from '@/server/llm/fake-llm';
import type { Llm } from '@/server/llm/llm';
import { LlmError } from '@/server/llm/llm';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import { getBoss } from '@/server/pipeline/queue';
import { adminDb, adminPool } from '@/test/db';
import { dropTeams, emailOf, newTeam, seedIndexed } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';
import {
  BRIEFING_PENDING_MARKDOWN,
  latestBriefingProject,
  readBriefing,
  refreshBriefing,
} from './briefings';
import { BRIEFING_QUEUES, briefingKey, signalProjectActivity } from './queue';

// Le point du matin, de bout en bout sous les droits de l'utilisateur : la matière (gather.ts), un seul appel au
// faux modèle, la ligne écrite ; puis la lecture, qui revérifie que chaque source fournie est encore visible.
// Le vrai pg-boss de la base de test reçoit les recalculs que la lecture met en file ; aucun worker ne les lit, et
// ce fichier retire les siens à la fin.

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms);

const tenantIds: string[] = [];
const keys = new Set<string>();
let tenantId: string;
let alice: TenantContext;
let bob: TenantContext;

const uniqueRepo = () => `acme/depot-${crypto.randomUUID().slice(0, 8)}`;

// Une session d'Alice sur le projet, une demande de fusion du dépôt qui a bougé depuis, et une mention d'Alice.
async function seedProject(owner: TenantContext) {
  const repo = uniqueRepo();
  const project = `github.com/${repo}`;
  const session = await seedRun(owner, {
    kind: 'claude_code',
    title: 'Session du jeton',
    metadata: { project },
    turns: [
      { text: 'Corrige le jeton de rafraîchissement.', ts: ago(5 * HOUR), role: 'user' },
      { text: 'Fait, reste le test.', ts: ago(5 * HOUR - 60_000), role: 'assistant' },
    ],
    lastTurnAt: ago(5 * HOUR - 60_000),
    status: 'done',
  });
  const change = await seedRun(bob, {
    kind: 'github',
    acl: [tenantId],
    title: '#22 Renouveler le jeton',
    metadata: { nature: 'ticket', origin: { repo } },
    turns: [{ text: 'Approuvé, je fusionne.', ts: ago(HOUR), role: 'participant' }],
    lastTurnAt: ago(HOUR),
    status: 'done',
  });
  const email = await emailOf(owner);
  const mention = await seedIndexed(
    bob,
    {
      kind: 'linear',
      acl: [tenantId],
      title: 'LIN-4 Démo client',
      metadata: { nature: 'ticket' },
      turns: [{ text: `${email} prépare la démo.`, ts: ago(2 * HOUR), authorName: 'Bob' }],
    },
    null,
  );
  return {
    project,
    sessionId: session.sourceId,
    changeId: change.sourceId,
    mentionId: mention.sourceId,
  };
}

async function rowOf(owner: TenantContext, project: string) {
  const [row] = await adminDb
    .select()
    .from(briefings)
    .where(and(eq(briefings.userId, owner.userId), eq(briefings.project, project)));
  return row;
}

async function jobsFor(owner: TenantContext, project: string) {
  const key = briefingKey({ tenantId: owner.tenantId, userId: owner.userId, project });
  keys.add(key);
  const boss = await getBoss();
  return boss.findJobs(BRIEFING_QUEUES.refresh, { key, queued: true });
}

const writes = (texts: string[]) => createFakeLlm({ texts });

beforeAll(async () => {
  const team = await newTeam(['Alice Martin', 'Bob Durand'], tenantIds);
  tenantId = team.tenantId;
  [alice, bob] = team.members as [TenantContext, TenantContext];
});

afterAll(async () => {
  const boss = await getBoss();
  for (const key of keys) {
    const left = await boss.findJobs(BRIEFING_QUEUES.refresh, { key });
    if (left.length > 0) {
      await boss.deleteJob(
        BRIEFING_QUEUES.refresh,
        left.map((job) => job.id),
      );
    }
  }
  await adminPool.query('delete from briefings where tenant_id = any($1)', [tenantIds]);
  await dropTeams(tenantIds);
  await boss.stop();
});

describe('refreshBriefing', () => {
  it('écrit le point du modèle, avec toutes les sources fournies, citées ou non', async () => {
    const seeded = await seedProject(alice);
    const llm = writes([
      '## Ce que tu as fait\n- Le jeton est corrigé [1].',
      '\n## Ce qui a bougé\n- Rien.',
    ]);
    const now = new Date();

    await refreshBriefing(alice, seeded.project, { llm, now });

    const row = await rowOf(alice, seeded.project);
    expect(row?.sourceIds.toSorted()).toEqual(
      [seeded.sessionId, seeded.changeId, seeded.mentionId].toSorted(),
    );
    expect(row?.markdown).toContain(`# Point du matin · ${seeded.project}`);
    expect(row?.markdown).toContain(DATA_GUARD_LINE);
    expect(row?.markdown).toContain('- Le jeton est corrigé [1].');
    expect(row?.markdown).toContain('[1] Claude Code · « Session du jeton »');
    expect(row?.preparedAt.getTime()).toBe(now.getTime());
    expect(row?.stale).toBe(false);
    expect(row?.acl).toEqual([alice.userId]);
    // Un seul appel, à l'étape du point, avec la matière balisée.
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.step).toBe('point');
    const sent = llm.calls[0]?.messages.map((message) => message.content).join('\n') ?? '';
    expect(sent).toMatch(/<session n="1"/);
    expect(sent).toMatch(/<changement n="2"/);
    expect(sent).toMatch(/<mention n="3"/);
  });

  it('retire les renvois à des numéros qu’on n’a pas fournis', async () => {
    const seeded = await seedProject(alice);

    await refreshBriefing(alice, seeded.project, {
      llm: writes(['- La PR est fusionnée [2][9]. Inventé [42].']),
    });

    const markdown = (await rowOf(alice, seeded.project))?.markdown ?? '';
    expect(markdown).toContain('- La PR est fusionnée [2]. Inventé.');
    expect(markdown).not.toContain('[9]');
    expect(markdown).not.toContain('[42]');
  });

  it('refait le point en place : même ligne, plus périmé, dernière lecture gardée', async () => {
    const seeded = await seedProject(alice);
    await refreshBriefing(alice, seeded.project, { llm: writes(['Premier point [1].']) });
    const first = await rowOf(alice, seeded.project);
    const readAt = ago(HOUR);
    await adminPool.query('update briefings set stale = true, last_read_at = $2 where id = $1', [
      first?.id,
      readAt,
    ]);

    await refreshBriefing(alice, seeded.project, { llm: writes(['Second point [1].']) });

    const second = await rowOf(alice, seeded.project);
    expect(second?.id).toBe(first?.id);
    expect(second?.markdown).toContain('Second point [1].');
    expect(second?.markdown).not.toContain('Premier point');
    expect(second?.stale).toBe(false);
    expect(second?.lastReadAt?.getTime()).toBe(readAt.getTime());
  });

  it('sans rien de neuf sur le projet, écrit un point vide sans appeler le modèle', async () => {
    const project = `github.com/${uniqueRepo()}`;
    const llm = writes(['ne doit pas servir']);
    const team = await newTeam(['Solo'], tenantIds);
    const [solo] = team.members as [TenantContext];

    await refreshBriefing(solo, project, { llm });

    const row = await rowOf(solo, project);
    expect(llm.calls).toEqual([]);
    expect(row?.markdown).toMatch(/Rien de neuf sur ce projet/);
    expect(row?.sourceIds).toEqual([]);
  });

  it('sur une panne ou une réponse vide du modèle, lève et garde le point précédent', async () => {
    const seeded = await seedProject(alice);
    await refreshBriefing(alice, seeded.project, { llm: writes(['Point qui tient [1].']) });
    const failing: Llm = {
      // biome-ignore lint/correctness/useYield: un modèle en panne ne rend rien
      async *streamText() {
        throw new LlmError('erreur du modèle');
      },
      runAgent: () => {
        throw new Error('inutile ici');
      },
    };

    await expect(refreshBriefing(alice, seeded.project, { llm: failing })).rejects.toThrow(
      LlmError,
    );
    await expect(
      refreshBriefing(alice, seeded.project, { llm: writes(['  ', '\n']) }),
    ).rejects.toThrow(LlmError);

    expect((await rowOf(alice, seeded.project))?.markdown).toContain('Point qui tient [1].');
  });
});

describe('readBriefing', () => {
  it('rend le dernier point, même périmé, et note l’heure de lecture', async () => {
    const seeded = await seedProject(alice);
    const now = new Date();
    await refreshBriefing(alice, seeded.project, { llm: writes(['Point [1].']), now });
    await adminPool.query('update briefings set stale = true where user_id = $1 and project = $2', [
      alice.userId,
      seeded.project,
    ]);
    const before = Date.now();

    const read = await readBriefing(alice, seeded.project);

    expect(read?.markdown).toContain('Point [1].');
    expect(read?.preparedAt.getTime()).toBe(now.getTime());
    const lastReadAt = (await rowOf(alice, seeded.project))?.lastReadAt?.getTime() ?? 0;
    expect(lastReadAt).toBeGreaterThanOrEqual(before - 1000);
    expect(await jobsFor(alice, seeded.project)).toEqual([]);
  });

  it('sans point : null, et le point est mis en file tout de suite', async () => {
    const project = `github.com/${uniqueRepo()}`;

    expect(await readBriefing(alice, project)).toBeNull();

    const jobs = await jobsFor(alice, project);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toEqual({ tenantId, userId: alice.userId, project });
    expect((jobs[0]?.startAfter.getTime() ?? Infinity) - Date.now()).toBeLessThan(5000);
  });

  // Un signal a mis le recalcul dans 30 minutes (file `stately` : un seul job en attente par clé). Une lecture qui
  // ne trouve rien à montrer l'avance à maintenant, au lieu d'être ignorée par la file.
  it('sans point, avance à maintenant un recalcul déjà en attente, sans en ajouter un second', async () => {
    const project = `github.com/${uniqueRepo()}`;
    await signalProjectActivity(alice, project, [alice.userId]);
    const [delayed] = await jobsFor(alice, project);
    expect((delayed?.startAfter.getTime() ?? 0) - Date.now()).toBeGreaterThan(20 * 60_000);

    expect(await readBriefing(alice, project)).toBeNull();

    const jobs = await jobsFor(alice, project);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe(delayed?.id);
    expect((jobs[0]?.startAfter.getTime() ?? Infinity) - Date.now()).toBeLessThan(5000);
    expect(jobs[0]?.data).toEqual({ tenantId, userId: alice.userId, project });
  });

  it('avec `refresh: false` (aucun modèle) : null, sans rien mettre en file', async () => {
    const project = `github.com/${uniqueRepo()}`;

    expect(await readBriefing(alice, project, { refresh: false })).toBeNull();

    expect(await jobsFor(alice, project)).toEqual([]);
  });

  // Vigilance 3 : une source qui perd ses droits disparaît aussi du point déjà préparé.
  it.each([
    ['citée', 'sessionId'],
    ['fournie sans être citée', 'mentionId'],
  ] as const)(
    'une source %s devenue invisible : null, point périmé et remis en file',
    async (_name, which) => {
      const seeded = await seedProject(alice);
      await refreshBriefing(alice, seeded.project, { llm: writes(['Le jeton est corrigé [1].']) });
      await adminPool.query('update sources set acl = $2 where id = $1', [
        seeded[which],
        [bob.userId],
      ]);

      expect(await readBriefing(alice, seeded.project)).toBeNull();

      expect(await jobsFor(alice, seeded.project)).toHaveLength(1);
      expect((await rowOf(alice, seeded.project))?.stale).toBe(true);
    },
  );

  it('une source supprimée : null, et remis en file', async () => {
    const seeded = await seedProject(alice);
    await refreshBriefing(alice, seeded.project, { llm: writes(['Point [2].']) });
    await adminPool.query('delete from sources where id = $1', [seeded.changeId]);

    expect(await readBriefing(alice, seeded.project)).toBeNull();
    expect(await jobsFor(alice, seeded.project)).toHaveLength(1);
  });

  it('ne rend jamais le point d’un autre', async () => {
    const seeded = await seedProject(alice);
    await refreshBriefing(alice, seeded.project, { llm: writes(['Point d’Alice [1].']) });

    expect(await readBriefing(bob, seeded.project)).toBeNull();
    expect((await rowOf(alice, seeded.project))?.lastReadAt).toBeNull();
  });
});

describe('latestBriefingProject', () => {
  it('rend le projet du point lu le plus récemment, sinon préparé le plus récemment', async () => {
    const team = await newTeam(['Camille'], tenantIds);
    const [camille] = team.members as [TenantContext];
    const [read, prepared, older] = [uniqueRepo(), uniqueRepo(), uniqueRepo()].map(
      (repo) => `github.com/${repo}`,
    ) as [string, string, string];

    expect(await latestBriefingProject(camille)).toBeNull();

    await refreshBriefing(camille, older, { llm: writes([]), now: ago(3 * HOUR) });
    await refreshBriefing(camille, prepared, { llm: writes([]), now: ago(HOUR) });
    expect(await latestBriefingProject(camille)).toBe(prepared);

    await refreshBriefing(camille, read, { llm: writes([]), now: ago(2 * HOUR) });
    await readBriefing(camille, read);
    expect(await latestBriefingProject(camille)).toBe(read);
    expect(await latestBriefingProject(alice)).not.toBe(read);
  });

  it('le message d’attente dit que le point sera prêt à la prochaine session', () => {
    expect(BRIEFING_PENDING_MARKDOWN).toBe(
      'Pas encore de point pour ce projet : il sera prêt à la prochaine session.',
    );
  });
});
