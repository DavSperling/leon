import { and, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAccount } from '@/server/auth/delete-account';
import { setManager } from '@/server/auth/organisation';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createConnection } from '@/server/connectors/connections';
import { forgetPipedreamToken, PIPEDREAM_SECRET_FIELDS } from '@/server/connectors/pipedream';
import { members, users } from '@/server/db/schema/auth';
import { brouillons, reponsesAgent } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { type Llm, LlmError } from '@/server/llm/llm';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import { adminDb, adminPool } from '@/test/db';
import { type FakeRoute, fakeFetch } from '@/test/fake-fetch';
import { createTestTenant } from '@/test/fixtures';
import { extendThread, mailThread, received, sent } from '@/test/mail-threads';
import {
  answerQuestions,
  BROUILLONS_DAILY_CAP,
  discardBrouillon,
  readBrouillons,
  writeBrouillons,
} from './brouillons';
import { buildFiche } from './fiche';

vi.mock('@/server/pipeline/queue');

// L'agent « Brouillons de réponse », de bout en bout sous les droits de la personne : ses mails qui attendent, un appel
// au faux modèle par mail, le brouillon gardé dans sa table privée. Données inventées : Julie, Paul et Marc dans une
// organisation, Zoé dans une autre, des adresses en .test qui n'existent pas.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);
const DRAFT = 'Bonjour Léa,\n\nVoici le devis [à compléter : le montant].\n\nBien à vous';
const draft = (texte = DRAFT) => JSON.stringify({ brouillon: texte });
const NONE = '{"sans_reponse": true}';
const QUESTIONS = ['Acceptez-vous le rendez-vous de mardi ?', 'Quel prix lui annoncer ?'];
const ask = (questions = QUESTIONS) => JSON.stringify({ questions });

const tenantIds: string[] = [];
const userIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from brouillons_par_jour where user_id = any($1)', [userIds]);
});
afterEach(() => vi.restoreAllMocks());

async function team(): Promise<[TenantContext, TenantContext, TenantContext]> {
  const { tenantId, members: people } = await createTestTenant([
    'Julie Martin',
    'Paul Durand',
    'Marc Petit',
  ]);
  tenantIds.push(tenantId);
  userIds.push(...people.map((one) => one.userId));
  return people as [TenantContext, TenantContext, TenantContext];
}

const answer = (ctx: TenantContext, oui: boolean) =>
  adminDb
    .insert(reponsesAgent)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      agent: 'brouillon-reponse',
      oui,
      acl: [ctx.userId],
    })
    .onConflictDoUpdate({
      target: [reponsesAgent.tenantId, reponsesAgent.userId, reponsesAgent.agent],
      set: { oui },
    });

// Sa boîte Gmail et un échange avec Léa, à qui elle a répondu : sa fiche calculée compte une réponse, l'agent lui est
// proposé. Sans son « oui ». Les fils des fixtures sont ceux de Julie (son nom, son adresse), dans la boîte de qui les
// relève.
async function withFiche(ctx: TenantContext): Promise<void> {
  await mailThread(ctx, 'Premier contact', [
    received(ago(10 * DAY), 'Bonjour Julie, travaillez-vous avec des collectivités ?'),
    sent(ago(10 * DAY - HOUR), 'Bonjour Léa,\nOui, depuis dix ans.\nBien à vous'),
  ]);
  await buildFiche(ctx);
}

// La personne, prête : sa fiche, son « oui », et un mail de Léa qui attend dans chaque fil nommé, le premier étant le
// plus récent.
async function ready(ctx: TenantContext, ...titles: string[]): Promise<void> {
  await withFiche(ctx);
  await answer(ctx, true);
  for (const [index, title] of titles.entries())
    await mailThread(ctx, title, [
      received(ago((index + 1) * HOUR), `Bonjour Julie, une question sur : ${title}.`),
    ]);
}
async function julieWaiting(...titles: string[]): Promise<TenantContext> {
  const [julie] = await team();
  await ready(julie, ...titles);
  return julie;
}

// Un faux modèle qui rend une réponse par appel, la dernière ensuite, et garde ses appels.
function answering(...answers: string[]) {
  const fake = createFakeLlm({ texts: [] });
  const llm: Llm = {
    ...fake,
    async *streamText(request) {
      yield* fake.streamText(request);
      yield answers[fake.calls.length - 1] ?? answers.at(-1) ?? '';
    },
  };
  return { llm, calls: fake.calls };
}

const stored = (ctx: TenantContext) =>
  adminDb.select().from(brouillons).where(eq(brouillons.userId, ctx.userId));
const titlesOf = async (ctx: TenantContext) => {
  const { rows } = await adminPool.query<{ title: string; texte: string | null }>(
    `select s.title, b.texte from brouillons b join sources s on s.id = b.source_id
     where b.user_id = $1 order by s.title`,
    [ctx.userId],
  );
  return rows.map((row) => [row.title, row.texte]);
};
const counted = async (ctx: TenantContext) => {
  const { rows } = await adminPool.query<{ nombre: number }>(
    'select nombre from brouillons_par_jour where user_id = $1',
    [ctx.userId],
  );
  return rows[0]?.nombre ?? 0;
};
const deleteAccountOf = (ctx: TenantContext) =>
  adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, ctx.userId));

