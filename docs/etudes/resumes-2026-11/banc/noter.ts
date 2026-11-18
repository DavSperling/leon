// Note les sorties contre l'attendu de chaque cas. Un modèle vérificateur reçoit les faits attendus et les interdits,
// puis plusieurs sorties anonymes du même cas (mélangées), et dit pour chacune ce qu'elle contient. Il ne juge pas le
// style : il pointe. Les cas « rien », « pas assez » et l'agenda se notent sans modèle.
// Une vérification déjà faite n'est pas refaite.
//
// npx tsx docs/etudes/resumes-2026-11/banc/noter.ts --verificateur openai/gpt-6.1-terra [--etapes …] [--budget 1]

import './env-factice';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chargerCas, cheminVerif, ETAPES, type Etape, RACINE, RESULTATS, type UnCas, type Verif } from './jeux';
import { appeler } from './openrouter';
import type { AttenduPoint, Fait, Interdit } from './types';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set((process.argv[i] as string).slice(2), process.argv[i + 1] ?? '');
const verificateur = args.get('verificateur') ?? 'openai/gpt-6.1-terra';
const etapes = (args.get('etapes')?.split(',') ?? [...ETAPES]) as Etape[];
const budget = Number(args.get('budget') ?? 1);
const conc = Number(args.get('conc') ?? 4);
const PAQUET = 6;

const SYSTEME = `Tu es un correcteur rigoureux et impartial. On te donne une liste de faits attendus et d'éléments interdits pour une tâche de résumé, puis plusieurs textes produits par des systèmes différents, nommés T1, T2…

Pour chaque texte, indique :
- pour chaque fait attendu : 1 si le texte l'affirme clairement (avec d'autres mots, dans une autre langue, ou fondu dans une phrase plus large, peu importe), 0.5 s'il l'affirme en partie ou trop vaguement pour qu'un lecteur le comprenne, 0 s'il ne le dit pas ;
- pour chaque élément interdit : 1 si le texte le dit ou le fait (même reformulé), 0 sinon ;
- contraires : les ids des faits attendus que le texte contredit (une date, un état, une personne différents) ;
- premier : l'id du fait attendu exprimé par la PREMIÈRE puce ou la première phrase d'information du texte (les titres ne comptent pas), ou null si elle n'en exprime aucun ;
- langueOk : true si le texte est écrit dans la langue attendue.

Sois strict sur le sens, indulgent sur la forme. Un renvoi comme [2] ne compte pas. Juge chaque texte seul, sans le comparer aux autres.

Réponds uniquement par un objet JSON : {"T1": {"faits": {"f1": 1, …}, "interdits": {"x1": 0, …}, "contraires": [], "premier": "f1", "langueOk": true}, "T2": …}`;

function prompt(cas: UnCas, textes: string[]): string {
  const faits = cas.attendu.faits.map((f: Fait) => `- ${f.id} : ${f.texte}`).join('\n');
  const interdits = cas.attendu.interdits.map((f: Interdit) => `- ${f.id} : ${f.texte}`).join('\n') || '(aucun)';
  return [
    `Langue attendue : ${{ fr: 'français', en: 'anglais', de: 'allemand', es: 'espagnol' }[cas.langue]}.`,
    '',
    'Faits attendus :',
    faits,
    '',
    'Éléments interdits :',
    interdits,
    '',
    ...textes.map((t, i) => `<T${i + 1}>\n${t.trim() === '' ? '(texte vide)' : t}\n</T${i + 1}>`),
  ].join('\n');
}

function lireJson(texte: string): Record<string, Verif> | null {
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut === -1 || fin === -1) return null;
  try {
    return JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    return null;
  }
}

// Les sorties à vérifier, par cas.
type Sortie = { chemin: string; rendu: string };
const aFaire: Array<{ etape: Etape; cas: UnCas; sorties: Sortie[] }> = [];
for (const etape of etapes) {
  if (etape === 'agenda') continue;
  for (const cas of chargerCas(etape)) {
    const a = cas.attendu as AttenduPoint & { pasAssez?: boolean };
    if (a.rien || a.pasAssez) continue;
    const dossier = join(RESULTATS, 'sorties', etape, cas.id);
    if (!existsSync(dossier)) continue;
    const sorties: Sortie[] = [];
    for (const f of readdirSync(dossier).filter((f) => f.endsWith('.json'))) {
      const chemin = join(dossier, f);
      const s = JSON.parse(readFileSync(chemin, 'utf8'));
      if (s.erreur || existsSync(cheminVerif(chemin, verificateur))) continue;
      sorties.push({ chemin, rendu: s.rendu ?? '' });
    }
    // Mélangées, pour qu'un modèle n'ait pas toujours la même place.
    sorties.sort(() => Math.random() - 0.5);
    for (let i = 0; i < sorties.length; i += PAQUET) aFaire.push({ etape, cas, sorties: sorties.slice(i, i + PAQUET) });
  }
}

let depense = 0;
let n = 0;
async function ouvrier() {
  for (;;) {
    const paquet = aFaire.shift();
    if (!paquet) return;
    if (depense >= budget) continue;
    const { cas, sorties } = paquet;
    try {
      const r = await appeler({
        modele: verificateur,
        messages: [
          { role: 'system', content: SYSTEME },
          { role: 'user', content: prompt(cas, sorties.map((s) => s.rendu)) },
        ],
        maxTokens: 12000,
        effort: 'low',
      });
      depense += r.usage.cout;
      const json = lireJson(r.texte);
      if (!json) throw new Error(`JSON illisible : ${r.texte.slice(0, 200)}`);
      sorties.forEach((s, i) => {
        const v = json[`T${i + 1}`];
        if (!v) return;
        const chemin = cheminVerif(s.chemin, verificateur);
        mkdirSync(dirname(chemin), { recursive: true });
        writeFileSync(chemin, `${JSON.stringify({ verificateur, ...v }, null, 2)}\n`);
      });
      n += sorties.length;
      console.log(`${paquet.etape}/${cas.id} : ${sorties.length} sorties vérifiées (${depense.toFixed(3)} $)`);
    } catch (e) {
      console.log(`${paquet.etape}/${cas.id} : ÉCHEC ${(e as Error).message.slice(0, 200)}`);
    }
  }
}
await Promise.all(Array.from({ length: conc }, ouvrier));
console.log(`\n${n} sorties vérifiées par ${verificateur}, ${depense.toFixed(3)} $.`);
process.exit(0);
