import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { HIGHLIGHT_END, HIGHLIGHT_START, splitHighlights } from '@/lib/highlight';
import type { TenantContext } from '@/server/auth/tenant-context';
import { EMBEDDING_DIMS, type Embedder, EmbedderError } from '@/server/embeddings/embedder';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { dropTeams, emailOf, newTeam, seedIndexed } from '@/test/seed-indexed';
import { listActivity } from './activity';
import { EMBED_QUERY_TIMEOUT_MS, searchPassages } from './search';
import type { SearchFilters, SearchPage } from './types';

// La recherche sous les droits du lecteur : sécurité par ligne, plein texte, titres, vecteurs, fusion, filtres.
// Chaque test prend sa propre organisation : la base de test est partagée, et un autre test ne doit pas pouvoir
// se glisser dans ses résultats. Les mots cherchés sont des mots inventés, que rien d'autre ne contient.

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));
afterEach(() => vi.restoreAllMocks());

const factice = createFakeEmbedder();
const NOW = new Date('2026-10-19T10:00:00Z');
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

function search(
  ctx: TenantContext,
  query: string,
  extra: { filters?: SearchFilters; page?: number; embedder?: Embedder | null } = {},
): Promise<SearchPage> {
  return searchPassages(ctx, { query, now: NOW, ...extra });
}

const titles = (page: SearchPage) => page.hits.map((hit) => hit.title);

async function team() {
  const { tenantId, members } = await newTeam(['Alice', 'Bob'], tenantIds);
  const [alice, bob] = members as [TenantContext, TenantContext];
  return { tenantId, alice, bob };
}

describe.each([
  ['plein texte', null],
  ['hybride', factice],
])('droits du lecteur (%s)', (_, embedder) => {
  it('ne rend jamais la conversation privée d’un autre, même par ses mots exacts', async () => {
    const { tenantId, alice, bob } = await team();
    const other = await newTeam(['Zoé'], tenantIds);
    await seedIndexed(alice, {
      kind: 'claude_code',
      title: 'Ma conversation',
      turns: [{ text: 'le code secret ouistitigris reste entre nous' }],
    });
    await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      title: 'Ticket 12',
      turns: [{ text: 'le ticket parle de ouistitigris aussi' }],
    });
    await seedIndexed(other.members[0] as TenantContext, {
      kind: 'github',
      acl: [other.tenantId],
      title: 'Ticket d’une autre équipe',
      turns: [{ text: 'ouistitigris chez les voisins' }],
    });

    const forAlice = await search(alice, 'ouistitigris', { embedder });
    expect(titles(forAlice).toSorted()).toEqual(['Ma conversation', 'Ticket 12']);

    const forBob = await search(bob, 'ouistitigris', { embedder });
    expect(titles(forBob)).toEqual(['Ticket 12']);
    const exact = await search(bob, 'le code secret ouistitigris reste entre nous', { embedder });
    expect(titles(exact)).not.toContain('Ma conversation');
    // Les passages d'une source visible ne montrent que ce que Bob peut lire.
    for (const hit of [...forBob.hits, ...exact.hits]) {
      for (const passage of hit.passages) expect(passage.snippet).not.toContain('secret');
    }
  });
});

