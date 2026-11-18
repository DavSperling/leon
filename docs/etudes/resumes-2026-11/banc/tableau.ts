// Rassemble sorties et vérifications en notes : une note sur 100 par sortie, puis par modèle et par étape, avec le
// coût et le temps mesurés. Écrit resultats/notes.csv et resultats/tableau.md.
//
// npx tsx docs/etudes/resumes-2026-11/banc/tableau.ts [--verificateur openai/gpt-6.1-terra]

import './env-factice';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { chargerCas, cheminVerif, ETAPES, type Etape, RACINE, RESULTATS, type UnCas, type Verif } from './jeux';
import type { AttenduPoint, AttenduReponse, AttenduResume } from './types';

const i = process.argv.indexOf('--verificateur');
const verificateurs = (i > 0 ? (process.argv[i + 1] as string) : 'openai/gpt-6.1-terra').split(',');

// La contre-vérification des fautes (resultats/audit/) : une faute jugée « fausse » à la relecture est retirée ; une
// « douteuse » reste comptée. --sans-audit garde l'avis brut du vérificateur.
const faussesFautes = new Set<string>();
const AUDIT = join(RESULTATS, 'audit');
if (!process.argv.includes('--sans-audit') && existsSync(join(AUDIT, 'cles.json'))) {
  const cles: Record<string, { etape: string; cas: string; verif: string; type: string; element: string }> = JSON.parse(
    readFileSync(join(AUDIT, 'cles.json'), 'utf8'),
  );
  for (const f of readdirSync(AUDIT).filter((f) => f.startsWith('verdicts-'))) {
    for (const v of JSON.parse(readFileSync(join(AUDIT, f), 'utf8')) as Array<{ id: string; verdict: string }>) {
      const c = cles[v.id];
      if (c && v.verdict === 'fausse') faussesFautes.add(`${c.etape}/${c.cas}/${c.verif}#${c.type}#${c.element}`);
    }
  }
}
function sansFaussesFautes(etape: Etape, cas: string, chemin: string, v: Verif): Verif {
  const cle = (type: string, element: string) => `${etape}/${cas}/${basename(chemin)}#${type}#${element}`;
  return {
    ...v,
    interdits: Object.fromEntries(Object.entries(v.interdits ?? {}).map(([k, x]) => [k, faussesFautes.has(cle('interdit', k)) ? 0 : x])),
    contraires: (v.contraires ?? []).filter((k) => !faussesFautes.has(cle('contraire', k))),
  };
}

export type Ligne = {
  etape: Etape;
  cas: string;
  modele: string;
  rep: number;
  note: number | null; // sur 100 ; null : pas encore vérifiée
  couverture: number | null;
  fautes: number | null;
  premierOk: boolean | null;
  cout: number;
  latenceMs: number;
  sortie: number; // jetons de sortie, réflexion comprise
  reflexion: number;
  erreur: boolean;
  detail: string;
};

function noter(etape: Etape, cas: UnCas, s: Record<string, any>): Omit<Ligne, 'etape' | 'cas' | 'modele' | 'rep' | 'cout' | 'latenceMs' | 'sortie' | 'reflexion' | 'erreur'> {
  const m = s.mesures ?? {};
  const a = cas.attendu as AttenduPoint & AttenduResume & AttenduReponse;
  const vide = { couverture: null, fautes: null, premierOk: null };
  if (a.rien) return { ...vide, note: m.rien ? 100 : 0, detail: m.rien ? 'rien : juste' : 'aurait dû ne rien dire' };
  if (etape === 'reponse' && a.pasAssez)
    return { ...vide, note: m.pasAssez ? 100 : 0, detail: m.pasAssez ? 'pas assez : juste' : 'a répondu sans matière' };
  if (etape === 'agenda')
    return { ...vide, note: Math.round(100 * (m.f1 ?? 0)), detail: `rappel ${m.rappel} précision ${m.precision}${m.faux ? ` · faux : ${m.faux}` : ''}${m.manques ? ` · manqués : ${m.manques}` : ''}` };
  if (m.rien || m.vide || (s.rendu ?? '').trim() === '')
    return { note: 0, couverture: 0, fautes: 0, premierOk: false, detail: m.rien ? 'a dit « rien » à tort' : 'sortie vide après filtrage' };
  // Plusieurs vérificateurs : la moyenne de leurs avis.
  const verifs: Verif[] = verificateurs
    .map((v) => cheminVerif(s.chemin as string, v))
    .filter((c) => existsSync(c))
    .map((c) => sansFaussesFautes(etape, cas.id, c, JSON.parse(readFileSync(c, 'utf8'))));
  if (verifs.length === 0) return { ...vide, note: null, detail: 'non vérifiée' };
  const poids = a.faits.reduce((t, f) => t + f.poids, 0);
  const moyenne = (f: (v: Verif) => number) => verifs.reduce((t, v) => t + f(v), 0) / verifs.length;
  const couverture = moyenne((v) => a.faits.reduce((t, f) => t + f.poids * Math.min(1, Number(v.faits?.[f.id] ?? 0)), 0) / poids);
  const fautes = moyenne((v) => Object.values(v.interdits ?? {}).filter((x) => Number(x) >= 1).length + (v.contraires?.length ?? 0));
  const premierOk = etape === 'point' ? moyenne((v) => (v.premier === a.premier ? 1 : 0)) >= 0.5 : null;
  let note = couverture - 0.15 * fautes;
  if (etape === 'point') note = 0.85 * note + (premierOk ? 0.15 : 0);
  if ((m.renvoisInvalides ?? 0) > 0) note -= 0.05;
  if (m.tropLong) note -= 0.05;
  if (verifs.some((v) => v.langueOk === false)) note -= 0.1;
  if (etape === 'discussion' && m.fin === 'limite') note -= 0.1;
  const manques = a.faits.filter((f) => moyenne((v) => Number(v.faits?.[f.id] ?? 0)) < 0.5).map((f) => f.id);
  const pris = a.interdits.filter((f) => moyenne((v) => Number(v.interdits?.[f.id] ?? 0)) >= 0.5).map((f) => f.id);
  return {
    note: Math.round(100 * Math.max(0, Math.min(1, note))),
    couverture: Number(couverture.toFixed(3)),
    fautes: Number(fautes.toFixed(2)),
    premierOk,
    detail: [manques.length ? `manque ${manques.join(',')}` : '', pris.length ? `piège ${pris.join(',')}` : '', etape === 'point' && !premierOk ? 'mauvaise première puce' : '']
      .filter(Boolean)
      .join(' · '),
  };
}

