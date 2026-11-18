// Lance les modèles sur les jeux d'essai et garde chaque sortie dans resultats/sorties/<étape>/<cas>/<modèle>-r<n>.json.
// Une sortie déjà là (sans erreur) n'est jamais refaite : relancer ne repaie rien. Le budget arrête les nouveaux
// appels dès que la dépense de ce lancement le dépasse.
//
// npx tsx docs/etudes/resumes-2026-11/banc/lancer.ts --etapes point,resume --modeles anthropic/claude-haiku-5.5,…
//   [--cas id1,id2] [--reps 1] [--conc 6] [--budget 1.00] [--estimer]

import './env-factice';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { jouerDiscussion } from './discussion';
import { chargerCas, chargerCorpus, ETAPES, type Etape, lireModele, preparer, RACINE, RESULTATS, REGLAGES } from './jeux';
import { appeler } from './openrouter';
import type { CasDiscussion } from './types';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const cle = process.argv[i] as string;
  if (!cle.startsWith('--')) continue;
  const suivant = process.argv[i + 1];
  if (suivant === undefined || suivant.startsWith('--')) args.set(cle.slice(2), 'oui');
  else {
    args.set(cle.slice(2), suivant);
    i += 1;
  }
}
const liste = (nom: string) => (args.get(nom) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const etapes = (liste('etapes').length > 0 ? liste('etapes') : [...ETAPES]) as Etape[];
const modeles = liste('modeles');
const filtreCas = new Set(liste('cas'));
const reps = Number(args.get('reps') ?? 1);
const conc = Number(args.get('conc') ?? 6);
const budget = Number(args.get('budget') ?? 0.5);
const estimer = args.has('estimer');
if (modeles.length === 0) throw new Error('--modeles manquant');

export const slug = (modele: string) => modele.replace(/[/:]/g, '__');
export const cheminSortie = (etape: string, cas: string, modele: string, rep: number) =>
  join(RESULTATS, 'sorties', etape, cas, `${slug(modele)}-r${rep}.json`);

// Les prix d'OpenRouter, relus une fois par jour (en dollars par jeton).
async function prix(): Promise<Map<string, { entree: number; sortie: number }>> {
  const fichier = join(RACINE, 'resultats', 'prix-openrouter.json');
  let data: Array<{ id: string; pricing: { prompt: string; completion: string } }>;
  if (existsSync(fichier) && Date.now() - Date.parse(JSON.parse(readFileSync(fichier, 'utf8')).lu) < 86_400_000) {
    data = JSON.parse(readFileSync(fichier, 'utf8')).data;
  } else {
    data = (await (await fetch('https://openrouter.ai/api/v1/models')).json()).data;
    mkdirSync(dirname(fichier), { recursive: true });
    writeFileSync(fichier, JSON.stringify({ lu: new Date().toISOString(), data }, null, 0));
  }
  return new Map(data.map((m) => [m.id, { entree: Number(m.pricing.prompt), sortie: Number(m.pricing.completion) }]));
}

type Tache = { etape: Etape; cas: { id: string }; modele: string; rep: number; chemin: string };
const taches: Tache[] = [];
for (const etape of etapes) {
  for (const cas of chargerCas(etape)) {
    if (filtreCas.size > 0 && !filtreCas.has(cas.id)) continue;
    for (const modele of modeles) {
      for (let rep = 1; rep <= reps; rep++) {
        const chemin = cheminSortie(etape, cas.id, modele, rep);
        if (existsSync(chemin) && !JSON.parse(readFileSync(chemin, 'utf8')).erreur) continue;
        taches.push({ etape, cas, modele, rep, chemin });
      }
    }
  }
}

// Jetons de sortie attendus par appel, réflexion comprise (estimation avant le premier essai, remplacée ensuite par la
// mesure) ; la discussion fait environ 5 appels dont le contexte grossit.
const SORTIE_ESTIMEE: Record<Etape, number> = { point: 1500, resume: 800, fil: 1000, agenda: 900, reponse: 400, discussion: 3000 };
if (estimer) {
  const tarifs = await prix();
  const parModele = new Map<string, number>();
  for (const t of taches) {
    let entree: number;
    if (t.etape === 'discussion') {
      const corpus = chargerCorpus((t.cas as CasDiscussion).entree.corpus);
      entree = 5 * (3500 / 3.6 + 1500) + corpus.sources.length * 0;
    } else {
      const p = await preparer(t.etape, t.cas as never);
      entree = (p.system.length + p.messages.reduce((s, m) => s + m.content.length, 0)) / 3.6;
    }
    const tarif = tarifs.get(lireModele(t.modele, t.etape).id);
    if (!tarif) throw new Error(`prix inconnu : ${t.modele}`);
    const cout = entree * tarif.entree + SORTIE_ESTIMEE[t.etape] * tarif.sortie;
    parModele.set(t.modele, (parModele.get(t.modele) ?? 0) + cout);
  }
  let total = 0;
  for (const [m, c] of [...parModele].sort((a, b) => b[1] - a[1])) {
    total += c;
    console.log(`${m.padEnd(45)} ${c.toFixed(3)} $`);
  }
  console.log(`${taches.length} appels à faire, environ ${total.toFixed(2)} $ (estimation, réflexion comprise)`);
  process.exit(0);
}

// Les variantes, essayées en ajoutant « @nom » au modèle :
// - sans-reflexion : la réflexion coupée (elle est facturée au prix de la sortie) ;
// - effort-bas : l'effort low au lieu de medium (point, discussion) ;
// - langue : le code détecte la langue des messages de l'utilisateur et la dit au modèle, en tête du message
//   (aujourd'hui, seule la consigne « dans la langue de ses messages » le dit, et la consigne est en français).
const FR = /\b(je|tu|il|nous|vous|est|pas|les|des|une|pour|avec|dans|sur|que|qui|mais|ça|c'est|fais|faut)\b/giu;
const EN = /\b(i|you|we|is|are|not|the|and|for|with|this|that|what|but|it's|let's|can|should|have)\b/giu;
export function langueDe(textes: string[]): 'fr' | 'en' {
  const t = textes.join(' ');
  return (t.match(FR)?.length ?? 0) > (t.match(EN)?.length ?? 0) ? 'fr' : 'en';
}
function textesUtilisateur(etape: Etape, cas: any): string[] {
  if (etape === 'point') return cas.entree.sessions.flatMap((s: any) => s.tours.filter((x: any) => x.role === 'user').map((x: any) => x.texte));
  if (etape === 'resume') return cas.entree.tours.filter((x: any) => x.role === 'user' && x.injecte === false).map((x: any) => x.texte);
  if (etape === 'fil') return cas.entree.sessions.flatMap((s: any) => s.tours.filter((x: any) => x.role === 'user' && x.injecte === false).map((x: any) => x.texte));
  return [];
}
function avecVariante(variantes: readonly string[], etape: Etape, cas: unknown, messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  if (!variantes.includes('langue')) return messages;
  const textes = textesUtilisateur(etape, cas);
  // Sans message de l'utilisateur (un point sans session), la consigne dit déjà « en anglais sinon ».
  if (textes.length === 0) return messages;
  const langue = langueDe(textes) === 'en' ? 'en anglais' : 'en français';
  const [premier, ...reste] = messages;
  return [{ ...(premier as { role: 'user'; content: string }), content: `Écris ta réponse ${langue} : c'est la langue de ses messages.\n\n${premier?.content}` }, ...reste];
}

// - consigne : le point du matin sans « (en français, en le tutoyant) », qui contredit « dans la langue de ses
//   sessions » deux lignes plus haut : la correction proposée du prompt, essayée telle quelle.
const TUTOIEMENT = '(en français, en le tutoyant)';
// - ouvert-dabord : le point avec « What is still open » en premier : la première puce est alors ce qui l'attend.
const ORDRE = '"## What you did", "## What changed", "## What is still open"';
function consigne(variantes: readonly string[], system: string): string {
  if (variantes.includes('ouvert-dabord')) {
    if (!system.includes(ORDRE)) throw new Error('variante ouvert-dabord : l\'ordre visé a changé dans le prompt');
    return system.replace(ORDRE, '"## What is still open", "## What changed", "## What you did"');
  }
  if (!variantes.includes('consigne')) return system;
  if (!system.includes(TUTOIEMENT)) throw new Error('variante consigne : la phrase visée a changé dans le prompt');
  return system.replace(TUTOIEMENT, "(à la deuxième personne, en le tutoyant quand tu écris en français)");
}

let depense = 0;
let faits = 0;
let echecs = 0;
const file = [...taches];
async function ouvrier() {
  for (;;) {
    const t = file.shift();
    if (!t) return;
    if (depense >= budget) {
      echecs++;
      continue;
    }
    const base = { etape: t.etape, cas: t.cas.id, modele: t.modele, rep: t.rep, date: new Date().toISOString() };
    let sortie: Record<string, unknown>;
    try {
      if (t.etape === 'discussion') {
        const r = await jouerDiscussion(t.modele, t.cas as CasDiscussion);
        sortie = { ...base, ...r, cout: r.usage.cout };
      } else {
        const p = await preparer(t.etape, t.cas as never);
        const { id, variantes, effort } = lireModele(t.modele, t.etape);
        const r = await appeler({
          modele: id,
          messages: [{ role: 'system', content: consigne(variantes, p.system) }, ...avecVariante(variantes, t.etape, t.cas, p.messages)],
          maxTokens: REGLAGES[t.etape].maxTokens,
          effort,
        });
        const traite = p.traiter(r.texte);
        sortie = {
          ...base,
          reponse: r.texte,
          rendu: traite.rendu,
          mesures: { ...traite.mesures, fin: r.fin },
          usage: r.usage,
          cout: r.usage.cout,
          latenceMs: r.latenceMs,
          fournisseur: r.fournisseur,
        };
      }
      depense += sortie.cout as number;
      faits++;
    } catch (e) {
      sortie = { ...base, erreur: (e as Error).message.slice(0, 500) };
      echecs++;
    }
    mkdirSync(dirname(t.chemin), { recursive: true });
    writeFileSync(t.chemin, `${JSON.stringify(sortie, null, 2)}\n`);
    const etat = sortie.erreur ? `ÉCHEC ${String(sortie.erreur).slice(0, 120)}` : `${(sortie.cout as number).toFixed(4)} $`;
    console.log(`[${faits + echecs}/${taches.length}] ${t.etape}/${t.cas.id} ${t.modele} r${t.rep} : ${etat} (total ${depense.toFixed(3)} $)`);
  }
}
await Promise.all(Array.from({ length: conc }, ouvrier));
console.log(`\nFini : ${faits} sorties, ${echecs} échecs ou sautées, ${depense.toFixed(3)} $ dépensés.`);
if (depense >= budget) console.log(`Budget de ${budget} $ atteint : des appels n'ont pas été faits.`);
process.exit(0);
