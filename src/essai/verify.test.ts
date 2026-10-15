import { describe, expect, it } from 'vitest';
import type { ConversationEssai, JeuEssai } from './dataset';
import { verifierJeu, volumes } from './verify';

function conversation(cle: string, overrides: Partial<ConversationEssai> = {}): ConversationEssai {
  const personnage = cle.split('/')[0] ?? 'hugo';
  return {
    cle,
    personnage,
    payload: {
      source: { kind: 'claude_code', external_id: `essai-${cle}` },
      turns: [
        {
          external_id: 't-001',
          role: 'user',
          text: 'Dupont paie à 45 jours, clé sk-essai-AAAAAAAAAAAAAAAAAAAAAAAA',
          ts: '2026-09-22T09:00:00+02:00',
          capture_mode: 'file',
        },
        {
          external_id: 't-002',
          role: 'assistant',
          text: 'Noté.',
          ts: '2026-09-22T09:01:00+02:00',
          capture_mode: 'file',
        },
      ],
    },
    attendu: {
      faits: [
        {
          id: 'F001',
          enonce: 'Dupont paie à 45 jours.',
          fiche: 'Dupont',
          alias: [],
          typeFiche: 'client',
          tour: 't-001',
          extrait: 'paie à 45 jours',
          sensible: false,
        },
      ],
      pasRetenir: [],
      remplace: [],
      conflits: [],
    },
    ...overrides,
  };
}

function jeu(conversations: ConversationEssai[], mini = [conversations[0]?.cle ?? '']): JeuEssai {
  return {
    entreprise: {
      organisation: 'Atelier Numérique Lebrun',
      slug: 'essai-atelier-lebrun',
      domaine: 'essai.leon.local',
      motDePasse: 'essai-leon-2026',
      personnages: [{ cle: 'hugo', nom: 'Hugo Martin', role: 'Dev' }],
      secrets: ['sk-essai-AAAAAAAAAAAAAAAAAAAAAAAA'],
    },
    conversations,
    mini,
  };
}

