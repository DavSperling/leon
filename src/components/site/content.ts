import {
  Compass,
  DoorOpen,
  GitPullRequest,
  Handshake,
  Headset,
  KanbanSquare,
  type LucideIcon,
} from 'lucide-react';
import { useLocale } from 'next-intl';
import type { ProviderId } from '@/capture/turn';
import {
  FAMILY_LABELS,
  FAMILY_LABELS_EN,
  PROVIDER_FAMILIES,
  PROVIDER_FAMILIES_ORDER,
  PROVIDER_LABELS,
  type ProviderFamily,
} from '@/lib/providers';

// Textes du site public. Règles de marque (docs/etudes/founder-pme-2026-10/brand.md et marketing.md) : précis, franc,
// posé ; vouvoiement, phrases courtes, ni point d'exclamation ni émoji ; aucun témoignage ni logo client inventé, aucun
// nom d'assistant concurrent, aucune promesse que le code ne tient pas (RGPD, « 15 minutes », heures gagnées…).
// Les exemples (ACME, Julie, Thomas…) sont fictifs et montrés comme tels.

export const NAV_LINKS = [
  { href: '/produit', label: 'Produit' },
  { href: '/cas-usage', label: 'Cas d’usage' },
  { href: '/connecteurs', label: 'Connecteurs' },
  { href: '/securite', label: 'Sécurité' },
  { href: '/tarifs', label: 'Tarifs' },
] as const;

export const TAGLINES = {
  hero: 'Ce qui a été promis à vos clients, retrouvé avec sa source.',
  source: 'La source, ou rien.',
  depart: 'Quand quelqu’un part, ce qu’il a promis reste.',
  dit: 'Ce qui a été dit reste dit.',
  pitch:
    'Ce qui a été dit et promis à vos clients, retrouvé avec sa source. Et quand on ne sait pas, on vous le dit.',
} as const;

// ---------- Outils ----------

export const TOOL_COUNT = Object.keys(PROVIDER_LABELS).length;

export type ToolGroup = { family: ProviderFamily; label: string; tools: ProviderId[] };

/** Les 42 outils branchables, par famille, dans l'ordre de l'écran Connexions. */
const groupsOf = (labels: Record<ProviderFamily, string>): ToolGroup[] =>
  PROVIDER_FAMILIES_ORDER.map((family) => ({
    family,
    label: labels[family],
    tools: (Object.keys(PROVIDER_FAMILIES) as ProviderId[]).filter(
      (id) => PROVIDER_FAMILIES[id] === family,
    ),
  }));

export const TOOL_GROUPS = groupsOf(FAMILY_LABELS);

export const ALL_TOOLS = TOOL_GROUPS.flatMap((g) => g.tools);

export const toolLabel = (id: ProviderId): string => PROVIDER_LABELS[id];

// ---------- Démos (données fictives, rendues comme l'écran Recherche) ----------

export type DemoSource = {
  tool: ProviderId;
  kind: string;
  title: string;
  author: string;
  date: string;
  /** Passage cité : les mots entre ** sont surlignés, comme les passages de la recherche. */
  excerpt: string;
};

export type Demo = {
  id: string;
  /** Son onglet dans la démo du haut de l'accueil. */
  tab: string;
  /** Ce qu'on tape dans la barre. */
  query: string;
  /** Réponse de Leon ; « [n] » renvoie à la n-ième source. */
  answer: string;
  sources: DemoSource[];
  /** Aucune source ne répond : Leon le dit. */
  unknown?: boolean;
};

export const DEMOS: Demo[] = [
  {
    id: 'promesse',
    tab: 'Une promesse client',
    query: 'qu’a-t-on promis à ACME sur la V2 ?',
    answer:
      'Au point mensuel du 3 oct., Julie s’est engagée sur une livraison de la V2 le 15 nov. [1]. Le devis signé reprend cette date, mais exclut la reprise des données [2]. Le ticket de reprise est toujours ouvert [3].',
    sources: [
      {
        tool: 'granola',
        kind: 'Réunion',
        title: 'Point mensuel ACME',
        author: 'Julie Martin',
        date: '3 oct. 2026',
        excerpt:
          '« On peut **s’engager sur le 15 novembre** pour la V2, hors reprise de l’historique. »',
      },
      {
        tool: 'hubspot',
        kind: 'Note',
        title: 'Devis V2 signé',
        author: 'Karim Benali',
        date: '7 oct. 2026',
        excerpt:
          'Livraison au **15/11/2026**. La **reprise des données** fait l’objet d’un devis à part.',
      },
      {
        tool: 'linear',
        kind: 'Ticket',
        title: 'ACME : reprise des données',
        author: 'Sophie Laurent',
        date: '21 oct. 2026',
        excerpt: 'En attente du **fichier d’export** côté client. Statut : à faire.',
      },
    ],
  },
  {
    id: 'bug',
    tab: 'Un bug connu',
    query: 'ce bug d’export PDF est-il connu ?',
    answer:
      'Oui. Trois clients l’ont signalé depuis lundi [1]. L’équipe l’a reproduit sur les factures de plus de 50 lignes [2], et le correctif est en revue [3].',
    sources: [
      {
        tool: 'intercom',
        kind: 'Conversation',
        title: 'Export PDF vide',
        author: 'Support',
        date: '20 oct. 2026',
        excerpt: 'Le client reçoit un **PDF vide** quand il exporte la facture d’octobre.',
      },
      {
        tool: 'linear',
        kind: 'Ticket',
        title: 'Export PDF : page blanche au-delà de 50 lignes',
        author: 'Thomas Girard',
        date: '21 oct. 2026',
        excerpt: 'Reproduit : **au-delà de 50 lignes**, le rendu s’arrête sans erreur.',
      },
      {
        tool: 'github',
        kind: 'PR',
        title: 'fix(export) : pagination du rendu PDF',
        author: 'Thomas Girard',
        date: '22 oct. 2026',
        excerpt: 'Découpe le rendu **par page** au lieu d’un seul bloc. Revue demandée.',
      },
    ],
  },
  {
    id: 'depart',
    tab: 'Un départ',
    query: 'que suivait Thomas avant son départ ?',
    answer:
      'Thomas suivait deux sujets ouverts : la refonte du tableau de bord de Nordia, à livrer fin novembre [1], et la relance du devis de Verlant, promise pour la semaine dernière [2]. Ses notes de passation sont dans Notion [3].',
    sources: [
      {
        tool: 'asana',
        kind: 'Tâche',
        title: 'Nordia : refonte du tableau de bord',
        author: 'Thomas Girard',
        date: '14 oct. 2026',
        excerpt: 'Échéance **28 nov.** Maquettes validées par le client le 9 oct.',
      },
      {
        tool: 'fireflies',
        kind: 'Réunion',
        title: 'Verlant : point devis',
        author: 'Thomas Girard',
        date: '10 oct. 2026',
        excerpt: '« Je vous **renvoie le devis ajusté** d’ici la fin de la semaine prochaine. »',
      },
      {
        tool: 'notion',
        kind: 'Page',
        title: 'Passation : comptes de Thomas',
        author: 'Thomas Girard',
        date: '17 oct. 2026',
        excerpt: 'Contacts, accès et **sujets en cours**, compte par compte.',
      },
    ],
  },
  {
    id: 'inconnu',
    tab: 'Sans source',
    query: 'quel tarif a-t-on accordé à Verlant en 2024 ?',
    answer:
      'Je ne sais pas. Aucune source gardée ne parle d’un tarif accordé à Verlant en 2024. Le premier devis retrouvé date de mars 2025 [1].',
    unknown: true,
    sources: [
      {
        tool: 'pipedrive',
        kind: 'Note',
        title: 'Verlant : premier devis',
        author: 'Karim Benali',
        date: '12 mars 2025',
        excerpt: 'Premier devis envoyé, **tarif standard**, sans remise.',
      },
    ],
  },
];

