# 07. Le poste de contrôle et les canaux

20 novembre 2026 · chapitre du dossier de conception · à relire par David et Amos

Ce chapitre écrit ce que la personne voit de ses agents, et ce qui la prévient quand elle n'est pas dans Leon. Il recopie les noms de l'architecture (`00-architecture.md`). Il cite sans les refaire le SQL du chapitre 01, le routage du chapitre 02, le moteur du chapitre 04, les actions du chapitre 05, les gardes du chapitre 06 et les fiches des chapitres 08 et 09.

Convention : **existe** (chemin et ligne, lus au commit `b075333`) ; **à créer** (nom fixé ici ou dans l'architecture) ; **à vérifier** (point d'éditeur ou de bibliothèque non relu). Rien n'a été lancé : ni serveur, ni test, ni migration.

## 1. Ce que ce chapitre fixe

1. Les écrans : `/agents` (catalogue et activation, exécutions et journal, coût, canaux), `/agents/a-valider`, la section « À valider » de l'Accueil, la pastille de la barre latérale, l'entrée `Agents` de `NAV`, le guide et leurs tests.
2. Les lectures qui les nourrissent : le reste de `src/server/agents/activation.ts` (`agentsAvailable`, activer, régler, lister), `src/server/agents/runs.ts` (`listRuns`, `readRun`, `listRunActions`, `listPendingGroups`), `src/server/control/overview.ts`, et les vues partagées de `src/lib/agents.ts`.
3. Les server actions de `src/app/(app)/agents/actions.ts`, `undoActionAction`, et les clés `navigation.agents`, `shell.toValidate`, `agents.*` en français et en anglais.
4. Après le jalon 1 : `email/send.ts` (un seul envoi vers Resend), le récapitulatif sans contenu (`email/recap.ts`, son gabarit, son test), `preferences_canaux` et la langue en base, les files `recap-*` et `canal-*`.
5. Après le jalon 1 : l'appli Slack (manifeste, installation, `linkSlackUser`, message direct, boutons, route des clics, `canal-clic`, `decideFromChannel`).

## 2. Vue d'ensemble

### 2.1 Ce que voit la personne

```
Barre latérale                     /agents                                   /agents/a-valider
  Recherche                        ┌ Catalogue ┬ Exécutions ┬ Coût ┬ Canaux ┐ ┌ À valider ──────────── 3 ┐
  Discussions                      │ fiches, activation, cran, réglages     │ │ groupe par exécution     │
  Agents  (3)  ← pastille          │ journal d'une exécution (panneau)      │ │  carte d'action ×n       │
  Documents …                      └────────────────────────────────────────┘ └──────────────────────────┘
                                          ▲                                          ▲
Accueil : section « À valider » ──────────┴──────────── lien « Tout voir » ──────────┘
                                                                                     ▲
Après le jalon 1 :  e-mail du récapitulatif (des nombres, un lien) ──────────────────┤
                    message direct Slack (des titres génériques, deux boutons) ──────┘
                       clic « Valider » (enjeu bas, public soi) → POST /api/v1/slack/interactions
                       → canal-clic → decideFromChannel → decideAction (chapitre 05)
```

### 2.2 Les pièces

| Pièce | Fichier | État | Jalon | PR (section 17) |
|---|---|---|---|---|
| Vues du poste de contrôle (types, deux règles pures) | `src/lib/agents.ts` | à créer (chapitre 06) ; ajout ici | 1 | 07a |
| `agentsAvailable`, `listAgentCards`, `activateAgent`, `setActivation`, `setOrgAgentSettings`, `requiredSettings` | `src/server/agents/activation.ts` | à créer ; `readAgentSettings` y est écrit par le chapitre 02 | 1 | 07a |
| `listRuns`, `readRun`, `listRunActions`, `listPendingGroups`, `readPendingSummary` | `src/server/agents/runs.ts` | à créer | 1 | 07a |
| `readMonthCost`, `readOrgBudget` ; `readAcceptance` | `src/server/control/overview.ts` | à créer | 1 ; `readAcceptance` après (0085) | 07a ; 07j |
| `countPendingIn` | `src/server/actions/store.ts` | à créer (chapitre 05) ; ajout ici | 1 | 07a |
| Pastille : `SidebarData.pending` | `src/server/shell/shell.ts:19-61` | existe ; à modifier | 1 | 07c |
| Entrée `Agents` | `src/components/verre/shell/nav.ts:15-30` | existe ; à modifier | 1 | 07b |
| Pastille dans la barre | `sidebar.tsx:41-111`, `mobile-bar.tsx:24-78`, `app-shell.tsx:19-64`, `src/app/(app)/layout.tsx:18-34` | existent ; à modifier | 1 | 07c |
| Écran `/agents` | `src/app/(app)/agents/page.tsx`, `src/components/verre/agents/*` | à créer | 1 | 07b |
| Écran `/agents/a-valider` | `src/app/(app)/agents/a-valider/page.tsx`, `src/components/verre/agents/a-valider.tsx` | à créer | 1 | 07c |
| Section de l'Accueil | `src/app/(app)/page.tsx:123-227` | existe ; à modifier | 1 | 07c |
| Server actions | `src/app/(app)/agents/actions.ts` | à créer | 1 | 07b |
| `decideActionAction` revalide la pastille ; `undoActionAction` | `src/app/(app)/discussions/actions.ts:158-173` | existe ; à modifier ; `undoActionAction` après | 1 ; après | 07c ; 07i |
| Carte d'action : icône, enjeu, public, « Ne s'annule pas », « Annuler » | `src/components/discussion/action-card.tsx` | existe ; à modifier (les clés : chapitre 05) | 1 ; « Annuler » après | 07c ; 07i |
| Guide et tests de la barre | `docs/guides/connecteurs-verification.md:24`, `sidebar.test.ts:60` | existent ; à modifier | 1 | 07b |
| Clés de texte | `messages/fr.json`, `messages/en.json` | existent ; à modifier | 1, puis chaque PR | toutes |
| `sendEmail`, `sendEmailBatch`, `escapeHtml`, `mailConfigured` | `src/server/email/send.ts` | à créer | après | 07d |
| `readRecapCounts`, `renderRecap`, `sendRecap` | `src/server/email/recap.ts` | à créer | après | 07f |
| Préférences et langue | `src/server/channels/preferences.ts` ; `setLocaleAction` (`src/app/(app)/settings/actions.ts:59-70`) | à créer ; existe, à modifier | après | 07e |
| `notifyAction`, `decideFromChannel` | `src/server/channels/notify.ts`, `click.ts` | à créer | après | 07h |
| Files `recap-tic`, `recap-envoyer`, `canal-envoyer`, `canal-clic` | `src/server/channels/queue.ts`, `worker.ts` | à créer | après | 07f, 07h |
| Appli Slack | `src/server/slack/{client,manifest,install,link,post,interactions}.ts` | à créer (`client.ts` et `manifest.ts` : ajouts) | après | 07g, 07h |
| Variables `LEON_SLACK_*` | `src/server/env.ts:30` (schéma), `.env.example` | existent ; à modifier | après | 07g |

### 2.3 Ce que ce chapitre reçoit des autres, sous ces noms

| Nom | Où | État | Chapitre |
|---|---|---|---|
| `requireUserContext` | `src/server/auth/session.ts:65` | existe | |
| `canInvite` (propriétaire ou administrateur) | `src/server/auth/members.ts:53` | existe | |
| `withTenant`, `Tx` | `src/server/db/with-tenant.ts:18`, `:6` | existent | |
| `resolveTenantContext` | `src/server/auth/tenant-context.ts:71` | existe | |
| `logError`, `safeErrorSummary` | `src/server/log.ts:37`, `:23` | existent | |
| `encryptSecret`, `decryptSecret`, `connectorsKey` | `src/server/connectors/crypto.ts:33`, `:42`, `:21` | existent | |
| `ensureQueue`, `wakeQueueAfter`, `getBoss` | `src/server/pipeline/queue.ts:39`, `:54`, `:109` | existent | |
| `requireSession`, `requireSameOrigin`, `SessionEnv` | `src/server/api/session-routes.ts:30`, `:45`, `:25` | existent | |
| `PROVIDER_LABELS`, `PROVIDER_FAMILIES`, `PROVIDER_FAMILIES_ORDER` | `src/lib/providers.ts:34`, `:79`, `:5` | existent | |
| `formatDate`, `formatDateTime`, `formatRelative` | `src/lib/format.ts:12`, `:21`, `:35` (réexportés par `src/lib/verre/format.ts:4`) | existent | |
| `locales`, `DEFAULT_LOCALE`, `localeOf` | `src/i18n/request.ts:7`, `:9`, `:20` | existent | |
| `PageHeader`, `Section`, `Button`, `SidePanel`, `Facts`, `Fact`, `EmptyState`, `Notice`, `Switch`, `Select`, `Field`, `Input`, `Badge`, `Flag`, `ToolLogo` | `src/components/verre/ui/index.ts` | existent | |
| `ActionView`, `ACTION_KINDS`, `actionProvider`, `actionVerb`, `ACTION_PENDING_MS` | `src/lib/actions.ts` | existe ; étendu | 05 (3.4) |
| `AUTONOMY_LEVELS`, `AUTONOMY_CEILING`, `lowestAutonomy`, `needsClick`, `raiseSuggestion` | `src/lib/agents.ts` | à créer | 06 (3.2) |
| `TimedAction`, `toView`, `listPendingActions`, `countPendingActions`, `readActionRow` | `src/server/actions/store.ts` | à créer | 05 (9) |
| `decideAction`, `undoAction` | `src/server/actions/decide.ts` | à créer | 05 (11) |
| `specOf`, `validParams` | `src/server/actions/registry.ts` | à créer | 05 (8.1) |
| `ACTION_CAPABILITIES`, `ACTION_CAPABILITY_NAMES` | `src/server/actions/capabilities.ts` | à créer | 06 (06b), 05 |
| `CONNECTORS`, `Connector.write.granted(config, verb)` | `src/server/connectors/registry.ts:47` ; `types.ts` | existe ; `write` à créer | 05 (3.2, écart 1) |
| `AGENTS`, `AGENT_IDS`, `AgentId` | `src/server/agents/catalog/index.ts` | à créer | 08 (3.3) |
| `AgentDefinition`, `FieldSpec`, `AGENT_SERVICES` | `src/server/agents/definition.ts` | à créer | 06 (7.2), architecture 8.5 |
| `fieldSchema`, `readSettings` | `src/server/agents/fields.ts` | à créer | 04 (7) |
| `readAgentSettings`, `AgentSettings` | `src/server/agents/activation.ts` | à créer | 02 |
| `monthCapSql`, `AGENTS_BUDGET_USD_PER_SEAT` | `src/server/agents/budget.ts` | à créer | 04 (12) |
| `agentsActives`, `executionsAgent`, `etapesExecution` | `src/server/db/schema/agents.ts` | à créer | 01 (14.1) |
| `preferencesCanaux`, `installationsSlack`, `messagesSortants`, `users.locale` | `src/server/db/schema/channels.ts`, `auth.ts` | à créer | 01 (14.3, 14.4) |
| `budget_du_mois`, `lier_slack`, `compte_slack`, `recaps_dus`, `taux_acceptation_agents` | migrations 0076, 0084, 0085 | à créer | 01 |
| `verifyWebhook`, `VerifyInput`, `Verdict` | `src/server/webhooks/verify.ts` | à créer | 03 (4.3) |
| `takeOverTeamAgent` ; `readRaiseRows` | `src/server/agents/departure.ts` ; `activation.ts` | à créer | 06 (8.2, 3.4) |
| `startManualRunAction` | `src/app/(app)/agents/actions.ts` (ce chapitre crée le fichier) | à créer | 09 (PR 09c) |

### 2.4 Trois règles qui tiennent tout l'écran

1. **Rien de ce qu'un administrateur voit ne parle d'une personne.** Le journal, les actions, le coût d'une exécution se lisent sous la RLS de la personne (`acl = array[user_id]`, chapitre 01). Un administrateur voit le budget de l'organisation (`budget_du_mois`) et, après 0085, des compteurs par agent (`taux_acceptation_agents`, trois personnes au moins). Aucune lecture de ce chapitre n'agrège par `user_id` pour un autre que soi (architecture 9.11, point 2).
2. **Ce qui a été lu se revérifie à la lecture.** Le titre d'une source n'est affiché que si la RLS la montre encore. Le détail d'une exécution (étapes, extraits, texte rédigé) n'est rendu que si toutes ses `source_ids` sont encore visibles (architecture 9.1, point 10).
3. **Ce qui sort de Leon ne porte aucun contenu.** Le récapitulatif et les messages Slack ne portent que des nombres, des noms d'outils, des noms de fiches et des titres génériques par type d'action (`agents.kinds.<outil>.<verbe>`, « Note dans HubSpot »). Jamais un paramètre, un `summary`, un titre de source, un nom de client (architecture 9.12, point 1).

