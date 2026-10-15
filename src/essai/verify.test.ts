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
    expect(problemes).toContain('F001 défini deux fois');
    expect(problemes).toContain('hugo/2026-09-23-suite : remplacement vers un fait inconnu F404');
    expect(problemes).toContain('mini.json : conversation inconnue hugo/2026-09-30-absente');
  });

  it('signale un secret qui n apparaît dans aucun tour', () => {
    const c = conversation('hugo/2026-09-22-migration');
    const j = jeu([c]);
    j.entreprise.secrets.push('mot-de-passe-jamais-dit');
    expect(verifierJeu(j)).toContain('secret absent de toutes les conversations : mot-…');
  });
});

describe('volumes', () => {
  it('compte conversations et tours par personnage', () => {
    expect(volumes(jeu([conversation('hugo/2026-09-22-migration')]))).toEqual([
      { personnage: 'hugo', conversations: 1, tours: 2, faits: 1, pasRetenir: 0 },
    ]);
  });
});