// ---------- Équipes (cas d'usage) ----------

export type Team = {
  slug: string;
  label: string;
  icon: LucideIcon;
  /** Une ligne, pour les cartes et le menu. */
  pitch: string;
  headline: string;
  lead: string;
  /** Questions qu'on tape dans la barre ; celles en code sont des filtres réels de la recherche. */
  questions: string[];
  /** Ce qui change, en trois points. */
  gains: Array<{ title: string; text: string }>;
  demo: Demo;
  tools: ProviderId[];
};

export const TEAMS: Team[] = [
  {
    slug: 'direction',
    label: 'Direction',
    icon: Compass,
    pitch: 'Savoir ce qui a été dit et promis, sans refaire l’enquête.',
    headline: 'Ce qui a été promis à vos clients, retrouvé avec sa source.',
    lead: 'Une réunion d’il y a trois mois, un devis, un échange de mails. Quand un client conteste, Leon retrouve la trace et la cite. Quand rien ne répond, il le dit.',
    questions: [
      'qu’a-t-on promis à ce client en réunion le mois dernier ?',
      'le client dit que ce n’était pas dans le périmètre : qu’a-t-on écrit ?',
      'que suivait le chef de projet qui vient de partir ?',
      'type:réunion depuis:7j',
    ],
    gains: [
      {
        title: 'Une réponse citée',
        text: 'Chaque phrase renvoie à sa source : la réunion, la note, le mail. On ouvre l’original d’un clic.',
      },
      {
        title: 'Les départs ne coûtent plus la mémoire',
        text: 'Ce qu’une personne a écrit dans les outils partagés de l’équipe reste interrogeable après son départ.',
      },
      {
        title: 'Le brut, pas un résumé',
        text: 'Leon garde chaque élément tel quel. Il ne réécrit pas l’histoire, il la retrouve.',
      },
    ],
    demo: DEMOS[0] as Demo,
    tools: ['hubspot', 'outlook', 'granola', 'notion', 'asana', 'fathom'],
  },
  {
    slug: 'ventes',
    label: 'Ventes',
    icon: Handshake,
    pitch: 'Arriver au rendez-vous en sachant tout ce qui a été dit.',
    headline: 'Arriver au rendez-vous en sachant tout ce qui a été dit.',
    lead: 'Notes de CRM, enregistrements d’appels, mails : avant chaque rendez-vous, l’historique du client tient en une recherche, au lieu de trois outils à fouiller.',
    questions: [
      'où en est la négociation avec ACME ?',
      'qu’a demandé ce prospect lors du dernier appel ?',
      '"renouvellement du contrat"',
      'de:karim depuis:3m',
    ],
    gains: [
      {
        title: 'Tout l’historique d’un compte',
        text: 'CRM, réunions enregistrées et mails, dans une seule liste de résultats, les plus utiles d’abord.',
      },
      {
        title: 'Les mots exacts',
        text: 'Une phrase entre guillemets retrouve l’endroit précis où elle a été écrite ou dite.',
      },
      {
        title: 'Rien à ressaisir',
        text: 'Leon relève les outils toutes les 15 minutes. Personne ne remplit de fiche pour lui.',
      },
    ],
    demo: DEMOS[0] as Demo,
    tools: ['hubspot', 'pipedrive', 'attio', 'folk', 'close', 'gong', 'leexi', 'fathom', 'outlook'],
  },
  {
    slug: 'support',
    label: 'Support client',
    icon: Headset,
    pitch: 'Savoir si un bug est connu, avec le ticket à l’appui.',
    headline: 'Ce bug est-il connu ? La réponse, avec le ticket.',
    lead: 'Conversations de support, tickets de l’équipe produit, correctifs en revue : Leon relie ce que le client écrit à ce que l’équipe sait déjà.',
    questions: [
      'ce bug d’export est-il connu ?',
      'que lui a-t-on répondu la dernière fois ?',
      'le correctif est-il livré ?',
      'type:ticket depuis:7j',
    ],
    gains: [
      {
        title: 'Le support et le produit, ensemble',
        text: 'Une conversation client et le ticket qui la règle remontent dans la même recherche.',
      },
      {
        title: 'Une réponse cohérente',
        text: 'Ce que l’équipe a déjà répondu se retrouve avant de répondre à nouveau.',
      },
      {
        title: 'Le lien vers l’original',
        text: 'Chaque résultat s’ouvre dans l’outil d’où il vient, là où on agit.',
      },
    ],
    demo: DEMOS[1] as Demo,
    tools: [
      'intercom',
      'zendesk',
      'front',
      'crisp',
      'helpscout',
      'freshdesk',
      'plain',
      'missive',
      'linear',
      'jira',
    ],
  },
  {
    slug: 'produit-tech',
    label: 'Produit et tech',
    icon: GitPullRequest,
    pitch: 'La PR, ses revues, le ticket et la discussion autour.',
    headline: 'La PR, ses revues, le ticket, et la discussion autour.',
    lead: 'Leon garde l’histoire autour du code : pourquoi un choix a été fait, qui l’a relu, ce qui reste ouvert. Votre assistant de code l’interroge par MCP, et le point du matin l’attend au démarrage.',
    questions: [
      'la PR qui a touché au jeton de rafraîchissement',
      'outil:github type:ticket',
      'pourquoi a-t-on abandonné la file Redis ?',
      'avant:2026-10-01 "migration"',
    ],
    gains: [
      {
        title: 'Le pourquoi, pas seulement le quoi',
        text: 'Revues, tickets et réunions de conception remontent avec la PR qu’ils expliquent.',
      },
      {
        title: 'Dans votre assistant',
        text: 'Le serveur MCP de Leon donne à votre assistant de code la mémoire de l’équipe, avec les mêmes droits que vous.',
      },
      {
        title: 'Le point du matin',
        text: 'Ce que vous avez fait, ce qui a bougé, ce qui reste ouvert : 250 mots, prêts au démarrage.',
      },
    ],
    demo: DEMOS[1] as Demo,
    tools: [
      'github',
      'gitlab',
      'linear',
      'jira',
      'sentry',
      'notion',
      'confluence',
      'shortcut',
      'plane',
    ],
  },
  {
    slug: 'projets',
    label: 'Chefs de projet',
    icon: KanbanSquare,
    pitch: 'Des passations qui ne dépendent plus de la mémoire d’une personne.',
    headline: 'Quand quelqu’un part, ce qu’il a promis reste.',
    lead: 'Agences, ESN, cabinets : les engagements vivent dans les réunions et les tâches. Leon les garde, et une passation ne dépend plus de la mémoire d’une seule personne.',
    questions: [
      'que suivait Thomas avant son départ ?',
      'quelles décisions ont été prises sur le lot 2 ?',
      'qu’est-ce que le client a validé ?',
      'type:réunion depuis:7j',
    ],
    gains: [
      {
        title: 'Les réunions retrouvées',
        text: 'Les transcriptions de vos outils de réunion sont gardées et cherchées comme le reste.',
      },
      {
        title: 'Les engagements tenus',
        text: 'Ce qui a été promis en réunion se retrouve à côté de la tâche qui le suit.',
      },
      {
        title: 'Une discussion par sujet',
        text: 'Ouvrez une discussion sur un projet : Leon cherche dans toutes les sources et répond en les citant.',
      },
    ],
    demo: DEMOS[2] as Demo,
    tools: [
      'asana',
      'clickup',
      'monday',
      'basecamp',
      'trello',
      'airtable',
      'miro',
      'granola',
      'fireflies',
      'tldv',
      'claap',
      'circleback',
    ],
  },
  {
    slug: 'arrivees',
    label: 'Arrivées',
    icon: DoorOpen,
    pitch: 'Les nouveaux trouvent seuls ce que l’équipe sait déjà.',
    headline: 'Un nouveau venu trouve seul ce que l’équipe sait déjà.',
    lead: 'Les premières semaines, on pose les questions que tout le monde a oubliées. Leon y répond avec les sources de l’équipe, sans mobiliser un collègue à chaque fois.',
    questions: [
      'comment déploie-t-on en production ?',
      'qui s’occupe du compte ACME ?',
      'pourquoi ce client a-t-il un tarif particulier ?',
      'budget depuis:3m',
    ],
    gains: [
      {
        title: 'Un livret d’accueil qu’on interroge',
        text: 'Pages, tickets et réunions passées répondent aux questions des premiers jours.',
      },
      {
        title: 'Le contexte d’un compte',
        text: 'Qui suit quel client, ce qui a été dit, ce qui est en cours : avant le premier rendez-vous.',
      },
      {
        title: 'Ce qui est privé le reste',
        text: 'Ce que lisent les outils branchés est partagé avec l’équipe, sauf une boîte Outlook ; les conversations d’IA, discussions et notes de chacun ne sont visibles que de lui.',
      },
    ],
    demo: DEMOS[2] as Demo,
    tools: ['notion', 'confluence', 'github', 'linear', 'hubspot', 'outlook'],
  },
];

