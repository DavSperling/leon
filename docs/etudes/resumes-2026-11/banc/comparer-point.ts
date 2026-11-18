// Compare deux consignes du point du matin sur les mêmes cas (jeux/ et jeux-validation/) : la longueur, l'essentiel
// gardé (faits de poids 3, puis 2), les fautes, la première puce, d'après les vérifications de noter.ts ; puis un
// duel à l'aveugle par cas et par passage : deux juges d'une autre famille que Sonnet disent laquelle la personne
// préférerait recevoir. Les duels déjà jugés ne sont pas refaits. Écrit resultats/<série>/comparaison.md.
//
// SERIE=point-court npx tsx docs/etudes/resumes-2026-11/banc/comparer-point.ts --a actuel --b court [--budget 0.5]
// Les duels sont rangés dans resultats/<série>/duels/<a>-contre-<b>/, le tableau dans comparaison-<a>-contre-<b>.md.

import './env-factice';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cheminVerif, RACINE, RESULTATS, type Verif } from './jeux';
import { appeler } from './openrouter';
import type { AttenduPoint } from './types';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set((process.argv[i] as string).slice(2), process.argv[i + 1] ?? '');
const A = args.get('a') ?? 'actuel';
const B = args.get('b') ?? 'court';
const budget = Number(args.get('budget') ?? 0.5);
const MODELE = 'anthropic__claude-sonnet-5.5';
const VERIFICATEURS = ['openai/gpt-6.1-terra', 'google/gemini-4-hydrogen'];
const JUGES = ['openai/gpt-6.1-terra', 'google/gemini-4-hydrogen'];

type Cas = { id: string; langue: string; attendu: AttenduPoint };
const cas: Cas[] = ['jeux', 'jeux-validation'].flatMap((j) => {
  const dossier = join(RACINE, j, 'point');
  return readdirSync(dossier)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dossier, f), 'utf8')) as Cas);
});

type Mesure = { mots: number; puces: number; essentiel: number | null; important: number | null; couverture: number | null; fautes: number | null; premierOk: boolean | null; rien: boolean };
function mesurer(c: Cas, variante: string, rep: number): (Mesure & { rendu: string }) | null {
  const chemin = join(RESULTATS, 'sorties', 'point', c.id, `${MODELE}@${variante}-r${rep}.json`);
  if (!existsSync(chemin)) return null;
  const s = JSON.parse(readFileSync(chemin, 'utf8'));
  if (s.erreur) return null;
  const verifs = VERIFICATEURS.map((v) => cheminVerif(chemin, v))
    .filter((p) => existsSync(p))
    .map((p) => JSON.parse(readFileSync(p, 'utf8')) as Verif);
  const base = { rendu: s.rendu as string, mots: s.mesures.mots as number, puces: s.mesures.puces as number, rien: Boolean(s.mesures.rien) };
  const a = c.attendu;
  if (a.rien || verifs.length === 0) return { ...base, essentiel: null, important: null, couverture: null, fautes: null, premierOk: null };
  const moyenne = (f: (v: Verif) => number) => verifs.reduce((t, v) => t + f(v), 0) / verifs.length;
  // La part pondérée des faits d'au moins ce poids que la sortie dit (1, 0,5 ou 0 par fait).
  const part = (min: number) => {
    const faits = a.faits.filter((f) => f.poids >= min);
    const total = faits.reduce((t, f) => t + f.poids, 0);
    return moyenne((v) => faits.reduce((t, f) => t + f.poids * Math.min(1, Number(v.faits?.[f.id] ?? 0)), 0) / total);
  };
  return {
    ...base,
    essentiel: part(3),
    important: part(2),
    couverture: part(1),
    fautes: moyenne((v) => Object.values(v.interdits ?? {}).filter((x) => Number(x) >= 1).length + (v.contraires?.length ?? 0)),
    premierOk: moyenne((v) => (v.premier === a.premier ? 1 : 0)) >= 0.5,
  };
}

