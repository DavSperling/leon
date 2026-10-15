import { normalizeStatement } from '@/server/pipeline/placement/plan';
import type { FaitProduit } from './collect';
import type { ConversationEssai } from './dataset';
import type { FaitAttendu } from './schema';

export type Ratio = { ok: number; sur: number };

export type NotesConversation = {
  cle: string;
  attendus: number;
  retrouves: number;
  produits: number;
  manques: string[]; // F… jamais retrouvés (hors redits : voir doublonDe)
  enTrop: string[]; // faits produits sans correspondance
  fauxFaits: string[]; // faits produits qui correspondent à un N…
};

export type Notes = {
  attendus: number;
  retrouves: number;
  rappel: number | null;
  produits: number;
  horsJeu: number; // faits produits hors du jeu d'essai (source étrangère), exclus de toutes les notes
  apparies: number;
  precision: number | null;
  fauxFaits: number;
  doublonsFaits: number;
  redits: number; // F qui redisent un fait déjà posé plus tôt (doublonDe) : Leon doit les rejeter
  reditsRecrees: number; // parmi eux, ceux que Leon a quand même recréés (fait produit propre)
  tourCorrect: Ratio;
  ficheCorrecte: Ratio;
  typeCorrect: Ratio;
  fichesDispersees: number;
  remplacements: { trouves: number; attendus: number };
  conflits: { trouves: number; attendus: number };
  sensibles: { marques: number; attendus: number; retrouves: number };
  sensiblesProduitsPartages: number;
  fuitesSensibles: number; // F sensibles dont un fait produit correspondant est partagé
  surSignales: number; // F non sensibles dont un fait produit correspondant est marqué sensible
  secretsFuites: number;
  parConversation: NotesConversation[];
};

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

function ficheAttendue(fait: FaitAttendu, titre: string): boolean {
  const titres = [fait.fiche, ...fait.alias].map(normalizeStatement);
  return titres.includes(normalizeStatement(titre));
}

// Faits produits dont la source correspond à cette conversation (réutilisé par le juge, tâche 13).
export function faitsDeConversation(
  conversation: ConversationEssai,
  produits: FaitProduit[],
): FaitProduit[] {
  return produits.filter((p) => p.sourceExternalId === conversation.payload.source.external_id);
}

// Notes d'un passage, sans LLM : les paires du juge (fait produit → F…, N… ou null) font foi.
export function calculerNotes(input: {
  conversations: ConversationEssai[];
  produits: FaitProduit[];
  paires: Map<string, string | null>;
  secrets: string[];
}): Notes {
  const { conversations, paires } = input;
  const sources = new Set(conversations.map((c) => c.payload.source.external_id));
  // Un fait d'une autre source (autre essai, autre organisation) ne doit jamais fausser les notes.
  const produits = input.produits.filter((p) => sources.has(p.sourceExternalId));
  const horsJeu = input.produits.length - produits.length;

  const attendusBruts = new Map(
    conversations.flatMap((c) => c.attendu.faits.map((f) => [f.id, f] as const)),
  );
  // Un F qui redit un fait déjà posé (doublonDe) n'est pas un fait distinct : on le ramène à son
  // canonique pour le compte des attendus, du rappel et des ratios ; Leon doit le rejeter, pas le recréer.
  const canonique = (id: string): string => attendusBruts.get(id)?.doublonDe ?? id;
  const redits = [...attendusBruts.values()].filter((f) => f.doublonDe);
  const attendus = new Map(
    [...attendusBruts.values()].filter((f) => !f.doublonDe).map((f) => [f.id, f] as const),
  );

  const parAttendu = new Map<string, FaitProduit[]>();
  const brutPar = new Map<string, FaitAttendu>(); // produit.id -> F réellement apparié (avant résolution du canonique)
  for (const produit of produits) {
    const cible = paires.get(produit.id);
    if (cible?.startsWith('F')) {
      const can = canonique(cible);
      parAttendu.set(can, [...(parAttendu.get(can) ?? []), produit]);
      const brut = attendusBruts.get(cible);
      if (brut) brutPar.set(produit.id, brut);
    }
  }
  const apparies = [...parAttendu.entries()].flatMap(([id, liste]) =>
    liste.map((p) => ({ attendu: attendus.get(id), brut: brutPar.get(p.id), produit: p })),
  );
  const compte = (test: (a: FaitAttendu, p: FaitProduit) => boolean): Ratio => ({
    ok: apparies.filter(({ attendu, produit }) => attendu && test(attendu, produit)).length,
    sur: apparies.length,
  });
  // Un produit apparié à un redit se juge sur le tour du redit lui-même : son canonique peut être
  // dans une tout autre conversation, à un autre tour.
  const tourCorrect: Ratio = {
    ok: apparies.filter(({ brut, produit }) => brut && brut.tour === produit.turnExternalId).length,
    sur: apparies.length,
  };

  // Les fiches « en attente de revue » sont privées par construction : on les ignore pour la dispersion.
  const appariesVisibles = apparies.filter(({ produit }) => produit.status !== 'pending_review');
  const fichesParAttendue = new Map<string, Set<string>>();
  for (const { attendu, produit } of appariesVisibles) {
    if (!attendu) continue;
    const cle = normalizeStatement(attendu.fiche);
    fichesParAttendue.set(cle, (fichesParAttendue.get(cle) ?? new Set()).add(produit.ficheId));
  }

  const faitsAttendu = (id: string) => parAttendu.get(id) ?? [];
  const remplaces = conversations.flatMap((c) => c.attendu.remplace);
  const conflits = conversations.flatMap((c) => c.attendu.conflits);
  const sensiblesAttendus = [...attendus.values()].filter((f) => f.sensible);
  const nonSensiblesAttendus = [...attendus.values()].filter((f) => !f.sensible);
  const sensiblesRetrouves = sensiblesAttendus.filter((f) => parAttendu.has(f.id));
  const nombreApparies = produits.filter((p) => paires.get(p.id)?.startsWith('F')).length;
  const retrouves = [...attendus.keys()].filter((id) => parAttendu.has(id)).length;

  return {
    attendus: attendus.size,
    retrouves,
    rappel: ratio(retrouves, attendus.size),
    produits: produits.length,
    horsJeu,
    apparies: nombreApparies,
    precision: ratio(nombreApparies, produits.length),
    fauxFaits: produits.filter((p) => paires.get(p.id)?.startsWith('N')).length,
    // Un redit recréé gonfle les deux compteurs : c'est un vrai fait (il compte pour la précision),
    // mais aussi un doublon que le dédoublonnage aurait dû absorber.
    doublonsFaits: [...parAttendu.values()].reduce((sum, liste) => sum + liste.length - 1, 0),
    redits: redits.length,
    reditsRecrees: redits.filter((f) => reditRecree(f, produits, paires, canonique)).length,
    tourCorrect,
    ficheCorrecte: compte((a, p) => ficheAttendue(a, p.ficheTitre)),
    typeCorrect: compte((a, p) => a.typeFiche === p.typeFiche),
    fichesDispersees: [...fichesParAttendue.values()].reduce(
      (sum, fiches) => sum + fiches.size - 1,
      0,
    ),
    remplacements: {
      trouves: remplaces.filter((r) => {
        const anciens = faitsAttendu(canonique(r.ancien));
        const nouveaux = faitsAttendu(canonique(r.nouveau));
        return (
          anciens.some((fa) => nouveaux.some((fn) => fa.supersededBy === fn.id)) &&
          !anciens.some((fa) => fa.status === 'active')
        );
      }).length,
      attendus: remplaces.length,
    },
    conflits: {
      trouves: conflits.filter((k) => {
        const as = faitsAttendu(canonique(k.a));
        const bs = faitsAttendu(canonique(k.b));
        return as.some((f) => f.status === 'conflict') && bs.some((f) => f.status === 'conflict');
      }).length,
      attendus: conflits.length,
    },
    sensibles: {
      marques: sensiblesRetrouves.filter((f) =>
        faitsAttendu(f.id).every((p) => p.sensitivity === 'sensitive'),
      ).length,
      attendus: sensiblesAttendus.length,
      retrouves: sensiblesRetrouves.length,
    },
    sensiblesProduitsPartages: produits.filter((p) => p.sensitivity === 'sensitive' && p.partage)
      .length,
    fuitesSensibles: sensiblesAttendus.filter((f) => faitsAttendu(f.id).some((p) => p.partage))
      .length,
    surSignales: nonSensiblesAttendus.filter((f) =>
      faitsAttendu(f.id).some((p) => p.sensitivity === 'sensitive'),
    ).length,
    secretsFuites: produits.filter((p) =>
      input.secrets.some((s) =>
        [p.statement, p.quote, p.value ?? '', p.ficheTitre].some((t) => t.includes(s)),
      ),
    ).length,
    parConversation: conversations.map((c) =>
      notesConversation(c, produits, paires, parAttendu, redits),
    ),
  };
}