describe('verifierJeu', () => {
  it('ne signale rien sur un jeu cohérent', () => {
    expect(verifierJeu(jeu([conversation('hugo/2026-09-22-migration')]))).toEqual([]);
  });

  it('signale un extrait absent du tour, un tour inconnu et un personnage inconnu', () => {
    const base = conversation('hugo/2026-09-22-migration');
    const [fait] = base.attendu.faits;
    if (!fait) throw new Error('fait manquant');
    const fautive = conversation('paul/2026-09-23-devis', {
      attendu: {
        ...base.attendu,
        faits: [
          { ...fait, id: 'F002', extrait: 'paie à 60 jours' },
          { ...fait, id: 'F003', tour: 't-999' },
        ],
      },
    });
    const problemes = verifierJeu(jeu([base, fautive]));
    expect(problemes).toContain('paul/2026-09-23-devis : personnage inconnu « paul »');
    expect(problemes).toContain('paul/2026-09-23-devis : F002, extrait absent du tour t-001');
    expect(problemes).toContain('paul/2026-09-23-devis : F003, tour inconnu t-999');
  });

  it('signale les identifiants en double, les renvois inconnus et une entrée mini inconnue', () => {
    const a = conversation('hugo/2026-09-22-migration');
    const b = conversation('hugo/2026-09-23-suite', {
      attendu: { ...a.attendu, remplace: [{ ancien: 'F001', nouveau: 'F404' }] },
    });
    const problemes = verifierJeu(jeu([a, b], ['hugo/2026-09-30-absente']));
    expect(problemes).toContain('hugo/2026-09-23-suite : F001 défini deux fois');
    expect(problemes).toContain('hugo/2026-09-23-suite : remplacement : nouveau inconnu F404');
    expect(problemes).toContain('mini.json : conversation inconnue hugo/2026-09-30-absente');
  });

  it('signale un secret qui n apparaît dans aucun tour', () => {
    const c = conversation('hugo/2026-09-22-migration');
    const j = jeu([c]);
    j.entreprise.secrets.push('mot-de-passe-jamais-dit');
    expect(verifierJeu(j)).toContain('secret absent de toutes les conversations : mot-…');
  });

  it('signale un secret recopié dans un fait attendu', () => {
    const c = conversation('hugo/2026-09-22-migration');
    const [fait] = c.attendu.faits;
    if (!fait) throw new Error('fait manquant');
    c.attendu.faits = [{ ...fait, enonce: 'La clé est sk-essai-AAAAAAAAAAAAAAAAAAAAAAAA.' }];
    const problemes = verifierJeu(jeu([c]));
    expect(problemes).toContain('hugo/2026-09-22-migration : F001 contient un secret');
    expect(problemes.join(' ')).not.toContain('sk-essai-AAAAAAAAAAAAAAAAAAAAAAAA');
  });

  it('signale des tours hors ordre chronologique', () => {
    const c = conversation('hugo/2026-09-22-migration');
    const [t1, t2] = c.payload.turns;
    if (!t1 || !t2) throw new Error('tours manquants');
    c.payload.turns = [
      { ...t1, ts: t2.ts },
      { ...t2, ts: t1.ts },
    ];
    expect(verifierJeu(jeu([c]))).toContain(
      'hugo/2026-09-22-migration : tours hors ordre chronologique',
    );
  });

  it('signale un external_id de tour en double', () => {
    const c = conversation('hugo/2026-09-22-migration');
    const [t1] = c.payload.turns;
    if (!t1) throw new Error('tour manquant');
    c.payload.turns = [t1, { ...t1 }];
    expect(verifierJeu(jeu([c]))).toContain(
      'hugo/2026-09-22-migration : external_id de tour en double',
    );
  });

  it('signale un external_id de source en double', () => {
    const a = conversation('hugo/2026-09-22-migration');
    const b = conversation('hugo/2026-09-23-suite', {
      payload: { ...a.payload, source: { ...a.payload.source } },
    });
    expect(verifierJeu(jeu([a, b]))).toContain(
      'hugo/2026-09-23-suite : external_id de source en double',
    );
  });

  it('signale un tour inconnu dans pasRetenir', () => {
    const c = conversation('hugo/2026-09-22-migration', {
      attendu: {
        faits: [],
        pasRetenir: [{ id: 'N001', enonce: 'x', tour: 't-999', pourquoi: 'y' }],
        remplace: [],
        conflits: [],
      },
    });
    expect(verifierJeu(jeu([c]))).toContain('hugo/2026-09-22-migration : N001, tour inconnu t-999');
  });

  it('signale un nom de fichier hors convention', () => {
    const c = conversation('Hugo/Migration', { personnage: 'hugo' });
    expect(verifierJeu(jeu([c], ['Hugo/Migration']))).toContain(
      'Hugo/Migration : nom de fichier hors convention (ASCII, AAAA-MM-JJ-sujet)',
    );
  });

  it('signale un conflit avec un identifiant inconnu', () => {
    const c = conversation('hugo/2026-09-22-migration', {
      attendu: {
        faits: [
          {
            id: 'F001',
            enonce: 'x',
            fiche: 'y',
            alias: [],
            typeFiche: 'client',
            tour: 't-001',
            extrait: 'paie à 45 jours',
            sensible: false,
          },
        ],
        pasRetenir: [],
        remplace: [],
        conflits: [{ a: 'F001', b: 'F999' }],
      },
    });
    expect(verifierJeu(jeu([c]))).toContain('hugo/2026-09-22-migration : conflit : b inconnu F999');
  });

  it('signale un remplacement d un fait par lui-même', () => {
    const c = conversation('hugo/2026-09-22-migration', {
      attendu: {
        faits: [
          {
            id: 'F001',
            enonce: 'x',
            fiche: 'y',
            alias: [],
            typeFiche: 'client',
            tour: 't-001',
            extrait: 'paie à 45 jours',
            sensible: false,
          },
        ],
        pasRetenir: [],
        remplace: [{ ancien: 'F001', nouveau: 'F001' }],
        conflits: [],
      },
    });
    expect(verifierJeu(jeu([c]))).toContain(
      "hugo/2026-09-22-migration : remplacement d'un fait par lui-même F001",
    );
  });

  it('signale un doublonDe inconnu, sur soi-même, non canonique ou non antérieur', () => {
    const a = conversation('hugo/2026-09-22-migration'); // tours à 09:00–09:01
    const [fa] = a.attendu.faits;
    if (!fa) throw new Error('fait manquant');
    a.attendu.faits = [
      fa,
      { ...fa, id: 'F010', doublonDe: 'F999' }, // inconnu
      { ...fa, id: 'F011', doublonDe: 'F011' }, // lui-même
    ];
    const b = conversation('hugo/2026-09-23-suite', {
      payload: {
        ...a.payload,
        source: { kind: 'claude_code', external_id: 'essai-hugo/2026-09-23-suite' },
        turns: a.payload.turns.map((t) => ({ ...t, ts: '2026-09-23T09:00:00+02:00' })),
      },
      attendu: {
        ...a.attendu,
        faits: [
          { ...fa, id: 'F020', doublonDe: 'F001' }, // canonique et antérieur : valide
          { ...fa, id: 'F021', doublonDe: 'F020' }, // F020 est déjà un doublon : non canonique
          { ...fa, id: 'F022', doublonDe: 'F022' },
        ],
      },
    });
    const c = conversation('hugo/2026-09-21-avant', {
      payload: {
        ...a.payload,
        source: { kind: 'claude_code', external_id: 'essai-hugo/2026-09-21-avant' },
        turns: a.payload.turns.map((t) => ({ ...t, ts: '2026-09-21T09:00:00+02:00' })),
      },
      attendu: { ...a.attendu, faits: [{ ...fa, id: 'F030', doublonDe: 'F001' }] }, // antérieur à F001 : refusé
    });
    const problemes = verifierJeu(jeu([a, b, c], [a.cle]));
    expect(problemes).toContain('hugo/2026-09-22-migration : F010 : doublon de inconnu F999');
    expect(problemes).toContain('hugo/2026-09-22-migration : F011 : doublon de lui-même');
    expect(problemes).toContain(
      'hugo/2026-09-23-suite : F021 : doublon de F020, qui est lui-même un doublon (viser le fait canonique)',
    );
    expect(problemes).toContain(
      "hugo/2026-09-21-avant : F030 : doublon de F001, qui n'est pas antérieur",
    );
  });

  it('refuse un doublonDe sur un fait sensible, un canonique sensible, ou un canonique remplacé', () => {
    const a = conversation('hugo/2026-09-22-migration');
    const [fa] = a.attendu.faits;
    if (!fa) throw new Error('fait manquant');
    a.attendu.faits = [
      fa, // F001, canonique sain
      { ...fa, id: 'F002' }, // F002, sera remplacé par F003
      { ...fa, id: 'F003' },
      { ...fa, id: 'F004', sensible: true }, // F004, canonique sensible
    ];
    a.attendu.remplace = [{ ancien: 'F002', nouveau: 'F003' }];
    const b = conversation('hugo/2026-09-23-suite', {
      payload: {
        ...a.payload,
        source: { kind: 'claude_code', external_id: 'essai-hugo/2026-09-23-suite' },
        turns: a.payload.turns.map((t) => ({ ...t, ts: '2026-09-23T09:00:00+02:00' })),
      },
      attendu: {
        faits: [
          { ...fa, id: 'F040', doublonDe: 'F001', sensible: true }, // le redit lui-même est sensible
          { ...fa, id: 'F041', doublonDe: 'F004' }, // le canonique F004 est sensible
          { ...fa, id: 'F042', doublonDe: 'F002' }, // le canonique F002 est l'ancien d'un remplacement
        ],
        pasRetenir: [],
        remplace: [],
        conflits: [],
      },
    });
    const problemes = verifierJeu(jeu([a, b], [a.cle]));
    expect(problemes).toContain(
      "hugo/2026-09-23-suite : F040 : doublon d'un fait sensible, à garder distinct",
    );
    expect(problemes).toContain('hugo/2026-09-23-suite : F041 : doublon de F004, qui est sensible');
    expect(problemes).toContain(
      'hugo/2026-09-23-suite : F042 : doublon de F002, qui est remplacé par un autre fait',
    );
  });

  it('signale une entrée en double dans mini.json', () => {
    const c = conversation('hugo/2026-09-22-migration');
    expect(
      verifierJeu(jeu([c], ['hugo/2026-09-22-migration', 'hugo/2026-09-22-migration'])),
    ).toContain('mini.json : hugo/2026-09-22-migration en double');
  });
});

describe('volumes', () => {
  it('compte conversations et tours par personnage', () => {
    expect(volumes(jeu([conversation('hugo/2026-09-22-migration')]))).toEqual([
      { personnage: 'hugo', conversations: 1, tours: 2, faits: 1, pasRetenir: 0 },
    ]);
  });
});