export const teamBySlug = (slug: string, teams: Team[]): Team | undefined =>
  teams.find((t) => t.slug === slug);

// ---------- Situations (cas d'usage concrets, docs/etudes/cas-usage-2026-10) ----------
// Seulement ce que le code fait déjà : les cas « en partie » de l'étude n'entrent pas ici.

export type Situation = {
  id: string;
  /** L'équipe dont la page montre aussi la situation. */
  team: Team['slug'];
  who: string;
  moment: string;
  title: string;
  /** Ce qu'on tape ou ce qu'on demande. */
  question: string;
  does: string;
  gain: string;
  tools: ProviderId[];
  /** Ce que Leon lit en plus des outils, sans logo (conversations d'IA, sessions de code). */
  alsoReads?: string;
};

export const SITUATIONS: Situation[] = [
  {
    id: 'reprendre',
    team: 'produit-tech',
    who: 'Développeuse, éditeur SaaS de 25 personnes',
    moment: 'Lundi, 9 h',
    title: 'Reprendre là où on s’était arrêté',
    question: 'où en étais-je sur le dépôt facturation ?',
    does: 'Vendredi, elle a laissé une migration à moitié faite. À l’ouverture de la session, le point du matin du dépôt l’attend dans son assistant de code : ce qu’elle a fait, la revue arrivée depuis, l’issue rouverte, ce qui reste ouvert.',
    gain: 'Elle et son assistant repartent du bon endroit, sans rouvrir trois onglets.',
    tools: ['github'],
    alsoReads: 'Ses sessions de code',
  },
  {
    id: 'deja-essaye',
    team: 'produit-tech',
    who: 'Développeur, startup de 12 personnes',
    moment: 'Avant de réécrire un module',
    title: 'Vérifier ce que l’équipe a déjà tranché',
    question: 'a-t-on déjà essayé de générer les PDF côté navigateur ?',
    does: 'Il demande à son assistant de code de vérifier dans Leon, par MCP. Leon retrouve la PR fermée en mars, la revue qui explique l’abandon (des accents mal rendus) et la décision notée dans Notion.',
    gain: 'L’assistant ne refait pas un chemin déjà payé, ou dit ce qui a changé depuis.',
    tools: ['github', 'linear', 'notion'],
  },
  {
    id: 'conversation-ia',
    team: 'produit-tech',
    who: 'Chef de produit, PME de 40 personnes',
    moment: 'Refaire une analyse d’il y a un mois',
    title: 'Retrouver ce qu’on a trouvé avec son assistant d’IA',
    question: 'la requête de rétention par cohorte sans les comptes de test',
    does: 'En septembre, il a mis au point la requête avec son assistant d’IA, pièges compris. La conversation, captée par l’extension, se retrouve en une recherche, à côté du ticket qui demandait la courbe. Elle n’est visible que de lui.',
    gain: 'La version finale, pas le premier essai qui était faux, avec le raisonnement autour.',
    tools: ['linear'],
    alsoReads: 'Ses conversations d’IA',
  },
  {
    id: 'astreinte',
    team: 'produit-tech',
    who: 'Développeuse d’astreinte, SaaS de 30 personnes',
    moment: '22 h, une erreur sur un module inconnu',
    title: 'Savoir si l’incident est déjà arrivé',
    question: 'cette erreur d’import est-elle déjà arrivée ?',
    does: 'Leon retrouve l’issue Sentry de mars, la PR qui l’avait corrigée, le ticket d’incident et le post-mortem. Le lendemain, une discussion en tire le brouillon du nouveau post-mortem.',
    gain: 'Elle applique le contournement connu au lieu de réveiller l’auteur du module.',
    tools: ['sentry', 'github', 'linear', 'notion'],
  },
  {
    id: 'renouvellement',
    team: 'ventes',
    who: 'Responsable succès client, SaaS de 70 personnes',
    moment: '30 jours avant un renouvellement',
    title: 'Tout ce qui a coincé chez ce client',
    question: 'qu’est-ce qui s’est mal passé chez Nordia depuis un an ?',
    does: 'Il a repris le compte en juin. Leon croise les conversations de support, les bugs liés au client, les appels enregistrés et les notes du CRM, puis dit ce qui est corrigé, avec la date, et ce qui ne l’est pas.',
    gain: 'Il découvre les problèmes du client avant le rendez-vous, pas pendant.',
    tools: ['intercom', 'linear', 'fathom', 'hubspot'],
  },
];