## 3. Navigation, pastille et guide

Jalon 1. L'entrée `Agents` entre avec l'écran (PR 07b) : `page-links.test.ts` (existe) lit `href: '/agents'` dans `nav.ts` et exige une page. La pastille entre avec `/agents/a-valider` (PR 07c).

### 3.1 `src/components/verre/shell/nav.ts` (existe) : le fichier après changement

```ts
import {
  Bot,
  FileText,
  House,
  type LucideIcon,
  MessageSquare,
  Plug,
  Settings2,
  Users,
} from 'lucide-react';

// Les sept sections, partagées par la barre latérale, la feuille mobile et la barre de commande. La barre les montre en
// deux groupes : les deux premières (où l'on demande), puis les cinq autres.
// `label` : le libellé français que les guides citent (docs/guides, guides-docs.test.ts) ; ce que l'écran écrit vient de
// `labelKey`, sa clé dans les messages (navigation) : « / » s'y appelle Accueil.
export type NavItem = {
  href: string;
  label: string;
  labelKey: 'home' | 'discussions' | 'agents' | 'documents' | 'team' | 'connections' | 'settings';
  icon: LucideIcon;
  end?: boolean;
};

export const NAV: NavItem[] = [
  { href: '/', label: 'Recherche', labelKey: 'home', icon: House, end: true },
  { href: '/discussions', label: 'Discussions', labelKey: 'discussions', icon: MessageSquare },
  { href: '/agents', label: 'Agents', labelKey: 'agents', icon: Bot },
  { href: '/documents', label: 'Documents', labelKey: 'documents', icon: FileText },
  { href: '/team', label: 'Équipe', labelKey: 'team', icon: Users },
  { href: '/connections', label: 'Connexions', labelKey: 'connections', icon: Plug },
  { href: '/settings', label: 'Réglages', labelKey: 'settings', icon: Settings2 },
];

/** La section d'une adresse : « /discussions/acme » → Discussions ; « /agents/a-valider » → Agents. */
export const sectionOf = (pathname: string): NavItem | undefined =>
  NAV.find((n) =>
    n.end ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`),
  );
```

`NAV.slice(0, 2)` et `NAV.slice(2)` (`sidebar.tsx:107-108`) ne changent pas : Agents ouvre le second groupe. La barre de commande (`command-palette.tsx`, `NAV.map`) et la feuille mobile suivent seules.

### 3.2 La pastille : `src/server/actions/store.ts` (chapitre 05) et `src/server/shell/shell.ts` (existe)

`readSidebar` lit tout dans une seule transaction (commentaire de `shell.ts:12-14` : « le pool est petit »). `countPendingActions` (chapitre 05, 9) en ouvre une autre. Pour que la liste et la pastille gardent une seule définition de « à valider » (la condition `awaiting()` de `store.ts`, non exportée), `store.ts` gagne une fonction qui prend la transaction, et `countPendingActions` l'appelle :

```ts
// src/server/actions/store.ts (chapitre 05) : remplace countPendingActions.
import type { Tx } from '@/server/db/with-tenant';

// La pastille de la barre latérale. `tx` : la transaction de readSidebar (src/server/shell/shell.ts), qui lit tout
// d'un coup. Même condition que listPendingActions : le compte et la liste ne divergent jamais.
export async function countPendingIn(tx: Tx, ctx: TenantContext): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(actions)
    .where(and(eq(actions.userId, ctx.userId), awaiting()));
  return row?.n ?? 0;
}

export const countPendingActions = (ctx: TenantContext): Promise<number> =>
  withTenant(ctx, (tx) => countPendingIn(tx, ctx));
```

`src/server/shell/shell.ts`, ce qui change :

```ts
import { countPendingIn } from '@/server/actions/store';

export type SidebarData = {
  /** La photo du compte, quand il en a une. */
  image: string | null;
  /** Ses cinq dernières discussions, la plus récente d'abord. */
  recents: { id: string; title: string }[];
  /** Les outils à reconnecter, un par outil, le plus ancien d'abord. */
  reconnect: ProviderId[];
  /** Les propositions de ses agents qui attendent son clic (la pastille d'« Agents »). */
  pending: number;
};

// … dans readSidebar, après la lecture de `me`, dans la même transaction :
    const pending = await countPendingIn(tx, ctx);
    return {
      image: me?.image ?? null,
      recents,
      reconnect: broken.map((row) => row.provider),
      pending,
    };
```

`src/app/(app)/layout.tsx:31-33` passe `pending={side.pending}` à `AppShell`. `src/app/(app)/layout.test.ts:42-46` (existe) : le faux `readSidebar` rend aussi `pending: 0`, sinon `pnpm typecheck` échoue.

### 3.3 La barre : `sidebar.tsx`, `mobile-bar.tsx`, `app-shell.tsx` (existent)

`SidebarData` du composant (`sidebar.tsx:41-45`, à ne pas confondre avec celui du serveur) gagne `pending: number`. `AppShell` le reçoit avec le reste (`app-shell.tsx:55`, `side = { recents, reconnect, stale, pending }`) et le passe à `Sidebar` et `MobileMenu`, qui le passent à `NavList`. `NavList` :

```tsx
export function NavList({
  onNavigate,
  reconnect = 0,
  pending = 0,
}: {
  onNavigate?: () => void;
  reconnect?: number;
  pending?: number;
}) {
  const current = sectionOf(usePathname());
  const t = useTranslations('navigation');
  const shellT = useTranslations('shell');
  const entry = (item: NavItem) => {
    const { href, labelKey, icon: Icon } = item;
    const label = t(labelKey);
    const isActive = item === current;
    // Deux drapeaux possibles, un par entrée : les outils à reconnecter (ambre, 4) sur Connexions, les actions à
    // valider (bleu, 3) sur Agents. Repliée, la barre garde un point de la même couleur sur l'icône.
    const flag =
      href === '/connections' && reconnect > 0
        ? { count: reconnect, tone: 4 as const, dot: 'bg-destructive', text: shellT('toReconnect', { count: reconnect }) }
        : href === '/agents' && pending > 0
          ? { count: pending, tone: 3 as const, dot: 'bg-accent', text: shellT('toValidate', { count: pending }) }
          : null;
    return (
      <li key={href}>
        <Tooltip content={flag ? `${label} · ${flag.text}` : label} side="right">
          <Link
            href={href}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            onPointerMove={railOnly}
            onFocus={railOnly}
            className={cn(ROW, isActive && CURRENT)}
          >
            <Icon aria-hidden="true" strokeWidth={1.6} className={cn(ROW_ICON, isActive && 'text-fg')} />
            <span className={cn(LABEL, 'min-w-0 flex-1 truncate')}>{label}</span>
            {flag && (
              <>
                <i
                  aria-hidden="true"
                  className={cn(
                    'absolute top-1.5 left-[21px] hidden size-2 rounded-full shadow-[0_0_0_2px_var(--glass)] group-data-[rail=replie]/rail:block',
                    flag.dot,
                  )}
                />
                <Flag
                  tone={flag.tone}
                  className="absolute top-1.5 -right-[27px] group-data-[rail=replie]/rail:hidden max-shell:static max-shell:-mr-0.5"
                >
                  <span aria-hidden="true">{flag.count > 99 ? '99+' : flag.count}</span>
                  <span className="sr-only">{flag.text}</span>
                </Flag>
              </>
            )}
          </Link>
        </Tooltip>
      </li>
    );
  };
  return (
    <>
      <ul className="grid grid-cols-[minmax(0,1fr)]">{NAV.slice(0, 2).map(entry)}</ul>
      <ul className="mt-3 grid grid-cols-[minmax(0,1fr)]">{NAV.slice(2).map(entry)}</ul>
    </>
  );
}
```

`Sidebar` (`sidebar.tsx:361`) : `<NavList reconnect={reconnect.length} pending={pending} />`. `MobileMenu` (`mobile-bar.tsx:78`) : idem, avec `onNavigate={go}`. La couleur `bg-accent` existe dans le kit (`action-card.tsx:91`, `text-accent`) : le jeton de fond est à vérifier dans `globals.css` au moment de la PR.

La pastille se met à jour quand la page se rafraîchit : `decideActionAction` revalide la mise en page pour une action d'agent (section 8.4). Pas de flux en direct : une proposition arrivée pendant qu'on lit une autre page apparaît à la navigation suivante.

### 3.4 Le guide et les tests

`docs/guides/connecteurs-verification.md:24` (existe) : « La barre latérale montre Recherche, Discussions, Agents, Documents, Équipe, Connexions, Réglages. » `src/test/contracts/guides-docs.test.ts:53` (existe) compare cette phrase aux libellés de `NAV` joints : elle change dans la même PR que `nav.ts`.

`src/components/verre/shell/sidebar.test.ts` (existe) :

```ts
const VIEWER: SidebarProps = {
  organizationName: 'Atelier Lebrun',
  userName: 'Claire Lebrun',
  userEmail: 'claire@example.com',
  recents: [],
  reconnect: [],
  stale: [],
  pending: 0,
};

// :60, le titre seul change : « rend les sept sections ».

it('compte les actions à valider sur l’entrée Agents, et rien tant qu’il n’y en a pas', () => {
  expect(html()).not.toContain('to approve');
  const out = html({ pending: 3 });
  expect(out).toMatch(/class="tag c3[^"]*"><span aria-hidden="true">3<\/span>/);
  expect(out).toContain('3 actions to approve');
  expect(out).toMatch(/<a href="\/agents"[^>]*>(?:(?!<\/a>).)*3 actions to approve/);
});

it('écrit 99+ au-delà de 99', () => {
  expect(html({ pending: 140 })).toMatch(/<span aria-hidden="true">99\+<\/span>/);
});

// Dans describe('NAV') :
it('range Agents après Discussions, et reconnaît une page sous /agents', () => {
  expect(NAV.map((n) => n.href).slice(0, 3)).toEqual(['/', '/discussions', '/agents']);
  expect(sectionOf('/agents/a-valider')?.href).toBe('/agents');
});
```

La classe `tag c3` est celle que `Flag` pose pour le ton 3 (`sidebar.test.ts:96` attend `tag c4` pour le ton 4) : à confirmer dans `marks.tsx` au moment de la PR.

`src/server/shell/shell.db.test.ts` (existe) gagne un cas : deux actions d'agent `proposee` de Claire, une expirée, une de simulation, une de Karim ; `readSidebar(claire).pending` vaut 2, `readSidebar(karim).pending` vaut 1. Les lignes se posent par `seedAgentAction` (chapitre 01, 16.1).

## 4. Les lectures du poste de contrôle

Jalon 1, PR 07a, sauf mention. Quatre fichiers : les vues partagées (`src/lib/agents.ts`), les activations (`activation.ts`), le journal (`runs.ts`), les comptes (`overview.ts`). Toutes les lectures passent par `withTenant(ctx, …)` sous les droits de la personne qui lit. Aucune n'ouvre de transaction pendant un appel réseau.

### 4.1 `src/lib/agents.ts` (chapitre 06) : les vues du poste de contrôle

Le chapitre 06 écrit le fichier (3.2) et laisse ces vues au chapitre 07 (« Le chapitre 07 les ajoute à ce fichier »). Ce sont des types : le serveur les remplit, la page les lit, aucune n'est validée par zod (le module reste pur). Les dates voyagent en chaînes ISO, comme `ActionView.expiresAt` (chapitre 05, 3.4).

```ts
// src/lib/agents.ts, à la fin du fichier (ajout du chapitre 07).
import type { ActionKind, ActionView } from './actions';
import type { ProviderFamily } from './providers';

// --- Les vues du poste de contrôle (dossier agents, chapitre 07) ------------------------------------------------
// Ce que les écrans /agents et /agents/a-valider reçoivent du serveur. Aucun champ n'est un texte capté hors de ceux
// qui le disent (`source.title`, les champs et le texte d'une étape) : ceux-là ne sont remplis que si la RLS montre
// encore la source à la personne qui lit (architecture 9.1, point 10).

