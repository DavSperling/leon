// Prépare la contre-vérification à l'aveugle des fautes relevées par les vérificateurs : chaque interdit compté et
// chaque fait contredit devient un élément à relire, sans le nom du modèle ni celui du vérificateur, avec la sortie
// telle que la personne la lirait. Écrit resultats/<série>/audit/a-relire-point.json, a-relire-autres.json et
// cles.json (qui relie chaque id à sa vérification). Le relecteur écrit verdicts-point.json et verdicts-autres.json
// ({ id, verdict: "vraie" | "fausse" | "douteuse", raison }) ; tableau.ts retire les fautes jugées fausses.
//
// SERIE=validation JEUX=jeux-validation npx tsx docs/etudes/resumes-2026-11/banc/a-relire.ts

import './env-factice';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chargerCas, ETAPES, RESULTATS } from './jeux';

type Texte = { id: string; texte: string };
type Verif = { interdits?: Record<string, number>; contraires?: string[] };

const AUDIT = join(RESULTATS, 'audit');
mkdirSync(AUDIT, { recursive: true });
const cles: Record<string, { etape: string; cas: string; verif: string; type: string; element: string }> = {};
const groupes: Record<'point' | 'autres', unknown[]> = { point: [], autres: [] };
let n = 0;

for (const etape of ETAPES) {
  for (const cas of chargerCas(etape)) {
    const attendu = cas.attendu as { faits?: Texte[]; interdits?: Texte[]; pieges?: string[] };
    const dossier = join(RESULTATS, 'verifs', etape, cas.id);
    if (!existsSync(dossier)) continue;
    for (const verif of readdirSync(dossier).filter((f) => f.endsWith('.json'))) {
      const v = JSON.parse(readFileSync(join(dossier, verif), 'utf8')) as Verif;
      // « <modèle>-r1.<vérificateur>.json » : les deux noms peuvent contenir des points (gpt-6.1-terra).
      const sortie = join(RESULTATS, 'sorties', etape, cas.id, verif.replace(/(-r\d+)\..*\.json$/, '$1.json'));
      if (!existsSync(sortie)) continue;
      const { reponse, rendu } = JSON.parse(readFileSync(sortie, 'utf8')) as { reponse: unknown; rendu?: unknown };
      const texte = typeof rendu === 'string' ? rendu : typeof reponse === 'string' ? reponse : JSON.stringify(reponse);
      const fautes = [
        ...Object.entries(v.interdits ?? {})
          .filter(([, x]) => x > 0)
          .map(([k]) => ({ type: 'interdit', k, element: attendu.interdits?.find((i) => i.id === k)?.texte })),
        ...(v.contraires ?? []).map((k) => ({
          type: 'contraire',
          k,
          element: `Contredit ce fait attendu : ${attendu.faits?.find((f) => f.id === k)?.texte}`,
        })),
      ];
      for (const f of fautes) {
        n += 1;
        const id = `V${String(n).padStart(3, '0')}`;
        cles[id] = { etape, cas: cas.id, verif, type: f.type, element: f.k };
        groupes[etape === 'point' ? 'point' : 'autres'].push({
          id,
          etape,
          cas: cas.id,
          langue: cas.langue,
          pieges: attendu.pieges ?? [],
          type: f.type,
          element: f.element ?? f.k,
          texte,
        });
      }
    }
  }
}

writeFileSync(join(AUDIT, 'cles.json'), `${JSON.stringify(cles, null, 2)}\n`);
for (const [nom, items] of Object.entries(groupes)) {
  writeFileSync(join(AUDIT, `a-relire-${nom}.json`), `${JSON.stringify(items, null, 2)}\n`);
}
console.log(`${n} fautes à relire : ${groupes.point.length} au point, ${groupes.autres.length} ailleurs (${AUDIT}).`);
