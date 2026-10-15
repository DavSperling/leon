import { describe, expect, it } from 'vitest';
import { AttenduSchema, EntrepriseSchema, MiniSchema } from './schema';

const fait = {
  id: 'F001',
  enonce: 'Menuiserie Dupont paie à 45 jours.',
  fiche: 'Menuiserie Dupont',
  typeFiche: 'client',
  tour: 't-003',
  extrait: 'paie à 45 jours',
  sensible: false,
};

describe('schémas du jeu d essai', () => {
  it('accepte un attendu complet et met alias à [] par défaut', () => {
    const parsed = AttenduSchema.parse({
      faits: [fait],
      pasRetenir: [
        { id: 'N001', enonce: 'Le RGPD.', tour: 't-001', pourquoi: 'question générale' },
      ],
      remplace: [{ ancien: 'F001', nouveau: 'F002' }],
      conflits: [],
    });
    expect(parsed.faits[0]?.alias).toEqual([]);
  });

  it('refuse un identifiant de fait mal formé et un type de fiche inconnu', () => {
    expect(
      AttenduSchema.safeParse({
        faits: [{ ...fait, id: 'X1' }],
        pasRetenir: [],
        remplace: [],
        conflits: [],
      }).success,
    ).toBe(false);
    expect(
      AttenduSchema.safeParse({
        faits: [{ ...fait, typeFiche: 'chat' }],
        pasRetenir: [],
        remplace: [],
        conflits: [],
      }).success,
    ).toBe(false);
  });

  it('impose le slug et le domaine d essai', () => {
    const entreprise = {
      organisation: 'Atelier Numérique Lebrun',
      slug: 'essai-atelier-lebrun',
      domaine: 'essai.leon.local',
      motDePasse: 'essai-leon-2026',
      personnages: [{ cle: 'claire', nom: 'Claire Lebrun', role: 'Dirigeante' }],
      secrets: ['sk-essai-0000000000000000000000'],
    };
    expect(EntrepriseSchema.safeParse(entreprise).success).toBe(true);
    expect(EntrepriseSchema.safeParse({ ...entreprise, slug: 'acme' }).success).toBe(false);
  });

  it('mini : des clés personnage/fichier', () => {
    expect(MiniSchema.safeParse(['hugo/2026-09-22-migration']).success).toBe(true);
    expect(MiniSchema.safeParse(['Hugo/Migration']).success).toBe(false);
  });
});