// Les listes de executions_agent (0079), recopiées pour le navigateur : le schéma Drizzle les écrit à la main
// (chapitre 01, 14). model.test.ts (chapitre 07, section 16) les tient égales au schéma.
export const RUN_STATUSES = [
  'en-file',
  'en-cours',
  'en-attente',
  'faite',
  'echouee',
  'annulee',
  'ignoree',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const RUN_REASONS = [
  'budget',
  'plafond',
  'parti',
  'role',
  'connexion',
  'limite',
  'refus',
  'erreur',
  'expiree',
] as const;
export type RunReason = (typeof RUN_REASONS)[number];
export const RUN_TRIGGERS = ['evenement', 'horloge', 'veille', 'manuel'] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

// Ce qu'il manque pour qu'une fiche tourne chez la personne. `missingFamilies` : requires.read demande au moins une
// de ces familles, aucune n'est branchée (écart E09-20). `missingWrites` : les entrées de requires.write (type ou
// capacité) qu'aucune de ses connexions ne peut écrire.
export type AgentAvailability = {
  ready: boolean;
  missingFamilies: ProviderFamily[];
  missingWrites: string[];
};

export type ActivationView = {
  id: string;
  scope: 'personne' | 'equipe';
  autonomy: AutonomyLevel;
  active: boolean;
  settings: Record<string, unknown>;
  // La personne qui lit est celle qui l'a activée (agent d'équipe : un autre administrateur, peut-être).
  mine: boolean;
};

// Un réglage de fiche, tel que l'écran le dessine. `liste` ne se règle pas à l'écran : la fiche garde son défaut.
export type SettingFieldView =
  | { type: 'choix'; values: string[]; required: boolean }
  | { type: 'texte'; max: number; required: boolean }
  | { type: 'date' | 'booleen' | 'personne' | 'liste'; required: boolean };

export type AgentWriteView = { kind: ActionKind; risk: RiskLevel; reversible: boolean };

export type AgentCardView = {
  id: string; // le nom et la description sont dans les messages : agents.catalog.<id>
  service: string; // AGENT_SERVICES (definition.ts)
  scope: 'personne' | 'equipe';
  families: ProviderFamily[]; // requires.read
  writes: AgentWriteView[]; // ce que la fiche peut écrire chez cette personne, type résolu
  settings: Record<string, SettingFieldView>;
  ceiling: AutonomyLevel; // le cran le plus haut que l'écran laisse choisir (choosableCeiling)
  manual: boolean; // la fiche a un déclencheur « manuel » (bouton du chapitre 09)
  limits: { runsPerDay: number; usd: number };
  availability: AgentAvailability;
  activation: ActivationView | null;
  month: { runs: number; usd: number }; // ses propres exécutions du mois
};

// La source qui a déclenché : nulle si l'exécution n'en a pas (horloge), titre nul si la RLS ne la montre plus.
export type RunSourceView = { title: string | null; tool: string | null; at: string | null } | null;

export type RunListItem = {
  id: string;
  agentId: string;
  status: RunStatus;
  reason: RunReason | null;
  error: string | null; // un code du moteur (journal_vide, panne…), jamais un texte capté
  trigger: RunTrigger;
  createdAt: string;
  endedAt: string | null;
  usd: number;
  calls: number;
  proposed: number; // lignes d'actions écrites par l'exécution
  source: RunSourceView;
};

export type RunStepDetail =
  | { kind: 'sources'; count: number } // lire, chercher : des identifiants, jamais le texte (9.6, point 9)
  | { kind: 'champs'; fields: Record<string, unknown> } // extraire : 30 jours
  | { kind: 'texte'; text: string } // rediger : 30 jours
  | { kind: 'propositions'; count: number } // decider
  | { kind: 'action'; actionId: string | null; outcome: string } // agir, <décideur>#<i>
  | { kind: 'attente'; until: string | null }
  | { kind: 'vide' }; // vidé par purger_executions, ou rien à montrer

export type RunStepView = {
  rank: number;
  name: string;
  status: 'intention' | 'faite' | 'echouee';
  startedAt: string;
  endedAt: string | null;
  detail: RunStepDetail;
};

export type RunDetailView = RunListItem & {
  // Faux : une source lue n'est plus visible ; ni étapes, ni actions, ni titre ne sont rendus.
  readable: boolean;
  autonomy: AutonomyLevel;
  externalContent: boolean;
  privateData: boolean;
  steps: RunStepView[];
  actions: ActionView[];
};

export type PendingGroupView = {
  executionId: string | null;
  agentId: string | null;
  source: RunSourceView;
  expiresAt: string | null; // la plus proche des expirations du groupe
  actions: ActionView[];
};

export type PendingSummaryView = {
  total: number;
  groups: Array<Omit<PendingGroupView, 'actions'> & { count: number }>;
};

export type MonthCostView = {
  usd: number;
  runs: number;
  calls: number;
  byAgent: Array<{ agentId: string; usd: number; runs: number }>;
};

// Pour un propriétaire ou un administrateur seulement : l'organisation, jamais une personne (9.11).
export type OrgBudgetView = {
  reservedUsd: number;
  spentUsd: number;
  capUsd: number;
  capIsSetting: boolean; // réglé par l'organisation, ou défaut par siège
  perSeatUsd: number; // AGENTS_BUDGET_USD_PER_SEAT (budget.ts) : le défaut, révisé par le chapitre 11
  enabled: boolean; // reglages_organisation.agents_actifs
  maxAutonomy: AutonomyLevel; // reglages_organisation.agents_autonomie_max
};

// Le cran le plus haut que l'écran laisse choisir : le plus bas de la fiche, de l'organisation et du code. Toujours
// « propose » pour un agent d'équipe (9.1, règle 4). Au jalon 1, AUTONOMY_CEILING le tient à « propose ».
export const choosableCeiling = (input: {
  scope: 'personne' | 'equipe';
  definitionMax: AutonomyLevel;
  organizationMax: AutonomyLevel;
}): AutonomyLevel =>
  input.scope === 'equipe'
    ? 'propose'
    : lowestAutonomy(input.definitionMax, input.organizationMax, AUTONOMY_CEILING);

// Un bouton de canal (Slack) ne valide qu'une action d'enjeu bas dont le public est la personne (9.7, 9.12). La même
// règle pose le bouton (post.ts) et refuse le clic (click.ts) : elle ne vit qu'ici.
export const validatesFromChannel = (action: { risk: RiskLevel; audience: Audience }): boolean =>
  action.risk === 'bas' && action.audience === 'soi';
```

`import type` de `./actions` : `src/lib/actions.ts` importe déjà des valeurs de `./agents` (chapitre 05, 3.4). Un cycle de types seuls s'efface à la compilation (`verbatimModuleSyntax`, `tsconfig.json`).

### 4.2 `src/server/agents/activation.ts` : activer, régler, lister

`readAgentSettings` et `AgentSettings` y sont écrits par le chapitre 02 (son écart E02-8, « le reste du fichier revient au chapitre 07 »). `readRaiseRows` y est ajouté par le chapitre 06 (3.4, après le jalon 1). Ce chapitre écrit le reste.

```ts
// src/server/agents/activation.ts : la partie du chapitre 07.
import { and, count, eq, inArray, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { ProviderId } from '@/capture/turn';
import { type ActionKind, actionProvider, actionVerb } from '@/lib/actions';
import {
  type ActivationView,
  type AgentAvailability,
  type AgentCardView,
  type AgentWriteView,
  AUTONOMY_LEVELS,
  type AutonomyLevel,
  choosableCeiling,
  lowestAutonomy,
  type SettingFieldView,
} from '@/lib/agents';
import { PROVIDER_FAMILIES, type ProviderFamily } from '@/lib/providers';
import { ACTION_CAPABILITIES, type ActionCapability } from '@/server/actions/capabilities';
import { specOf } from '@/server/actions/registry';
import { canInvite } from '@/server/auth/members';
import type { TenantContext } from '@/server/auth/tenant-context';
import { CONNECTORS } from '@/server/connectors/registry';
import { agentsActives, executionsAgent } from '@/server/db/schema/agents';
import { connections } from '@/server/db/schema/connections';
import { reglagesOrganisation } from '@/server/db/schema/organisation';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { AGENTS } from './catalog';
import { AGENT_SERVICES, type AgentDefinition, type FieldSpec } from './definition';
import { fieldSchema } from './fields';

// Activer, régler, lister les fiches d'une personne (dossier agents, chapitre 07). Une activation personnelle est
// privée à la personne ; une activation d'équipe est lisible de l'organisation et écrite par un administrateur (0078).
// Aucune fonction ne lève sur un refus : elle rend un code, que l'écran traduit (agents.errors.<code>).

type Agents = Readonly<Record<string, AgentDefinition>>;
type Deps = { agents?: Agents };

export const ACTIVATION_ERRORS = ['introuvable', 'manque', 'reglage', 'interdit', 'coupe', 'existe'] as const;
export type ActivationError = (typeof ACTIVATION_ERRORS)[number];
export type ActivationResult = { ok: true; id: string } | { ok: false; error: ActivationError };
const fail = (error: ActivationError): ActivationResult => ({ ok: false, error });

type MyConnection = { provider: ProviderId; config: Record<string, unknown> };

// Ses connexions en service, comme loadMyConnections (connections.ts:347) : créées par elle, actives ou en erreur.
// Sans déchiffrer les secrets : `granted` ne lit que la configuration non secrète (le scope gardé, chapitre 05).
async function myConnections(tx: Tx, ctx: TenantContext): Promise<MyConnection[]> {
  return tx
    .select({ provider: connections.provider, config: connections.config })
    .from(connections)
    .where(
      and(
        eq(connections.tenantId, ctx.tenantId),
        eq(connections.createdBy, ctx.userId),
        inArray(connections.status, ['active', 'error']),
      ),
    );
}

// Une de ses connexions peut-elle écrire ce type ? « inconnu » vaut oui : l'outil le dira au clic (chapitre 05).
function canWrite(kind: ActionKind, mine: readonly MyConnection[]): boolean {
  const provider = actionProvider(kind) as ProviderId;
  const write = CONNECTORS[provider]?.write;
  if (!write || !specOf(kind)) return false;
  return mine.some(
    (row) => row.provider === provider && write.granted(row.config, actionVerb(kind)) !== 'non',
  );
}

const kindsOf = (entry: string): readonly ActionKind[] =>
  entry in ACTION_CAPABILITIES
    ? ACTION_CAPABILITIES[entry as ActionCapability]
    : [entry as ActionKind];

// Le type qu'une entrée (type ou capacité) donnera chez cette personne : le premier de la liste qu'elle peut écrire
// (architecture 8.2). Le moteur préfère l'outil de la source qui a déclenché (resolveAction, chapitre 05) : l'écran
// montre le cas ordinaire. Null : rien de branché.
export const resolveWrite = (entry: string, mine: readonly MyConnection[]): ActionKind | null =>
  kindsOf(entry).find((kind) => canWrite(kind, mine)) ?? null;

// requires.read : au moins une des familles (écart E09-20, tranché ici). requires.write : toutes les entrées.
export function availabilityOf(
  definition: AgentDefinition,
  mine: readonly MyConnection[],
): AgentAvailability {
  const branched = new Set<ProviderFamily>(mine.map((row) => PROVIDER_FAMILIES[row.provider]));
  const read = definition.requires.read as ProviderFamily[];
  const missingFamilies = read.length === 0 || read.some((f) => branched.has(f)) ? [] : read;
  const missingWrites = definition.requires.write.filter((entry) => !resolveWrite(entry, mine));
  return {
    ready: missingFamilies.length === 0 && missingWrites.length === 0,
    missingFamilies,
    missingWrites,
  };
}

// Pour chaque fiche du catalogue : peut-elle tourner chez cette personne ? (architecture, 6 : agentsAvailable(ctx)).
export async function agentsAvailable(
  ctx: TenantContext,
  deps: Deps = {},
): Promise<Record<string, AgentAvailability>> {
  const agents = deps.agents ?? AGENTS;
  const mine = await withTenant(ctx, (tx) => myConnections(tx, ctx));
  return Object.fromEntries(
    Object.values(agents).map((definition) => [definition.id, availabilityOf(definition, mine)]),
  );
}

// Les réglages sans lesquels la fiche ne peut rien écrire (écart E08-9) : cités par un paramètre { from: 'reglage' }
// dont la clé est obligatoire dans l'entrée de la spec, ou par une condition when.setting (chapitre 04, E04-24). Une
// capacité, qui peut donner plusieurs specs, compte comme obligatoire : le doute va au plus prudent.
export function requiredSettings(definition: AgentDefinition): Set<string> {
  const required = new Set<string>();
  for (const step of definition.steps) {
    if (step.kind !== 'agir') continue;
    if (step.when && 'setting' in step.when) required.add(step.when.setting);
    const spec = step.action in ACTION_CAPABILITIES ? null : specOf(step.action as ActionKind);
    const shape = spec?.input.shape as Record<string, z.ZodType> | undefined;
    for (const [key, ref] of Object.entries(step.params)) {
      if (ref.from !== 'reglage') continue;
      const optional = shape?.[key]?.safeParse(undefined).success === true;
      if (!optional) required.add(ref.field);
    }
  }
  return required;
}

const settingView = (spec: FieldSpec, required: boolean): SettingFieldView =>
  spec.type === 'choix'
    ? { type: 'choix', values: [...spec.values], required }
    : spec.type === 'texte'
      ? { type: 'texte', max: spec.max, required }
      : { type: spec.type, required };

type SettingsCheck =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: 'reglage' };

// Relit ce que l'écran envoie contre les `settings` de la fiche, par fieldSchema (chapitre 04, 7) : une clé inconnue
// est ignorée, une valeur vide vaut null, une valeur fausse refuse tout. Un réglage obligatoire vide refuse aussi.
export function checkSettings(definition: AgentDefinition, raw: unknown): SettingsCheck {
  const given =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const value: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(definition.settings)) {
    if (spec.type === 'liste') continue;
    const item = given[name];
    if (item === undefined || item === null || item === '') {
      value[name] = null;
      continue;
    }
    const parsed = fieldSchema(spec).safeParse(item);
    if (!parsed.success) return { ok: false, error: 'reglage' };
    value[name] = parsed.data;
  }
  for (const name of requiredSettings(definition)) {
    if (value[name] === null || value[name] === undefined) return { ok: false, error: 'reglage' };
  }
  return { ok: true, value };
}

