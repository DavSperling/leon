import type { ConversationEssai, JeuEssai } from './dataset';
import { CLE_CONVERSATION } from './schema';

// Contrôles du jeu, sans appel : chaque problème est une ligne lisible, liste vide si tout va bien.
export function verifierJeu(jeu: JeuEssai): string[] {
  const problemes: string[] = [];
  const personnages = new Set(jeu.entreprise.personnages.map((p) => p.cle));
  const faitsConnus = new Set<string>();
  const vus = new Set<string>();
  const sources = new Set<string>();

  for (const c of jeu.conversations) {
    const ici = (message: string) => problemes.push(`${c.cle} : ${message}`);
    if (!CLE_CONVERSATION.test(c.cle))
      ici('nom de fichier hors convention (ASCII, AAAA-MM-JJ-sujet)');
    if (!personnages.has(c.personnage)) ici(`personnage inconnu « ${c.personnage} »`);
    if (sources.has(c.payload.source.external_id)) ici('external_id de source en double');
    sources.add(c.payload.source.external_id);
    verifierTours(c, ici);
    for (const id of [
      ...c.attendu.faits.map((f) => f.id),
      ...c.attendu.pasRetenir.map((n) => n.id),
    ]) {
      if (vus.has(id)) problemes.push(`${id} défini deux fois`);
      vus.add(id);
      if (id.startsWith('F')) faitsConnus.add(id);
    }
  }

  for (const c of jeu.conversations) {
    for (const r of c.attendu.remplace)
      for (const id of [r.ancien, r.nouveau])
        if (!faitsConnus.has(id))
          problemes.push(`${c.cle} : remplacement vers un fait inconnu ${id}`);
    for (const k of c.attendu.conflits)
      for (const id of [k.a, k.b])
        if (!faitsConnus.has(id)) problemes.push(`${c.cle} : conflit avec un fait inconnu ${id}`);
  }

  const cles = new Set(jeu.conversations.map((c) => c.cle));
  for (const cle of jeu.mini)
    if (!cles.has(cle)) problemes.push(`mini.json : conversation inconnue ${cle}`);

  const textes = jeu.conversations.flatMap((c) => c.payload.turns.map((t) => t.text));
  for (const secret of jeu.entreprise.secrets)
    if (!textes.some((t) => t.includes(secret)))
      problemes.push(`secret absent de toutes les conversations : ${secret.slice(0, 4)}…`);

  return problemes;
}

function verifierTours(c: ConversationEssai, ici: (message: string) => void): void {
  const tours = new Map(c.payload.turns.map((t) => [t.external_id, t]));
  if (tours.size !== c.payload.turns.length) ici('external_id de tour en double');
  const dates = c.payload.turns.map((t) => Date.parse(t.ts));
  if (dates.some((d, i) => i > 0 && d < (dates[i - 1] ?? d))) ici('tours hors ordre chronologique');
  for (const f of c.attendu.faits) {
    const tour = tours.get(f.tour);
    if (!tour) ici(`${f.id}, tour inconnu ${f.tour}`);
    else if (!tour.text.includes(f.extrait)) ici(`${f.id}, extrait absent du tour ${f.tour}`);
  }
  for (const n of c.attendu.pasRetenir)
    if (!tours.has(n.tour)) ici(`${n.id}, tour inconnu ${n.tour}`);
}

export function volumes(jeu: JeuEssai) {
  const parPersonnage = new Map<
    string,
    { personnage: string; conversations: number; tours: number; faits: number; pasRetenir: number }
  >();
  for (const c of jeu.conversations) {
    const v = parPersonnage.get(c.personnage) ?? {
      personnage: c.personnage,
      conversations: 0,
      tours: 0,
      faits: 0,
      pasRetenir: 0,
    };
    v.conversations += 1;
    v.tours += c.payload.turns.length;
    v.faits += c.attendu.faits.length;
    v.pasRetenir += c.attendu.pasRetenir.length;
    parPersonnage.set(c.personnage, v);
  }
  return [...parPersonnage.values()];
}
