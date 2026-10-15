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
  manques: string[]; // F… jamais retrouvés
  enTrop: string[]; // faits produits sans correspondance
  fauxFaits: string[]; // faits produits qui correspondent à un N…
};

export type Notes = {
  attendus: number;
  retrouves: number;
  rappel: number | null;
  produits: number;
  apparies: number;
  precision: number | null;
  fauxFaits: number;
  doublonsFaits: number;
  tourCorrect: Ratio;
  ficheCorrecte: Ratio;
  typeCorrect: Ratio;
  doublonsFiches: number;
  remplacements: { trouves: number; attendus: number };
  conflits: { trouves: number; attendus: number };
  sensibles: { marques: number; attendus: number; retrouves: number };
  sensiblesPartages: number;
  secretsFuites: number;
  parConversation: NotesConversation[];
};

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

function ficheAttendue(fait: FaitAttendu, titre: string): boolean {
  const titres = [fait.fiche, ...fait.alias].map(normalizeStatement);
  return titres.includes(normalizeStatement(titre));
}

// Notes d'un passage, sans LLM : les paires du juge (fait produit → F…, N… ou null) font foi.
export function calculerNotes(input: {
  conversations: ConversationEssai[];
  produits: FaitProduit[];
  paires: Map<string, string | null>;
  secrets: string[];
}): Notes {
  const { conversations, produits, paires } = input;
  const attendus = new Map(
    conversations.flatMap((c) => c.attendu.faits.map((f) => [f.id, f] as const)),
  );
  const parAttendu = new Map<string, FaitProduit[]>();
  for (const produit of produits) {
    const cible = paires.get(produit.id);
    if (cible?.startsWith('F')) parAttendu.set(cible, [...(parAttendu.get(cible) ?? []), produit]);
  }
  const apparies = [...parAttendu.entries()].flatMap(([id, liste]) =>
    liste.map((p) => ({ attendu: attendus.get(id), produit: p })),
  );
  const compte = (test: (a: FaitAttendu, p: FaitProduit) => boolean): Ratio => ({
    ok: apparies.filter(({ attendu, produit }) => attendu && test(attendu, produit)).length,
    sur: apparies.length,
  });

  // Une fiche attendue rangée dans plusieurs fiches produites : chaque fiche en plus est un doublon.
  const fichesParAttendue = new Map<string, Set<string>>();
  for (const { attendu, produit } of apparies) {
    if (!attendu) continue;
    const cle = normalizeStatement(attendu.fiche);
    fichesParAttendue.set(cle, (fichesParAttendue.get(cle) ?? new Set()).add(produit.ficheId));
  }

  const statut = (id: string) => (parAttendu.get(id) ?? []).map((p) => p.status);
  const remplaces = conversations.flatMap((c) => c.attendu.remplace);
  const conflits = conversations.flatMap((c) => c.attendu.conflits);
  const sensiblesAttendus = [...attendus.values()].filter((f) => f.sensible);
  const sensiblesRetrouves = sensiblesAttendus.filter((f) => parAttendu.has(f.id));
  const nombreApparies = produits.filter((p) => paires.get(p.id)?.startsWith('F')).length;
  const retrouves = [...attendus.keys()].filter((id) => parAttendu.has(id)).length;

  return {
    attendus: attendus.size,
    retrouves,
    rappel: ratio(retrouves, attendus.size),
    produits: produits.length,
    apparies: nombreApparies,
    precision: ratio(nombreApparies, produits.length),
    fauxFaits: produits.filter((p) => paires.get(p.id)?.startsWith('N')).length,
    doublonsFaits: [...parAttendu.values()].reduce((sum, liste) => sum + liste.length - 1, 0),
    tourCorrect: compte((a, p) => a.tour === p.turnExternalId),
    ficheCorrecte: compte((a, p) => ficheAttendue(a, p.ficheTitre)),
    typeCorrect: compte((a, p) => a.typeFiche === p.typeFiche),
    doublonsFiches: [...fichesParAttendue.values()].reduce(
      (sum, fiches) => sum + fiches.size - 1,
      0,
    ),
    remplacements: {
      trouves: remplaces.filter(
        (r) => statut(r.ancien).includes('superseded') && statut(r.nouveau).includes('active'),
      ).length,
      attendus: remplaces.length,
    },
    conflits: {
      trouves: conflits.filter((k) => [...statut(k.a), ...statut(k.b)].includes('conflict')).length,
      attendus: conflits.length,
    },
    sensibles: {
      marques: sensiblesRetrouves.filter((f) =>
        (parAttendu.get(f.id) ?? []).every((p) => p.sensitivity === 'sensitive'),
      ).length,
      attendus: sensiblesAttendus.length,
      retrouves: sensiblesRetrouves.length,
    },
    sensiblesPartages: produits.filter((p) => p.sensitivity === 'sensitive' && p.partage).length,
    secretsFuites: produits.filter((p) =>
      input.secrets.some((s) => [p.statement, p.quote, p.value ?? ''].some((t) => t.includes(s))),
    ).length,
    parConversation: conversations.map((c) => notesConversation(c, produits, paires, parAttendu)),
  };
}

function notesConversation(
  c: ConversationEssai,
  produits: FaitProduit[],
  paires: Map<string, string | null>,
  parAttendu: Map<string, FaitProduit[]>,
): NotesConversation {
  const siens = produits.filter((p) => p.sourceExternalId === c.payload.source.external_id);
  const manques = c.attendu.faits.filter((f) => !parAttendu.has(f.id)).map((f) => f.id);
  return {
    cle: c.cle,
    attendus: c.attendu.faits.length,
    retrouves: c.attendu.faits.length - manques.length,
    produits: siens.length,
    manques,
    enTrop: siens.filter((p) => !paires.get(p.id)).map((p) => p.id),
    fauxFaits: siens.filter((p) => paires.get(p.id)?.startsWith('N')).map((p) => p.id),
  };
}