// Ce que la fiche écrit chez cette personne : chaque entrée d'`actions`, type résolu (ou le premier de la liste si
// rien n'est branché), avec l'enjeu et la réversibilité de sa spec. Le public se calcule à chaque écriture : la
// carte d'action le montre, pas la fiche.
function writesOf(definition: AgentDefinition, mine: readonly MyConnection[]): AgentWriteView[] {
  const kinds = new Set<ActionKind>();
  for (const entry of definition.actions) {
    const kind = resolveWrite(entry, mine) ?? kindsOf(entry)[0];
    if (kind) kinds.add(kind);
  }
  return [...kinds].map((kind) => {
    const spec = specOf(kind);
    return {
      kind,
      risk: spec?.risk ?? 'haut',
      reversible: (spec?.reversibility ?? 'irreversible') !== 'irreversible',
    };
  });
}

// Le catalogue tel que la personne le voit : chaque fiche, son activation (la sienne, ou celle de l'équipe), ce qui
// lui manque, et ses exécutions du mois. Trié : les siennes en service, puis celles qu'elle peut activer, puis le
// reste ; dans chaque groupe, l'ordre des services (AGENT_SERVICES), puis l'identifiant.
export async function listAgentCards(ctx: TenantContext, deps: Deps = {}): Promise<AgentCardView[]> {
  const agents = deps.agents ?? AGENTS;
  const read = await withTenant(ctx, async (tx) => {
    const mine = await myConnections(tx, ctx);
    const activations = await tx
      .select({
        id: agentsActives.id,
        userId: agentsActives.userId,
        agentId: agentsActives.agentId,
        portee: agentsActives.portee,
        autonomie: agentsActives.autonomie,
        reglages: agentsActives.reglages,
        actif: agentsActives.actif,
      })
      .from(agentsActives)
      .where(
        and(
          eq(agentsActives.tenantId, ctx.tenantId),
          or(eq(agentsActives.userId, ctx.userId), eq(agentsActives.portee, 'equipe')),
        ),
      );
    const month = await tx
      .select({
        agentId: executionsAgent.agentId,
        runs: count(),
        usd: sql<number>`coalesce(sum(${executionsAgent.coutUsd}), 0)::float8`,
      })
      .from(executionsAgent)
      .where(
        and(
          eq(executionsAgent.userId, ctx.userId),
          eq(executionsAgent.mode, 'reel'),
          sql`${executionsAgent.creeLe} >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`,
        ),
      )
      .groupBy(executionsAgent.agentId);
    const settings = await readAgentSettings(tx, ctx);
    return { mine, activations, month, settings };
  });
  const monthOf = new Map(read.month.map((row) => [row.agentId, row]));
  const cards = Object.values(agents).map((definition): AgentCardView => {
    const row = read.activations.find(
      (a) =>
        a.agentId === definition.id &&
        a.portee === definition.scope &&
        (definition.scope === 'equipe' || a.userId === ctx.userId),
    );
    const required = requiredSettings(definition);
    const activation: ActivationView | null = row
      ? {
          id: row.id,
          scope: row.portee,
          autonomy: row.autonomie,
          active: row.actif,
          settings: row.reglages,
          mine: row.userId === ctx.userId,
        }
      : null;
    return {
      id: definition.id,
      service: definition.service,
      scope: definition.scope,
      families: definition.requires.read as ProviderFamily[],
      writes: writesOf(definition, read.mine),
      settings: Object.fromEntries(
        Object.entries(definition.settings).map(([name, spec]) => [
          name,
          settingView(spec, required.has(name)),
        ]),
      ),
      ceiling: choosableCeiling({
        scope: definition.scope,
        definitionMax: definition.autonomy.max,
        organizationMax: read.settings.maxAutonomy,
      }),
      manual: definition.triggers.some((trigger) => trigger.kind === 'manuel'),
      limits: { runsPerDay: definition.limits.maxRunsPerDay, usd: definition.limits.maxUsd },
      availability: availabilityOf(definition, read.mine),
      activation,
      month: {
        runs: monthOf.get(definition.id)?.runs ?? 0,
        usd: monthOf.get(definition.id)?.usd ?? 0,
      },
    };
  });
  const rank = (card: AgentCardView) =>
    card.activation?.active && card.activation.mine ? 0 : card.availability.ready ? 1 : 2;
  const service = (card: AgentCardView) =>
    AGENT_SERVICES.indexOf(card.service as (typeof AGENT_SERVICES)[number]);
  return cards.sort(
    (a, b) => rank(a) - rank(b) || service(a) - service(b) || a.id.localeCompare(b.id),
  );
}

// Activer une fiche (ou la réactiver : la ligne existe, coupée). Au cran par défaut de la fiche, borné par ce que
// l'écran laisse choisir. Un agent d'équipe : un administrateur seulement, au cran « propose » (9.1).
export async function activateAgent(
  ctx: TenantContext,
  input: { agentId: string; settings: unknown },
  deps: Deps = {},
): Promise<ActivationResult> {
  const definition = (deps.agents ?? AGENTS)[input.agentId];
  if (!definition) return fail('introuvable');
  if (definition.scope === 'equipe' && !(await canInvite(ctx))) return fail('interdit');
  const settings = checkSettings(definition, input.settings);
  if (!settings.ok) return fail(settings.error);
  try {
    return await withTenant(ctx, async (tx) => {
      const org = await readAgentSettings(tx, ctx);
      if (!org.enabled) return fail('coupe');
      if (!availabilityOf(definition, await myConnections(tx, ctx)).ready) return fail('manque');
      const autonomy = lowestAutonomy(
        definition.autonomy.default,
        choosableCeiling({
          scope: definition.scope,
          definitionMax: definition.autonomy.max,
          organizationMax: org.maxAutonomy,
        }),
      );
      const [row] = await tx
        .insert(agentsActives)
        .values({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          agentId: definition.id,
          portee: definition.scope,
          autonomie: autonomy,
          reglages: settings.value,
          actif: true,
          acl: [definition.scope === 'equipe' ? ctx.tenantId : ctx.userId],
        })
        .onConflictDoUpdate({
          target: [
            agentsActives.tenantId,
            agentsActives.agentId,
            agentsActives.userId,
            agentsActives.portee,
          ],
          set: { actif: true, reglages: settings.value, modifieLe: sql`now()` },
        })
        .returning({ id: agentsActives.id });
      return row ? { ok: true as const, id: row.id } : fail('interdit');
    });
  } catch (error) {
    // Un autre administrateur a déjà activé cette fiche pour l'équipe (index unique partiel, 0078).
    if ((error as { cause?: { code?: string } }).cause?.code === '23505') return fail('existe');
    throw error;
  }
}

// Régler une activation : cran, réglages, en service ou coupée. La RLS refuse à un membre ordinaire une activation
// d'équipe (0078) : l'update ne touche aucune ligne, la fonction rend « interdit ».
export async function setActivation(
  ctx: TenantContext,
  input: {
    activationId: string;
    autonomy?: AutonomyLevel;
    settings?: unknown;
    active?: boolean;
  },
  deps: Deps = {},
): Promise<ActivationResult> {
  const agents = deps.agents ?? AGENTS;
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(agentsActives)
      .where(
        and(eq(agentsActives.tenantId, ctx.tenantId), eq(agentsActives.id, input.activationId)),
      );
    const definition = row && agents[row.agentId];
    if (!row || !definition) return fail('introuvable');
    const org = await readAgentSettings(tx, ctx);
    const patch: Partial<typeof agentsActives.$inferInsert> = { modifieLe: new Date() };
    if (input.autonomy !== undefined) {
      const ceiling = choosableCeiling({
        scope: row.portee,
        definitionMax: definition.autonomy.max,
        organizationMax: org.maxAutonomy,
      });
      if (AUTONOMY_LEVELS.indexOf(input.autonomy) > AUTONOMY_LEVELS.indexOf(ceiling)) {
        return fail('interdit');
      }
      patch.autonomie = input.autonomy;
    }
    if (input.settings !== undefined) {
      const settings = checkSettings(definition, input.settings);
      if (!settings.ok) return fail(settings.error);
      patch.reglages = settings.value;
    }
    if (input.active === true) {
      if (!org.enabled) return fail('coupe');
      if (!availabilityOf(definition, await myConnections(tx, ctx)).ready) return fail('manque');
    }
    if (input.active !== undefined) patch.actif = input.active;
    const [updated] = await tx
      .update(agentsActives)
      .set(patch)
      .where(eq(agentsActives.id, row.id))
      .returning({ id: agentsActives.id });
    return updated ? { ok: true as const, id: updated.id } : fail('interdit');
  });
}

// Les agents sont-ils allumés dans l'organisation ? Pour l'écran (src/app ne lit pas la base, ui-imports.test.ts).
export const agentsEnabled = (ctx: TenantContext): Promise<boolean> =>
  withTenant(ctx, async (tx) => (await readAgentSettings(tx, ctx)).enabled);