describe('writeBrouillons', () => {
  it('écrit un brouillon par mail qui attend, d’un appel au modèle chacun, avec sa façon d’écrire', async () => {
    const julie = await julieWaiting('Devis 2027', 'Contrat');
    const { llm, calls } = answering(draft());
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    expect(await writeBrouillons(julie, { llm })).toBe(2);

    expect(calls.map((call) => call.step)).toEqual(['brouillon', 'brouillon']);
    // Le plus récent d'abord.
    const prompt = calls[0]?.messages[0]?.content ?? '';
    expect(prompt.startsWith(DATA_GUARD_LINE)).toBe(true);
    expect(prompt).toContain('<personne nom="Julie Martin"/>');
    // Les mesures de sa fiche, que l'écran ne montre pas : sa formule d'appel, sa formule de politesse, son registre
    // avec Léa, sa longueur.
    expect(prompt).toMatch(
      /<facon appels="Bonjour" politesses="Bien à vous" registre="vouvoiement" mots="\d+"\/>/,
    );
    expect(prompt).toContain('<exemple>Bonjour Léa,\nOui, depuis dix ans.\nBien à vous</exemple>');
    expect(prompt).toContain('<fil objet="Devis 2027">');
    expect(prompt).toMatch(
      /<message de="Léa Roy" date="[^"]+">Bonjour Julie, une question sur : Devis 2027\.<\/message>\n<\/fil>$/,
    );
    expect(prompt).not.toContain('Contrat');
    expect(prompt).not.toContain('@');
    expect(calls[1]?.messages[0]?.content).toContain('<fil objet="Contrat">');

    const rows = await stored(julie);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ texte: DRAFT, ecarteLe: null, acl: [julie.userId] });
      expect(row.message).toMatch(/^message:[0-9a-f-]{36}$/);
    }
    expect(await titlesOf(julie)).toEqual([
      ['Contrat', DRAFT],
      ['Devis 2027', DRAFT],
    ]);
    expect(await counted(julie)).toBe(2);
    // Le journal ne porte que des identifiants et des nombres : rien du mail ni du brouillon.
    const logged = info.mock.calls
      .filter((args) => args[1] === 'brouillons.answered')
      .map((args) => JSON.parse(String(args[2])));
    expect(logged).toHaveLength(2);
    for (const one of logged)
      expect(one).toEqual({
        userId: julie.userId,
        sourceId: expect.any(String),
        brouillon: true,
        questions: 0,
        chars: draft().length,
      });
    expect(new Set(logged.map((one) => one.sourceId))).toEqual(
      new Set(rows.map((row) => row.sourceId)),
    );
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/Bonjour|Léa|@/);
  });

  it('un mail jugé sans réponse à donner ne reçoit pas de brouillon, et n’est jamais redemandé au modèle', async () => {
    const julie = await julieWaiting('Merci');
    const first = answering(NONE);
    vi.spyOn(console, 'info').mockImplementation(() => {});

    expect(await writeBrouillons(julie, { llm: first.llm })).toBe(0);

    expect(first.calls).toHaveLength(1);
    expect(await titlesOf(julie)).toEqual([['Merci', null]]);
    const second = answering(draft());
    expect(await writeBrouillons(julie, { llm: second.llm })).toBe(0);
    expect(second.calls).toHaveLength(0);
    expect(await titlesOf(julie)).toEqual([['Merci', null]]);
  });

  it('quand le modèle pose des questions, elles sont gardées sans texte, et le modèle n’est pas rappelé tant qu’elle n’a pas répondu', async () => {
    const julie = await julieWaiting('Devis 2027');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const first = answering(ask());

    expect(await writeBrouillons(julie, { llm: first.llm })).toBe(0);

    expect(first.calls).toHaveLength(1);
    const rows = await stored(julie);
    expect(rows).toMatchObject([
      { texte: null, questions: QUESTIONS, reponses: null, ecarteLe: null, brouillonGmail: null },
    ]);
    // Le journal compte les questions, sans rien en dire.
    expect(JSON.parse(String(info.mock.calls.at(-1)?.[2]))).toEqual({
      userId: julie.userId,
      sourceId: rows[0]?.sourceId,
      brouillon: false,
      questions: 2,
      chars: ask().length,
    });
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/mardi|prix/);
    // Rien à montrer parmi ses brouillons prêts, et rien à redemander au modèle : Leon l'attend.
    expect(await readBrouillons(julie)).toEqual([]);
    const again = answering(draft());
    expect(await writeBrouillons(julie, { llm: again.llm })).toBe(0);
    expect(again.calls).toHaveLength(0);
    expect(await counted(julie)).toBe(1);
  });

  it('n’appelle jamais deux fois le modèle pour le même mail : un second passage ne demande que le mail arrivé depuis', async () => {
    const julie = await julieWaiting('Devis 2027');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await writeBrouillons(julie, { llm: answering(draft()).llm });
    const before = await stored(julie);

    const again = answering(draft('Bonjour Léa,\n\nUn autre texte.'));
    expect(await writeBrouillons(julie, { llm: again.llm })).toBe(0);
    expect(again.calls).toHaveLength(0);
    expect(await stored(julie)).toEqual(before);

    await mailThread(julie, 'Facture', [received(ago(HOUR / 2), 'Bonjour Julie, et la facture ?')]);
    const later = answering(draft('Bonjour Léa,\n\nLa voici.'));
    expect(await writeBrouillons(julie, { llm: later.llm })).toBe(1);
    expect(later.calls).toHaveLength(1);
    expect(later.calls[0]?.messages[0]?.content).toContain('<fil objet="Facture">');
    expect(await titlesOf(julie)).toEqual([
      ['Devis 2027', DRAFT],
      ['Facture', 'Bonjour Léa,\n\nLa voici.'],
    ]);
  });

  it.each([
    ['sans JSON', 'Bonjour Léa, voici le devis.'],
    ['vide', ''],
    ['dont le brouillon dépasse la borne', draft('x'.repeat(6001))],
  ])(
    'une réponse illisible (%s) n’écrit rien, et le mail est retenté au passage suivant',
    async (_, bad) => {
      const julie = await julieWaiting('Devis 2027');
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});

      expect(await writeBrouillons(julie, { llm: answering(bad).llm })).toBe(0);

      expect(await stored(julie)).toEqual([]);
      expect(JSON.parse(String(info.mock.calls.at(-1)?.[2]))).toMatchObject({ brouillon: null });
      const retry = answering(draft());
      expect(await writeBrouillons(julie, { llm: retry.llm })).toBe(1);
      expect(retry.calls).toHaveLength(1);
      expect(await titlesOf(julie)).toEqual([['Devis 2027', DRAFT]]);
      // Les deux appels comptent sous le plafond du jour.
      expect(await counted(julie)).toBe(2);
    },
  );

  it('un refus ou une panne du modèle sur un mail n’arrête pas les suivants, et ce mail sera retenté', async () => {
    const julie = await julieWaiting('Refusé', 'Devis 2027');
    const fake = answering(draft());
    const llm: Llm = {
      ...fake.llm,
      async *streamText(request) {
        if (fake.calls.length === 0) {
          // Le premier appel est gardé, puis refusé.
          await fake.llm.streamText(request)[Symbol.asyncIterator]().next();
          throw new LlmError('refus du modèle');
        }
        yield* fake.llm.streamText(request);
      },
    };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});

    expect(await writeBrouillons(julie, { llm })).toBe(1);

    expect(fake.calls).toHaveLength(2);
    expect(await titlesOf(julie)).toEqual([['Devis 2027', DRAFT]]);
    expect(log.mock.calls.flat().map(String).join('\n')).toContain('brouillons.call_failed');
    expect(await writeBrouillons(julie, { llm: fake.llm })).toBe(1);
    expect(await titlesOf(julie)).toEqual([
      ['Devis 2027', DRAFT],
      ['Refusé', DRAFT],
    ]);
  });

  it('laisse remonter une erreur qui n’est pas du modèle', async () => {
    const julie = await julieWaiting('Devis 2027');
    const llm: Llm = {
      // biome-ignore lint/correctness/useYield: un défaut du code ne rend rien
      async *streamText() {
        throw new TypeError('défaut du code');
      },
      runAgent: () => {
        throw new Error('hors du test');
      },
    };

    await expect(writeBrouillons(julie, { llm })).rejects.toThrow(TypeError);
    expect(await stored(julie)).toEqual([]);
  });

  it('s’arrête au plafond du jour : vingt appels par personne, pas un de plus', async () => {
    const julie = await julieWaiting('Un', 'Deux', 'Trois');
    await adminPool.query(
      `insert into brouillons_par_jour (user_id, jour, nombre)
       values ($1, (now() at time zone 'UTC')::date, $2)`,
      [julie.userId, BROUILLONS_DAILY_CAP - 1],
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { llm, calls } = answering(draft());

    expect(BROUILLONS_DAILY_CAP).toBe(20);
    expect(await writeBrouillons(julie, { llm })).toBe(1);

    expect(calls).toHaveLength(1);
    expect(await titlesOf(julie)).toEqual([['Un', DRAFT]]);
    expect(await counted(julie)).toBe(20);
    expect(warn.mock.calls.map((args) => args[1])).toEqual(['brouillons.daily_cap']);
    // Le plafond atteint : un nouveau passage n'appelle plus le modèle.
    expect(await writeBrouillons(julie, { llm })).toBe(0);
    expect(calls).toHaveLength(1);
    // Le lendemain, le compteur repart de zéro.
    await adminPool.query(
      "update brouillons_par_jour set jour = (now() at time zone 'UTC')::date - 1 where user_id = $1",
      [julie.userId],
    );
    expect(await writeBrouillons(julie, { llm })).toBe(2);
    expect(await counted(julie)).toBe(2);
  });

  it('ne traite que cinq mails par passage', async () => {
    const julie = await julieWaiting('1', '2', '3', '4', '5', '6', '7');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { llm, calls } = answering(draft());

    expect(await writeBrouillons(julie, { llm })).toBe(5);

    expect(calls).toHaveLength(5);
    expect((await titlesOf(julie)).map(([title]) => title)).toEqual(['1', '2', '3', '4', '5']);
    expect(await writeBrouillons(julie, { llm })).toBe(2);
    expect(calls).toHaveLength(7);
  });
});

