import type { ConversationEssai, JeuEssai } from './dataset';
import { CLE_CONVERSATION } from './schema';

// Contrôles du jeu, sans appel : chaque problème est une ligne lisible, liste vide si tout va bien.
export function verifierJeu(jeu: JeuEssai): string[] {
  const problemes: string[] = [];
  const personnages = new Set(jeu.entreprise.personnages.map((p) => p.cle));
  const faitsConnus = new Set<string>();
  const vus = new Set<string>();
  const sources = new Set<string>();
  // Pour contrôler doublonDe : conversation, premier tour et sensibilité de chaque fait.
  const faitInfo = new Map<
    string,
    { cle: string; doublonDe?: string; debut: number; sensible: boolean }
  >();
  // Un fait remplacé (ancien d'un remplace) a déjà une suite propre : il ne doit pas aussi servir de
  // canonique à un redit, les deux mécanismes se chevaucheraient.
  const anciens = new Set(
    jeu.conversations.flatMap((c) => c.attendu.remplace.map((r) => r.ancien)),
  );

  for (const c of jeu.conversations) {
    const ici = (message: string) => problemes.push(`${c.cle} : ${message}`);
    if (!CLE_CONVERSATION.test(c.cle))
      ici('nom de fichier hors convention (ASCII, AAAA-MM-JJ-sujet)');
    if (!personnages.has(c.personnage)) ici(`personnage inconnu « ${c.personnage} »`);
    if (sources.has(c.payload.source.external_id)) ici('external_id de source en double');
    sources.add(c.payload.source.external_id);
    verifierTours(c, ici);
    const debut = Math.min(...c.payload.turns.map((t) => Date.parse(t.ts)));
    for (const id of [
      ...c.attendu.faits.map((f) => f.id),
      ...c.attendu.pasRetenir.map((n) => n.id),
    ]) {
      if (vus.has(id)) ici(`${id} défini deux fois`);
      vus.add(id);
      if (id.startsWith('F')) faitsConnus.add(id);
    }
    for (const f of c.attendu.faits)
      faitInfo.set(f.id, { cle: c.cle, doublonDe: f.doublonDe, debut, sensible: f.sensible });
    // Un secret ne doit jamais être recopié dans la réponse attendue : le juge le verrait en clair.
    for (const f of c.attendu.faits)
      for (const secret of jeu.entreprise.secrets)
        if (f.enonce.includes(secret) || f.extrait.includes(secret))
          ici(`${f.id} contient un secret`);
  }

  for (const c of jeu.conversations) {
    const ici = (message: string) => problemes.push(`${c.cle} : ${message}`);
    for (const r of c.attendu.remplace) {
      if (r.ancien === r.nouveau) ici(`remplacement d'un fait par lui-même ${r.ancien}`);
      if (!faitsConnus.has(r.ancien)) ici(`remplacement : ancien inconnu ${r.ancien}`);
      if (!faitsConnus.has(r.nouveau)) ici(`remplacement : nouveau inconnu ${r.nouveau}`);
    }
    for (const k of c.attendu.conflits) {
      if (k.a === k.b) ici(`conflit d'un fait avec lui-même ${k.a}`);
      if (!faitsConnus.has(k.a)) ici(`conflit : a inconnu ${k.a}`);
      if (!faitsConnus.has(k.b)) ici(`conflit : b inconnu ${k.b}`);
    }
    // doublonDe doit viser un fait connu, antérieur, et canonique (jamais lui-même un redit).
    for (const f of c.attendu.faits) {
      if (!f.doublonDe) continue;
      if (f.doublonDe === f.id) {
        ici(`${f.id} : doublon de lui-même`);
        continue;
      }
      const cible = faitInfo.get(f.doublonDe);
      if (!cible) {
        ici(`${f.id} : doublon de inconnu ${f.doublonDe}`);
        continue;
      }
      if (cible.doublonDe) {
        ici(
          `${f.id} : doublon de ${f.doublonDe}, qui est lui-même un doublon (viser le fait canonique)`,
        );
        continue;
      }
      if (!(cible.debut < (faitInfo.get(f.id)?.debut ?? Number.NaN)))
        ici(`${f.id} : doublon de ${f.doublonDe}, qui n'est pas antérieur`);
      // Un fait sensible garde sa propre revue à chaque occurrence ; un canonique sensible ou déjà
      // remplacé ne doit pas servir de cible à un dédoublonnage.
      if (f.sensible) ici(`${f.id} : doublon d'un fait sensible, à garder distinct`);
      if (cible.sensible) ici(`${f.id} : doublon de ${f.doublonDe}, qui est sensible`);
      if (anciens.has(f.doublonDe))
        ici(`${f.id} : doublon de ${f.doublonDe}, qui est remplacé par un autre fait`);
    }
  }

  const cles = new Set(jeu.conversations.map((c) => c.cle));
  const miniVus = new Set<string>();
  for (const cle of jeu.mini) {
    if (!cles.has(cle)) problemes.push(`mini.json : conversation inconnue ${cle}`);
    else if (miniVus.has(cle)) problemes.push(`mini.json : ${cle} en double`);
    miniVus.add(cle);
  }

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