// Les réglages d'agents de l'organisation, écrits par un propriétaire ou un administrateur (la RLS le redit,
// admin_insert et admin_update de 0057). Même forme que setManagersSeeAll (src/server/auth/organisation.ts:165).
// `monthBudgetUsd` nul : le défaut par siège (9.3, point 4). Le cran écrit ici n'est jamais au-dessus de ce que le
// code laisse (AUTONOMY_CEILING, lu par choosableCeiling) : il ne fait que borner.
export async function setOrgAgentSettings(
  ctx: TenantContext,
  input: { enabled?: boolean; maxAutonomy?: AutonomyLevel; monthBudgetUsd?: number | null },
): Promise<boolean> {
  if (!(await canInvite(ctx))) return false;
  const set: Partial<typeof reglagesOrganisation.$inferInsert> = {};
  if (input.enabled !== undefined) set.agentsActifs = input.enabled;
  if (input.maxAutonomy !== undefined) set.agentsAutonomieMax = input.maxAutonomy;
  if (input.monthBudgetUsd !== undefined) set.agentsBudgetMoisUsd = input.monthBudgetUsd;
  if (Object.keys(set).length === 0) return true;
  await withTenant(ctx, (tx) =>
    tx
      .insert(reglagesOrganisation)
      .values({ tenantId: ctx.tenantId, ...set })
      .onConflictDoUpdate({ target: reglagesOrganisation.tenantId, set }),
  );
  return true;
}
```

À savoir :

- **`reglages` relus deux fois.** Ici, à l'écriture (`checkSettings`) ; par le moteur, à chaque job (`readSettings`, chapitre 04). Une fiche qui change de version garde les réglages valides et met les autres à `null`.
- **Le cran d'une réactivation n'est pas remis au défaut** : `onConflictDoUpdate` ne touche que `actif`, `reglages` et `modifie_le`. Une personne qui avait baissé son cran le retrouve.
- **`agents_budget_mois_usd` est un `numeric(8,2)`** lu en nombre (`customType`, chapitre 01, 14.4). L'écran borne la saisie entre 0 et 100 000 $ (section 8.2).
- **`CONNECTORS[provider]?.write`** : le champ `write` et `granted(config, verb)` sont du chapitre 05 (3.2, écart 1). Un connecteur sans `write` ne peut rien écrire : la fiche qui le demande reste « à brancher ».

### 4.3 `src/server/agents/runs.ts` : le journal

L'architecture (6) nomme ce fichier « lectures de `executions_agent` et `etapes_execution` » et `listRunActions` (5.1, étape 12). Aucun autre chapitre ne l'écrit. Une retouche au chapitre 05 : `TimedAction` porte aussi `executionId` (`toView` ajoute `executionId: row.executionId`), pour grouper « À valider » par exécution sans redéfinir la condition de `listPendingActions`.

```ts
// src/server/agents/runs.ts
import { and, count, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  type PendingGroupView,
  type PendingSummaryView,
  RUN_REASONS,
  RUN_STATUSES,
  type RunDetailView,
  type RunListItem,
  type RunReason,
  type RunSourceView,
  type RunStatus,
  type RunStepDetail,
  type RunStepView,
} from '@/lib/agents';
import type { ActionView } from '@/lib/actions';
import {
  countPendingActions,
  listPendingActions,
  type TimedAction,
  toView,
} from '@/server/actions/store';
import type { TenantContext } from '@/server/auth/tenant-context';
import { actions } from '@/server/db/schema/actions';
import { etapesExecution, executionsAgent } from '@/server/db/schema/agents';
import { sources } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';

// Le journal d'une personne : ses exécutions, leurs étapes, leurs actions. Tout est privé à la personne au nom de qui
// l'agent a tourné (acl = [user_id], 0079), agent d'équipe compris (architecture 9.11) : aucune de ces lectures ne
// rend la ligne d'un autre, même à un administrateur. Le titre d'une source n'est rendu que si la RLS la montre
// encore ; le détail d'une exécution, que si toutes ses sources le sont (9.1, point 10).

export const RUNS_PAGE_SIZE = 30;

const UuidSchema = z.uuid();
const iso = (date: Date | null) => (date ? date.toISOString() : null);
const oneOf = <T extends string>(values: readonly T[], value: string | null): T | null =>
  values.includes(value as T) ? (value as T) : null;

// Les colonnes d'une ligne de liste, et la source jointe sous la RLS : invisible, la jointure ne rend rien.
const listColumns = {
  id: executionsAgent.id,
  agentId: executionsAgent.agentId,
  statut: executionsAgent.statut,
  raison: executionsAgent.raison,
  erreur: executionsAgent.erreur,
  declencheur: executionsAgent.declencheur,
  creeLe: executionsAgent.creeLe,
  finiLe: executionsAgent.finiLe,
  coutUsd: executionsAgent.coutUsd,
  nbAppels: executionsAgent.nbAppelsModele,
  sourceId: executionsAgent.sourceId,
  title: sources.title,
  tool: sources.kind,
  at: sources.lastTurnAt,
  proposed: sql<number>`(select count(*)::int from actions a
    where a.tenant_id = ${executionsAgent.tenantId} and a.execution_id = ${executionsAgent.id})`,
};
type ListRow = {
  id: string;
  agentId: string;
  statut: RunStatus;
  raison: string | null;
  erreur: string | null;
  declencheur: RunListItem['trigger'];
  creeLe: Date;
  finiLe: Date | null;
  coutUsd: number;
  nbAppels: number;
  sourceId: string | null;
  title: string | null;
  tool: string | null;
  at: Date | null;
  proposed: number;
};

const sourceOf = (row: Pick<ListRow, 'sourceId' | 'title' | 'tool' | 'at'>): RunSourceView =>
  row.sourceId === null
    ? null
    : row.tool === null
      ? { title: null, tool: null, at: null } // la source existe peut-être, mais pas pour ce lecteur
      : { title: row.title, tool: row.tool, at: iso(row.at) };

const toListItem = (row: ListRow): RunListItem => ({
  id: row.id,
  agentId: row.agentId,
  status: row.statut,
  reason: oneOf<RunReason>(RUN_REASONS, row.raison),
  error: row.erreur,
  trigger: row.declencheur,
  createdAt: row.creeLe.toISOString(),
  endedAt: iso(row.finiLe),
  usd: row.coutUsd,
  calls: row.nbAppels,
  proposed: row.proposed,
  source: sourceOf(row),
});

const joinSource = and(
  eq(sources.tenantId, executionsAgent.tenantId),
  eq(sources.id, executionsAgent.sourceId),
);

// Ses exécutions réelles, les plus récentes d'abord, par pages de RUNS_PAGE_SIZE. `before` : la date de la dernière
// ligne de la page précédente. `more` : il y a une page après.
export async function listRuns(
  ctx: TenantContext,
  filter: { before?: Date; agentId?: string; status?: RunStatus } = {},
): Promise<{ runs: RunListItem[]; more: boolean }> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select(listColumns)
      .from(executionsAgent)
      .leftJoin(sources, joinSource)
      .where(
        and(
          eq(executionsAgent.tenantId, ctx.tenantId),
          eq(executionsAgent.userId, ctx.userId),
          eq(executionsAgent.mode, 'reel'),
          filter.agentId ? eq(executionsAgent.agentId, filter.agentId) : undefined,
          filter.status && RUN_STATUSES.includes(filter.status)
            ? eq(executionsAgent.statut, filter.status)
            : undefined,
          filter.before ? lt(executionsAgent.creeLe, filter.before) : undefined,
        ),
      )
      .orderBy(desc(executionsAgent.creeLe), desc(executionsAgent.id))
      .limit(RUNS_PAGE_SIZE + 1),
  );
  return {
    runs: (rows as ListRow[]).slice(0, RUNS_PAGE_SIZE).map(toListItem),
    more: rows.length > RUNS_PAGE_SIZE,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Ce qu'une étape a gardé (chapitre 04, 9.7), lu par sa forme : le nom d'étape d'une fiche peut avoir changé depuis
// (agent_version). Jamais le texte d'une source : `lire` et `chercher` ne gardent que des identifiants.
export function stepDetail(sortie: unknown, entree: unknown): RunStepDetail {
  if (isRecord(entree) && typeof entree.reveilLe === 'string') {
    return { kind: 'attente', until: entree.reveilLe };
  }
  if (!isRecord(sortie)) return { kind: 'vide' };
  if (Array.isArray(sortie.refs)) return { kind: 'sources', count: sortie.refs.length };
  if (typeof sortie.texte === 'string') return { kind: 'texte', text: sortie.texte };
  if (Array.isArray(sortie.propositions)) {
    return { kind: 'propositions', count: sortie.propositions.length };
  }
  if (typeof sortie.attente === 'string') {
    return { kind: 'attente', until: typeof sortie.jusqua === 'string' ? sortie.jusqua : null };
  }
  if (typeof sortie.statut === 'string') {
    return {
      kind: 'action',
      actionId: typeof sortie.actionId === 'string' ? sortie.actionId : null,
      outcome: sortie.statut,
    };
  }
  return { kind: 'champs', fields: sortie };
}

const viewOf = (row: typeof actions.$inferSelect): ActionView[] => {
  const timed = toView(row);
  if (!timed) return [];
  const { createdAt: _at, executionId: _run, ...view } = timed;
  return [view];
};

async function actionsOfRun(tx: Tx, ctx: TenantContext, executionId: string) {
  return tx
    .select()
    .from(actions)
    .where(and(eq(actions.tenantId, ctx.tenantId), eq(actions.executionId, executionId)))
    .orderBy(actions.createdAt, actions.id);
}

// Les actions écrites par une exécution (architecture 5.1, étape 12), sous la RLS de la personne.
export async function listRunActions(
  ctx: TenantContext,
  executionId: string,
): Promise<TimedAction[]> {
  if (!UuidSchema.safeParse(executionId).success) return [];
  const rows = await withTenant(ctx, (tx) => actionsOfRun(tx, ctx, executionId));
  return rows.flatMap((row) => toView(row) ?? []);
}

// Une exécution, avec ses étapes et ses actions. Null : inconnue, ou d'un autre. `readable: false` : une source lue
// n'est plus visible du lecteur ; la ligne est rendue sans étapes, sans actions, sans titre.
export async function readRun(
  ctx: TenantContext,
  executionId: string,
): Promise<RunDetailView | null> {
  if (!UuidSchema.safeParse(executionId).success) return null;
  return withTenant(ctx, async (tx) => {
    const [run] = await tx
      .select({
        ...listColumns,
        autonomie: executionsAgent.autonomie,
        contenuExterne: executionsAgent.contenuExterne,
        donneesPrivees: executionsAgent.donneesPrivees,
        sourceIds: executionsAgent.sourceIds,
      })
      .from(executionsAgent)
      .leftJoin(sources, joinSource)
      .where(
        and(
          eq(executionsAgent.tenantId, ctx.tenantId),
          eq(executionsAgent.id, executionId),
          eq(executionsAgent.userId, ctx.userId),
        ),
      );
    if (!run) return null;
    const ids = [...new Set(run.sourceIds)];
    const [seen] =
      ids.length === 0
        ? [{ n: 0 }]
        : await tx
            .select({ n: count() })
            .from(sources)
            .where(and(eq(sources.tenantId, ctx.tenantId), inArray(sources.id, ids)));
    const readable = (seen?.n ?? 0) === ids.length;
    const base = toListItem(run as ListRow);
    const head = {
      autonomy: run.autonomie,
      externalContent: run.contenuExterne,
      privateData: run.donneesPrivees,
    };
    if (!readable) {
      return {
        ...base,
        source: base.source && { title: null, tool: null, at: null },
        ...head,
        readable: false,
        steps: [],
        actions: [],
      };
    }
    const steps = await tx
      .select()
      .from(etapesExecution)
      .where(
        and(
          eq(etapesExecution.tenantId, ctx.tenantId),
          eq(etapesExecution.executionId, run.id),
        ),
      )
      .orderBy(etapesExecution.rang);
    const rows = await actionsOfRun(tx, ctx, run.id);
    return {
      ...base,
      ...head,
      readable: true,
      steps: steps.map(
        (step): RunStepView => ({
          rank: step.rang,
          name: step.nom,
          status: step.statut,
          startedAt: step.creeLe.toISOString(),
          endedAt: iso(step.finiLe),
          detail: stepDetail(step.sortie, step.entree),
        }),
      ),
      actions: rows.flatMap(viewOf),
    };
  });
}

type Head = { id: string; agentId: string; sourceId: string | null; title: string | null; tool: string | null; at: Date | null };

async function headsOf(ctx: TenantContext, ids: string[]): Promise<Map<string, Head>> {
  if (ids.length === 0) return new Map();
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({
        id: executionsAgent.id,
        agentId: executionsAgent.agentId,
        sourceId: executionsAgent.sourceId,
        title: sources.title,
        tool: sources.kind,
        at: sources.lastTurnAt,
      })
      .from(executionsAgent)
      .leftJoin(sources, joinSource)
      .where(and(eq(executionsAgent.tenantId, ctx.tenantId), inArray(executionsAgent.id, ids))),
  );
  return new Map(rows.map((row) => [row.id, row]));
}

// « À valider », groupé par exécution : la plus récente proposition d'abord (listPendingActions trie ainsi), et
// dans un groupe, l'ordre des étapes. Une action sans exécution lisible (exécution supprimée) fait un groupe seule.
export async function listPendingGroups(
  ctx: TenantContext,
  options: { limit?: number } = {},
): Promise<PendingGroupView[]> {
  const pending = await listPendingActions(ctx, { limit: options.limit ?? 200 });
  const heads = await headsOf(ctx, [
    ...new Set(pending.flatMap((action) => (action.executionId ? [action.executionId] : []))),
  ]);
  const groups = new Map<string, PendingGroupView>();
  for (const action of [...pending].reverse()) {
    const head = action.executionId ? heads.get(action.executionId) : undefined;
    const key = head ? head.id : `seule:${action.id}`;
    const { createdAt: _at, executionId: _run, ...view } = action;
    const group = groups.get(key) ?? {
      executionId: head?.id ?? null,
      agentId: head?.agentId ?? null,
      source: head ? sourceOf(head) : null,
      expiresAt: null,
      actions: [],
    };
    group.actions.push(view);
    if (view.expiresAt && (!group.expiresAt || view.expiresAt < group.expiresAt)) {
      group.expiresAt = view.expiresAt;
    }
    groups.set(key, group);
  }
  return [...groups.values()].reverse();
}

