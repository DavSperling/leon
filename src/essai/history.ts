import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LlmStep } from '@/server/llm/llm';
import type { etatRuns, FaitProduit, ModelesParEtape, UsageParEtape } from './collect';
import type { Notes, NotesConversation } from './score';

export const HISTORIQUE_DIR = fileURLToPath(
  new URL('../../docs/etudes/essais-pipeline', import.meta.url),
);

// Texte d'un fait produit, gardé dans le JSON pour relire après coup ce que Leon a inventé ou mal
// classé (jeu fictif : rien de réel ici).
export type FaitDetail = {
  statement: string;
  turnExternalId: string;
  ficheTitre: string;
  correspond: string | null; // paire du juge : N… pour un faux fait, null pour un fait en trop
};

export type NotesDetaillees = Omit<Notes, 'parConversation'> & {
  parConversation: Array<
    NotesConversation & { faitsEnTrop: FaitDetail[]; fauxFaitsDetail: FaitDetail[] }
  >;
};

export type Passage = {
  id: string; // « 2026-10-16-1000-reference » : nom du fichier JSON
  date: string;
  label: string;
  commit: string;
  jeu: 'complet' | 'mini';
  // Modèle de chaque étape annoncé par le serveur (« fournisseur:modèle »), juge compris. Les passages
  // d'avant le 15/10 n'ont que l'identifiant Anthropic (« claude-… »).
  modeles: Record<LlmStep, string>;
  modelesVus?: ModelesParEtape; // modèles réellement rendus par l'API (llm_usage), pour vérification
  tours: number;
  dureeMinutes: number | null;
  runs: Awaited<ReturnType<typeof etatRuns>>;
  usage: UsageParEtape; // mesuré (llm_usage)
  coutJuge: number; // mesuré, hors coût du pipeline
  jugeErreurs: string[]; // clés des conversations dont le jugement a échoué : passage incomplet
  appariements: Record<string, string | null>; // paires complètes du juge : fait produit → F…, N… ou null
  notes: NotesDetaillees;
};

// Ajoute à chaque conversation le texte de ses faits en trop et de ses faux faits.
export function detaillerNotes(
  notes: Notes,
  produits: FaitProduit[],
  paires: Map<string, string | null>,
): NotesDetaillees {
  const parId = new Map(produits.map((p) => [p.id, p]));
  const detail = (ids: string[]): FaitDetail[] =>
    ids.flatMap((id) => {
      const p = parId.get(id);
      return p
        ? [
            {
              statement: p.statement,
              turnExternalId: p.turnExternalId,
              ficheTitre: p.ficheTitre,
              correspond: paires.get(id) ?? null,
            },
          ]
        : [];
    });
  return {
    ...notes,
    parConversation: notes.parConversation.map((c) => ({
      ...c,
      faitsEnTrop: detail(c.enTrop),
      fauxFaitsDetail: detail(c.fauxFaits),
    })),
  };
}

const EN_TETE = `# Historique des essais du pipeline

Un passage par ligne, ajouté par \`pnpm essai noter\`. Coûts **mesurés** (table \`llm_usage\`, tarifs de \`docs/etudes/couts-2026-10/annexes/01-prix-llm.md\`), hors coût du juge. Détail de chaque passage dans \`passages/\`.

| Date | Libellé | Commit | Jeu | Modèles | Tours | Coût pipeline | Coût / tour | Rappel | Précision | Faux faits | Doublons (faits, dont redits recréés) | Tour juste | Fiche juste | Fiches dispersées | Remplacements | Conflits | Fuites sensibles | Sur-signalés | Secrets | Runs échoués | Hors jeu | Erreurs juge | Durée |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
`;

const euros = (n: number, d = 2) => `${n.toFixed(d).replace('.', ',')} $`;
export const pct = (n: number | null) => (n === null ? 'n/d' : `${Math.round(n * 100)} %`);
const sur = (a: number, b: number) => `${a}/${b}`;

// Un | casserait la table Markdown ; des espaces multiples (retour à la ligne collé, saisie
// distraite) l'abîmeraient visuellement sans la casser.
export const echapperCellule = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