describe('plein texte', () => {
  it('trouve « contrat » par « contrats » (racinisation française)', async () => {
    const { alice } = await team();
    await seedIndexed(alice, { turns: [{ text: 'Le contrat zorglubien expire demain matin.' }] });
    const page = await search(alice, 'contrats zorglubien');
    expect(page.hits).toHaveLength(1);
  });

  it('trouve un titre à une faute de frappe près (trigrammes)', async () => {
    const { alice } = await team();
    await seedIndexed(alice, {
      kind: 'fathom',
      title: 'Fathom · call ACME',
      metadata: { nature: 'reunion' },
      turns: [{ text: 'Compte rendu : le budget a été discuté en détail.' }],
    });
    await seedIndexed(alice, {
      title: 'Notes de cuisine',
      turns: [{ text: 'Recette de crêpes.' }],
    });
    for (const embedder of [null, factice]) {
      const page = await search(alice, 'Fathon ACME', { embedder });
      expect(titles(page)).toEqual(['Fathom · call ACME']);
      // Rien dans le texte ne répond : l'extrait est le début du premier passage, sans surlignage.
      const [passage] = page.hits[0]?.passages ?? [];
      expect(passage?.snippet).toContain('Compte rendu');
      expect(passage?.snippet).not.toContain(HIGHLIGHT_START);
    }
  });

  it('regroupe les passages d’une même source : trois au plus, les mieux classés d’abord', async () => {
    const { alice } = await team();
    // De plus en plus de fois le mot cherché : le premier tour est le plus pertinent.
    const turns = [5, 4, 3, 2, 1].map((count) => ({ text: 'quokkabudget '.repeat(count).trim() }));
    const seeded = await seedIndexed(alice, { title: 'Une seule source', turns });
    const page = await search(alice, 'quokkabudget');
    expect(page.hits).toHaveLength(1);
    expect(page.totalSources).toBe(1);
    const [hit] = page.hits;
    expect(hit?.passages.map((passage) => passage.turnId)).toEqual(seeded.turnIds.slice(0, 3));
  });

  it('classe d’abord la source la plus récente à pertinence égale', async () => {
    const { alice } = await team();
    for (const [title, age] of [
      ['Vieille note', 40],
      ['Note du jour', 1],
      ['Note du mois', 20],
    ] as const) {
      await seedIndexed(alice, {
        title,
        turns: [{ text: 'kiwiquantique', ts: daysAgo(age) }],
        lastTurnAt: daysAgo(age),
      });
    }
    const page = await search(alice, 'kiwiquantique');
    expect(titles(page)).toEqual(['Note du jour', 'Note du mois', 'Vieille note']);
  });

  it('fusionne les classements par rang réciproque, k = 60', async () => {
    const { tenantId, alice } = await team();
    await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      title: 'Ticket',
      turns: [{ text: 'scoremotunique', ts: NOW }],
      lastTurnAt: NOW,
    });
    // Premier du plein texte : 1 / (60 + 1). Premier aussi des vecteurs : le double.
    const [textOnly] = (await search(alice, 'scoremotunique')).hits;
    expect(textOnly?.score).toBeCloseTo(1 / 61, 9);
    const [both] = (await search(alice, 'scoremotunique', { embedder: factice })).hits;
    expect(both?.score).toBeCloseTo(2 / 61, 9);
  });

  it('applique le facteur de récence 0,7 + 0,3 × exp(−âge / 180) au score', async () => {
    const { alice } = await team();
    await seedIndexed(alice, {
      title: 'Récente',
      turns: [{ text: 'pangolinquartz', ts: NOW }],
      lastTurnAt: NOW,
    });
    await seedIndexed(alice, {
      title: 'Ancienne',
      turns: [{ text: 'pangolinquartz', ts: daysAgo(180) }],
      lastTurnAt: daysAgo(180),
    });
    const [recent, old] = (await search(alice, 'pangolinquartz')).hits;
    expect(recent?.title).toBe('Récente');
    expect((old?.score ?? 0) / (recent?.score ?? 1)).toBeCloseTo((0.7 + 0.3 * Math.exp(-1)) / 1, 6);
  });

  it('donne un bonus de 10 % à ce dont l’utilisateur est l’auteur, à pertinence et date égales', async () => {
    const { tenantId, alice, bob } = await team();
    const [aliceEmail, bobEmail] = [await emailOf(alice), await emailOf(bob)];
    for (const [title, authorEmail] of [
      ['De Bob', bobEmail],
      ['D’Alice', aliceEmail],
    ] as const) {
      await seedIndexed(alice, {
        kind: 'github',
        acl: [tenantId],
        title,
        turns: [{ text: 'lamantinzebre', ts: NOW, authorEmail }],
        lastTurnAt: NOW,
      });
    }
    const forAlice = (await search(alice, 'lamantinzebre')).hits;
    const forBob = (await search(bob, 'lamantinzebre')).hits;
    expect(forAlice[0]?.title).toBe('D’Alice');
    expect(forBob[0]?.title).toBe('De Bob');
    expect((forAlice[0]?.score ?? 0) / (forAlice[1]?.score ?? 1)).toBeCloseTo(1.1, 6);
    expect((forBob[0]?.score ?? 0) / (forBob[1]?.score ?? 1)).toBeCloseTo(1.1, 6);
  });

  it('range une conversation de l’utilisateur parmi ce dont il est l’auteur', async () => {
    const { tenantId, alice } = await team();
    for (const [title, kind, acl] of [
      ['Ticket d’équipe', 'github', [tenantId]],
      ['Ma conversation', 'claude_code', [alice.userId]],
    ] as const) {
      await seedIndexed(alice, {
        kind,
        acl: [...acl],
        title,
        turns: [{ text: 'ocelotmauve', ts: NOW }],
        lastTurnAt: NOW,
      });
    }
    expect(titles(await search(alice, 'ocelotmauve'))[0]).toBe('Ma conversation');
  });

  it('entoure les mots trouvés de marqueurs, et de rien d’autre', async () => {
    const { alice } = await team();
    await seedIndexed(alice, {
      turns: [{ text: 'Le contrat vermicelle a été renouvelé pour deux ans, sans hausse.' }],
    });
    const page = await search(alice, 'contrats vermicelle');
    const snippet = page.hits[0]?.passages[0]?.snippet ?? '';
    const marked = splitHighlights(snippet).filter((part) => part.hit);
    expect(marked.map((part) => part.text.toLowerCase())).toEqual(['contrat', 'vermicelle']);
    expect(snippet.split(HIGHLIGHT_START)).toHaveLength(3);
    expect(snippet.split(HIGHLIGHT_END)).toHaveLength(3);
    expect(snippet).not.toMatch(/<\/?mark>|<b>/);
  });
});