// ---------- Ce que fait Leon (page Produit) ----------

export type Pillar = { id: string; kicker: string; title: string; text: string; points: string[] };

export const PILLARS: Pillar[] = [
  {
    id: 'capte',
    kicker: 'Capter',
    title: 'Il se branche sur vos outils et sur vos assistants d’IA.',
    text: `${TOOL_COUNT} outils branchables, par une clé ou un bouton de connexion, relevés toutes les 15 minutes. Les conversations avec vos assistants d’IA arrivent par l’extension du navigateur et par votre assistant de code.`,
    points: [
      'Relève toutes les 15 minutes, sans webhook',
      'Extension : consentement, un interrupteur par site, jamais en navigation privée',
      'Assistant de code : chaque session envoyée à sa fin',
    ],
  },
  {
    id: 'garde',
    kicker: 'Garder',
    title: 'Le brut, tel quel, et qui peut le voir.',
    text: 'Leon ne résume pas et ne tient pas de fiches. Il garde chaque élément tel qu’il a été écrit, avec un lien vers l’original, et masque les secrets reconnaissables avant de les stocker.',
    points: [
      'Chaque résultat s’ouvre dans son outil d’origine',
      'Conversations d’IA, discussions et notes privées à leur auteur',
      'Clés d’API, jetons et mots de passe de .env masqués avant stockage',
    ],
  },
  {
    id: 'retrouve',
    kicker: 'Retrouver',
    title: 'Une recherche, toutes les sources, la réponse en tête.',
    text: 'Plein texte et sens, fusionnés, toujours après le filtre des droits. Une réponse rédigée arrive au-dessus des résultats, chaque phrase renvoyant à sa source.',
    points: [
      'Filtres écrits dans la barre : de:, outil:, type:, depuis:, avant:',
      'Les mots exacts entre guillemets',
      'Fautes de frappe tolérées dans les titres',
    ],
  },
  {
    id: 'discute',
    kicker: 'Discuter',
    title: 'Une discussion qui cite, ou qui dit « je ne sais pas ».',
    text: 'Leon cherche, lit et recoupe avant de répondre. Chaque affirmation porte sa source. Sans source, il le dit au lieu d’inventer.',
    points: [
      'Discussions privées, supprimables',
      'Le point du matin : fait, bougé, ouvert',
      'Interrogeable depuis votre assistant par MCP',
    ],
  },
];

// La syntaxe réelle de la barre de recherche (src/components/search/examples.ts).
export const SYNTAX = [
  { code: 'de:julie', text: 'ce qu’une personne a écrit' },
  { code: 'outil:github', text: 'un seul outil' },
  { code: 'type:réunion', text: 'ticket, page, mail, réunion, conversation…' },
  { code: 'depuis:7j', text: 'les 7 derniers jours, semaines ou mois' },
  { code: 'avant:2026-10-01', text: 'avant une date' },
  { code: '"phrase exacte"', text: 'les mots tels quels' },
] as const;

/** Le point du matin, tel que le rédige Leon (briefing-prompt.ts) : trois parties, 250 mots au plus. Exemple fictif. */
export const BRIEFING = [
  {
    title: 'Ce que vous avez fait',
    items: [
      'Relu et fusionné la PR de pagination de l’export PDF.',
      'Répondu à ACME sur le calendrier de la V2.',
    ],
  },
  {
    title: 'Ce qui a bougé',
    items: [
      'Sophie a ouvert le ticket de reprise des données ACME.',
      'Deux nouvelles conversations de support citent l’export.',
    ],
  },
  {
    title: 'Ce qui reste ouvert',
    items: ['Le devis ajusté pour Verlant, promis la semaine dernière.'],
  },
] as const;

// ---------- Sécurité : ce qui est vrai dans le code, et ce qui ne l'est pas encore ----------

export const SECURITY_FACTS = [
  {
    title: 'Chaque entreprise dans son espace',
    text: 'Les données d’une organisation sont isolées des autres dans la base, par la sécurité par ligne de Postgres. Des tests le vérifient.',
  },
  {
    title: 'Leon voit ce que vous voyez',
    text: 'La recherche, la discussion et le serveur MCP passent par les mêmes droits que la personne qui demande. Le filtre des droits passe avant le classement.',
  },
  {
    title: 'Les conversations restent privées',
    text: 'Les conversations captées avec vos assistants d’IA, vos discussions avec Leon et vos notes ne sont visibles que de vous.',
  },
  {
    title: 'Clés chiffrées',
    text: 'Les clés d’API collées et les jetons de connexion des outils sont chiffrés (AES-256-GCM), liés à leur ligne.',
  },
  {
    title: 'Secrets masqués avant stockage',
    text: 'Clés à préfixe connu, clés privées, en-têtes d’autorisation, lignes de .env : masqués avant d’être gardés.',
  },
  {
    title: 'Une extension qui demande',
    text: 'Écran de consentement, un interrupteur par site, une pause. Rien en navigation privée, jamais de pièce jointe.',
  },
  {
    title: 'Ce que lisent les assistants est noté',
    text: 'Un journal garde ce que chaque assistant a lu par MCP. Les jetons personnels se révoquent à tout moment.',
  },
  {
    title: 'Une seule base',
    text: 'Le texte, l’index et les droits tiennent dans Postgres, sans service de recherche à part.',
  },
] as const;

/** Ce que Leon ne fait pas encore : on le dit (voix « franc »). */
export const NOT_YET = [
  'Les droits de l’outil d’origine ne sont pas encore repris : ce que lit une connexion est visible de toute l’équipe, sauf une boîte mail (Outlook, Gmail), Google Drive et Slack, privés à qui les branche.',
  'Un mot de passe écrit en langage courant (« le mot de passe c’est… ») peut échapper au masquage.',
  'Pas encore d’export, ni d’effacement complet depuis l’interface.',
  'Pas de certification (ISO 27001, SOC 2) à ce jour.',
] as const;