// Un fait produit apparié directement à un F qui est lui-même un redit (doublonDe) : Leon l'a recréé
// au lieu de le rejeter comme doublon du candidat.
function parAttenduDirect(paires: Map<string, string | null>, faitReditId: string): boolean {
  for (const correspond of paires.values()) if (correspond === faitReditId) return true;
  return false;
}

// Un redit compte comme recréé seulement si Leon a vraiment posé un second fait visible pour lui :
// un fait produit apparié directement au redit lui-même, ET un fait produit apparié au canonique
// (la paire du juge vise le canonique, pas le redit) qui est actif et partagé. Sans ce second fait
// sur le canonique, on ne saurait pas distinguer un redit « recréé en double » d'un redit simplement
// « non retrouvé » dont le canonique lui-même n'a jamais été produit.
function reditRecree(
  f: FaitAttendu,
  produits: FaitProduit[],
  paires: Map<string, string | null>,
  canonique: (id: string) => string,
): boolean {
  const can = canonique(f.id);
  const versCanonique = produits.filter((p) => paires.get(p.id) === can);
  const actifPartage = versCanonique.some((p) => p.status === 'active' && p.partage);
  return actifPartage && parAttenduDirect(paires, f.id);
}

function notesConversation(
  c: ConversationEssai,
  produits: FaitProduit[],
  paires: Map<string, string | null>,
  parAttendu: Map<string, FaitProduit[]>,
  redits: FaitAttendu[],
): NotesConversation {
  const siens = faitsDeConversation(c, produits);
  const reditsIds = new Set(redits.map((f) => f.id));
  // Un redit est exclu des attendus de sa conversation, pas seulement des manques : il n'est pas
  // un fait distinct, cohérent avec le calcul global.
  const faitsCanon = c.attendu.faits.filter((f) => !reditsIds.has(f.id));
  const manques = faitsCanon.filter((f) => !parAttendu.has(f.id)).map((f) => f.id);
  return {
    cle: c.cle,
    attendus: faitsCanon.length,
    retrouves: faitsCanon.length - manques.length,
    produits: siens.length,
    manques,
    enTrop: siens.filter((p) => !paires.get(p.id)).map((p) => p.id),
    fauxFaits: siens.filter((p) => paires.get(p.id)?.startsWith('N')).map((p) => p.id),
  };
}
