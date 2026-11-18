#!/usr/bin/env node
// Complément du témoin d'Antigravity, pour la conversation d'essai seulement : il donne les NOMS que le témoin masque
// (dossiers et fichiers de la conversation, clés des étapes, noms d'outils, clés des arguments), jamais un texte.
// Un nom ne sort que s'il est fait de lettres, de tirets bas et de points ; un UUID devient un pseudonyme ; un nombre
// reste un nombre. Une valeur ne sort que sous `type`, `source` ou `status`. Tout le reste : un type et une longueur.
//
//   node noms-antigravity.mjs <relevé du témoin (.json)> <dossier ~/.gemini>
//
// Garde : il ne lit que les conversations que le témoin a retenues (leur identifiant et leur variante sont pris dans son
// relevé), et ne suit aucun lien.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const NOM = /^[A-Za-z_.]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VARIANTES = new Set(['antigravity', 'antigravity-ide', 'antigravity-cli']);
const [releve, racine] = process.argv.slice(2);
if (!releve || !racine) {
  console.error('Usage : node noms-antigravity.mjs <relevé du témoin> <dossier ~/.gemini>');
  process.exit(2);
}
const retenues = JSON.parse(readFileSync(releve, 'utf8')).conversations ?? [];
const pseudos = new Map();
const pseudo = (u) => {
  if (!pseudos.has(u)) pseudos.set(u, `<uuid n°${pseudos.size + 1}>`);
  return pseudos.get(u);
};
const nom = (n) => {
  if (UUID.test(n)) return pseudo(n);
  if (/^[0-9]{1,6}$/.test(n) || NOM.test(n)) return n;
  // Un nom composé : ses morceaux de lettres restent, le reste est masqué (un UUID collé à une extension, par exemple).
  const sansExt = n.replace(/\.(jsonl|json|txt|png|md|webp)$/, '');
  const ext = n.slice(sansExt.length);
  return UUID.test(sansExt) ? pseudo(sansExt) + ext : `<nom de ${n.length} caractères>${NOM.test(ext) ? ext : ''}`;
};
const forme = (v) =>
  v === null ? 'null' : Array.isArray(v) ? `tableau[${v.length}]` : typeof v === 'string' ? `chaine(${v.length})` : typeof v;
// Les clés dont la valeur est un mot technique (une énumération) : elle sort si elle n'est faite que de lettres et de
// tirets bas. Un objet imbriqué donne ses clés, sur deux niveaux. Un texte donne en plus les noms de ses balises.
const ENUMS = ['type', 'source', 'status', 'state', 'priority', 'sender', 'TypeName'];
const balises = (s) => [...new Set([...s.matchAll(/<([A-Za-z_]{1,40})>/g)].map((m) => m[1]))];
const valeur = (k, v, p = 0) => {
  if (ENUMS.includes(k) && typeof v === 'string' && /^[A-Za-z_]{1,40}$/.test(v)) return v;
  if (v && typeof v === 'object' && !Array.isArray(v) && p < 2) return cles(v, p + 1);
  if (typeof v === 'string' && balises(v).length > 0) return `${forme(v)} balises ${balises(v).join(',')}`;
  return forme(v);
};
const cles = (o, p = 0) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [NOM.test(k) ? k : `<clé de ${k.length}>`, valeur(k, v, p)]));

function arbre(dossier, rel = '') {
  const out = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, e.name);
    const r = rel ? `${rel}/${nom(e.name)}` : nom(e.name);
    if (e.isSymbolicLink()) out.push({ r: `${r} (lien, non suivi)` });
    else if (e.isDirectory()) out.push(...arbre(chemin, r));
    else if (e.isFile()) out.push({ r, chemin, octets: lstatSync(chemin).size });
  }
  return out;
}

// Les sous-agents d'une conversation retenue : ceux que SON dossier nomme (`.system_generated/subagents/<uuid>.json`).
// Leur conversation, si elle existe dans la même variante, fait partie de l'essai : elle est décrite de même.
const aDecrire = retenues
  .filter((c) => UUID.test(c.conversation) && VARIANTES.has(c.variante))
  .map((c) => ({ id: c.conversation, variante: c.variante, marque: c.retenue_par }));
const vus = new Set();
const json = (chemin) => {
  try {
    return JSON.parse(readFileSync(chemin, 'utf8'));
  } catch {
    return null;
  }
};
for (const c of aDecrire) {
  if (vus.has(c.id)) continue;
  vus.add(c.id);
  const dossier = resolve(racine, c.variante, 'brain', c.id);
  const s = (() => { try { return lstatSync(dossier); } catch { return null; } })();
  if (!s || !s.isDirectory()) {
    console.log(`\n==== conversation ${pseudo(c.id)} (${c.variante}, ${c.marque}) : pas de dossier`);
    continue;
  }
  console.log(`\n==== conversation ${pseudo(c.id)} (${c.variante}, ${c.marque})`);
  const fichiers = arbre(dossier);
  for (const f of fichiers.filter((x) => x.chemin && /\/\.system_generated\/(subagents|messages)\/[^/]+\.json$/.test(x.chemin))) {
    const o = json(f.chemin);
    console.log(`  fiche ${f.r} : ${o && typeof o === 'object' && !Array.isArray(o) ? JSON.stringify(cles(o)) : forme(o)}`);
    const enfant = f.chemin.match(/\/subagents\/([^/]+)\.json$/)?.[1];
    if (enfant && UUID.test(enfant)) aDecrire.push({ id: enfant, variante: c.variante, marque: `sous-agent nommé par ${pseudo(c.id)}` });
  }
  for (const f of fichiers) console.log(`  ${f.r}${f.octets === undefined ? '' : ` : ${f.octets} octets`}`);
  for (const f of fichiers.filter((x) => x.chemin?.endsWith('.jsonl'))) {
    console.log(`\n== ${f.r}`);
    for (const [i, brut] of readFileSync(f.chemin, 'utf8').split('\n').entries()) {
      if (!brut.trim()) continue;
      let e;
      try {
        e = JSON.parse(brut);
      } catch {
        console.log(`étape ${i} : illisible (${brut.length} caractères)`);
        continue;
      }
      const { tool_calls: appels, ...reste } = e;
      console.log(`étape ${i} : ${JSON.stringify(cles(reste))}`);
      for (const a of Array.isArray(appels) ? appels : []) {
        const args = typeof a?.args === 'string' ? (() => { try { return JSON.parse(a.args); } catch { return null; } })() : a?.args;
        console.log(
          `   appel ${typeof a?.name === 'string' && NOM.test(a.name) ? a.name : forme(a?.name)} args ${JSON.stringify(
            args && typeof args === 'object' ? cles(args) : forme(args),
          )}`,
        );
      }
    }
  }
}