const SYSTEME = `Tu juges deux versions du point du matin qu'un outil prépare pour une personne au travail : quelques lignes qu'elle lit en commençant sa journée. Chaque ligne renvoie à ses sources (les numéros entre crochets), qu'elle ouvre d'un clic quand elle veut le détail.

Un bon point dit ce qui compte vraiment pour elle aujourd'hui (ce qu'elle doit faire, décider ou savoir), juste et sans rien oublier d'important, et rien d'autre : il se lit d'un coup d'œil. Un détail que la source donne déjà est du bruit qui cache l'essentiel. Un fait important qui manque, ou qui est faux, est une faute grave, plus grave que du bruit.

Tu reçois ce qui compte vraiment dans ce cas (établi à l'avance par quelqu'un qui connaît toute l'histoire), ce qui ne doit pas y être, puis les deux versions, A et B. Réponds seulement par un objet JSON : {"prefere": "A" | "B" | "egal", "raison": "<une phrase>"}.`;

const DUELS = join(RESULTATS, 'duels');
mkdirSync(join(DUELS, `${A}-contre-${B}`), { recursive: true });
let depense = 0;
type Duel = { cas: string; rep: number; juge: string; gagnant: string | null; raison: string };
const duels: Duel[] = [];
const taches: Array<() => Promise<void>> = [];
for (const c of cas) {
  if (c.attendu.rien) continue;
  for (const rep of [1, 2]) {
    const a = mesurer(c, A, rep);
    const b = mesurer(c, B, rep);
    if (!a || !b) continue;
    // L'ordre de présentation tiré du cas et du passage : le même à chaque relance, A en premier une fois sur deux.
    const aDabord = createHash('sha256').update(`${c.id}-${rep}`).digest()[0]! % 2 === 0;
    const [premier, second] = aDabord ? [a, b] : [b, a];
    const corps = [
      'Ce qui compte vraiment :',
      ...c.attendu.faits.filter((f) => f.poids >= 2).map((f) => `- ${f.texte}${f.poids === 3 ? ' (indispensable)' : ''}`),
      '',
      'Ce qui ne doit pas y être :',
      ...c.attendu.interdits.map((f) => `- ${f.texte}`),
      '',
      `<point id="A">\n${premier.rendu}\n</point>`,
      '',
      `<point id="B">\n${second.rendu}\n</point>`,
    ].join('\n');
    for (const juge of JUGES) {
      const fichier = join(DUELS, `${A}-contre-${B}`, `${c.id}-r${rep}.${juge.replace('/', '__')}.json`);
      const lire = () => {
        const d = JSON.parse(readFileSync(fichier, 'utf8')) as { prefere: string; raison: string; aDabord: boolean };
        const lettre = d.prefere === 'A' || d.prefere === 'B' ? d.prefere : null;
        const gagnant = lettre === null ? null : (lettre === 'A') === d.aDabord ? A : B;
        duels.push({ cas: c.id, rep, juge, gagnant, raison: d.raison });
      };
      if (existsSync(fichier)) {
        lire();
        continue;
      }
      taches.push(async () => {
        if (depense >= budget) return;
        const r = await appeler({ modele: juge, messages: [{ role: 'system', content: SYSTEME }, { role: 'user', content: corps }], maxTokens: 4000, effort: 'low' });
        depense += r.usage.cout;
        const json = r.texte.match(/\{[\s\S]*\}/)?.[0];
        if (!json) throw new Error(`${juge} sur ${c.id} r${rep} : pas de JSON (${r.texte.slice(0, 80)})`);
        writeFileSync(fichier, `${JSON.stringify({ ...JSON.parse(json), aDabord, cout: r.usage.cout }, null, 2)}\n`);
        lire();
      });
    }
  }
}
const file = [...taches];
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let t = file.shift(); t; t = file.shift()) await t().catch((e) => console.error((e as Error).message));
}));

