// Sans appel à un modèle : reprend les réponses déjà gardées des résumés de session et les repasse au vrai filtre du
// serveur après avoir remonté les lignes [décision] sous le paragraphe. Écrit chaque sortie comme une variante
// « <modèle>@filtre-decisions » (même réponse, même coût), que noter.ts et tableau.ts traitent comme les autres.
//
// npx tsx docs/etudes/resumes-2026-11/banc/filtre-decisions.ts anthropic/claude-haiku-5.5,z-ai/glm-5.3-flash

import './env-factice';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chargerCas, preparer, RACINE, RESULTATS } from './jeux';

const DECISION = /^\s*-\s*\[d[ée]cision\]/i;
export function decisionsDabord(reponse: string): string {
  const lignes = reponse.split('\n');
  const premiere = lignes.findIndex((l) => /^\s*-\s*\[/.test(l));
  if (premiere === -1) return reponse;
  const items = lignes.slice(premiere);
  return [...lignes.slice(0, premiere), ...items.filter((l) => DECISION.test(l)), ...items.filter((l) => !DECISION.test(l))].join('\n');
}

const slug = (m: string) => m.replace(/[/:]/g, '__');
let ecrites = 0;
for (const modele of (process.argv[2] ?? '').split(',').filter(Boolean)) {
  for (const cas of chargerCas('resume')) {
    const source = join(RESULTATS, 'sorties', 'resume', cas.id, `${slug(modele)}-r1.json`);
    if (!existsSync(source)) continue;
    const s = JSON.parse(readFileSync(source, 'utf8'));
    if (s.erreur) continue;
    const traite = (await preparer('resume', cas as never)).traiter(decisionsDabord(s.reponse));
    const variante = `${modele}@filtre-decisions`;
    writeFileSync(
      join(RESULTATS, 'sorties', 'resume', cas.id, `${slug(variante)}-r1.json`),
      `${JSON.stringify({ ...s, modele: variante, rendu: traite.rendu, mesures: { ...traite.mesures, fin: s.mesures?.fin }, rejoue: true }, null, 2)}\n`,
    );
    ecrites++;
  }
}
console.log(`${ecrites} sorties réécrites.`);
process.exit(0);