// La section de l'Accueil : le total, et les `groups` premiers groupes sans leurs cartes.
export async function readPendingSummary(
  ctx: TenantContext,
  options: { groups?: number } = {},
): Promise<PendingSummaryView> {
  const [total, groups] = await Promise.all([
    countPendingActions(ctx),
    listPendingGroups(ctx, { limit: 50 }),
  ]);
  return {
    total,
    groups: groups
      .slice(0, options.groups ?? 3)
      .map(({ actions: list, ...group }) => ({ ...group, count: list.length })),
  };
}
```

À savoir :

- **Deux lectures pour une exécution illisible.** `readRun` compte les sources visibles parmi `source_ids` avant toute lecture d'étape. `purger_executions` (chapitre 01) vide déjà `entree` et `sortie` dès qu'une source a disparu ; ce compte couvre l'autre cas : la source existe, mais n'est plus partagée au lecteur.
- **Une action en attente reste visible dans « À valider » même si sa source ne l'est plus** : c'est la ligne de la personne, écrite sous ses droits du moment, et elle doit pouvoir la refuser. Seul le titre de la source disparaît de l'en-tête du groupe. Point à relire (section 19).
- **`proposed`** compte toutes les lignes écrites par l'exécution, refusées ou expirées comprises : c'est ce que l'agent a proposé, pas ce qui attend.
- **`listPendingGroups` retourne la liste deux fois** pour garder l'ordre « plus récente d'abord » des groupes tout en rangeant les cartes dans l'ordre des étapes.

### 4.4 `src/server/control/overview.ts` : les comptes

```ts
// src/server/control/overview.ts
import { and, count, eq, sql } from 'drizzle-orm';
import type { MonthCostView, OrgBudgetView } from '@/lib/agents';
import { readAgentSettings } from '@/server/agents/activation';
import { AGENTS_BUDGET_USD_PER_SEAT, monthCapSql } from '@/server/agents/budget';
import type { TenantContext } from '@/server/auth/tenant-context';
import { executionsAgent } from '@/server/db/schema/agents';
import { reglagesOrganisation } from '@/server/db/schema/organisation';
import { withTenant } from '@/server/db/with-tenant';

// Les comptes du poste de contrôle (architecture, 6). Deux sortes, jamais mêlées : ce que coûtent ses propres
// exécutions (sa RLS), et, pour un propriétaire ou un administrateur, l'organisation entière (des fonctions qui ne
// rendent rien à un autre membre). Aucune lecture ne détaille une autre personne (architecture 9.11, point 2).

const MONTH_START = sql`date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`;

// Ses exécutions réelles du mois en cours (UTC, comme budgets_agents.mois), par fiche.
export async function readMonthCost(ctx: TenantContext): Promise<MonthCostView> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({
        agentId: executionsAgent.agentId,
        runs: count(),
        usd: sql<number>`coalesce(sum(${executionsAgent.coutUsd}), 0)::float8`,
        calls: sql<number>`coalesce(sum(${executionsAgent.nbAppelsModele}), 0)::int`,
      })
      .from(executionsAgent)
      .where(
        and(
          eq(executionsAgent.tenantId, ctx.tenantId),
          eq(executionsAgent.userId, ctx.userId),
          eq(executionsAgent.mode, 'reel'),
          sql`${executionsAgent.creeLe} >= ${MONTH_START}`,
        ),
      )
      .groupBy(executionsAgent.agentId),
  );
  return {
    usd: rows.reduce((sum, row) => sum + row.usd, 0),
    runs: rows.reduce((sum, row) => sum + row.runs, 0),
    calls: rows.reduce((sum, row) => sum + row.calls, 0),
    byAgent: rows
      .map(({ agentId, usd, runs }) => ({ agentId, usd, runs }))
      .sort((a, b) => b.usd - a.usd),
  };
}

// Le budget de l'organisation : réservé, dépensé (budget_du_mois, 0076), plafond (monthCapSql, chapitre 04, 12) et
// les deux réglages. Null pour un membre ordinaire : budget_du_mois ne lui rend aucune ligne.
export async function readOrgBudget(ctx: TenantContext): Promise<OrgBudgetView | null> {
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ reserve_usd: string; depense_usd: string; plafond: string }>(
      sql`select b.reserve_usd, b.depense_usd, ${monthCapSql(ctx.tenantId)} as plafond
            from budget_du_mois() b`,
    );
    const budget = rows[0];
    if (!budget) return null;
    const settings = await readAgentSettings(tx, ctx);
    const [own] = await tx
      .select({ cap: reglagesOrganisation.agentsBudgetMoisUsd })
      .from(reglagesOrganisation)
      .where(eq(reglagesOrganisation.tenantId, ctx.tenantId));
    return {
      reservedUsd: Number(budget.reserve_usd),
      spentUsd: Number(budget.depense_usd),
      capUsd: Number(budget.plafond),
      capIsSetting: own?.cap !== null && own?.cap !== undefined,
      perSeatUsd: AGENTS_BUDGET_USD_PER_SEAT,
      enabled: settings.enabled,
      maxAutonomy: settings.maxAutonomy,
    };
  });
}

// Après le jalon 1, avec 0085 : le taux d'acceptation par fiche, sur `days` jours. Des compteurs par agent, à partir
// de trois personnes (taux_acceptation_agents, chapitre 01, 13). Vide pour un membre ordinaire.
export type AcceptanceRow = {
  agentId: string;
  proposed: number;
  done: number;
  cancelled: number;
  expired: number;
  undone: number;
  doneWithoutClick: number;
};

export async function readAcceptance(ctx: TenantContext, days = 30): Promise<AcceptanceRow[]> {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{
      agent_id: string;
      proposees: number;
      faites: number;
      annulees: number;
      expirees: number;
      defaites: number;
      faites_sans_clic: number;
    }>(sql`select * from taux_acceptation_agents(${days})`),
  );
  return rows.map((row) => ({
    agentId: row.agent_id,
    proposed: row.proposees,
    done: row.faites,
    cancelled: row.annulees,
    expired: row.expirees,
    undone: row.defaites,
    doneWithoutClick: row.faites_sans_clic,
  }));
}
```

`budget_du_mois()` ne rend une ligne qu'à un propriétaire ou un administrateur (chapitre 01, 4) : `readOrgBudget` n'a pas besoin de `canInvite`, la base dit déjà non. Le taux lui-même (une formule sur ces compteurs) est fixé par le chapitre 11 ; l'écran montre les compteurs bruts.

## 5. L'écran `/agents`

Jalon 1, PR 07b : les vues `catalogue`, `executions` et `cout`. La vue `canaux` vient après (section 12). Une seule page, quatre vues choisies par l'adresse (`?vue=`), comme les onglets des Réglages (`settings-tabs.tsx`, existe) : chaque vue est lue par le serveur, rien n'est chargé deux fois. Le journal d'une exécution s'ouvre en panneau par `?execution=<id>`, ce qui permet d'y renvoyer depuis « À valider » et depuis un message.

Pourquoi pas une page par vue : l'architecture (6) ne prévoit que `agents/page.tsx` et `a-valider/page.tsx`, et `page-links.test.ts` (existe) ne compte que les chemins, pas les requêtes. Un lien vers `/agents?vue=executions&execution=…` se vérifie comme `/agents`.

### 5.1 Maquettes

Vue « Catalogue » (par défaut), personne ordinaire, jalon 1 (Exemple fictif) :

```
Agents                                                              [ À valider · 3 → ]
[Catalogue]  Exécutions   Coût                                      (Canaux, après le jalon 1)

Vos agents                                                                          (1)
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ◉ Suivi d'échange                                       En service · Propose          │
│ Après une réunion client enregistrée : une note et des tâches sur la fiche du client  │
│ dans le CRM, et un brouillon du mail de suivi dans votre boîte. …                     │
│ Écrit : Note dans HubSpot · Tâche dans HubSpot · Brouillon dans Outlook               │
│ Ce mois-ci : 12 exécutions · 0,46 $                                                   │
│                                                     [ Régler ]  [ Couper ]            │
└──────────────────────────────────────────────────────────────────────────────────────┘

À activer                                                                           (0)
À brancher d'abord                                                                  (1)
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ○ Boîte mail                                                         Chaque salarié   │
│ Pour chaque mail qui attend quelque chose de vous : …                                 │
│ Il manque : un outil de la famille « Mails, chat et agenda ».                         │
│                                                          [ Brancher un outil → ]      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Panneau « Régler » (ou « Activer »), `SidePanel` à droite :

```
Suivi d'échange                                                                     [×]
Après une réunion client enregistrée : …  (agents.catalog.suivi_echange.description)

Ce qu'il écrit       Note dans HubSpot        enjeu bas · s'annule
                     Tâche dans HubSpot       enjeu bas · s'annule
                     Brouillon dans Outlook   enjeu bas · s'annule
Ce qui part sans vous
                     (•) Propose : chaque action attend votre clic
                     ( ) Agit et prévient    pas encore ouvert      ← grisé tant que le cran est au-dessus de ceiling
                     ( ) Agit seul           pas encore ouvert
                     Ce qui sort de la société, ou part d'un mail privé vers vos collègues,
                     attend toujours votre clic.
Réglages             (un champ par réglage de la fiche ; aucun pour suivi_echange)
Limites              20 exécutions par jour au plus, 0,12 $ chacune au plus.

                                                      [ Activer ]   ou   [ Enregistrer ]
```

Vue « Exécutions » :

```
Agents
 Catalogue  [Exécutions]  Coût

[ Tous les agents ▾ ]  [ Tous les états ▾ ]
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ 19 nov. 2026, 10:47   Suivi d'échange    ● Faite       3 actions proposées · 0,04 $  │
│                       « Point devis résidence Les Tilleuls » · Fathom                │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ 19 nov. 2026, 09:02   Suivi d'échange    ○ Ignorée     Plafond du jour atteint       │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ 18 nov. 2026, 16:30   Suivi d'échange    ● Échouée     Le moteur s'est arrêté (panne) │
│                       Source non visible                                             │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                                                     [ Plus anciennes → ]
```

Panneau du journal (`?execution=<id>`) :

```
Suivi d'échange · 19 nov. 2026, 10:47                                               [×]
État           Faite en 1 min 12 s · 5 appels au modèle · 0,04 $
Déclencheur    Fin de réunion client · « Point devis résidence Les Tilleuls » (Fathom)
Ce qu'il a lu  Un contenu extérieur · Rien de privé · Cran : Propose
Étapes         1  lire        faite    1 source lue
               2  faits       faite    Ce qui a été extrait  [Voir]
               3  suites      faite    Ce qui a été extrait  [Voir]
               4  contexte    faite    Ce qui a été extrait  [Voir]
               5  note        faite    Texte rédigé          [Voir]
               6  noter       faite    Action proposée
               7  taches#0    faite    Action proposée
               …
Actions        (une carte d'action par ligne, section 9)
```

Exécution illisible : à la place des étapes et des actions, « Une source que cette exécution a lue ne vous est plus visible : son détail n'est plus montré. »

Vue « Coût » :

```
Ce mois-ci, pour vous            0,46 $    12 exécutions    60 appels au modèle
Par agent                        Suivi d'échange     0,46 $    12

— pour un propriétaire ou un administrateur seulement —
Votre espace ce mois-ci          réservé 0,24 $ · dépensé 3,10 $ · plafond 160,00 $ (2 %)
                                 Plafond : 8 $ par membre (défaut)   [ Changer ]
Agents dans l'espace             [■ allumés]   Couper arrête toute nouvelle exécution ;
                                               les validations en attente restent valables.
Cran le plus haut permis         [ Agit et prévient ▾ ]   (au jalon 1 : « Propose » pour tous)
Taux d'acceptation (30 jours)    après 0085 : un tableau par agent, trois personnes au moins
```

États vides et messages fixes :

