import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { createAnthropicLlm, MODEL_BY_STEP } from '@/server/llm/anthropic-llm';
import type { LlmUsage } from '@/server/llm/llm';
import { createIngestSender } from '../cli/import-claude-code';
import { openAdminDb } from './admin-db';
import { envoyer } from './charger';
import { etatRuns, lireFaits, lireUsage } from './collect';
import { ESSAI_DIR, loadJeu, toursDe } from './dataset';
import { coutParTourPrecedent, enregistrerPassage } from './history';
import { juger } from './judge';
import { remettreAZero, runsEnCours, tenantEssai } from './organisation';
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
    const passage: DernierPassage = {
      // « 2026-10-16-1000-reference » (heure UTC)
      id: `${debut.toISOString().slice(0, 16).replace('T', '-').replace(':', '')}-${slugLabel(label)}`,
      label,
      commit: head,
      jeu: values.mini ? 'mini' : 'complet',
      conversations: conversations.map((c) => c.cle),
      tours,
      debut: debut.toISOString(),
    };
    await writeFile(DERNIER, `${JSON.stringify(passage, null, 2)}\n`);

    const jetons = new Map(comptes.map((c) => [c.cle, c.token]));
    const bilan = await envoyer(
      conversations,
      jetons,
      (token, payload) => createIngestSender(fetch, { url: leonUrl(), token })(payload),
      console.log,
    );
    console.log(
      `Envoyé : ${bilan.tours} tours en ${bilan.envois} envois, ${bilan.runs} runs. Mot de passe des personnages : essai/README.md.`,
    );
    return 0;
  } finally {
    await admin.close();
  }
}

async function attendreRuns(db: ReturnType<typeof openAdminDb>['db'], tenantId: string) {
  for (;;) {
    const etat = await etatRuns(db, tenantId);
    process.stdout.write(
      `\rRuns : ${etat.done} terminés, ${etat.failed} échoués, ${etat.enCours} en cours sur ${etat.total}   `,
    );
    if (etat.enCours === 0) {
      process.stdout.write('\n');
      return etat;
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

async function runNoter(): Promise<number> {
  const passage = DernierPassageSchema.parse(JSON.parse(await readFile(DERNIER, 'utf8')));
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

    const notes = calculerNotes({
      conversations,
      produits,
      paires,
      secrets: jeu.entreprise.secrets,
    });
    const fin = runs.fin ? new Date(runs.fin) : null;
    const json = await enregistrerPassage({
      id: passage.id,
      date: passage.debut,
      label: passage.label,
      commit: passage.commit,
      jeu: passage.jeu,
      modeles: { ...MODEL_BY_STEP },
      tours: passage.tours,
      dureeMinutes: fin ? Math.round((fin.getTime() - Date.parse(passage.debut)) / 60_000) : null,
      runs,
      usage,
      coutJuge,
      jugeErreurs,
      notes,
    });
    console.log(
      `Rappel ${Math.round((notes.rappel ?? 0) * 100)} %, précision ${Math.round((notes.precision ?? 0) * 100)} %, ${notes.fauxFaits} faux faits, ${runs.failed} run(s) échoué(s).`,
    );
    console.log(
      `Doublons : ${notes.doublonsFaits} (dont ${notes.reditsRecrees} redit(s) recréé(s)) ; fuites sensibles : ${notes.fuitesSensibles} ; hors jeu : ${notes.horsJeu}.`,
    );
    console.log(
      `Coût du pipeline : ${Object.values(usage)
        .reduce((s, u) => s + u.costUsd, 0)
        .toFixed(3)} $ ; juge : ${coutJuge.toFixed(3)} $.`,
    );
    if (jugeErreurs.length > 0)
      console.error(
        `${jugeErreurs.length} conversation(s) sans jugement (passage incomplet) : ${jugeErreurs.join(', ')}.`,
      );
    console.log(`Historique mis à jour ; détail dans ${json}.`);
    return 0;
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
    console.error(error instanceof Error ? error.message : 'Erreur inconnue.');
    return 1;
  }
  const asked = command === undefined || command === 'help' || command === '--help';
  (asked ? console.log : console.error)(HELP);
  return asked ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
