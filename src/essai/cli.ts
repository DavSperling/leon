import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { createAnthropicLlm, MODEL_BY_STEP } from '@/server/llm/anthropic-llm';
import type { LlmUsage } from '@/server/llm/llm';
import { createIngestSender } from '../cli/import-claude-code';
import { openAdminDb } from './admin-db';
import { type Bilan, envoyer } from './charger';
import { etatRuns, lireFaits, lireUsage } from './collect';
import { ESSAI_DIR, loadJeu, toursDe } from './dataset';
import {
  comparerPassages,
  coutParTourPrecedent,
  coutPipeline,
  detaillerNotes,
  enregistrerPassage,
  HISTORIQUE_DIR,
  type Passage,
  passagePrecedent,
  pct,
} from './history';
import { juger } from './judge';
import { remettreAZero, runsEnCours, runsEnCoursParTenant, tenantEssai } from './organisation';
import { type DernierPassage, DernierPassageSchema } from './schema';
import { calculerNotes, faitsDeConversation } from './score';
import { gitHead, srcModifie, verifierServeur } from './serveur';
import { verifierJeu, volumes } from './verify';

const HELP = `Usage : pnpm essai <commande>

  verifier                    contrôle le jeu essai/ (aucun appel)
  charger [--mini] [--label "…"] [--oui]
                              remet l'organisation d'essai à zéro et envoie les conversations au serveur
  noter                       attend la fin des runs, note le passage et l'ajoute à l'historique

Variables : LEON_URL (défaut http://localhost:3000), DATABASE_URL_ADMIN, ANTHROPIC_API_KEY (noter).`;

const COUT_PAR_TOUR_14_10 = 0.0022; // mesuré le 14/10 : 1,47 $ pour 672 tours
const DERNIER = join(ESSAI_DIR, '.dernier-passage.json');
const leonUrl = () => process.env.LEON_URL ?? 'http://localhost:3000';
const slugLabel = (label: string) =>
  label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'essai';

// Message fixe : jamais le texte de l'erreur du juge, qui pourrait contenir du contenu de la conversation.
const jugeErreurFixe = (cle: string) =>
  `Jugement de ${cle} impossible (erreur du juge) : voir les logs du run.`;

// Identifiant stable d'un passage, utilisé comme nom de fichier dans l'historique : lisible, trié
// chronologiquement, et sans rien de plus que le label (en minuscules ASCII) pour le distinguer.
export const passageId = (debut: Date, label: string): string =>
  `${debut.toISOString().slice(0, 16).replace('T', '-').replace(':', '')}-${slugLabel(label)}`;

async function runVerifier(): Promise<number> {
  const jeu = await loadJeu();
  console.table(volumes(jeu));
  const problemes = verifierJeu(jeu);
  for (const p of problemes) console.error(`✗ ${p}`);
  console.log(
    problemes.length === 0
      ? `Jeu valide : ${jeu.conversations.length} conversations, ${toursDe(jeu.conversations)} tours.`
      : `${problemes.length} problème(s).`,
  );
  return problemes.length === 0 ? 0 : 1;
}

