#!/usr/bin/env node
// Complément du témoin de Cursor, pour la session d'essai seulement : il donne les NOMS que le témoin masque (noms
// d'outils, noms des clés d'entrée d'un appel, clés des lignes), jamais une valeur de texte. Un nom ne sort que s'il a la
// forme d'un identifiant ; une valeur ne sort que sous `type`, `role` ou `status`, et seulement si c'est un identifiant
// court. Tout le reste : un type et une longueur. Refuse tout dossier dont le nom ne porte pas le jeton.
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const JETON = 'leon-essai-coulisses';
// Des lettres et des tirets bas seulement : un nom de champ ou d'outil, pas un mot composé ni un identifiant chiffré.
const NOM = /^[A-Za-z_]{1,40}$/;
const COURT = /^[a-z_]{1,24}$/;
const projet = resolve(process.argv[2] ?? '');
if (!basename(projet).includes(JETON) || !basename(realpathSync(projet)).includes(JETON)) {
  console.error('Refusé : le nom du dossier ne porte pas le jeton.');
  process.exit(2);
}
const nom = (k) => (NOM.test(k) ? k : `<nom de ${k.length} caractères>`);
const forme = (v) =>
  v === null ? 'null' : Array.isArray(v) ? `tableau[${v.length}]` : typeof v === 'string' ? `chaine(${v.length})` : typeof v;
const valeur = (k, v) =>
  ['type', 'role', 'status'].includes(k) && typeof v === 'string' && COURT.test(v) ? v : forme(v);
const cles = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [nom(k), valeur(k, v)]));

function fichiers(dossier) {
  const out = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) out.push(...fichiers(chemin));
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(chemin);
  }
  return out;
}

const racine = join(projet, 'agent-transcripts');
for (const [rang, fichier] of fichiers(racine).entries()) {
  const sous = fichier.includes('/subagents/');
  console.log(`\n== fichier ${rang + 1} (${sous ? 'sous-agent' : 'conversation'}, ${statSync(fichier).size} octets)`);
  for (const [i, brut] of readFileSync(fichier, 'utf8').split('\n').entries()) {
    if (!brut.trim()) continue;
    let ligne;
    try {
      ligne = JSON.parse(brut);
    } catch {
      console.log(`ligne ${i + 1} : illisible`);
      continue;
    }
    const { message, ...reste } = ligne;
    console.log(`ligne ${i + 1} : ${JSON.stringify(cles(reste))}`);
    const blocs = Array.isArray(message?.content) ? message.content : [];
    for (const b of blocs) {
      if (b?.type !== 'tool_use') {
        console.log(`   bloc ${JSON.stringify(cles(b ?? {}))}`);
        continue;
      }
      const { input, name, ...autres } = b;
      console.log(
        `   appel ${typeof name === 'string' ? nom(name) : forme(name)} ${JSON.stringify(cles(autres))} entrée ${JSON.stringify(
          input && typeof input === 'object' ? cles(input) : forme(input),
        )}`,
      );
    }
  }
}