// ---------- Tarifs (proposition de docs/etudes/founder-pme-2026-10/pricing.md, pas encore arrêtée) ----------

export const PLANS = [
  {
    id: 'pilote',
    name: 'Pilote',
    price: 'Gratuit',
    unit: '30 jours',
    text: 'Pour essayer sur une équipe, avec vos vrais outils.',
    features: [
      'Une équipe de 10 personnes au plus',
      `Les ${TOOL_COUNT} connecteurs`,
      'Recherche, réponse citée et discussions',
      'Point du matin et serveur MCP',
      'Extension du navigateur et assistant de code',
    ],
    cta: 'Commencer le pilote',
    featured: false,
  },
  {
    id: 'equipe',
    name: 'Équipe',
    price: '25 €',
    unit: 'HT par utilisateur actif et par mois',
    text: 'Pour toute l’entreprise, sans engagement.',
    features: [
      'Tout le pilote, sans limite d’équipe',
      'Seuls les comptes actifs du mois sont comptés',
      'Sans engagement, résiliable chaque mois',
    ],
    cta: 'Créer un espace',
    featured: true,
  },
  {
    id: 'dediee',
    name: 'Dédiée',
    price: 'Sur devis',
    unit: 'selon vos besoins',
    text: 'Pour les entreprises qui veulent leur propre instance.',
    features: [
      'Tout le plan Équipe',
      'Une instance et une base pour vous seuls',
      'Le modèle d’IA de chaque étape, à votre choix',
    ],
    cta: 'Commencer par le pilote',
    featured: false,
  },
] as const;

export const FAQ = [
  {
    q: 'Faut-il changer d’outils ?',
    a: `Non, s’ils sont parmi les ${TOOL_COUNT} connecteurs : Leon s’y branche par une clé d’API ou un bouton de connexion, et relève ce qui change toutes les 15 minutes.`,
  },
  {
    q: 'Qui voit quoi ?',
    a: 'Ce que lit une connexion est visible de toute l’équipe, comme dans un outil partagé, sauf une boîte mail (Outlook, Gmail), Google Drive et Slack, privés à qui les branche. Les conversations captées avec vos assistants d’IA, vos discussions et vos notes ne sont visibles que de vous.',
  },
  {
    q: 'Et quand Leon ne sait pas ?',
    a: 'Il le dit. Chaque affirmation d’une réponse renvoie à sa source ; sans source, la réponse est « je ne sais pas », pas une supposition.',
  },
  {
    q: 'Leon résume-t-il nos documents ?',
    a: 'Non. Il garde le brut, tel qu’il a été écrit, et l’indexe pour le retrouver. Les réponses citent ce brut, avec un lien vers l’original.',
  },
  {
    q: 'Peut-on l’interroger depuis un assistant d’IA ?',
    a: 'Oui, par MCP, avec un jeton personnel que vous créez et révoquez dans les réglages. L’assistant voit ce que vous voyez, rien de plus.',
  },
  {
    q: 'Qu’est-ce qu’un utilisateur actif ?',
    a: 'Une personne qui s’est servie de Leon dans le mois. Un compte resté inactif n’est pas compté.',
  },
] as const;

// ---------- English ----------
// Le même site en anglais : une réécriture, pas une traduction mot à mot, avec les mêmes faits. Les filtres sont les
// alias anglais que la recherche lit (from:, tool:, type:meeting, since:7d, before:). Exemples tout aussi fictifs.

/** Le type d'une table française `as const`, chaînes élargies : même forme, même nombre d'entrées. */
type Twin<T> = T extends string ? string : { readonly [K in keyof T]: Twin<T[K]> };

const NAV_LINKS_EN: Twin<typeof NAV_LINKS> = [
  { href: '/produit', label: 'Product' },
  { href: '/cas-usage', label: 'Use cases' },
  { href: '/connecteurs', label: 'Connectors' },
  { href: '/securite', label: 'Security' },
  { href: '/tarifs', label: 'Pricing' },
];

const TAGLINES_EN: Twin<typeof TAGLINES> = {
  hero: 'What you promised your clients, found and cited.',
  source: 'The source, or nothing.',
  depart: 'When someone leaves, their promises stay.',
  dit: 'What was said stays said.',
  pitch:
    'What was said and promised to your clients, found with its source. When Leon doesn’t know, it says so.',
};

const DEMOS_EN: Demo[] = [
  {
    id: 'promesse',
    tab: 'A client promise',
    query: 'what did we promise ACME for V2?',
    answer:
      'At the Oct 3 monthly check-in, Julie committed to shipping V2 on Nov 15 [1]. The signed quote keeps that date but leaves out the data migration [2]. The migration ticket is still open [3].',
    sources: [
      {
        tool: 'granola',
        kind: 'Meeting',
        title: 'ACME monthly check-in',
        author: 'Julie Martin',
        date: 'Oct 3, 2026',
        excerpt: '“We can **commit to November 15** for V2, history migration excluded.”',
      },
      {
        tool: 'hubspot',
        kind: 'Note',
        title: 'Signed V2 quote',
        author: 'Karim Benali',
        date: 'Oct 7, 2026',
        excerpt: 'Delivery on **11/15/2026**. The **data migration** is quoted separately.',
      },
      {
        tool: 'linear',
        kind: 'Ticket',
        title: 'ACME: data migration',
        author: 'Sophie Laurent',
        date: 'Oct 21, 2026',
        excerpt: 'Waiting on the **export file** from the client. Status: Todo.',
      },
    ],
  },
  {
    id: 'bug',
    tab: 'A known bug',
    query: 'is this PDF export bug already known?',
    answer:
      'Yes. Three customers have reported it since Monday [1]. The team reproduced it on invoices longer than 50 lines [2], and the fix is in review [3].',
    sources: [
      {
        tool: 'intercom',
        kind: 'Conversation',
        title: 'Empty PDF export',
        author: 'Support',
        date: 'Oct 20, 2026',
        excerpt: 'The customer gets a **blank PDF** when exporting the October invoice.',
      },
      {
        tool: 'linear',
        kind: 'Ticket',
        title: 'PDF export: blank page past 50 lines',
        author: 'Thomas Girard',
        date: 'Oct 21, 2026',
        excerpt: 'Reproduced: **past 50 lines**, rendering stops without an error.',
      },
      {
        tool: 'github',
        kind: 'PR',
        title: 'fix(export): paginate PDF rendering',
        author: 'Thomas Girard',
        date: 'Oct 22, 2026',
        excerpt: 'Renders **page by page** instead of one block. Review requested.',
      },
    ],
  },
  {
    id: 'depart',
    tab: 'Someone left',
    query: 'what was Thomas working on before he left?',
    answer:
      'Thomas had two open items: the Nordia dashboard redesign, due at the end of November [1], and the revised quote for Verlant, promised for last week [2]. His handover notes are in Notion [3].',
    sources: [
      {
        tool: 'asana',
        kind: 'Task',
        title: 'Nordia: dashboard redesign',
        author: 'Thomas Girard',
        date: 'Oct 14, 2026',
        excerpt: 'Due **Nov 28**. Mockups approved by the client on Oct 9.',
      },
      {
        tool: 'fireflies',
        kind: 'Meeting',
        title: 'Verlant: quote review',
        author: 'Thomas Girard',
        date: 'Oct 10, 2026',
        excerpt: '“I’ll **send you the revised quote** by the end of next week.”',
      },
      {
        tool: 'notion',
        kind: 'Page',
        title: 'Handover: Thomas’s accounts',
        author: 'Thomas Girard',
        date: 'Oct 17, 2026',
        excerpt: 'Contacts, access and **open items**, account by account.',
      },
    ],
  },
  {
    id: 'inconnu',
    tab: 'No source',
    query: 'what price did we give Verlant in 2024?',
    answer:
      'I don’t know. No source on record mentions a price agreed with Verlant in 2024. The first quote on record is from March 2025 [1].',
    unknown: true,
    sources: [
      {
        tool: 'pipedrive',
        kind: 'Note',
        title: 'Verlant: first quote',
        author: 'Karim Benali',
        date: 'Mar 12, 2025',
        excerpt: 'First quote sent at **standard pricing**, no discount.',
      },
    ],
  },
];

