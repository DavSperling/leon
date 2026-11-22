import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parisTime, weekDays } from '@/lib/agenda';
import { deleteAccount } from '@/server/auth/delete-account';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import { adminPool } from '@/test/db';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';
import { AGENDA_DAILY_CAP, AGENDA_MAILS_MAX, readWeek, refreshAgenda } from './agenda';

// Le calendrier de l'Accueil, sous les droits de chacun : la lecture des e-mails par le faux modèle, ce qui est
// gardé, les réunions Outlook lues telles quelles, et la relecture qui écarte ce que la personne ne voit pas.

const HOUR = 3_600_000;
const tenantIds: string[] = [];
let tenantId: string;
let alice: TenantContext;
let bob: TenantContext;

const now = new Date();
const days = weekDays(now);
const day = (i: number) => days[i] as string;

async function storedOf(owner: TenantContext) {
  const { rows } = await adminPool.query(
    'select rendez_vous, source_ids, prepared_at from agendas where tenant_id = $1 and user_id = $2',
    [owner.tenantId, owner.userId],
  );
  return rows[0] as
    | { rendez_vous: Array<Record<string, string>>; source_ids: string[]; prepared_at: Date }
    | undefined;
}

const mail = (owner: TenantContext, text: string, acl?: string[]) =>
  seedRun(owner, {
    kind: 'gmail',
    title: 'Invitation',
    metadata: { nature: 'fil', url: 'https://mail.example/fil' },
    turns: [{ text, ts: new Date(now.getTime() - HOUR), role: 'participant', authorName: 'Julie' }],
    status: 'done',
    ...(acl ? { acl } : {}),
  });

const event = (owner: TenantContext, versions: Array<{ text: string; ts: Date }>) =>
  seedRun(owner, {
    kind: 'outlook',
    title: 'Revue trimestrielle',
    metadata: {
      nature: 'reunion',
      url: 'https://outlook.example/ev',
      origin: { participants: 'Julie' },
    },
    turns: versions.map((v) => ({ ...v, role: 'document' as const })),
    status: 'done',
  });

beforeAll(async () => {
  const team = await newTeam(['Alice Martin', 'Bob Durand'], tenantIds);
  tenantId = team.tenantId;
  [alice, bob] = team.members as [TenantContext, TenantContext];
});

beforeEach(async () => {
  await adminPool.query('delete from agendas where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from agendas_par_jour where user_id = any($1)', [
    [alice.userId, bob.userId],
  ]);
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
});

afterAll(async () => {
  await adminPool.query('delete from agendas where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from agendas_par_jour where user_id = any($1)', [
    [alice.userId, bob.userId],
  ]);
  await dropTeams(tenantIds);
});

