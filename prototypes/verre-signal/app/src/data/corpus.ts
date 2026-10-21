import { paris } from '@/lib/format';
import { nb } from '@/lib/nb';
import type { Nature, SourceKind } from './providers';

// Tout ce que Leon « a gardé » chez Acme : réunions, mails, tickets, pages, notes CRM, conversations IA, commits.
// Sujets : renouvellement ACME et remise du plan Zéphyr, export SSO (LIN-42), budget et plafond de dépenses,
// renouvellement OVH, sauvegardes de la production, recrutement. « Vous » = David Sperling.

export type Turn = { speaker: string; at: Date; text: string };
export type CorpusItem = {
  id: string;
  kind: SourceKind;
  nature: Nature;
  /** Dépôt, projet, espace, boîte… (60 caractères au plus) */
  origin: string;
  title: string | null;
  url: string | null;
  /** Auteur de l'élément (premier tour) */
  author: string;
  /** Date du dernier tour */
  date: Date;
  turns: Turn[];
};

type T = [speaker: string, at: string, text: string];

function item(id: string, kind: SourceKind, nature: Nature, origin: string, title: string | null, url: string | null, turns: T[]): CorpusItem {
  const ts = turns.map(([speaker, at, text]) => ({ speaker, at: paris(at), text: nb(text) }));
  return { id, kind, nature, origin, title, url, author: ts[0]!.speaker, date: ts.at(-1)!.at, turns: ts };
}

const JULIE = 'Julie Martin', BOB = 'Bob Durand', ALICE = 'Alice Bernard', THOMAS = 'Thomas Roux', DAVID = 'David Sperling';
const MARC = 'Marc Lefèvre (ACME)', YOU = 'Vous', AI = 'Assistant';