const TEAMS_EN: Team[] = [
  {
    slug: 'direction',
    label: 'Leadership',
    icon: Compass,
    pitch: 'Know what was said and promised, without digging for it.',
    headline: 'What you promised your clients, found and cited.',
    lead: 'A meeting three months ago, a quote, an email thread. When a client disputes something, Leon finds the record and cites it. When there is nothing on record, it says so.',
    questions: [
      'what did we promise this client in last month’s meeting?',
      'the client says it was out of scope: what did we write?',
      'what was the project manager who just left working on?',
      'type:meeting since:7d',
    ],
    gains: [
      {
        title: 'Answers with citations',
        text: 'Every sentence links to its source: the meeting, the note, the email. One click opens the original.',
      },
      {
        title: 'People leave, the record stays',
        text: 'What someone wrote in the team’s shared tools can still be searched after they leave.',
      },
      {
        title: 'The original, not a summary',
        text: 'Leon keeps each item exactly as written. It finds the history instead of rewriting it.',
      },
    ],
    demo: DEMOS_EN[0] as Demo,
    tools: ['hubspot', 'outlook', 'granola', 'notion', 'asana', 'fathom'],
  },
  {
    slug: 'ventes',
    label: 'Sales',
    icon: Handshake,
    pitch: 'Walk into the meeting knowing what has already been said.',
    headline: 'Walk into the meeting knowing what has already been said.',
    lead: 'CRM notes, call recordings, emails. Before each meeting, the account’s history is one search away instead of spread across three tools.',
    questions: [
      'where are we in the ACME negotiation?',
      'what did this prospect ask on the last call?',
      '"contract renewal"',
      'from:karim since:3mo',
    ],
    gains: [
      {
        title: 'The whole account history',
        text: 'CRM, recorded meetings and email in one list of results, most useful first.',
      },
      {
        title: 'The exact words',
        text: 'A phrase in quotes finds the exact place it was written or said.',
      },
      {
        title: 'Nothing to re-enter',
        text: 'Leon syncs your tools every 15 minutes. Nobody fills in a record for it.',
      },
    ],
    demo: DEMOS_EN[0] as Demo,
    tools: ['hubspot', 'pipedrive', 'attio', 'folk', 'close', 'gong', 'leexi', 'fathom', 'outlook'],
  },
  {
    slug: 'support',
    label: 'Customer support',
    icon: Headset,
    pitch: 'Know whether a bug is already known, with the ticket to show for it.',
    headline: 'Is this a known bug? The answer comes with the ticket.',
    lead: 'Support conversations, product tickets, fixes in review. Leon connects what the customer writes to what the team already knows.',
    questions: [
      'is this export bug already known?',
      'what did we tell them last time?',
      'has the fix shipped?',
      'type:ticket since:7d',
    ],
    gains: [
      {
        title: 'Support and product in one search',
        text: 'A customer conversation and the ticket that fixes it come up in the same search.',
      },
      {
        title: 'Consistent replies',
        text: 'What the team already replied is in front of you before you reply again.',
      },
      {
        title: 'A link to the original',
        text: 'Every result opens in the tool it came from, where you can act on it.',
      },
    ],
    demo: DEMOS_EN[1] as Demo,
    tools: [
      'intercom',
      'zendesk',
      'front',
      'crisp',
      'helpscout',
      'freshdesk',
      'plain',
      'missive',
      'linear',
      'jira',
    ],
  },
  {
    slug: 'produit-tech',
    label: 'Product and engineering',
    icon: GitPullRequest,
    pitch: 'The PR, its reviews, the ticket and the discussion around it.',
    headline: 'The PR, its reviews, the ticket, and the discussion around it.',
    lead: 'Leon keeps the history around the code: why a choice was made, who reviewed it, what is still open. Your coding assistant queries it over MCP, and the morning briefing is waiting when a session starts.',
    questions: [
      'the PR that changed the refresh token',
      'tool:github type:ticket',
      'why did we drop the Redis queue?',
      'before:2026-10-01 "migration"',
    ],
    gains: [
      {
        title: 'The why behind a change',
        text: 'Reviews, tickets and design meetings come up with the PR they explain.',
      },
      {
        title: 'Inside your assistant',
        text: 'Leon’s MCP server gives your coding assistant the team’s memory, with the same permissions as you.',
      },
      {
        title: 'The morning briefing',
        text: 'What you did, what changed, what is still open: 250 words, ready when you start.',
      },
    ],
    demo: DEMOS_EN[1] as Demo,
    tools: [
      'github',
      'gitlab',
      'linear',
      'jira',
      'sentry',
      'notion',
      'confluence',
      'shortcut',
      'plane',
    ],
  },
  {
    slug: 'projets',
    label: 'Project managers',
    icon: KanbanSquare,
    pitch: 'Handovers that no longer depend on one person’s memory.',
    headline: 'When someone leaves, their promises stay.',
    lead: 'Agencies, IT services firms, consultancies: commitments live in meetings and tasks. Leon keeps them, so a handover no longer depends on what one person remembers.',
    questions: [
      'what was Thomas working on before he left?',
      'what was decided about phase 2?',
      'what did the client sign off on?',
      'type:meeting since:7d',
    ],
    gains: [
      {
        title: 'Meetings you can search',
        text: 'Transcripts from your meeting tools are kept and searched like everything else.',
      },
      {
        title: 'Commitments kept',
        text: 'What was promised in a meeting shows up next to the task that tracks it.',
      },
      {
        title: 'One discussion per topic',
        text: 'Open a discussion about a project: Leon searches every source and answers with citations.',
      },
    ],
    demo: DEMOS_EN[2] as Demo,
    tools: [
      'asana',
      'clickup',
      'monday',
      'basecamp',
      'trello',
      'airtable',
      'miro',
      'granola',
      'fireflies',
      'tldv',
      'claap',
      'circleback',
    ],
  },
  {
    slug: 'arrivees',
    label: 'New hires',
    icon: DoorOpen,
    pitch: 'New people find what the team already knows, on their own.',
    headline: 'New hires find what the team already knows, on their own.',
    lead: 'In the first weeks, you ask the questions everyone else has forgotten. Leon answers them from the team’s sources, without pulling a colleague away each time.',
    questions: [
      'how do we deploy to production?',
      'who handles the ACME account?',
      'why does this client have special pricing?',
      'budget since:3mo',
    ],
    gains: [
      {
        title: 'A handbook you can question',
        text: 'Pages, tickets and past meetings answer the first-week questions.',
      },
      {
        title: 'The context on an account',
        text: 'Who handles which client, what was said, what is in progress: before the first meeting.',
      },
      {
        title: 'Private stays private',
        text: 'What connected tools read is shared with the team, except an Outlook mailbox. Each person’s AI conversations, discussions and notes are visible only to them.',
      },
    ],
    demo: DEMOS_EN[2] as Demo,
    tools: ['notion', 'confluence', 'github', 'linear', 'hubspot', 'outlook'],
  },
];