// Une question posée en phrase (T06b) : sans fournisseur de vecteurs, le plein texte seul doit la comprendre. Les
// mots outils sont retirés, puis, si la première passe (tous les mots) ne remplit pas la page, une passe élargie
// (un mot suffit) complète les résultats, sous les mêmes droits, après ceux de la première passe.
describe('questions en phrase', () => {
  const highlighted = (page: SearchPage, title: string) =>
    (page.hits.find((hit) => hit.title === title)?.passages ?? []).flatMap((passage) =>
      splitHighlights(passage.snippet)
        .filter((part) => part.hit)
        .map((part) => part.text.toLowerCase()),
    );

  it('« Quelles sont les sauvegardes quotidiennes ? » trouve le ticket qui les met en place', async () => {
    const { tenantId, alice } = await team();
    await seedIndexed(alice, {
      kind: 'linear',
      acl: [tenantId],
      title: 'LIN-42',
      metadata: { nature: 'ticket' },
      turns: [{ text: 'Mettre en place les sauvegardes quotidiennes de la base de production.' }],
    });
    await seedIndexed(alice, {
      kind: 'linear',
      acl: [tenantId],
      title: 'LIN-43',
      metadata: { nature: 'ticket' },
      turns: [{ text: 'Revoir la page de connexion.' }],
    });
    const page = await search(alice, 'Quelles sont les sauvegardes quotidiennes ?');
    expect(page.mode).toBe('plein-texte');
    expect(titles(page)).toEqual(['LIN-42']);
    // Trouvé par son texte, pas par son titre : les mots cherchés sont surlignés.
    expect(highlighted(page, 'LIN-42')).toEqual(['sauvegardes', 'quotidiennes']);
  });

  describe.each([
    ['plein texte', null],
    ['hybride', factice],
  ])('sous les droits du lecteur (%s)', (_, embedder) => {
    it('« Quelle remise vise le plan Zéphyr ? » trouve la conversation d’Alice pour elle seule', async () => {
      const { alice, bob } = await team();
      const other = await newTeam(['Zoé'], tenantIds);
      await seedIndexed(alice, {
        kind: 'claude_code',
        title: 'Conversation avec Claude',
        turns: [
          { text: 'On a parlé de la remise du plan Zéphyr : quinze pour cent la première année.' },
        ],
      });
      const question = 'Quelle remise vise le plan Zéphyr ?';
      expect(titles(await search(alice, question, { embedder }))).toEqual([
        'Conversation avec Claude',
      ]);
      // La passe élargie ne change pas les droits : ni Bob, de la même organisation, ni une autre organisation.
      expect((await search(bob, question, { embedder })).hits).toEqual([]);
      const zoe = other.members[0] as TenantContext;
      expect((await search(zoe, question, { embedder })).hits).toEqual([]);
    });
  });

  it('surligne dans l’extrait les mots trouvés par la passe élargie, même loin du début', async () => {
    const { alice } = await team();
    // Les mots trouvés arrivent après une cinquantaine d'autres : l'extrait (30 mots au plus par morceau) doit
    // se centrer sur eux, pas rendre le début du passage.
    await seedIndexed(alice, {
      title: 'Conversation avec Claude',
      turns: [
        {
          text:
            'On a d’abord passé en revue le calendrier, les recrutements, le budget de communication, ' +
            'les locaux, le séminaire de printemps, les congés d’été, la nouvelle charte graphique, ' +
            'le choix du prestataire informatique, la refonte du site, les tarifs des concurrents et ' +
            'le salon de novembre. Puis, en toute fin de réunion, on a parlé de la remise du plan ' +
            'Zéphyr : quinze pour cent la première année.',
        },
      ],
    });
    const page = await search(alice, 'Quelle remise vise le plan Zéphyr ?');
    const snippet = page.hits[0]?.passages[0]?.snippet ?? '';
    expect(highlighted(page, 'Conversation avec Claude')).toEqual(['remise', 'plan', 'zéphyr']);
    expect(snippet).toContain(`${HIGHLIGHT_START}remise${HIGHLIGHT_END}`);
    expect(snippet).not.toContain('calendrier');
  });

  it('classe d’abord la source qui contient tous les mots, même plus ancienne', async () => {
    const { tenantId, alice } = await team();
    await seedIndexed(alice, {
      kind: 'linear',
      acl: [tenantId],
      title: 'Tous les mots',
      turns: [{ text: 'La remise du plan Zéphyr est validée.', ts: daysAgo(170) }],
      lastTurnAt: daysAgo(170),
    });
    await seedIndexed(alice, {
      kind: 'linear',
      acl: [tenantId],
      title: 'Un seul mot',
      turns: [{ text: 'Le plan de la semaine est prêt.', ts: NOW }],
      lastTurnAt: NOW,
    });
    for (const embedder of [null, factice]) {
      // « remise plan Zéphyr » une fois les mots outils partis : la première source les contient tous.
      const page = await search(alice, 'Quelle est la remise du plan Zéphyr ?', { embedder });
      expect(titles(page)).toEqual(['Tous les mots', 'Un seul mot']);
    }
  });

  it('classe la passe élargie selon le nombre de mots couverts, pas leur répétition', async () => {
    const { tenantId, alice } = await team();
    for (const [title, text] of [
      ['Un mot répété', 'Remise, remise et encore remise : rien n’est décidé.'],
      ['Deux mots', 'La remise du plan tarifaire est validée.'],
      ['Trois mots', 'La remise du plan Zéphyr est validée.'],
    ] as const) {
      await seedIndexed(alice, {
        kind: 'linear',
        acl: [tenantId],
        title,
        turns: [{ text, ts: NOW }],
        lastTurnAt: NOW,
      });
    }
    // `ts_rank_cd` compte les occurrences : seul, il mettrait « Un mot répété » devant « Deux mots ».
    const page = await search(alice, 'Quelle remise pour le plan Zéphyr ?');
    expect(titles(page)).toEqual(['Trois mots', 'Deux mots', 'Un mot répété']);
  });

  it('range une source de la passe élargie qui couvre plus de mots devant une plus récente qui en couvre moins', async () => {
    const { tenantId, alice } = await team();
    for (const [title, text, age] of [
      ['Trois mots sur quatre', 'La remise du plan Zéphyr est validée.', 120],
      ['Un mot sur quatre', 'Le plan de la semaine est prêt.', 0],
    ] as const) {
      await seedIndexed(alice, {
        kind: 'linear',
        acl: [tenantId],
        title,
        turns: [{ text, ts: daysAgo(age) }],
        lastTurnAt: daysAgo(age),
      });
    }
    // « vise » n'est nulle part : les deux sources viennent de la passe élargie.
    const page = await search(alice, 'Quelle remise vise le plan Zéphyr ?');
    expect(titles(page)).toEqual(['Trois mots sur quatre', 'Un mot sur quatre']);
  });

  it('n’apporte jamais par la passe élargie une source qui contient un mot nié', async () => {
    const { tenantId, alice } = await team();
    for (const [title, text] of [
      ['Note alpha', 'Le contrat d’hébergement chez Scaleway est signé.'],
      ['Note bravo', 'Le contrat OVH est signé.'],
      ['Note charlie', 'L’hébergement chez OVH coûte trop cher.'],
      ['Note delta', 'Le contrat de maintenance est renouvelé.'],
    ] as const) {
      await seedIndexed(alice, {
        kind: 'linear',
        acl: [tenantId],
        title,
        turns: [{ text, ts: NOW }],
        lastTurnAt: NOW,
      });
    }
    // Plein texte seul : les vecteurs, que T06b ne change pas, ne lisent pas les négations.
    const wide = await search(alice, 'contrat hébergement -OVH');
    expect(titles(wide)).toEqual(['Note alpha', 'Note delta']);
    const single = await search(alice, 'contrat -OVH');
    expect(titles(single).toSorted()).toEqual(['Note alpha', 'Note delta']);
    for (const hit of [...wide.hits, ...single.hits]) {
      for (const passage of hit.passages) expect(passage.snippet).not.toMatch(/ovh/i);
    }
  });

  it('exige une expression entre guillemets telle quelle, passe élargie comprise', async () => {
    const { tenantId, alice } = await team();
    for (const [title, text] of [
      ['Expression exacte', 'La remise du plan Zéphyr est de quinze pour cent.'],
      ['Mots dispersés', 'Le plan de remise pour Zéphyr : accord signé hier.'],
    ] as const) {
      await seedIndexed(alice, { kind: 'linear', acl: [tenantId], title, turns: [{ text }] });
    }
    expect(titles(await search(alice, '"plan Zéphyr" remise'))).toEqual(['Expression exacte']);
    // « accord » n'est que dans les mots dispersés : la passe élargie a lieu, l'expression reste exigée.
    expect(titles(await search(alice, '"plan Zéphyr" remise accord'))).toEqual([
      'Expression exacte',
    ]);
  });

  it('ne lève aucune erreur sur une question faite de mots outils', async () => {
    const { alice } = await team();
    await seedIndexed(alice, { turns: [{ text: 'Qui a validé le budget ?' }] });
    for (const embedder of [null, factice]) {
      for (const query of ['qui ?', 'Qui ?', 'Qu’est-ce que c’est ?', 'qui -budget', 'le la les']) {
        const page = await search(alice, query, { embedder });
        expect(Array.isArray(page.hits)).toBe(true);
      }
    }
  });

  it('ne lance pas la passe élargie quand la première passe remplit la page', async () => {
    const { tenantId, alice } = await team();
    const seedMany = async (from: number, count: number) => {
      for (let index = from; index < from + count; index += 1) {
        await seedIndexed(alice, {
          kind: 'linear',
          acl: [tenantId],
          title: `Complet ${index}`,
          turns: [{ text: 'Les sauvegardes quotidiennes tournent.', ts: daysAgo(index + 1) }],
          lastTurnAt: daysAgo(index + 1),
        });
      }
    };
    // Un seul des deux mots, mais la plus récente : sans la règle, elle viendrait en tête.
    await seedIndexed(alice, {
      kind: 'linear',
      acl: [tenantId],
      title: 'Partielle',
      turns: [{ text: 'Les sauvegardes hebdomadaires tournent.', ts: NOW }],
      lastTurnAt: NOW,
    });
    await seedMany(0, 9);
    // Neuf sources complètes : la page n'est pas pleine, la passe élargie ajoute la partielle à la fin.
    const short = await search(alice, 'sauvegardes quotidiennes');
    expect(short.totalSources).toBe(10);
    expect(titles(short).at(-1)).toBe('Partielle');

    await seedMany(9, 1);
    // Dix sources complètes : la page est pleine, la passe élargie n'a pas lieu.
    const full = await search(alice, 'sauvegardes quotidiennes');
    const next = await search(alice, 'sauvegardes quotidiennes', { page: 2 });
    expect(full.totalSources).toBe(10);
    expect(titles(full)).not.toContain('Partielle');
    expect(next.hits).toEqual([]);
    // Posée en phrase, la même requête remplit aussi la page dès la première passe, sans ses mots outils.
    const question = await search(alice, 'Quelles sont les sauvegardes quotidiennes ?');
    expect(question.totalSources).toBe(10);
    expect(titles(question)).not.toContain('Partielle');
  });
});