async function runCharger(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { mini: { type: 'boolean' }, label: { type: 'string' }, oui: { type: 'boolean' } },
  });
  const jeu = await loadJeu();
  const problemes = verifierJeu(jeu);
  if (problemes.length > 0)
    throw new Error(
      `Jeu invalide (${problemes.length} problème(s)) : lance « pnpm essai verifier ».`,
    );
  const conversations = values.mini
    ? jeu.conversations.filter((c) => jeu.mini.includes(c.cle))
    : jeu.conversations;

  const head = gitHead();
  const refus = await verifierServeur({ fetch, url: leonUrl(), head, srcModifie: srcModifie() });
  if (refus) throw new Error(refus);

  const admin = openAdminDb();
  try {
    const runs = await runsEnCours(admin.db);
    if (runs.actifs > 0)
      throw new Error(
        'Des runs du passage précédent tournent encore : attends-les (pnpm essai noter).',
      );
    if (runs.bloques > 0)
      console.log(
        `Avertissement : ${runs.bloques} run(s) bloqué(s) depuis plus de 15 min, seront supprimés par la remise à zéro.`,
      );

    const tours = toursDe(conversations);
    const parTour = (await coutParTourPrecedent()) ?? COUT_PAR_TOUR_14_10;
    console.log(
      `${conversations.length} conversations, ${tours} tours. Coût estimé : ${(tours * parTour).toFixed(2)} $ (${parTour.toFixed(4)} $ par tour).`,
    );
    console.log(
      "La remise à zéro supprime la mémoire de l'organisation d'essai du run précédent ; ses résultats payants ne restent que dans l'historique si « pnpm essai noter » a été exécuté avant.",
    );
    if (!values.oui) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const reponse = await rl.question('Lancer ? (o/N) ');
      rl.close();
      if (reponse.trim().toLowerCase() !== 'o') return 1;
    }

    const { comptes } = await remettreAZero(admin.db, jeu.entreprise);
    const label = values.label ?? 'sans libellé';
    const debut = new Date();
    // « 2026-10-16-1000-reference » (heure UTC). Écrit tout de suite, incomplet : si l'envoi est
    // interrompu (et même en cas de plantage non rattrapé), « noter » doit pouvoir le constater
    // plutôt que de noter un passage partiel comme s'il était complet.
    const passage: DernierPassage = {
      id: passageId(debut, label),
      label,
      commit: head,
      jeu: values.mini ? 'mini' : 'complet',
      conversations: conversations.map((c) => c.cle),
      tours,
      debut: debut.toISOString(),
      complet: false,
      envois: 0,
      toursEnvoyes: 0,
      runs: 0,
    };
    const ecrirePassage = (bilan: Partial<Bilan>, complet: boolean) =>
      writeFile(
        DERNIER,
        `${JSON.stringify(
          {
            ...passage,
            complet,
            envois: bilan.envois ?? 0,
            toursEnvoyes: bilan.tours ?? 0,
            runs: bilan.runs ?? 0,
          },
          null,
          2,
        )}\n`,
      );
    await ecrirePassage({}, false);

    const jetons = new Map(comptes.map((c) => [c.cle, c.token]));
    let bilan: Bilan;
    try {
      bilan = await envoyer(
        conversations,
        jetons,
        (token, payload) => createIngestSender(fetch, { url: leonUrl(), token })(payload),
        console.log,
      );
    } catch (error) {
      const partiel = (error as { bilanPartiel?: Bilan }).bilanPartiel ?? {};
      await ecrirePassage(partiel, false);
      throw error;
    }
    await ecrirePassage(bilan, true);
    console.log(
      `Envoyé : ${bilan.tours} tours en ${bilan.envois} envois, ${bilan.runs} runs. Mot de passe des personnages : essai/README.md.`,
    );
    return 0;
  } finally {
    await admin.close();
  }
}