describe('writeBrouillons : l’agent ne travaille que pour qui lui a dit oui', () => {
  // Julie, sa fiche et un mail qui attend, sans réponse à l'agent.
  async function undecided(): Promise<TenantContext> {
    const [julie] = await team();
    await withFiche(julie);
    await mailThread(julie, 'Devis 2027', [received(ago(HOUR), 'Bonjour Julie, et le devis ?')]);
    return julie;
  }

  it('sans réponse, ou après un non, aucun appel au modèle et rien d’écrit ; après un oui, le brouillon', async () => {
    const julie = await undecided();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { llm, calls } = answering(draft());

    expect(await writeBrouillons(julie, { llm })).toBe(0);
    await answer(julie, false);
    expect(await writeBrouillons(julie, { llm })).toBe(0);

    expect(calls).toHaveLength(0);
    expect(await stored(julie)).toEqual([]);
    expect(await counted(julie)).toBe(0);

    await answer(julie, true);
    expect(await writeBrouillons(julie, { llm })).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('un oui ne suffit plus quand l’agent ne lui est plus proposé : sa boîte débranchée', async () => {
    const julie = await undecided();
    await answer(julie, true);
    await adminPool.query('delete from connections where created_by = $1', [julie.userId]);
    const { llm, calls } = answering(draft());

    expect(await writeBrouillons(julie, { llm })).toBe(0);

    expect(calls).toHaveLength(0);
    expect(await stored(julie)).toEqual([]);
  });

  it('le oui d’un collègue ne fait rien écrire pour elle', async () => {
    const [julie, paul] = await team();
    await withFiche(julie);
    await mailThread(julie, 'Devis 2027', [received(ago(HOUR), 'Bonjour Julie, et le devis ?')]);
    await answer(paul, true);
    const { llm, calls } = answering(draft());

    expect(await writeBrouillons(julie, { llm })).toBe(0);
    expect(await writeBrouillons(paul, { llm })).toBe(0);

    expect(calls).toHaveLength(0);
  });
});

describe('writeBrouillons : un compte supprimé', () => {
  it('n’écrit rien, sans appeler le modèle', async () => {
    const julie = await julieWaiting('Devis 2027');
    await deleteAccountOf(julie);
    const { llm, calls } = answering(draft());

    expect(await writeBrouillons(julie, { llm })).toBe(0);

    expect(calls).toHaveLength(0);
    expect(await stored(julie)).toEqual([]);
  });

  it('n’écrit rien quand le compte est supprimé pendant l’appel au modèle', async () => {
    const julie = await julieWaiting('Devis 2027');
    const fake = answering(draft());
    const llm: Llm = {
      ...fake.llm,
      async *streamText(request) {
        await deleteAccountOf(julie);
        yield* fake.llm.streamText(request);
      },
    };
    vi.spyOn(console, 'info').mockImplementation(() => {});

    expect(await writeBrouillons(julie, { llm })).toBe(0);

    expect(fake.calls).toHaveLength(1);
    expect(await stored(julie)).toEqual([]);
  });
});

describe('writeBrouillons : deux passages simultanés', () => {
  it('ne gardent qu’un résultat par mail, sans erreur : le premier écrit reste', async () => {
    const julie = await julieWaiting('Devis 2027', 'Contrat');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    // Les deux passages lisent les mêmes mails avant que l'un des deux n'ait écrit.
    let started = 0;
    let go = () => {};
    const both = new Promise<void>((resolve) => {
      go = resolve;
    });
    const gated = (texte: string): Llm => {
      const fake = answering(draft(texte));
      return {
        ...fake.llm,
        async *streamText(request) {
          if (++started === 2) go();
          await both;
          yield* fake.llm.streamText(request);
        },
      };
    };

    const written = await Promise.all([
      writeBrouillons(julie, { llm: gated('Bonjour Léa,\n\nPremier passage.') }),
      writeBrouillons(julie, { llm: gated('Bonjour Léa,\n\nSecond passage.') }),
    ]);

    // Deux mails, deux lignes : chaque mail garde le brouillon du passage qui a écrit le premier.
    expect(written[0] + written[1]).toBe(2);
    const rows = await stored(julie);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.sourceId)).size).toBe(2);
  });
});