describe('filtres', () => {
  async function seedFilterable() {
    const { tenantId, alice, bob } = await team();
    const acl = [tenantId];
    const seed = (
      title: string,
      kind: 'github' | 'notion' | 'fathom',
      nature: string,
      age: number,
      who: string,
      name?: string,
    ) =>
      seedIndexed(alice, {
        kind,
        acl,
        title,
        metadata: { nature },
        turns: [
          { text: 'zebuline migration', ts: daysAgo(age), authorEmail: who, authorName: name },
        ],
        lastTurnAt: daysAgo(age),
      });
    const aliceEmail = await emailOf(alice);
    const bobEmail = await emailOf(bob);
    await seed('PR 12', 'github', 'ticket', 9, aliceEmail, 'alice-dev');
    await seed('Page migration', 'notion', 'page', 48, bobEmail);
    await seed('Call migration', 'fathom', 'reunion', 4, 'julie@acme.fr');
    await seed('PR 15', 'github', 'ticket', 2, bobEmail, 'bob-dev');
    return { alice, bob, aliceEmail, bobEmail };
  }
  const sorted = (page: SearchPage) => titles(page).toSorted();

  it('restreignent par outil, type, dates et auteur', async () => {
    const { alice, bobEmail } = await seedFilterable();
    expect(sorted(await search(alice, 'zebuline'))).toEqual([
      'Call migration',
      'PR 12',
      'PR 15',
      'Page migration',
    ]);
    const filtered = async (filters: SearchFilters) =>
      sorted(await search(alice, 'zebuline', { filters }));
    expect(await filtered({ tools: ['github'] })).toEqual(['PR 12', 'PR 15']);
    expect(await filtered({ tools: ['notion', 'fathom'] })).toEqual([
      'Call migration',
      'Page migration',
    ]);
    expect(await filtered({ natures: ['page'] })).toEqual(['Page migration']);
    expect(await filtered({ natures: ['ticket', 'reunion'] })).toEqual([
      'Call migration',
      'PR 12',
      'PR 15',
    ]);
    expect(await filtered({ since: daysAgo(10) })).toEqual(['Call migration', 'PR 12', 'PR 15']);
    expect(await filtered({ until: daysAgo(10) })).toEqual(['Page migration']);
    expect(await filtered({ since: daysAgo(10), until: daysAgo(3) })).toEqual([
      'Call migration',
      'PR 12',
    ]);
    // `avant` exclut sa borne, `depuis` l'inclut.
    expect(await filtered({ since: daysAgo(4) })).toEqual(['Call migration', 'PR 15']);
    expect(await filtered({ until: daysAgo(4) })).toEqual(['PR 12', 'Page migration']);
    expect(await filtered({ authorEmails: [bobEmail.toUpperCase()] })).toEqual([
      'PR 15',
      'Page migration',
    ]);
    expect(await filtered({ authorEmails: ['julie@acme.fr', bobEmail] })).toEqual([
      'Call migration',
      'PR 15',
      'Page migration',
    ]);
    expect(await filtered({ authorNames: [{ kind: 'github', name: 'ALICE-DEV' }] })).toEqual([
      'PR 12',
    ]);
    // Un nom d'auteur ne vaut que pour l'outil nommé.
    expect(await filtered({ authorNames: [{ kind: 'notion', name: 'alice-dev' }] })).toEqual([]);
    expect(await filtered({ tools: ['github'], natures: ['page'] })).toEqual([]);
  });

  it('se lisent aussi dans la requête, et se combinent avec ceux passés à part', async () => {
    const { alice } = await seedFilterable();
    const run = async (query: string, filters?: SearchFilters) =>
      sorted(await search(alice, query, { filters }));
    expect(await run('zebuline outil:github')).toEqual(['PR 12', 'PR 15']);
    expect(await run('zebuline type:réunion')).toEqual(['Call migration']);
    expect(await run('zebuline depuis:5j')).toEqual(['Call migration', 'PR 15']);
    expect(await run('zebuline avant:2026-10-11 depuis:2026-09-01')).toEqual([
      'PR 12',
      'Page migration',
    ]);
    expect(await run('zebuline de:Bob')).toEqual(['PR 15', 'Page migration']);
    // Les deux contraintes s'appliquent : l'intersection des outils.
    expect(await run('zebuline outil:notion', { tools: ['github', 'notion'] })).toEqual([
      'Page migration',
    ]);
    expect(await run('zebuline outil:notion', { tools: ['github'] })).toEqual([]);
  });

  it('sans texte, rendent les sources les plus récentes qui les passent', async () => {
    const { alice } = await seedFilterable();
    const page = await search(alice, '', { filters: { tools: ['github'] } });
    expect(titles(page)).toEqual(['PR 15', 'PR 12']);
    expect(page.mode).toBe('plein-texte');
    expect(page.totalSources).toBe(2);
    expect(page.hits[0]?.passages).toHaveLength(1);
    expect(page.hits[0]?.passages[0]?.snippet).toContain('zebuline');
    // Dans la requête : les mêmes.
    expect(titles(await search(alice, 'outil:github'))).toEqual(['PR 15', 'PR 12']);
    expect(titles(await search(alice, 'depuis:5j'))).toEqual(['PR 15', 'Call migration']);
  });

  it('nomment les personnes que personne ne porte, et ne devinent pas', async () => {
    const { alice } = await seedFilterable();
    const unknown = await search(alice, 'zebuline de:inconnu');
    expect(unknown.hits).toEqual([]);
    expect(unknown.unknownPeople).toEqual(['inconnu']);
    // Une personne connue et une inconnue : on cherche la connue, on signale l'autre.
    const mixed = await search(alice, 'zebuline de:bob de:inconnu');
    expect(sorted(mixed)).toEqual(['PR 15', 'Page migration']);
    expect(mixed.unknownPeople).toEqual(['inconnu']);
    expect((await search(alice, 'zebuline de:bob')).unknownPeople).toEqual([]);
  });
});