describe('refreshAgenda', () => {
  it('garde les rendez-vous valides que le modèle trouve dans SES e-mails, et rien de ceux des autres', async () => {
    const own = await mail(alice, 'On se voit jeudi à 14 h pour le point projet.');
    await mail(bob, 'Mail privé de Bob : entretien secret lundi.');
    await mail(bob, 'Mail de Bob partagé à toute l’équipe : déjeuner vendredi.', [tenantId]);
    const llm = createFakeLlm({
      texts: [
        `{"n": 1, "titre": "Point projet", "debut": "${day(3)}T14:00", "fin": "${day(3)}T15:00", "avec": "Julie"}\n`,
        `{"n": 1, "titre": "Hors période", "debut": "2001-01-01T10:00"}\n`,
        `{"n": 9, "titre": "Mail inconnu", "debut": "${day(2)}T10:00"}\n`,
        'Voici les rendez-vous trouvés.\n',
        `{"n": 1, "titre": "Point projet", "debut": "${day(3)}T14:00"}`,
      ],
    });

    await refreshAgenda(alice, { llm, now });

    expect(llm.calls).toHaveLength(1);
    const call = llm.calls[0];
    expect(call?.step).toBe('agenda');
    const prompt = call?.messages[0]?.content ?? '';
    expect(prompt.startsWith(DATA_GUARD_LINE)).toBe(true);
    expect(prompt).toContain('point projet');
    expect(prompt).not.toContain('Bob');
    const stored = await storedOf(alice);
    expect(stored?.rendez_vous).toEqual([
      {
        titre: 'Point projet',
        debut: `${day(3)}T14:00`,
        fin: `${day(3)}T15:00`,
        avec: 'Julie',
        sourceId: own.sourceId,
      },
    ]);
    expect(stored?.source_ids).toEqual([own.sourceId]);
  });

  it('donne au modèle les e-mails qui annoncent un rendez-vous avant les autres, même plus anciens', async () => {
    await seedRun(alice, {
      kind: 'gmail',
      title: 'Nouvelles offres',
      metadata: { nature: 'fil' },
      turns: Array.from({ length: AGENDA_MAILS_MAX + 5 }, (_, i) => ({
        text: `Alerte offre numéro ${i}`,
        ts: new Date(now.getTime() - (i + 1) * 60_000),
        role: 'participant' as const,
      })),
      status: 'done',
    });
    const invitation = await seedRun(alice, {
      kind: 'gmail',
      title: 'Invitation: Entretien technique',
      metadata: { nature: 'fil' },
      turns: [
        {
          text: 'Mardi 10 h, lien Zoom.',
          ts: new Date(now.getTime() - 10 * 24 * HOUR),
          role: 'participant',
        },
      ],
      status: 'done',
    });
    const llm = createFakeLlm({
      texts: [`{"n": 1, "titre": "Entretien technique", "debut": "${day(1)}T10:00"}`],
    });

    await refreshAgenda(alice, { llm, now });

    const prompt = llm.calls[0]?.messages[0]?.content ?? '';
    expect(prompt).toContain('lien Zoom');
    expect((await storedOf(alice))?.rendez_vous).toEqual([
      { titre: 'Entretien technique', debut: `${day(1)}T10:00`, sourceId: invitation.sourceId },
    ]);
  });

  it('ne rappelle pas le modèle sans e-mail arrivé depuis, ni passé le plafond du jour', async () => {
    await mail(alice, 'Visio mardi 10 h.');
    await refreshAgenda(alice, { llm: createFakeLlm({ texts: [''] }), now });
    const first = await storedOf(alice);

    // Un faux sans script lève s'il est appelé.
    await refreshAgenda(alice, { llm: createFakeLlm({}), now: new Date(now.getTime() + 60_000) });
    expect((await storedOf(alice))?.prepared_at.getTime()).toBeGreaterThan(
      first?.prepared_at.getTime() ?? 0,
    );

    await mail(alice, 'Nouveau : déjeuner vendredi midi.');
    await adminPool.query(
      "update agendas_par_jour set nombre = $2 where user_id = $1 and jour = (now() at time zone 'UTC')::date",
      [alice.userId, AGENDA_DAILY_CAP],
    );
    const capped = createFakeLlm({ texts: [''] });
    await refreshAgenda(alice, { llm: capped, now: new Date(now.getTime() + 120_000) });
    expect(capped.calls).toHaveLength(0);
  });
});

describe('le calendrier part avec le compte', () => {
  it('une lecture des e-mails lancée en même temps que la suppression du compte, ou après, ne laisse aucun rendez-vous', async () => {
    const team = await newTeam(['Julie Martin', 'Paul Durand'], tenantIds);
    const [julie] = team.members as [TenantContext, TenantContext];
    await mail(julie, 'On se voit jeudi à 14 h pour le point projet.');
    const llm = createFakeLlm({
      texts: [`{"n": 1, "titre": "Point projet", "debut": "${day(3)}T14:00"}`],
    });

    // La lecture écrit avant la suppression, qui efface la ligne, ou après, et n'écrit rien.
    await Promise.all([refreshAgenda(julie, { llm, now }), deleteAccount(julie, null, false)]);

    expect(await storedOf(julie)).toBeUndefined();
    // Ses e-mails restent (ses sources ne partent pas) : sans compte, ils ne refont pas son calendrier.
    await refreshAgenda(julie, { llm: createFakeLlm({}), now });
    expect(await storedOf(julie)).toBeUndefined();
  });

  it('une lecture qui arrive à l’écriture pendant la suppression attend sa fin, et n’écrit rien', async () => {
    const pause = () => new Promise((resolve) => setTimeout(resolve, 300));
    const team = await newTeam(['Julie Martin', 'Paul Durand'], tenantIds);
    const [julie] = team.members as [TenantContext, TenantContext];
    await mail(julie, 'On se voit jeudi à 14 h pour le point projet.');
    const llm = createFakeLlm({
      texts: [`{"n": 1, "titre": "Point projet", "debut": "${day(3)}T14:00"}`],
    });
    // Retient la suppression au milieu, l'organisation déjà prise (lockMembers), le compte pas encore marqué.
    const holding = await adminPool.connect();
    try {
      await holding.query('begin');
      await holding.query('select 1 from member where "userId" = $1 for update', [julie.userId]);
      const leaving = deleteAccount(julie, null, false);
      await pause();
      // Le compte se lit encore en place : la lecture va jusqu'à l'écriture, qui attend l'organisation.
      const reading = refreshAgenda(julie, { llm, now });
      await pause();
      await holding.query('commit');

      await expect(leaving).resolves.toMatchObject({ organizationDeleted: false });
      await reading;
    } finally {
      await holding.query('rollback');
      holding.release();
    }

    expect(llm.calls).toHaveLength(1);
    expect(await storedOf(julie)).toBeUndefined();
  });
});