describe('writeBrouillons : ses réponses aux questions de Leon, puis le brouillon en entier', () => {
  const REPONSES = ['Oui, à 10 h.', ''];
  const COMPLET = 'Bonjour Léa,\n\nMardi à 10 h me convient.\n\nBien à vous';
  const SUITE = 'tu lui as posé des questions, et elle y a répondu';
  // Le fil nommé, parmi ses sources, et la demande que Leon y a posée.
  const threadOf = async (ctx: TenantContext, title: string) => {
    const { rows } = await adminPool.query<{ id: string }>(
      'select id from sources where owner_user_id = $1 and title = $2',
      [ctx.userId, title],
    );
    return rows[0]?.id ?? '';
  };
  const demandOf = async (ctx: TenantContext, title: string) => {
    const sourceId = await threadOf(ctx, title);
    return (await stored(ctx)).find((row) => row.sourceId === sourceId)?.id ?? '';
  };
  // Julie, à qui Leon a posé ses questions sur le mail de chaque fil nommé : un premier appel chacun.
  async function julieAsked(...titles: string[]): Promise<TenantContext> {
    const julie = await julieWaiting(...titles);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await writeBrouillons(julie, { llm: answering(ask()).llm })).toBe(0);
    return julie;
  }

  it('elle répond, puis un seul appel écrit le brouillon en entier, avec la même matière, ses questions et ses réponses', async () => {
    const julie = await julieAsked('Devis 2027');
    const id = await demandOf(julie, 'Devis 2027');

    expect(await answerQuestions(julie, id, REPONSES)).toBe(true);
    const { llm, calls } = answering(draft(COMPLET));
    expect(await writeBrouillons(julie, { llm })).toBe(1);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.step).toBe('brouillon');
    expect(calls[0]?.system).toContain(SUITE);
    const prompt = calls[0]?.messages[0]?.content ?? '';
    expect(prompt.startsWith(DATA_GUARD_LINE)).toBe(true);
    expect(prompt).toContain('<personne nom="Julie Martin"/>');
    expect(prompt).toMatch(
      /<facon appels="Bonjour" politesses="Bien à vous" registre="vouvoiement"/,
    );
    expect(prompt).toContain('<exemple>Bonjour Léa,\nOui, depuis dix ans.\nBien à vous</exemple>');
    expect(prompt).toContain('<fil objet="Devis 2027">');
    expect(
      prompt.endsWith(
        [
          '</fil>',
          '',
          'Tes questions, et ses réponses :',
          `<question>${QUESTIONS[0]}</question>`,
          '<reponse>Oui, à 10 h.</reponse>',
          `<question>${QUESTIONS[1]}</question>`,
          '<reponse></reponse>',
        ].join('\n'),
      ),
    ).toBe(true);
    expect(await stored(julie)).toMatchObject([
      { id, texte: COMPLET, questions: QUESTIONS, reponses: REPONSES, ecarteLe: null },
    ]);
    // Il suit le chemin de tous les brouillons : montré parmi ses brouillons prêts.
    expect((await readBrouillons(julie)).map((one) => one.texte)).toEqual([COMPLET]);
    // Le premier et le second appel comptent sous le même plafond ; et plus aucun appel pour ce mail.
    expect(await counted(julie)).toBe(2);
    const again = answering(draft('Refait.'));
    expect(await writeBrouillons(julie, { llm: again.llm })).toBe(0);
    expect(again.calls).toHaveLength(0);
  });

  it.each([
    ['de nouvelles questions', ask(['Et jeudi ?'])],
    ['« sans réponse »', NONE],
    ['du texte sans JSON', 'Bonjour Léa, mardi me convient.'],
  ])(
    'au second appel, %s : illisible, rien ne s’écrit, et il est retenté au passage suivant',
    async (_, bad) => {
      const julie = await julieAsked('Devis 2027');
      const id = await demandOf(julie, 'Devis 2027');
      await answerQuestions(julie, id, REPONSES);

      expect(await writeBrouillons(julie, { llm: answering(bad).llm })).toBe(0);

      expect(await stored(julie)).toMatchObject([
        { texte: null, questions: QUESTIONS, reponses: REPONSES },
      ]);
      const retry = answering(draft(COMPLET));
      expect(await writeBrouillons(julie, { llm: retry.llm })).toBe(1);
      expect(retry.calls).toHaveLength(1);
      expect(retry.calls[0]?.system).toContain(SUITE);
      expect(await titlesOf(julie)).toEqual([['Devis 2027', COMPLET]]);
      expect(await counted(julie)).toBe(3);
    },
  );

  it('un passage traite d’abord ce qu’elle attend, puis les mails qui attendent, cinq appels au plus en tout', async () => {
    // Sept mails : Leon pose ses questions sur les deux plus récents, écrit trois brouillons, et deux attendent encore.
    const julie = await julieWaiting('1', '2', '3', '4', '5', '6', '7');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await writeBrouillons(julie, { llm: answering(ask(), ask(), draft()).llm });
    // Elle ne répond qu'à la plus ancienne des deux demandes, et trois mails arrivent.
    await answerQuestions(julie, await demandOf(julie, '2'), REPONSES);
    for (const [index, title] of ['A', 'B', 'C'].entries())
      await mailThread(julie, title, [
        received(ago(((index + 1) * HOUR) / 10), `Bonjour Julie, une question sur : ${title}.`),
      ]);
    const { llm, calls } = answering(draft(COMPLET));

    expect(await writeBrouillons(julie, { llm })).toBe(5);

    const subjects = calls.map(
      (call) => /<fil objet="([^"]+)">/.exec(call.messages[0]?.content ?? '')?.[1],
    );
    expect(subjects).toEqual(['2', 'A', 'B', 'C', '6']);
    expect(calls.map((call) => call.system.includes(SUITE))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    // La demande sans réponse n'est pas redemandée ; le dernier mail attend le passage suivant.
    expect(await writeBrouillons(julie, { llm })).toBe(1);
    expect(calls).toHaveLength(6);
    expect(calls[5]?.messages[0]?.content).toContain('<fil objet="7">');
    expect((await titlesOf(julie)).find(([title]) => title === '1')).toEqual(['1', null]);
  });

  it('le plafond du jour vaut aussi pour le second appel', async () => {
    const julie = await julieAsked('Devis 2027');
    await answerQuestions(julie, await demandOf(julie, 'Devis 2027'), REPONSES);
    const set = (nombre: number) =>
      adminPool.query('update brouillons_par_jour set nombre = $2 where user_id = $1', [
        julie.userId,
        nombre,
      ]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { llm, calls } = answering(draft(COMPLET));

    await set(BROUILLONS_DAILY_CAP);
    expect(await writeBrouillons(julie, { llm })).toBe(0);
    expect(calls).toHaveLength(0);
    expect(warn.mock.calls.map((args) => args[1])).toEqual(['brouillons.daily_cap']);

    await set(BROUILLONS_DAILY_CAP - 1);
    expect(await writeBrouillons(julie, { llm })).toBe(1);
    expect(calls).toHaveLength(1);
    expect(await counted(julie)).toBe(BROUILLONS_DAILY_CAP);
  });

  it('le fil a bougé avant le passage : aucun appel pour ses réponses', async () => {
    const julie = await julieAsked('Répondu', 'Relancé');
    for (const title of ['Répondu', 'Relancé'])
      await answerQuestions(julie, await demandOf(julie, title), REPONSES);
    // Elle a répondu elle-même dans le premier fil : plus rien à écrire.
    await extendThread(julie, await threadOf(julie, 'Répondu'), [
      sent(ago(HOUR / 2), 'Bonjour Léa,\nJe vous réponds moi-même.'),
    ]);
    await extendThread(julie, await threadOf(julie, 'Relancé'), [
      received(ago(HOUR / 2), 'Julie, avez-vous vu mon message ?'),
    ]);
    const { llm, calls } = answering(draft(COMPLET));

    // Un seul appel : le premier pour la relance, qui attend à son tour. Aucun pour ses réponses.
    expect(await writeBrouillons(julie, { llm })).toBe(1);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).not.toContain(SUITE);
    expect(calls[0]?.messages[0]?.content).not.toContain('<question>');
    const rows = await stored(julie);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.questions).map((row) => row.texte)).toEqual([null, null]);
    expect(await writeBrouillons(julie, { llm })).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('une demande écartée est close : ni réponse acceptée, ni autre appel pour ce mail', async () => {
    const julie = await julieAsked('Écartée avant', 'Écartée après');
    const before = await demandOf(julie, 'Écartée avant');
    const after = await demandOf(julie, 'Écartée après');

    expect(await discardBrouillon(julie, before)).toBe(true);
    expect(await answerQuestions(julie, before, REPONSES)).toBe(false);
    // Écartée après avoir répondu, avant le passage.
    expect(await answerQuestions(julie, after, REPONSES)).toBe(true);
    expect(await discardBrouillon(julie, after)).toBe(true);

    const { llm, calls } = answering(draft(COMPLET));
    expect(await writeBrouillons(julie, { llm })).toBe(0);
    expect(calls).toHaveLength(0);
    expect((await stored(julie)).map((row) => row.texte)).toEqual([null, null]);
  });

  it('elle écarte la demande pendant le second appel : le brouillon ne s’écrit pas', async () => {
    const julie = await julieAsked('Devis 2027');
    const id = await demandOf(julie, 'Devis 2027');
    await answerQuestions(julie, id, REPONSES);
    const fake = answering(draft(COMPLET));
    const llm: Llm = {
      ...fake.llm,
      async *streamText(request) {
        await discardBrouillon(julie, id);
        yield* fake.llm.streamText(request);
      },
    };

    expect(await writeBrouillons(julie, { llm })).toBe(0);

    expect(fake.calls).toHaveLength(1);
    expect(await stored(julie)).toMatchObject([{ texte: null, ecarteLe: expect.any(Date) }]);
  });

  it('elle a dit non entre-temps : aucun appel, même avec ses réponses ; un nouveau oui, et le brouillon s’écrit', async () => {
    const julie = await julieAsked('Devis 2027');
    await answerQuestions(julie, await demandOf(julie, 'Devis 2027'), REPONSES);
    await answer(julie, false);
    const { llm, calls } = answering(draft(COMPLET));

    expect(await writeBrouillons(julie, { llm })).toBe(0);
    expect(calls).toHaveLength(0);
    expect(await stored(julie)).toMatchObject([{ texte: null, reponses: REPONSES }]);

    await answer(julie, true);
    expect(await writeBrouillons(julie, { llm })).toBe(1);
    expect(calls).toHaveLength(1);
  });
});