const SITUATIONS_EN: Situation[] = [
  {
    id: 'reprendre',
    team: 'produit-tech',
    who: 'Developer, 25-person SaaS company',
    moment: 'Monday, 9 a.m.',
    title: 'Pick up where you left off',
    question: 'where was I on the billing repo?',
    does: 'On Friday she left a migration half done. When her session opens, the repo’s morning briefing is waiting in her coding assistant: what she did, the review that came in since, the reopened issue, what is still open.',
    gain: 'She and her assistant start from the right place, without reopening three tabs.',
    tools: ['github'],
    alsoReads: 'Her coding sessions',
  },
  {
    id: 'deja-essaye',
    team: 'produit-tech',
    who: 'Developer, 12-person startup',
    moment: 'Before rewriting a module',
    title: 'Check what the team already decided',
    question: 'have we already tried generating PDFs in the browser?',
    does: 'He asks his coding assistant to check in Leon over MCP. Leon finds the PR closed in March, the review that explains why it was dropped (accented characters rendered badly) and the decision written down in Notion.',
    gain: 'The assistant doesn’t retrace a path the team already paid for, or it says what has changed since.',
    tools: ['github', 'linear', 'notion'],
  },
  {
    id: 'conversation-ia',
    team: 'produit-tech',
    who: 'Product manager, 40-person company',
    moment: 'Redoing an analysis from a month ago',
    title: 'Find what you worked out with your AI assistant',
    question: 'the cohort retention query without the test accounts',
    does: 'In September he built the query with his AI assistant, pitfalls included. The conversation, captured by the extension, comes back in one search, next to the ticket that asked for the curve. Only he can see it.',
    gain: 'The final version, not the first attempt that was wrong, with the reasoning around it.',
    tools: ['linear'],
    alsoReads: 'His AI conversations',
  },
  {
    id: 'astreinte',
    team: 'produit-tech',
    who: 'On-call developer, 30-person SaaS company',
    moment: '10 p.m., an error in an unfamiliar module',
    title: 'Know whether the incident has happened before',
    question: 'has this import error happened before?',
    does: 'Leon finds the Sentry issue from March, the PR that fixed it, the incident ticket and the postmortem. The next day, a discussion turns them into a draft of the new postmortem.',
    gain: 'She applies the known workaround instead of waking up the module’s author.',
    tools: ['sentry', 'github', 'linear', 'notion'],
  },
  {
    id: 'renouvellement',
    team: 'ventes',
    who: 'Customer success manager, 70-person SaaS company',
    moment: '30 days before a renewal',
    title: 'Everything that went wrong with this client',
    question: 'what went wrong with Nordia over the past year?',
    does: 'He took over the account in June. Leon cross-checks support conversations, bugs tied to the client, recorded calls and CRM notes, then says what is fixed, with the date, and what is not.',
    gain: 'He learns about the client’s problems before the meeting, not during it.',
    tools: ['intercom', 'linear', 'fathom', 'hubspot'],
  },
];

const PILLARS_EN: Pillar[] = [
  {
    id: 'capte',
    kicker: 'Capture',
    title: 'It connects to your tools and to your AI assistants.',
    text: `${TOOL_COUNT} tools you connect with an API key or OAuth, synced every 15 minutes. Conversations with your AI assistants come in through the browser extension and your coding assistant.`,
    points: [
      'Polls every 15 minutes, no webhooks',
      'Extension: consent screen, a switch per site, never in private browsing',
      'Coding assistant: each session sent when it ends',
    ],
  },
  {
    id: 'garde',
    kicker: 'Keep',
    title: 'The raw record, as written, and who can see it.',
    text: 'Leon doesn’t summarize and doesn’t keep fact sheets. It stores each item as it was written, with a link to the original, and masks recognizable secrets before storing them.',
    points: [
      'Every result opens in its original tool',
      'AI conversations, discussions and notes private to their author',
      'API keys, tokens and .env passwords masked before storage',
    ],
  },
  {
    id: 'retrouve',
    kicker: 'Find',
    title: 'One search, every source, the answer on top.',
    text: 'Full-text and semantic search, merged, always after the permission filter. A written answer sits above the results, with every sentence linked to its source.',
    points: [
      'Filters typed in the bar: from:, tool:, type:, since:, before:',
      'Exact words in quotes',
      'Typos tolerated in titles',
    ],
  },
  {
    id: 'discute',
    kicker: 'Discuss',
    title: 'A discussion that cites its sources, or says “I don’t know.”',
    text: 'Leon searches, reads and cross-checks before it answers. Every claim carries its source. Without one, it says so instead of making something up.',
    points: [
      'Private discussions you can delete',
      'The morning briefing: done, changed, open',
      'Available to your assistant over MCP',
    ],
  },
];

const SYNTAX_EN: Twin<typeof SYNTAX> = [
  { code: 'from:julie', text: 'what one person wrote' },
  { code: 'tool:github', text: 'a single tool' },
  { code: 'type:meeting', text: 'ticket, page, email, meeting, conversation…' },
  { code: 'since:7d', text: 'the past 7 days, weeks or months' },
  { code: 'before:2026-10-01', text: 'before a date' },
  { code: '"exact phrase"', text: 'the words as written' },
];