| Cas | Ce que dit l'écran (clé) |
|---|---|
| Aucun modèle réglé (`getLlm(env) === null`) | `agents.noModel` : « Aucun modèle n'est réglé : les agents ne tournent pas. » en `Notice` au-dessus des vues |
| `reglages_organisation.agents_actifs = false` | `agents.cut` : « Les agents sont coupés pour votre espace. Un administrateur peut les rallumer dans Coût. » |
| Catalogue vide | `agents.catalogEmpty` |
| Aucune exécution | `agents.runs.empty` : « Aucune exécution pour l'instant. Une exécution apparaît ici dès qu'un agent en service est réveillé. » |

### 5.2 Les composants

Dossier `src/components/verre/agents/` (à créer), sur le modèle de `src/components/verre/connexions/` (existe : un `index.tsx` qui exporte l'écran, des parties, un `model.ts` pur et son test). Tous sont des composants client (`'use client'`) : ils n'importent du serveur que des types et des server actions (`ui-imports.test.ts`, existe).

| Fichier | Exporte | Rôle | Kit utilisé |
|---|---|---|---|
| `index.tsx` | `AgentsScreen` | En-tête (`PageHeader`, titre et lien « À valider · N »), onglets en liens, la vue choisie, le panneau du journal | `PageHeader`, `Notice`, `Pill` |
| `catalogue.tsx` | `AgentCatalog`, `AgentCard`, `ActivationPanel` | Les trois groupes (vos agents, à activer, à brancher d'abord) ; après le jalon 1, « Pour l'équipe » ; le panneau d'activation | `Section`, `Button`, `SidePanel`, `Facts`, `Fact`, `Field`, `Select`, `Input`, `Switch`, `Notice` |
| `executions.tsx` | `RunList`, `RunFilters` | La liste paginée, deux filtres (agent, état) qui réécrivent l'adresse | `Select`, `Badge`, `ToolLogo`, `EmptyState` |
| `journal.tsx` | `RunJournal` | Le panneau d'une exécution : en-tête, provenance, étapes, actions | `SidePanel`, `Facts`, `Fact`, `Collapsible`, `ActionCard` |
| `cout.tsx` | `CostView`, `OrgAgentSettings` | Ses comptes ; pour un administrateur, le budget et les deux réglages de l'organisation | `Facts`, `Switch`, `Select`, `Input`, `Button` |
| `a-valider.tsx` | `PendingBoard`, `HomePending` | Section 6 et section 7 | `Section`, `ActionCard`, `EmptyState` |
| `canaux.tsx` | `ChannelsView` | Après le jalon 1 (section 12) | `Switch`, `Select`, `Button`, `Notice` |
| `model.ts` | `AGENT_VIEWS`, `parseAgentsParams`, `agentsHref`, `runTone`, `formatUsd`, `budgetShare`, `durationOf`, `groupCards` | Le pur : lecture de l'adresse, tons, montants, groupes | |
| `model.test.ts` | | Les tests du pur (section 16) | |

### 5.3 `src/components/verre/agents/model.ts` (code complet)

```ts
// src/components/verre/agents/model.ts
import {
  type AgentCardView,
  RUN_STATUSES,
  type RunListItem,
  type RunStatus,
} from '@/lib/agents';

// Ce que l'écran /agents calcule sans base ni React : la lecture de l'adresse, les liens, les tons, les montants.

export const AGENT_VIEWS = ['catalogue', 'executions', 'cout', 'canaux'] as const;
export type AgentView = (typeof AGENT_VIEWS)[number];

export type AgentsParams = {
  view: AgentView;
  executionId: string | null; // le journal ouvert
  agentId: string | null; // filtre des exécutions
  status: RunStatus | null; // filtre des exécutions
  before: Date | null; // page suivante
  agent: string | null; // ?agent= sur le catalogue : le panneau de cette fiche s'ouvre
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^[a-z][a-z0-9_]{1,39}$/; // le Name des fiches (architecture 8.5)
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// L'adresse vient du navigateur : rien n'y est cru. Une valeur inconnue vaut l'absence.
export function parseAgentsParams(raw: Record<string, string | string[] | undefined>): AgentsParams {
  const vue = first(raw.vue);
  const execution = first(raw.execution);
  const agent = first(raw.agent);
  const etat = first(raw.etat);
  const avant = first(raw.avant);
  const before = avant ? new Date(avant) : null;
  return {
    view: AGENT_VIEWS.includes(vue as AgentView) ? (vue as AgentView) : 'catalogue',
    executionId: execution && UUID.test(execution) ? execution.toLowerCase() : null,
    agentId: agent && NAME.test(agent) ? agent : null,
    status: RUN_STATUSES.includes(etat as RunStatus) ? (etat as RunStatus) : null,
    before: before && !Number.isNaN(before.getTime()) ? before : null,
    agent: agent && NAME.test(agent) ? agent : null,
  };
}

// Un lien de l'écran : la vue, puis seulement les paramètres utiles, dans un ordre fixe.
export function agentsHref(params: Partial<Record<'vue' | 'execution' | 'agent' | 'etat' | 'avant', string | null>>): string {
  const search = new URLSearchParams();
  for (const key of ['vue', 'agent', 'etat', 'avant', 'execution'] as const) {
    const value = params[key];
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/agents?${query}` : '/agents';
}

// Le ton d'un état (Badge) : vert fait, rouge échoué, ambre ce qui attend, gris le reste.
export type RunTone = 'success' | 'danger' | 'warning' | 'neutral';
export const runTone = (status: RunStatus): RunTone =>
  status === 'faite'
    ? 'success'
    : status === 'echouee'
      ? 'danger'
      : status === 'en-file' || status === 'en-cours' || status === 'en-attente'
        ? 'warning'
        : 'neutral';

// Un montant en dollars : deux décimales, trois sous un cent (« 0,004 $ »), le format de la langue.
export function formatUsd(usd: number, locale: string): string {
  const digits = usd !== 0 && Math.abs(usd) < 0.01 ? 3 : 2;
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(usd);
}

// La part du plafond prise par le réservé et le dépensé, en pour cent entier, bornée à 100.
export const budgetShare = (reserved: number, spent: number, cap: number): number =>
  cap <= 0 ? 100 : Math.min(100, Math.round(((reserved + spent) / cap) * 100));

// La durée d'une exécution finie, en secondes ; null tant qu'elle tourne.
export const durationOf = (run: Pick<RunListItem, 'createdAt' | 'endedAt'>): number | null =>
  run.endedAt === null
    ? null
    : Math.max(0, Math.round((Date.parse(run.endedAt) - Date.parse(run.createdAt)) / 1000));

// Les trois groupes du catalogue, dans l'ordre de listAgentCards : ses agents (en service ou coupés), ceux qu'elle
// peut activer, ceux qui demandent d'abord un outil. Les fiches d'équipe à part : un administrateur les active, les
// autres les voient seulement.
export function groupCards(cards: readonly AgentCardView[]) {
  const personal = cards.filter((card) => card.scope === 'personne');
  return {
    mine: personal.filter((card) => card.activation !== null),
    ready: personal.filter((card) => card.activation === null && card.availability.ready),
    missing: personal.filter((card) => card.activation === null && !card.availability.ready),
    team: cards.filter((card) => card.scope === 'equipe'),
  };
}
```

`agentsHref` produit des chaînes à gabarit (`` `/agents?${query}` ``) : `page-links.test.ts` les normalise en `/agents`, qui existe.

### 5.4 `src/app/(app)/agents/page.tsx` (code complet)

```tsx
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AgentsScreen } from '@/components/verre/agents';
import { parseAgentsParams } from '@/components/verre/agents/model';
import { countPendingActions } from '@/server/actions/store';
import { agentsEnabled, listAgentCards } from '@/server/agents/activation';
import { listRuns, readRun } from '@/server/agents/runs';
import { canInvite } from '@/server/auth/members';
import { requireUserContext } from '@/server/auth/session';
import { readMonthCost, readOrgBudget } from '@/server/control/overview';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';
import { logError } from '@/server/log';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('agents'))('title') };
}

// Une partie facultative de l'écran : sa panne ne prive pas du reste (elle est notée), comme sur l'Accueil.
const optional = <T,>(what: string, read: Promise<T>) =>
  read.catch((error) => {
    logError(what, error);
    return null;
  });

// /agents : le catalogue et les activations, les exécutions et leur journal, les comptes. Chaque vue est lue ici, par
// le serveur, sous les droits de la personne : la page ne reçoit que des vues (src/lib/agents.ts), jamais une ligne.
export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireUserContext();
  const params = parseAgentsParams(await searchParams);
  const [cards, pending, admin, enabled] = await Promise.all([
    listAgentCards(ctx),
    optional('agents.pastille', countPendingActions(ctx)),
    canInvite(ctx),
    agentsEnabled(ctx),
  ]);
  const [runs, run, month, budget] = await Promise.all([
    params.view === 'executions'
      ? optional(
          'agents.executions',
          listRuns(ctx, {
            before: params.before ?? undefined,
            agentId: params.agentId ?? undefined,
            status: params.status ?? undefined,
          }),
        )
      : null,
    params.executionId ? optional('agents.journal', readRun(ctx, params.executionId)) : null,
    params.view === 'cout' ? optional('agents.cout', readMonthCost(ctx)) : null,
    params.view === 'cout' && admin ? optional('agents.budget', readOrgBudget(ctx)) : null,
  ]);
  // La vue Canaux n'existe qu'après le jalon 1 (section 12) : d'ici là, elle retombe sur le catalogue.
  const view = params.view === 'canaux' ? 'catalogue' : params.view;
  return (
    <AgentsScreen
      view={view}
      params={params}
      cards={cards}
      pending={pending ?? 0}
      admin={admin}
      enabled={enabled}
      modelAvailable={getLlm(env) !== null}
      runs={runs}
      run={run}
      month={month}
      budget={budget}
    />
  );
}
```

`agentsEnabled` (ajout, section 4.2) lit `reglages_organisation.agents_actifs` par `readAgentSettings` : un fichier de `src/app` n'importe pas `@/server/db` (`ui-imports.test.ts`, existe), d'où une fonction de trois lignes plutôt qu'un `withTenant` dans la page.

### 5.5 `index.tsx`, `catalogue.tsx`, `executions.tsx`, `journal.tsx`, `cout.tsx` (esquisses commentées)

```tsx
// src/components/verre/agents/index.tsx
'use client';
// AgentsScreen : PageHeader(title = t('title'), actions = <Pill href="/agents/a-valider">{t('pending.link', {count})}</Pill>
// quand pending > 0). Sous l'en-tête, un <nav aria-label={t('tabs.label')}> de liens (agentsHref({ vue })) avec
// aria-current="page" sur la vue courante, comme les onglets des Réglages. Au-dessus des vues : <Notice tone="warning">
// t('noModel') si !modelAvailable ; t('cut') si !enabled. Puis :
//   view === 'catalogue'  → <AgentCatalog cards admin openAgent={params.agent} />
//   view === 'executions' → <RunFilters cards params /> <RunList runs params />
//   view === 'cout'       → <CostView month budget />
// Toujours : <RunJournal run={run} /> si params.executionId ; fermer = router.replace(agentsHref({ … sans execution })).
// Props : { view, params, cards, pending, admin, enabled, modelAvailable, runs, run, month, budget }.

