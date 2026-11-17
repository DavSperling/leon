#!/usr/bin/env node
// Complément du témoin de Codex : les NOMS que le témoin masque (types de ligne, noms de champs, noms d'outils).
// N'affiche que des identifiants (lettres, chiffres, _), jamais une valeur libre ni un texte. Refuse tout dossier
// dont le nom ne porte pas le jeton de l'essai, et ne suit aucun lien.
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const JETON = 'leon-essai-coulisses';
const home = resolve(process.argv[2] ?? '');
if (!basename(home).includes(JETON) || !basename(realpathSync(home)).includes(JETON)) {
  console.error('Refusé : pas un dossier d’essai.');
  process.exit(2);
}
const ID = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
const nom = (v) => (typeof v === 'string' && ID.test(v) ? v : v === undefined ? '-' : `<${typeof v}>`);
const cles = (o) => (o !== null && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).map(nom).sort() : []);

function rollouts(dossier) {
  const out = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, e.name);
    if (lstatSync(chemin).isSymbolicLink()) continue;
    if (e.isDirectory()) out.push(...rollouts(chemin));
    else if (e.isFile() && /^rollout-.*\.jsonl$/.test(e.name)) out.push(chemin);
  }
  return out;
}

const formes = new Map();
const note = (etiquette, champ, valeurs) => {
  const f = formes.get(etiquette) ?? { lignes: 0 };
  for (const v of valeurs) (f[champ] ??= new Set()).add(v);
  formes.set(etiquette, f);
  return f;
};
for (const [rang, fichier] of rollouts(join(home, 'sessions')).sort().entries()) {
  for (const brut of readFileSync(fichier, 'utf8').split('\n')) {
    if (!brut.trim()) continue;
    let l;
    try {
      l = JSON.parse(brut);
    } catch {
      continue;
    }
    const p = l.payload;
    const item = p?.item;
    const etiquette = [nom(l.type), nom(p?.type), nom(item?.type)].filter((x) => x !== '-').join('/');
    const f = note(etiquette, 'fichiers', [rang + 1]);
    f.lignes++;
    note(etiquette, 'cles_de_la_ligne', cles(l));
    note(etiquette, 'cles_du_payload', cles(p));
    if (item) note(etiquette, 'cles_de_item', cles(item));
    // Des identifiants techniques seulement : nom d'outil, statut, phase, rôle.
    for (const [champ, v] of [
      ['name', p?.name],
      ['status', p?.status],
      ['role', p?.role],
      ['phase', p?.phase],
      ['item_status', item?.status],
      ['item_tool', item?.tool],
    ]) {
      if (v !== undefined) note(etiquette, champ, [nom(v)]);
    }
    if (nom(l.type) === 'session_meta') {
      note(etiquette, 'cles_de_source', cles(p?.source));
      note(etiquette, 'cles_de_source_subagent', cles(p?.source?.subagent));
      note(etiquette, 'cles_de_thread_spawn', cles(p?.source?.subagent?.thread_spawn));
    }
  }
}
for (const [etiquette, f] of [...formes].sort()) {
  const propre = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v instanceof Set ? [...v] : v]));
  console.log(etiquette, JSON.stringify(propre));
}