describe('readWeek', () => {
  it('montre la dernière version de ses réunions Outlook de la semaine, pas les annulées ni celles des autres', async () => {
    const moved = await event(alice, [
      {
        text: `Début : ${day(2)}T07:00:00Z\nFin : ${day(2)}T08:00:00Z`,
        ts: new Date(now.getTime() - 5 * HOUR),
      },
      {
        text: `Début : ${day(3)}T09:00:00Z\nFin : ${day(3)}T10:00:00Z`,
        ts: new Date(now.getTime() - HOUR),
      },
    ]);
    await event(alice, [
      { text: `Début : ${day(4)}T09:00:00Z\nStatut : annulée`, ts: new Date(now.getTime() - HOUR) },
    ]);
    await event(alice, [{ text: '2001-01-01', ts: now }]);
    await event(bob, [{ text: `Début : ${day(1)}T09:00:00Z`, ts: now }]);

    const week = await readWeek(alice, now);

    expect(week.days).toEqual(days);
    expect(week.rendezVous).toEqual([
      {
        titre: 'Revue trimestrielle',
        debut: parisTime(new Date(`${day(3)}T09:00:00Z`)),
        fin: parisTime(new Date(`${day(3)}T10:00:00Z`)),
        avec: 'Julie',
        sourceId: moved.sourceId,
        outil: 'outlook',
        lien: 'https://outlook.example/ev',
      },
    ]);
    expect((await readWeek(bob, now)).rendezVous.map((r) => r.debut)).toEqual([
      parisTime(new Date(`${day(1)}T09:00:00Z`)),
    ]);
  });

  it('écarte un rendez-vous dont la personne ne voit pas la source, et le calendrier d’un autre', async () => {
    const own = await mail(alice, 'Point jeudi.');
    const hidden = await mail(bob, 'Privé à Bob.');
    await adminPool.query(
      `insert into agendas (tenant_id, user_id, rendez_vous, source_ids, prepared_at, acl)
       values ($1, $2, $3, $4, now(), array[$2::uuid])`,
      [
        tenantId,
        alice.userId,
        JSON.stringify([
          { titre: 'Visible', debut: `${day(3)}T14:00`, sourceId: own.sourceId },
          { titre: 'Caché', debut: `${day(3)}T16:00`, sourceId: hidden.sourceId },
          { titre: 'Autre semaine', debut: '2001-01-01T10:00', sourceId: own.sourceId },
        ]),
        [own.sourceId, hidden.sourceId],
      ],
    );

    const week = await readWeek(alice, now);
    expect(week.rendezVous).toEqual([
      {
        titre: 'Visible',
        debut: `${day(3)}T14:00`,
        fin: null,
        avec: null,
        sourceId: own.sourceId,
        outil: 'gmail',
        lien: 'https://mail.example/fil',
      },
    ]);
    expect(week.preparedAt).not.toBeNull();
    expect(await readWeek(bob, now)).toEqual({ days, rendezVous: [], preparedAt: null });
  });
});