export function lignes(): Ligne[] {
  const out: Ligne[] = [];
  for (const etape of ETAPES) {
    for (const cas of chargerCas(etape)) {
      const dossier = join(RESULTATS, 'sorties', etape, cas.id);
      if (!existsSync(dossier)) continue;
      for (const f of readdirSync(dossier).filter((f) => f.endsWith('.json'))) {
        const chemin = join(dossier, f);
        const s = { ...JSON.parse(readFileSync(chemin, 'utf8')), chemin };
        const base = {
          etape,
          cas: cas.id,
          modele: s.modele as string,
          rep: s.rep as number,
          cout: s.cout ?? 0,
          latenceMs: s.latenceMs ?? 0,
          sortie: s.usage?.sortie ?? 0,
          reflexion: s.usage?.reflexion ?? 0,
          erreur: Boolean(s.erreur),
        };
        if (s.erreur) out.push({ ...base, note: 0, couverture: null, fautes: null, premierOk: null, detail: `erreur : ${String(s.erreur).slice(0, 80)}` });
        else out.push({ ...base, ...noter(etape, cas, s) });
      }
    }
  }
  return out;
}

const moy = (xs: number[]) => (xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length);
const fmt = (x: number, d = 0) => (Number.isNaN(x) ? '–' : x.toFixed(d));

if (import.meta.url === `file://${process.argv[1]}`) {
  const toutes = lignes();
  writeFileSync(
    join(RESULTATS, 'notes.csv'),
    [
      'etape;cas;modele;rep;note;couverture;fautes;premierOk;cout;latenceMs;sortie;reflexion;erreur;detail',
      ...toutes.map((l) => [l.etape, l.cas, l.modele, l.rep, l.note ?? '', l.couverture ?? '', l.fautes ?? '', l.premierOk ?? '', l.cout.toFixed(6), l.latenceMs, l.sortie, l.reflexion, l.erreur, l.detail.replace(/;/g, ',')].join(';')),
    ].join('\n'),
  );
  const md: string[] = ['# Tableau des notes (généré par banc/tableau.ts)', '', `Vérificateur(s) : ${verificateurs.join(', ')}`, `Fautes retirées après contre-vérification : ${faussesFautes.size}`, ''];
  for (const etape of ETAPES) {
    const ici = toutes.filter((l) => l.etape === etape);
    if (ici.length === 0) continue;
    const modeles = [...new Set(ici.map((l) => l.modele))];
    const rangs = modeles
      .map((m) => {
        const ls = ici.filter((l) => l.modele === m);
        const notees = ls.filter((l) => l.note !== null);
        // La stabilité : l'écart moyen de note entre deux passages du même cas.
        const ecarts = [...new Set(ls.map((l) => l.cas))].flatMap((c) => {
          const n = ls.filter((l) => l.cas === c && l.note !== null).map((l) => l.note as number);
          return n.length >= 2 ? [Math.max(...n) - Math.min(...n)] : [];
        });
        return {
          m,
          note: moy(notees.map((l) => l.note as number)),
          verifiees: notees.length,
          total: ls.length,
          cout: moy(ls.filter((l) => !l.erreur).map((l) => l.cout)),
          latence: moy(ls.filter((l) => !l.erreur).map((l) => l.latenceMs)) / 1000,
          sortie: moy(ls.filter((l) => !l.erreur).map((l) => l.sortie)),
          fautes: moy(notees.filter((l) => l.fautes !== null).map((l) => l.fautes as number)),
          premier: etape === 'point' ? moy(notees.filter((l) => l.premierOk !== null).map((l) => (l.premierOk ? 1 : 0))) : Number.NaN,
          erreurs: ls.filter((l) => l.erreur).length,
          ecart: moy(ecarts),
        };
      })
      .sort((a, b) => (Number.isNaN(b.note) ? -1 : b.note) - (Number.isNaN(a.note) ? -1 : a.note));
    md.push(`## ${etape}`, '', '| modèle | note /100 | fautes par sortie | 1re puce juste | coût par appel | 1 000 appels | temps (s) | jetons de sortie | écart entre passages | erreurs | notées |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rangs)
      md.push(`| ${r.m} | ${fmt(r.note)} | ${fmt(r.fautes, 2)} | ${etape === 'point' ? `${fmt(100 * r.premier)} %` : '–'} | ${fmt(r.cout * 100, 3)} c | ${fmt(r.cout * 1000, 2)} $ | ${fmt(r.latence, 1)} | ${fmt(r.sortie)} | ${fmt(r.ecart)} | ${r.erreurs} | ${r.verifiees}/${r.total} |`);
    md.push('');
  }
  writeFileSync(join(RESULTATS, 'tableau.md'), md.join('\n'));
  console.log(md.join('\n'));
}