// S'arrête quand les runs restants (en file ou en cours) sont tous plus vieux que
// RUN_BLOQUE_APRES_MINUTES : au-delà, ce ne sont plus des runs qu'on attend, mais des runs bloqués
// (voir organisation.ts) que redémarrer le serveur seul peut relancer.
async function attendreRuns(db: ReturnType<typeof openAdminDb>['db'], tenantId: string) {
  for (;;) {
    const etat = await etatRuns(db, tenantId);
    const { actifs, bloques } = await runsEnCoursParTenant(db, tenantId);
    process.stdout.write(
      `\rRuns : ${etat.done} terminés, ${etat.failed} échoués, ${etat.enCours} en cours sur ${etat.total}   `,
    );
    if (actifs === 0) {
      process.stdout.write('\n');
      return { ...etat, bloques };
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

async function lireDernierPassage(): Promise<DernierPassage> {
  let raw: string;
  try {
    raw = await readFile(DERNIER, 'utf8');
  } catch {
    throw new Error('Aucun passage chargé : lance « pnpm essai charger ».');
  }
  return DernierPassageSchema.parse(JSON.parse(raw));
}

async function dejaNote(id: string): Promise<boolean> {
  return readFile(join(HISTORIQUE_DIR, 'passages', `${id}.json`), 'utf8').then(
    () => true,
    () => false,
  );
}

async function runNoter(): Promise<number> {
  const passage = await lireDernierPassage();
  if (!passage.complet) throw new Error('Passage incomplet : relance « pnpm essai charger ».');
  if (await dejaNote(passage.id)) throw new Error(`Passage déjà noté : ${passage.id}.`);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante (le juge en a besoin).');
  const jeu = await loadJeu();
  const conversations = jeu.conversations.filter((c) => passage.conversations.includes(c.cle));
  const admin = openAdminDb();
  try {
    const tenantId = await tenantEssai(admin.db);
    if (!tenantId)
      throw new Error('Organisation d essai introuvable : lance « pnpm essai charger ».');
    const runs = await attendreRuns(admin.db, tenantId);
    if (runs.bloques > 0) {
      console.error(
        `${runs.bloques} run(s) bloqué(s) : redémarre le serveur et relance « pnpm essai charger ».`,
      );
      return 1;
    }
    const produits = await lireFaits(admin.db, tenantId);
    const usage = await lireUsage(admin.db, tenantId);

    const llm = createAnthropicLlm({ apiKey });
    let coutJuge = 0;
    const compter = async (u: LlmUsage) => {
      coutJuge += u.costUsd ?? 0;
    };
    const paires = new Map<string, string | null>();
    const jugeErreurs: string[] = [];
    for (const c of conversations) {
      const siens = faitsDeConversation(c, produits);
      try {
        for (const [id, cible] of await juger(llm, c, siens, compter)) paires.set(id, cible);
      } catch {
        // Jamais le texte de l'erreur, qui pourrait contenir du contenu de la conversation : message fixe.
        console.error(jugeErreurFixe(c.cle));
        jugeErreurs.push(c.cle);
      }
    }

    // Une conversation sans jugement n'a aucune paire fiable : on la retire des attendus (sinon ses
    // F compteraient comme manqués) et ses faits produits des notes (sinon ils compteraient comme
    // « en trop »), plutôt que de fausser rappel et précision avec des données qu'on n'a pas pu juger.
    const conversationsJugees = conversations.filter((c) => !jugeErreurs.includes(c.cle));
    const idsExclus = new Set(
      conversations
        .filter((c) => jugeErreurs.includes(c.cle))
        .flatMap((c) => faitsDeConversation(c, produits).map((p) => p.id)),
    );
    const produitsPourNotes = produits.filter((p) => !idsExclus.has(p.id));

    const notes = calculerNotes({
      conversations: conversationsJugees,
      produits: produitsPourNotes,
      paires,
      secrets: jeu.entreprise.secrets,
    });
    const fin = runs.fin ? new Date(runs.fin) : null;
    const cout = coutPipeline(usage);
    const detail: Passage = {
      id: passage.id,
      date: passage.debut,
      label: passage.label,
      commit: passage.commit,
      jeu: passage.jeu,
      modeles: { ...MODEL_BY_STEP },
      tours: passage.toursEnvoyes,
      dureeMinutes: fin ? Math.round((fin.getTime() - Date.parse(passage.debut)) / 60_000) : null,
      runs,
      usage,
      coutJuge,
      jugeErreurs,
      appariements: Object.fromEntries(paires),
      notes: detaillerNotes(notes, produitsPourNotes, paires),
    };
    const precedent = await passagePrecedent(passage.jeu, passage.id);
    const json = await enregistrerPassage(detail);
    console.log(
      `Rappel ${pct(notes.rappel)}, précision ${pct(notes.precision)}, ${notes.fauxFaits} faux faits, ${runs.failed} run(s) échoué(s).`,
    );
    console.log(
      `Doublons : ${notes.doublonsFaits} (dont ${notes.reditsRecrees} redit(s) recréé(s)) ; fuites sensibles : ${notes.fuitesSensibles} ; hors jeu : ${notes.horsJeu}.`,
    );
    console.log(`Coût du pipeline : ${cout.toFixed(3)} $ ; juge : ${coutJuge.toFixed(3)} $.`);
    if (jugeErreurs.length > 0)
      console.error(
        `${jugeErreurs.length} conversation(s) sans jugement (passage incomplet) : ${jugeErreurs.join(', ')}.`,
      );
    console.log(`Historique mis à jour ; détail dans ${json}.`);
    if (precedent) for (const ligne of comparerPassages(precedent, detail)) console.log(ligne);
    return jugeErreurs.length > 0 ? 1 : 0;
  } finally {
    await admin.close();
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  try {
    if (command === 'verifier') return await runVerifier();
    if (command === 'charger') return await runCharger(args);
    if (command === 'noter') return await runNoter();
  } catch (error) {
    // Seule la première ligne : la pile ou un message multi-lignes ne regarde pas l'utilisateur du CLI.
    console.error(
      error instanceof Error ? (error.message.split('\n')[0] ?? '') : 'Erreur inconnue.',
    );
    return 1;
  }
  const asked = command === undefined || command === 'help' || command === '--help';
  (asked ? console.log : console.error)(HELP);
  return asked ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