describe('vecteurs', () => {
  it('trouvent par le sens ce que le texte ne trouve pas, et seulement en mode hybride', async () => {
    const { alice } = await team();
    await seedIndexed(alice, {
      title: 'Compte rendu',
      turns: [{ text: 'La réunion du budget a eu lieu hier.' }],
    });
    // « reunion » sans accent : le plein texte ne le rapproche pas de « réunion », le factice si.
    const textOnly = await search(alice, 'reunion');
    expect(textOnly.mode).toBe('plein-texte');
    expect(textOnly.hits).toEqual([]);

    const hybrid = await search(alice, 'reunion', { embedder: factice });
    expect(hybrid.mode).toBe('hybride');
    expect(titles(hybrid)).toEqual(['Compte rendu']);
  });

  it('surlignent les mots de la requête que contient un passage trouvé par le sens', async () => {
    const { alice } = await team();
    await seedIndexed(alice, {
      title: 'Compte rendu',
      turns: [{ text: 'La réunion du budget a eu lieu hier.' }],
    });
    const hybrid = await search(alice, 'reunion budget', { embedder: factice });
    expect(titles(hybrid)).toEqual(['Compte rendu']);
    // Les mots de la requête que le passage contient sont surlignés, même quand c'est le sens qui l'a trouvé.
    const snippet = hybrid.hits[0]?.passages[0]?.snippet ?? '';
    expect(
      splitHighlights(snippet)
        .filter((part) => part.hit)
        .map((part) => part.text),
    ).toEqual(['budget']);
  });

  it('ne rendent pas des passages sans rapport avec la requête', async () => {
    const { alice } = await team();
    await seedIndexed(alice, { turns: [{ text: 'La réunion du budget a eu lieu hier.' }] });
    const page = await search(alice, 'xyzzyplugh', { embedder: factice });
    expect(page.mode).toBe('hybride');
    expect(page.hits).toEqual([]);
  });

  it('ne cherchent que parmi les vecteurs du modèle courant', async () => {
    const { alice } = await team();
    await seedIndexed(alice, {
      title: 'Indexée',
      turns: [{ text: 'La réunion du budget a eu lieu hier.' }],
    });
    const autre: Embedder = { ...factice, model: 'factice-b' };
    // Aucun vecteur de « factice-b » : seul le texte répond, et ici il ne répond pas.
    expect((await search(alice, 'reunion', { embedder: autre })).hits).toEqual([]);
    // Le plein texte, lui, répond toujours.
    expect(titles(await search(alice, 'budget', { embedder: autre }))).toEqual(['Indexée']);
  });

  it('gardent la fusion stable : un passage trouvé par les deux classements passe devant', async () => {
    const { alice } = await team();
    // « réunion » accentué : aucun mot en commun avec la requête pour le plein texte, le même sens pour le factice.
    await seedIndexed(alice, { title: 'Le sens seul', turns: [{ text: 'tapirbudge réunion' }] });
    await seedIndexed(alice, { title: 'Les deux', turns: [{ text: 'tapirbudget reunion' }] });
    expect(titles(await search(alice, 'tapirbudget reunion', { embedder: factice }))).toEqual([
      'Les deux',
      'Le sens seul',
    ]);
    expect(titles(await search(alice, 'tapirbudget reunion'))).toEqual(['Les deux']);
  });
});