const ETAPE_LABEL: Partial<Record<keyof Passage['modeles'], string>> = {
  triage: 'triage',
  extraction: 'extraction',
  placement: 'rangement',
};
// « anthropic:claude-haiku-5-5 » → « haiku-5-5 » ; « openrouter:mistralai/… » → « mistralai/… ».
const modeleCourt = (modele: string) =>
  modele.replace(/^openrouter:/, '').replace(/^(anthropic:)?claude-/, '');

export function modelesCompacts(modeles: Passage['modeles']): string {
  return (Object.keys(ETAPE_LABEL) as Array<keyof Passage['modeles']>)
    .filter((etape) => etape in modeles)
    .map((etape) => `${ETAPE_LABEL[etape]} ${modeleCourt(modeles[etape])}`)
    .join(' · ');
}

export const coutPipeline = (usage: UsageParEtape) =>
  Object.values(usage).reduce((sum, u) => sum + u.costUsd, 0);

export function ligneHistorique(p: Passage): string {
  const n = p.notes;
  const cout = coutPipeline(p.usage);
  return `| ${[
    p.date.slice(0, 10),
    echapperCellule(p.label),
    p.commit.slice(0, 7),
    p.jeu,
    modelesCompacts(p.modeles),
    p.tours,
    euros(cout),
    euros(cout / Math.max(p.tours, 1), 4),
    pct(n.rappel),
    pct(n.precision),
    n.fauxFaits,
    `${n.doublonsFaits} (${n.reditsRecrees})`,
    pct(n.tourCorrect.sur ? n.tourCorrect.ok / n.tourCorrect.sur : null),
    pct(n.ficheCorrecte.sur ? n.ficheCorrecte.ok / n.ficheCorrecte.sur : null),
    n.fichesDispersees,
    sur(n.remplacements.trouves, n.remplacements.attendus),
    sur(n.conflits.trouves, n.conflits.attendus),
    n.fuitesSensibles,
    n.surSignales,
    n.secretsFuites,
    p.runs.failed,
    n.horsJeu,
    p.jugeErreurs.length,
    p.dureeMinutes === null ? 'n/d' : `${p.dureeMinutes} min`,
  ].join(' | ')} |\n`;
}

export async function enregistrerPassage(p: Passage, dir = HISTORIQUE_DIR): Promise<string> {
  await mkdir(join(dir, 'passages'), { recursive: true });
  const md = join(dir, 'historique.md');
  const existe = await readFile(md, 'utf8').then(
    () => true,
    () => false,
  );
  await appendFile(md, `${existe ? '' : EN_TETE}${ligneHistorique(p)}`);
  const json = join(dir, 'passages', `${p.id}.json`);
  await writeFile(json, `${JSON.stringify(p, null, 2)}\n`);
  return json;
}

// Coût mesuré par tour du dernier passage complet, pour annoncer le coût du suivant.
export async function coutParTourPrecedent(dir = HISTORIQUE_DIR): Promise<number | null> {
  const p = (await lirePassages(dir)).filter((x) => x.jeu === 'complet' && x.tours > 0).at(-1);
  return p ? coutPipeline(p.usage) / p.tours : null;
}

async function lirePassages(dir: string): Promise<Passage[]> {
  const fichiers = await readdir(join(dir, 'passages')).catch(() => [] as string[]);
  return Promise.all(
    fichiers
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map(async (f) => JSON.parse(await readFile(join(dir, 'passages', f), 'utf8')) as Passage),
  );
}

// Dernier passage du même jeu enregistré avant celui-ci (les id se trient chronologiquement).
export async function passagePrecedent(
  jeu: Passage['jeu'],
  id: string,
  dir = HISTORIQUE_DIR,
): Promise<Passage | null> {
  const avant = (await lirePassages(dir)).filter((p) => p.jeu === jeu && p.id < id);
  return avant.at(-1) ?? null;
}

export function comparerPassages(precedent: Passage, actuel: Passage): string[] {
  const a = precedent.notes;
  const b = actuel.notes;
  return [
    `Comparé au passage ${precedent.id} (${echapperCellule(precedent.label)}) :`,
    `  Rappel : ${pct(a.rappel)} → ${pct(b.rappel)}`,
    `  Précision : ${pct(a.precision)} → ${pct(b.precision)}`,
    `  Faux faits : ${a.fauxFaits} → ${b.fauxFaits}`,
    `  Coût pipeline : ${euros(coutPipeline(precedent.usage))} → ${euros(coutPipeline(actuel.usage))}`,
  ];
}