// --- le tableau ---
const med = (xs: number[]) => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length === 0 ? 0 : s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const moy = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((t, x) => t + x, 0) / xs.length);
const pct = (x: number) => `${Math.round(100 * x)} %`;
const lignes: string[] = [`# Point du matin : « ${A} » contre « ${B} » (généré par banc/comparer-point.ts)`, ''];
lignes.push(`Sonnet 5.5, ${cas.length} cas (jeux/ et jeux-validation/), 2 passages par cas. Faits vérifiés par ${VERIFICATEURS.join(' et ')} (moyenne, sans contre-vérification) ; duels jugés à l'aveugle par ${JUGES.join(' et ')}.`, '');
lignes.push('| consigne | mots (médiane) | mots (max) | puces (médiane) | essentiel gardé (poids 3) | important gardé (poids 2-3) | tous les faits | fautes par point | 1re puce juste | « rien » juste |', '|---|---|---|---|---|---|---|---|---|---|');
for (const v of [A, B]) {
  const ms = cas.flatMap((c) => [1, 2].map((r) => ({ c, m: mesurer(c, v, r) }))).filter((x) => x.m !== null) as Array<{ c: Cas; m: Mesure }>;
  const notes = ms.filter((x) => x.m.essentiel !== null).map((x) => x.m);
  const riens = ms.filter((x) => x.c.attendu.rien);
  lignes.push(
    `| ${v} | ${med(ms.map((x) => x.m.mots))} | ${Math.max(...ms.map((x) => x.m.mots))} | ${med(ms.map((x) => x.m.puces))} | ${pct(moy(notes.map((m) => m.essentiel!)))} | ${pct(moy(notes.map((m) => m.important!)))} | ${pct(moy(notes.map((m) => m.couverture!)))} | ${moy(notes.map((m) => m.fautes!)).toFixed(2)} | ${pct(moy(notes.map((m) => (m.premierOk ? 1 : 0))))} | ${riens.filter((x) => x.m.rien).length}/${riens.length} |`,
  );
}
lignes.push('', '## Duels à l\'aveugle', '', `| juge | ${A} préféré | ${B} préféré | égal ou sans réponse |`, '|---|---|---|---|');
for (const juge of JUGES) {
  const d = duels.filter((x) => x.juge === juge);
  lignes.push(`| ${juge} | ${d.filter((x) => x.gagnant === A).length} | ${d.filter((x) => x.gagnant === B).length} | ${d.filter((x) => x.gagnant === null).length} |`);
}
lignes.push('', '## Par cas', '', `| cas | passage | mots ${A} → ${B} | essentiel ${A} → ${B} | fautes ${A} → ${B} | duels (gagnant par juge) |`, '|---|---|---|---|---|---|');
const f = (x: number | null) => (x === null ? '–' : pct(x));
for (const c of cas) {
  for (const rep of [1, 2]) {
    const a = mesurer(c, A, rep);
    const b = mesurer(c, B, rep);
    if (!a || !b) continue;
    const d = duels.filter((x) => x.cas === c.id && x.rep === rep).map((x) => x.gagnant ?? '=').join(', ');
    lignes.push(`| ${c.id} | ${rep} | ${a.mots} → ${b.mots} | ${f(a.essentiel)} → ${f(b.essentiel)} | ${a.fautes?.toFixed(1) ?? '–'} → ${b.fautes?.toFixed(1) ?? '–'} | ${d || (c.attendu.rien ? 'cas « rien »' : '')} |`);
  }
}
lignes.push('', '## Raisons des juges quand la version courte perd', '');
for (const d of duels.filter((x) => x.gagnant === A)) lignes.push(`- ${d.cas} r${d.rep} (${d.juge}) : ${d.raison}`);
const sortie = join(RESULTATS, `comparaison-${A}-contre-${B}.md`);
writeFileSync(sortie, `${lignes.join('\n')}\n`);
console.log(`${duels.length} duels, ${depense.toFixed(3)} $ dépensés. → ${sortie}`);
process.exit(0);