describe('modèle de vecteurs en panne', () => {
  it('une erreur du fournisseur laisse le plein texte répondre, sans rien journaliser du texte cherché', async () => {
    const { alice } = await team();
    await seedIndexed(alice, { title: 'Ticket', turns: [{ text: 'quetzalcoatl renouvelé' }] });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: Embedder = {
      model: 'factice-1024',
      embed: async () => {
        throw new EmbedderError('fournisseur indisponible');
      },
    };
    const page = await search(alice, 'quetzalcoatl', { embedder: failing });
    expect(page.mode).toBe('plein-texte');
    expect(titles(page)).toEqual(['Ticket']);
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain('quetzalcoatl');
  });

  it.each([
    [
      'une erreur inattendue (texte cité)',
      async () => {
        throw new Error('quetzalcoatl dans le message');
      },
    ],
    ['une réponse de la mauvaise dimension', async () => [[1, 2, 3]]],
    ['une réponse vide', async () => []],
    [
      'des valeurs qui ne sont pas des nombres',
      async () => [Array<number>(EMBEDDING_DIMS).fill(Number.NaN)],
    ],
  ])('%s : plein texte, sans exception ni fuite dans les journaux', async (_, embed) => {
    const { alice } = await team();
    await seedIndexed(alice, { title: 'Ticket', turns: [{ text: 'quetzalcoatl renouvelé' }] });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const page = await search(alice, 'quetzalcoatl', {
      embedder: { model: 'factice-1024', embed },
    });
    expect(page.mode).toBe('plein-texte');
    expect(titles(page)).toEqual(['Ticket']);
    expect(JSON.stringify(logged.mock.calls)).not.toContain('quetzalcoatl');
  });

  it('un fournisseur qui ne répond pas est abandonné au bout du délai', async () => {
    const { alice } = await team();
    await seedIndexed(alice, { title: 'Ticket', turns: [{ text: 'quetzalcoatl renouvelé' }] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const hung: Embedder = { model: 'factice-1024', embed: () => new Promise(() => undefined) };
      const pending = search(alice, 'quetzalcoatl', { embedder: hung });
      await vi.advanceTimersByTimeAsync(EMBED_QUERY_TIMEOUT_MS);
      const page = await pending;
      expect(page.mode).toBe('plein-texte');
      expect(titles(page)).toEqual(['Ticket']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fournisseur de vecteurs', () => {
  // Un appel au fournisseur est payant : il ne part que si la recherche aura lieu.
  function countingEmbedder() {
    const embed = vi.fn(async (texts: string[]) => factice.embed(texts, 'requete'));
    const embedder: Embedder = { model: factice.model, embed };
    return { embedder, embed };
  }

  it('est interrogé une fois, avec le texte de la requête, pour une recherche qui a lieu', async () => {
    const { alice } = await team();
    await seedIndexed(alice, { title: 'Ticket', turns: [{ text: 'quetzalcoatl renouvelé' }] });
    const { embedder, embed } = countingEmbedder();
    const page = await search(alice, 'quetzalcoatl', { embedder });
    expect(page.mode).toBe('hybride');
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed.mock.calls[0]?.[0]).toEqual(['quetzalcoatl']);
  });

  it('reçoit la question entière, mots outils compris : les vecteurs ne changent pas (T06b)', async () => {
    const { alice } = await team();
    await seedIndexed(alice, { title: 'Ticket', turns: [{ text: 'quetzalcoatl renouvelé' }] });
    const { embedder, embed } = countingEmbedder();
    await search(alice, 'Quand le quetzalcoatl est-il renouvelé ? de:alice', { embedder });
    expect(embed.mock.calls[0]?.[0]).toEqual(['Quand le quetzalcoatl est-il renouvelé ?']);
  });

  it.each([
    ['des outils sans rien en commun', 'outil:notion quetzalcoatl', { tools: ['github' as const] }],
    ['une personne que personne ne porte', 'de:personne-inconnue quetzalcoatl', {}],
  ])('n’est pas interrogé quand la recherche n’aura pas lieu (%s)', async (_, query, filters) => {
    const { alice } = await team();
    await seedIndexed(alice, { title: 'Ticket', turns: [{ text: 'quetzalcoatl renouvelé' }] });
    const { embedder, embed } = countingEmbedder();
    const page = await search(alice, query, { embedder, filters });
    expect(page.hits).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });
});

describe('dates extrêmes', () => {
  // L'ingestion accepte toute date lisible, dont `0001-01-01`, la « date zéro » de Go, de .NET et de Microsoft
  // Graph : une seule source ainsi datée ne doit faire échouer ni la recherche ni l'activité.
  const DAYS = ['9999-12-31', '1659-01-01', '1500-01-01', '0001-01-01'];
  const expected = DAYS.map((day) => `Source ${day}`);

  async function seedExtremes() {
    const { tenantId, alice } = await team();
    for (const day of DAYS) {
      const at = new Date(`${day}T00:00:00Z`);
      await seedIndexed(alice, {
        kind: 'github',
        acl: [tenantId],
        title: `Source ${day}`,
        turns: [{ text: 'ocelotine', ts: at }],
        lastTurnAt: at,
      });
    }
    // Trouvée par son titre seul, par une requête faite de négations.
    const zero = new Date('0001-01-01T00:00:00Z');
    await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      title: 'a b c',
      turns: [{ text: 'sans rapport', ts: zero }],
      lastTurnAt: zero,
    });
    return alice;
  }

  it.each([
    ['plein texte', null],
    ['hybride', factice],
  ])('rend les sources les plus récentes d’abord, sans exception (%s)', async (_, embedder) => {
    const alice = await seedExtremes();
    const page = await search(alice, 'ocelotine', { embedder });
    expect(titles(page)).toEqual(expected);
    // Une date lointaine ne gagne rien sur une autre : seule la dernière activité les départage.
    expect(page.hits.every((hit) => Number.isFinite(hit.score) && hit.score > 0)).toBe(true);
  });

  it.each([
    ['plein texte', null],
    ['hybride', factice],
  ])('ne casse pas sur une requête de négations seules (%s)', async (_, embedder) => {
    const alice = await seedExtremes();
    for (const query of ['-a -b', '-a -b -c', '-ocelotine']) {
      const page = await search(alice, query, { embedder });
      expect(Array.isArray(page.hits)).toBe(true);
    }
    expect(titles(await search(alice, '-a -b -c', { embedder }))).toContain('a b c');
  });

  it('rend l’activité, la plus récente d’abord, sans exception', async () => {
    const alice = await seedExtremes();
    const hits = await listActivity(alice, { filters: { tools: ['github'] }, limit: 10 });
    // Les deux sources du 1er janvier de l'an 1 se départagent sur autre chose que leur date.
    expect(hits.slice(0, 3).map((hit) => hit.title)).toEqual(expected.slice(0, 3));
    expect(
      hits
        .slice(3)
        .map((hit) => hit.title)
        .toSorted(),
    ).toEqual(['Source 0001-01-01', 'a b c']);
    expect(hits[0]?.lastTs).toEqual(new Date('9999-12-31T00:00:00Z'));
    expect(hits.at(-1)?.lastTs).toEqual(new Date('0001-01-01T00:00:00Z'));
  });

  it('rend, sans mot à chercher, les sources aux dates extrêmes avec des filtres seuls', async () => {
    const alice = await seedExtremes();
    const page = await search(alice, 'outil:github');
    expect(page.totalSources).toBe(5);
    expect(titles(page).slice(0, 3)).toEqual(expected.slice(0, 3));
  });
});

describe('pages', () => {
  it('découpe en pages de dix sources, de la plus récente à la plus ancienne', async () => {
    const { alice } = await team();
    for (let index = 0; index < 12; index += 1) {
      await seedIndexed(alice, {
        title: `Source ${index}`,
        turns: [{ text: 'paginationmot', ts: daysAgo(index) }],
        lastTurnAt: daysAgo(index),
      });
    }
    const first = await search(alice, 'paginationmot');
    const second = await search(alice, 'paginationmot', { page: 2 });
    expect(first.hits).toHaveLength(10);
    expect(second.hits).toHaveLength(2);
    expect(first.totalSources).toBe(12);
    expect(second.totalSources).toBe(12);
    expect(titles(first)[0]).toBe('Source 0');
    expect(titles(second)).toEqual(['Source 10', 'Source 11']);
    expect((await search(alice, 'paginationmot', { page: 3 })).hits).toEqual([]);
    // Une page invalide vaut la première.
    for (const page of [0, -2, 1.5, Number.NaN]) {
      expect(titles(await search(alice, 'paginationmot', { page }))).toEqual(titles(first));
    }
  });
});

describe('forme des résultats', () => {
  it('rend l’outil, la nature, le lien et l’origine de la source', async () => {
    const { tenantId, alice } = await team();
    await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      title: 'PR 42',
      metadata: {
        nature: 'ticket',
        url: 'https://github.com/acme/leon/pull/42',
        origin: { repo: 'acme/leon', ignore: 12 },
      },
      turns: [{ text: 'axolotlbleu', ts: daysAgo(3), authorName: 'alice-dev' }],
      lastTurnAt: daysAgo(3),
    });
    await seedIndexed(alice, { title: 'Sans métadonnées', turns: [{ text: 'axolotlbleu' }] });
    await seedIndexed(alice, {
      title: 'Métadonnées douteuses',
      metadata: { nature: 'pas-une-nature', url: 'javascript:alert(1)', origin: 'texte' },
      turns: [{ text: 'axolotlbleu' }],
    });
    const hits = (await search(alice, 'axolotlbleu')).hits;
    const pr = hits.find((hit) => hit.title === 'PR 42');
    expect(pr).toMatchObject({
      kind: 'github',
      nature: 'ticket',
      url: 'https://github.com/acme/leon/pull/42',
      origin: { repo: 'acme/leon' },
    });
    expect(pr?.lastTs).toEqual(daysAgo(3));
    expect(pr?.passages[0]).toMatchObject({ authorName: 'alice-dev' });
    expect(pr?.passages[0]?.ts).toEqual(daysAgo(3));
    expect(pr?.score).toBeGreaterThan(0);
    // Une source sans nature est une conversation ; un lien qui n'est pas http(s) disparaît.
    for (const title of ['Sans métadonnées', 'Métadonnées douteuses']) {
      expect(hits.find((hit) => hit.title === title)).toMatchObject({
        nature: 'conversation',
        url: null,
        origin: {},
      });
    }
  });
});