export const CORPUS: CorpusItem[] = [
  // ---------- ACME : renouvellement, plan Zéphyr, export SSO ----------
  item('fathom-call-acme', 'fathom', 'reunion', 'Équipe Sales', 'Call ACME — renouvellement 2027', 'https://fathom.video/calls/48213', [
    [JULIE, '2026-10-14 14:02', 'Bonjour à tous, on fait le point sur le renouvellement.'],
    [MARC, '2026-10-14 14:03', 'Notre DAF veut de la visibilité sur 2027 avant de s’engager.'],
    [JULIE, '2026-10-14 14:05', 'On a parlé de la remise du plan Zéphyr : quinze pour cent la première année, si le contrat est signé avant fin octobre.'],
    [MARC, '2026-10-14 14:06', 'Ça me paraît jouable. Je fais relire par le juridique cette semaine.'],
    [JULIE, '2026-10-14 14:08', 'Parfait. Côté produit, l’export SSO sera prêt avant la signature : Alice s’en occupe.'],
  ]),
  item('outlook-relance-acme', 'outlook', 'mail', 'Boîte commerciale', 'Relance — contrat ACME v3', 'https://outlook.office.com/mail/inbox/id/relance-acme-v3', [
    [BOB, '2026-10-17 09:12', 'Bonjour Marc, je reviens vers vous au sujet du renouvellement du contrat : votre juridique a-t-il pu relire la version 3 ?'],
    [MARC, '2026-10-17 11:40', 'Bonjour Bob, retour prévu lundi au plus tard.'],
  ]),
  item('linear-lin-42', 'linear', 'ticket', 'Produit', 'LIN-42 · Export SSO pour ACME', 'https://linear.app/acme/issue/LIN-42', [
    [ALICE, '2026-10-12 10:20', 'Bloquant pour la signature du contrat ACME : l’export SAML doit être en production avant le 31.'],
    [THOMAS, '2026-10-16 16:02', 'PR ouverte, en revue demain matin.'],
    [ALICE, '2026-10-20 11:15', 'Revue faite. Déploiement prévu jeudi 22 octobre.'],
  ]),
  item('cc-avenant-acme', 'claude_code', 'conversation', 'leon-commercial', 'Brouillon de l’avenant ACME', null, [
    [YOU, '2026-10-09 18:31', 'Rédige un avenant de renouvellement sur 24 mois avec une remise dégressive : 15 %, puis 10 %.'],
    [AI, '2026-10-09 18:31', 'Voici une proposition d’avenant en quatre articles : durée de 24 mois, remise de 15 % la première année puis 10 % la deuxième, révision du tarif indexée sur Syntec, résiliation avec trois mois de préavis.'],
  ]),
  item('hubspot-note-acme', 'hubspot', 'note', 'Compte ACME', 'Note de compte — ACME', 'https://app-eu1.hubspot.com/contacts/123456/record/0-2/8812', [
    [JULIE, '2026-10-02 15:48', 'Budget 2027 confirmé côté ACME, décision attendue avant le renouvellement de novembre.'],
  ]),
  item('outlook-juridique-acme', 'outlook', 'mail', 'Boîte commerciale', 'RE : Contrat ACME — remarques du juridique', 'https://outlook.office.com/mail/inbox/id/juridique-acme', [
    [MARC, '2026-10-20 17:05', 'Bonjour Bob, notre juridique valide la version 3 du contrat, à deux remarques près : la clause de réversibilité et le plafond de responsabilité. Je vous envoie le détail demain.'],
    [BOB, '2026-10-20 17:31', 'Merci Marc, on regarde ça avec Julie dès réception.'],
  ]),
  item('notion-zephyr', 'notion', 'page', 'Espace Acme', 'Plan Zéphyr — grille tarifaire 2027', 'https://www.notion.so/acme/Plan-Zephyr-grille-2027-5c1e', [
    [JULIE, '2026-09-24 10:00', 'Le plan Zéphyr remplace l’offre Équipe au 1er janvier. Remise de lancement : 15 % la première année pour un renouvellement signé avant le 31 octobre, 10 % pour un nouveau contrat.'],
  ]),
  item('github-pr-131', 'github', 'ticket', 'acme/leon', 'Export SAML pour l’espace ACME (#131)', 'https://github.com/acme/leon/pull/131', [
    [THOMAS, '2026-10-16 15:40', 'Ajoute l’export des métadonnées SAML dans les réglages de l’espace. Demandé par ACME (LIN-42), bloquant pour le renouvellement.'],
    [ALICE, '2026-10-17 09:20', 'Relu : deux remarques sur les tests, sinon c’est bon pour moi.'],
  ]),
  item('claap-pipeline', 'claap', 'reunion', 'Espace Acme', 'Revue du pipeline commercial', 'https://app.claap.io/acme/c/pipeline-1019', [
    [JULIE, '2026-10-19 10:02', 'ACME : renouvellement en bonne voie, signature visée le 28 octobre.'],
    [BOB, '2026-10-19 10:04', 'Ils attendent encore l’export SSO, c’est le seul point ouvert.'],
    [DAVID, '2026-10-19 10:06', 'On le garde en priorité un. Thomas confirme le déploiement jeudi.'],
  ]),
  item('jira-acme-17', 'jira', 'ticket', 'ACME', 'ACME-17 · Migration des comptes ACME', 'https://acme.atlassian.net/browse/ACME-17', [
    ['Pierre Garnier', '2026-09-12 11:30', 'Migrer les 240 comptes ACME vers le nouvel annuaire avant le renouvellement du contrat.'],
    ['Pierre Garnier', '2026-09-25 17:10', 'Migration terminée, 3 comptes en erreur corrigés à la main.'],
  ]),
  item('intercom-export-acme', 'intercom', 'fil', 'Support', 'Export CSV trop lent (ACME)', null, [
    [MARC, '2026-09-30 10:12', 'Bonjour, l’export CSV de nos tableaux prend plus de deux minutes depuis la dernière mise à jour.'],
    [BOB, '2026-09-30 10:31', 'Merci Marc, c’est noté : on regarde ça avec l’équipe produit et je reviens vers vous.'],
  ]),
  item('chatgpt-relance', 'chatgpt', 'conversation', 'ChatGPT', 'Mail de relance pour un renouvellement', 'https://chatgpt.com/c/6712a0e4-relance', [
    [YOU, '2026-10-16 18:20', 'Écris un mail court pour relancer un client sur le renouvellement de son contrat, ton cordial.'],
    [AI, '2026-10-16 18:20', 'Bonjour Marc, je me permets de revenir vers vous au sujet du renouvellement du contrat. Votre juridique a-t-il pu avancer sur la version 3 ? Je reste disponible pour un point cette semaine.'],
  ]),
  item('mcp-remise-acme', 'mcp_remember', 'note', 'Note MCP', 'Décision : remise ACME', null, [
    [YOU, '2026-10-14 15:10', 'À retenir : remise de 15 % la première année sur le plan Zéphyr accordée à ACME, valable si le contrat est signé avant le 31 octobre. Validé par David.'],
  ]),
  item('hubspot-nova', 'hubspot', 'note', 'Compte Nova', 'Note de compte — Nova', 'https://app-eu1.hubspot.com/contacts/123456/record/0-2/9031', [
    [JULIE, '2026-09-26 11:20', 'Nova veut une démo de la connexion SSO avant de signer. Contrat d’un an envisagé, 40 postes.'],
  ]),
  item('intercom-sso-nova', 'intercom', 'fil', 'Support', 'Question sur la connexion SSO', null, [
    ['Léa Moreau (Nova)', '2026-10-11 09:45', 'Bonjour, est-ce que Leon gère la connexion SSO avec Okta ?'],
    [BOB, '2026-10-11 10:02', 'Bonjour Léa, oui, via SAML ; l’export des métadonnées arrive fin octobre.'],
  ]),

  // ---------- OVH ----------
  item('outlook-ovh', 'outlook', 'mail', 'Boîte admin', 'Renouvellement du contrat OVH', 'https://outlook.office.com/mail/inbox/id/ovh-renouvellement', [
    ['OVHcloud', '2026-10-06 08:00', 'Votre contrat de serveurs dédiés arrive à échéance le 30 novembre 2026. Le renouvellement du contrat se fera automatiquement, sauf résiliation avant le 31 octobre.'],
    [THOMAS, '2026-10-07 09:15', 'Le contrat OVH est renouvelé : je garde les deux serveurs Advance-2 et je résilie le troisième.'],
  ]),
  item('notion-infra', 'notion', 'page', 'Espace Acme', 'Infrastructure — contrats et échéances', 'https://www.notion.so/acme/Infrastructure-contrats-8a21', [
    [THOMAS, '2026-10-07 10:00', 'OVH : renouvellement au 30 novembre, deux serveurs dédiés gardés, le troisième résilié. Scaleway : sauvegardes chiffrées, contrat annuel jusqu’en mars 2027.'],
  ]),
  item('linear-lin-57', 'linear', 'ticket', 'Infra', 'LIN-57 · Résilier le troisième serveur OVH', 'https://linear.app/acme/issue/LIN-57', [
    [THOMAS, '2026-10-08 14:30', 'Migrer l’indexation sur les deux serveurs restants, puis résilier le troisième avant le 31 octobre.'],
  ]),

  // ---------- Sauvegardes de la production ----------
  item('github-118', 'github', 'ticket', 'acme/leon', 'Sauvegardes quotidiennes de la base de production (#118)', 'https://github.com/acme/leon/issues/118', [
    [THOMAS, '2026-10-01 09:30', 'Mettre en place les sauvegardes quotidiennes de la base de production, avec une rétention de 30 jours et un test de restauration chaque semaine.'],
    [ALICE, '2026-10-13 14:00', 'Sauvegardes en place depuis lundi ; premier test de restauration réussi en 11 min.'],
  ]),
  item('github-commit-backup', 'github', 'commit', 'acme/leon', 'ops : sauvegarde nocturne de la base vers Scaleway', 'https://github.com/acme/leon/commit/4f2a9c1', [
    [THOMAS, '2026-10-12 22:40', 'pg_dump chiffré chaque nuit à 2 h, envoyé vers le stockage Scaleway, rétention de 30 jours.'],
  ]),
  item('cc-restore', 'claude_code', 'conversation', 'leon-infra', 'Script de restauration de la base', null, [
    [YOU, '2026-10-15 17:02', 'Écris un script qui restaure la dernière sauvegarde de la base de production dans une base de test, et vérifie le nombre de lignes.'],
    [AI, '2026-10-15 17:03', 'Voici restore-check.sh : il télécharge la dernière sauvegarde, la restaure dans leon_restore_test, puis compare le nombre de lignes des tables principales avec la production.'],
  ]),
  item('mcp-restore', 'mcp_remember', 'note', 'Note MCP', 'Restauration testée', null, [
    [YOU, '2026-10-21 09:00', 'Test de restauration de la base réussi ce matin : 11 min pour 4,2 Go. Prochain test lundi.'],
  ]),

  // ---------- GitHub : tickets et code ----------
  item('github-127', 'github', 'ticket', 'acme/leon', 'Tests d’intégration instables sur la file d’indexation (#127)', 'https://github.com/acme/leon/issues/127', [
    [ALICE, '2026-10-18 11:05', 'Le test worker.db échoue une fois sur dix en CI : la file reprend un travail déjà verrouillé.'],
    [THOMAS, '2026-10-18 15:22', 'Reproduit en local avec 8 travailleurs. Je regarde le verrou lundi.'],
  ]),
  item('github-124', 'github', 'ticket', 'acme/leon', 'L’export CSV dépasse deux minutes sur les gros espaces (#124)', 'https://github.com/acme/leon/issues/124', [
    [BOB, '2026-10-03 10:40', 'Signalé par ACME sur Intercom : l’export des tableaux prend plus de deux minutes au-delà de 50 000 lignes.'],
    [THOMAS, '2026-10-06 18:05', 'Corrigé par une pagination côté serveur : 9 s sur l’espace d’ACME. À vérifier chez eux.'],
  ]),
  item('github-commit-ranking', 'github', 'commit', 'acme/leon', 'search : bonus de fraîcheur sur 30 jours', 'https://github.com/acme/leon/commit/b81d07e', [
    [THOMAS, '2026-10-21 10:20', 'Les passages de moins de 30 jours gagnent jusqu’à 20 % au classement ; le poids du titre passe de 3 à 2.'],
  ]),
  item('cc-ranking', 'claude_code', 'conversation', 'leon', 'Pondération des titres dans la recherche', null, [
    [YOU, '2026-10-21 10:55', 'Pourquoi les titres pèsent-ils autant que le texte dans le classement ?'],
    [AI, '2026-10-21 10:56', 'Le poids du titre vaut 3 dans search.ts, contre 1 pour un passage. Je propose de le ramener à 2 et d’ajouter un bonus de fraîcheur sur 30 jours.'],
  ]),
  item('linear-lin-38', 'linear', 'ticket', 'Produit', 'LIN-38 · Aperçu des passages sur mobile', 'https://linear.app/acme/issue/LIN-38', [
    [ALICE, '2026-10-05 15:10', 'Sur mobile, l’aperçu doit s’ouvrir en feuille par-dessus les résultats, et se fermer d’un glissement.'],
  ]),

  // ---------- Budget et plafond de dépenses ----------
  item('notion-plafond', 'notion', 'page', 'Espace Acme', 'Plafond de dépenses', 'https://www.notion.so/acme/Plafond-de-depenses-2b7f', [
    [DAVID, '2026-10-08 12:00', 'Plafond de dépenses outils : 4 000 € par mois pour toute l’équipe. Au-delà, validation de David. Les abonnements annuels passent par le budget du trimestre.'],
  ]),
  item('claap-budget', 'claap', 'reunion', 'Espace Acme', 'Point budget T4', 'https://app.claap.io/acme/c/budget-t4', [
    [DAVID, '2026-10-20 09:30', 'On est à 3 420 € de dépenses outils sur octobre, sous le plafond de 4 000 €.'],
    [JULIE, '2026-10-20 09:33', 'Il faudra prévoir le budget du salon Produit en novembre, environ 2 500 €.'],
    [DAVID, '2026-10-20 09:35', 'D’accord, si on décale l’abonnement Gong au trimestre prochain.'],
  ]),
  item('outlook-budget-2027', 'outlook', 'mail', 'Boîte de David', 'Budget 2027 — première version', 'https://outlook.office.com/mail/inbox/id/budget-2027', [
    [JULIE, '2026-10-15 08:45', 'Voici la première version du budget 2027 : 38 % pour l’équipe produit, 22 % pour les ventes, le reste en infrastructure et en outils.'],
  ]),
  item('chatgpt-depenses', 'chatgpt', 'conversation', 'ChatGPT', 'Tableau de suivi des dépenses', 'https://chatgpt.com/c/6712b3f1-depenses', [
    [YOU, '2026-10-18 10:28', 'Propose un tableau simple pour suivre les dépenses d’outils par mois face à un budget plafond.'],
    [AI, '2026-10-18 10:30', 'Un tableau en quatre colonnes : outil, coût mensuel, propriétaire, écart au plafond. Ajoutez une ligne de total qui passe en rouge au-delà de 4 000 €.'],
  ]),
  item('granola-codir', 'granola', 'reunion', 'Thomas Roux', 'Comité de direction — septembre', null, [
    [DAVID, '2026-09-18 17:00', 'La réunion du budget a eu lieu hier : on garde le plafond de dépenses à 4 000 € par mois jusqu’à fin 2026.'],
    [THOMAS, '2026-09-18 17:04', 'Je prépare le chiffrage de l’infrastructure pour 2027 d’ici octobre.'],
  ]),
  item('notion-budget-2026', 'notion', 'page', 'Espace Acme', 'Budget 2026', 'https://www.notion.so/acme/Budget-2026-11d0', [
    [DAVID, '2026-04-14 10:00', 'Budget 2026 voté : 410 k€, dont 46 k€ d’outils et d’infrastructure.'],
  ]),
  item('outlook-salon', 'outlook', 'evenement', 'Agenda de Julie', 'Salon Produit — stand Acme', 'https://outlook.office.com/calendar/item/salon-produit', [
    [JULIE, '2026-10-13 16:30', 'Stand réservé pour le 18 novembre, porte de Versailles. Budget : 2 500 €, à valider au point budget.'],
  ]),

  // ---------- Équipe : rétro, recrutement, accueil ----------
  item('granola-retro-42', 'granola', 'reunion', 'Thomas Roux', 'Rétro du sprint 42', null, [
    [THOMAS, '2026-10-16 16:00', 'Ce qui a marché : la file d’indexation tient la charge, et l’export SSO avance bien.'],
    [ALICE, '2026-10-16 16:03', 'À améliorer : trop de tests instables en CI, on perd une heure par jour.'],
    [DAVID, '2026-10-16 16:06', 'Action : Alice prend les tests instables, Thomas finit LIN-42 avant jeudi.'],
  ]),
  item('granola-entretien', 'granola', 'reunion', 'David Sperling', 'Entretien — développeur backend (Camille)', null, [
    [DAVID, '2026-10-19 14:00', 'Camille a six ans de Go et de Postgres ; très à l’aise sur les files d’attente.'],
    [THOMAS, '2026-10-19 14:40', 'Avis favorable, à confirmer par un exercice sur la recherche.'],
  ]),
  item('notion-recrutement', 'notion', 'page', 'Espace Acme', 'Recrutement : développeur backend', 'https://www.notion.so/acme/Recrutement-backend-77e3', [
    [DAVID, '2026-10-10 09:00', 'Poste ouvert depuis septembre. Trois candidats en cours ; décision attendue fin octobre. Rémunération : 55 à 65 k€ selon l’expérience.'],
  ]),
  item('outlook-offre-camille', 'outlook', 'mail', 'Boîte de David', 'Proposition d’embauche — Camille', 'https://outlook.office.com/mail/inbox/id/offre-camille', [
    [DAVID, '2026-10-20 18:10', 'Bonjour Camille, suite à nos échanges, nous avons le plaisir de vous proposer le poste de développeur backend, avec une arrivée le 1er décembre.'],
  ]),
  item('notion-accueil', 'notion', 'page', 'Espace Produit', 'Accueil des nouveaux arrivants', 'https://www.notion.so/acme-produit/Accueil-3f09', [
    [BOB, '2026-09-29 11:00', 'Première semaine : accès aux outils le lundi, binôme avec Thomas, premier ticket le mercredi.'],
  ]),
  item('cc-onboarding', 'claude_code', 'conversation', 'leon', 'Guide d’installation pour les nouveaux', null, [
    [YOU, '2026-10-11 15:20', 'Écris le guide d’installation du projet pour un nouvel arrivant, en dix étapes au plus.'],
    [AI, '2026-10-11 15:21', 'Voici un guide en huit étapes : cloner le dépôt, installer pnpm, lancer Postgres en local, copier .env.example, migrer la base, importer le jeu de démonstration, lancer le serveur, ouvrir la recherche.'],
  ]),
];

export const getItem = (id: string): CorpusItem | undefined => CORPUS.find((i) => i.id === id);
