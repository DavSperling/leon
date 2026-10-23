import {
  Compass,
  DoorOpen,
  GitPullRequest,
  Handshake,
  Headset,
  KanbanSquare,
  type LucideIcon,
} from 'lucide-react';
import type { ProviderId } from '@/capture/turn';
import {
  FAMILY_LABELS,
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

/** Les 39 outils branchables, par famille, dans l'ordre de l'écran Connexions. */
export const TOOL_GROUPS: ToolGroup[] = PROVIDER_FAMILIES_ORDER.map((family) => ({
  family,
  label: FAMILY_LABELS[family],
  tools: (Object.keys(PROVIDER_FAMILIES) as ProviderId[]).filter(
    (id) => PROVIDER_FAMILIES[id] === family,
  ),
}));

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
        text: 'Ce qu’une personne a écrit dans les outils branchés reste interrogeable après son départ.',
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
        title: 'Un fil par projet',
        text: 'Une discussion avec Leon reprend les sources d’un projet et répond en les citant.',
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
        title: 'Seulement ce qu’on a le droit de voir',
        text: 'La recherche passe par les droits de chacun. Les conversations privées restent privées.',
      },
    ],
    demo: DEMOS[2] as Demo,
    tools: ['notion', 'confluence', 'github', 'linear', 'hubspot', 'outlook'],
  },
];

export const teamBySlug = (slug: string): Team | undefined => TEAMS.find((t) => t.slug === slug);

// ---------- Ce que fait Leon (page Produit, maquettes) ----------

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
    title: 'Le brut, tel quel, avec ses droits.',
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
    title: 'Ce que tu as fait',
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
  'Les droits de l’outil d’origine ne sont pas encore repris : ce que lit une connexion est visible de toute l’équipe.',
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
      'Extension du navigateur et assistant de code',
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
    a: 'Non. Leon se branche sur ceux que vous avez déjà, par une clé d’API ou un bouton de connexion, et relève ce qui change toutes les 15 minutes.',
  },
  {
    q: 'Qui voit quoi ?',
    a: 'Ce que lit une connexion est visible de toute l’équipe, comme dans un outil partagé. Les conversations captées avec vos assistants d’IA, vos discussions et vos notes ne sont visibles que de vous.',
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