describe('entrées bizarres', () => {
  const inputs = [
    '',
    'a',
    'ab',
    '"acme',
    'acme"',
    '"',
    'de:',
    'de:""',
    'outil:inconnu x',
    'outil:inconnu',
    'depuis:xyz',
    '   ',
    '&|!():*<>\\',
    "'; drop table passages; --",
    `${HIGHLIGHT_START}acme${HIGHLIGHT_END}`,
    'acme\u0000budget',
    'x'.repeat(2000),
    `${'mot '.repeat(600)}de:julie outil:github`,
    '😀'.repeat(400),
    'le la les de du',
  ];

  it.each([
    ['plein texte', null],
    ['hybride', factice],
  ])('ne lèvent aucune erreur de base (%s)', async (_, embedder) => {
    const { alice } = await team();
    await seedIndexed(alice, { turns: [{ text: 'acme budget le contrat est renouvelé' }] });
    for (const input of inputs) {
      const page = await search(alice, input, { embedder });
      expect(Array.isArray(page.hits)).toBe(true);
      expect(page.totalSources).toBeGreaterThanOrEqual(page.hits.length);
    }
  });

  it('rend « aucun résultat » pour une requête vide sans filtre', async () => {
    const { alice } = await team();
    await seedIndexed(alice, { turns: [{ text: 'acme budget' }] });
    for (const query of ['', '   ', 'de:', 'outil:inconnu', '"']) {
      const page = await search(alice, query);
      expect(page).toMatchObject({
        hits: [],
        totalSources: 0,
        mode: 'plein-texte',
        unknownPeople: [],
      });
    }
  });

  it('un identifiant de personne qui ressemble à un UUID ou à du SQL ne change rien', async () => {
    const { alice } = await team();
    const page = await search(alice, `x de:${randomUUID()} de:"a' or '1'='1"`);
    expect(page.hits).toEqual([]);
    expect(page.unknownPeople).toHaveLength(2);
  });
});