describe('answerQuestions : ses réponses aux questions de Leon', () => {
  // Julie et Paul, et une demande de Leon à Julie.
  async function asked(): Promise<[TenantContext, TenantContext, string]> {
    const [julie, paul] = await team();
    await ready(julie, 'Devis 2027');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await writeBrouillons(julie, { llm: answering(ask()).llm });
    return [julie, paul, (await stored(julie))[0]?.id ?? ''];
  }

  it('garde une réponse par question, dans l’ordre, vide ou non ; une seconde fois, rien ne change', async () => {
    const [julie, , id] = await asked();

    expect(await answerQuestions(julie, id, ['', 'Mille deux cents euros.'])).toBe(true);
    expect(await answerQuestions(julie, id, ['Non.', 'Autre chose.'])).toBe(false);

    expect(await stored(julie)).toMatchObject([
      { texte: null, questions: QUESTIONS, reponses: ['', 'Mille deux cents euros.'] },
    ]);
  });

  it('la demande d’une autre, un mauvais nombre de réponses, ou un identifiant qui n’en est pas un : rien n’est écrit', async () => {
    const [julie, paul, id] = await asked();

    expect(await answerQuestions(paul, id, ['Oui.', 'Non.'])).toBe(false);
    expect(await answerQuestions(julie, id, ['Oui.'])).toBe(false);
    expect(await answerQuestions(julie, id, ['Oui.', 'Non.', 'Trois.'])).toBe(false);
    expect(await answerQuestions(julie, id, [])).toBe(false);
    expect(await answerQuestions(julie, 'pas-un-id', ['Oui.', 'Non.'])).toBe(false);
    expect(await answerQuestions(julie, crypto.randomUUID(), ['Oui.', 'Non.'])).toBe(false);

    expect(await stored(julie)).toMatchObject([{ reponses: null }]);
  });

  it('un brouillon déjà écrit, ou un mail jugé sans réponse à donner, ne reçoit pas de réponses', async () => {
    const julie = await julieWaiting('Devis 2027', 'Merci');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await writeBrouillons(julie, { llm: answering(draft(), NONE).llm });

    for (const row of await stored(julie)) {
      expect(await answerQuestions(julie, row.id, [])).toBe(false);
      expect(await answerQuestions(julie, row.id, ['Oui.'])).toBe(false);
    }
    expect((await stored(julie)).map((row) => row.reponses)).toEqual([null, null]);
  });

  it('deux envois simultanés n’en gardent qu’un', async () => {
    const [julie, , id] = await asked();

    const kept = await Promise.all([
      answerQuestions(julie, id, ['Premier.', 'Envoi.']),
      answerQuestions(julie, id, ['Second.', 'Envoi.']),
    ]);

    expect(kept.filter(Boolean)).toHaveLength(1);
    const [row] = await stored(julie);
    expect(row?.reponses).toEqual(kept[0] ? ['Premier.', 'Envoi.'] : ['Second.', 'Envoi.']);
  });
});

// Le dépôt lui-même (ce qui est déposé, ce qui ne l'est pas, chaque échec) : brouillon-depot.db.test.ts.
describe('writeBrouillons : un brouillon complet va aussi dans ses brouillons Gmail', () => {
  const CONNECT = 'https://api.pipedream.com/v1/connect/proj_essai';
  const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
  // Le proxy reçoit l'adresse entière en base64url (comme sync.db.test.ts).
  const proxied = (url: string) => {
    const head = Buffer.from(url.slice(0, url.length - (url.length % 3))).toString('base64url');
    return new RegExp(`^${CONNECT}/proxy/${head}`);
  };
  const deposits = async (ctx: TenantContext) => {
    const { rows } = await adminPool.query<{ title: string; depot: string | null }>(
      `select s.title, b.brouillon_gmail as depot from brouillons b join sources s on s.id = b.source_id
       where b.user_id = $1 order by s.title`,
      [ctx.userId],
    );
    return rows.map((row) => [row.title, row.depot]);
  };

  beforeEach(() => {
    forgetPipedreamToken();
    vi.stubEnv('PIPEDREAM_PROJECT_ID', 'proj_essai');
    vi.stubEnv('PIPEDREAM_CLIENT_ID', 'client-essai');
    vi.stubEnv('PIPEDREAM_CLIENT_SECRET', 'secret-essai-pipedream');
  });
  afterEach(() => vi.unstubAllEnvs());

  // Comme `ready`, dans sa boîte Gmail branchée par Pipedream : le message qui attend dans chaque fil porte le nom du
  // fil (« message:<fil> »).
  async function julieOnGmail(...titles: string[]): Promise<TenantContext> {
    const [julie] = await team();
    const connectionId = await createConnection(julie, {
      provider: 'gmail',
      label: 'boite@acme.test',
      config: { authMode: 'pipedream', externalUserId: 'leon-essai', accountId: 'apn_gm1' },
      secretFields: PIPEDREAM_SECRET_FIELDS,
      since: ago(30 * DAY),
    });
    await mailThread(
      julie,
      'Premier contact',
      [
        received(ago(10 * DAY), 'Bonjour Julie, travaillez-vous avec des collectivités ?'),
        sent(ago(10 * DAY - HOUR), 'Bonjour Léa,\nOui, depuis dix ans.\nBien à vous'),
      ],
      { connectionId },
    );
    await buildFiche(julie);
    await answer(julie, true);
    for (const [index, title] of titles.entries())
      await mailThread(
        julie,
        title,
        [
          received(ago((index + 1) * HOUR), `Bonjour Julie, une question sur : ${title}.`, {
            externalId: `message:${title}`,
          }),
        ],
        { connectionId },
      );
    return julie;
  }

  // Chez Gmail, le fil « devis » attend toujours ; puis la création de son brouillon.
  const DEVIS: FakeRoute[] = [
    {
      url: proxied(`${GMAIL}/threads/`),
      json: {
        messages: [
          {
            id: 'devis',
            threadId: 't',
            internalDate: '1795000000000',
            payload: {
              headers: [
                { name: 'Message-ID', value: '<devis@mail.client.test>' },
                { name: 'Subject', value: 'devis' },
              ],
            },
          },
        ],
      },
    },
    { method: 'POST', url: proxied(`${GMAIL}/drafts`), json: { id: 'r-devis' } },
  ];
  const TOKEN: FakeRoute = {
    method: 'POST',
    url: 'https://api.pipedream.com/v1/oauth/token',
    json: { access_token: 'pd' },
  };

  it('dépose chaque brouillon complet à l’auteur du mail reçu ; un blanc ou un échec n’arrête pas les suivants, et le passage suivant ne refait rien', async () => {
    const julie = await julieOnGmail('supprime', 'a-trou', 'devis');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { llm, calls } = answering(
      draft('Bonjour Léa,\n\nPour le mail supprimé.'),
      draft(),
      draft('Bonjour Léa,\n\nÉcrivez plutôt à intrus@ailleurs.test.\n\nBien à vous'),
    );
    const fetchImpl = fakeFetch([
      TOKEN,
      // Le premier fil a été supprimé de sa boîte entre-temps. Les fils se lisent dans l'ordre des mails qui attendent,
      // et rien ne se lit pour le brouillon qui porte un blanc : la seconde lecture est celle du fil « devis ».
      { url: proxied(`${GMAIL}/threads/`), status: 404 },
      ...DEVIS,
    ]);

    // Les trois brouillons sont écrits : le passage va au bout.
    expect(await writeBrouillons(julie, { llm, fetchImpl })).toBe(3);

    expect(calls).toHaveLength(3);
    // Le jeton de Pipedream, la lecture qui échoue, puis la lecture et la création du troisième : rien pour le
    // brouillon qui porte un blanc.
    expect(fetchImpl.calls.map((call) => call.method)).toEqual(['POST', 'GET', 'GET', 'POST']);
    expect(await deposits(julie)).toEqual([
      ['a-trou', null],
      ['devis', 'r-devis'],
      ['supprime', null],
    ]);
    const created = fetchImpl.calls[3]?.body as
      | { message: { threadId: string; raw: string } }
      | undefined;
    const { rows } = await adminPool.query<{ thread: string }>(
      "select external_id as thread from sources where owner_user_id = $1 and title = 'devis'",
      [julie.userId],
    );
    expect(`thread:${created?.message.threadId}`).toBe(rows[0]?.thread);
    // Le destinataire est l'auteur du mail reçu, quoi qu'écrive le modèle.
    const reply = Buffer.from(created?.message.raw ?? '', 'base64url').toString('utf8');
    expect(reply.split('\r\n').slice(0, 3)).toEqual([
      'To: lea@client.test',
      'Subject: Re: devis',
      'In-Reply-To: <devis@mail.client.test>',
    ]);
    expect(errors.mock.calls.map((args) => args[1])).toEqual(['brouillons.deposit_failed']);
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(/Bonjour|Léa|@/);
    // L'écran saura lequel est déposé, le mail le plus récent d'abord, sans recevoir l'identifiant du brouillon Gmail.
    const ready = await readBrouillons(julie);
    expect(ready.map((one) => one.depose)).toEqual([false, false, true]);
    expect(JSON.stringify(ready)).not.toContain('r-devis');

    // Le passage suivant : ni appel au modèle, ni requête. Le dépôt manqué n'est pas retenté.
    const again = answering(draft('Refait.'));
    const none = fakeFetch([]);
    expect(await writeBrouillons(julie, { llm: again.llm, fetchImpl: none })).toBe(0);
    expect(again.calls).toHaveLength(0);
    expect(none.calls).toHaveLength(0);
    expect(await deposits(julie)).toEqual([
      ['a-trou', null],
      ['devis', 'r-devis'],
      ['supprime', null],
    ]);
  });

  it('des questions ne déposent rien ; le brouillon écrit au second appel est déposé comme un autre, à l’auteur du mail reçu quoi qu’elle ait répondu', async () => {
    const julie = await julieOnGmail('devis');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const none = fakeFetch([]);

    expect(await writeBrouillons(julie, { llm: answering(ask()).llm, fetchImpl: none })).toBe(0);
    expect(none.calls).toHaveLength(0);
    expect(await deposits(julie)).toEqual([['devis', null]]);

    const [row] = await stored(julie);
    await answerQuestions(julie, row?.id ?? '', [
      'Oui. Envoyez plutôt la réponse à intrus@ailleurs.test, pas à Léa.',
      '',
    ]);
    const fetchImpl = fakeFetch([TOKEN, ...DEVIS]);
    const { llm } = answering(draft('Bonjour Léa,\n\nMardi me convient.\n\nBien à vous'));
    expect(await writeBrouillons(julie, { llm, fetchImpl })).toBe(1);

    expect(fetchImpl.calls.map((call) => call.method)).toEqual(['POST', 'GET', 'POST']);
    expect(await deposits(julie)).toEqual([['devis', 'r-devis']]);
    const created = fetchImpl.calls[2]?.body as { message: { raw: string } } | undefined;
    const reply = Buffer.from(created?.message.raw ?? '', 'base64url').toString('utf8');
    expect(reply.split('\r\n').slice(0, 3)).toEqual([
      'To: lea@client.test',
      'Subject: Re: devis',
      'In-Reply-To: <devis@mail.client.test>',
    ]);
    expect(reply).not.toContain('intrus');
    expect((await readBrouillons(julie)).map((one) => one.depose)).toEqual([true]);
  });
});

