import { z } from 'zod';

// Types de fiche du socle (0004-catalogue.sql, 0006-type-concurrent.sql).
export const CARD_TYPE_SLUGS = [
  'client',
  'projet',
  'personne',
  'decision',
  'regle',
  'fournisseur',
  'produit',
  'outil',
  'concurrent',
] as const;

// Le slug et le domaine sont fixes : la remise à zéro ne supprime que cette organisation et ces comptes.
export const ESSAI_SLUG = 'essai-atelier-lebrun';
export const ESSAI_DOMAINE = 'essai.leon.local';

export const EntrepriseSchema = z.object({
  organisation: z.string().min(2).max(100),
  slug: z.literal(ESSAI_SLUG),
  domaine: z.literal(ESSAI_DOMAINE),
  motDePasse: z.string().min(8).max(128), // mot de passe de développement, partagé dans essai/README.md
  personnages: z
    .array(
      z.object({
        cle: z.string().regex(/^[a-z]+$/),
        nom: z.string().min(1).max(100),
        role: z.string().min(1),
      }),
    )
    .min(1),
  secrets: z.array(z.string().min(8)), // faux secrets glissés dans les conversations
});
export type Entreprise = z.infer<typeof EntrepriseSchema>;

const FaitId = z.string().regex(/^F\d{3}$/);

export const AttenduSchema = z.object({
  faits: z.array(
    z.object({
      id: FaitId,
      enonce: z.string().min(1),
      fiche: z.string().min(1),
      alias: z.array(z.string().min(1)).default([]),
      typeFiche: z.enum(CARD_TYPE_SLUGS),
      tour: z.string().min(1),
      extrait: z.string().min(1), // morceau exact du texte du tour qui porte le fait
      sensible: z.boolean(),
    }),
  ),
  pasRetenir: z.array(
    z.object({
      id: z.string().regex(/^N\d{3}$/),
      enonce: z.string().min(1),
      tour: z.string().min(1),
      pourquoi: z.string().min(1),
    }),
  ),
  remplace: z.array(z.object({ ancien: FaitId, nouveau: FaitId })),
  conflits: z.array(z.object({ a: FaitId, b: FaitId })),
});
export type Attendu = z.infer<typeof AttenduSchema>;
export type FaitAttendu = Attendu['faits'][number];

// Clé d'une conversation : « personnage/AAAA-MM-JJ-sujet », le chemin sans « .json ».
export const CLE_CONVERSATION = /^[a-z]+\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MiniSchema = z.array(z.string().regex(CLE_CONVERSATION)).min(1);

export const DernierPassageSchema = z.object({
  id: z.string(),
  label: z.string(),
  commit: z.string(),
  jeu: z.enum(['complet', 'mini']),
  conversations: z.array(z.string()),
  tours: z.number().int(),
  debut: z.iso.datetime(),
});
export type DernierPassage = z.infer<typeof DernierPassageSchema>;