// src/components/verre/agents/catalogue.tsx
'use client';
// AgentCatalog : groupCards(cards) ; une <Section> par groupe non vide (title t('catalog.mine'|'ready'|'missing'),
// count = longueur). « Pour l'équipe » (t('catalog.team')) seulement si une fiche d'équipe existe (après le jalon 1).
// AgentCard : <article> ; titre t(`catalog.${id}.name`) ; à droite, l'état : t('card.active'|'card.paused') et
// t(`autonomy.${activation.autonomy}`) ; description t(`catalog.${id}.description`) ; ligne « Écrit : » =
// writes.map(w => t(`kinds.${actionProvider(w.kind)}.${actionVerb(w.kind)}`)).join(' · ') ; ligne du mois
// t('card.month', { runs, usd: formatUsd(usd, locale) }) quand runs > 0 ; si !availability.ready :
// t('card.missingFamilies', { families }) (FAMILY_LABELS ou FAMILY_LABELS_EN selon la langue, src/lib/providers.ts:15,
// :25) et/ou t('card.missingWrites', { tools }) (PROVIDER_LABELS des types de missingWrites résolus) + bouton lien
// « Brancher un outil » vers /connections. Boutons : « Activer » ou « Régler » (ouvrent ActivationPanel) ; « Couper »
// et « Remettre en service » appellent updateActivationAction({ activationId, active }). Un agent d'équipe, pour un
// membre ordinaire : aucun bouton, la ligne t('card.teamReadOnly').
// ActivationPanel : <SidePanel title=nom> ; <Facts> : « Ce qu'il écrit » (une ligne par write : titre générique,
// t(`discussionView.action.risk.${risk}`), t(reversible ? 'card.reversible' : 'discussionView.action.irreversible')) ;
// « Ce qui part sans vous » : trois boutons radio (AUTONOMY_LEVELS), désactivés au-dessus de card.ceiling, avec
// t('activation.ceilingNote') quand ceiling === 'propose' ; la phrase fixe t('activation.alwaysClick') (9.7) ;
// « Réglages » : un champ par entrée de card.settings (choix → Select ; texte → Input maxLength=max ; date → Input
// type="date" ; booleen → Switch ; personne → Input type="email" ; liste → t('activation.listSetting'), non modifiable),
// requis marqués ; « Limites » t('activation.limits', { runs, usd }). Bouton principal : activateAgentAction ou
// updateActivationAction ; le résultat { error } s'affiche par t(`errors.${error}`) sous le bouton (rôle status).
// Après le jalon 1 : la ligne de raiseSuggestion (chapitre 06, 3.4), lue par readRaiseSuggestionAction, au-dessus des
// boutons radio, avec « Passer à ce cran » (updateActivationAction({ autonomy: suggestion.to })).

// src/components/verre/agents/executions.tsx
'use client';
// RunFilters : deux Select (agents = cards.map(id → nom traduit) ; états = RUN_STATUSES → t(`runs.status.${s}`)) ;
// onChange → router.push(agentsHref({ vue: 'executions', agent, etat })).
// RunList : une liste <ol> ; chaque ligne est un lien agentsHref({ …filtres, execution: run.id }) qui ouvre le journal.
// Colonnes : formatDateTime(createdAt, locale) ; nom de l'agent ; <Badge tone={runTone(status)}>t(`runs.status.${status}`)
// </Badge> ; à droite : status ignoree|annulee|echouee → t(`runs.reason.${reason}`) (sinon, proposées et coût :
// t('runs.proposed', { count }) · formatUsd) ; dessous, la source : <ToolLogo kind={tool} size={16}/> « title » ou
// t('runs.sourceHidden') si title est nul. `more` → lien « Plus anciennes » agentsHref({ …, avant: dernière.createdAt }).
// Vide : <EmptyState title={t('runs.empty')} />.

// src/components/verre/agents/journal.tsx
'use client';
// RunJournal({ run }) : <SidePanel open onOpenChange={close} title={`${nom} · ${formatDateTime(createdAt)}`}>.
// <Facts> : État (Badge + durée durationOf + t('run.calls', { count: calls }) + formatUsd) ; Raison si reason
// (t(`runs.reason.${reason}`) et, en petit, le code `error`) ; Déclencheur t(`run.trigger.${trigger}`) + source ;
// « Ce qu'il a lu » : t(externalContent ? 'run.external' : 'run.noExternal'), t(privateData ? 'run.private' :
// 'run.noPrivate'), t(`autonomy.${autonomy}`).
// !readable → <Notice>t('run.unreadable')</Notice> et rien d'autre.
// Étapes : <ol> ; rang, nom, statut (t(`run.stepStatus.${status}`)), détail selon detail.kind :
//   sources → t('run.sources', { count }) ; champs → <Collapsible> t('run.fields') puis <dl> clé : valeur
//   (JSON.stringify pour une liste, échappé par React) ; texte → <Collapsible> t('run.text') puis <pre
//   className="whitespace-pre-wrap"> ; propositions → t('run.proposals', { count }) ; action → t(`run.action.${outcome}`)
//   (proposee, faite, echouee, sautee, refusee ; autre → t('run.action.autre')) ; attente → t('run.waiting', { until }) ;
//   vide → t('run.emptied').
// Actions : run.actions.map(a => <ActionCard action={a} />) (section 9).

// src/components/verre/agents/cout.tsx
'use client';
// CostView({ month, budget }) : <Section title={t('cost.mine')}> trois chiffres (formatUsd(month.usd), runs, calls)
// puis la table par agent. budget non nul (administrateur) : <Section title={t('cost.org')}> réservé, dépensé,
// plafond, budgetShare en barre (role="meter", aria-valuenow) ; t(budget.capIsSetting ? 'cost.capSetting' :
// 'cost.capDefault', { perSeat: formatUsd(8) }) ; <OrgAgentSettings budget /> : Switch « Agents allumés »
// (setOrgAgentSettingsAction({ enabled })), Select « Cran le plus haut permis » (AUTONOMY_LEVELS ; au jalon 1, une
// ligne t('cost.ceilingNote') dit que tous restent à « Propose »), Input numérique « Plafond du mois » (vide = défaut).
// Après 0085 : <Section title={t('cost.acceptance')}> la table de readAcceptance, ou t('cost.acceptanceEmpty')
// (« Les compteurs apparaissent quand trois personnes au moins ont activé un même agent. »).
```

Le prix par siège affiché (« 8 $ par membre ») vient de `AGENTS_BUDGET_USD_PER_SEAT` (`budget.ts`, chapitre 04, 12), passé dans `OrgBudgetView` par une propriété de plus, `perSeatUsd`, plutôt qu'écrit dans le composant : le chapitre 11 révise la valeur.

## 6. La boîte `/agents/a-valider`

Jalon 1, PR 07c. C'est la cible de tous les liens qui sortent de Leon (récapitulatif, Slack) : une page, sous session, qui ne fait rien par elle-même. Rien ne s'exécute par un GET (architecture 9.7) : chaque écriture part d'un clic sur une carte, par une server action.

### 6.1 Maquette

```
À valider                                                                      3 actions

Suivi d'échange · « Point devis résidence Les Tilleuls » · Fathom · 19 nov. 2026, 10:00
                                                        Expire le 26 nov. 2026 · [Journal]
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [logo HubSpot] Ajouter une note sur la fiche HubSpot « Paul Girard ».                  │
│ Proposée par un agent · Lu par vos collègues · Enjeu bas · S'annule                    │
│ Fiche        Paul Girard                                                               │
│ │ 19 novembre 2026 : point sur le devis de rénovation de la résidence Les Tilleuls…   │
│ [ Ajouter la note ]  [ Annuler ]                                                       │
│ Rien n'est fait tant que vous ne confirmez pas.                                        │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [logo HubSpot] Créer la tâche « Envoyer le devis révisé… » sur la fiche HubSpot …      │
│ …                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [logo Outlook] Préparer dans Outlook un brouillon de réponse à « Suite à notre … ».   │
│ Proposée par un agent · Reste chez vous · Enjeu bas · S'annule                         │
│ …                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

(Exemple fictif, repris du chapitre 08, 4.5. Les phrases sont celles des clés `discussionView.action.kinds.*` du chapitre 05.)

Vide : `EmptyState`, « Rien à valider. Les propositions de vos agents arrivent ici. » et un lien vers `/agents`.

### 6.2 `src/app/(app)/agents/a-valider/page.tsx` (code complet)

```tsx
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PendingBoard } from '@/components/verre/agents/a-valider';
import { listPendingGroups } from '@/server/agents/runs';
import { requireUserContext } from '@/server/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('agents'))('pending.title') };
}

// /agents/a-valider : les propositions de ses agents qui attendent son clic, groupées par exécution. La cible des liens
// du récapitulatif et de Slack : la page ne fait rien d'elle-même, chaque écriture part d'un clic sur une carte.
export default async function PendingPage() {
  const ctx = await requireUserContext();
  const groups = await listPendingGroups(ctx);
  return <PendingBoard groups={groups} />;
}
```

Pas de `optional` ici : la liste est la page. Une panne remonte à `src/app/(app)/error.tsx` (existe).

### 6.3 `src/components/verre/agents/a-valider.tsx` (esquisse commentée)

```tsx
'use client';
// PendingBoard({ groups }) : la liste est figée au montage (useState(groups)). Un clic revalide la mise en page
// (decideActionAction, section 8.4) pour la pastille ; la page relue ne doit pas faire disparaître la carte qu'on
// vient de valider : la personne y lit le résultat et le lien vers l'outil. Une proposition arrivée pendant la lecture
// apparaît à la visite suivante.
// PageHeader title=t('pending.title') ; à droite, t('pending.count', { count: total }).
// Pour chaque groupe : <section id={`execution-${executionId}`} aria-labelledby=…> ; en-tête :
//   nom de l'agent t(`catalog.${agentId}.name`) (agentId nul ou inconnu des messages : t('pending.unknownAgent')) ;
//   source : <ToolLogo kind={tool} size={16}/> « title » · formatDateTime(at) ; title nul : t('pending.sourceHidden') ;
//   à droite : t('pending.expires', { date: formatDate(expiresAt) }) et le lien t('pending.journal') vers
//   agentsHref({ vue: 'executions', execution: executionId }).
//   Puis group.actions.map(action => <ActionCard key={action.id} action={action} />).
// Vide : <EmptyState title={t('pending.empty')} action={<Link href="/agents">{t('title')}</Link>} />.

// HomePending({ summary }) : section 7.
```

## 7. La section « À valider » de l'Accueil

Jalon 1, PR 07c. Architecture, 6 : « Section « À valider », chargée par `optional('accueil.a_valider', …)` ».

### 7.1 Maquette

Entre le champ où l'on demande (et ses questions à essayer) et le point du matin :

```
À valider (3)                                                              Tout voir →
  Suivi d'échange · « Point devis résidence Les Tilleuls » · Fathom             3 actions
  Boîte mail · source non visible                                                1 action
```

Trois groupes au plus. Rien quand rien n'attend : la section ne s'affiche pas (« la barre ne dit quelque chose que si quelque chose ne va pas », `sidebar.tsx:258-262`, même règle).

### 7.2 `src/app/(app)/page.tsx` (existe) : ce qui change dans `Home`

```tsx
import { HomePending } from '@/components/verre/agents/a-valider';
import { readPendingSummary } from '@/server/agents/runs';

// :127, le premier Promise.all gagne une lecture facultative :
  const [profile, member, suggestion, points, week, pending] = await Promise.all([
    optional('accueil.profil', getViewerProfile(ctx)),
    readOnboardingMember(ctx),
    optional('apropos.lecture', readAboutSuggestion(ctx)),
    optional('accueil.point', homeBriefings(ctx)),
    optional('accueil.semaine', readWeek(ctx)),
    optional('accueil.a_valider', readPendingSummary(ctx, { groups: 3 })),
  ]);

// :171, après les questions à essayer, avant la grille du point du matin :
      {pending && pending.total > 0 && (
        <div className="mt-9">
          <HomePending summary={pending} />
        </div>
      )}
```

`HomePending` (dans `a-valider.tsx`) : `<Section id="a-valider" title={t('pending.title')} count={summary.total} tone={3} actions={<Link href="/agents/a-valider">{t('pending.seeAll')}</Link>}>` puis une ligne par groupe : un lien vers `` `/agents/a-valider#execution-${executionId}` ``, le nom de l'agent, la source (ou `pending.sourceHidden`), `t('pending.count', { count })` à droite. Pas de carte d'action sur l'Accueil : valider se fait dans la boîte, où l'on voit ce qui part.

Le chapitre 08 (5.5) laisse aussi au chapitre 07 « les actions en attente et faites par les agents » comme matière du point du matin (`gather.ts`). Ce chapitre ne le fait pas : la section ci-dessus dit déjà ce qui attend, sans modèle. Le point du matin reste au module `briefing` (écart 7).

## 8. Les server actions

(à écrire)

## 9. La carte d'action

(à écrire)

## 10. Les clés de traduction

(à écrire)

## 11. Après le jalon 1 : l'envoi mutualisé (`email/send.ts`)

(à écrire)

## 12. Après le jalon 1 : préférences de canaux et langue

(à écrire)

## 13. Après le jalon 1 : le récapitulatif par e-mail

(à écrire)

## 14. Après le jalon 1 : l'appli Slack

(à écrire)

## 15. Après le jalon 1 : files `recap-*` et `canal-*`, `notifyAction`, `decideFromChannel`

(à écrire)

## 16. Tests à écrire

(à écrire)

## 17. Ordre de mise en œuvre

(à écrire)

## 18. Écarts avec l'architecture

(à écrire)

## 19. Ce que je n'ai pas vérifié

(à écrire)