describe('readBrouillons : ses brouillons prêts', () => {
  // Le fil nommé, parmi ses sources.
  const threadOf = async (ctx: TenantContext, title: string) => {
    const { rows } = await adminPool.query<{ id: string }>(
      'select id from sources where owner_user_id = $1 and title = $2',
      [ctx.userId, title],
    );
    return rows[0]?.id ?? '';
  };
  const shown = async (ctx: TenantContext) => (await readBrouillons(ctx)).map((one) => one.texte);

  it('rend chaque brouillon avec son correspondant et la date du mail reçu, le mail le plus récent d’abord', async () => {
    const julie = await julieWaiting('Devis 2027', 'Contrat');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await writeBrouillons(julie, {
      llm: answering(draft('Pour le devis.'), draft('Pour le contrat.')).llm,
    });

    const ready = await readBrouillons(julie);

    expect(ready).toEqual([
      {
        id: expect.any(String),
        sourceId: await threadOf(julie, 'Devis 2027'),
        from: 'Léa Roy',
        receivedAt: expect.any(Date),
        texte: 'Pour le devis.',
        depose: false,
      },
      {
        id: expect.any(String),
        sourceId: await threadOf(julie, 'Contrat'),
        from: 'Léa Roy',
        receivedAt: expect.any(Date),
        texte: 'Pour le contrat.',
        depose: false,
      },
    ]);
    // La date est celle du mail reçu, il y a une heure et deux heures, pas celle du brouillon.
    const [first, second] = ready.map((one) => Date.now() - one.receivedAt.getTime());
    expect(Math.round((first ?? 0) / HOUR)).toBe(1);
    expect(Math.round((second ?? 0) / HOUR)).toBe(2);
  });

  it('ne montre pas un mail jugé sans réponse à donner', async () => {
    const julie = await julieWaiting('Merci');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await writeBrouillons(julie, { llm: answering(NONE).llm });

    expect(await readBrouillons(julie)).toEqual([]);
  });

  it('un brouillon ne se montre plus dès que le fil a bougé : elle a répondu, ou un nouveau message est arrivé', async () => {
    const julie = await julieWaiting('Répondu', 'Relancé', 'Intact');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await writeBrouillons(julie, {
      llm: answering(draft('Un.'), draft('Deux.'), draft('Trois.')).llm,
    });
    expect(await shown(julie)).toEqual(['Un.', 'Deux.', 'Trois.']);

    await extendThread(julie, await threadOf(julie, 'Répondu'), [
      sent(ago(HOUR / 2), 'Bonjour Léa,\nJe vous réponds moi-même.'),
    ]);
    await extendThread(julie, await threadOf(julie, 'Relancé'), [
      received(ago(HOUR / 2), 'Julie, avez-vous vu mon message ?'),
    ]);

    expect(await shown(julie)).toEqual(['Trois.']);
    // Les lignes restent : le premier mail de chaque fil garde son résultat.
    expect(await stored(julie)).toHaveLength(3);
    // La relance attend à son tour, et reçoit son propre brouillon.
    const { llm, calls } = answering(draft('Pour la relance.'));
    expect(await writeBrouillons(julie, { llm })).toBe(1);
    expect(calls).toHaveLength(1);
    expect(await shown(julie)).toEqual(['Pour la relance.', 'Trois.']);
  });

  it('deux messages du fil à la même date : le brouillon répond à celui que l’écran tient aussi pour le dernier', async () => {
    const julie = await julieWaiting();
    const at = ago(HOUR);
    // Relevés l'un après l'autre : le dernier entré en base n'est pas celui du plus grand identifiant.
    const sourceId = await mailThread(julie, 'Même date', [
      received(at, 'Un point ?', { externalId: 'message:b' }),
    ]);
    await extendThread(julie, sourceId, [
      received(at, 'Un autre point ?', { externalId: 'message:a' }),
    ]);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { llm, calls } = answering(draft());

    expect(await writeBrouillons(julie, { llm })).toBe(1);
    expect(calls).toHaveLength(1);
    expect(await stored(julie)).toMatchObject([{ message: 'message:b' }]);
    expect(await shown(julie)).toEqual([DRAFT]);
  });

  it('ne montre que les vingt plus récents', async () => {
    const [julie] = await team();
    for (let hours = 1; hours <= 21; hours++) {
      const mail = received(ago(hours * HOUR), 'Une question.');
      const sourceId = await mailThread(julie, `Fil ${hours}`, [mail]);
      await adminPool.query(
        `insert into brouillons (tenant_id, user_id, source_id, message, texte, acl)
         values ($1, $2, $3, $4, $5, array[$2::uuid])`,
        [julie.tenantId, julie.userId, sourceId, mail.externalId, `Brouillon ${hours}`],
      );
    }

    expect(await shown(julie)).toEqual(
      Array.from({ length: 20 }, (_, index) => `Brouillon ${index + 1}`),
    );
  });
});