const BRIEFING_EN: Twin<typeof BRIEFING> = [
  {
    title: 'What you did',
    items: [
      'Reviewed and merged the PDF export pagination PR.',
      'Replied to ACME about the V2 timeline.',
    ],
  },
  {
    title: 'What changed',
    items: [
      'Sophie opened the ACME data migration ticket.',
      'Two new support conversations mention the export.',
    ],
  },
  {
    title: 'What is still open',
    items: ['The revised quote for Verlant, promised last week.'],
  },
];

const SECURITY_FACTS_EN: Twin<typeof SECURITY_FACTS> = [
  {
    title: 'Each company in its own space',
    text: 'An organization’s data is isolated from the others in the database by Postgres row-level security. Tests check it.',
  },
  {
    title: 'Leon sees what you see',
    text: 'Search, discussions and the MCP server go through the same permissions as the person asking. The permission filter runs before ranking.',
  },
  {
    title: 'Conversations stay private',
    text: 'Conversations captured from your AI assistants, your discussions with Leon and your notes are visible only to you.',
  },
  {
    title: 'Encrypted keys',
    text: 'Pasted API keys and the tools’ OAuth tokens are encrypted (AES-256-GCM) and bound to their row.',
  },
  {
    title: 'Secrets masked before storage',
    text: 'Keys with a known prefix, private keys, authorization headers, .env lines: masked before they are stored.',
  },
  {
    title: 'An extension that asks first',
    text: 'A consent screen, a switch per site, a pause button. Nothing in private browsing, never an attachment.',
  },
  {
    title: 'What assistants read is logged',
    text: 'A log records what each assistant read over MCP. Personal tokens can be revoked at any time.',
  },
  {
    title: 'One database',
    text: 'Text, index and permissions live in Postgres, with no separate search service.',
  },
];

const NOT_YET_EN: Twin<typeof NOT_YET> = [
  'Permissions from the source tool are not carried over yet. What a connection reads is visible to the whole team, except a mailbox (Outlook, Gmail), Google Drive and Slack, which stay private to whoever connects them.',
  'A password written in plain language (“the password is…”) can slip past masking.',
  'No export yet, and no full deletion from the interface.',
  'No certification (ISO 27001, SOC 2) to date.',
];

const PLANS_EN: Twin<typeof PLANS> = [
  {
    id: 'pilote',
    name: 'Pilot',
    price: 'Free',
    unit: '30 days',
    text: 'To try Leon on one team, with your real tools.',
    features: [
      'One team of up to 10 people',
      `All ${TOOL_COUNT} connectors`,
      'Search, cited answers and discussions',
      'Morning briefing and MCP server',
      'Browser extension and coding assistant',
    ],
    cta: 'Start the pilot',
    featured: false,
  },
  {
    id: 'equipe',
    name: 'Team',
    price: '€25',
    unit: 'per active user per month, excl. tax',
    text: 'For the whole company, with no commitment.',
    features: [
      'Everything in the pilot, no limit on team size',
      'Only accounts active that month are counted',
      'No commitment, cancel any month',
    ],
    cta: 'Create a workspace',
    featured: true,
  },
  {
    id: 'dediee',
    name: 'Dedicated',
    price: 'Custom quote',
    unit: 'based on your needs',
    text: 'For companies that want their own instance.',
    features: [
      'Everything in Team',
      'An instance and a database for you alone',
      'Your choice of AI model for each step',
    ],
    cta: 'Start with the pilot',
    featured: false,
  },
];

const FAQ_EN: Twin<typeof FAQ> = [
  {
    q: 'Do we have to change tools?',
    a: `No, if they are among the ${TOOL_COUNT} connectors. Leon connects with an API key or OAuth and picks up what changed every 15 minutes.`,
  },
  {
    q: 'Who sees what?',
    a: 'What a connection reads is visible to the whole team, as in a shared tool, except a mailbox (Outlook, Gmail), Google Drive and Slack, which stay private to whoever connects them. Conversations captured from your AI assistants, your discussions and your notes are visible only to you.',
  },
  {
    q: 'What happens when Leon doesn’t know?',
    a: 'It says so. Every claim in an answer links to its source. Without a source, the answer is “I don’t know,” not a guess.',
  },
  {
    q: 'Does Leon summarize our documents?',
    a: 'No. It keeps the raw text as it was written and indexes it so it can be found. Answers cite that text, with a link to the original.',
  },
  {
    q: 'Can we query it from an AI assistant?',
    a: 'Yes, over MCP, with a personal token you create and revoke in Settings. The assistant sees what you see, nothing more.',
  },
  {
    q: 'What counts as an active user?',
    a: 'Someone who used Leon during the month. An account that stayed inactive is not counted.',
  },
];

// ---------- Choix de la langue ----------

export type SiteContent = {
  navLinks: Twin<typeof NAV_LINKS>;
  taglines: Twin<typeof TAGLINES>;
  familyLabels: Record<ProviderFamily, string>;
  toolGroups: ToolGroup[];
  demos: Demo[];
  teams: Team[];
  situations: Situation[];
  pillars: Pillar[];
  syntax: Twin<typeof SYNTAX>;
  briefing: Twin<typeof BRIEFING>;
  securityFacts: Twin<typeof SECURITY_FACTS>;
  notYet: Twin<typeof NOT_YET>;
  plans: Twin<typeof PLANS>;
  faq: Twin<typeof FAQ>;
};

export const CONTENT_FR: SiteContent = {
  navLinks: NAV_LINKS,
  taglines: TAGLINES,
  familyLabels: FAMILY_LABELS,
  toolGroups: TOOL_GROUPS,
  demos: DEMOS,
  teams: TEAMS,
  situations: SITUATIONS,
  pillars: PILLARS,
  syntax: SYNTAX,
  briefing: BRIEFING,
  securityFacts: SECURITY_FACTS,
  notYet: NOT_YET,
  plans: PLANS,
  faq: FAQ,
};

export const CONTENT_EN: SiteContent = {
  navLinks: NAV_LINKS_EN,
  taglines: TAGLINES_EN,
  familyLabels: FAMILY_LABELS_EN,
  toolGroups: groupsOf(FAMILY_LABELS_EN),
  demos: DEMOS_EN,
  teams: TEAMS_EN,
  situations: SITUATIONS_EN,
  pillars: PILLARS_EN,
  syntax: SYNTAX_EN,
  briefing: BRIEFING_EN,
  securityFacts: SECURITY_FACTS_EN,
  notYet: NOT_YET_EN,
  plans: PLANS_EN,
  faq: FAQ_EN,
};

/** Les textes du site dans une langue : le français pour « fr », l'anglais sinon (la langue par défaut). */
export const contentFor = (locale: string): SiteContent =>
  locale === 'fr' ? CONTENT_FR : CONTENT_EN;

/** Les textes du site dans la langue de la requête (cookie leon-locale), côté serveur comme côté client. */
export const useSiteContent = (): SiteContent => contentFor(useLocale());
