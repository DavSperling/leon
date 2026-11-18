// Analyses sans appel à un modèle, sur les sorties déjà gardées : langue des sorties, décisions perdues par la borne
// du serveur sur le résumé (1 200 caractères dans l'ordre du modèle en v1 ; 1 500, décisions d'abord, depuis v2), part de la réflexion dans les jetons facturés, temps de réponse. Écrit
// resultats/analyses.md.
//
// npx tsx docs/etudes/resumes-2026-11/banc/analyses.ts

import './env-factice';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chargerCas, ETAPES, preparer, RACINE, RESULTATS } from './jeux';
import type { CasResume } from './types';

const FR = /\b(je|tu|il|nous|vous|est|pas|les|des|une|pour|avec|dans|sur|que|qui|mais|ça|c'est|reste|fait)\b/giu;
const EN = /\b(i|you|we|is|are|not|the|and|for|with|this|that|what|but|it's|still|has|have|was)\b/giu;
const langue = (t: string) => ((t.match(FR)?.length ?? 0) > (t.match(EN)?.length ?? 0) ? 'fr' : 'en');
// Le texte écrit par le modèle, sans les titres et les balises du format (« ## Où j'en suis », « [prochaine-étape] »).
const prose = (t: string) =>
  t
    .split('\n')
    .filter((l) => !/^##\s|\[\[/.test(l))
    .join(' ')
    .replace(/\[[^\]]*\]/g, ' ');

type S = Record<string, any>;
const sorties: Array<S & { etape: string }> = [];
for (const etape of ETAPES) {
  for (const cas of chargerCas(etape)) {
    const dossier = join(RESULTATS, 'sorties', etape, cas.id);
    if (!existsSync(dossier)) continue;
    for (const f of readdirSync(dossier).filter((f) => f.endsWith('.json'))) {
      const s = JSON.parse(readFileSync(join(dossier, f), 'utf8'));
      if (!s.erreur) sorties.push({ ...s, etape, cas: cas.id, attendue: cas.langue, casEntier: cas });
    }
  }
}

const md: string[] = ['# Analyses sans modèle (générées par banc/analyses.ts)', ''];
const pct = (a: number, b: number) => (b === 0 ? '–' : `${Math.round((100 * a) / b)} %`);
const modeles = (liste: S[]) => [...new Set(liste.map((s) => s.modele as string))].sort();

// 1. La langue : une sortie dans une autre langue que celle des messages de l'utilisateur.
md.push('## Sorties dans la mauvaise langue', '', 'Comptées seulement sur les sorties en prose d\'au moins 15 mots, hors « rien à retenir ».', '');
md.push('| étape | modèle | cas anglais mal écrits | cas français mal écrits |', '|---|---|---|---|');
for (const etape of ['point', 'resume', 'fil', 'reponse', 'discussion']) {
  const ici = sorties.filter((s) => s.etape === etape && prose(s.rendu ?? '').split(/\s+/).length >= 15 && !s.mesures?.rien && !s.mesures?.pasAssez);
  for (const m of modeles(ici)) {
    const ls = ici.filter((s) => s.modele === m);
    const en = ls.filter((s) => s.attendue === 'en');
    const fr = ls.filter((s) => s.attendue === 'fr');
    const malEn = en.filter((s) => langue(prose(s.rendu)) !== 'en').length;
    const malFr = fr.filter((s) => langue(prose(s.rendu)) !== 'fr').length;
    md.push(`| ${etape} | ${m} | ${malEn}/${en.length} | ${malFr}/${fr.length} |`);
  }
}
md.push('');

// 2. Le résumé : les décisions valables écrites par le modèle et retirées par la borne du serveur.
md.push('## Résumé de session : décisions perdues à la borne du serveur', '');
md.push(
  'Une décision « valable » cite une source qui peut la prouver (PR, commit, message tapé par la personne). Série v1 : le serveur gardait le paragraphe, puis les lignes dans l\'ordre du modèle, jusqu\'à 1 200 caractères ; les décisions, écrites en dernier, tombaient les premières. Depuis v2 : 1 500 caractères, décisions gardées d\'abord. La dernière colonne compte les résumés plus longs que les 1 200 caractères demandés par le prompt.',
  '',
  '| modèle | décisions valables écrites | gardées | perdues à la borne | résumés de plus de 1 200 caractères (brut) |',
  '|---|---|---|---|---|',
);
const resumes = sorties.filter((s) => s.etape === 'resume' && !s.mesures?.rien);
for (const m of modeles(resumes)) {
  let ecrites = 0;
  let gardees = 0;
  let longs = 0;
  const ls = resumes.filter((s) => s.modele === m);
  for (const s of ls) {
    const cas = s.casEntier as CasResume;
    const preuves = new Set([
      ...cas.entree.faits.prs.map((p) => `${p.repo}#${p.numero}`),
      ...cas.entree.faits.commits,
      ...cas.entree.tours.filter((t) => t.role === 'user' && t.injecte === false).map((t) => t.id),
    ]);
    const valables = (s.reponse as string)
      .split('\n')
      .filter((l) => /^\s*-\s*\[d[ée]cision\]/i.test(l) && preuves.has(/\(source:\s*([^()\s]+)\)\s*$/.exec(l)?.[1] ?? ''));
    ecrites += valables.length;
    gardees += s.mesures?.decisions ?? 0;
    if ((s.reponse as string).trim().length > 1200) longs++;
  }
  md.push(`| ${m} | ${ecrites} | ${gardees} | ${ecrites - gardees} | ${longs}/${ls.length} |`);
}
md.push('');

// 2 bis. La même réponse, passée au vrai filtre du serveur après avoir remonté les [décision] juste sous le paragraphe :
// ce que gagnerait un filtre qui garde les décisions d'abord, et ce qu'il ferait perdre aux autres lignes.
md.push(
  '### Si le serveur gardait les décisions d\'abord',
  '',
  'Même réponse du modèle, même filtre du serveur, seules les lignes [décision] remontées sous le paragraphe. Longueur brute : médiane des réponses avant le filtre.',
  '',
  '| modèle | décisions gardées (aujourd\'hui → d\'abord) | [prochaine-étape] gardées (aujourd\'hui → d\'abord) | longueur brute médiane |',
  '|---|---|---|---|',
);
const DECISION = /^\s*-\s*\[d[ée]cision\]/i;
const decisionsDabord = (r: string) => {
  const lignes = r.split('\n');
  const premiere = lignes.findIndex((l) => /^\s*-\s*\[/.test(l));
  if (premiere === -1) return r;
  const avant = lignes.slice(0, premiere);
  const items = lignes.slice(premiere);
  return [...avant, ...items.filter((l) => DECISION.test(l)), ...items.filter((l) => !DECISION.test(l))].join('\n');
};
const compter = (rendu: string, tag: string) => rendu.split('\n').filter((l) => l.startsWith(`- [${tag}]`)).length;
for (const m of modeles(resumes)) {
  const ls = resumes.filter((s) => s.modele === m);
  let dAvant = 0;
  let dApres = 0;
  let pAvant = 0;
  let pApres = 0;
  const longueurs: number[] = [];
  for (const s of ls) {
    const p = await preparer('resume', s.casEntier);
    const avant = p.traiter(s.reponse).rendu;
    const apres = p.traiter(decisionsDabord(s.reponse)).rendu;
    dAvant += compter(avant, 'décision');
    dApres += compter(apres, 'décision');
    pAvant += compter(avant, 'prochaine-étape');
    pApres += compter(apres, 'prochaine-étape');
    longueurs.push((s.reponse as string).trim().length);
  }
  longueurs.sort((a, b) => a - b);
  md.push(`| ${m} | ${dAvant} → ${dApres} | ${pAvant} → ${pApres} | ${longueurs[Math.floor(longueurs.length / 2)]} |`);
}
md.push('');

// 3. La réflexion : la part des jetons de sortie facturés qui ne sont pas du texte rendu.
md.push('## Part de la réflexion dans les jetons de sortie', '', '| étape | modèle | jetons de sortie (moyenne) | dont réflexion |', '|---|---|---|---|');
for (const etape of ETAPES) {
  const ici = sorties.filter((s) => s.etape === etape && s.usage);
  for (const m of modeles(ici)) {
    const ls = ici.filter((s) => s.modele === m);
    const sortie = ls.reduce((t, s) => t + s.usage.sortie, 0);
    const reflexion = ls.reduce((t, s) => t + s.usage.reflexion, 0);
    md.push(`| ${etape} | ${m} | ${Math.round(sortie / ls.length)} | ${pct(reflexion, sortie)} |`);
  }
}
md.push('');

// 4. Le temps : la réponse en tête s'affiche pendant que la personne attend.
md.push('## Temps de réponse (secondes)', '', '| étape | modèle | médiane | 9e décile |', '|---|---|---|---|');
for (const etape of ETAPES) {
  const ici = sorties.filter((s) => s.etape === etape);
  for (const m of modeles(ici)) {
    const t = ici
      .filter((s) => s.modele === m)
      .map((s) => s.latenceMs / 1000)
      .sort((a, b) => a - b);
    const q = (p: number) => t[Math.min(t.length - 1, Math.floor(p * t.length))]?.toFixed(1);
    md.push(`| ${etape} | ${m} | ${q(0.5)} | ${q(0.9)} |`);
  }
}
writeFileSync(join(RESULTATS, 'analyses.md'), md.join('\n'));
console.log(md.join('\n'));
process.exit(0);