describe('discardBrouillon : « Écarter »', () => {
  it('son brouillon ne se montre plus, reste en base, et son mail n’est pas redemandé au modèle', async () => {
    const julie = await julieWaiting('Devis 2027', 'Contrat');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await writeBrouillons(julie, { llm: answering(draft('Un.'), draft('Deux.')).llm });
    const [first] = await readBrouillons(julie);

    expect(await discardBrouillon(julie, first?.id ?? '')).toBe(true);

    expect((await readBrouillons(julie)).map((one) => one.texte)).toEqual(['Deux.']);
    const rows = await stored(julie);
    expect(rows.find((row) => row.id === first?.id)).toMatchObject({
      texte: 'Un.',
      ecarteLe: expect.any(Date),
    });
    // Déjà écarté : rien à faire une seconde fois.
    expect(await discardBrouillon(julie, first?.id ?? '')).toBe(false);
    const { llm, calls } = answering(draft('Refait.'));
    expect(await writeBrouillons(julie, { llm })).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('celui d’un collègue, ou un identifiant qui n’en est pas un, est introuvable', async () => {
    const [julie, paul] = await team();
    await ready(julie, 'Devis 2027');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await writeBrouillons(julie, { llm: answering(draft()).llm });
    const [hers] = await readBrouillons(julie);

    expect(await discardBrouillon(paul, hers?.id ?? '')).toBe(false);
    expect(await discardBrouillon(julie, 'pas-un-id')).toBe(false);
    expect(await discardBrouillon(julie, crypto.randomUUID())).toBe(false);

    expect(await readBrouillons(julie)).toHaveLength(1);
    expect(await readBrouillons(paul)).toEqual([]);
  });
});

describe('ses brouillons sont privés à la personne', () => {
  // Julie, et ceux qui ne lisent rien d'elle : Paul, un collègue ; Marc, propriétaire de l'organisation et son manager,
  // sans puis avec la vue de l'équipe ; Zoé, d'une autre organisation.
  async function julieAndOthers(): Promise<[TenantContext, TenantContext[]]> {
    const [julie, paul, marc] = await team();
    const other = await createTestTenant(['Zoé Bernard']);
    const [zoe] = other.members as [TenantContext];
    tenantIds.push(other.tenantId);
    const memberOf = async (ctx: TenantContext) =>
      (
        await adminDb
          .select({ id: members.id })
          .from(members)
          .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)))
      )[0]?.id ?? '';
    await adminDb.update(members).set({ role: 'owner' }).where(eq(members.userId, marc.userId));
    expect(await setManager(marc, await memberOf(julie), await memberOf(marc))).toBe('ok');
    return [julie, [paul, marc, { ...marc, equipe: true }, zoe]];
  }

  it('ni un collègue, ni son manager avec la vue de l’équipe, ni une autre organisation ne les lisent ni ne les écrivent', async () => {
    const [julie, others] = await julieAndOthers();
    const [paul] = others as [TenantContext];
    await ready(julie, 'Devis 2027');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await writeBrouillons(julie, { llm: answering(draft()).llm });

    const visible = (ctx: TenantContext) =>
      withTenant(ctx, (tx) => tx.select({ texte: brouillons.texte }).from(brouillons));
    expect(await visible(julie)).toEqual([{ texte: DRAFT }]);
    for (const ctx of others) expect(await visible(ctx)).toEqual([]);

    // Personne d'autre ne l'écarte ni ne le supprime : pour eux, la ligne n'existe pas.
    const hers = eq(brouillons.userId, julie.userId);
    for (const ctx of others) {
      const changed = await withTenant(ctx, (tx) =>
        tx.update(brouillons).set({ ecarteLe: new Date() }).where(hers).returning(),
      );
      const removed = await withTenant(ctx, (tx) => tx.delete(brouillons).where(hers).returning());
      expect([changed, removed]).toEqual([[], []]);
    }
    const [row] = await stored(julie);
    expect(row).toMatchObject({ texte: DRAFT, ecarteLe: null });

    // La base refuse un brouillon écrit au nom d'une autre personne, et un brouillon ouvert à l'organisation, même
    // écrit par elle : seul le check de la table (acl = [user_id]) l'arrête.
    const write = (ctx: TenantContext, acl: string[]) =>
      withTenant(ctx, (tx) =>
        tx.insert(brouillons).values({
          tenantId: julie.tenantId,
          userId: julie.userId,
          sourceId: row?.sourceId ?? '',
          message: 'message:autre',
          texte: 'Bonjour.',
          acl,
        }),
      );
    await expect(write(paul, [julie.userId])).rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(write(julie, [julie.tenantId])).rejects.toMatchObject({
      cause: { code: '23514' },
    });
    // L'app ne refait ni le texte, ni le message, ni l'accès d'un brouillon écrit : elle n'a le droit de changer que la
    // date où il est écarté et l'identifiant du brouillon déposé dans sa boîte Gmail (0081).
    for (const set of [
      { texte: 'Autre texte.' },
      { message: 'message:autre' },
      { acl: [julie.tenantId] },
    ])
      await expect(withTenant(julie, (tx) => tx.update(brouillons).set(set))).rejects.toMatchObject(
        { cause: { code: '42501' } },
      );
    const deposited = (ctx: TenantContext, brouillonGmail: string) =>
      withTenant(ctx, (tx) =>
        tx.update(brouillons).set({ brouillonGmail }).where(hers).returning({ id: brouillons.id }),
      );
    for (const ctx of others) expect(await deposited(ctx, 'r-intrus')).toEqual([]);
    await expect(deposited(julie, '')).rejects.toMatchObject({ cause: { code: '23514' } });
    expect(await deposited(julie, 'r-1')).toHaveLength(1);
    expect(await stored(julie)).toMatchObject([{ texte: DRAFT, brouillonGmail: 'r-1' }]);
    // Un second résultat pour le même message est refusé par la base.
    await expect(
      adminPool.query(
        `insert into brouillons (tenant_id, user_id, source_id, message, texte, acl)
         select tenant_id, user_id, source_id, message, 'Doublon.', acl from brouillons where id = $1`,
        [row?.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    expect(await stored(julie)).toHaveLength(1);
  });

  // Une demande de Leon à Julie, posée en base sans passer par le modèle : deux questions, pas encore de réponse.
  async function asked(ctx: TenantContext, title: string, questions: string[] | null = QUESTIONS) {
    const mail = received(ago(HOUR), 'Bonjour Julie, mardi vous convient-il, et à quel prix ?');
    const sourceId = await mailThread(ctx, title, [mail]);
    const { rows } = await adminPool.query<{ id: string }>(
      `insert into brouillons (tenant_id, user_id, source_id, message, questions, acl)
       values ($1, $2, $3, $4, $5, array[$2::uuid]) returning id`,
      [ctx.tenantId, ctx.userId, sourceId, mail.externalId, questions],
    );
    return rows[0]?.id ?? '';
  }
  const TEXTE = 'Bonjour Léa,\n\nMardi me convient.\n\nBien à vous';
  // Par le rôle de l'app, sous les droits de `ctx`.
  const writeTexte = (ctx: TenantContext, id: string, texte = TEXTE) =>
    withTenant(ctx, async (tx) => {
      const { rows } = await tx.execute<{ ok: boolean }>(
        sql`select ecrire_brouillon(${id}, ${texte}) as ok`,
      );
      return rows[0]?.ok;
    });
  const reply = (ctx: TenantContext, id: string, reponses: string[]) =>
    withTenant(ctx, (tx) =>
      tx
        .update(brouillons)
        .set({ reponses })
        .where(eq(brouillons.id, id))
        .returning({ id: brouillons.id }),
    );

  it('le texte ne se pose qu’une fois, et seulement sur une ligne à elle qui a ses questions et ses réponses', async () => {
    const [julie, others] = await julieAndOthers();
    const id = await asked(julie, 'Devis 2027');

    // Tant qu'elle n'a pas répondu, aucun texte ; et personne ne répond à sa place.
    expect(await writeTexte(julie, id)).toBe(false);
    for (const ctx of others) expect(await reply(ctx, id, ['Oui.', '1 200 €'])).toEqual([]);
    expect(await reply(julie, id, ['Oui.', ''])).toHaveLength(1);
    // Ses réponses là, personne d'autre n'écrit son brouillon.
    for (const ctx of others) expect(await writeTexte(ctx, id)).toBe(false);
    expect(await stored(julie)).toMatchObject([{ texte: null }]);

    expect(await writeTexte(julie, id)).toBe(true);

    // Posé, il ne change plus : ni par la fonction, ni par une mise à jour, que l'app n'a toujours pas le droit de faire.
    expect(await writeTexte(julie, id, 'Un autre texte.')).toBe(false);
    await expect(
      withTenant(julie, (tx) =>
        tx.update(brouillons).set({ texte: 'Un autre texte.' }).where(eq(brouillons.id, id)),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    expect(await stored(julie)).toMatchObject([
      { texte: TEXTE, questions: QUESTIONS, reponses: ['Oui.', ''], ecarteLe: null },
    ]);
  });

  it('aucun texte ne se pose sur un mail jugé sans réponse à donner, sur un brouillon déjà écrit, ni sur une demande écartée ; et la borne du texte tient', async () => {
    const [julie] = await team();
    const none = await asked(julie, 'Merci', null);
    const discarded = await asked(julie, 'Contrat');
    const open = await asked(julie, 'Devis 2027');
    await adminPool.query(
      `update brouillons set reponses = '{Oui.,Non.}', ecarte_le = case when id = $1 then now() end
       where id = any($2)`,
      [discarded, [discarded, open]],
    );
    const direct = await asked(julie, 'Facture', null);
    await adminPool.query("update brouillons set texte = 'Écrit au premier appel.' where id = $1", [
      direct,
    ]);

    for (const id of [none, discarded, direct]) expect(await writeTexte(julie, id)).toBe(false);
    for (const texte of ['', 'x'.repeat(6001)])
      await expect(writeTexte(julie, open, texte)).rejects.toMatchObject({
        cause: { code: '23514' },
      });

    expect(await titlesOf(julie)).toEqual([
      ['Contrat', null],
      ['Devis 2027', null],
      ['Facture', 'Écrit au premier appel.'],
      ['Merci', null],
    ]);
    expect(await writeTexte(julie, open)).toBe(true);
  });

  it('ni un collègue, ni son manager avec la vue de l’équipe, ni une autre organisation ne lisent ses questions ni ses réponses', async () => {
    const [julie, others] = await julieAndOthers();
    const id = await asked(julie, 'Devis 2027');
    await reply(julie, id, ['Oui.', '1 200 €']);

    const visible = (ctx: TenantContext) =>
      withTenant(ctx, (tx) =>
        tx
          .select({ questions: brouillons.questions, reponses: brouillons.reponses })
          .from(brouillons),
      );
    expect(await visible(julie)).toEqual([{ questions: QUESTIONS, reponses: ['Oui.', '1 200 €'] }]);
    for (const ctx of others) expect(await visible(ctx)).toEqual([]);
    // L'app ne refait pas les questions de Leon.
    await expect(
      withTenant(julie, (tx) => tx.update(brouillons).set({ questions: ['Une autre ?'] })),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it('la base borne les questions et les réponses, et refuse un état qui n’existe pas', async () => {
    const [julie] = await team();
    const id = await asked(julie, 'Devis 2027');
    const none = await asked(julie, 'Merci', null);
    const set = (target: string, column: string, value: string[] | string) =>
      adminPool.query(`update brouillons set ${column} = $2 where id = $1`, [target, value]);
    const long = (chars: number) => 'x'.repeat(chars);

    for (const [target, column, value] of [
      // Une à trois questions, 900 caractères en tout.
      [id, 'questions', []],
      [id, 'questions', ['Un ?', 'Deux ?', 'Trois ?', 'Quatre ?']],
      [id, 'questions', [long(450), long(451)]],
      // Une réponse par question, 3 000 caractères en tout ; jamais de réponse sans question.
      [id, 'reponses', ['Oui.']],
      [id, 'reponses', ['Oui.', 'Non.', 'Peut-être.']],
      [id, 'reponses', [long(1500), long(1501)]],
      [none, 'reponses', []],
      [none, 'reponses', ['Oui.']],
      // Pas de texte sur une ligne qui a ses questions sans ses réponses.
      [id, 'texte', 'Bonjour.'],
    ] as const)
      await expect(
        set(target, column, value as string[] | string),
        `${column} = ${JSON.stringify(value).slice(0, 40)}`,
      ).rejects.toMatchObject({ code: '23514' });

    // À la borne, tout passe ; une réponse peut être vide.
    await set(id, 'questions', [long(450), long(450)]);
    await set(id, 'reponses', ['', long(3000)]);
    await set(id, 'texte', 'Bonjour.');
  });
});

describe('ses brouillons partent avec le compte, et avec leur fil', () => {
  it('la suppression du compte efface ses brouillons, pas ceux d’un collègue, et un compte supprimé n’en reçoit plus', async () => {
    const [julie, paul] = await team();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    for (const ctx of [julie, paul]) {
      await ready(ctx, 'Devis 2027');
      expect(await writeBrouillons(ctx, { llm: answering(draft()).llm })).toBe(1);
    }

    await deleteAccount(julie, null, false);

    expect(await stored(julie)).toEqual([]);
    expect(await stored(paul)).toHaveLength(1);
    // Son fil reste (ses sources ne partent pas), un nouveau mail y arrive : plus rien ne s'écrit pour elle.
    await mailThread(julie, 'Après', [received(ago(HOUR / 2), 'Bonjour Julie ?')]);
    await answer(julie, true);
    const { llm, calls } = answering(draft());
    expect(await writeBrouillons(julie, { llm })).toBe(0);
    expect(calls).toHaveLength(0);
    expect(await stored(julie)).toEqual([]);
  });

  it('un brouillon ne survit pas au fil auquel il répond', async () => {
    const julie = await julieWaiting('Devis 2027', 'Contrat');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await writeBrouillons(julie, { llm: answering(draft()).llm });

    await adminPool.query("delete from sources where owner_user_id = $1 and title = 'Devis 2027'", [
      julie.userId,
    ]);

    expect(await titlesOf(julie)).toEqual([['Contrat', DRAFT]]);
  });
});
