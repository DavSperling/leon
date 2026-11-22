import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { deleteAccount } from '@/server/auth/delete-account';
import { setManager } from '@/server/auth/organisation';
import type { TenantContext } from '@/server/auth/tenant-context';
import { members, users } from '@/server/db/schema/auth';
import { brouillons, reponsesAgent } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { type Llm, LlmError } from '@/server/llm/llm';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { extendThread, mailThread, received, sent } from '@/test/mail-threads';
import {
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
      },
      {
        id: expect.any(String),
        sourceId: await threadOf(julie, 'Contrat'),
        from: 'Léa Roy',
        receivedAt: expect.any(Date),
        texte: 'Pour le contrat.',
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
  it('ni un collègue, ni son manager avec la vue de l’équipe, ni une autre organisation ne les lisent ni ne les écrivent', async () => {
    const [julie, paul, marc] = await team();
    const other = await createTestTenant(['Zoé Bernard']);
    const [zoe] = other.members as [TenantContext];
    tenantIds.push(other.tenantId);
    await ready(julie, 'Devis 2027');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await writeBrouillons(julie, { llm: answering(draft()).llm });
    // Marc, propriétaire de l'organisation, est le manager de Julie.
    const memberOf = async (ctx: TenantContext) =>
      (
        await adminDb
          .select({ id: members.id })
          .from(members)
          .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)))
      )[0]?.id ?? '';
    await adminDb.update(members).set({ role: 'owner' }).where(eq(members.userId, marc.userId));
    expect(await setManager(marc, await memberOf(julie), await memberOf(marc))).toBe('ok');
    const others = [paul, marc, { ...marc, equipe: true }, zoe];

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
    // L'app ne refait ni le texte ni l'accès d'un brouillon écrit : elle n'a le droit de changer que la date où il
    // est écarté.
    for (const set of [{ texte: 'Autre texte.' }, { acl: [julie.tenantId] }])
      await expect(withTenant(julie, (tx) => tx.update(brouillons).set(set))).rejects.toMatchObject(
        { cause: { code: '42501' } },
      );
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
