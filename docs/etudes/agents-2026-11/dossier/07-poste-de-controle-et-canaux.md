# 07. Le poste de contrôle et les canaux

20 novembre 2026 · chapitre du dossier de conception · à relire par David et Amos

Ce chapitre écrit ce que la personne voit de ses agents, et ce qui la prévient quand elle n'est pas dans Leon. Il recopie les noms de l'architecture (`00-architecture.md`). Il cite sans les refaire le SQL du chapitre 01, le routage du chapitre 02, le moteur du chapitre 04, les actions du chapitre 05, les gardes du chapitre 06 et les fiches des chapitres 08 et 09.

Convention : **existe** (chemin et ligne, lus au commit `b075333` pour les sections 1 à 7, `7a3fffd` pour les suivantes ; aucun fichier de `src/` n'a changé entre les deux) ; **à créer** (nom fixé ici ou dans l'architecture) ; **à vérifier** (point d'éditeur ou de bibliothèque non relu). Rien n'a été lancé : ni serveur, ni test, ni migration.

## 1. Ce que ce chapitre fixe

1. Les écrans : `/agents` (catalogue et activation, exécutions et journal, coût, canaux), `/agents/a-valider`, la section « À valider » de l'Accueil, la pastille de la barre latérale, l'entrée `Agents` de `NAV`, le guide et leurs tests.
2. Les lectures qui les nourrissent : le reste de `src/server/agents/activation.ts` (`agentsAvailable`, activer, régler, lister), `src/server/agents/runs.ts` (`listRuns`, `readRun`, `listRunActions`, `listPendingGroups`, `readPendingSummary`, `readableRuns`, `confirmBlock`), `src/server/control/overview.ts`, et les vues partagées de `src/lib/agents.ts`.
3. Les server actions de `src/app/(app)/agents/actions.ts` (`refusePendingActionAction` compris), la garde de `decideActionAction`, `undoActionAction`, et les clés `navigation.agents`, `shell.toValidate`, `agents.*` (dont `agents.kinds` et `agents.catalog.suivi_echange`) en français et en anglais.
4. Après le jalon 1 : `email/send.ts` (un seul envoi vers Resend), le récapitulatif sans contenu (`email/recap.ts`, son gabarit, son test), `preferences_canaux` et la langue en base, les files `recap-*` et `canal-*`.
5. Après le jalon 1 : l'appli Slack (manifeste, installation, `linkSlackUser`, message direct, boutons, route des clics, `canal-clic`, `decideFromChannel`).
6. Deux règles que l'architecture laisse ouvertes : une proposition dont la source n'est plus visible se refuse et ne se valide plus ; couper les agents gèle les propositions et les messages (écarts 19 et 24).

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
| `listRuns`, `readRun`, `listRunActions`, `listPendingGroups`, `readPendingSummary`, `readableRuns`, `confirmBlock` | `src/server/agents/runs.ts` | à créer | 1 | 07a |
| `readMonthCost`, `readOrgBudget` ; `readAcceptance` | `src/server/control/overview.ts` | à créer | 1 ; `readAcceptance` après (0085) | 07a ; 07j |
| `countPendingIn`, `countPendingByRun` | `src/server/actions/store.ts` | à créer (chapitre 05) ; ajout ici | 1 | 07a |
| `ActionView.reversible` (lu par `parseActionView`, posé par `toView`) | `src/lib/actions.ts`, `src/server/actions/store.ts` | à créer (chapitre 05) ; retouche portée par 07a (écart 1) | 1 | 07a |
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
| Préférences et langue | `src/server/channels/preferences.ts` (`rememberLocale` compris) ; `setLocaleAction` (`src/app/(app)/settings/actions.ts:59-70`) ; `src/app/(app)/layout.tsx`, `readSidebar` (la langue du cookie, une fois) | à créer ; existent, à modifier | après | 07e |
| `notifyAction`, `notifyProposed`, `decideFromChannel` | `src/server/channels/notify.ts`, `click.ts` | à créer | après | 07h |
| Files `recap-tic`, `recap-envoyer`, `canal-envoyer`, `canal-clic` | `src/server/channels/queue.ts`, `worker.ts` | à créer | après | 07f, 07h |
| Appli Slack | `src/server/slack/{client,manifest,install,link,post,interactions}.ts` | à créer (`client.ts` et `manifest.ts` : ajouts) | après | 07g, 07h |
| Variables `LEON_SLACK_*` | `src/server/env.ts:30` (schéma), `.env.example` | existent ; à modifier | après | 07g |
| Manifeste de l'appli Slack | `docs/guides/slack-manifeste.yml` | à créer | après | 07g |
| Routes Slack (installation, clics) | `src/server/api/app.ts:31-48` ; `PUBLIC` de `src/test/contracts/route-guards.db.test.ts:24-29` | existent ; à modifier | après | 07g, 07h |
| `startChannelsWorker` | `src/instrumentation-node.ts:19-47` | existe ; à modifier | après | 07f |
| Point d'appel de `notifyProposed` | `runExecution`, `src/server/agents/engine/run.ts` (chapitre 04, 8) | à créer ; ajout ici (15.2) | après | 07h |
| Agents d'équipe à l'écran (`takeOverTeamAgentAction`, groupe « Pour l'équipe ») | `agents/actions.ts`, `catalogue.tsx` | à créer | après | 07k |

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
| `textArray` (un tableau en paramètre SQL) | `src/server/search/filters-sql.ts:19` | existe | |
| `Tone` (les tons de `Badge`) | `src/components/verre/ui/badge.tsx:4`, réexporté par `src/components/verre/ui/index.ts:4` | existe | |
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
| `verifyWebhook`, `VerifyInput`, `Verdict`, `parseBodyJson` | `src/server/webhooks/verify.ts` | à créer | 03 (4.3) |
| `WebhookVerification` | `src/server/connectors/types.ts` | à créer (ajout) | 03 (3) |
| `mustNotify`, `raiseSuggestion`, `RaiseSuggestion` | `src/lib/agents.ts` | à créer | 06 (3.1, 3.2) |
| `startManualRun`, `ManualRunSchema` | `src/server/agents/manual.ts` | à créer | 09 (8.2) |
| `takeOverTeamAgent` ; `readRaiseRows` | `src/server/agents/departure.ts` ; `activation.ts` | à créer | 06 (8.2, 3.4) |
| `startManualRunAction` | `src/app/(app)/agents/actions.ts` (ce chapitre crée le fichier) | à créer | 09 (PR 09c) |

### 2.4 Trois règles qui tiennent tout l'écran

1. **Rien de ce qu'un administrateur voit ne parle d'une personne.** Le journal, les actions, le coût d'une exécution se lisent sous la RLS de la personne (`acl = array[user_id]`, chapitre 01). Un administrateur voit le budget de l'organisation (`budget_du_mois`) et, après 0085, des compteurs par agent (`taux_acceptation_agents`, trois personnes au moins). Aucune lecture de ce chapitre n'agrège par `user_id` pour un autre que soi (architecture 9.11, point 2).
2. **Ce qui a été lu se revérifie à la lecture.** Le titre d'une source n'est affiché que si la RLS la montre encore. Le détail d'une exécution (étapes, extraits, texte rédigé) n'est rendu que si toutes ses `source_ids` sont encore visibles (architecture 9.1, point 10) ; ses propositions en attente, sinon, arrivent sans paramètres et ne se valident plus (`readableRuns`, `confirmBlock`, 4.3 ; écart 19).
3. **Ce qui sort de Leon ne porte aucun contenu.** Le récapitulatif et les messages Slack ne portent que des nombres, des noms d'outils, des noms de fiches et des titres génériques par type d'action. Jamais un paramètre, un `summary`, un titre de source, un nom de client : c'est la règle de l'architecture (9.12, point 1). Les titres génériques sont des clés que ce chapitre ajoute, `agents.kinds.<outil>.<verbe>` (« Note dans HubSpot »), sans aucun `{…}` (écart 20). Les phrases de la carte, `discussionView.action.kinds.<outil>.<verbe>` (chapitre 05), portent les paramètres (« Ajouter une note sur la fiche HubSpot « {record_name} » ») : elles ne sortent jamais de Leon.

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

// La section « À valider » de l'Accueil (readPendingSummary, chapitre 07) : le compte par exécution, en SQL, sous la
// même condition. Les `limit` exécutions dont la proposition la plus récente est la plus récente d'abord. Une action
// sans exécution (il n'y en a pas pour une action d'agent ; défense) fait le groupe `executionId: null`.
export async function countPendingByRun(
  tx: Tx,
  ctx: TenantContext,
  limit: number,
): Promise<Array<{ executionId: string | null; count: number; expiresAt: Date | null }>> {
  return tx
    .select({ executionId: actions.executionId, count: count(), expiresAt: min(actions.expireLe) })
    .from(actions)
    .where(and(eq(actions.userId, ctx.userId), awaiting()))
    .groupBy(actions.executionId)
    .orderBy(sql`max(${actions.createdAt}) desc`)
    .limit(limit);
}
```

`count`, `min` et `sql` viennent de `drizzle-orm`, comme `count` dans le reste de `store.ts`.

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
          ? { count: pending, tone: 3 as const, dot: 'bg-[var(--f3)]', text: shellT('toValidate', { count: pending }) }
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

`Sidebar` (`sidebar.tsx:361`) : `<NavList reconnect={reconnect.length} pending={pending} />`. `MobileMenu` (`mobile-bar.tsx:78`) : idem, avec `onNavigate={go}`. Le point replié prend la couleur du drapeau bleu, `--f3` : la classe `c3` pose `--flag: var(--f3)` (`src/app/kit.css:26-30`, existe). Pas `bg-accent` : `--accent` est presque noir (`#0f0f0d`, `src/app/globals.css:118`).

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

La classe `tag c3` est celle que `Flag` pose pour le ton 3 (`src/components/verre/ui/marks.tsx:20-27`, existe : la classe est `tag c${tone}` ; `sidebar.test.ts:96` attend `tag c4` pour le ton 4).

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
// (chapitre 01, 14). src/server/agents/runs.test.ts (chapitre 07, 16.3) les tient égales au schéma : un test sous
// src/components ne peut pas importer le schéma (ui-imports.test.ts).
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

// Une proposition dont l'exécution a lu une source qui n'est plus visible du lecteur : ni paramètres, ni résumé.
// L'écran ne montre que son titre générique (agents.kinds) et un bouton « Refuser » (9.1, point 10 ; écart 19).
export type HiddenActionView = { id: string; kind: ActionKind; expiresAt: string | null };

export type PendingGroupView = {
  executionId: string | null;
  agentId: string | null;
  source: RunSourceView; // titre nul si la source n'est plus visible, ou si le groupe est illisible
  expiresAt: string | null; // la plus proche des expirations du groupe
  // Faux : une source lue par l'exécution n'est plus visible ; `actions` est vide, tout est dans `hidden`.
  readable: boolean;
  actions: ActionView[];
  hidden: HiddenActionView[];
};

export type PendingSummaryView = {
  total: number;
  groups: Array<Omit<PendingGroupView, 'actions' | 'hidden'> & { count: number }>;
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
// d'équipe (0078) : l'update ne touche aucune ligne, la fonction rend « interdit ». Elle laisse en revanche tout
// administrateur écrire l'activation d'équipe d'un autre : le code ne le permet qu'à son activateur, au nom de qui
// l'agent tourne (architecture 9.1, points 3 et 5). Un autre administrateur passe par takeOverTeamAgent (07k).
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
    // L'activation d'équipe d'un autre administrateur : ni son cran, ni ses réglages, ni son état.
    if (row.userId !== ctx.userId) return fail('interdit');
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
- **Seul l'activateur règle une activation** (`row.userId !== ctx.userId` : `interdit`). Pour une activation personnelle, la RLS le dit déjà (elle est invisible à un autre). Pour une activation d'équipe, la RLS laisse passer tout administrateur (`activateur_update`, chapitre 01) : sans cette ligne, un administrateur B changerait ce que l'administrateur A doit valider, ou remettrait « en service » une activation qu'A ne peut plus faire tourner (A n'est plus administrateur : `resolveRunIdentity` rend `null`, raison `role`). Le catalogue ne montre aucun bouton sur l'activation d'un autre (5.5).
- **`agents_budget_mois_usd` est un `numeric(8,2)`** lu en nombre (`customType`, chapitre 01, 14.4). L'écran borne la saisie entre 0 et 100 000 $ (section 8.2).
- **`CONNECTORS[provider]?.write`** : le champ `write` et `granted(config, verb)` sont du chapitre 05 (3.2, écart 1). Un connecteur sans `write` ne peut rien écrire : la fiche qui le demande reste « à brancher ».

### 4.3 `src/server/agents/runs.ts` : le journal

L'architecture (6) nomme ce fichier « lectures de `executions_agent` et `etapes_execution` » et `listRunActions` (5.1, étape 12). Aucun autre chapitre ne l'écrit. `TimedAction` (chapitre 05, 9) ne change pas : pour grouper « À valider » par exécution, `listPendingGroups` relit `execution_id` des actions que `listPendingActions` a rendues, dans sa propre transaction. La condition « à valider » reste écrite une fois, dans `store.ts`.

Ce fichier tient aussi la règle 9.1, point 10, pour les propositions : `readableRuns` dit quelles exécutions n'ont lu que des sources encore visibles du lecteur. Une proposition d'une exécution illisible arrive à l'écran sans paramètres (`hidden`), se refuse et ne se valide plus (`confirmBlock`, revérifié au clic par `decideActionAction` et `decideFromChannel`). C'est la décision de l'écart 19.

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
  countPendingByRun,
  countPendingIn,
  listPendingActions,
  type TimedAction,
  toView,
} from '@/server/actions/store';
import type { TenantContext } from '@/server/auth/tenant-context';
import { actions } from '@/server/db/schema/actions';
import { etapesExecution, executionsAgent } from '@/server/db/schema/agents';
import { sources } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { textArray } from '@/server/search/filters-sql';
import { readAgentSettings } from './activation';

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
  const { createdAt: _at, ...view } = timed;
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

async function headsOf(tx: Tx, ctx: TenantContext, ids: string[]): Promise<Map<string, Head>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
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
    .where(and(eq(executionsAgent.tenantId, ctx.tenantId), inArray(executionsAgent.id, ids)));
  return new Map(rows.map((row) => [row.id, row]));
}

// Parmi ces exécutions, celles dont toutes les sources lues (source_ids) sont encore visibles du lecteur, sous sa
// RLS (architecture 9.1, point 10). Une exécution absente (supprimée, ou d'un autre) n'est pas rendue : elle compte
// comme illisible. Le même test que readRun, pour plusieurs exécutions à la fois.
export async function readableRuns(tx: Tx, ctx: TenantContext, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await tx.execute<{ id: string }>(sql`
    select e.id from executions_agent e
     where e.tenant_id = ${ctx.tenantId} and e.id = any(${textArray(ids)}::uuid[])
       and not exists (
         select 1 from unnest(e.source_ids) as lue (id)
          where not exists (
            select 1 from sources s where s.tenant_id = e.tenant_id and s.id = lue.id))`);
  return new Set(rows.map((row) => row.id));
}

const HIDDEN_SOURCE: RunSourceView = { title: null, tool: null, at: null };

// « À valider », groupé par exécution : la plus récente proposition d'abord (listPendingActions trie ainsi), et
// dans un groupe, l'ordre des étapes. Une action dont l'exécution a disparu fait un groupe seule, illisible. Un groupe
// illisible ne porte ni paramètres ni titre de source : seulement l'identifiant, le type et l'expiration.
export async function listPendingGroups(
  ctx: TenantContext,
  options: { limit?: number } = {},
): Promise<PendingGroupView[]> {
  const pending = await listPendingActions(ctx, { limit: options.limit ?? 200 });
  if (pending.length === 0) return [];
  const read = await withTenant(ctx, async (tx) => {
    // TimedAction ne porte pas l'exécution : relue ici, sous la même RLS, pour les seules actions rendues.
    const links = await tx
      .select({ id: actions.id, executionId: actions.executionId })
      .from(actions)
      .where(
        and(
          eq(actions.tenantId, ctx.tenantId),
          inArray(
            actions.id,
            pending.map((action) => action.id),
          ),
        ),
      );
    const ids = [...new Set(links.flatMap((link) => (link.executionId ? [link.executionId] : [])))];
    return {
      runOf: new Map(links.map((link) => [link.id, link.executionId])),
      heads: await headsOf(tx, ctx, ids),
      readable: await readableRuns(tx, ctx, ids),
    };
  });
  const groups = new Map<string, PendingGroupView>();
  for (const action of [...pending].reverse()) {
    const executionId = read.runOf.get(action.id) ?? null;
    const head = executionId ? read.heads.get(executionId) : undefined;
    const key = head ? head.id : `seule:${action.id}`;
    // Sans exécution (une action d'agent en a toujours une) : rien à revérifier. Exécution disparue : illisible.
    const visible = executionId === null || read.readable.has(executionId);
    const { createdAt: _at, ...view } = action;
    const group = groups.get(key) ?? {
      executionId: head?.id ?? null,
      agentId: head?.agentId ?? null,
      source: head ? (visible ? sourceOf(head) : head.sourceId === null ? null : HIDDEN_SOURCE) : null,
      expiresAt: null,
      readable: visible,
      actions: [],
      hidden: [],
    };
    if (visible) group.actions.push(view);
    else group.hidden.push({ id: view.id, kind: view.kind, expiresAt: view.expiresAt });
    if (view.expiresAt && (!group.expiresAt || view.expiresAt < group.expiresAt)) {
      group.expiresAt = view.expiresAt;
    }
    groups.set(key, group);
  }
  return [...groups.values()].reverse();
}

// La section de l'Accueil : le total, et les `groups` premiers groupes, comptés en SQL (countPendingByRun) : un
// groupe n'est jamais coupé, et la somme des groupes montrés ne dépasse jamais le total. Aucune carte, aucun paramètre.
export async function readPendingSummary(
  ctx: TenantContext,
  options: { groups?: number } = {},
): Promise<PendingSummaryView> {
  return withTenant(ctx, async (tx) => {
    const total = await countPendingIn(tx, ctx);
    if (total === 0) return { total, groups: [] };
    const rows = await countPendingByRun(tx, ctx, options.groups ?? 3);
    const ids = rows.flatMap((row) => (row.executionId ? [row.executionId] : []));
    const heads = await headsOf(tx, ctx, ids);
    const readable = await readableRuns(tx, ctx, ids);
    return {
      total,
      groups: rows.map((row) => {
        const head = row.executionId ? heads.get(row.executionId) : undefined;
        const visible = row.executionId === null || readable.has(row.executionId);
        return {
          executionId: head?.id ?? null,
          agentId: head?.agentId ?? null,
          source: head ? (visible ? sourceOf(head) : head.sourceId === null ? null : HIDDEN_SOURCE) : null,
          expiresAt: iso(row.expiresAt),
          readable: visible,
          count: row.count,
        };
      }),
    };
  });
}

// Ce qui empêche de VALIDER une action d'agent, revérifié au clic (decideActionAction, 8.4 ; decideFromChannel,
// 15.4) : les agents coupés dans l'organisation (8.2), ou une source lue par son exécution qui n'est plus visible
// (9.1, point 10). Refuser n'est jamais empêché. Null : rien n'empêche ; une action de discussion, inconnue ou d'un
// autre rend null aussi, et decideAction en décide (chapitre 05, 11).
export type ConfirmBlock = 'coupe' | 'source';

export async function confirmBlock(ctx: TenantContext, actionId: string): Promise<ConfirmBlock | null> {
  if (!UuidSchema.safeParse(actionId).success) return null;
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ origine: actions.origine, executionId: actions.executionId })
      .from(actions)
      .where(and(eq(actions.tenantId, ctx.tenantId), eq(actions.id, actionId)));
    if (!row || row.origine !== 'agent') return null;
    if (!(await readAgentSettings(tx, ctx)).enabled) return 'coupe';
    if (row.executionId === null) return null;
    return (await readableRuns(tx, ctx, [row.executionId])).has(row.executionId) ? null : 'source';
  });
}
```

À savoir :

- **Deux lectures pour une exécution illisible.** `readRun` compte les sources visibles parmi `source_ids` avant toute lecture d'étape. `purger_executions` (chapitre 01) vide déjà `entree` et `sortie` dès qu'une source a disparu ; ce compte couvre l'autre cas : la source existe, mais n'est plus partagée au lecteur.
- **Une action en attente dont une source ne se voit plus** (tranché, écart 19) : elle reste dans « À valider », parce qu'elle est à la personne et qu'elle doit pouvoir la refuser. Mais ses paramètres ne quittent plus le serveur (`hidden` : identifiant, type, expiration), le titre de la source disparaît, et la valider est refusé au clic (`confirmBlock` rend `source`). Sans cela, un clic recopierait dans une note de CRM, lue par des collègues, un texte tiré d'une source que la personne ne voit plus.
- **`readableRuns` est la seule écriture du test** pour les propositions ; `readRun` garde son compte (une exécution, déjà lue). Les deux disent la même chose : toutes les `source_ids` encore visibles, sous la RLS du lecteur.
- **`proposed`** compte toutes les lignes écrites par l'exécution, refusées ou expirées comprises : c'est ce que l'agent a proposé, pas ce qui attend.
- **`listPendingGroups` retourne la liste deux fois** pour garder l'ordre « plus récente d'abord » des groupes tout en rangeant les cartes dans l'ordre des étapes.
- **`readPendingSummary` compte en SQL** (`countPendingByRun`) : avec plus de 200 propositions, la liste de `listPendingActions` serait tronquée, et un groupe coupé en deux. Le total et les comptes des groupes viennent de la même transaction.

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
Agents dans l'espace             [■ allumés]   Couper arrête toute nouvelle exécution et gèle
                                               les propositions : elles se refusent, elles ne se
                                               valident plus tant que les agents sont coupés.
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
| `a-valider.tsx` | `PendingBoard`, `HiddenActionCard`, `HomePending` | Section 6 et section 7 | `Section`, `ActionCard`, `EmptyState`, `Notice`, `Button`, `ToolLogo` |
| `canaux.tsx` | `ChannelsView` (le composant ; ses données ont le type `ChannelsViewData`, section 12.3) | Après le jalon 1 (section 12) | `Switch`, `Select`, `Button`, `Notice` |
| `model.ts` | `AGENT_VIEWS`, `parseAgentsParams`, `agentsHref`, `RunTone`, `runTone`, `formatUsd`, `budgetShare`, `durationOf`, `groupCards` | Le pur : lecture de l'adresse, tons, montants, groupes | |
| `model.test.ts` | | Les tests du pur et des textes (16.2). N'importe ni `@/server/db` ni `drizzle-orm` : `ui-imports.test.ts` balaie aussi les tests de `src/components` | |

### 5.3 `src/components/verre/agents/model.ts` (code complet)

```ts
// src/components/verre/agents/model.ts
import type { Tone } from '@/components/verre';
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

// Le ton d'un état (Badge) : vert fait, rouge échoué, ambre ce qui attend, gris le reste. Un sous-ensemble des tons
// du kit (badge.tsx:4) : un nom qui n'y est pas ne compile pas, et Badge lèverait au rendu (TONES[tone].cls).
export type RunTone = Extract<Tone, 'success' | 'destructive' | 'warning' | 'neutral'>;
export const runTone = (status: RunStatus): RunTone =>
  status === 'faite'
    ? 'success'
    : status === 'echouee'
      ? 'destructive'
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
// Toujours : <RunJournal run={run} enabled={enabled} /> si params.executionId ; fermer = router.replace(agentsHref({ … sans execution })).
// Props : { view, params, cards, pending, admin, enabled, modelAvailable, runs, run, month, budget }.

// src/components/verre/agents/catalogue.tsx
'use client';
// AgentCatalog : groupCards(cards) ; une <Section> par groupe non vide (title t('groups.mine'|'ready'|'missing'),
// count = longueur). « Pour l'équipe » (t('groups.team')) seulement si une fiche d'équipe existe (après le jalon 1).
// Pas sous `catalog` : agents.catalog.<id> est aux fiches (chapitre 08, 3.5), et `mine` est un identifiant valable.
// AgentCard : <article> ; titre t(`catalog.${id}.name` as 'catalog.suivi_echange.name') (la clé de la fiche du
// jalon 1 existe dès la PR 07b, section 10.1 : le cast et translation-keys.test.ts ont une feuille réelle) ;
// à droite, l'état : t('card.active'|'card.paused') et
// t(`autonomy.${activation.autonomy}`) ; description t(`catalog.${id}.description`) ; ligne « Écrit : » =
// writes.map(w => t(`kinds.${actionProvider(w.kind)}.${actionVerb(w.kind)}`)).join(' · ') ; ligne du mois
// t('card.month', { runs, usd: formatUsd(usd, locale) }) quand runs > 0 ; si !availability.ready :
// t('card.missingFamilies', { families }) (FAMILY_LABELS ou FAMILY_LABELS_EN selon la langue, src/lib/providers.ts:15,
// :25) et/ou t('card.missingWrites', { tools }) (PROVIDER_LABELS des types de missingWrites résolus) + bouton lien
// « Brancher un outil » vers /connections. Boutons : « Activer » ou « Régler » (ouvrent ActivationPanel) ; « Couper »
// et « Remettre en service » appellent updateActivationAction({ activationId, active }). Les boutons ne s'affichent
// que si activation est nulle ou activation.mine : une activation d'équipe faite par un autre (membre ordinaire, ou
// autre administrateur) n'a aucun bouton, seulement la ligne t('card.teamReadOnly') ; setActivation le refuse aussi
// (section 4.2). Reprendre l'agent d'un administrateur parti : takeOverTeamAgentAction (07k).
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
// Actions : run.actions.map(a => <ActionCard action={a} canConfirm={enabled} />) (section 9) : agents coupés, la
// carte n'offre que « Refuser ». RunJournal reçoit `enabled` d'AgentsScreen.

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
import { agentsEnabled } from '@/server/agents/activation';
import { listPendingGroups } from '@/server/agents/runs';
import { requireUserContext } from '@/server/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('agents'))('pending.title') };
}

// /agents/a-valider : les propositions de ses agents qui attendent son clic, groupées par exécution. La cible des liens
// du récapitulatif et de Slack : la page ne fait rien d'elle-même, chaque écriture part d'un clic sur une carte.
export default async function PendingPage() {
  const ctx = await requireUserContext();
  const [groups, enabled] = await Promise.all([listPendingGroups(ctx), agentsEnabled(ctx)]);
  return <PendingBoard groups={groups} enabled={enabled} />;
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
// PendingBoard({ groups, enabled }) : PageHeader title=t('pending.title') ; à droite, t('pending.count', { count: total }).
// !enabled : <Notice tone="warning"> t('cut') au-dessus des groupes (les cartes n'offrent alors que « Refuser »).
// Pour chaque groupe : <section id={`execution-${executionId}`} aria-labelledby=…> ; en-tête :
//   nom de l'agent t(`catalog.${agentId}.name` as 'catalog.suivi_echange.name') (agentId nul ou absent de
//   messages.agents.catalog : t('pending.unknownAgent')) ;
//   source : <ToolLogo kind={tool} size={16}/> « title » · formatDateTime(at) ; title nul : t('pending.sourceHidden') ;
//   à droite : t('pending.expires', { date: formatDate(expiresAt) }) et le lien t('pending.journal') vers
//   agentsHref({ vue: 'executions', execution: executionId }).
//   readable : group.actions.map(action => <ActionCard key={action.id} action={action} canConfirm={enabled} />).
//   !readable : <Notice> t('pending.hiddenLead') puis group.hidden.map(h => <HiddenActionCard key={h.id} action={h} />).
// HiddenActionCard({ action }) : <ToolLogo kind={actionProvider(kind)}/> et le titre générique
//   t(`kinds.${actionProvider(kind)}.${actionVerb(kind)}` as 'kinds.hubspot.creer_note') (agents.kinds : aucun
//   paramètre, il n'y en a pas dans la vue) ; un seul bouton t('pending.refuse') → refusePendingActionAction(id)
//   (section 8.1) ; { ok: true } → t('pending.refused') en rôle status ; { ok: false } → t('errors.erreur').
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

Deux fichiers. `src/app/(app)/agents/actions.ts` (à créer, PR 07b) porte les gestes du poste de contrôle : activer, régler, couper, et les réglages de l'organisation. `src/app/(app)/discussions/actions.ts` (existe) garde le seul geste qui écrit dans un outil, `decideActionAction`, que la carte d'action appelle partout (discussion, journal, « À valider ») ; il gagne la revalidation de la pastille et, après le jalon 1, `undoActionAction`.

Forme reprise des fichiers voisins (`team/actions.ts:23-48`, `discussions/actions.ts:158-174`, existent) : `requireUserContext()` d'abord ; zod sur tout ce que le navigateur envoie ; un résultat en code fixe, que l'écran traduit ; `logError('module.fait', error, ids)` sur une panne, jamais le message rendu ; `revalidatePath` seulement quand quelque chose a changé.

### 8.1 `src/app/(app)/agents/actions.ts` (code complet, jalon 1)

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AUTONOMY_LEVELS } from '@/lib/agents';
import {
  type ActivationError,
  activateAgent,
  setActivation,
  setOrgAgentSettings,
} from '@/server/agents/activation';
import { requireUserContext } from '@/server/auth/session';
import { logError } from '@/server/log';

// Les gestes du poste de contrôle (dossier agents, chapitre 07) : activer une fiche, la régler, la couper ; pour un
// propriétaire ou un administrateur, les réglages d'agents de l'organisation. Ce sont des points d'entrée publics :
// rien de ce que le navigateur envoie n'est cru, et une panne ne sort qu'en code fixe (agents.errors.<code>).
// Aucune de ces actions n'écrit dans un outil : valider une proposition passe par decideActionAction
// (discussions/actions.ts), le même geste que dans une discussion.

export type AgentActionResult = { ok: true } | { ok: false; error: ActivationError | 'erreur' };

// Le Name des fiches (architecture 8.5).
const AgentIdSchema = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/);
// Les réglages d'une fiche : un objet à plat et petit. Leur sens est relu contre la fiche par checkSettings
// (activation.ts) : ici, seulement la forme et la taille.
const SettingsSchema = z
  .record(z.string().max(40), z.unknown())
  .refine((value) => Object.keys(value).length <= 30 && JSON.stringify(value).length <= 8_000);

const ActivateSchema = z.object({ agentId: AgentIdSchema, settings: SettingsSchema.default({}) });
const UpdateSchema = z
  .object({
    activationId: z.uuid(),
    autonomy: z.enum(AUTONOMY_LEVELS).optional(),
    settings: SettingsSchema.optional(),
    active: z.boolean().optional(),
  })
  // Une demande qui ne change rien est un réglage refusé (le chemin nomme un champ de réglage).
  .refine(
    (input) =>
      input.autonomy !== undefined || input.settings !== undefined || input.active !== undefined,
    { path: ['autonomy'] },
  );

const failed = (error: ActivationError | 'erreur'): AgentActionResult => ({ ok: false, error });

// Le champ fautif dit le code : un identifiant faux (ou une entrée qui n'est pas un objet) est « introuvable », le
// reste est un réglage refusé.
const inputError = (error: z.ZodError, idField: string): ActivationError => {
  const field = error.issues[0]?.path[0];
  return field === undefined || field === idField ? 'introuvable' : 'reglage';
};

// Activer une fiche du catalogue (ou la remettre en service). Le cran est celui de la fiche, borné (activation.ts).
export async function activateAgentAction(input: unknown): Promise<AgentActionResult> {
  const ctx = await requireUserContext();
  const parsed = ActivateSchema.safeParse(input);
  if (!parsed.success) return failed(inputError(parsed.error, 'agentId'));
  try {
    const result = await activateAgent(ctx, parsed.data);
    if (!result.ok) return failed(result.error);
    revalidatePath('/agents');
    return { ok: true };
  } catch (error) {
    logError('agents.activation', error, { agentId: parsed.data.agentId });
    return failed('erreur');
  }
}

// Régler une activation : son cran, ses réglages, en service ou coupée. Couper n'annule rien de ce qui attend :
// les propositions déjà faites restent dans « À valider » jusqu'à leur expiration.
export async function updateActivationAction(input: unknown): Promise<AgentActionResult> {
  const ctx = await requireUserContext();
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return failed(inputError(parsed.error, 'activationId'));
  try {
    const result = await setActivation(ctx, parsed.data);
    if (!result.ok) return failed(result.error);
    revalidatePath('/agents');
    return { ok: true };
  } catch (error) {
    logError('agents.reglage', error, { activationId: parsed.data.activationId });
    return failed('erreur');
  }
}

// Refuser une proposition dont la source n'est plus visible (« À valider », groupe illisible, section 6.3). Le même
// decideAction que la carte, mais rien de la ligne ne revient au navigateur : ni paramètres, ni résultat. Refuser
// n'écrit rien dans un outil.
export async function refusePendingActionAction(actionId: unknown): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const id = z.uuid().safeParse(actionId);
  if (!id.success) return { ok: false };
  try {
    const view = await decideAction(ctx, id.data, 'annuler');
    const ok = view?.status === 'annulee';
    if (ok) revalidatePath('/', 'layout'); // la pastille se recompte
    return { ok };
  } catch (error) {
    logError('agents.refus', error, { actionId: id.data });
    return { ok: false };
  }
}
```

`decideAction` vient de `@/server/actions/decide` (chapitre 05, 11) : l'import rejoint ceux de la tête du fichier.

### 8.2 `setOrgAgentSettingsAction` (même fichier, jalon 1)

Un propriétaire ou un administrateur seulement : `setOrgAgentSettings` vérifie `canInvite`, la RLS de `reglages_organisation` le redit (`admin_insert`, `admin_update` de 0057). Le plafond du mois est un `numeric(8,2)` : l'écran le borne entre 0 et 100 000 $, arrondi au cent. Vide : le défaut par siège.

```ts
const OrgSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  maxAutonomy: z.enum(AUTONOMY_LEVELS).optional(),
  // Nul : revenir au défaut par siège (AGENTS_BUDGET_USD_PER_SEAT). Arrondi au cent, comme la colonne.
  monthBudgetUsd: z
    .number()
    .min(0)
    .max(100_000)
    .transform((usd) => Math.round(usd * 100) / 100)
    .nullable()
    .optional(),
});

// Les réglages d'agents de l'organisation. Couper (enabled: false) arrête toute nouvelle exécution au prochain
// routage, et gèle les propositions déjà faites : elles se refusent, elles ne se valident plus (confirmBlock, 4.3),
// ni dans Leon ni dans Slack, et aucun message Slack ne part (notifyAction, 15.2). Rallumer les rend valables
// jusqu'à leur expiration. Couper sert en cas d'incident (un agent qui se trompe, une injection) : rien de ce qu'il
// a proposé ne doit partir d'un clic distrait pendant qu'on regarde.
export async function setOrgAgentSettingsAction(input: unknown): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const parsed = OrgSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    const ok = await setOrgAgentSettings(ctx, parsed.data);
    if (ok) revalidatePath('/agents');
    return { ok };
  } catch (error) {
    logError('agents.reglages_organisation', error);
    return { ok: false };
  }
}
```

### 8.3 Après le jalon 1 : les gestes ajoutés au même fichier

| Action | Appelle | Rend | PR | Déclencheur |
|---|---|---|---|---|
| `readRaiseSuggestionAction(activationId)` | `readRaiseSuggestion(ctx, activationId)` (ajout à `activation.ts`, esquisse ci-dessous) | `RaiseSuggestion \| null` (chapitre 06, 3.2) | 07i | le premier cran au-dessus de `propose` |
| `takeOverTeamAgentAction(activationId)` | `takeOverTeamAgent` (chapitre 06, 8.2) | `{ ok: boolean }` ; revalide `/agents` | 07k | les agents d'équipe |
| `startManualRunAction(input)` | `startManualRun` (chapitre 09, 8.2) | écrit par le chapitre 09, dans ce fichier | 09c | les déclencheurs `manuel` |
| `saveChannelPreferencesAction`, `linkSlackAction`, `unlinkSlackAction`, `uninstallSlackAction` | `channels/preferences.ts`, `slack/link.ts`, `slack/install.ts` | section 12.4 | 07e, 07g | 0084 |

```ts
// src/server/agents/activation.ts (ajout, PR 07i). Ce que la ligne du panneau d'activation montre : null tant que
// rien n'est proposé (cran au plafond, trop peu de décisions, AUTONOMY_CEILING à « propose »).
export async function readRaiseSuggestion(
  ctx: TenantContext,
  activationId: string,
  deps: Deps = {},
): Promise<RaiseSuggestion | null> {
  // 1. La ligne d'agents_actives (sous RLS : la sienne, ou celle de l'équipe) ; null si absente ou si sa fiche
  //    n'est plus au catalogue.
  // 2. raiseSuggestion({ scope: row.portee, current: row.autonomie,
  //      ceiling: lowestAutonomy(definition.autonomy.max, org.maxAutonomy, AUTONOMY_CEILING),
  //      rows: await readRaiseRows(ctx, row.id) })   // chapitre 06, 3.2 et 3.4
}

// src/app/(app)/agents/actions.ts (ajout, PR 07i)
export async function readRaiseSuggestionAction(activationId: unknown) {
  const ctx = await requireUserContext();
  const id = z.uuid().safeParse(activationId);
  if (!id.success) return null;
  try {
    return await readRaiseSuggestion(ctx, id.data);
  } catch (error) {
    logError('agents.proposition_cran', error, { activationId: id.data });
    return null;
  }
}
```

Le bouton « Passer à ce cran » appelle `updateActivationAction({ activationId, autonomy: suggestion.to })`, qui revérifie le plafond (`setActivation`, section 4.2). Monter le cran reste un geste de la personne (architecture 9.7).

### 8.4 `src/app/(app)/discussions/actions.ts` (existe) : `decideActionAction` et `undoActionAction`

Jalon 1 (PR 07c) pour `decideActionAction` ; `undoActionAction` après (PR 07i). Ce qui change :

```ts
// :21, l'import suit le déplacement du chapitre 05.
import { decideAction, undoAction } from '@/server/actions/decide';
import type { TimedAction } from '@/server/actions/store';
import { confirmBlock } from '@/server/agents/runs';

// Ce que la page reçoit d'une action : la vue, sans la date d'écriture (lue par le serveur seul).
const clientView = ({ createdAt: _at, ...view }: TimedAction): ActionView => view;

// Confirmer ou annuler une action que Leon a proposée, dans une discussion ou par un agent. Seule une action de
// l'utilisateur, encore proposée et pas expirée, change ; la confirmation l'exécute avec sa propre connexion. Null
// pour une action inconnue ou d'un autre, ou une panne.
// Confirmer une action d'agent est refusé (null, rien d'écrit) quand les agents sont coupés ou qu'une source lue
// par son exécution n'est plus visible (confirmBlock, section 4.3) : l'écran n'offre alors pas le bouton, ceci en
// est la garde. Annuler n'est jamais refusé.
// Une action d'agent revalide la mise en page : la pastille d'« Agents » (readSidebar) se recompte. Next re-rend
// alors la route courante ; « À valider » garde ses cartes (PendingBoard fige sa liste au montage, section 6.3).
// Une action de discussion ne revalide rien, comme aujourd'hui (voir saveAboutSuggestionAction).
export async function decideActionAction(
  actionId: string,
  decision: 'confirmer' | 'annuler',
): Promise<ActionView | null> {
  const ctx = await requireUserContext();
  if (typeof actionId !== 'string' || (decision !== 'confirmer' && decision !== 'annuler'))
    return null;
  try {
    if (decision === 'confirmer' && (await confirmBlock(ctx, actionId)) !== null) return null;
    const action = await decideAction(ctx, actionId, decision);
    if (!action) return null;
    if (action.origin === 'agent') revalidatePath('/', 'layout');
    return clientView(action);
  } catch (error) {
    logError('action.decision', error);
    return null;
  }
}

// Après le jalon 1 (PR 07i). Défaire une action faite : le bouton « Annuler » d'une carte (architecture 9.6,
// point 4). undoAction réserve la ligne, appelle spec.undo, puis passe la ligne à « defaite » ; un échec la laisse
// « faite », avec undoError. Null pour une action inconnue ou d'un autre, ou une panne.
export async function undoActionAction(actionId: string): Promise<ActionView | null> {
  const ctx = await requireUserContext();
  if (typeof actionId !== 'string') return null;
  try {
    const action = await undoAction(ctx, actionId);
    return action ? clientView(action) : null;
  } catch (error) {
    logError('action.annulation', error);
    return null;
  }
}
```

À savoir :

- **`clientView` est la ligne d'aujourd'hui** (`:168`, `const { createdAt: _at, ...view } = action`) sortie en fonction : `TimedAction` ne gagne rien (section 4.3), rien de plus ne part au navigateur.
- **`confirmBlock` coûte une transaction courte de plus par confirmation** (la ligne d'action, les réglages de l'organisation, `readableRuns`). Une action de discussion rend `null` dès la première lecture.
- **Un fichier `'use server'` n'exporte que des fonctions asynchrones** : `clientView` reste non exportée.
- **`decideAction` revérifie tout** (propriétaire par la RLS, expiration, simulation, rôle pour un agent d'équipe, chapitre 05, 11). La server action ne vérifie que la forme.
- **`undoAction` n'est pas exposée au jalon 1** : aucun bouton ne l'appelle (section 9). La PR 07i l'ouvre avec le premier cran au-dessus de `propose` (architecture 14.3), parce qu'avant, rien ne part sans clic et la personne défait elle-même dans l'outil.

## 9. La carte d'action

`src/components/discussion/action-card.tsx` (existe, 176 lignes). Une seule carte pour la discussion, le journal et « À valider ». Le chapitre 05 (15) fixe ses clés de texte et le passage à `kinds.<outil>.<verbe>` ; ce chapitre fixe le reste de l'écran : le logo de l'outil, ce que la personne lit avant de cliquer, le lien vers l'objet, et, après le jalon 1, « Annuler ».

### 9.1 Ce que la carte montre, dans l'ordre

| Ligne | Quand | Source |
|---|---|---|
| Logo de l'outil + la phrase `kinds.<outil>.<verbe>` | toujours | `ToolLogo` (kit, existe), `actionProvider`, `actionVerb` |
| Les détails (`details.<clé>`), puis les blocs (`body`, `notes`, `text`, `description`), puis le diff | si présents | `DETAILS` et `BLOCKS` du chapitre 05 (15.2) |
| Provenance : `byAgent` · `audience.<public>` · `risk.<enjeu>` · `irreversible` | action `proposee` ; `byAgent` seulement si `origin === 'agent'` ; `irreversible` seulement si `!reversible` | `ActionView` |
| Avertissements (`rerunWarning`, `sendWarning`…) | action `proposee` | `actionWarnings` |
| Boutons : `confirm.<outil>.<verbe>` et `cancel` | action `proposee` ; le premier seulement si `canConfirm` (sinon la ligne `agents.pending.confirmBlocked`) | `decideActionAction` |
| Bouton `undo` | après le jalon 1 : action `faite` et `undoable` | `undoActionAction` |
| État (`waiting`, `running`, `done`, `errors.<code>`, `cancelled`, `expired`, `undone`) + lien `open` (GitHub) ou `openIn` | toujours ; le lien si `faite` et `result.url` | `PROVIDER_LABELS` (`src/lib/providers.ts:34`, existe) |
| `undoFailed` | après le jalon 1 : `undoError` posé | `ActionView.undoError` |

Le public et l'enjeu se lisent **avant** le clic (architecture 9.6, point 5) : c'est ce qui dit à Claire qu'une note part « Lu par vos collègues ». « S'annule » n'est jamais écrit au jalon 1 : aucun bouton ne défait encore. Seul le contraire est dit (`irreversible`). Les maquettes 5.1 et 6.1 montrent « S'annule » : ce mot n'apparaît qu'avec la PR 07i.

### 9.2 La réversibilité avant le clic : un champ de la vue

Le chapitre 05 (15.4) laisse le choix : une table dans le navigateur (`ACTION_UNDOABLE_KINDS`) ou un champ posé par le serveur. **Choix : le champ.** `ActionView` gagne `reversible: boolean` ; `toView` le pose depuis la spec (`reversible(row.kind)`, déjà appelée par `toView` pour `undoable`) ; `parseActionView` le lit avec le défaut le plus prudent (`reversible === true`, sinon faux, donc « Ne s'annule pas »). Une table recopiée dans le navigateur aurait une seconde source pour une donnée que le registre tient déjà.

Le chapitre 05 tel qu'écrit n'a pas ce champ (son `ActionView`, 3.4, et son `toView`, 9). **La PR 07a porte la retouche** (quatre lignes, ci-dessous), dans les deux fichiers du chapitre 05 qu'elle touche déjà pour `countPendingIn` et `countPendingByRun`. Si le chapitre 05 l'a reprise d'ici là, 07a n'a rien à faire. Écart 1.

```ts
// src/lib/actions.ts (chapitre 05, 3.4), ActionView : un champ de plus, après `undoable`.
  // Le type se défait (annulable ou compensable) : la carte le dit avant le clic. Faux par défaut : « Ne s'annule pas ».
  reversible: boolean;
// parseActionView : la déstructuration de tête gagne `reversible`, et le retour, comme undoable :
    reversible: reversible === true,
// src/server/actions/store.ts (chapitre 05, 9), toView : l'objet passé à parseActionView gagne, après undoable :
    reversible: reversible(row.kind),
```

`src/lib/actions.test.ts` (existe, étendu par le chapitre 05) gagne deux cas : `reversible` absent ou non booléen se lit `false` ; `true` se lit `true`.

### 9.3 Le fichier après changement (code complet)

```tsx
'use client';

import { ExternalLink, RotateCcw, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { decideActionAction, undoActionAction } from '@/app/(app)/discussions/actions';
import type { ProviderId } from '@/capture/turn';
import { Button, ToolLogo } from '@/components/verre';
import { type ActionView, actionProvider, actionVerb, actionWarnings } from '@/lib/actions';
import { PROVIDER_LABELS } from '@/lib/providers';

// Une action que Leon a proposée, dans une discussion ou par un agent : ce qu'elle fera exactement (l'outil, la
// cible, les valeurs, le texte), qui la lira et ce qu'elle engage, puis les deux boutons. Rien n'est fait avant le
// clic ; la confirmation l'exécute avec le compte de la personne, puis la carte montre le résultat. Une action déjà
// décidée (autre onglet, page rechargée, clic dans Slack) s'affiche telle qu'elle est.

type Decision = 'confirmer' | 'annuler' | 'defaire';

// Les paramètres que la carte montre en ligne, dans cet ordre : les 16 d'aujourd'hui (:18-35), puis ceux des outils
// nouveaux, dans l'ordre du chapitre 05 (15.2). `body`, `notes`, `text`, `description` ont leur bloc ; `diff` aussi.
const DETAILS = [
  'asked',
  'title',
  'current',
  'name',
  'state',
  'method',
  'event',
  'reviewers',
  'labels',
  'assignees',
  'message',
  'head',
  'base',
  'draft',
  'failed',
  'lines',
  // … les clés de details du chapitre 05 (15.2), de « subject » à « completed », sans notes ni description.
] as const;
const BLOCKS = ['body', 'notes', 'text', 'description'] as const;
const TRANSLATED = ['state', 'method', 'event', 'draft', 'failed'];
const LISTS = ['reviewers', 'labels', 'assignees']; // séparées par « , » dans les paramètres
const DIFF_TONE = { '+': 'text-success', '-': 'text-destructive' } as const;

// `canConfirm` : faux quand les agents sont coupés dans l'organisation (« À valider » et le journal le passent,
// section 6.3) ; la carte n'offre alors que « Refuser ». Le serveur le revérifie (confirmBlock, section 8.4).
export function ActionCard({ action, canConfirm = true }: { action: ActionView; canConfirm?: boolean }) {
  const t = useTranslations('discussionView.action');
  const agentsT = useTranslations('agents');
  const [view, setView] = useState(action);
  const [pending, setPending] = useState<Decision | null>(null);
  const [lost, setLost] = useState(false);
  const { kind, params } = view;
  const provider = actionProvider(kind);
  const verb = actionVerb(kind);
  const tool = PROVIDER_LABELS[provider as ProviderId] ?? provider;

  async function decide(decision: Decision) {
    setPending(decision);
    setLost(false);
    const next = await (decision === 'defaire'
      ? undoActionAction(view.id)
      : decideActionAction(view.id, decision)
    ).catch(() => null);
    setPending(null);
    if (next) setView(next);
    else setLost(true);
  }

  const status =
    view.status === 'proposee'
      ? t('waiting')
      : view.status === 'en-cours'
        ? t('running')
        : view.status === 'faite'
          ? t('done')
          : view.status === 'echouee'
            ? t(`errors.${view.result.error ?? 'echec'}`)
            : view.status === 'annulee'
              ? t('cancelled')
              : view.status === 'defaite'
                ? t('undone')
                : t('expired');
  // Un commit se lit en 7 caractères ; une liste vide se dit.
  const shown = { ...params, sha: params.sha?.slice(0, 7) ?? '' };
  const details = DETAILS.filter((key) => key in params).map((key) => {
    const value = params[key] ?? '';
    let text = value;
    if (TRANSLATED.includes(key)) text = t(`values.${value}` as 'values.open');
    else if (LISTS.includes(key))
      text = value === '' ? t('values.none') : value.split(',').join(', ');
    return [key, text] as const;
  });
  const blocks = BLOCKS.filter((key) => key in params);
  const warnings = actionWarnings(kind, params);
  // Les lignes d'un diff n'ont pas d'identité : leur rang tient lieu de clé.
  const diffLines = (params.diff ?? '').split('\n').map((line, key) => ({ key, line }));
  const proposed = view.status === 'proposee';

  return (
    <section
      aria-label={t('label')}
      className="mt-3 rounded-field bg-glass-3 px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)]"
    >
      <p className="flex gap-2.5 text-ui text-fg">
        <ToolLogo kind={provider} size={16} className="mt-[2px] shrink-0" />
        {/* next-intl type ses clés : une clé bâtie sur une chaîne quelconque ne se type pas, d'où le cast vers une clé
            réelle. Deux segments en gabarit, pas un : translation-keys.test.ts lit chaque ${…} comme un segment sans
            point. registry.test.ts (chapitre 05) vérifie qu'aucun type n'a pas sa phrase. */}
        <span className="break-words">
          {t(`kinds.${provider}.${verb}` as 'kinds.hubspot.creer_note', shown)}
        </span>
      </p>
      {proposed && (
        // Avant le clic : qui la lira, ce qu'elle engage, et si elle se défait (architecture 9.6, point 5).
        <p className="mt-1.5 text-label text-muted">
          {[
            view.origin === 'agent' ? t('byAgent') : null,
            t(`audience.${view.audience}`),
            t(`risk.${view.risk}`),
            view.reversible ? null : t('irreversible'),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {details.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-label">
          {details.map(([key, text]) => (
            <div key={key} className="contents">
              <dt className="text-muted">{t(`details.${key}` as 'details.title')}</dt>
              <dd className="break-words text-fg-2">{text}</dd>
            </div>
          ))}
        </dl>
      )}
      {blocks.map((key) => (
        <blockquote
          key={key}
          className="mt-2 max-h-48 overflow-auto border-l-2 border-line-strong pl-3 text-label whitespace-pre-wrap text-fg-2"
        >
          {params[key] || <span className="text-muted">{t('emptyBody')}</span>}
        </blockquote>
      ))}
      {kind === 'github.ecrire_fichier' && params.diff === '' && (
        <p className="mt-2 text-label text-muted">{t('newlineOnly')}</p>
      )}
      {params.diff && (
        <>
          <p className="mt-2 text-label text-muted">{t('details.diff')}</p>
          <pre className="mt-1 max-h-72 overflow-auto rounded-field bg-selected px-3 py-2 font-mono text-[12px] leading-5 text-fg-2">
            {diffLines.map(({ key, line }) => (
              <span
                key={key}
                className={`block whitespace-pre ${DIFF_TONE[line[0] as '+' | '-'] ?? ''}`}
              >
                {line}
              </span>
            ))}
          </pre>
        </>
      )}
      {proposed &&
        warnings.map((warning) => (
          <p key={warning} className="mt-2 flex gap-2 text-label text-warning">
            <TriangleAlert aria-hidden="true" className="mt-[1px] size-3.5 shrink-0" />
            {t(warning)}
          </p>
        ))}
      {proposed && !canConfirm && (
        <p className="mt-2 text-label text-muted">{agentsT('pending.confirmBlocked')}</p>
      )}
      {proposed && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canConfirm && (
            <Button
              size="sm"
              variant="primary"
              loading={pending === 'confirmer'}
              disabled={pending === 'annuler'}
              onClick={() => decide('confirmer')}
            >
              {t(`confirm.${provider}.${verb}` as 'confirm.hubspot.creer_note')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            loading={pending === 'annuler'}
            disabled={pending === 'confirmer'}
            onClick={() => decide('annuler')}
          >
            {t('cancel')}
          </Button>
        </div>
      )}
      {view.status === 'faite' && view.undoable && (
        // Après le jalon 1 (PR 07i) : undoable n'est vrai que si la spec sait défaire et que l'écriture l'a préparé.
        <div className="mt-3">
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            loading={pending === 'defaire'}
            onClick={() => decide('defaire')}
          >
            {pending === 'defaire' ? t('undoing') : t('undo')}
          </Button>
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-2 text-ui text-fg-2">
        {lost ? t('lost') : status}
        {view.status === 'faite' && view.result.url && (
          <>
            {' '}
            <a
              href={view.result.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline"
            >
              {provider === 'github' ? t('open') : t('openIn', { tool })}
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </>
        )}
      </p>
      {view.undoError && (
        <p className="mt-1 text-label text-warning">
          {t('undoFailed', { error: t(`errors.${view.undoError}`) })}
        </p>
      )}
    </section>
  );
}
```

À savoir :

- **`canConfirm`** vaut vrai par défaut : la discussion ne le passe pas, et une action de discussion n'est jamais gelée (`confirmBlock` rend `null` pour elle). Le texte `agents.pending.confirmBlocked` est lu par un second `useTranslations('agents')`.
- **Le bouton principal perd son icône `GitBranch`** (`:139` aujourd'hui) : le logo de l'outil est en tête de carte. Aucun test ne la cherche : `action-card.tsx` n'a pas de fichier de test, et seul `discussion-thread.tsx` l'importe aujourd'hui (recherche faite).
- **`t('undone')`** : posé par la PR de 0080 (chapitre 05, 15.1). Au jalon 1, aucune ligne n'est `defaite`.
- **`ToolLogo kind={provider}`** accepte une chaîne quelconque (`chips.tsx:98`, existe) ; un outil sans logo prend le logo générique du kit (à vérifier dans `chips.tsx` au moment de la PR).
- **Erreur `incertain`** (architecture 9.6, point 8) : la carte dit `errors.incertain` (clé existante, dont le texte nomme encore GitHub : le chapitre 05 la généralise) et montre le lien quand `result.url` existe.
- **`diffLines`** : la paire `{ key, line }` est construite comme aujourd'hui (`:83`).

## 10. Les clés de traduction

Fichiers : `messages/fr.json` et `messages/en.json` (existent). Mêmes clés dans les deux (`messages.test.ts`, existe) ; chaque clé lue par le code existe (`src/test/contracts/translation-keys.test.ts`, existe : il lit `t('…')`, `t.rich`, les clés en gabarit et `createTranslator({ namespace })`). Les types de `next-intl` viennent de `fr.json` (`src/i18n/request.ts:12-17`) : une clé absente fait échouer `pnpm typecheck`.

Voix (`PRODUCT.md:56-58`) : vouvoiement, phrases courtes, ni point d'exclamation ni émoji, pas le mot « IA » comme argument, rien que le code ne tient pas.

### 10.1 Qui écrit quoi, et quand

| Bloc | Écrit par | PR |
|---|---|---|
| `navigation.agents` | ce chapitre | 07b (avec `nav.ts`) |
| `shell.toValidate` | ce chapitre | 07c (avec la pastille) |
| `agents.*` sauf `catalog`, `manuel`, `channels`, `recap`, `slack`, `depart` | ce chapitre | 07b ; `pending` en 07c |
| `agents.kinds.<outil>` | ce chapitre (écart 20) : des titres génériques, sans aucun `{…}` ; chaque bloc d'outil entre avec la PR d'outil du chapitre 05 qui ajoute ses types à `ACTION_KINDS` | 07b pour `github`, `hubspot`, `outlook` ; puis une par outil |
| `agents.catalog.suivi_echange` | texte du chapitre 08 (3.5), recopié tel quel ; posé par ce chapitre, parce que l'écran (PR 8 de l'architecture) entre avant la fiche (PR 9) : sans une feuille `agents.catalog.<id>.name`, `translation-keys.test.ts` et `pnpm typecheck` refusent `catalog.${id}.name` (écart 21) | 07b |
| `agents.catalog.<id>`, les autres fiches | chapitres 08 (3.5) et 09 | une par fiche |
| `agents.manuel.*`, `agents.runs.reason.boucle` | chapitre 09 (8.3, 09a) | 09a, 09c |
| `agents.channels.*` | ce chapitre | 07e, 07g |
| `agents.recap.*` | ce chapitre | 07f |
| `agents.slack.*` | ce chapitre | 07h |
| `agents.depart.passation_en_attente` | ce chapitre, à la demande du chapitre 09 (écart 17) | 09c |
| `discussionView.action.*` | chapitre 05 (15) | 07c pour la structure |

Les clés en gabarit bâties sur une chaîne (`kinds.${provider}.${verb}`, `catalog.${id}.name`, `runs.status.${s}`) se typent par un cast vers une clé réelle, comme `values.${value}` aujourd'hui (`action-card.tsx:74`). Le contrat de traduction vérifie leur forme (`[^.]+` par segment) : un identifiant de fiche ou d'outil ne contient pas de point.

### 10.2 `messages/fr.json`

Sous `navigation` (après `discussions`) et sous `shell` (après `toReconnect`, `:311`) :

```json
    "agents": "Agents",
```

```json
    "toValidate": "{count, plural, one {# action à valider} other {# actions à valider}}",
```

Le bloc `agents`, à la racine (après `discussionView`). Le bloc `manuel` et les fiches autres que `suivi_echange` y sont posés par les chapitres 08 et 09 ; `catalog.suivi_echange` entre ici, avec l'écran (10.1).

```json
  "agents": {
    "title": "Agents",
    "catalog": {
      "suivi_echange": {
        "name": "Suivi d'échange",
        "description": "Après une réunion client enregistrée : une note et des tâches sur la fiche du client dans le CRM, et un brouillon du mail de suivi dans votre boîte. Lit la transcription et l'historique du client dans les outils de l'équipe. Rien ne part sans vous."
      }
    },
    "tabs": {
      "label": "Vues du poste de contrôle",
      "catalogue": "Catalogue",
      "executions": "Exécutions",
      "cout": "Coût",
      "canaux": "Canaux"
    },
    "noModel": "Aucun modèle n’est réglé : les agents ne tournent pas.",
    "cut": "Les agents sont coupés pour votre espace. Un administrateur peut les rallumer dans Coût.",
    "catalogEmpty": "Aucun agent n’est encore disponible.",
    "services": {
      "salarie": "Chaque salarié",
      "commerce": "Commerce",
      "support": "Support",
      "projets": "Projets",
      "produit": "Produit et développement",
      "direction": "Direction",
      "equipe": "Équipe"
    },
    "autonomy": {
      "propose": "Propose",
      "agit_previent": "Agit et prévient",
      "agit_seul": "Agit seul"
    },
    "groups": {
      "mine": "Vos agents",
      "ready": "À activer",
      "missing": "À brancher d’abord",
      "team": "Pour l’équipe"
    },
    "card": {
      "active": "En service",
      "paused": "Coupé",
      "writes": "Écrit : {list}",
      "month": "Ce mois-ci : {runs, plural, one {# exécution} other {# exécutions}} · {usd}",
      "missingFamilies": "Il manque : un outil de la famille « {families} ».",
      "missingWrites": "Il manque le droit d’écrire dans : {tools}.",
      "connect": "Brancher un outil",
      "activate": "Activer",
      "settings": "Régler",
      "pause": "Couper",
      "resume": "Remettre en service",
      "teamReadOnly": "Activé pour l’équipe par un administrateur. Il ne fait que proposer : l’administrateur valide chaque action.",
      "reversible": "se défait"
    },
    "activation": {
      "writes": "Ce qu’il écrit",
      "autonomyLabel": "Ce qui part sans vous",
      "autonomyHelp": {
        "propose": "Chaque action attend votre clic.",
        "agit_previent": "Les actions sans risque partent seules, et vous êtes prévenu.",
        "agit_seul": "Les actions sans risque partent seules, et restent au journal."
      },
      "notYet": "pas encore ouvert",
      "ceilingNote": "Pour l’instant, chaque agent propose et attend votre clic.",
      "alwaysClick": "Ce qui sort de la société, ou part d’un mail privé vers vos collègues, attend toujours votre clic.",
      "settings": "Réglages",
      "noSettings": "Aucun réglage.",
      "required": "obligatoire",
      "listSetting": "Se règle dans la fiche : la valeur par défaut s’applique.",
      "limitsLabel": "Limites",
      "limits": "{runs, plural, one {# exécution} other {# exécutions}} par jour au plus, {usd} chacune au plus.",
      "activate": "Activer",
      "save": "Enregistrer",
      "saved": "Enregistré.",
      "raise": "{wouldPass, plural, one {Sur # action qui serait partie} other {Sur # actions qui seraient parties}} sans clic au cran « {to} », vous en avez validé {accepted}.",
      "raiseButton": "Passer à ce cran"
    },
    "errors": {
      "introuvable": "Cet agent n’existe plus, ou ne vous est pas visible.",
      "manque": "Il manque un outil branché pour cet agent.",
      "reglage": "Un réglage manque ou n’est pas valable.",
      "interdit": "Seul un administrateur peut faire ce réglage.",
      "coupe": "Les agents sont coupés pour votre espace.",
      "existe": "Un administrateur a déjà activé cet agent pour l’équipe.",
      "erreur": "Le réglage n’a pas pu être enregistré. Réessayez."
    },
    "pending": {
      "title": "À valider",
      "link": "À valider · {count}",
      "count": "{count, plural, one {# action} other {# actions}}",
      "seeAll": "Tout voir",
      "expires": "Expire le {date}",
      "journal": "Journal",
      "empty": "Rien à valider. Les propositions de vos agents arrivent ici.",
      "sourceHidden": "Source non visible",
      "unknownAgent": "Agent retiré du catalogue",
      "hiddenLead": "Une source que ces propositions ont lue ne vous est plus visible : leur détail n’est plus montré. Vous pouvez les refuser ; elles ne se valident plus.",
      "refuse": "Refuser",
      "refused": "Refusée.",
      "confirmBlocked": "Les agents sont coupés pour votre espace : vous pouvez refuser cette proposition, pas la valider."
    },
    "runs": {
      "empty": "Aucune exécution pour l’instant. Une exécution apparaît ici dès qu’un agent en service est réveillé.",
      "filtersLabel": "Filtrer les exécutions",
      "allAgents": "Tous les agents",
      "allStatuses": "Tous les états",
      "older": "Plus anciennes",
      "proposed": "{count, plural, =0 {Rien proposé} one {# action proposée} other {# actions proposées}}",
      "sourceHidden": "Source non visible",
      "status": {
        "en-file": "En file",
        "en-cours": "En cours",
        "en-attente": "En attente",
        "faite": "Faite",
        "echouee": "Échouée",
        "annulee": "Annulée",
        "ignoree": "Ignorée"
      },
      "reason": {
        "budget": "Budget du jour ou du mois atteint",
        "plafond": "Plafond du jour atteint",
        "parti": "La personne a quitté l’espace",
        "role": "L’activateur n’est plus administrateur",
        "connexion": "Un outil est à reconnecter",
        "limite": "L’outil a demandé d’attendre",
        "refus": "Le modèle a refusé de répondre",
        "erreur": "Le moteur s’est arrêté sur une erreur",
        "expiree": "Trop tard : l’élément n’était plus d’actualité"
      }
    },
    "run": {
      "state": "État",
      "doneIn": "{status} en {duration}",
      "duration": "{minutes, plural, =0 {} other {# min }}{seconds} s",
      "calls": "{count, plural, one {# appel au modèle} other {# appels au modèle}}",
      "reasonLabel": "Raison",
      "triggerLabel": "Déclencheur",
      "readLabel": "Ce qu’il a lu",
      "stepsLabel": "Étapes",
      "actionsLabel": "Actions",
      "trigger": {
        "evenement": "Un élément nouveau",
        "horloge": "L’horloge",
        "veille": "Une veille arrivée à échéance",
        "manuel": "Lancée à la main"
      },
      "external": "Un contenu extérieur",
      "noExternal": "Rien d’extérieur",
      "private": "Une donnée privée",
      "noPrivate": "Rien de privé",
      "autonomy": "Cran : {level}",
      "unreadable": "Une source que cette exécution a lue ne vous est plus visible : son détail n’est plus montré.",
      "stepStatus": {
        "intention": "commencée",
        "faite": "faite",
        "echouee": "échouée"
      },
      "sources": "{count, plural, =0 {Aucune source lue} one {# source lue} other {# sources lues}}",
      "fields": "Ce qui a été extrait",
      "text": "Texte rédigé",
      "show": "Voir",
      "proposals": "{count, plural, =0 {Rien à proposer} one {# proposition} other {# propositions}}",
      "action": {
        "proposee": "Action proposée",
        "faite": "Action faite",
        "echouee": "Action échouée",
        "sautee": "Action sautée",
        "refusee": "Action refusée",
        "autre": "Action"
      },
      "waiting": "En attente jusqu’au {until}",
      "waitingOpen": "En attente",
      "emptied": "Détail effacé (30 jours, ou source disparue)",
      "close": "Fermer"
    },
    "cost": {
      "mine": "Ce mois-ci, pour vous",
      "usd": "Coût",
      "runs": "Exécutions",
      "calls": "Appels au modèle",
      "byAgent": "Par agent",
      "none": "Aucune exécution ce mois-ci.",
      "org": "Votre espace ce mois-ci",
      "reserved": "Réservé",
      "spent": "Dépensé",
      "cap": "Plafond",
      "share": "{percent} % du plafond",
      "capDefault": "Plafond : {perSeat} par membre (défaut).",
      "capSetting": "Plafond réglé pour l’espace.",
      "monthBudget": "Plafond du mois, en dollars",
      "monthBudgetHelp": "Vide : {perSeat} par membre.",
      "save": "Enregistrer",
      "enabled": "Agents allumés dans l’espace",
      "enabledHelp": "Couper arrête toute nouvelle exécution. Les propositions en attente se refusent, mais ne se valident plus tant que les agents sont coupés.",
      "maxAutonomy": "Cran le plus haut permis",
      "ceilingNote": "Pour l’instant, tous les agents restent à « Propose ».",
      "failed": "Le réglage n’a pas pu être enregistré.",
      "acceptance": "Taux d’acceptation, 30 jours",
      "acceptanceEmpty": "Les compteurs apparaissent quand trois personnes au moins ont activé un même agent.",
      "columns": {
        "agent": "Agent",
        "proposed": "Proposées",
        "done": "Faites",
        "cancelled": "Refusées",
        "expired": "Expirées",
        "undone": "Défaites",
        "doneWithoutClick": "Faites sans clic"
      }
    },
    "kinds": {
      "github": {
        "creer_branche": "Branche dans GitHub",
        "supprimer_branche": "Suppression de branche dans GitHub",
        "ecrire_fichier": "Fichier modifié dans GitHub",
        "supprimer_fichier": "Suppression de fichier dans GitHub",
        "ouvrir_pr": "Pull request dans GitHub",
        "modifier_pr": "Pull request modifiée dans GitHub",
        "fusionner_pr": "Fusion dans GitHub",
        "commenter": "Commentaire dans GitHub",
        "demander_revue": "Demande de revue dans GitHub",
        "soumettre_revue": "Revue dans GitHub",
        "creer_ticket": "Ticket dans GitHub",
        "modifier_ticket": "Ticket modifié dans GitHub",
        "relancer_execution": "Relance d’un workflow dans GitHub",
        "annuler_execution": "Arrêt d’un workflow dans GitHub"
      },
      "outlook": {
        "creer_brouillon": "Brouillon dans Outlook",
        "classer": "Mail classé dans Outlook",
        "envoyer": "Mail envoyé par Outlook",
        "bloquer_creneau": "Créneau bloqué dans Outlook",
        "creer_evenement": "Invitation dans Outlook"
      },
      "gmail": {
        "creer_brouillon": "Brouillon dans Gmail",
        "classer": "Mail classé dans Gmail",
        "envoyer": "Mail envoyé par Gmail"
      },
      "hubspot": {
        "creer_note": "Note dans HubSpot",
        "creer_tache": "Tâche dans HubSpot",
        "creer_contact": "Contact dans HubSpot",
        "creer_affaire": "Affaire dans HubSpot",
        "modifier_fiche": "Fiche modifiée dans HubSpot"
      },
      "linear": {
        "creer_ticket": "Ticket dans Linear",
        "commenter": "Commentaire dans Linear",
        "modifier_ticket": "Ticket modifié dans Linear"
      },
      "notion": {
        "creer_page": "Page dans Notion",
        "commenter": "Commentaire dans Notion",
        "modifier_page": "Page modifiée dans Notion"
      },
      "zendesk": {
        "ajouter_note_interne": "Note interne dans Zendesk",
        "modifier_ticket": "Ticket modifié dans Zendesk",
        "repondre": "Réponse au client dans Zendesk"
      },
      "jira": {
        "creer_ticket": "Ticket dans Jira",
        "commenter": "Commentaire dans Jira",
        "changer_statut": "Statut changé dans Jira"
      },
      "asana": {
        "creer_tache": "Tâche dans Asana",
        "commenter": "Commentaire dans Asana",
        "modifier_tache": "Tâche modifiée dans Asana"
      }
    },
    "channels": {
      "title": "Canaux",
      "lead": "Où Leon vous prévient quand des actions vous attendent. Les messages ne portent que des nombres et des titres génériques : le détail s’ouvre dans Leon.",
      "recap": "Récapitulatif par e-mail",
      "recapHelp": "Une fois par jour au plus, et seulement quand quelque chose vous attend.",
      "recapHour": "Heure d’envoi",
      "hour": "{hour} h",
      "timeZone": "Fuseau horaire",
      "mailUnconfigured": "Le serveur n’envoie pas d’e-mail : aucun récapitulatif ne part.",
      "slack": "Slack",
      "slackHelp": "Un message direct de l’appli Leon, avec un bouton pour valider ce qui reste chez vous.",
      "slackUnconfigured": "Le serveur n’a pas d’appli Slack réglée.",
      "slackNotInstalled": "L’appli Slack de Leon n’est pas installée dans votre espace.",
      "slackInstallAdmin": "Un administrateur peut l’installer ici.",
      "slackInstall": "Installer l’appli Slack",
      "slackUninstall": "Désinstaller l’appli Slack",
      "slackLink": "Lier mon compte Slack",
      "slackLinked": "Compte Slack lié.",
      "slackUnlink": "Délier",
      "slackInvalid": "L’appli Slack de Leon ne répond plus dans votre espace Slack (retirée, ou son accès révoqué). Aucun message ne part.",
      "slackInvalidAdmin": "Réinstallez-la, ou désinstallez-la.",
      "save": "Enregistrer",
      "saved": "Enregistré.",
      "errors": {
        "fuseau": "Fuseau horaire inconnu.",
        "adresse": "Votre adresse n’est pas vérifiée : Leon ne peut pas trouver votre compte Slack.",
        "inconnu": "Aucun compte de cet espace Slack n’a votre adresse.",
        "pris": "Ce compte Slack est déjà lié à une autre personne.",
        "installation": "L’appli Slack n’est pas installée.",
        "interdit": "Seul un administrateur peut faire ce réglage.",
        "slack": "Slack n’a pas répondu. Réessayez.",
        "erreur": "Le réglage n’a pas pu être enregistré. Réessayez."
      },
      "installReturn": {
        "installe": "L’appli Slack est installée.",
        "annule": "Installation annulée.",
        "refuse": "Slack a refusé l’installation.",
        "autre_espace": "Cet espace Slack est déjà lié à un autre espace Leon.",
        "expire": "L’installation a pris trop de temps. Recommencez.",
        "interdit": "Seul un administrateur installe l’appli Slack."
      }
    },
    "recap": {
      "subject": "{count, plural, one {Leon : # action à valider} other {Leon : # actions à valider}}",
      "subjectDone": "Leon : ce que vos agents ont fait",
      "greeting": "Bonjour,",
      "intro": "{count, plural, one {# action de vos agents attend votre validation :} other {# actions de vos agents attendent votre validation :}}",
      "line": "{count} × {title}",
      "doneIntro": "{count, plural, one {# action est partie sans clic depuis hier, selon le cran que vous avez choisi.} other {# actions sont parties sans clic depuis hier, selon le cran que vous avez choisi.}}",
      "open": "Ouvrir « À valider »",
      "openJournal": "Ouvrir le journal",
      "expiry": "Une proposition expire au bout de sept jours. Rien n’est fait tant que vous ne validez pas.",
      "why": "Vous recevez ce message une fois par jour au plus, quand quelque chose vous attend.",
      "stop": "Pour ne plus le recevoir : Agents, puis Canaux."
    },
    "slack": {
      "intro": "{agent} propose {count, plural, one {# action} other {# actions}} :",
      "introDone": "{agent} a fait {count, plural, one {# action} other {# actions}} sans clic :",
      "approve": "Valider",
      "undo": "Annuler",
      "open": "Ouvrir dans Leon",
      "openOnly": "À valider dans Leon.",
      "fallback": "{count, plural, one {# action à valider dans Leon} other {# actions à valider dans Leon}}",
      "outcome": {
        "faite": "Validée : c’est fait.",
        "echouee": "N’a pas pu se faire : ouvrez Leon.",
        "annulee": "Refusée.",
        "defaite": "Annulée.",
        "deja": "Déjà décidée.",
        "ouvrir": "À valider dans Leon.",
        "perdue": "N’est plus disponible.",
        "coupe": "Les agents sont coupés pour votre espace : rien n’a été fait.",
        "source": "Sa source ne vous est plus visible : ouvrez Leon pour la refuser."
      }
    },
    "depart": {
      "passation_en_attente": "Les propositions de ses agents qui attendent encore sa validation seront annulées."
    }
  },
```

### 10.3 `messages/en.json`

```json
    "agents": "Agents",
```

```json
    "toValidate": "{count, plural, one {# action to approve} other {# actions to approve}}",
```

```json
  "agents": {
    "title": "Agents",
    "catalog": {
      "suivi_echange": {
        "name": "Meeting follow-up",
        "description": "After a recorded customer meeting: a note and tasks on the customer's CRM record, and a draft follow-up email in your mailbox. Reads the transcript and the customer's history in the team's tools. Nothing leaves without you."
      }
    },
    "tabs": {
      "label": "Control panel views",
      "catalogue": "Catalogue",
      "executions": "Runs",
      "cout": "Cost",
      "canaux": "Channels"
    },
    "noModel": "No model is set up: agents do not run.",
    "cut": "Agents are turned off for your workspace. An administrator can turn them back on in Cost.",
    "catalogEmpty": "No agent is available yet.",
    "services": {
      "salarie": "Every employee",
      "commerce": "Sales",
      "support": "Support",
      "projets": "Projects",
      "produit": "Product and engineering",
      "direction": "Management",
      "equipe": "People"
    },
    "autonomy": {
      "propose": "Proposes",
      "agit_previent": "Acts and tells you",
      "agit_seul": "Acts on its own"
    },
    "groups": {
      "mine": "Your agents",
      "ready": "Ready to turn on",
      "missing": "Connect a tool first",
      "team": "For the team"
    },
    "card": {
      "active": "On",
      "paused": "Off",
      "writes": "Writes: {list}",
      "month": "This month: {runs, plural, one {# run} other {# runs}} · {usd}",
      "missingFamilies": "Missing: a tool from the “{families}” family.",
      "missingWrites": "Missing write access to: {tools}.",
      "connect": "Connect a tool",
      "activate": "Turn on",
      "settings": "Settings",
      "pause": "Turn off",
      "resume": "Turn back on",
      "teamReadOnly": "Turned on for the team by an administrator. It only proposes: the administrator approves each action.",
      "reversible": "can be reversed"
    },
    "activation": {
      "writes": "What it writes",
      "autonomyLabel": "What goes without you",
      "autonomyHelp": {
        "propose": "Each action waits for your click.",
        "agit_previent": "Low-stakes actions go on their own, and you are told.",
        "agit_seul": "Low-stakes actions go on their own, and stay in the log."
      },
      "notYet": "not open yet",
      "ceilingNote": "For now, every agent proposes and waits for your click.",
      "alwaysClick": "Anything that leaves the company, or takes a private email to your colleagues, always waits for your click.",
      "settings": "Settings",
      "noSettings": "No settings.",
      "required": "required",
      "listSetting": "Set in the agent itself: the default applies.",
      "limitsLabel": "Limits",
      "limits": "At most {runs, plural, one {# run} other {# runs}} a day, {usd} each at most.",
      "activate": "Turn on",
      "save": "Save",
      "saved": "Saved.",
      "raise": "{wouldPass, plural, one {Of # action that would have gone} other {Of # actions that would have gone}} without a click at “{to}”, you approved {accepted}.",
      "raiseButton": "Move to this level"
    },
    "errors": {
      "introuvable": "This agent no longer exists, or is not visible to you.",
      "manque": "This agent needs a tool you have not connected.",
      "reglage": "A setting is missing or not valid.",
      "interdit": "Only an administrator can change this.",
      "coupe": "Agents are turned off for your workspace.",
      "existe": "An administrator already turned this agent on for the team.",
      "erreur": "The setting could not be saved. Try again."
    },
    "pending": {
      "title": "To approve",
      "link": "To approve · {count}",
      "count": "{count, plural, one {# action} other {# actions}}",
      "seeAll": "See all",
      "expires": "Expires on {date}",
      "journal": "Log",
      "empty": "Nothing to approve. What your agents propose arrives here.",
      "sourceHidden": "Source not visible",
      "unknownAgent": "Agent removed from the catalogue",
      "hiddenLead": "A source these proposals read is no longer visible to you: their details are not shown anymore. You can refuse them; they can no longer be approved.",
      "refuse": "Refuse",
      "refused": "Refused.",
      "confirmBlocked": "Agents are turned off for your workspace: you can refuse this proposal, not approve it."
    },
    "runs": {
      "empty": "No run yet. A run appears here as soon as an agent that is on wakes up.",
      "filtersLabel": "Filter runs",
      "allAgents": "All agents",
      "allStatuses": "All states",
      "older": "Older",
      "proposed": "{count, plural, =0 {Nothing proposed} one {# action proposed} other {# actions proposed}}",
      "sourceHidden": "Source not visible",
      "status": {
        "en-file": "Queued",
        "en-cours": "Running",
        "en-attente": "Waiting",
        "faite": "Done",
        "echouee": "Failed",
        "annulee": "Cancelled",
        "ignoree": "Skipped"
      },
      "reason": {
        "budget": "Daily or monthly budget reached",
        "plafond": "Daily limit reached",
        "parti": "The person left the workspace",
        "role": "The person who turned it on is no longer an administrator",
        "connexion": "A tool needs reconnecting",
        "limite": "The tool asked to wait",
        "refus": "The model declined to answer",
        "erreur": "The engine stopped on an error",
        "expiree": "Too late: the item was no longer current"
      }
    },
    "run": {
      "state": "State",
      "doneIn": "{status} in {duration}",
      "duration": "{minutes, plural, =0 {} other {# min }}{seconds} s",
      "calls": "{count, plural, one {# model call} other {# model calls}}",
      "reasonLabel": "Reason",
      "triggerLabel": "Trigger",
      "readLabel": "What it read",
      "stepsLabel": "Steps",
      "actionsLabel": "Actions",
      "trigger": {
        "evenement": "A new item",
        "horloge": "The clock",
        "veille": "A watch that came due",
        "manuel": "Started by hand"
      },
      "external": "Outside content",
      "noExternal": "Nothing from outside",
      "private": "Private data",
      "noPrivate": "Nothing private",
      "autonomy": "Level: {level}",
      "unreadable": "A source this run read is no longer visible to you: its detail is no longer shown.",
      "stepStatus": {
        "intention": "started",
        "faite": "done",
        "echouee": "failed"
      },
      "sources": "{count, plural, =0 {No source read} one {# source read} other {# sources read}}",
      "fields": "What was extracted",
      "text": "Drafted text",
      "show": "Show",
      "proposals": "{count, plural, =0 {Nothing to propose} one {# proposal} other {# proposals}}",
      "action": {
        "proposee": "Action proposed",
        "faite": "Action done",
        "echouee": "Action failed",
        "sautee": "Action skipped",
        "refusee": "Action refused",
        "autre": "Action"
      },
      "waiting": "Waiting until {until}",
      "waitingOpen": "Waiting",
      "emptied": "Detail erased (30 days, or source gone)",
      "close": "Close"
    },
    "cost": {
      "mine": "This month, for you",
      "usd": "Cost",
      "runs": "Runs",
      "calls": "Model calls",
      "byAgent": "By agent",
      "none": "No run this month.",
      "org": "Your workspace this month",
      "reserved": "Reserved",
      "spent": "Spent",
      "cap": "Cap",
      "share": "{percent}% of the cap",
      "capDefault": "Cap: {perSeat} per member (default).",
      "capSetting": "Cap set for the workspace.",
      "monthBudget": "Monthly cap, in dollars",
      "monthBudgetHelp": "Empty: {perSeat} per member.",
      "save": "Save",
      "enabled": "Agents on in the workspace",
      "enabledHelp": "Turning off stops every new run. Waiting proposals can be refused, but not approved while agents are off.",
      "maxAutonomy": "Highest level allowed",
      "ceilingNote": "For now, every agent stays at “Proposes”.",
      "failed": "The setting could not be saved.",
      "acceptance": "Acceptance, 30 days",
      "acceptanceEmpty": "Counters appear once at least three people have turned on the same agent.",
      "columns": {
        "agent": "Agent",
        "proposed": "Proposed",
        "done": "Done",
        "cancelled": "Refused",
        "expired": "Expired",
        "undone": "Undone",
        "doneWithoutClick": "Done without a click"
      }
    },
    "kinds": {
      "github": {
        "creer_branche": "Branch in GitHub",
        "supprimer_branche": "Branch deletion in GitHub",
        "ecrire_fichier": "File change in GitHub",
        "supprimer_fichier": "File deletion in GitHub",
        "ouvrir_pr": "Pull request in GitHub",
        "modifier_pr": "Pull request edit in GitHub",
        "fusionner_pr": "Merge in GitHub",
        "commenter": "Comment in GitHub",
        "demander_revue": "Review request in GitHub",
        "soumettre_revue": "Review in GitHub",
        "creer_ticket": "Issue in GitHub",
        "modifier_ticket": "Issue edit in GitHub",
        "relancer_execution": "Workflow re-run in GitHub",
        "annuler_execution": "Workflow stop in GitHub"
      },
      "outlook": {
        "creer_brouillon": "Draft in Outlook",
        "classer": "Email filed in Outlook",
        "envoyer": "Email sent from Outlook",
        "bloquer_creneau": "Time blocked in Outlook",
        "creer_evenement": "Invitation in Outlook"
      },
      "gmail": {
        "creer_brouillon": "Draft in Gmail",
        "classer": "Email filed in Gmail",
        "envoyer": "Email sent from Gmail"
      },
      "hubspot": {
        "creer_note": "Note in HubSpot",
        "creer_tache": "Task in HubSpot",
        "creer_contact": "Contact in HubSpot",
        "creer_affaire": "Deal in HubSpot",
        "modifier_fiche": "Record edit in HubSpot"
      },
      "linear": {
        "creer_ticket": "Issue in Linear",
        "commenter": "Comment in Linear",
        "modifier_ticket": "Issue edit in Linear"
      },
      "notion": {
        "creer_page": "Page in Notion",
        "commenter": "Comment in Notion",
        "modifier_page": "Page edit in Notion"
      },
      "zendesk": {
        "ajouter_note_interne": "Internal note in Zendesk",
        "modifier_ticket": "Ticket edit in Zendesk",
        "repondre": "Reply to the customer in Zendesk"
      },
      "jira": {
        "creer_ticket": "Issue in Jira",
        "commenter": "Comment in Jira",
        "changer_statut": "Status change in Jira"
      },
      "asana": {
        "creer_tache": "Task in Asana",
        "commenter": "Comment in Asana",
        "modifier_tache": "Task edit in Asana"
      }
    },
    "channels": {
      "title": "Channels",
      "lead": "Where Leon tells you that actions are waiting. Messages carry only numbers and generic titles: the detail opens in Leon.",
      "recap": "Email summary",
      "recapHelp": "At most once a day, and only when something is waiting for you.",
      "recapHour": "Sending time",
      "hour": "{hour}:00",
      "timeZone": "Time zone",
      "mailUnconfigured": "The server does not send email: no summary goes out.",
      "slack": "Slack",
      "slackHelp": "A direct message from the Leon app, with a button to approve what stays with you.",
      "slackUnconfigured": "The server has no Slack app set up.",
      "slackNotInstalled": "The Leon Slack app is not installed in your workspace.",
      "slackInstallAdmin": "An administrator can install it here.",
      "slackInstall": "Install the Slack app",
      "slackUninstall": "Uninstall the Slack app",
      "slackLink": "Link my Slack account",
      "slackLinked": "Slack account linked.",
      "slackUnlink": "Unlink",
      "slackInvalid": "Leon's Slack app no longer answers in your Slack workspace (removed, or its access revoked). No message is sent.",
      "slackInvalidAdmin": "Reinstall it, or uninstall it.",
      "save": "Save",
      "saved": "Saved.",
      "errors": {
        "fuseau": "Unknown time zone.",
        "adresse": "Your address is not verified: Leon cannot find your Slack account.",
        "inconnu": "No account in this Slack workspace has your address.",
        "pris": "This Slack account is already linked to someone else.",
        "installation": "The Slack app is not installed.",
        "interdit": "Only an administrator can change this.",
        "slack": "Slack did not answer. Try again.",
        "erreur": "The setting could not be saved. Try again."
      },
      "installReturn": {
        "installe": "The Slack app is installed.",
        "annule": "Installation cancelled.",
        "refuse": "Slack refused the installation.",
        "autre_espace": "This Slack workspace is already linked to another Leon workspace.",
        "expire": "The installation took too long. Start again.",
        "interdit": "Only an administrator installs the Slack app."
      }
    },
    "recap": {
      "subject": "{count, plural, one {Leon: # action to approve} other {Leon: # actions to approve}}",
      "subjectDone": "Leon: what your agents did",
      "greeting": "Hello,",
      "intro": "{count, plural, one {# action from your agents is waiting for your approval:} other {# actions from your agents are waiting for your approval:}}",
      "line": "{count} × {title}",
      "doneIntro": "{count, plural, one {# action went without a click since yesterday, at the level you chose.} other {# actions went without a click since yesterday, at the level you chose.}}",
      "open": "Open “To approve”",
      "openJournal": "Open the log",
      "expiry": "A proposal expires after seven days. Nothing is done until you approve.",
      "why": "You get this message at most once a day, when something is waiting for you.",
      "stop": "To stop it: Agents, then Channels."
    },
    "slack": {
      "intro": "{agent} proposes {count, plural, one {# action} other {# actions}}:",
      "introDone": "{agent} did {count, plural, one {# action} other {# actions}} without a click:",
      "approve": "Approve",
      "undo": "Undo",
      "open": "Open in Leon",
      "openOnly": "To approve in Leon.",
      "fallback": "{count, plural, one {# action to approve in Leon} other {# actions to approve in Leon}}",
      "outcome": {
        "faite": "Approved: done.",
        "echouee": "Could not be done: open Leon.",
        "annulee": "Refused.",
        "defaite": "Undone.",
        "deja": "Already decided.",
        "ouvrir": "To approve in Leon.",
        "perdue": "No longer available.",
        "coupe": "Agents are turned off for your workspace: nothing was done.",
        "source": "Its source is no longer visible to you: open Leon to refuse it."
      }
    },
    "depart": {
      "passation_en_attente": "Proposals from their agents that are still waiting for their approval will be cancelled."
    }
  },
```

À savoir :

- **`runs.status` et `runs.reason` ont une clé par valeur de `RUN_STATUSES` et `RUN_REASONS`** (section 4.1). `model.test.ts` le vérifie (section 16.2) : une valeur ajoutée sans sa clé (comme `boucle`, chapitre 09) fait échouer le test, pas l'écran.
- **`agents.kinds.<outil>.<verbe>` existe pour chaque type d'`ACTION_KINDS`**, en français et en anglais, **et ne contient aucun `{`** (même test) : un titre sans argument ne peut porter aucun paramètre. Ce sont les seuls titres d'action qui sortent de Leon (architecture 9.12, point 1). Ce n'est pas une copie de `discussionView.action.kinds` (chapitre 05) : ces phrases-là portent les paramètres et ne quittent jamais la carte (écart 20).
- **`agents.catalog.suivi_echange` est posé par la PR 07b** (le texte du chapitre 08, 3.5, à l'identique) : l'écran entre avant la fiche. La PR 08b le trouve en place ; `catalog.test.ts` (chapitre 08) vérifie qu'il est là.
- **Les noms des fiches (`agents.catalog.<id>.name`) sortent aussi**, dans un message Slack : ce sont des textes du produit, pas des données captées.
- **`recap.*` et `slack.*` sont lus hors requête**, par `createTranslator({ locale, messages, namespace: 'agents.recap' })`, comme `invitation.ts:28` (existe). Le contrat de traduction lit cette forme (`BINDING`).

## 11. Après le jalon 1 : l'envoi mutualisé (`email/send.ts`)

PR 07d. Aucune migration. Elle peut passer avant le récapitulatif, et même avant le jalon 1 : elle ne change rien de ce que reçoivent les gens.

Aujourd'hui, trois copies de `fetch` vers Resend (`src/server/auth/auth.ts:84`, `src/server/email/invitation.ts:34`, `src/server/email/account-deleted.ts:41`, existent) et deux `escapeHtml` qui ne font pas la même chose (`invitation.ts:6-11` échappe `"`, `account-deleted.ts:6-7` non). `mailConfigured` n'existe que dans `invitation.ts:14` ; `sendAuthEmail` n'a pas de délai (carte 08, section 6). Le chapitre 05 attend aussi `escapeHtml` ici (`params.ts`, son `// shortcut:` de 3.3).

Points de l'éditeur : `https://api.resend.com/emails` et `/emails/batch`, les champs `from`, `to`, `subject`, `html`, l'en-tête `Authorization: Bearer` sont ceux du code existant (carte 08, 4). Le champ `text` (partie texte d'un message) est **à vérifier dans la documentation de l'éditeur**.

### 11.1 `src/server/email/send.ts` (code complet)

```ts
// src/server/email/send.ts
import { env } from '@/server/env';

// Le seul envoi d'e-mail de Leon : Resend par `fetch`, sans SDK (dossier agents, chapitre 07). Les appelants bâtissent
// le sujet et le HTML ; ce module ne sait rien de ce qu'ils disent. Aucune erreur ne cite l'adresse, le sujet ou le
// corps : seulement le statut HTTP.

export const RESEND_URL = 'https://api.resend.com/emails';
export const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
// Resend reçoit 100 messages au plus par lot (account-deleted.ts, déplacé ici).
export const RESEND_BATCH_MAX = 100;
// Un Resend qui ne répond pas ne retient ni une redirection ni un job.
const TIMEOUT_MS = 10_000;

export type Email = {
  to: string;
  subject: string; // texte, pas du HTML : les noms tels quels
  html: string; // déjà échappé par l'appelant (escapeHtml)
  text?: string; // partie texte ; champ « text » de Resend, à vérifier dans sa documentation
};

export type SendDeps = { fetchImpl?: typeof fetch };

// Le serveur sait-il envoyer un e-mail ? Les deux variables, comme la réinitialisation du mot de passe (auth.ts).
export const mailConfigured = (): boolean => Boolean(env.RESEND_API_KEY && env.LEON_EMAIL_FROM);

export class MailNotConfiguredError extends Error {
  constructor() {
    super('No mail service configured');
    this.name = 'MailNotConfiguredError';
  }
}

// Resend a refusé : le statut seul, jamais le corps de sa réponse (il peut citer l'adresse). Sur un 429, le délai
// demandé (Retry-After, en secondes : à vérifier dans la documentation de Resend), pour que l'appelant remette
// l'envoi à plus tard au lieu de le rejouer tout de suite.
export class MailRefusedError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null = null,
  ) {
    super(`Email refused (${status})`);
    this.name = 'MailRefusedError';
  }
}

// Resend limite le débit par clé d'API (2 requêtes par seconde par défaut, d'après sa documentation : à vérifier, et
// à mesurer au premier client). Les envois en nombre (le récapitulatif) s'espacent d'au moins cet intervalle.
export const RESEND_MIN_INTERVAL_MS = 600;

const retryAfterOf = (response: Response): number | null => {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) * 1000 : null;
};

// Ce qu'une personne a choisi (un nom d'espace, un nom de personne) entre dans du HTML : échappé. Les cinq
// caractères, dont l'apostrophe, pour qu'un attribut entre guillemets simples reste sûr aussi.
export const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const payload = (email: Email) => ({
  from: env.LEON_EMAIL_FROM,
  to: [email.to],
  subject: email.subject,
  html: email.html,
  ...(email.text === undefined ? {} : { text: email.text }),
});

async function post(url: string, body: unknown, deps: SendDeps): Promise<void> {
  if (!env.RESEND_API_KEY || !env.LEON_EMAIL_FROM) throw new MailNotConfiguredError();
  const response = await (deps.fetchImpl ?? fetch)(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new MailRefusedError(response.status, response.status === 429 ? retryAfterOf(response) : null);
  }
}

// Un message. Lève MailNotConfiguredError sans Resend, MailRefusedError s'il refuse.
export function sendEmail(email: Email, deps: SendDeps = {}): Promise<void> {
  return post(RESEND_URL, payload(email), deps);
}

// Un lot de RESEND_BATCH_MAX messages au plus, en un appel. Un lot plus grand est refusé avant tout envoi : à
// l'appelant de le couper (il sait ce qu'un envoi partiel voudrait dire).
export async function sendEmailBatch(emails: readonly Email[], deps: SendDeps = {}): Promise<void> {
  if (emails.length === 0) return;
  if (emails.length > RESEND_BATCH_MAX) throw new RangeError('Too many emails in one batch');
  await post(RESEND_BATCH_URL, emails.map(payload), deps);
}
```

### 11.2 Les trois appelants (existent)

| Fichier | Ce qui change | Ce qui ne change pas |
|---|---|---|
| `src/server/email/invitation.ts` | `escapeHtml` et `mailConfigured` importés de `./send` (et réexportés : `team/actions.ts:16` importe `mailConfigured` d'ici) ; le `fetch` (`:34-52`) devient `await sendEmail({ to, subject, html })` | Le sujet, le HTML, la langue ; « lève si Resend refuse » |
| `src/server/email/account-deleted.ts` | `escapeHtml` importé (il échappe désormais `"` et `'` aussi) ; `RESEND_BATCH_MAX` réexporté de `./send` (`settings/actions.ts:48` l'importe d'ici) ; le `fetch` (`:41-51`) devient `if (!mailConfigured()) return; await sendEmailBatch(emails)` | Sans Resend, rien ne part et rien ne lève (`:20`) |
| `src/server/auth/auth.ts` | Le `fetch` de `sendAuthEmail` (`:84-97`) devient `sendEmail(…)` : il gagne le délai de 10 s qu'il n'avait pas. L'URL reste non échappée, comme aujourd'hui : Better Auth la bâtit | Le message « RESEND_API_KEY and LEON_EMAIL_FROM are required… » (`:79-81`) : il est lu avant l'appel |

Les tests existants (`invitation.test.ts`, `account-deleted.test.ts`) espionnent `globalThis.fetch` et lisent l'URL et le corps : ils passent sans changement, puisque `sendEmail` appelle `fetch` quand `fetchImpl` est absent. Un test de plus, `send.test.ts` (section 16.6).

## 12. Après le jalon 1 : préférences de canaux et langue

PR 07e, après la PR de la migration 0084 (chapitre 01, 12 : `preferences_canaux`, `"user".locale`, `lier_slack`). Déclencheur (architecture 14.3) : des validations qui attendent plus d'un jour dans « À valider ».

### 12.1 `src/server/channels/preferences.ts` (code complet)

```ts
// src/server/channels/preferences.ts
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DEFAULT_LOCALE, type Locale, localeOf } from '@/i18n/request';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import { preferencesCanaux } from '@/server/db/schema/channels';
import { type Tx, withTenant } from '@/server/db/with-tenant';

// Où et quand prévenir une personne (preferences_canaux, 0084), et la langue de ses messages ("user".locale). Privé
// à la personne. slack_user_id ne s'écrit pas ici : lier_slack seulement (slack/link.ts, chapitre 01 écart 23).

export type ChannelPreferences = {
  recapEmail: boolean;
  recapHour: number; // 0 à 23, heure locale
  timeZone: string; // nom IANA
  slack: boolean;
  slackLinked: boolean;
};

// Sans ligne : les défauts de 0084 (récapitulatif à 8 h, heure de Paris ; pas de Slack).
export const DEFAULT_CHANNEL_PREFERENCES: ChannelPreferences = {
  recapEmail: true,
  recapHour: 8,
  timeZone: 'Europe/Paris',
  slack: false,
  slackLinked: false,
};

// Un nom que le moteur d'Intl de Node connaît. Postgres peut en connaître un autre jeu : heure_locale (0084) rend
// nul sur un nom inconnu, et la personne n'a alors pas de récapitulatif, sans faire tomber le tic de tous.
export function isTimeZone(name: string): boolean {
  if (name.length < 1 || name.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

// `slack` : absent tant que la vue Canaux n'a pas de partie Slack (PR 07e ; serveur sans appli) ; la valeur en base
// ne change alors pas.
export const ChannelPreferencesInputSchema = z.object({
  recapEmail: z.boolean(),
  recapHour: z.number().int().min(0).max(23),
  timeZone: z.string().refine(isTimeZone),
  slack: z.boolean().optional(),
});
export type ChannelPreferencesInput = z.infer<typeof ChannelPreferencesInputSchema>;

export async function readPreferencesIn(tx: Tx, ctx: TenantContext): Promise<ChannelPreferences> {
  const [row] = await tx
    .select()
    .from(preferencesCanaux)
    .where(
      and(eq(preferencesCanaux.tenantId, ctx.tenantId), eq(preferencesCanaux.userId, ctx.userId)),
    );
  if (!row) return DEFAULT_CHANNEL_PREFERENCES;
  return {
    recapEmail: row.recapEmail,
    recapHour: row.recapHeure,
    timeZone: row.fuseau,
    slack: row.slack,
    slackLinked: row.slackUserId !== null,
  };
}

export const readChannelPreferences = (ctx: TenantContext): Promise<ChannelPreferences> =>
  withTenant(ctx, (tx) => readPreferencesIn(tx, ctx));

// Refaite en place. slack_user_id n'est jamais nommé : la règle slack_par_lier_slack refuserait l'insertion, et
// la colonne n'est pas dans le droit de modification (0084).
export async function saveChannelPreferences(
  ctx: TenantContext,
  input: ChannelPreferencesInput,
): Promise<void> {
  const set = {
    recapEmail: input.recapEmail,
    recapHeure: input.recapHour,
    fuseau: input.timeZone,
    ...(input.slack === undefined ? {} : { slack: input.slack }),
  };
  await withTenant(ctx, (tx) =>
    tx
      .insert(preferencesCanaux)
      .values({ tenantId: ctx.tenantId, userId: ctx.userId, acl: [ctx.userId], ...set })
      .onConflictDoUpdate({ target: [preferencesCanaux.tenantId, preferencesCanaux.userId], set }),
  );
}

// La langue de la personne, pour un message écrit sans elle. Nulle en base : DEFAULT_LOCALE.
export async function readUserLocale(tx: Tx, userId: string): Promise<Locale> {
  const [row] = await tx.select({ locale: users.locale }).from(users).where(eq(users.id, userId));
  return row?.locale ? localeOf(row.locale) : DEFAULT_LOCALE;
}

// Écrite par le réglage de langue (setLocaleAction). Sa propre ligne seulement.
export async function saveUserLocale(ctx: TenantContext, locale: Locale): Promise<void> {
  await withTenant(ctx, (tx) => tx.update(users).set({ locale }).where(eq(users.id, ctx.userId)));
}

// La langue choisie avant l'inscription (le cookie, posé sans session par la page de connexion ou le pied du site),
// recopiée une fois, au premier rendu connecté (layout de (app), 12.2). Ne remplace jamais une langue déjà en base.
export async function rememberLocale(ctx: TenantContext, locale: Locale): Promise<void> {
  await withTenant(ctx, (tx) =>
    tx
      .update(users)
      .set({ locale })
      .where(and(eq(users.id, ctx.userId), isNull(users.locale))),
  );
}
```

`isNull` rejoint l'import de `drizzle-orm` en tête du fichier.

À savoir :

- **Drizzle nomme toutes les colonnes d'un `insert`**, `slack_user_id` comprise, à `default` (chapitre 01, 12, « essayé ») : la règle restrictive `slack_par_lier_slack` (`with check (slack_user_id is null)`) accepte une valeur par défaut nulle. Le test `0084-canaux-sortants.db.test.ts` du chapitre 01 couvre ce cas.
- **`users.locale`** : la colonne est ajoutée au schéma Drizzle par la PR de 0084 (chapitre 01, 14.4). `leon_app` a `update` sur toute la table `"user"` (`0002-auth.sql:20`).
- **Le fuseau est validé par Node, relu par Postgres.** Les deux listes viennent de la base IANA, mais pas forcément de la même version : `heure_locale` rend nul dans le doute.

### 12.2 `setLocaleAction` (existe, `src/app/(app)/settings/actions.ts:59-70`)

La langue passe aussi en base, pour le récapitulatif et Slack. Le cookie reste la source de l'interface.

```ts
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = z.enum(locales).safeParse(formData.get('locale'));
  if (!locale.success) return;
  (await cookies()).set(LOCALE_COOKIE, locale.data, {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
  // Après 0084 : la langue des messages écrits sans la personne (récapitulatif, Slack). Une panne ne prive pas
  // l'interface de sa langue : elle est notée, le cookie est déjà posé.
  const ctx = await getUserContext();
  if (ctx) await saveUserLocale(ctx, locale.data).catch((error) => logError('preferences.langue', error));
  revalidatePath('/', 'layout');
}
```

`getUserContext` (`src/server/auth/session.ts:60`, existe) rend `null` hors session, sans rediriger. `settings/actions.test.ts` (existe) remplace `@/server/auth/session` par un faux : il gagne `getUserContext: vi.fn(async () => null)`, et un cas qui vérifie l'appel de `saveUserLocale` quand une session existe.

`setLocaleAction` ne suffit pas : la langue se choisit le plus souvent **avant l'inscription**, par le formulaire de la barre d'authentification (`src/components/verre/auth/bar.tsx:19-24`) ou du pied du site (`src/components/site/site-footer.tsx:21`), sans session. Le cookie est posé, rien n'est écrit en base, et la personne verrait Leon en français mais recevrait son récapitulatif en anglais (`DEFAULT_LOCALE`, `src/i18n/request.ts:9`). D'où une recopie, une fois, au premier rendu connecté :

```ts
// src/server/shell/shell.ts (existe), PR 07e, après 0084 : la lecture de `me` gagne la langue en base.
    const [me] = await tx
      .select({ image: users.image, locale: users.locale })
      .from(users)
      .where(eq(users.id, ctx.userId));
// SidebarData gagne `locale: Locale | null` ; le retour, `locale: me?.locale ?? null`.

// src/app/(app)/layout.tsx (existe), après le Promise.all :
  // La langue choisie avant l'inscription devient celle des messages écrits sans la personne (récapitulatif, Slack).
  // Une fois : rememberLocale n'écrit que sur une langue nulle, et side.locale ne l'est plus au rendu suivant.
  if (side.locale === null) {
    const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
    const locale = locales.find((known) => known === chosen);
    if (locale) await rememberLocale(ctx, locale).catch((error) => logError('preferences.langue', error));
  }
```

`cookies` vient de `next/headers` ; `LOCALE_COOKIE` et `locales` de `@/i18n/request` ; `rememberLocale` de `@/server/channels/preferences` ; `logError` de `@/server/log`. Aucun cookie connu (la personne n'a jamais choisi) : rien n'est écrit, la langue reste nulle, donc `en`, comme l'interface, dont la langue ne vient que du cookie (`localeOf`, `:20`). `layout.test.ts` (existe) : le faux `readSidebar` rend `locale: 'fr'` ; un cas avec `locale: null` et un cookie `fr` vérifie l'appel de `rememberLocale(ctx, 'fr')`. `preferences.db.test.ts` : `rememberLocale` écrit une langue nulle et ne remplace jamais une langue posée.

### 12.3 La vue « Canaux » de `/agents`

Maquette (personne ordinaire ; Slack installé par un administrateur ; Exemple fictif) :

```
Agents
 Catalogue   Exécutions   Coût  [Canaux]

Où Leon vous prévient quand des actions vous attendent. Les messages ne portent que des nombres et des titres
génériques : le détail s'ouvre dans Leon.

Récapitulatif par e-mail                                                      [■ ]
  Une fois par jour au plus, et seulement quand quelque chose vous attend.
  Heure d'envoi   [ 8 h ▾ ]        Fuseau horaire   [ Europe/Paris ▾ ]

Slack                                                                         [■ ]
  Un message direct de l'appli Leon, avec un bouton pour valider ce qui reste chez vous.
  Compte Slack lié.                                                       [ Délier ]

                                                                        [ Enregistrer ]

— pour un propriétaire ou un administrateur —
Appli Slack       Installée dans l'espace Slack T0… le 2 déc. 2026          [ Désinstaller ]
```

États :

| Cas | Ce que dit l'écran |
|---|---|
| `!mailConfigured()` | `channels.mailUnconfigured` ; l'interrupteur reste réglable (la préférence vaut pour plus tard) |
| `!slackConfigured()` | `channels.slackUnconfigured` ; toute la partie Slack est masquée |
| Pas d'installation, membre ordinaire | `channels.slackNotInstalled` |
| Pas d'installation, administrateur | `channels.slackNotInstalled`, `channels.slackInstallAdmin`, et le formulaire `POST /api/v1/slack/installation` (bouton `channels.slackInstall`) |
| Installée, compte non lié | bouton `channels.slackLink` (`linkSlackAction`) ; une erreur s'affiche par `channels.errors.<code>` |
| Installée mais invalide (appli retirée côté Slack, jeton révoqué : `invalide_le` posé, 14.5) | `channels.slackInvalid` pour tous ; `channels.slackInvalidAdmin` et les boutons « Installer » et « Désinstaller » pour un administrateur |
| `?slack=<code>` au retour de l'installation | `channels.installReturn.<code>` en `Notice` |

Le type des données de la vue, et la liste des codes de retour, ajoutés à `src/lib/agents.ts`. Le composant s'appelle `ChannelsView` (`canaux.tsx`, comme `CostView`) ; ses données, `ChannelsViewData`, pour que `canaux.tsx` puisse importer le type sans heurter son propre nom.

```ts
// La vue « Canaux » (après le jalon 1). Rien de secret : ni jeton, ni identifiant Slack de la personne.
export type ChannelsViewData = {
  recapEmail: boolean;
  recapHour: number;
  timeZone: string;
  mailConfigured: boolean;
  // Null : le serveur n'a pas d'appli Slack réglée (slackConfigured, 14.2), et, avant la PR 07g, toujours.
  slack: {
    enabled: boolean; // preferences_canaux.slack
    linked: boolean; // slack_user_id posé
    installation: { teamId: string; createdAt: string; invalid: boolean } | null;
    canInstall: boolean; // propriétaire ou administrateur
  } | null;
};

// Les codes du retour d'installation (?slack=), lus par parseAgentsParams (model.ts) et rendus par install.ts. Ici,
// dans le module pur : model.ts part dans le navigateur et ne peut pas importer install.ts.
export const INSTALL_RETURNS = ['installe', 'annule', 'refuse', 'autre_espace', 'expire', 'interdit'] as const;
export type InstallReturn = (typeof INSTALL_RETURNS)[number];
```

`src/server/channels/preferences.ts` gagne `readChannelsView(ctx): Promise<ChannelsViewData>`. PR 07e : `readChannelPreferences`, `mailConfigured()`, et `slack: null`. PR 07g : si `slackConfigured()` (section 14.2), `slack` est rempli par `readInstallationSummary` (sans `bot_token` : la sélection ne nomme que `team_id`, `cree_le` et `invalide_le`) et `canInvite(ctx)`. `agents/page.tsx` la lit quand `params.view === 'canaux'` et cesse de retomber sur le catalogue. Ce découpage laisse la PR 07e sans aucun import de `src/server/slack/`, qui n'existe qu'avec 07g.

Esquisse de `src/components/verre/agents/canaux.tsx` :

```tsx
'use client';
// ChannelsView({ view, notice }: { view: ChannelsViewData; notice: InstallReturn | null }) :
// <Section title={t('channels.title')}> ; <p> t('channels.lead').
// Récapitulatif : <Switch checked={recapEmail}> ; <Select> des heures 0..23 (t('channels.hour', { hour })) ;
// <Select> des fuseaux : Intl.supportedValuesOf('timeZone') côté navigateur, la valeur courante en tête même si le
// navigateur ne la connaît pas. !mailConfigured → <Notice tone="warning"> t('channels.mailUnconfigured').
// Slack (view.slack non nul seulement) : <Switch checked={slack.enabled}> ; installation nulle →
// t('channels.slackNotInstalled') et, si canInstall, <form method="post" action="/api/v1/slack/installation"><Button
// type="submit"> t('channels.slackInstall')</Button></form> (un formulaire, pas un fetch : le navigateur suit la
// redirection vers Slack). installation.invalid → <Notice tone="warning"> t('channels.slackInvalid') ; si canInstall,
// t('channels.slackInvalidAdmin'), le même formulaire d'installation et « Désinstaller ». Installée et valide :
// linked ? t('channels.slackLinked') + <Button onClick={unlinkSlackAction}> t('channels.slackUnlink') : <Button
// onClick={linkSlackAction}> t('channels.slackLink') ; le code d'erreur rendu s'affiche par
// t(`channels.errors.${error}`) (rôle status). Administrateur : t('channels.slackUninstall') → uninstallSlackAction,
// derrière un AlertDialog.
// « Enregistrer » → saveChannelPreferencesAction({ recapEmail, recapHour, timeZone, slack }) ; `slack` absent quand
// view.slack est nul.
// notice : le code `?slack=` lu par parseAgentsParams (INSTALL_RETURNS), affiché une fois.
```

PR 07g : `parseAgentsParams` (section 5.3) gagne `slack: InstallReturn | null`, lu dans `?slack=` contre `INSTALL_RETURNS` (importé de `@/lib/agents`), et `AgentsParams` le champ du même nom. Le test de 16.2 change dans la même PR :

```ts
// model.test.ts, « lit une adresse complète » : le toEqual gagne la clé, absente de l'adresse.
      agent: 'suivi_echange',
      slack: null,
    });

  it('lit le code de retour de Slack contre la liste fermée', () => {
    expect(parseAgentsParams({ vue: 'canaux', slack: 'installe' }).slack).toBe('installe');
    expect(parseAgentsParams({ vue: 'canaux', slack: 'x' }).slack).toBeNull();
  });
```

`agentId` et `agent` lisent le même paramètre `?agent=` : le premier filtre la vue Exécutions, le second ouvre le panneau d'une fiche dans le Catalogue. La vue dit lequel sert.

### 12.4 Les server actions des canaux (ajouts à `src/app/(app)/agents/actions.ts`)

PR 07e : les imports de `preferences.ts`, `saveChannelPreferencesAction`, et un `ChannelActionResult` dont l'erreur est `'fuseau' | 'erreur'`. PR 07g : les imports de `src/server/slack/`, les trois actions Slack, et l'union élargie ci-dessous.

```ts
import {
  ChannelPreferencesInputSchema,
  saveChannelPreferences,
} from '@/server/channels/preferences';
import { type LinkResult, linkSlackUser, unlinkSlackUser } from '@/server/slack/link'; // 07g
import { uninstallSlack } from '@/server/slack/install'; // 07g

export type ChannelActionResult =
  | { ok: true }
  | { ok: false; error: 'fuseau' | 'erreur' | 'interdit' | Exclude<LinkResult, 'lie'> }; // 07e : 'fuseau' | 'erreur'

// Où et quand prévenir. Le fuseau est vérifié ici (Intl) ; l'heure est entre 0 et 23.
export async function saveChannelPreferencesAction(input: unknown): Promise<ChannelActionResult> {
  const ctx = await requireUserContext();
  const parsed = ChannelPreferencesInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'fuseau' };
  try {
    await saveChannelPreferences(ctx, parsed.data);
    revalidatePath('/agents');
    return { ok: true };
  } catch (error) {
    logError('canaux.preferences', error);
    return { ok: false, error: 'erreur' };
  }
}

// PR 07g. Lier son compte Slack : Leon le cherche par son adresse vérifiée (users.lookupByEmail). Rien n'est saisi.
export async function linkSlackAction(): Promise<ChannelActionResult> {
  const ctx = await requireUserContext();
  try {
    const result = await linkSlackUser(ctx);
    if (result !== 'lie') return { ok: false, error: result };
    revalidatePath('/agents');
    return { ok: true };
  } catch (error) {
    logError('canaux.slack_lier', error);
    return { ok: false, error: 'erreur' };
  }
}

export async function unlinkSlackAction(): Promise<ChannelActionResult> {
  const ctx = await requireUserContext();
  try {
    await unlinkSlackUser(ctx);
    revalidatePath('/agents');
    return { ok: true };
  } catch (error) {
    logError('canaux.slack_delier', error);
    return { ok: false, error: 'erreur' };
  }
}

// Désinstaller l'appli dans l'organisation (propriétaire ou administrateur ; la RLS le redit, admin_delete).
export async function uninstallSlackAction(): Promise<ChannelActionResult> {
  const ctx = await requireUserContext();
  try {
    const ok = await uninstallSlack(ctx);
    if (ok) revalidatePath('/agents');
    return ok ? { ok: true } : { ok: false, error: 'interdit' };
  } catch (error) {
    logError('canaux.slack_desinstaller', error);
    return { ok: false, error: 'erreur' };
  }
}
```

Une erreur de zod ne sait dire qu'un champ : l'heure et le booléen viennent de contrôles bornés de l'écran, seul le fuseau peut être faux en pratique. D'où le seul code `fuseau`.

## 13. Après le jalon 1 : le récapitulatif par e-mail

PR 07f, après 07d (`send.ts`) et 07e (préférences, langue). Files `recap-tic` et `recap-envoyer` : section 15.

Ce que dit le récapitulatif, et rien d'autre (architecture 9.12) : combien d'actions attendent, combien de chaque type sous son titre générique (`agents.kinds.<outil>.<verbe>`), combien sont parties sans clic depuis hier (après le premier cran au-dessus de `propose`), un lien vers `/agents/a-valider`. Ni paramètre, ni `summary`, ni titre de source, ni nom de client, ni nom d'espace. Un seul message par jour au plus, et seulement s'il y a quelque chose à dire (`recaps_dus`, chapitre 01).

### 13.1 Le gabarit

Sujet : `agents.recap.subject` (« Leon : 3 actions à valider ») ; `agents.recap.subjectDone` quand rien n'attend mais que des actions sont parties sans clic.

Rendu, en français (Exemple fictif : trois actions du jalon 1) :

```
Objet : Leon : 3 actions à valider

Bonjour,

3 actions de vos agents attendent votre validation :
  • 2 × Note dans HubSpot
  • 1 × Brouillon dans Outlook

[ Ouvrir « À valider » ]  → https://<domaine>/agents/a-valider

Une proposition expire au bout de sept jours. Rien n'est fait tant que vous ne validez pas.
────────────────────────────────────────────
Vous recevez ce message une fois par jour au plus, quand quelque chose vous attend.
Pour ne plus le recevoir : Agents, puis Canaux.   → https://<domaine>/agents?vue=canaux
```

Choix de forme :

- **HTML court, styles en ligne, une seule colonne de 560 px, aucune image, aucun pixel de suivi, aucun lien de désinscription en un clic.** Un lien qui coupe le récapitulatif par un GET serait une écriture sans clic sous session (architecture 9.7) ; le lien ouvre la vue « Canaux ». Ce qu'exigent les grandes messageries pour un envoi en nombre (en-tête `List-Unsubscribe`) est **à vérifier** avant d'ouvrir le récapitulatif à beaucoup de comptes.
- **Contraste** : texte `#1a1a1a`, texte secondaire `#555555` (7,5:1), pied `#666666` (5,7:1) sur blanc, au-dessus de 4,5:1 (`PRODUCT.md:77`). `#777777` serait sous le seuil.
- **Une partie texte**, pour les messageries qui n'affichent pas le HTML (champ `text` de Resend, à vérifier).
- **Les types sont rangés du plus fréquent au moins fréquent**, cinq lignes au plus ; au-delà, une ligne `… et N autres` n'est pas écrite : le total suffit.

### 13.2 `src/server/email/recap.ts` (code complet)

```ts
// src/server/email/recap.ts
import { createTranslator } from 'next-intl';
import { and, count, eq, gt, sql } from 'drizzle-orm';
import { type ActionKind, actionProvider, actionVerb } from '@/lib/actions';
import { type Locale, localeOf } from '@/i18n/request';
import { listPendingActions } from '@/server/actions/store';
import { readAgentSettings } from '@/server/agents/activation';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { readPreferencesIn } from '@/server/channels/preferences';
import { actions } from '@/server/db/schema/actions';
import { users } from '@/server/db/schema/auth';
import { messagesSortants } from '@/server/db/schema/channels';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { env } from '@/server/env';
import { escapeHtml, mailConfigured, type SendDeps, sendEmail } from './send';

// Le récapitulatif par e-mail (dossier agents, 9.12). Il ne porte que des comptes et des titres génériques : rien de
// ce qu'une action contient. Il est rebâti à l'envoi, sous les droits du moment : messages_sortants ne garde aucun
// texte. Le lien ouvre une page sous session ; rien ne s'exécute par un GET.

export const RECAP_MAX_LINES = 5;
const PENDING_READ_MAX = 200; // listPendingActions plafonne à 200 ; le total vient de count()

export type RecapCounts = {
  pending: number;
  byKind: Array<{ kind: ActionKind; count: number }>; // les plus fréquents d'abord
  doneWithoutClick: number; // décidées par l'autonomie depuis 24 heures
  actionIds: string[]; // pour messages_sortants.action_ids (200 au plus)
};

// Ce qui attend, et ce qui est parti sans clic, pour la personne du contexte. La même définition que la liste
// « À valider » (listPendingActions, chapitre 05) : le récapitulatif ne compte jamais ce que la page ne montre pas.
export async function readRecapCounts(ctx: TenantContext): Promise<RecapCounts> {
  const pending = await listPendingActions(ctx, { limit: PENDING_READ_MAX });
  const [done] = await withTenant(ctx, (tx) =>
    tx
      .select({ n: count() })
      .from(actions)
      .where(
        and(
          eq(actions.userId, ctx.userId),
          eq(actions.origine, 'agent'),
          eq(actions.decidePar, 'autonomie'),
          eq(actions.simulation, false),
          gt(actions.decidedAt, sql`now() - interval '24 hours'`),
        ),
      ),
  );
  const byKind = new Map<ActionKind, number>();
  for (const action of pending) byKind.set(action.kind, (byKind.get(action.kind) ?? 0) + 1);
  return {
    pending: pending.length,
    byKind: [...byKind]
      .map(([kind, n]) => ({ kind, count: n }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
    doneWithoutClick: done?.n ?? 0,
    actionIds: pending.map((action) => action.id),
  };
}

export type RenderedRecap = { subject: string; html: string; text: string };

type RecapMessages = Parameters<typeof createTranslator>[0]['messages'];

// Le gabarit. Pur : ni base ni réseau. `appUrl` : BETTER_AUTH_URL. Tout texte inséré dans le HTML est échappé, même
// ceux du produit (un traducteur peut écrire « < »).
export function renderRecap(input: {
  counts: RecapCounts;
  locale: Locale;
  messages: RecapMessages;
  appUrl: string;
}): RenderedRecap {
  const { counts, locale, messages } = input;
  const t = createTranslator({ locale, messages, namespace: 'agents' });
  const link = (path: string) => new URL(path, input.appUrl).toString();
  const box = link('/agents/a-valider');
  const settings = link('/agents?vue=canaux');
  const lines = counts.byKind.slice(0, RECAP_MAX_LINES).map(({ kind, count: n }) =>
    t('recap.line', {
      count: n,
      title: t(`kinds.${actionProvider(kind)}.${actionVerb(kind)}` as 'kinds.hubspot.creer_note'),
    }),
  );
  const paragraphs: string[] = [];
  if (counts.pending > 0) paragraphs.push(t('recap.intro', { count: counts.pending }));
  const done =
    counts.doneWithoutClick > 0 ? t('recap.doneIntro', { count: counts.doneWithoutClick }) : null;
  const subject =
    counts.pending > 0 ? t('recap.subject', { count: counts.pending }) : t('recap.subjectDone');
  const button = counts.pending > 0 ? t('recap.open') : t('recap.openJournal');
  const target = counts.pending > 0 ? box : link('/agents?vue=executions');

  const p = (text: string, style = '') =>
    `<p style="margin:0 0 16px${style ? `;${style}` : ''}">${escapeHtml(text)}</p>`;
  const html = [
    '<!doctype html>',
    `<html lang="${locale}"><head><meta charset="utf-8">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(subject)}</title></head>`,
    '<body style="margin:0;padding:24px;background:#ffffff;color:#1a1a1a;',
    'font:15px/1.5 -apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif">',
    '<div style="max-width:560px;margin:0 auto">',
    p(t('recap.greeting')),
    ...paragraphs.map((text) => p(text)),
    lines.length > 0
      ? `<ul style="margin:0 0 16px;padding-left:20px">${lines
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join('')}</ul>`
      : '',
    done ? p(done) : '',
    `<p style="margin:0 0 24px"><a href="${escapeHtml(target)}" style="display:inline-block;`,
    'padding:10px 16px;border-radius:8px;background:#1a1a1a;color:#ffffff;text-decoration:none">',
    `${escapeHtml(button)}</a></p>`,
    counts.pending > 0 ? p(t('recap.expiry'), 'color:#555555') : '',
    '<hr style="border:none;border-top:1px solid #dddddd;margin:24px 0">',
    p(t('recap.why'), 'color:#666666;font-size:13px'),
    `<p style="margin:0;color:#666666;font-size:13px"><a href="${escapeHtml(settings)}"`,
    ` style="color:#666666">${escapeHtml(t('recap.stop'))}</a></p>`,
    '</div></body></html>',
  ].join('');
  const text = [
    t('recap.greeting'),
    '',
    ...paragraphs,
    ...lines.map((line) => `- ${line}`),
    ...(done ? ['', done] : []),
    '',
    `${button} : ${target}`,
    ...(counts.pending > 0 ? ['', t('recap.expiry')] : []),
    '',
    '--',
    t('recap.why'),
    `${t('recap.stop')} ${settings}`,
  ].join('\n');
  return { subject, html, text };
}

// Le jour de la personne, dans son fuseau : AAAA-MM-JJ. La clé du récapitulatif porte ce jour (chapitre 01, 12).
export function localDay(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((one) => one.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Les clés de messages_sortants (unique par organisation : elles portent la personne). Fixées ici (chapitre 01, 12).
export const recapKey = (userId: string, day: string) => `recap:${userId}:${day}`;

// `eteint` : les agents sont coupés dans l'organisation (8.2) ; leurs propositions ne se valident plus.
export type RecapOutcome =
  | 'envoye'
  | 'rien'
  | 'deja'
  | 'coupe'
  | 'eteint'
  | 'parti'
  | 'adresse'
  | 'sans_mail';

type Closed = Extract<RecapOutcome, 'rien' | 'coupe' | 'eteint' | 'adresse'>;
type Prepared =
  | { kind: Closed | 'deja' | 'parti' }
  | { kind: 'envoyer'; id: string; counts: RecapCounts; email: string; locale: Locale };

async function setStatus(ctx: TenantContext, id: string, statut: 'envoye' | 'echoue') {
  await withTenant(ctx, (tx) =>
    tx
      .update(messagesSortants)
      .set({ statut, envoyeLe: statut === 'envoye' ? sql`now()` : null })
      .where(eq(messagesSortants.id, id)),
  );
}

const recapRow = (ctx: TenantContext, cle: string, actionIds: string[]) => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
  canal: 'email' as const,
  genre: 'recap' as const,
  cle,
  actionIds,
  acl: [ctx.userId],
});

// Le jour est clos sans envoi : une ligne « echoue » sous la clé du jour local. recaps_dus (chapitre 01) ne rend
// plus la personne avant son prochain minuit local : sans cette ligne, elle reviendrait à chaque tic (toutes les
// 15 minutes), et 200 personnes dans ce cas, en tête de l'ordre de recaps_dus, priveraient tout le monde de
// récapitulatif. Une ligne déjà là (envoyée, ou en cours) ne change pas.
async function closeDay(tx: Tx, ctx: TenantContext, cle: string): Promise<void> {
  await tx
    .insert(messagesSortants)
    .values({ ...recapRow(ctx, cle, []), statut: 'echoue' })
    .onConflictDoNothing({ target: [messagesSortants.tenantId, messagesSortants.cle] });
}

// La ligne de messages_sortants d'abord, sous les droits de la personne : recaps_dus ne la rend plus aujourd'hui,
// et un second job du même jour trouve la clé. Une ligne « echoue » (Resend a refusé, ou jour clos sans envoi) est
// reprise, par une mise à jour conditionnelle : de deux jobs concurrents, un seul la repasse « en-file ». Une ligne
// « en-file » n'est jamais reprise : un autre job l'envoie, ou un job est tombé entre la réservation et l'envoi (le
// récapitulatif du jour est alors perdu ; celui du lendemain le dit).
async function claimRecap(
  tx: Tx,
  ctx: TenantContext,
  cle: string,
  actionIds: string[],
): Promise<string | null> {
  const [inserted] = await tx
    .insert(messagesSortants)
    .values(recapRow(ctx, cle, actionIds))
    .onConflictDoNothing({ target: [messagesSortants.tenantId, messagesSortants.cle] })
    .returning({ id: messagesSortants.id });
  if (inserted) return inserted.id;
  const [reclaimed] = await tx
    .update(messagesSortants)
    .set({ statut: 'en-file' })
    .where(
      and(
        eq(messagesSortants.tenantId, ctx.tenantId),
        eq(messagesSortants.cle, cle),
        eq(messagesSortants.statut, 'echoue'),
      ),
    )
    .returning({ id: messagesSortants.id });
  return reclaimed?.id ?? null;
}

// Le job recap-envoyer. Rebâtit le contexte (sans includeFormer) ; recompte ; écrit sa ligne ; envoie hors de toute
// transaction. Toute issue sans envoi, la personne présente, clôt le jour (closeDay). Lève si Resend refuse : la
// ligne passe « echoue », et le worker remet le job à plus tard (15.5), qui la reprend.
export async function sendRecap(
  job: { tenantId: string; userId: string },
  deps: SendDeps & { now?: () => Date } = {},
): Promise<RecapOutcome> {
  if (!mailConfigured()) return 'sans_mail';
  const ctx = await resolveTenantContext(job.userId, job.tenantId);
  if (!ctx) return 'parti';
  const counts = await readRecapCounts(ctx);
  const prepared = await withTenant(ctx, async (tx): Promise<Prepared> => {
    const preferences = await readPreferencesIn(tx, ctx);
    const day = localDay((deps.now ?? (() => new Date()))(), preferences.timeZone);
    const cle = recapKey(ctx.userId, day);
    const close = async (kind: Closed): Promise<Prepared> => {
      await closeDay(tx, ctx, cle);
      return { kind };
    };
    if (counts.pending === 0 && counts.doneWithoutClick === 0) return close('rien');
    if (!preferences.recapEmail) return close('coupe');
    if (!(await readAgentSettings(tx, ctx)).enabled) return close('eteint');
    const [person] = await tx
      .select({ email: users.email, verified: users.emailVerified, locale: users.locale })
      .from(users)
      .where(eq(users.id, ctx.userId));
    if (!person) return { kind: 'parti' };
    // Une adresse que la personne n'a pas prouvée ne reçoit rien de Leon hors des e-mails de compte.
    if (!person.verified) return close('adresse');
    const id = await claimRecap(tx, ctx, cle, counts.actionIds);
    if (!id) return { kind: 'deja' };
    return {
      kind: 'envoyer',
      id,
      counts,
      email: person.email,
      locale: localeOf(person.locale ?? undefined),
    };
  });
  if (prepared.kind !== 'envoyer') return prepared.kind;
  const messages = (await import(`../../../messages/${prepared.locale}.json`)).default;
  const mail = renderRecap({
    counts: prepared.counts,
    locale: prepared.locale,
    messages,
    appUrl: env.BETTER_AUTH_URL,
  });
  try {
    await sendEmail({ to: prepared.email, ...mail }, deps);
  } catch (error) {
    await setStatus(ctx, prepared.id, 'echoue');
    throw error;
  }
  await setStatus(ctx, prepared.id, 'envoye');
  return 'envoye';
}
```

À savoir :

- **Aucun appel réseau dans une transaction** : la lecture et la ligne d'abord (`withTenant`), l'envoi ensuite, puis le statut.
- **Au plus un récapitulatif par jour local.** Deux jobs du même jour (la file `recap-envoyer` tourne à deux à la fois, et `singletonKey` n'est pas garanti sur une file `standard`, 15.1) : le second trouve la ligne `en-file` et rend `deja`. Une panne entre l'envoi et `setStatus` laisse la ligne `en-file` : la reprise rend `deja`, rien n'est envoyé deux fois. Une panne entre la réservation et l'envoi perd le récapitulatif du jour, le lendemain le rattrape. Seul double possible : un envoi que Resend a fait mais dont la réponse n'est pas arrivée (délai de 10 s), compté `echoue` et repris.
- **Toute issue sans envoi clôt le jour** (`rien`, `coupe`, `eteint`, `adresse`) : une ligne `echoue` sous la clé du jour, que `recaps_dus` voit (son `not exists` ne regarde pas le statut). Sans elle, une adresse non vérifiée, que `recaps_dus` rend (il ne lit pas `email_verified`), reviendrait à chaque tic. Seul `parti` n'écrit rien : sans contexte, aucune ligne privée ne peut s'écrire, et `recaps_dus` ne rend déjà plus un ancien membre. Proposé au chapitre 01 : ajouter `and u.email_verified` à `recaps_dus` (écart 22) ; ce code reste juste avec ou sans.
- **`recaps_dus` a déjà filtré** (membre, compte non supprimé, heure passée, rien écrit aujourd'hui) ; `sendRecap` revérifie ce qui peut avoir changé entre le tic et le job (préférences, contexte, agents coupés, ce qui attend).
- **`readRecapCounts` lit `listPendingActions`** : 200 lignes au plus. Au-delà, `pending` vaut 200 et le sujet dit 200. Une personne qui a plus de 200 propositions en attente a un autre problème ; le tableau de bord le montre.
- **Pas de nom d'espace.** Une personne membre de deux espaces reçoit deux récapitulatifs semblables ; le lien ouvre l'espace actif de sa session (section 19).
- **`decidePar` et `decidedAt`** : colonnes de 0080 (`decide_par`) et de 0037 (`decided_at`), déclarées dans `schema/actions.ts` (chapitre 01, 14.4).

## 14. Après le jalon 1 : l'appli Slack

PR 07g (installation, liaison, manifeste, variables) puis 07h (messages, clics). Après la migration 0084. Déclencheur : le même que le récapitulatif (architecture 14.3).

### 14.1 Ce que fait l'appli, et ce qu'elle ne fait pas

| Fait | Ne fait pas |
|---|---|
| S'installe une fois par espace Leon, par un propriétaire ou un administrateur (OAuth de Slack, jeton de bot `xoxb-`) | Lire Slack : le connecteur `slack` existant (Pipedream, jeton de la personne) reste seul à lire (architecture E10, Q6) |
| Trouve le compte Slack d'une personne par son adresse vérifiée (`users.lookupByEmail`), à sa demande | Laisser saisir un identifiant Slack (architecture 9.12, point 4) |
| Écrit à la personne, en message direct : l'agent, le nombre d'actions, leurs titres génériques, des boutons | Publier dans un canal ; porter un paramètre, un `summary`, un nom de client (9.12, points 1 et 3) |
| Reçoit un clic, vérifie la signature, met un job `canal-clic`, répond en moins de 3 secondes (note 06, 5) | Valider une action d'enjeu autre que `bas` ou de public autre que `soi` (`validatesFromChannel`, section 4.1) |
| Répond dans le fil du message : « Validée : c'est fait. », « Déjà décidée. »… | Exécuter quoi que ce soit dans la route : tout passe par le worker et `decideAction` |

Pas de souscription aux événements, pas de `chat:write.public`, pas d'`app_mentions:read` : la note 06 les mettait dans son exemple de manifeste, l'appli n'en a pas l'usage (écart 9). Une appli qui ne demande que `chat:write`, `im:write`, `users:read` et `users:read.email` n'a aucune portée « à risque » au sens de la revue de Slack (note 06, 5).

### 14.2 Variables et `slackConfigured()`

`src/server/env.ts` (existe), à côté des variables OAuth (`:38-41`) :

```ts
    // L'appli Slack de Leon (dossier agents, chapitre 07) : installation, messages directs, clics. Les trois, ou
    // aucune : sans elles, la vue Canaux masque Slack et la route des clics répond 404.
    LEON_SLACK_CLIENT_ID: z.preprocess(emptyIsAbsent, z.string().min(1).optional()),
    LEON_SLACK_CLIENT_SECRET: z.preprocess(emptyIsAbsent, z.string().min(1).optional()),
    LEON_SLACK_SIGNING_SECRET: z.preprocess(emptyIsAbsent, z.string().min(1).optional()),
```

`.env.example` (existe ; `env-contract.test.ts` le compare au schéma) :

```bash
# L'appli Slack de Leon (messages directs et boutons de validation ; après le jalon 1 des agents). Créée à partir du
# manifeste de docs/guides/slack-manifeste.yml. Le jeton du bot est chiffré par LEON_CONNECTORS_KEY.
LEON_SLACK_CLIENT_ID=
LEON_SLACK_CLIENT_SECRET=
LEON_SLACK_SIGNING_SECRET=
```

Service (chapitre 13, variables) : `web` pour l'installation et les clics ; `worker` pour écrire (il lit le jeton en base et le déchiffre par `LEON_CONNECTORS_KEY`) et pour `slackConfigured()`.

### 14.3 Le manifeste

Fichier : `docs/guides/slack-manifeste.yml` (à créer), recopié à la main dans l'écran de création d'appli de Slack (« From an app manifest »). `<domaine>` est celui de `BETTER_AUTH_URL`. Champs repris de la note 06 (5, « Manifeste d'application ») ; leur nom exact est **à vérifier contre la référence** (`https://docs.slack.dev/reference/app-manifest/`) avant import, comme la note le dit.

```yaml
# Leon : l'appli Slack qui écrit à chacun en message direct (dossier agents, chapitre 07). Rien d'autre : pas
# d'événements, pas de canal, pas de lecture. À vérifier contre la référence avant import.
display_information:
  name: Leon
  description: Vous prévient quand des actions de vos agents attendent votre validation.
features:
  bot_user:
    display_name: Leon
    always_online: false
  app_home:
    home_tab_enabled: false
    messages_tab_enabled: true
    # Personne n'écrit au bot : il n'écoute rien.
    messages_tab_read_only_enabled: true
oauth_config:
  redirect_urls:
    - https://<domaine>/api/v1/slack/installation/retour
  scopes:
    bot:
      - chat:write
      - im:write
      - users:read
      - users:read.email
settings:
  interactivity:
    is_enabled: true
    request_url: https://<domaine>/api/v1/slack/interactions
  org_deploy_enabled: false
  socket_mode_enabled: false
  # Un jeton qui tourne demande de stocker et renouveler un jeton de rafraîchissement : pas au premier pas.
  token_rotation_enabled: false
```

`src/server/slack/manifest.ts` (à créer ; ajout à l'arborescence) tient les portées une seule fois, pour l'URL d'installation et pour le test qui relit le YAML :

```ts
// src/server/slack/manifest.ts
import { env } from '@/server/env';

// Les portées du bot de Leon : les mêmes dans docs/guides/slack-manifeste.yml (manifest.test.ts les compare) et dans
// l'URL d'installation (install.ts). Note 06, 5 : chat:write pour écrire, im:write pour ouvrir un message direct,
// users:read et users:read.email pour trouver une personne par son adresse.
export const SLACK_BOT_SCOPES = ['chat:write', 'im:write', 'users:read', 'users:read.email'] as const;

// Les deux chemins que le manifeste déclare. Montés sous /api/v1 (app.ts).
export const SLACK_INSTALL_RETURN_PATH = '/api/v1/slack/installation/retour';
export const SLACK_INTERACTIONS_PATH = '/api/v1/slack/interactions';

// L'appli est-elle réglée ? Les trois variables, et la clé qui chiffre le jeton du bot.
export const slackConfigured = (): boolean =>
  Boolean(
    env.LEON_SLACK_CLIENT_ID &&
      env.LEON_SLACK_CLIENT_SECRET &&
      env.LEON_SLACK_SIGNING_SECRET &&
      env.LEON_CONNECTORS_KEY,
  );
```

Pourquoi pas l'adresse de retour de la note 06 (`/api/v1/connexions/oauth/slack/retour`) : elle tombe dans `createOAuthRoutes` (`app.ts:48`, `GET /:app/retour`), qui la prendrait pour une appli de connecteur. L'installation a ses routes, sous `/api/v1/slack/` (écart 8).

### 14.4 `src/server/slack/client.ts` (code complet)

```ts
// src/server/slack/client.ts
import { z } from 'zod';

// L'API Web de Slack par fetch, sans SDK (note 06, 5) : https://slack.com/api/<méthode>, en POST, jeton en
// Authorization: Bearer. Slack répond 200 même en cas d'échec : on lit toujours `ok` et `error`. Aucune erreur ne
// cite le corps de la réponse ; seulement la méthode et un code de la liste fermée.

export const SLACK_API = 'https://slack.com/api/';
const TIMEOUT_MS = 10_000;

// Les codes que le code distingue (note 06 : not_in_channel, channel_not_found, ratelimited ; les autres sont à
// vérifier dans la documentation de l'éditeur). Tout autre code devient « autre ».
export const SLACK_ERRORS = [
  'users_not_found',
  'ratelimited',
  'invalid_auth',
  'not_authed',
  'account_inactive',
  'token_revoked',
  'channel_not_found',
  'not_in_channel',
  'invalid_code',
  'bad_redirect_uri',
] as const;
export type SlackErrorCode = (typeof SLACK_ERRORS)[number] | 'http' | 'forme' | 'autre';

// Les codes qui disent que le jeton du bot ne vaut plus rien (appli retirée de l'espace Slack, jeton révoqué) : aucune
// reprise n'y changera rien. L'installation est marquée invalide (markSlackInvalid, install.ts), plus rien ne part, et
// la vue Canaux le dit. Liste à vérifier dans la documentation de l'éditeur.
export const SLACK_DEAD_TOKEN: readonly SlackErrorCode[] = [
  'invalid_auth',
  'not_authed',
  'account_inactive',
  'token_revoked',
];
export const isDeadToken = (error: unknown): boolean =>
  error instanceof SlackApiError && SLACK_DEAD_TOKEN.includes(error.code);

export class SlackApiError extends Error {
  constructor(
    readonly method: string,
    readonly code: SlackErrorCode,
    readonly retryAfterMs: number | null = null,
  ) {
    super(`Slack ${method} failed (${code})`);
    this.name = 'SlackApiError';
  }
}

export type SlackDeps = { fetchImpl?: typeof fetch };

// Les identifiants Slack, bornés comme en base (0084) : des lettres et des chiffres, 40 au plus.
export const SlackIdSchema = z.string().regex(/^[A-Za-z0-9]{1,40}$/);
// L'horodatage d'un message, qui lui sert d'identifiant : « 1700000000.000200 » (note 06).
export const SlackTsSchema = z.string().regex(/^\d{1,12}\.\d{1,8}$/);

const OkSchema = z.looseObject({ ok: z.boolean(), error: z.string().max(100).optional() });

const codeOf = (error: string | undefined): SlackErrorCode =>
  SLACK_ERRORS.find((known) => known === error) ?? 'autre';

async function call<T extends z.ZodType>(
  method: string,
  token: string | null,
  body: { json: unknown } | { form: Record<string, string> },
  schema: T,
  deps: SlackDeps,
): Promise<z.infer<T>> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: string;
  if ('json' in body) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    payload = JSON.stringify(body.json);
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(body.form).toString();
  }
  const response = await (deps.fetchImpl ?? fetch)(`${SLACK_API}${method}`, {
    method: 'POST',
    headers,
    body: payload,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 429) {
    // Retry-After en secondes : à vérifier dans la documentation de l'éditeur.
    const seconds = Number(response.headers.get('retry-after'));
    throw new SlackApiError(method, 'ratelimited', Number.isFinite(seconds) ? seconds * 1000 : null);
  }
  if (!response.ok) throw new SlackApiError(method, 'http');
  const data: unknown = await response.json().catch(() => null);
  const head = OkSchema.safeParse(data);
  if (!head.success) throw new SlackApiError(method, 'forme');
  if (!head.data.ok) throw new SlackApiError(method, codeOf(head.data.error));
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new SlackApiError(method, 'forme');
  return parsed.data;
}

// Une méthode qui prend du JSON (chat.postMessage, chat.update : note 06).
export const slackJson = <T extends z.ZodType>(
  method: string,
  token: string,
  json: unknown,
  schema: T,
  deps: SlackDeps = {},
) => call(method, token, { json }, schema, deps);

// Une méthode qui prend un formulaire (users.lookupByEmail, oauth.v2.access : à vérifier dans la documentation de
// l'éditeur ; le formulaire est accepté par toutes les méthodes de l'API Web, le JSON non).
export const slackForm = <T extends z.ZodType>(
  method: string,
  token: string | null,
  form: Record<string, string>,
  schema: T,
  deps: SlackDeps = {},
) => call(method, token, { form }, schema, deps);
```

### 14.5 `src/server/slack/install.ts` : installer, lire le jeton, désinstaller

Routes montées dans `src/server/api/app.ts` (existe) : `app.route('/v1/slack', slackInstallRoutes)`. Deux routes. `POST /api/v1/slack/installation` (le formulaire de la vue Canaux) est sous `requireSession` : sans session, 401, et `route-guards.db.test.ts` la garde comme les autres. `GET /api/v1/slack/installation/retour` (le retour de Slack) est une navigation du navigateur, peut-être longtemps après le départ chez Slack : sans session, elle renvoie vers `/sign-in` (303) plutôt qu'un JSON 401 que l'administrateur lirait brut, comme le retour des connecteurs (`oauth-routes.ts:184`, `:226`). Elle entre donc dans `PUBLIC` de `route-guards.db.test.ts` : `/^\/api\/v1\/slack\/installation\/retour$/`, avec ce commentaire : « le retour de l'installation de l'appli Slack : la session, sinon renvoi vers /sign-in ; lié à un cookie signé et à la même session (install.db.test.ts) ». Même forme que `createOAuthRoutes` (`src/server/connectors/oauth-routes.ts`, existe) : `csrf` sur le formulaire, un cookie signé de 10 minutes (modèle : `oauth-cookie.ts`), le `state` comparé en temps constant, et un retour qui ne dit qu'un code.

Deux ajouts à la migration 0084 (chapitre 01, pas encore appliquée), proposés ici (écart 22), dont ce fichier dépend :

```sql
-- installations_slack : l'installation dont le jeton ne vaut plus rien (appli retirée côté Slack, jeton révoqué).
-- Posée par le worker, qui n'est pas administrateur : par marquer_slack_invalide seulement. Remise à nul par une
-- réinstallation (admin_update, donc le grant).
alter table installations_slack add column invalide_le timestamptz;
grant update (team_id, bot_token, bot_user_id, installe_par, invalide_le) on installations_slack to leon_app;

create function marquer_slack_invalide()
returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update installations_slack set invalide_le = now()
   where tenant_id = app_tenant() and invalide_le is null
$$;
revoke all on function marquer_slack_invalide() from public;
grant execute on function marquer_slack_invalide() to leon_app;

-- Délie tous les comptes Slack de l'organisation courante : à la désinstallation, et à une réinstallation dans un
-- autre espace Slack, où les identifiants de l'ancien ne désignent plus personne (ou un inconnu). Propriétaire ou
-- administrateur seulement ; zéro sinon. slack (la préférence) ne change pas : la personne relie son compte d'un clic.
create function delier_slack_organisation()
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_n integer;
begin
  if app_tenant() is null or not app_est_admin() then
    return 0;
  end if;
  update preferences_canaux set slack_user_id = null
   where tenant_id = app_tenant() and slack_user_id is not null;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;
revoke all on function delier_slack_organisation() from public;
grant execute on function delier_slack_organisation() to leon_app;
```

Le schéma Drizzle (`installationsSlack`, chapitre 01, 14.3) gagne `invalideLe: at('invalide_le')`.

Points de Slack **à vérifier dans la documentation de l'éditeur** (aucune note ne les a lus) : l'adresse d'autorisation `https://slack.com/oauth/v2/authorize` et ses paramètres `client_id`, `scope`, `redirect_uri`, `state` ; la méthode `oauth.v2.access` (`client_id`, `client_secret`, `code`, `redirect_uri`) et sa réponse (`access_token`, `bot_user_id`, `team.id`) ; le paramètre `error=access_denied` d'un refus ; `auth.revoke`.

```ts
// src/server/slack/install.ts
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { csrf } from 'hono/csrf';
import { z } from 'zod';
import type { InstallReturn } from '@/lib/agents';
import { requireSession, type SessionEnv } from '@/server/api/session-routes';
import { auth } from '@/server/auth/auth';
import { canInvite } from '@/server/auth/members';
import { resolveSessionContext, type TenantContext } from '@/server/auth/tenant-context';
import { decryptSecret, encryptSecret } from '@/server/connectors/crypto';
import { installationsSlack } from '@/server/db/schema/channels';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import { SlackApiError, SlackIdSchema, slackForm } from './client';
import { SLACK_BOT_SCOPES, SLACK_INSTALL_RETURN_PATH, slackConfigured } from './manifest';

// L'appli Slack de Leon dans un espace : l'installer (un propriétaire ou un administrateur), lire son jeton (le code
// seul : installations_slack est lisible de toute l'organisation, comme connections, et c'est ce module qui réserve
// la lecture du jeton), la marquer invalide, la désinstaller. Seul ce fichier lit bot_token (slack-token.test.ts,
// section 16). Les codes de retour (INSTALL_RETURNS) sont dans src/lib/agents.ts, que l'écran lit aussi.

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize'; // à vérifier
const COOKIE = 'leon_slack';
const COOKIE_PATH = '/api/v1/slack/installation';
const COOKIE_MAX_AGE = 600; // secondes, comme oauth-cookie.ts

// L'AAD du jeton chiffré : il ne se déchiffre que pour l'organisation qui l'a installé.
export const botTokenAad = (tenantId: string) => `installations_slack:${tenantId}`;

type Pending = { tenantId: string; userId: string; state: string; createdAt: number };
const PendingSchema = z.object({
  tenantId: z.uuid(),
  userId: z.uuid(),
  state: z.string().min(32).max(64),
  createdAt: z.number(),
});
const sign = (body: string) =>
  createHmac('sha256', env.BETTER_AUTH_SECRET).update(`slack:${body}`).digest('base64url');

export function sealInstall(pending: Pending): string {
  const body = Buffer.from(JSON.stringify(pending)).toString('base64url');
  return `${body}.${sign(body)}`;
}

// null : signature fausse, contenu illisible, ou plus de 10 minutes.
export function openInstall(cookie: string, now: number): Pending | null {
  const [body, signature, ...rest] = cookie.split('.');
  if (!body || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = PendingSchema.safeParse(value);
  if (!parsed.success) return null;
  const age = now - parsed.data.createdAt;
  return age >= 0 && age <= COOKIE_MAX_AGE * 1000 ? parsed.data : null;
}

const sameText = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const back = (code: InstallReturn) => `/agents?vue=canaux&slack=${code}`;

const AccessSchema = z.looseObject({
  access_token: z.string().startsWith('xoxb-').max(400),
  bot_user_id: SlackIdSchema,
  team: z.looseObject({ id: SlackIdSchema }),
});

export type Installation = { teamId: string; botUserId: string; token: string };

// Le jeton du bot de l'organisation du contexte, déchiffré ; null sans installation, ou si elle est invalide.
export async function readInstallation(tx: Tx, ctx: TenantContext): Promise<Installation | null> {
  const [row] = await tx
    .select({
      teamId: installationsSlack.teamId,
      botUserId: installationsSlack.botUserId,
      botToken: installationsSlack.botToken,
    })
    .from(installationsSlack)
    .where(
      and(eq(installationsSlack.tenantId, ctx.tenantId), isNull(installationsSlack.invalideLe)),
    );
  if (!row) return null;
  return {
    teamId: row.teamId,
    botUserId: row.botUserId,
    token: decryptSecret(row.botToken, botTokenAad(ctx.tenantId)),
  };
}

// La vue « Canaux » : l'installation sans son jeton.
export async function readInstallationSummary(
  tx: Tx,
  ctx: TenantContext,
): Promise<{ teamId: string; createdAt: string; invalid: boolean } | null> {
  const [row] = await tx
    .select({
      teamId: installationsSlack.teamId,
      creeLe: installationsSlack.creeLe,
      invalideLe: installationsSlack.invalideLe,
    })
    .from(installationsSlack)
    .where(eq(installationsSlack.tenantId, ctx.tenantId));
  return row
    ? { teamId: row.teamId, createdAt: row.creeLe.toISOString(), invalid: row.invalideLe !== null }
    : null;
}

// Slack a dit que le jeton ne vaut plus rien (isDeadToken, client.ts) : sous n'importe quel contexte de
// l'organisation, administrateur ou non (marquer_slack_invalide, 0084). Plus rien ne part ; la vue Canaux le dit ; une
// réinstallation remet invalide_le à nul. Ne lève pas : l'appelant a déjà une erreur à traiter.
export async function markSlackInvalid(ctx: TenantContext): Promise<void> {
  logError('slack.installation_invalide', new Error('Slack token rejected'), { tenantId: ctx.tenantId });
  await withTenant(ctx, (tx) => tx.execute(sql`select marquer_slack_invalide()`)).catch((error) =>
    logError('slack.installation_invalide', error, { tenantId: ctx.tenantId }),
  );
}

type Deps = { fetchImpl?: typeof fetch; now?: () => number };

export function createSlackInstallRoutes(deps: Deps = {}) {
  const now = deps.now ?? Date.now;
  const routes = new Hono<SessionEnv>();
  const sameOrigin = csrf({ origin: new URL(env.BETTER_AUTH_URL).origin });
  const smallForm = bodyLimit({ maxSize: 4 * 1024, onError: (c) => c.text('', 413) });

  // Le formulaire de la vue Canaux : vers Slack, avec un state lié à la personne et à l'organisation.
  routes.post('/installation', sameOrigin, smallForm, requireSession, async (c) => {
    const ctx = c.get('ctx');
    if (!slackConfigured()) return c.redirect(back('refuse'), 303);
    if (!(await canInvite(ctx))) return c.redirect(back('interdit'), 303);
    const state = randomBytes(32).toString('base64url');
    setCookie(c, COOKIE, sealInstall({ ...ctxIds(ctx), state, createdAt: now() }), {
      path: COOKIE_PATH,
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      secure: env.BETTER_AUTH_URL.startsWith('https:'),
      sameSite: 'Lax',
    });
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', env.LEON_SLACK_CLIENT_ID ?? '');
    url.searchParams.set('scope', SLACK_BOT_SCOPES.join(','));
    url.searchParams.set('redirect_uri', new URL(SLACK_INSTALL_RETURN_PATH, env.BETTER_AUTH_URL).toString());
    url.searchParams.set('state', state);
    return c.redirect(url.toString(), 303);
  });

  // Le retour de Slack : la même session, le même state, puis l'échange du code contre le jeton du bot. Pas de
  // requireSession : une navigation sans session (expirée pendant la visite chez Slack) va vers /sign-in, pas vers un
  // JSON 401. Route publique de route-guards.db.test.ts, pour cette raison seulement.
  routes.get('/installation/retour', async (c) => {
    const cookie = getCookie(c, COOKIE);
    deleteCookie(c, COOKIE, { path: COOKIE_PATH });
    const ctx = await sessionContext(c.req.raw.headers);
    if (!ctx) return c.redirect('/sign-in', 303);
    const pending = cookie ? openInstall(cookie, now()) : null;
    const state = c.req.query('state') ?? '';
    if (!pending || pending.userId !== ctx.userId || pending.tenantId !== ctx.tenantId) {
      return c.redirect(back('expire'), 303);
    }
    if (!sameText(pending.state, state)) return c.redirect(back('expire'), 303);
    if (c.req.query('error')) return c.redirect(back('annule'), 303);
    const code = c.req.query('code');
    if (!code || code.length > 300) return c.redirect(back('refuse'), 303);
    return c.redirect(back(await finishInstall(ctx, code, deps)), 303);
  });

  return routes;
}

const ctxIds = (ctx: TenantContext) => ({ tenantId: ctx.tenantId, userId: ctx.userId });

// La session de la requête, résolue comme requireSession (session-routes.ts:30-36) et sessionContext de
// oauth-routes.ts:100-104 ; null au lieu d'un 401.
async function sessionContext(headers: Headers): Promise<TenantContext | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  return resolveSessionContext(session.user.id, session.session.activeOrganizationId ?? null);
}

async function finishInstall(ctx: TenantContext, code: string, deps: Deps): Promise<InstallReturn> {
  if (!(await canInvite(ctx))) return 'interdit';
  let access: z.infer<typeof AccessSchema>;
  try {
    access = await slackForm(
      'oauth.v2.access',
      null,
      {
        client_id: env.LEON_SLACK_CLIENT_ID ?? '',
        client_secret: env.LEON_SLACK_CLIENT_SECRET ?? '',
        code,
        redirect_uri: new URL(SLACK_INSTALL_RETURN_PATH, env.BETTER_AUTH_URL).toString(),
      },
      AccessSchema,
      deps,
    );
  } catch (error) {
    if (!(error instanceof SlackApiError)) logError('slack.installation', error);
    return 'refuse';
  }
  const values = {
    teamId: access.team.id,
    botToken: encryptSecret(access.access_token, botTokenAad(ctx.tenantId)),
    botUserId: access.bot_user_id,
    installePar: ctx.userId,
    invalideLe: null, // une réinstallation répare une installation invalide
  };
  try {
    await withTenant(ctx, async (tx) => {
      const [before] = await tx
        .select({ teamId: installationsSlack.teamId })
        .from(installationsSlack)
        .where(eq(installationsSlack.tenantId, ctx.tenantId));
      await tx
        .insert(installationsSlack)
        .values({ tenantId: ctx.tenantId, ...values })
        .onConflictDoUpdate({ target: installationsSlack.tenantId, set: values });
      // Un autre espace Slack : les comptes liés dans l'ancien ne désignent plus personne ici.
      if (before && before.teamId !== values.teamId) {
        await tx.execute(sql`select delier_slack_organisation()`);
      }
    });
    return 'installe';
  } catch (error) {
    // team_id est unique : cet espace Slack est déjà installé dans une autre organisation de Leon.
    if ((error as { cause?: { code?: string } }).cause?.code === '23505') return 'autre_espace';
    logError('slack.installation', error);
    return 'refuse';
  }
}

export const slackInstallRoutes = createSlackInstallRoutes();

// Désinstaller : un propriétaire ou un administrateur (admin_delete, 0084). Le jeton d'une installation valide est
// d'abord révoqué chez Slack, sans bloquer (auth.revoke : à vérifier) ; la ligne part ensuite, invalide ou non, et
// les comptes liés sont déliés : la prochaine installation peut être un autre espace Slack, et rien ne dit lequel.
// compte_slack ne rend plus personne : les anciens boutons ne valident plus rien.
export async function uninstallSlack(ctx: TenantContext, deps: Deps = {}): Promise<boolean> {
  if (!(await canInvite(ctx))) return false;
  const installation = await withTenant(ctx, (tx) => readInstallation(tx, ctx));
  if (installation) {
    await slackForm('auth.revoke', installation.token, {}, z.looseObject({}), deps).catch((error) =>
      logError('slack.desinstallation_revocation', error),
    );
  }
  return withTenant(ctx, async (tx) => {
    const removed = await tx
      .delete(installationsSlack)
      .where(eq(installationsSlack.tenantId, ctx.tenantId))
      .returning({ tenantId: installationsSlack.tenantId });
    await tx.execute(sql`select delier_slack_organisation()`);
    return removed.length > 0 || installation === null;
  });
}
```

À savoir :

- **Pas de PKCE** : l'OAuth d'une appli Slack se fait avec le secret client, côté serveur (à vérifier) ; le `state` lié à la session et au cookie signé suffit contre le détournement du retour, comme pour les connecteurs.
- **Réinstaller** (nouvelles portées, autre administrateur, installation invalide) refait la ligne en place (`onConflictDoUpdate` sur `tenant_id`) ; le `grant update` de 0084, élargi à `invalide_le`, le permet. Dans le même espace Slack, les comptes liés restent ; dans un autre (`team_id` différent), `delier_slack_organisation` les délie, et chacun relie le sien d'un clic.
- **Le départ de l'administrateur qui a installé ne désinstalle rien.** `installe_par … on delete cascade` (0084) ne joue que si la ligne `"user"` est supprimée. Or la suppression d'un compte est douce (`deleted_at`, adresse effacée : `src/server/auth/delete-account.ts:198-205`) ; la ligne n'est supprimée que pour une inscription ratée (`sign-up.ts:133`, `:164`) ou avec l'organisation entière (`delete-account.ts:146`), dont l'installation part de toute façon (`tenant_id … on delete cascade`). Le jeton est celui du bot, pas celui de l'administrateur : il continue de valoir.
- **Une installation invalide** (`invalide_le` posé par `markSlackInvalid`, appelé par le worker sur un code de `SLACK_DEAD_TOKEN`) : `readInstallation` ne la rend plus, donc plus rien ne part, ni message ni réponse à un clic ; la vue Canaux le dit à tous et propose à un administrateur de réinstaller ou de désinstaller.
- **`readInstallation` déchiffre dans une transaction** : `decryptSecret` est local (AES-GCM), sans réseau ; l'appel à Slack se fait après.

### 14.6 `src/server/slack/link.ts` : `linkSlackUser` (code complet)

`users.lookupByEmail` : nommé par l'architecture (9.12, point 4) et par la note 06 (portée `users:read.email`, « [MEM] ») ; sa forme exacte (paramètre `email`, réponse `user.id`, champs `deleted` et `is_bot`) est **à vérifier dans la documentation de l'éditeur**.

```ts
// src/server/slack/link.ts
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import { preferencesCanaux } from '@/server/db/schema/channels';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { isDeadToken, SlackApiError, type SlackDeps, SlackIdSchema, slackForm } from './client';
import { markSlackInvalid, readInstallation } from './install';

// Lier le compte Slack d'une personne (architecture 9.12, point 4) : Leon le cherche, avec le jeton du bot, par
// l'adresse vérifiée du compte Leon. Rien n'est saisi. L'écriture passe par lier_slack (0084), seule à pouvoir poser
// slack_user_id : un membre ne peut pas s'attribuer le compte d'un collègue.

export const LINK_RESULTS = ['lie', 'adresse', 'inconnu', 'pris', 'installation', 'slack'] as const;
export type LinkResult = (typeof LINK_RESULTS)[number];

const LookupSchema = z.looseObject({
  user: z.looseObject({
    id: SlackIdSchema,
    deleted: z.boolean().optional(),
    is_bot: z.boolean().optional(),
  }),
});

export async function linkSlackUser(ctx: TenantContext, deps: SlackDeps = {}): Promise<LinkResult> {
  const read = await withTenant(ctx, async (tx) => ({
    installation: await readInstallation(tx, ctx),
    person: (
      await tx
        .select({ email: users.email, verified: users.emailVerified })
        .from(users)
        .where(eq(users.id, ctx.userId))
    )[0],
  }));
  if (!read.installation) return 'installation';
  // Une adresse non prouvée pourrait être celle d'un autre : elle ne désigne aucun compte Slack.
  if (!read.person?.verified) return 'adresse';
  let slackUserId: string;
  try {
    const found = await slackForm(
      'users.lookupByEmail',
      read.installation.token,
      { email: read.person.email },
      LookupSchema,
      deps,
    );
    if (found.user.deleted || found.user.is_bot) return 'inconnu';
    slackUserId = found.user.id;
  } catch (error) {
    if (error instanceof SlackApiError && error.code === 'users_not_found') return 'inconnu';
    if (isDeadToken(error)) {
      await markSlackInvalid(ctx);
      return 'installation';
    }
    logError('slack.lier', error);
    return 'slack';
  }
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ ok: boolean }>(sql`select lier_slack(${slackUserId}) as ok`);
    // Faux : ce compte Slack est déjà lié à une autre personne de l'organisation (index unique).
    if (rows[0]?.ok !== true) return 'pris';
    // Lier, c'est vouloir Slack : compte_slack exige slack = vrai (0084).
    await tx
      .update(preferencesCanaux)
      .set({ slack: true })
      .where(
        and(eq(preferencesCanaux.tenantId, ctx.tenantId), eq(preferencesCanaux.userId, ctx.userId)),
      );
    return 'lie';
  });
}

// Délier : plus aucun message, et un ancien bouton ne valide plus rien (compte_slack ne rend plus la personne).
export async function unlinkSlackUser(ctx: TenantContext): Promise<void> {
  await withTenant(ctx, async (tx) => {
    await tx.execute(sql`select lier_slack(null)`);
    await tx
      .update(preferencesCanaux)
      .set({ slack: false })
      .where(
        and(eq(preferencesCanaux.tenantId, ctx.tenantId), eq(preferencesCanaux.userId, ctx.userId)),
      );
  });
}
```

L'adresse du compte Leon part chez Slack, dans l'espace Slack de la même société, pour y trouver la même personne. C'est le seul usage de l'adresse hors des e-mails de compte ; il est fait à la demande de la personne (bouton « Lier mon compte Slack »).

### 14.7 `src/server/slack/post.ts` : le message direct et ses boutons (code complet)

Block Kit d'après la note 06 (5, « Boutons et interactivité ») : un bloc `section`, un bloc `actions` aux éléments `button` (`action_id`, `value`, `style: 'primary'`, `text` en `plain_text`), un bouton à lien (`url`), `text` en secours, 50 blocs au plus. `plain_text` dans un bloc `section` (plutôt que `mrkdwn`, qui interprète `<…>` et `*…*`) : **à vérifier dans la documentation de l'éditeur**. `chat.postMessage` vers un identifiant `U…` ouvre la conversation avec l'appli (note 06, « [MEM] ») ; sinon `conversations.open` (portée `im:write`) : à vérifier.

```ts
// src/server/slack/post.ts
import { z } from 'zod';
import { type SlackDeps, SlackTsSchema, slackJson } from './client';

// Les messages du bot : à la personne seule, en message direct (architecture 9.12, point 3). Un message ne porte que
// le nom de l'agent, le nombre d'actions, leurs titres génériques, et des boutons dont la valeur est l'identifiant
// de NOTRE ligne d'action. Le texte est déjà traduit par l'appelant (notify.ts) ; ce module ne fait que la forme.

// Les deux boutons que la route des clics reconnaît (interactions.ts). « Ouvrir » est un lien : Slack envoie quand
// même un clic, que la route acquitte sans rien faire (note 06).
export const SLACK_BUTTONS = {
  approve: 'leon_valider',
  undo: 'leon_annuler',
  open: 'leon_ouvrir',
} as const;

export type SlackLine = {
  actionId: string;
  title: string; // agents.kinds.<outil>.<verbe>, traduit
  approve: boolean; // validatesFromChannel, et l'action attend
  undo: boolean; // l'action est faite et undoable
};

export type SlackMessage = { text: string; blocks: unknown[] };

const plain = (text: string) => ({ type: 'plain_text', text: text.slice(0, 3000) });

// intro : « Suivi d'échange propose 3 actions : ». openLabel/openUrl : le bouton vers Leon, toujours présent.
export function buildSlackMessage(input: {
  intro: string;
  fallback: string;
  lines: readonly SlackLine[];
  labels: { approve: string; undo: string; open: string; openOnly: string };
  openUrl: string;
}): SlackMessage {
  const blocks: unknown[] = [{ type: 'section', text: plain(input.intro) }];
  for (const line of input.lines.slice(0, 10)) {
    blocks.push({ type: 'section', text: plain(`• ${line.title}`) });
    const buttons = [
      line.approve && {
        type: 'button',
        action_id: SLACK_BUTTONS.approve,
        style: 'primary',
        text: plain(input.labels.approve),
        value: line.actionId,
      },
      line.undo && {
        type: 'button',
        action_id: SLACK_BUTTONS.undo,
        text: plain(input.labels.undo),
        value: line.actionId,
      },
    ].filter(Boolean);
    // Une action qui ne se valide pas d'ici le dit : elle s'ouvre dans Leon (architecture 9.7).
    if (buttons.length > 0) blocks.push({ type: 'actions', elements: buttons });
    else blocks.push({ type: 'context', elements: [plain(input.labels.openOnly)] });
  }
  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', action_id: SLACK_BUTTONS.open, text: plain(input.labels.open), url: input.openUrl },
    ],
  });
  return { text: input.fallback, blocks };
}

const PostedSchema = z.looseObject({ channel: z.string().max(40), ts: SlackTsSchema });

// chat.postMessage (note 06) : `channel` est l'identifiant Slack de la personne. Rend le canal du message direct
// et l'horodatage du message.
export function postSlackMessage(
  token: string,
  input: { channel: string; message: SlackMessage; threadTs?: string },
  deps: SlackDeps = {},
) {
  return slackJson(
    'chat.postMessage',
    token,
    {
      channel: input.channel,
      text: input.message.text,
      blocks: input.message.blocks,
      ...(input.threadTs ? { thread_ts: input.threadTs } : {}),
    },
    PostedSchema,
    deps,
  );
}
```

Dix lignes au plus par message (une fiche propose 5 actions au plus : `maxSteps` = `maxActions` + 3, 8 au plus, architecture 10.2) : 2 + 2 × 10 = 22 blocs, sous les 50 de la note 06. Le bloc `context` aux éléments `plain_text` est **à vérifier**.

Exemple, en français (Exemple fictif : l'exécution de 6.1 ; la note et la tâche sont lues par des collègues, seul le brouillon reste chez Claire) :

```
Leon  APP
Suivi d'échange propose 3 actions :
• Note dans HubSpot
  À valider dans Leon.
• Tâche dans HubSpot
  À valider dans Leon.
• Brouillon dans Outlook
  [ Valider ]
[ Ouvrir dans Leon ]
```

### 14.8 `src/server/slack/interactions.ts` : la route des clics (code complet)

Monte : `app.route('/v1/slack', slackInteractionRoutes)` dans `src/server/api/app.ts`. Publique : `PUBLIC` de `route-guards.db.test.ts` gagne `/^\/api\/v1\/slack\/interactions$/` (architecture 7.5), avec un commentaire comme ceux des autres exceptions.

```ts
// src/server/slack/interactions.ts
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { enqueueChannelClick } from '@/server/channels/queue';
import type { WebhookVerification } from '@/server/connectors/types';
import { db } from '@/server/db/client';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import { parseBodyJson, verifyWebhook } from '@/server/webhooks/verify';
import { SlackIdSchema, SlackTsSchema } from './client';
import { SLACK_BUTTONS } from './post';

// Un clic dans un message du bot (architecture 9.12, point 5). Publique : elle vérifie la signature de Slack par
// l'interprète de la porte (verify.ts, chapitre 03), trouve la personne liée (compte_slack), met un job canal-clic et
// répond tout de suite : Slack attend 3 secondes (note 06). Rien ne s'exécute ici. Le worker (decideFromChannel)
// rebâtit le contexte de la personne et passe par decideAction ou undoAction, comme un clic dans l'application.

// Chapitre 03, 4.3, recopié tel quel : v0:<horodatage>:<corps brut>, HMAC-SHA256 en hexadécimal, préfixe v0=,
// 300 secondes de tolérance (schéma de Slack « à vérifier », note 04 ; note 06, 5, point 6).
export const SLACK_VERIFICATION: WebhookVerification = {
  mode: 'hmac-sha256',
  header: 'x-slack-signature',
  encoding: 'hex',
  prefix: 'v0=',
  signed: [{ literal: 'v0' }, 'timestamp', 'body'],
  separator: ':',
  timestamp: { source: 'header', name: 'x-slack-request-timestamp', unit: 's', toleranceSeconds: 300 },
  secret: { from: 'env', name: 'LEON_SLACK_SIGNING_SECRET' },
};

const MAX_BODY_BYTES = 64 * 1024;

// Le clic, tel que la note 06 le décrit (block_actions : user.id, actions[0].action_id et value, message.ts,
// channel.id). Le reste du corps est ignoré, et rien n'en est gardé.
const ClickSchema = z.looseObject({
  type: z.literal('block_actions'),
  team: z.looseObject({ id: SlackIdSchema }),
  user: z.looseObject({ id: SlackIdSchema }),
  channel: z.looseObject({ id: SlackIdSchema }),
  message: z.looseObject({ ts: SlackTsSchema }),
  actions: z
    .array(z.looseObject({ action_id: z.string().max(255), value: z.string().max(2000).optional() }))
    .min(1),
});

const DECISIONS: Record<string, 'confirmer' | 'defaire'> = {
  [SLACK_BUTTONS.approve]: 'confirmer',
  [SLACK_BUTTONS.undo]: 'defaire',
};

type Account = { tenantId: string; userId: string };
type Deps = {
  now?: () => number;
  findAccount?: (team: string, slackUser: string) => Promise<Account | null>;
  enqueue?: typeof enqueueChannelClick;
};

// La personne liée à ce compte Slack dans l'organisation qui a installé cet espace (0084, hors contexte).
async function compteSlack(team: string, slackUser: string): Promise<Account | null> {
  const { rows } = await db.execute<{ tenant_id: string; user_id: string }>(
    sql`select tenant_id, user_id from compte_slack(${team}, ${slackUser})`,
  );
  const row = rows[0];
  return row ? { tenantId: row.tenant_id, userId: row.user_id } : null;
}

export function createSlackInteractionRoutes(deps: Deps = {}) {
  const now = deps.now ?? Date.now;
  const findAccount = deps.findAccount ?? compteSlack;
  const enqueue = deps.enqueue ?? enqueueChannelClick;
  const routes = new Hono();

  routes.post(
    '/interactions',
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.body(null, 413) }),
    async (c) => {
      const secret = env.LEON_SLACK_SIGNING_SECRET;
      if (!secret) return c.body(null, 404);
      const body = new Uint8Array(await c.req.arrayBuffer());
      const headers: Record<string, string> = {};
      c.req.raw.headers.forEach((value, name) => {
        headers[name.toLowerCase()] = value;
      });
      const verdict = verifyWebhook({
        verification: SLACK_VERIFICATION,
        bodyFormat: 'form-payload',
        secret,
        method: 'POST',
        uri: '', // la signature de Slack ne porte pas l'adresse
        headers,
        body,
        nowMs: now(),
      });
      if (!verdict.ok) return c.body(null, 401);

      const click = ClickSchema.safeParse(
        parseBodyJson('form-payload', Buffer.from(body).toString('utf8')),
      );
      // Un autre genre d'interaction, ou un clic sur « Ouvrir dans Leon » : acquitté, rien d'autre.
      if (!click.success) return c.body(null, 200);
      const [action] = click.data.actions;
      const decision = action ? DECISIONS[action.action_id] : undefined;
      const actionId = z.uuid().safeParse(action?.value);
      if (!decision || !actionId.success) return c.body(null, 200);

      try {
        const account = await findAccount(click.data.team.id, click.data.user.id);
        // Personne liée (compte délié, Slack coupé, membre parti, appli désinstallée) : rien ne se passe. Le clic
        // d'un collègue sur un message transféré ne trouve que lui-même, et l'action d'un autre lui est invisible.
        if (!account) return c.body(null, 200);
        await enqueue({
          ...account,
          actionId: actionId.data,
          decision,
          channel: click.data.channel.id,
          ts: click.data.message.ts,
        });
        return c.body(null, 200);
      } catch (error) {
        logError('slack.clic', error);
        return c.body(null, 500);
      }
    },
  );

  return routes;
}

export const slackInteractionRoutes = createSlackInteractionRoutes();
```

À savoir :

- **La preuve du consentement est le clic signé, sur un message direct.** `compte_slack` relie l'utilisateur Slack qui a cliqué à une personne ; `decideFromChannel` ne voit que les actions de cette personne (RLS). Un message transféré à un collègue ne lui donne rien : son clic arrive sous son propre compte, et l'action n'est pas la sienne (note 06, « Piège de sécurité »).
- **Le corps n'est lu qu'après la signature**, et seulement par `parseBodyJson` (chapitre 03, 4.3). Rien du corps n'est gardé : le job ne porte que des identifiants.
- **`401` sur une signature fausse, `200` sur le reste** : Slack montre une erreur à la personne pour toute réponse qui n'est pas `200` (note 06 : « répondre `200` en moins de 3 secondes ») ; un clic que Leon ne sait pas traiter n'est pas une erreur de la personne.
- **Le rejeu d'un clic** dans les 300 secondes de tolérance met un second job : la file a `actionId` pour clé (architecture 10.1), et `decideAction` ne réserve une ligne qu'une fois. Le second job rend « Déjà décidée ».
- **Les 3 secondes de Slack.** La route fait deux allers-retours en base : `compte_slack`, puis l'envoi du job. Le premier appel de `getChannelsBoss()` dans un processus crée aussi les quatre files (`ensureQueue` : lecture, peut-être suppression, création, par file) : c'est lui qui pourrait dépasser. Le rôle `web` l'appelle donc au démarrage (`instrumentation-node.ts`, 15.5), sans lire aucune file. Le p95 de la route est **à mesurer** sur Railway avant d'ouvrir la PR 07h (le chapitre 13 ne le demande que pour la porte, et le pool de `web` n'a que 4 connexions) ; au-delà d'une seconde, la PR 07h ne s'ouvre pas avant d'avoir revu ce pool. Rien n'est montré dans Slack avant la réponse du worker dans le fil : un message « Validation en cours » demanderait un appel à Slack de plus dans la route, qui est ce qu'il faut éviter.

## 15. Après le jalon 1 : files `recap-*` et `canal-*`, `notifyAction`, `decideFromChannel`

PR 07f pour `recap-tic` et `recap-envoyer` ; PR 07h pour `canal-envoyer`, `canal-clic`, `notify.ts`, `click.ts`. Quatre files de l'architecture (10.1), noms et politiques recopiés.

`queue.ts` et `worker.ts` s'écrivent en deux temps : les lignes marquées `// 07h` n'entrent qu'avec la PR 07h, qui suit 07g (`slack/client.ts`, d'où viennent `SlackIdSchema` et `SlackTsSchema`). La PR 07f livre les deux fichiers sans elles : `OPTIONS` à deux files, `RecapJobSchema`, `enqueueRecap`, et les deux lecteurs `recap-*`. Aucun fichier de 07f n'importe `src/server/slack/`, `notify.ts` ou `click.ts`.

### 15.1 `src/server/channels/queue.ts` (code complet)

```ts
// src/server/channels/queue.ts
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { ensureQueue, getBoss } from '@/server/pipeline/queue';
import { SlackIdSchema, SlackTsSchema } from '@/server/slack/client'; // 07h

// Les files des canaux sortants (dossier agents, 10.1) : le tic du récapitulatif, son envoi, un message Slack, un
// clic dans Slack. Un job ne porte que des identifiants (architecture 9.9). Comme briefing/queue.ts.

export const CHANNEL_QUEUES = {
  recapTick: 'recap-tic',
  recapSend: 'recap-envoyer',
  send: 'canal-envoyer', // 07h
  click: 'canal-clic', // 07h
} as const;

// Politiques de l'architecture (10.1). canal-clic n'est jamais repris : une écriture ne se rejoue pas.
const OPTIONS = {
  [CHANNEL_QUEUES.recapTick]: { policy: 'stately' },
  [CHANNEL_QUEUES.recapSend]: { policy: 'standard', retryLimit: 2, retryDelay: 300 },
  [CHANNEL_QUEUES.send]: { policy: 'standard', retryLimit: 2, retryDelay: 60 }, // 07h
  [CHANNEL_QUEUES.click]: { policy: 'standard', retryLimit: 0 }, // 07h
} as const;

// Un envoi qu'un éditeur a refusé pour débit (429) n'est pas repris par pg-boss mais remis à plus tard, au délai
// qu'il demande (worker.ts) ; `reprise` compte ces remises, MAX_REPORTS au plus.
export const MAX_REPORTS = 5;
const reprise = z.number().int().min(0).max(MAX_REPORTS).default(0);

export const RecapJobSchema = z.object({ tenantId: z.uuid(), userId: z.uuid(), reprise });
export const ChannelMessageJobSchema = z.object({ // 07h
  tenantId: z.uuid(),
  userId: z.uuid(),
  messageId: z.uuid(),
  reprise,
});
export const ClickJobSchema = z.object({ // 07h
  tenantId: z.uuid(),
  userId: z.uuid(),
  actionId: z.uuid(),
  decision: z.enum(['confirmer', 'defaire']),
  channel: SlackIdSchema, // le message direct, pour répondre dans son fil
  ts: SlackTsSchema,
});
export type ClickJob = z.infer<typeof ClickJobSchema>;

// La clé du récapitulatif dans la file : organisation, personne, jour UTC (architecture 10.1). Le jour local de la
// personne est dans la clé de messages_sortants (recap.ts) : c'est elle qui empêche un second envoi.
export const recapJobKey = (job: z.infer<typeof RecapJobSchema>, now: Date) =>
  `${job.tenantId}:${job.userId}:${now.toISOString().slice(0, 10)}`;

const globalForChannels = globalThis as typeof globalThis & { leonChannelsBoss?: Promise<PgBoss> };

export function getChannelsBoss(): Promise<PgBoss> {
  globalForChannels.leonChannelsBoss ??= (async () => {
    const boss = await getBoss();
    for (const [name, options] of Object.entries(OPTIONS)) await ensureQueue(boss, name, options);
    return boss;
  })().catch((error) => {
    globalForChannels.leonChannelsBoss = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForChannels.leonChannelsBoss;
}

export async function enqueueRecap(job: z.input<typeof RecapJobSchema>, now = new Date()) {
  const data = RecapJobSchema.parse(job);
  const boss = await getChannelsBoss();
  return boss.send(CHANNEL_QUEUES.recapSend, data, { singletonKey: recapJobKey(data, now) });
}

// 07h
export async function enqueueChannelMessage(job: z.input<typeof ChannelMessageJobSchema>) {
  const data = ChannelMessageJobSchema.parse(job);
  const boss = await getChannelsBoss();
  return boss.send(CHANNEL_QUEUES.send, data, { singletonKey: data.messageId });
}

// Remettre un envoi refusé pour débit à `delayMs` plus tard (au moins une minute), sans clé de singleton : le job
// courant tient peut-être encore la sienne. Faux : MAX_REPORTS atteint, l'envoi est abandonné (la ligne reste
// « echoue » ; le récapitulatif du lendemain, ou « À valider », le diront).
export async function reportLater(
  queue: typeof CHANNEL_QUEUES.recapSend | typeof CHANNEL_QUEUES.send, // 07f : recapSend seule
  data: { reprise: number } & Record<string, unknown>,
  delayMs: number | null,
): Promise<boolean> {
  if (data.reprise >= MAX_REPORTS) return false;
  const boss = await getChannelsBoss();
  const seconds = Math.max(60, Math.ceil((delayMs ?? 60_000) / 1000));
  await boss.send(queue, { ...data, reprise: data.reprise + 1 }, { startAfter: seconds });
  return true;
}

// 07h. Appelé par la route des clics (web) : web met en file, il ne lit aucune file (architecture 4).
export async function enqueueChannelClick(job: ClickJob) {
  const data = ClickJobSchema.parse(job);
  const boss = await getChannelsBoss();
  return boss.send(CHANNEL_QUEUES.click, data, { singletonKey: data.actionId });
}
```

Ce que fait `singletonKey` sur une file `standard` dans pg-boss 12 est **à vérifier** (architecture 10.1 : « leur comportement exact dans pg-boss 12 n'a pas pu être relu »). Aucune de ces files n'en dépend pour sa justesse : le récapitulatif a la clé unique de `messages_sortants` et sa réservation conditionnelle (13.2), un message Slack son statut, un clic la réservation de `decideAction`.

### 15.2 `src/server/channels/notify.ts` : `notifyAction` (code complet)

Appelée par le moteur, jamais par une route. Deux genres :

| Genre | Quand | Appelant | Jalon |
|---|---|---|---|
| `validation` | une exécution finit (`faite`, `echouee`, `annulee`, `ignoree`) et a laissé des actions `proposee` ; ou un job est rejoué sur une exécution déjà finie | `runExecution` (chapitre 04, `run.ts`), par `notifyProposed` | après (07h) |
| `fait` | une action est partie sans clic et `mustNotify` est vrai (chapitre 06, 3.1) | le moteur, après `autoExecute` (chapitre 05, 11) | après (07i, avec le premier cran) |

Un message par exécution, pas par action : une fiche qui propose trois actions envoie un message de trois lignes. Clé dans `messages_sortants` : `<genre>:<user_id>:<execution_id>` (chapitre 01, 12, « le chapitre 07 la fixe » ; écart 11).

```ts
// src/server/channels/notify.ts
import { and, eq, isNull } from 'drizzle-orm';
import { readAgentSettings } from '@/server/agents/activation';
import { listRunActions } from '@/server/agents/runs';
import type { TenantContext } from '@/server/auth/tenant-context';
import { installationsSlack, messagesSortants, preferencesCanaux } from '@/server/db/schema/channels';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { slackConfigured } from '@/server/slack/manifest';
import { enqueueChannelMessage } from './queue';

// Prévenir une personne que ses agents ont proposé (ou fait) quelque chose (dossier agents, 9.12). Seulement par
// Slack, et seulement si elle l'a voulu (Slack lié, Slack allumé, appli installée et valide) et si les agents ne
// sont pas coupés dans l'organisation. Sinon rien : le récapitulatif du lendemain le dira. Ne porte aucun texte : la
// ligne de messages_sortants ne garde que des identifiants, le message est rebâti à l'envoi, sous les droits du
// moment (sendChannelMessage).

// Une ligne restée « en-file » plus longtemps que ça a perdu son job (l'envoi à la file a levé après l'insertion, ou
// le worker s'est arrêté) : un nouvel appel la remet en file.
const STALE_QUEUED_MS = 5 * 60_000;

export type NotifyInput = {
  genre: 'validation' | 'fait';
  executionId: string;
  actionIds: readonly string[];
};

export const channelMessageKey = (genre: NotifyInput['genre'], userId: string, executionId: string) =>
  `${genre}:${userId}:${executionId}`;

// Rend l'identifiant du message mis en file, ou null (rien à faire, ou déjà en file ou envoyé pour cette
// exécution). Ne lève que sur une panne de base ou de file : notifyProposed la journalise sans échouer l'exécution.
export async function notifyAction(
  ctx: TenantContext,
  input: NotifyInput,
  now = new Date(),
): Promise<string | null> {
  if (input.actionIds.length === 0 || !slackConfigured()) return null;
  const id = await withTenant(ctx, async (tx) => {
    if (!(await readAgentSettings(tx, ctx)).enabled) return null; // agents coupés : rien ne part (8.2)
    const [prefs] = await tx
      .select({ slack: preferencesCanaux.slack, slackUserId: preferencesCanaux.slackUserId })
      .from(preferencesCanaux)
      .where(
        and(eq(preferencesCanaux.tenantId, ctx.tenantId), eq(preferencesCanaux.userId, ctx.userId)),
      );
    if (!prefs?.slack || !prefs.slackUserId) return null;
    const [installed] = await tx
      .select({ teamId: installationsSlack.teamId })
      .from(installationsSlack)
      .where(
        and(eq(installationsSlack.tenantId, ctx.tenantId), isNull(installationsSlack.invalideLe)),
      );
    if (!installed) return null;
    const cle = channelMessageKey(input.genre, ctx.userId, input.executionId);
    const [row] = await tx
      .insert(messagesSortants)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        canal: 'slack',
        genre: input.genre,
        cle,
        actionIds: [...input.actionIds].slice(0, 200),
        acl: [ctx.userId],
      })
      .onConflictDoNothing({ target: [messagesSortants.tenantId, messagesSortants.cle] })
      .returning({ id: messagesSortants.id });
    if (row) return row.id;
    // La clé existe : envoyée, échouée, ou en file. Seule une ligne en file depuis trop longtemps est remise en file.
    const [existing] = await tx
      .select({ id: messagesSortants.id, statut: messagesSortants.statut, creeLe: messagesSortants.creeLe })
      .from(messagesSortants)
      .where(and(eq(messagesSortants.tenantId, ctx.tenantId), eq(messagesSortants.cle, cle)));
    const lost =
      existing?.statut === 'en-file' && now.getTime() - existing.creeLe.getTime() > STALE_QUEUED_MS;
    return lost ? existing.id : null;
  });
  if (id) await enqueueChannelMessage({ tenantId: ctx.tenantId, userId: ctx.userId, messageId: id });
  return id;
}

// Le point d'appel du moteur (runExecution, ci-dessous). Les propositions encore en attente de l'exécution, quel que
// soit son statut final : une exécution échouée ou coupée a pu proposer avant de s'arrêter, et ses propositions
// sont valables. Ne lève jamais : prévenir ne fait pas échouer une exécution.
export async function notifyProposed(write: TenantContext, executionId: string): Promise<void> {
  if (!slackConfigured()) return;
  try {
    const proposed = (await listRunActions(write, executionId)).filter((a) => a.status === 'proposee');
    if (proposed.length === 0) return;
    await notifyAction(write, {
      genre: 'validation',
      executionId,
      actionIds: proposed.map((a) => a.id),
    });
  } catch (error) {
    logError('agents.prevenir', error, { executionId });
  }
}
```

Le point d'appel dans le moteur, ajouté par la PR 07h à `runExecution` (chapitre 04, 8, `src/server/agents/engine/run.ts`), dont les noms sont repris tels quels : `write` (le contexte de la personne, ou de l'activateur pour un agent d'équipe, architecture 9.1, point 3), `execution`, `outcome`, `FINAL_STATUSES`. Deux lignes changent, rien d'autre :

```ts
// run.ts, runExecution : un job rejoué sur une exécution finie. Le message a pu se perdre entre l'écriture du
// statut final et l'appel ci-dessous (arrêt du processus) : on rappelle. La clé de messages_sortants rend l'appel
// idempotent, et une ligne restée en file se remet en file (notifyAction).
  if (FINAL_STATUSES.includes(execution.statut)) {
    await notifyProposed(write, execution.id);
    return 'deja-finie';
  }

// run.ts, runExecution, après le bloc qui solde le budget :
  if (outcome === 'finie' || outcome === 'epuisee') {
    await settleRunBudget(write, { executionId: execution.id, usd: roundUsd(tally.meter.usd) }).catch(
      (error) => logError('agents.solde', error, { executionId: execution.id, tenantId: write.tenantId }),
    );
    // Chapitre 07, 15.2 : prévenir des propositions qui attendent, hors de toute étape journalisée.
    await notifyProposed(write, execution.id);
  }
  return outcome;
```

`finie` couvre `faite`, `echouee`, `annulee` et `ignoree` (chapitre 04, tableau des issues) ; `epuisee` est une exécution `echouee` après trois reprises. Pour chacune, ce qui compte est ce qui attend : `notifyProposed` ne lit que les actions `proposee`. Une exécution qui n'a rien proposé ne coûte qu'une lecture, et rien sans appli Slack (`slackConfigured()` d'abord). `run.ts` importe `notifyProposed` de `@/server/channels/notify` ; `notify.ts` n'importe rien du moteur : pas de cycle.

### 15.3 `sendChannelMessage` (même fichier, code complet)

```ts
// src/server/channels/notify.ts (suite ; à la PR, ces imports rejoignent ceux de la tête du fichier)
import { createTranslator } from 'next-intl';
import { inArray, sql } from 'drizzle-orm';
import { type ActionView, actionProvider, actionVerb } from '@/lib/actions';
import { validatesFromChannel } from '@/lib/agents';
import { type TimedAction, toView } from '@/server/actions/store';
import { resolveTenantContext } from '@/server/auth/tenant-context';
import { readUserLocale } from '@/server/channels/preferences';
import { actions } from '@/server/db/schema/actions';
import { executionsAgent } from '@/server/db/schema/agents';
import { env } from '@/server/env';
import { isDeadToken, SlackApiError, type SlackDeps } from '@/server/slack/client';
import { markSlackInvalid, readInstallation } from '@/server/slack/install';
import { buildSlackMessage, postSlackMessage } from '@/server/slack/post';
import { ChannelMessageJobSchema } from './queue';

// `installation` : l'appli ne vaut plus rien dans l'espace Slack (marquée invalide). `delie` : le compte Slack lié
// n'existe plus dans cet espace (channel_not_found : réinstallation ailleurs, compte supprimé) ; la personne est
// déliée, elle relie le sien d'un clic.
export type ChannelOutcome =
  | 'envoye'
  | 'deja'
  | 'rien'
  | 'coupe'
  | 'parti'
  | 'sans_slack'
  | 'installation'
  | 'delie';

// Ce qui reste à dire au moment d'envoyer : une validation dont l'action attend encore ; un « fait » dont l'action
// est encore faite.
const stillRelevant = (genre: 'validation' | 'fait' | 'recap' | 'alerte', view: TimedAction) =>
  genre === 'validation' ? view.status === 'proposee' : genre === 'fait' && view.status === 'faite';

// Le job canal-envoyer. Rebâtit le contexte, relit la ligne et les actions sous les droits de la personne, traduit
// dans sa langue, poste, puis note le statut. L'appel à Slack se fait hors de toute transaction.
export async function sendChannelMessage(data: unknown, deps: SlackDeps = {}): Promise<ChannelOutcome> {
  const job = ChannelMessageJobSchema.parse(data);
  if (!slackConfigured()) return 'sans_slack';
  const ctx = await resolveTenantContext(job.userId, job.tenantId);
  if (!ctx) return 'parti';
  const read = await withTenant(ctx, async (tx) => {
    const [message] = await tx
      .select()
      .from(messagesSortants)
      .where(and(eq(messagesSortants.tenantId, ctx.tenantId), eq(messagesSortants.id, job.messageId)));
    if (!message || message.canal !== 'slack') return { kind: 'rien' as const };
    if (message.statut === 'envoye') return { kind: 'deja' as const };
    const [prefs] = await tx
      .select({ slack: preferencesCanaux.slack, slackUserId: preferencesCanaux.slackUserId })
      .from(preferencesCanaux)
      .where(and(eq(preferencesCanaux.tenantId, ctx.tenantId), eq(preferencesCanaux.userId, ctx.userId)));
    const installation = await readInstallation(tx, ctx); // null aussi pour une installation invalide
    if (!prefs?.slack || !prefs.slackUserId || !installation) return { kind: 'coupe' as const, id: message.id };
    // Agents coupés entre la proposition et l'envoi : rien ne part (8.2).
    if (!(await readAgentSettings(tx, ctx)).enabled) return { kind: 'coupe' as const, id: message.id };
    const rows =
      message.actionIds.length === 0
        ? []
        : await tx
            .select()
            .from(actions)
            .where(and(eq(actions.tenantId, ctx.tenantId), inArray(actions.id, message.actionIds)))
            .orderBy(actions.createdAt, actions.id);
    // L'exécution vient de la ligne d'action, pas de la vue : TimedAction ne la porte pas (section 4.3).
    const kept = rows.flatMap((row) => {
      const view = toView(row);
      return view && stillRelevant(message.genre, view) ? [{ view, executionId: row.executionId }] : [];
    });
    const views = kept.map((one) => one.view);
    const executionId = kept[0]?.executionId ?? null;
    const [run] = executionId
      ? await tx
          .select({ agentId: executionsAgent.agentId })
          .from(executionsAgent)
          .where(and(eq(executionsAgent.tenantId, ctx.tenantId), eq(executionsAgent.id, executionId)))
      : [];
    return {
      kind: 'envoyer' as const,
      id: message.id,
      genre: message.genre,
      views,
      executionId,
      agentId: run?.agentId ?? null,
      channel: prefs.slackUserId,
      token: installation.token,
      locale: await readUserLocale(tx, ctx.userId),
    };
  });
  if (read.kind === 'rien' || read.kind === 'deja') return read.kind;
  if (read.kind === 'coupe' || read.views.length === 0) {
    // Plus rien à dire (tout a été décidé dans Leon, ou Slack a été coupé) : rien ne part. Voir écart 12.
    await setChannelStatus(ctx, read.id, 'echoue');
    return read.kind === 'coupe' ? 'coupe' : 'rien';
  }
  const messages = (await import(`../../../messages/${read.locale}.json`)).default;
  const t = createTranslator({ locale: read.locale, messages, namespace: 'agents' });
  // Le JSON chargé à la main n'est pas typé : un bloc `catalog` absent ne doit pas lever ici.
  const agentName =
    read.agentId && read.agentId in (messages.agents?.catalog ?? {})
      ? t(`catalog.${read.agentId}.name` as 'catalog.suivi_echange.name')
      : t('pending.unknownAgent');
  const count = read.views.length;
  const message = buildSlackMessage({
    intro:
      read.genre === 'fait'
        ? t('slack.introDone', { agent: agentName, count })
        : t('slack.intro', { agent: agentName, count }),
    fallback: t('slack.fallback', { count }),
    lines: read.views.map((view: ActionView) => ({
      actionId: view.id,
      title: t(`kinds.${actionProvider(view.kind)}.${actionVerb(view.kind)}` as 'kinds.hubspot.creer_note'),
      approve: read.genre === 'validation' && view.origin === 'agent' && validatesFromChannel(view),
      undo: read.genre === 'fait' && view.undoable,
    })),
    labels: {
      approve: t('slack.approve'),
      undo: t('slack.undo'),
      open: t('slack.open'),
      openOnly: t('slack.openOnly'),
    },
    openUrl: new URL(
      read.genre === 'fait'
        ? `/agents?vue=executions&execution=${read.executionId}`
        : `/agents/a-valider#execution-${read.executionId}`,
      env.BETTER_AUTH_URL,
    ).toString(),
  });
  try {
    await postSlackMessage(read.token, { channel: read.channel, message }, deps);
  } catch (error) {
    // Refus pour débit : la ligne reste « en-file », le worker remet le job au délai demandé (15.5).
    if (error instanceof SlackApiError && error.code === 'ratelimited') throw error;
    await setChannelStatus(ctx, read.id, 'echoue');
    // L'appli ne vaut plus rien dans cet espace Slack : aucune reprise n'y changera rien.
    if (isDeadToken(error)) {
      await markSlackInvalid(ctx);
      return 'installation';
    }
    // L'identifiant lié ne désigne plus personne dans cet espace : délier la personne (lier_slack(null), sa propre
    // ligne seulement, 0084). Elle relie son compte d'un clic dans la vue Canaux.
    if (error instanceof SlackApiError && error.code === 'channel_not_found') {
      await withTenant(ctx, (tx) => tx.execute(sql`select lier_slack(null)`));
      return 'delie';
    }
    throw error;
  }
  await setChannelStatus(ctx, read.id, 'envoye');
  return 'envoye';
}

async function setChannelStatus(ctx: TenantContext, id: string, statut: 'envoye' | 'echoue') {
  await withTenant(ctx, (tx) =>
    tx
      .update(messagesSortants)
      .set({ statut, envoyeLe: statut === 'envoye' ? new Date() : null })
      .where(eq(messagesSortants.id, id)),
  );
}
```

À savoir :

- **Le message est rebâti à l'envoi** : une action validée dans Leon entre la proposition et l'envoi n'apparaît plus ; si plus rien n'attend, rien ne part (architecture 9.12, point 2).
- **Un rejeu après un `chat.postMessage` réussi poste deux fois** (note 06 : pas de clé d'idempotence chez Slack). Le statut est posé tout de suite après l'appel ; le double ne vient que d'une panne entre les deux.
- **`validatesFromChannel(view)`** reçoit une `ActionView` : elle a `risk` et `audience`, la fonction ne lit qu'eux (section 4.1).
- **`messages.agents.catalog`** est l'objet chargé du fichier JSON : une fiche retirée du catalogue n'a plus de nom, l'écran dit « Agent retiré du catalogue ». Le bloc existe dès la PR 07b (10.1) ; le `?? {}` n'est qu'une défense.
- **Trois pannes de Slack ont leur réponse.** Un refus pour débit (`ratelimited`, avec `retryAfterMs`) : la ligne reste `en-file`, le worker remet le job à plus tard au délai demandé, cinq fois au plus (`reportLater`, 15.1). Un jeton mort (`SLACK_DEAD_TOKEN`) : l'installation est marquée invalide, plus rien ne part, la vue Canaux le dit (14.5), et le job finit sans reprise. Un compte lié qui n'existe plus (`channel_not_found`) : la personne est déliée. Toute autre erreur : `echoue`, et les deux reprises de la file.

### 15.4 `src/server/channels/click.ts` : `decideFromChannel` (code complet)

```ts
// src/server/channels/click.ts
import { createTranslator } from 'next-intl';
import { validatesFromChannel } from '@/lib/agents';
import { decideAction, undoAction } from '@/server/actions/decide';
import { readActionRow, toView } from '@/server/actions/store';
import { confirmBlock } from '@/server/agents/runs';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { isDeadToken, type SlackDeps } from '@/server/slack/client';
import { markSlackInvalid, readInstallation } from '@/server/slack/install';
import { postSlackMessage } from '@/server/slack/post';
import { readUserLocale } from './preferences';
import { type ClickJob, ClickJobSchema } from './queue';

// Un clic dans Slack (architecture 9.12, point 5), exécuté par le worker sous le contexte de la personne liée. Il
// ne fait rien qu'un clic dans l'application ne ferait : decideAction ou undoAction, avec leurs vérifications. Il
// refuse en plus de valider ce qui n'est pas d'enjeu bas et de public « soi » (validatesFromChannel), ce que les
// agents coupés ou une source devenue invisible gèlent (confirmBlock, 4.3), et d'annuler ce qui ne s'annule pas.
// L'issue est dite dans le fil du message, sans aucun contenu.

export type ClickOutcome =
  | 'faite'
  | 'echouee'
  | 'defaite'
  | 'deja'
  | 'ouvrir'
  | 'perdue'
  | 'coupe'
  | 'source';

type ClickDeps = SlackDeps & {
  decide?: typeof decideAction;
  undo?: typeof undoAction;
  block?: typeof confirmBlock;
};

export async function decideFromChannel(data: unknown, deps: ClickDeps = {}): Promise<ClickOutcome> {
  const job = ClickJobSchema.parse(data);
  // Sans includeFormer : une personne partie ne valide plus rien.
  const ctx = await resolveTenantContext(job.userId, job.tenantId);
  if (!ctx) return 'perdue';
  const outcome = await decide(ctx, job, deps);
  await tellOutcome(ctx, job, outcome, deps).catch((error) =>
    logError('canal.clic_reponse', error, { actionId: job.actionId }),
  );
  return outcome;
}

async function decide(ctx: TenantContext, job: ClickJob, deps: ClickDeps): Promise<ClickOutcome> {
  // Sous la RLS de la personne : l'action d'un autre est invisible.
  const row = await readActionRow(ctx, job.actionId);
  if (!row || row.origine !== 'agent') return 'perdue';
  if (job.decision === 'confirmer') {
    // Revérifié ici, quel que soit le bouton reçu : un clic forgé sur une note de CRM ne la valide pas.
    if (!validatesFromChannel({ risk: row.enjeu, audience: row.audience })) return 'ouvrir';
    // Agents coupés, ou une source lue qui n'est plus visible : la même garde que dans Leon (8.4).
    const block = await (deps.block ?? confirmBlock)(ctx, row.id);
    if (block) return block;
    const view = await (deps.decide ?? decideAction)(ctx, row.id, 'confirmer');
    if (!view) return 'perdue';
    if (view.status === 'faite') return 'faite';
    if (view.status === 'expiree') return 'perdue';
    // Refus pour débit : la ligne est revenue à « proposee » ; la carte dans Leon dit de réessayer.
    if (view.status === 'echouee' || view.status === 'proposee') return 'echouee';
    return 'deja';
  }
  const current = toView(row);
  if (!current?.undoable) return 'deja';
  const view = await (deps.undo ?? undoAction)(ctx, row.id);
  return view?.status === 'defaite' ? 'defaite' : 'echouee';
}

// Une réponse dans le fil du message direct (note 06 : chat.postMessage avec thread_ts). Le message d'origine garde
// ses boutons ; un second clic rend « Déjà décidée ».
async function tellOutcome(ctx: TenantContext, job: ClickJob, outcome: ClickOutcome, deps: SlackDeps) {
  const read = await withTenant(ctx, async (tx) => ({
    installation: await readInstallation(tx, ctx),
    locale: await readUserLocale(tx, ctx.userId),
  }));
  if (!read.installation) return;
  const messages = (await import(`../../../messages/${read.locale}.json`)).default;
  const t = createTranslator({ locale: read.locale, messages, namespace: 'agents.slack' });
  const text = t(`outcome.${outcome}`);
  try {
    await postSlackMessage(
      read.installation.token,
      { channel: job.channel, threadTs: job.ts, message: { text, blocks: [] } },
      deps,
    );
  } catch (error) {
    // Le geste est fait (ou refusé) dans Leon ; seule la réponse dans le fil est perdue.
    if (isDeadToken(error)) await markSlackInvalid(ctx);
    else throw error;
  }
}
```

`blocks: []` : un message de texte seul. Si Slack refuse un tableau vide, l'appel omet `blocks` (à vérifier). Le message d'origine n'est pas rebâti : la réponse dans le fil suffit, et évite de relire toutes les actions du message.

Ce que `decideFromChannel` ne fait pas : écrire `messages_sortants` (une réponse dans un fil n'est pas un message prévu, et elle ne dit que l'issue d'un geste de la personne) ; rejouer (`retryLimit: 0`) ; lire `payload.response_url` (la route ne le met pas dans le job : ce n'est pas un identifiant, c'est un droit d'écrire dans la conversation pendant 30 minutes, note 06).

### 15.5 `src/server/channels/worker.ts` (code complet)

```ts
// src/server/channels/worker.ts
import { setTimeout as sleep } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { sendRecap } from '@/server/email/recap';
import { MailRefusedError, mailConfigured, RESEND_MIN_INTERVAL_MS } from '@/server/email/send';
import { logError, safeErrorSummary } from '@/server/log';
import { wakeQueueAfter } from '@/server/pipeline/queue';
import { SlackApiError } from '@/server/slack/client'; // 07h
import { decideFromChannel } from './click'; // 07h
import { sendChannelMessage } from './notify'; // 07h
import {
  CHANNEL_QUEUES,
  ChannelMessageJobSchema, // 07h
  enqueueRecap,
  getChannelsBoss,
  RecapJobSchema,
  reportLater,
} from './queue';

// Le worker des canaux sortants (dossier agents, 10.1). Toutes les quinze minutes, le tic met en file le
// récapitulatif de chaque personne à qui il est dû (recaps_dus : des identifiants seulement) ; chaque envoi se fait
// sous les droits de sa personne. Il lit aussi les messages Slack et les clics. Aucun modèle n'est appelé.

export const RECAP_CRON = '*/15 * * * *';
const RECAP_BATCH = 200;

// pg-boss relance ce qu'on lui renvoie : jamais l'erreur d'origine, seulement son résumé (briefing/worker.ts).
function rethrowSummary(event: string, error: unknown, ids: Record<string, string> = {}): never {
  logError(event, error, ids);
  throw new Error(safeErrorSummary(error));
}

export async function enqueueDueRecaps(now = new Date()): Promise<number> {
  if (!mailConfigured()) return 0;
  const { rows } = await db.execute<{ tenant_id: string; user_id: string }>(
    sql`select tenant_id, user_id from recaps_dus(${RECAP_BATCH})`,
  );
  let queued = 0;
  for (const row of rows) {
    try {
      const id = await enqueueRecap({ tenantId: row.tenant_id, userId: row.user_id }, now);
      if (id !== null) queued += 1;
    } catch (error) {
      logError('recap.enqueue_failed', error, { tenantId: row.tenant_id, userId: row.user_id });
    }
  }
  return queued;
}

async function registerWorkers(pollingIntervalSeconds: number | undefined): Promise<void> {
  const boss = await getChannelsBoss();
  const polling = pollingIntervalSeconds === undefined ? {} : { pollingIntervalSeconds };
  // Un tic manqué (serveur arrêté) part une fois au redémarrage.
  await boss.schedule(CHANNEL_QUEUES.recapTick, RECAP_CRON, null, { tz: 'UTC', missed: 'once' });
  await boss.work(
    CHANNEL_QUEUES.recapTick,
    { batchSize: 1, localConcurrency: 1, ...polling },
    wakeQueueAfter(boss, CHANNEL_QUEUES.recapTick, async () => {
      await enqueueDueRecaps();
    }),
  );
  // Un lecteur à la fois, et une pause après chaque envoi : le récapitulatif ne dépasse pas le débit de Resend
  // (RESEND_MIN_INTERVAL_MS, send.ts ; un seul processus worker, architecture 4). 200 récapitulatifs : deux minutes.
  await boss.work(
    CHANNEL_QUEUES.recapSend,
    { batchSize: 1, localConcurrency: 1, ...polling },
    wakeQueueAfter(boss, CHANNEL_QUEUES.recapSend, async ([job]) => {
      const data = RecapJobSchema.parse(job?.data);
      const ids = { tenantId: data.tenantId, userId: data.userId };
      try {
        if ((await sendRecap(data)) === 'envoye') await sleep(RESEND_MIN_INTERVAL_MS);
      } catch (error) {
        // Refus pour débit : remis au délai demandé, la ligne « echoue » sera reprise (recap.ts, claimRecap).
        if (error instanceof MailRefusedError && error.status === 429) {
          if (await reportLater(CHANNEL_QUEUES.recapSend, data, error.retryAfterMs)) return;
        }
        rethrowSummary('recap.send_failed', error, ids);
      }
    }),
  );
  // 07h, jusqu'à la fin de registerWorkers.
  await boss.work(
    CHANNEL_QUEUES.send,
    { batchSize: 1, localConcurrency: 2, ...polling },
    wakeQueueAfter(boss, CHANNEL_QUEUES.send, async ([job]) => {
      try {
        await sendChannelMessage(job?.data);
      } catch (error) {
        if (error instanceof SlackApiError && error.code === 'ratelimited') {
          const data = ChannelMessageJobSchema.parse(job?.data);
          if (await reportLater(CHANNEL_QUEUES.send, data, error.retryAfterMs)) return;
        }
        rethrowSummary('canal.send_failed', error);
      }
    }),
  );
  await boss.work(
    CHANNEL_QUEUES.click,
    { batchSize: 1, localConcurrency: 2, ...polling },
    wakeQueueAfter(boss, CHANNEL_QUEUES.click, async ([job]) => {
      try {
        await decideFromChannel(job?.data);
      } catch (error) {
        // Aucune reprise (retryLimit: 0) : l'erreur est notée, la personne réessaie depuis Leon.
        rethrowSummary('canal.clic_failed', error);
      }
    }),
  );
}

const globalForWorker = globalThis as typeof globalThis & { leonChannelsWorker?: Promise<void> };

// Idempotent : le rechargement à chaud de Next réexécute `register()`.
export function startChannelsWorker(options: { pollingIntervalSeconds?: number } = {}): Promise<void> {
  globalForWorker.leonChannelsWorker ??= registerWorkers(options.pollingIntervalSeconds).catch(
    (error) => {
      globalForWorker.leonChannelsWorker = undefined;
      throw error;
    },
  );
  return globalForWorker.leonChannelsWorker;
}
```

`src/instrumentation-node.ts` (existe) : `startChannelsWorker()` démarre avec les autres, derrière `runsWorkers()` (architecture 6 ; chapitre 13). Sans Resend, le tic ne met rien en file ; sans appli Slack, `notifyAction` ne met rien en file : le worker démarre quand même, à vide.

PR 07h, même fichier : dans le rôle `web` (architecture 4, `LEON_ROLE`), `await getChannelsBoss()` au démarrage, quand `slackConfigured()`. Il crée les files sans en lire aucune : le premier clic Slack ne paie pas `ensureQueue` dans ses 3 secondes (14.8).

`pgboss-wake.test.ts` (existe) exige `wakeQueueAfter` autour de chaque lecteur : les quatre l'ont.

À savoir :

- **Le débit de Resend.** Un récapitulatif par appel, un appel à la fois, 600 ms au moins entre deux : sous la limite par défaut de Resend (2 requêtes par seconde, **à vérifier** dans sa documentation et à mesurer au premier client). Un 429 quand même (un e-mail de compte parti en même temps) : le job est remis au délai de `Retry-After` (`reportLater`), cinq fois au plus, au lieu des deux reprises à 300 s de la file. `sendEmailBatch` n'est pas employé : chaque récapitulatif se rebâtit sous les droits de sa personne, et un lot mêlerait les échecs de cent personnes.
- **Le refus pour débit de Slack** suit le même chemin (`SlackApiError.retryAfterMs`) ; la ligne du message reste `en-file` entre-temps.

## 16. Tests à écrire

Conventions du dépôt (architecture 9.9 ; carte 08) : `x.test.ts` sans base, `x.db.test.ts` avec base, à côté du module ; vitest ; `vi.mock` pour les modules serveur dans les tests de server actions (`team/actions.test.ts`, existe) ; `fetchImpl` injecté, jamais un vrai service ; fixtures `createTestTenant` (`src/test/fixtures.ts:44`) et `seed-agents.ts` (chapitre 01, 16.1). Titres des tests en français.

### 16.1 La liste

| Fichier | Genre | Ce qu'il prouve | PR |
|---|---|---|---|
| `src/components/verre/shell/sidebar.test.ts` (existe) | unit | La pastille, `99+`, l'ordre de `NAV` (section 3.4) | 07b, 07c |
| `src/test/contracts/guides-docs.test.ts` (existe) | unit | La phrase du guide suit `NAV` : passe une fois le guide changé | 07b |
| `src/test/contracts/page-links.test.ts` (existe) | unit | `/agents` et `/agents/a-valider` existent : passe avec les pages | 07b, 07c |
| `src/app/(app)/layout.test.ts` (existe) | unit | Le faux `readSidebar` rend `pending: 0` | 07c |
| `src/server/shell/shell.db.test.ts` (existe) | db | `readSidebar(...).pending` : les siennes, pas expirées, pas de simulation (3.4) | 07c |
| `src/components/verre/agents/model.test.ts` | unit | Lecture de l'adresse ; montants ; groupes ; `runTone` (`destructive` pour `echouee`) ; une clé par statut, raison et type, et aucun `{` dans `agents.kinds` (16.2). N'importe ni `@/server/db` ni `drizzle-orm` (`ui-imports.test.ts`) | 07b |
| `src/server/agents/runs.test.ts` | unit | `RUN_STATUSES`, `RUN_REASONS`, `RUN_TRIGGERS` égales aux listes de `executionsAgent` ; `stepDetail` (16.3) | 07a |
| `src/server/agents/activation.test.ts` | unit | `availabilityOf` (« au moins une famille »), `requiredSettings`, `checkSettings`, `resolveWrite`, `choosableCeiling` | 07a |
| `src/server/agents/activation.db.test.ts` | db | Activer ; réactiver garde le cran ; une fiche d'équipe refusée à un membre ordinaire (`interdit`) ; `coupe` ; deux administrateurs sur la même fiche d'équipe (`existe`) ; un membre ne règle pas l'activation d'équipe ; **un second administrateur reçoit `interdit` en changeant le cran, en coupant et en remettant en service l'activation d'équipe du premier** ; `setOrgAgentSettings` refusé à un membre | 07a |
| `src/server/agents/runs.db.test.ts` | db | L'exécution d'un autre est `null`, même pour un administrateur ; exécution illisible ; groupes de « À valider » ; **groupe illisible sans paramètres, `confirmBlock` à `source`, puis `coupe` quand les agents sont coupés** ; **`readPendingSummary` compte 60 actions d'une exécution sans en perdre** (16.4) | 07a |
| `src/server/control/overview.db.test.ts` | db | `readMonthCost` ne compte que les siennes et que `reel` ; `readOrgBudget` nul pour un membre, rempli pour un administrateur | 07a |
| `src/app/(app)/agents/actions.test.ts` | unit | Entrées refusées sans appel ; codes rendus ; panne notée et code `erreur` ; revalidation ; `refusePendingActionAction` ne rend que `{ ok }` (16.5) | 07b |
| `src/app/(app)/discussions/actions.test.ts` (existe) | unit | `decideActionAction` revalide la mise en page pour une action d'agent, pas pour une action de discussion ; **`confirmer` rend `null` sans appeler `decideAction` quand `confirmBlock` rend `coupe` ou `source` ; `annuler` ne l'appelle pas** | 07c |
| `src/server/email/send.test.ts` | unit | L'URL, les en-têtes, le corps ; `MailRefusedError` sans le corps de Resend, avec `retryAfterMs` sur un 429 à `Retry-After: 2` ; un lot de 101 refusé avant tout envoi ; `escapeHtml` des cinq caractères (16.6) | 07d |
| `src/server/channels/preferences.db.test.ts` | db | Défauts sans ligne ; enregistrer puis relire ; `slack_user_id` jamais écrit par `saveChannelPreferences` ; `slack` absent ne change pas la valeur en base ; `isTimeZone` ; `rememberLocale` écrit une langue nulle, jamais une langue posée | 07e |
| `src/app/(app)/layout.test.ts` (existe) | unit | Langue nulle et cookie `fr` : `rememberLocale(ctx, 'fr')` ; langue posée, ou cookie absent : aucun appel | 07e |
| `src/server/email/recap.test.ts` | unit | **Aucun paramètre d'action dans le corps** (architecture 9.12, point 1) ; échappement ; les deux langues ; `localDay` (16.7) | 07f |
| `src/server/email/recap.db.test.ts` | db | `sendRecap` : rien à dire, coupé, agents éteints, adresse non vérifiée : chacun écrit une ligne `echoue` du jour et `recaps_dus` ne rend plus la personne ; une ligne puis `deja` le même jour local ; deux `sendRecap` simultanés n'envoient qu'une fois ; une ligne `echoue` reprise une seule fois ; une ligne `en-file` jamais reprise ; contexte d'un parti nul | 07f |
| `src/server/channels/worker.db.test.ts` | db | `enqueueDueRecaps` ne fait rien sans Resend ; met en file les personnes de `recaps_dus` ; 201 personnes à l'adresse non vérifiée, puis une vérifiée : après un tic et ses envois, le tic suivant met en file la vérifiée | 07f |
| `src/server/slack/client.test.ts` | unit | `ok: false` lu sous un 200 ; code hors liste → `autre` ; 429 → `ratelimited` avec délai ; `isDeadToken` vrai pour les quatre codes, faux pour `ratelimited` ; aucun corps dans le message d'erreur | 07g |
| `src/server/slack/install.db.test.ts` | db | Le cookie scellé s'ouvre, falsifié non, vieux de 11 minutes non ; **retour sans session : 303 vers `/sign-in`** ; autre personne : `expire` ; membre ordinaire : `interdit` ; installation chiffrée ; même `team_id` ailleurs : `autre_espace` ; **réinstallation dans le même espace : liaisons gardées ; dans un autre : déliées** ; **`markSlackInvalid` sous le contexte d'un membre ordinaire : `readInstallation` rend `null`, une réinstallation remet `invalide_le` à nul** ; désinstaller délie tout le monde | 07g |
| `src/server/slack/link.db.test.ts` | db | `lie` et `slack = vrai` ; `adresse` ; `inconnu` ; `pris` quand un collègue a déjà ce compte ; `token_revoked` → `installation` et installation invalide | 07g |
| `src/server/slack/manifest.test.ts` | unit | Les portées du YAML sont `SLACK_BOT_SCOPES`, les deux adresses sont celles des routes | 07g |
| `src/test/contracts/slack-token.test.ts` | unit | Seul `src/server/slack/install.ts` nomme `botToken` hors du schéma | 07g |
| `src/test/contracts/route-guards.db.test.ts` (existe) | db | `PUBLIC` gagne `/api/v1/slack/installation/retour` (07g) et `/api/v1/slack/interactions` (07h), chacune avec son commentaire ; `POST /api/v1/slack/installation` répond 401 sans session | 07g, 07h |
| `src/server/slack/interactions.test.ts` | unit | Signature fausse : 401, rien en file ; « Ouvrir » : 200, rien en file ; personne liée : un job aux seuls identifiants (16.8) | 07h |
| `src/server/slack/post.test.ts` | unit | Le bouton « Valider » seulement si `approve` ; une ligne sans bouton dit « À valider dans Leon » ; 22 blocs au plus | 07h |
| `src/server/channels/click.test.ts` | unit | `validatesFromChannel` revérifié ; `decideAction` jamais appelé pour une note de CRM, ni quand `confirmBlock` rend `coupe` ou `source` ; `undoAction` seulement si `undoable` ; l'issue répondue dans le fil ; un jeton mort marque l'installation invalide (16.9) | 07h |
| `src/server/channels/notify.db.test.ts` | db | Rien sans Slack lié, ni agents coupés, ni installation invalide ; une ligne et un job ; une seconde notification de la même exécution ne met rien ; **un envoi à la file qui lève, puis un rappel six minutes plus tard : remis en file** ; le message ne contient que les actions encore en attente ; `channel_not_found` délie la personne ; `token_revoked` marque l'installation invalide sans lever ; `ratelimited` laisse la ligne `en-file` et lève | 07h |
| `src/server/channels/worker.test.ts` | unit | Un `MailRefusedError(429, 2000)` remet le job (`reportLater`, `startAfter` d'au moins 60 s, `reprise` + 1) sans lever ; à `reprise: 5`, il lève ; même chose pour `SlackApiError('ratelimited')` sur `canal-envoyer` | 07f, 07h |
| `src/server/agents/engine/run.db.test.ts` (chapitre 04) | db | Un cas de plus : une exécution `faite` avec deux propositions appelle `notifyProposed` ; un job rejoué sur une exécution finie aussi (`deja-finie`) | 07h |

### 16.2 `src/components/verre/agents/model.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import { ACTION_KINDS, actionProvider, actionVerb } from '@/lib/actions';
import { RUN_REASONS, RUN_STATUSES } from '@/lib/agents';
import { agentsHref, budgetShare, formatUsd, groupCards, parseAgentsParams, runTone } from './model';

// Pas d'import de @/server/db ici : ui-imports.test.ts balaie aussi les tests de src/components. L'égalité des
// listes avec le schéma est dans src/server/agents/runs.test.ts (16.3).

const UUID = '7d3c1f0e-8a4b-4c2d-9e1f-0a1b2c3d4e5f';

describe('les textes des listes', () => {
  it('ont chacun leur texte, en français et en anglais', () => {
    for (const messages of [fr, en]) {
      for (const status of RUN_STATUSES) expect(messages.agents.runs.status[status]).toBeTruthy();
      for (const reason of RUN_REASONS) expect(messages.agents.runs.reason[reason]).toBeTruthy();
      for (const kind of ACTION_KINDS) {
        const tool = messages.agents.kinds[actionProvider(kind) as keyof typeof messages.agents.kinds];
        const title: unknown = tool?.[actionVerb(kind) as keyof typeof tool];
        expect(title, kind).toBeTruthy();
        // Un titre qui sort de Leon (récapitulatif, Slack) ne prend aucun argument : il ne peut porter aucun
        // paramètre d'action (architecture 9.12, point 1 ; écart 20).
        expect(String(title), kind).not.toContain('{');
      }
    }
  });
});

describe('runTone', () => {
  it('donne un ton du kit à chaque état, rouge pour une exécution échouée', () => {
    expect(runTone('echouee')).toBe('destructive');
    expect(runTone('faite')).toBe('success');
    expect(runTone('en-attente')).toBe('warning');
    expect(runTone('ignoree')).toBe('neutral');
  });
});

describe('parseAgentsParams', () => {
  it('lit une adresse complète', () => {
    expect(
      parseAgentsParams({
        vue: 'executions',
        execution: UUID.toUpperCase(),
        agent: 'suivi_echange',
        etat: 'faite',
        avant: '2026-11-19T10:00:00.000Z',
      }),
    ).toEqual({
      view: 'executions',
      executionId: UUID,
      agentId: 'suivi_echange',
      status: 'faite',
      before: new Date('2026-11-19T10:00:00.000Z'),
      agent: 'suivi_echange',
    });
  });

  it.each([
    [{ vue: 'admin' }, 'catalogue'],
    [{ vue: ['cout', 'executions'] }, 'cout'],
    [{}, 'catalogue'],
  ])('ne croit pas la vue %o', (raw, view) => {
    expect(parseAgentsParams(raw).view).toBe(view);
  });

  it('écarte un identifiant, un agent, un état ou une date mal formés', () => {
    const params = parseAgentsParams({
      execution: "1' or 1=1",
      agent: '../etc',
      etat: 'supprimee',
      avant: 'hier',
    });
    expect(params).toMatchObject({ executionId: null, agentId: null, status: null, before: null });
  });
});

describe('agentsHref', () => {
  it('écrit les paramètres utiles dans un ordre fixe', () => {
    expect(agentsHref({ execution: UUID, vue: 'executions', agent: null })).toBe(
      `/agents?vue=executions&execution=${UUID}`,
    );
    expect(agentsHref({})).toBe('/agents');
  });
});

describe('les montants', () => {
  it('formatent en dollars, trois décimales sous un cent', () => {
    expect(formatUsd(0.46, 'fr')).toMatch(/^0,46\s?\$US$|^0,46\s\$$/);
    expect(formatUsd(0.004, 'en')).toBe('$0.004');
    expect(formatUsd(0, 'en')).toBe('$0.00');
  });

  it('bornent la part du plafond à 100', () => {
    expect(budgetShare(0.24, 3.1, 160)).toBe(2);
    expect(budgetShare(100, 100, 160)).toBe(100);
    expect(budgetShare(1, 1, 0)).toBe(100);
  });
});

describe('groupCards', () => {
  const card = (id: string, extra: object) =>
    ({ id, scope: 'personne', activation: null, availability: { ready: true }, ...extra }) as never;
  it('range les siennes, celles à activer, celles à brancher, et l’équipe à part', () => {
    const groups = groupCards([
      card('a', { activation: { active: true } }),
      card('b', {}),
      card('c', { availability: { ready: false } }),
      card('d', { scope: 'equipe' }),
    ]);
    expect(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map((c) => c.id)]))).toEqual({
      mine: ['a'],
      ready: ['b'],
      missing: ['c'],
      team: ['d'],
    });
  });
});
```

Le format exact de `Intl.NumberFormat('fr-FR', { currency: 'USD' })` (« 0,46 $US » ou « 0,46 $ ») dépend des données ICU de Node : le test accepte les deux, à fixer au premier passage en CI.

### 16.3 `src/server/agents/runs.test.ts` (sans base)

Hors de `src/app` et `src/components` : il peut lire le schéma Drizzle sans tomber sous `ui-imports.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { RUN_REASONS, RUN_STATUSES, RUN_TRIGGERS } from '@/lib/agents';
import { executionsAgent } from '@/server/db/schema/agents';
import { stepDetail } from './runs';

const enumOf = (column: { enumValues?: readonly string[] }) => [...(column.enumValues ?? [])];

describe('les listes du navigateur', () => {
  // Le schéma Drizzle recopie le check de 0079 (schema-contract.db.test.ts) ; ici, src/lib/agents.ts recopie le schéma.
  it('sont celles de executions_agent', () => {
    expect([...RUN_STATUSES]).toEqual(enumOf(executionsAgent.statut));
    expect([...RUN_REASONS]).toEqual(enumOf(executionsAgent.raison));
    expect([...RUN_TRIGGERS]).toEqual(enumOf(executionsAgent.declencheur));
  });
});

describe('stepDetail', () => {
  it('lit une étape par sa forme, jamais le texte d’une source', () => {
    expect(stepDetail({ refs: ['a', 'b'] }, null)).toEqual({ kind: 'sources', count: 2 });
    expect(stepDetail({ texte: 'Bonjour' }, null)).toEqual({ kind: 'texte', text: 'Bonjour' });
    expect(stepDetail(null, { reveilLe: '2026-11-21T08:00:00Z' })).toEqual({
      kind: 'attente',
      until: '2026-11-21T08:00:00Z',
    });
    expect(stepDetail(null, null)).toEqual({ kind: 'vide' });
  });
});
```

Le chapitre 09 ajoute `boucle` à `RUN_REASONS` et au schéma dans la même PR (09a) : ce test le tient.

### 16.4 `src/server/agents/runs.db.test.ts` (les cas qui protègent les droits)

```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { sources } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { seedAgentAction, seedExecution, setRole } from '@/test/seed-agents';
import { listPendingGroups, listRuns, readRun } from './runs';

describe('le journal', () => {
  it("ne rend jamais l'exécution d'un autre, même à un administrateur", async () => {
    const { members: [claire, karim] } = await createTestTenant(['Claire', 'Karim']);
    if (!claire || !karim) throw new Error('fixtures');
    await setRole(karim, 'admin');
    const id = await seedExecution(claire);
    expect(await readRun(karim, id)).toBeNull();
    expect((await listRuns(karim)).runs).toEqual([]);
    expect((await readRun(claire, id))?.id).toBe(id);
  });

  it('ne montre ni étapes, ni actions, ni titre quand une source lue ne se voit plus', async () => {
    const { members: [claire] } = await createTestTenant(['Claire']);
    if (!claire) throw new Error('fixtures');
    const { sourceId } = await seedSource(claire, { kind: 'fathom', title: 'Point devis' });
    const id = await seedExecution(claire, { sourceId, sourceIds: [sourceId] });
    await seedAgentAction(claire, id);
    expect(await readRun(claire, id)).toMatchObject({ readable: true, source: { title: 'Point devis' } });
    // La source n'est plus partagée à Claire : son ACL ne nomme plus aucun de ses principaux.
    await adminDb.update(sources).set({ acl: [randomUUID()] }).where(eq(sources.id, sourceId));
    expect(await readRun(claire, id)).toMatchObject({
      readable: false,
      steps: [],
      actions: [],
      source: { title: null, tool: null, at: null },
    });
  });

  it('groupe « À valider » par exécution, la plus récente d’abord, sans expirées ni simulations', async () => {
    const { members: [claire] } = await createTestTenant(['Claire']);
    if (!claire) throw new Error('fixtures');
    const older = await seedExecution(claire);
    const newer = await seedExecution(claire);
    await seedAgentAction(claire, older);
    await seedAgentAction(claire, newer);
    await seedAgentAction(claire, newer);
    await seedAgentAction(claire, newer, { expireLe: new Date(Date.now() - 1000) });
    await seedAgentAction(claire, newer, { simulation: true });
    const groups = await listPendingGroups(claire);
    expect(groups.map((g) => [g.executionId, g.actions.length])).toEqual([
      [newer, 2],
      [older, 1],
    ]);
  });

  it('ne montre plus les paramètres, ni ne laisse valider, une proposition dont la source ne se voit plus', async () => {
    const { members: [claire] } = await createTestTenant(['Claire']);
    if (!claire) throw new Error('fixtures');
    const { sourceId } = await seedSource(claire, { kind: 'fathom', title: 'Point devis' });
    const id = await seedExecution(claire, { sourceId, sourceIds: [sourceId] });
    const actionId = await seedAgentAction(claire, id);
    expect(await confirmBlock(claire, actionId)).toBeNull();
    await adminDb.update(sources).set({ acl: [randomUUID()] }).where(eq(sources.id, sourceId));
    const [group] = await listPendingGroups(claire);
    expect(group).toMatchObject({ readable: false, actions: [], source: { title: null } });
    expect(group?.hidden.map((h) => h.id)).toEqual([actionId]);
    expect(JSON.stringify(group)).not.toContain('"params"');
    expect(await confirmBlock(claire, actionId)).toBe('source');
  });

  it('gèle la validation quand les agents sont coupés, pas le refus', async () => {
    const { members: [claire] } = await createTestTenant(['Claire']);
    if (!claire) throw new Error('fixtures');
    const actionId = await seedAgentAction(claire, await seedExecution(claire));
    await adminDb
      .insert(reglagesOrganisation)
      .values({ tenantId: claire.tenantId, agentsActifs: false })
      .onConflictDoUpdate({ target: reglagesOrganisation.tenantId, set: { agentsActifs: false } });
    expect(await confirmBlock(claire, actionId)).toBe('coupe');
  });

  it("compte les groupes de l'Accueil en entier, au-delà de 50 propositions", async () => {
    const { members: [claire] } = await createTestTenant(['Claire']);
    if (!claire) throw new Error('fixtures');
    const id = await seedExecution(claire);
    for (let i = 0; i < 60; i += 1) await seedAgentAction(claire, id);
    const summary = await readPendingSummary(claire);
    expect(summary.total).toBe(60);
    expect(summary.groups.map((g) => g.count)).toEqual([60]);
  });
});
```

`sourceIds` est la colonne `source_ids` (chapitre 01, 14.1). La source retirée à Claire existe encore : c'est le cas que `purger_executions` ne couvre pas (section 4.3). `seedAgentAction` rend l'identifiant de l'action (chapitre 01, 16.1) ; les imports gagnent `confirmBlock`, `readPendingSummary` (`./runs`) et `reglagesOrganisation` (`@/server/db/schema/organisation`).

### 16.5 `src/app/(app)/agents/actions.test.ts`

```ts
import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decideAction } from '@/server/actions/decide';
import { activateAgent, setActivation, setOrgAgentSettings } from '@/server/agents/activation';
import { requireUserContext } from '@/server/auth/session';
import { logError } from '@/server/log';
import {
  activateAgentAction,
  refusePendingActionAction,
  setOrgAgentSettingsAction,
  updateActivationAction,
} from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/agents/activation', () => ({
  activateAgent: vi.fn(),
  setActivation: vi.fn(),
  setOrgAgentSettings: vi.fn(),
}));
vi.mock('@/server/actions/decide', () => ({ decideAction: vi.fn() }));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));

const ctx = { tenantId: 't', userId: 'u', principals: ['u'] };
const ID = '7d3c1f0e-8a4b-4c2d-9e1f-0a1b2c3d4e5f';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(ctx as never);
});

describe('activateAgentAction', () => {
  it('active, puis revalide /agents', async () => {
    vi.mocked(activateAgent).mockResolvedValue({ ok: true, id: ID });
    expect(await activateAgentAction({ agentId: 'suivi_echange', settings: {} })).toEqual({ ok: true });
    expect(activateAgent).toHaveBeenCalledWith(ctx, { agentId: 'suivi_echange', settings: {} });
    expect(revalidatePath).toHaveBeenCalledWith('/agents');
  });

  it.each([null, 'suivi_echange', { agentId: 'Suivi' }, { agentId: '../x' }])(
    'refuse %o sans rien activer',
    async (input) => {
      expect(await activateAgentAction(input)).toEqual({ ok: false, error: 'introuvable' });
      expect(activateAgent).not.toHaveBeenCalled();
    },
  );

  it('refuse des réglages trop gros', async () => {
    const settings = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`k${i}`, 'v']));
    expect(await activateAgentAction({ agentId: 'suivi_echange', settings })).toEqual({
      ok: false,
      error: 'reglage',
    });
  });

  it('rend le code du serveur, sans revalider', async () => {
    vi.mocked(activateAgent).mockResolvedValue({ ok: false, error: 'manque' });
    expect(await activateAgentAction({ agentId: 'suivi_echange' })).toEqual({ ok: false, error: 'manque' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('note une panne et ne la montre pas', async () => {
    vi.mocked(activateAgent).mockRejectedValue(new Error('select … from agents_actives'));
    expect(await activateAgentAction({ agentId: 'suivi_echange' })).toEqual({ ok: false, error: 'erreur' });
    expect(logError).toHaveBeenCalledWith('agents.activation', expect.any(Error), { agentId: 'suivi_echange' });
  });
});

describe('updateActivationAction', () => {
  it('refuse une demande qui ne change rien', async () => {
    expect(await updateActivationAction({ activationId: ID })).toEqual({ ok: false, error: 'reglage' });
    expect(setActivation).not.toHaveBeenCalled();
  });

  it('refuse un cran inconnu', async () => {
    expect(await updateActivationAction({ activationId: ID, autonomy: 'tout' })).toEqual({
      ok: false,
      error: 'reglage',
    });
  });
});

describe('setOrgAgentSettingsAction', () => {
  it('arrondit le plafond au cent et le borne', async () => {
    vi.mocked(setOrgAgentSettings).mockResolvedValue(true);
    await setOrgAgentSettingsAction({ monthBudgetUsd: 12.345 });
    expect(setOrgAgentSettings).toHaveBeenCalledWith(ctx, { monthBudgetUsd: 12.35 });
    expect(await setOrgAgentSettingsAction({ monthBudgetUsd: 100_001 })).toEqual({ ok: false });
    expect(await setOrgAgentSettingsAction({ monthBudgetUsd: -1 })).toEqual({ ok: false });
  });
});

describe('refusePendingActionAction', () => {
  it('refuse, et ne rend rien de la ligne au navigateur', async () => {
    vi.mocked(decideAction).mockResolvedValue({
      id: ID,
      status: 'annulee',
      params: { body: 'Paul Girard' },
    } as never);
    expect(await refusePendingActionAction(ID)).toEqual({ ok: true });
    expect(decideAction).toHaveBeenCalledWith(ctx, ID, 'annuler');
  });

  it('ne refuse rien sur un identifiant mal formé', async () => {
    expect(await refusePendingActionAction('x')).toEqual({ ok: false });
    expect(decideAction).not.toHaveBeenCalled();
  });
});
```

`Math.round(12.345 * 100) / 100` vaut 12.35 en double ; 1.005 donnerait 1 (représentation binaire). Le test prend 12.345, qui passe ; l'arrondi exact au cent n'est pas un enjeu pour un plafond.

### 16.6 `src/server/email/send.test.ts` (extrait)

```ts
it('ne met jamais le corps de la réponse de Resend dans l’erreur', async () => {
  const fetchImpl = vi.fn(async () => new Response('{"message":"invalid to: claire@example.com"}', { status: 422 }));
  const error = await sendEmail({ to: 'claire@example.com', subject: 'S', html: '<p>x</p>' }, { fetchImpl }).catch(
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(MailRefusedError);
  expect(String(error)).not.toContain('claire');
});

it('porte le délai demandé sur un refus pour débit', async () => {
  const fetchImpl = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '2' } }));
  const error = await sendEmail({ to: 'a@example.com', subject: 'S', html: '' }, { fetchImpl }).catch(
    (e: unknown) => e,
  );
  expect(error).toMatchObject({ status: 429, retryAfterMs: 2000 });
});

it('refuse un lot de 101 avant tout envoi', async () => {
  const fetchImpl = vi.fn();
  const email = { to: 'a@example.com', subject: 'S', html: '' };
  await expect(sendEmailBatch(Array(101).fill(email), { fetchImpl })).rejects.toThrow(RangeError);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('échappe les cinq caractères', () => {
  expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
    '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
  );
});
```

### 16.7 `src/server/email/recap.test.ts` (code complet)

Le test que l'architecture demande (9.12, point 1) : aucun paramètre d'action dans le corps.

```ts
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import { localDay, type RecapCounts, recapKey, renderRecap } from './recap';

const APP = 'https://leon.example';

// Ce qu'une action d'agent porte dans ses paramètres (Exemple fictif, chapitre 08, 4.5) : rien de cela ne doit
// sortir. Les identifiants des actions non plus.
const SECRET_BITS = [
  'Paul Girard',
  'Girard Immobilier',
  'résidence Les Tilleuls',
  'devis révisé',
  '7d3c1f0e-8a4b-4c2d-9e1f-0a1b2c3d4e5f',
];

const counts: RecapCounts = {
  pending: 3,
  byKind: [
    { kind: 'hubspot.creer_note', count: 2 },
    { kind: 'outlook.creer_brouillon', count: 1 },
  ],
  doneWithoutClick: 0,
  actionIds: ['7d3c1f0e-8a4b-4c2d-9e1f-0a1b2c3d4e5f'],
};

describe('le récapitulatif', () => {
  it.each([
    ['fr', fr, 'Leon : 3 actions à valider', '2 × Note dans HubSpot'],
    ['en', en, 'Leon: 3 actions to approve', '2 × Note in HubSpot'],
  ] as const)('en %s : des comptes, des titres génériques, un lien', (locale, messages, subject, line) => {
    const mail = renderRecap({ counts, locale, messages, appUrl: APP });
    expect(mail.subject).toBe(subject);
    expect(mail.text).toContain(line);
    expect(mail.html).toContain(`href="${APP}/agents/a-valider"`);
    expect(mail.html).toContain(`href="${APP}/agents?vue=canaux"`);
    expect(mail.html).toContain(`lang="${locale}"`);
  });

  it("ne porte aucun paramètre d'action, aucun résumé, aucun identifiant", () => {
    // renderRecap ne reçoit que des comptes : le test vérifie aussi qu'il n'en reçoit pas plus.
    const mail = renderRecap({ counts, locale: 'fr', messages: fr, appUrl: APP });
    for (const part of [mail.subject, mail.html, mail.text]) {
      for (const bit of SECRET_BITS) expect(part).not.toContain(bit);
    }
    expect(Object.keys(counts.byKind[0] ?? {})).toEqual(['kind', 'count']);
  });

  it('échappe ce qu’il écrit, même les textes du produit', () => {
    const messages = structuredClone(fr);
    messages.agents.recap.greeting = '<script>alert(1)</script>';
    const mail = renderRecap({ counts, locale: 'fr', messages, appUrl: APP });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('ne garde que les cinq types les plus fréquents', () => {
    const many: RecapCounts = {
      ...counts,
      pending: 6,
      byKind: (
        ['hubspot.creer_note', 'hubspot.creer_tache', 'outlook.creer_brouillon', 'linear.creer_ticket', 'jira.creer_ticket', 'asana.creer_tache'] as const
      ).map((kind) => ({ kind, count: 1 })),
    };
    const mail = renderRecap({ counts: many, locale: 'fr', messages: fr, appUrl: APP });
    expect(mail.text.match(/^- /gm)).toHaveLength(5);
  });

  it('parle de ce qui est parti sans clic quand rien n’attend', () => {
    const mail = renderRecap({
      counts: { pending: 0, byKind: [], doneWithoutClick: 2, actionIds: [] },
      locale: 'fr',
      messages: fr,
      appUrl: APP,
    });
    expect(mail.subject).toBe('Leon : ce que vos agents ont fait');
    expect(mail.html).toContain(`href="${APP}/agents?vue=executions"`);
    expect(mail.text).not.toContain('expire');
  });
});

describe('le jour de la personne', () => {
  it('suit son fuseau', () => {
    const now = new Date('2026-11-20T23:30:00Z');
    expect(localDay(now, 'Europe/Paris')).toBe('2026-11-21');
    expect(localDay(now, 'America/New_York')).toBe('2026-11-20');
    expect(recapKey('u', '2026-11-21')).toBe('recap:u:2026-11-21');
  });
});
```

### 16.8 `src/server/slack/interactions.test.ts` (code complet)

```ts
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSlackInteractionRoutes } from './interactions';

const mocks = vi.hoisted(() => ({ env: { LEON_SLACK_SIGNING_SECRET: 'secret-de-test' as string | undefined } }));
vi.mock('@/server/env', () => ({ env: mocks.env }));
vi.mock('@/server/channels/queue', () => ({ enqueueChannelClick: vi.fn() }));
vi.mock('@/server/db/client', () => ({ db: {} }));

const NOW = 1_763_600_000_000;
const ACTION = '7d3c1f0e-8a4b-4c2d-9e1f-0a1b2c3d4e5f';
const account = { tenantId: '0b6c2f7e-1d2a-4e3b-8c4d-5e6f7a8b9c0d', userId: '1c7d3a8f-2e3b-4f4c-9d5e-6f7a8b9c0d1e' };

const payload = (actionId: string, value?: string) =>
  JSON.stringify({
    type: 'block_actions',
    team: { id: 'T0001' },
    user: { id: 'U0001' },
    channel: { id: 'D0001' },
    message: { ts: '1763600000.000200' },
    actions: [{ action_id: actionId, ...(value ? { value } : {}) }],
  });

function request(body: string, options: { secret?: string; at?: number } = {}) {
  const at = String(Math.floor((options.at ?? NOW) / 1000));
  const signature = `v0=${createHmac('sha256', options.secret ?? 'secret-de-test')
    .update(`v0:${at}:${body}`)
    .digest('hex')}`;
  return new Request('http://localhost/interactions', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-slack-request-timestamp': at,
      'x-slack-signature': signature,
    },
    body,
  });
}

const form = (json: string) => new URLSearchParams({ payload: json }).toString();

let enqueue: ReturnType<typeof vi.fn>;
let findAccount: ReturnType<typeof vi.fn>;
let routes: ReturnType<typeof createSlackInteractionRoutes>;

beforeEach(() => {
  mocks.env.LEON_SLACK_SIGNING_SECRET = 'secret-de-test';
  enqueue = vi.fn(async () => 'job');
  findAccount = vi.fn(async () => account);
  routes = createSlackInteractionRoutes({ now: () => NOW, enqueue, findAccount } as never);
});

describe('la route des clics Slack', () => {
  it('met en file un clic « Valider » signé, avec des identifiants seulement', async () => {
    const response = await routes.request(request(form(payload('leon_valider', ACTION))));
    expect(response.status).toBe(200);
    expect(findAccount).toHaveBeenCalledWith('T0001', 'U0001');
    expect(enqueue).toHaveBeenCalledWith({
      ...account,
      actionId: ACTION,
      decision: 'confirmer',
      channel: 'D0001',
      ts: '1763600000.000200',
    });
  });

  it.each([
    ['une signature d’un autre secret', { secret: 'autre' }],
    ['un horodatage de plus de 300 s', { at: NOW - 301_000 }],
  ])('refuse %s, sans rien lire ni mettre en file', async (_, options) => {
    const response = await routes.request(request(form(payload('leon_valider', ACTION)), options));
    expect(response.status).toBe(401);
    expect(findAccount).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('acquitte « Ouvrir dans Leon » sans rien faire', async () => {
    const response = await routes.request(request(form(payload('leon_ouvrir'))));
    expect(response.status).toBe(200);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('acquitte un clic dont la valeur n’est pas un identifiant', async () => {
    const response = await routes.request(request(form(payload('leon_valider', 'drop table actions'))));
    expect(response.status).toBe(200);
    expect(findAccount).not.toHaveBeenCalled();
  });

  it('ne fait rien pour un compte Slack qui n’est lié à personne', async () => {
    findAccount.mockResolvedValue(null);
    const response = await routes.request(request(form(payload('leon_valider', ACTION))));
    expect(response.status).toBe(200);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('répond 404 quand l’appli n’est pas réglée', async () => {
    mocks.env.LEON_SLACK_SIGNING_SECRET = undefined;
    const response = await routes.request(request(form(payload('leon_valider', ACTION))));
    expect(response.status).toBe(404);
  });
});
```

### 16.9 `src/server/channels/click.test.ts` (les deux cas qui comptent)

```ts
// Faux : readActionRow, toView, resolveTenantContext, readInstallation, readUserLocale, postSlackMessage ;
// confirmBlock passe par deps.block (le premier cas s'arrête avant de le lire).
it('ne valide jamais depuis Slack une note lue par des collègues', async () => {
  vi.mocked(readActionRow).mockResolvedValue(row({ enjeu: 'bas', audience: 'interne' }));
  const decide = vi.fn();
  expect(await decideFromChannel(job('confirmer'), { decide })).toBe('ouvrir');
  expect(decide).not.toHaveBeenCalled();
  expect(postSlackMessage).toHaveBeenCalledWith(
    'xoxb-test',
    { channel: 'D0001', threadTs: '1763600000.000200', message: { text: 'À valider dans Leon.', blocks: [] } },
    expect.anything(),
  );
});

it('valide un brouillon dans la boîte de la personne, par decideAction', async () => {
  vi.mocked(readActionRow).mockResolvedValue(row({ enjeu: 'bas', audience: 'soi' }));
  const decide = vi.fn(async () => ({ status: 'faite' }) as never);
  expect(await decideFromChannel(job('confirmer'), { decide, block: async () => null })).toBe('faite');
  expect(decide).toHaveBeenCalledWith(ctx, ACTION, 'confirmer');
});

it('ne valide pas quand les agents sont coupés, même un brouillon à soi', async () => {
  vi.mocked(readActionRow).mockResolvedValue(row({ enjeu: 'bas', audience: 'soi' }));
  const decide = vi.fn();
  expect(await decideFromChannel(job('confirmer'), { decide, block: async () => 'coupe' })).toBe('coupe');
  expect(decide).not.toHaveBeenCalled();
});
```

`row(...)` bâtit une ligne d'`actions` d'agent (`origine: 'agent'`, `status: 'proposee'`), `job(...)` un `ClickJob` valide ; `readUserLocale` rend `'fr'`.

## 17. Ordre de mise en œuvre

Une PR par sujet, branche `<prenom>/<sujet>`, worktree sous `.claude/worktrees/` (`CLAUDE.md`). Les trois premières font la PR 8 « Écrans » du jalon 1 (architecture 14.3), coupée en trois pour rester relisible.

| PR | Branche (exemple) | Contenu | Attend | Jalon |
|---|---|---|---|---|
| 07a | `amos/agents-lectures` | Vues de `src/lib/agents.ts` (4.1) ; `activation.ts` (4.2, sauf `readRaiseSuggestion`) ; `runs.ts` (4.3 : `readableRuns`, `confirmBlock` compris) ; `overview.ts` sans `readAcceptance` (4.4) ; dans les fichiers du chapitre 05 : `countPendingIn` et `countPendingByRun` (`store.ts`, 3.2), `ActionView.reversible` (`actions.ts`, `parseActionView`, `toView`, 9.2) ; leurs tests (`activation.test.ts`, `activation.db.test.ts`, `runs.test.ts`, `runs.db.test.ts`, `overview.db.test.ts`, deux cas de `src/lib/actions.test.ts`) | migrations 0078, 0079, 0080 (chapitre 01) ; `store.ts` et `decide.ts` déplacés (chapitre 05, PR 7) ; `src/lib/agents.ts` (chapitre 06, 06a) ; `definition.ts`, `catalog/index.ts`, `readAgentSettings` (chapitre 02, PR 5) ; `fields.ts`, `budget.ts` (chapitre 04). `TimedAction` ne change pas ; `reversible` est porté ici (écarts 1 et 2 de la section 18, à reprendre dans le chapitre 05 s'il est relu avant) | 1 |
| 07b | `amos/agents-ecran` | `nav.ts`, le guide et `sidebar.test.ts` (titre) ; `/agents` : `page.tsx`, `src/components/verre/agents/` (`index`, `catalogue`, `executions`, `journal`, `cout`, `model` et son test) ; `agents/actions.ts` (8.1 sans `refusePendingActionAction`, 8.2) et son test ; clés `navigation.agents` et `agents.*` du jalon (10), **dont `agents.catalog.suivi_echange`** (texte du chapitre 08, 3.5) | 07a. La fiche `suivi_echange` (08b, PR 9 de l'architecture) vient après : le catalogue est vide (`agents.catalogEmpty`), mais les clés de la fiche sont là, sans quoi `catalog.${id}.name` ne passe ni `translation-keys.test.ts` ni `pnpm typecheck` (écart 21) | 1 |
| 07c | `david/agents-a-valider` | `/agents/a-valider` et `a-valider.tsx` (`HiddenActionCard` compris) ; `refusePendingActionAction` (8.1) ; la section de l'Accueil ; la pastille (`shell.ts`, `sidebar.tsx`, `mobile-bar.tsx`, `app-shell.tsx`, `layout.tsx`, leurs tests) ; `decideActionAction` et sa garde `confirmBlock` (8.4) ; la carte et `canConfirm` (9) ; `shell.toValidate`, `agents.pending.*` | 07b ; clés de la carte du chapitre 05 (15) | 1 |
| 07d | `david/email-envoi` | `email/send.ts` (`retryAfterMs`, `RESEND_MIN_INTERVAL_MS` compris), les trois appelants, `send.test.ts` | rien : peut passer avant le jalon 1 | indépendante |
| 07e | `amos/canaux-preferences` | `channels/preferences.ts` (`rememberLocale`, `readChannelsView` avec `slack: null`) ; `setLocaleAction` ; la langue du cookie recopiée (`shell.ts`, `layout.tsx`, 12.2) ; la vue Canaux sans Slack ; `ChannelsViewData` ; `saveChannelPreferencesAction` ; `agents.channels.*` (sans Slack). Aucun import de `src/server/slack/` | 0084 (chapitre 01) | après |
| 07f | `amos/recapitulatif` | `email/recap.ts` ; `channels/queue.ts` et `channels/worker.ts` **sans les lignes `// 07h`** (deux files `recap-*`, `RecapJobSchema`, `enqueueRecap`, `reportLater`) ; `startChannelsWorker` dans `instrumentation-node.ts` ; `agents.recap.*` ; `recap.test.ts`, `recap.db.test.ts`, `worker.db.test.ts`, `worker.test.ts` (partie récapitulatif) | 07d, 07e | après |
| 07g | `david/slack-installation` | `slack/client.ts`, `manifest.ts`, `install.ts`, `link.ts` ; `INSTALL_RETURNS` dans `src/lib/agents.ts` et `slack` dans `parseAgentsParams` (12.3) ; routes d'installation dans `app.ts`, le retour dans `PUBLIC` ; variables `LEON_SLACK_*` (`env.ts`, `.env.example`) ; `docs/guides/slack-manifeste.yml` ; Slack dans la vue Canaux (`readChannelsView` remplit `slack`) et ses actions (12.4) ; tests 16.1 de 07g | 07e ; les ajouts à 0084 de la section 14.5 (`invalide_le`, `marquer_slack_invalide`, `delier_slack_organisation` : écart 22) ; l'appli créée chez Slack à partir du manifeste (geste manuel de David) | après |
| 07h | `david/slack-messages` | `slack/post.ts`, `interactions.ts` et sa route (`PUBLIC` de `route-guards`) ; `channels/notify.ts`, `click.ts` ; les lignes `// 07h` de `queue.ts` et `worker.ts` (`canal-envoyer`, `canal-clic`) ; `getChannelsBoss()` au démarrage du rôle `web` ; le point d'appel dans `run.ts` (15.2) ; `agents.slack.*` ; tests de 07h | 07f, 07g ; `verify.ts` (chapitre 03, 4) ; le p95 de la route des clics mesuré (14.8) | après |
| 07i | `amos/agents-annuler` | `undoActionAction`, le bouton « Annuler » de la carte ; `readRaiseSuggestion` et sa ligne dans le panneau ; le message « fait » (`notifyAction` genre `fait`) | `undoAction` (chapitre 05, 8a), `AUTONOMY_CEILING` relevé, `mustNotify` (chapitre 06) : la PR du premier cran au-dessus de `propose` | après |
| 07j | `amos/agents-statistiques` | `readAcceptance` et sa table dans la vue Coût | 0085 (chapitre 01) ; trois personnes sur un même agent | après |
| 07k | `david/agents-equipe` | Le groupe « Pour l'équipe » du catalogue ; `takeOverTeamAgentAction` et son bouton | les agents d'équipe (architecture 14.3 ; question Q4) | après |

Les fichiers écrits en deux temps, et ce que chaque PR en livre :

| Fichier | Première PR | Ce qu'elle livre | PR suivante | Ce qu'elle ajoute |
|---|---|---|---|---|
| `src/server/channels/queue.ts` | 07f | `CHANNEL_QUEUES.recapTick`, `.recapSend`, `OPTIONS` à deux files, `RecapJobSchema`, `recapJobKey`, `getChannelsBoss`, `enqueueRecap`, `reportLater` (file `recap-envoyer` seule) | 07h | `send`, `click`, leurs `OPTIONS`, `ChannelMessageJobSchema`, `ClickJobSchema`, `enqueueChannelMessage`, `enqueueChannelClick`, l'import de `slack/client.ts` |
| `src/server/channels/worker.ts` | 07f | Le tic, `enqueueDueRecaps`, le lecteur de `recap-envoyer` | 07h | Les lecteurs de `canal-envoyer` et `canal-clic`, les imports de `click.ts`, `notify.ts`, `slack/client.ts` |
| `src/server/channels/preferences.ts` | 07e | Tout, `readChannelsView` avec `slack: null` | 07g | `slack` rempli quand `slackConfigured()` |
| `src/app/(app)/agents/actions.ts` | 07b | 8.1 (sans le refus), 8.2 | 07c ; 07e ; 07g ; 07i ; 07k | `refusePendingActionAction` ; `saveChannelPreferencesAction` ; les actions Slack ; `readRaiseSuggestionAction` ; `takeOverTeamAgentAction` |
| `src/components/verre/agents/model.ts` | 07b | 5.3 | 07g | `slack` dans `AgentsParams` et `parseAgentsParams` |
| `src/lib/agents.ts` (partie du chapitre 07) | 07a | 4.1 | 07e ; 07g | `ChannelsViewData` ; `INSTALL_RETURNS` |

Ce qu'un agent de code vérifie avant d'ouvrir chacune : `pnpm typecheck`, `pnpm lint`, `pnpm test` (projets `unit` et `db`), et, pour 07b et 07c, `page-links.test.ts`, `guides-docs.test.ts`, `translation-keys.test.ts`, `ui-imports.test.ts`. Pour 07g et 07h : `route-guards.db.test.ts`, `env-contract.test.ts`, `pgboss-wake.test.ts`.

## 18. Écarts avec l'architecture

Aucun nom de l'architecture n'a été changé. Ce qui suit ajoute, précise, ou touche un autre chapitre.

| # | Ce que dit l'architecture (ou un chapitre) | Ce qui heurte | Proposition, appliquée ici |
|---|---|---|---|
| 1 | Chapitre 05 (15.4) : la réversibilité avant le clic, « choix laissé au chapitre 07 » ; son `ActionView` (3.4) et son `toView` (9) n'ont pas le champ | La carte doit dire « Ne s'annule pas » avant le clic (architecture 9.6, point 5) | `ActionView.reversible: boolean`, posé par `toView` depuis la spec, lu par `parseActionView` avec le défaut prudent (9.2). La PR 07a porte ces quatre lignes dans les fichiers du chapitre 05, qui peut les reprendre à sa relecture |
| 2 | Chapitre 05 (9) : `TimedAction = ActionView & { createdAt }` ; `countPendingActions(ctx)` ouvre sa transaction ; `awaiting()` n'est pas exportée | « À valider » se groupe par exécution ; `readSidebar` lit tout dans une transaction (`shell.ts:12-14`) ; l'Accueil compte par exécution | `TimedAction` **ne change pas** : `listPendingGroups` relit `execution_id` des actions rendues (4.3), `sendChannelMessage` le lit sur la ligne (15.3). `store.ts` gagne `countPendingIn(tx, ctx)` (que `countPendingActions` appelle) et `countPendingByRun(tx, ctx, limit)`, sous la même condition (3.2), portés par la PR 07a |
| 3 | Architecture 8.5 : `requires.read`, « ce qu'il faut avoir branché » ; chapitre 09, E09-20 : une famille, ou toutes ? | Une fiche qui liste `projet` et `dev` ne s'afficherait à personne s'il fallait les deux | Au moins une des familles ; toutes les entrées de `requires.write` (`availabilityOf`, 4.2) |
| 4 | Architecture 6 : `activation.ts`, « activer, régler, lister ; `agentsAvailable(ctx)` » | Les noms ne sont pas fixés | `listAgentCards`, `activateAgent`, `setActivation`, `setOrgAgentSettings`, `agentsEnabled`, `availabilityOf`, `resolveWrite`, `requiredSettings` (E08-9), `checkSettings`, `ACTIVATION_ERRORS` ; après : `readRaiseSuggestion` |
| 5 | Architecture 6 : `control/overview.ts`, « exécutions, journal, coût, taux d'acceptation » ; `agents/runs.ts`, « lectures de `executions_agent` et `etapes_execution` » | Deux fichiers pour la même lecture | Le journal et les exécutions dans `runs.ts` ; `overview.ts` ne garde que les comptes (`readMonthCost`, `readOrgBudget`, `readAcceptance`) |
| 6 | Architecture 6 : `agents/page.tsx` et `a-valider/page.tsx` seulement | Quatre vues (catalogue, exécutions, coût, canaux) et un panneau de journal | Une page, vues par `?vue=`, journal par `?execution=` (section 5) ; « Canaux » est une vue de `/agents`, pas un onglet des Réglages |
| 7 | Chapitre 08 (5.5) : les actions des agents comme matière du point du matin, « au chapitre 07 (l'Accueil) ou à une PR du module `briefing` » | Le point du matin est rédigé par un modèle ; la section « À valider » dit déjà ce qui attend, sans modèle | Non fait ici. À reprendre par une PR du module `briefing`, si un client le demande |
| 8 | Note 06 (5) : adresse de retour `/api/v1/connexions/oauth/slack/retour` ; architecture 6 : `slack/install.ts`, `link.ts`, `post.ts`, `interactions.ts` | L'adresse tombe dans `createOAuthRoutes` (`GET /:app/retour`, `app.ts:48`) ; il manque un client et le manifeste | Routes `POST /api/v1/slack/installation` (sous session, 401 sans) et `GET /api/v1/slack/installation/retour` (la session, sinon `/sign-in` ; entrée dans `PUBLIC` de `route-guards.db.test.ts`, comme le retour des connecteurs) ; fichiers ajoutés `slack/client.ts` et `slack/manifest.ts` ; `readInstallation` dans `install.ts`, seul lecteur de `bot_token` |
| 9 | Note 06 (5) : manifeste avec `chat:write.public`, `app_mentions:read`, événements `app_mention` et `message.im`, `token_rotation_enabled: true` | Architecture 9.12 : le bot n'écrit qu'en message direct et ne lit rien ; une rotation demande de garder un jeton de rafraîchissement, que `installations_slack` n'a pas | Quatre portées (`chat:write`, `im:write`, `users:read`, `users:read.email`), pas d'événements, `token_rotation_enabled: false` (14.3) |
| 10 | Architecture 6 : `email/send.ts`, « `sendEmail` et `escapeHtml` mutualisés » | `mailConfigured` et `RESEND_BATCH_MAX` vivent dans deux autres fichiers ; le lot a son propre point | `send.ts` exporte aussi `sendEmailBatch`, `mailConfigured`, `RESEND_BATCH_MAX`, `MailNotConfiguredError`, `MailRefusedError` ; les anciens fichiers les réexportent |
| 11 | Chapitre 01 (12) : « forme conseillée `<genre>:<user_id>:<action_id>` pour un message d'action ; le chapitre 07 la fixe » ; architecture 10.1 : clé de `recap-envoyer` `tenant:user:AAAA-MM-JJ` | Un message par action enverrait trois messages pour une exécution ; le tic ne connaît pas le fuseau | `recap:<user_id>:<AAAA-MM-JJ local>` et `<validation\|fait>:<user_id>:<execution_id>`, un message par exécution ; la clé de file prend le jour UTC, la clé de la ligne le jour local (13.2, 15.1, 15.2) |
| 12 | 0084 : `messages_sortants.statut` ∈ `en-file`, `envoye`, `echoue` | Un message Slack dont toutes les actions ont été décidées entre-temps, ou un récapitulatif dont le jour est clos sans envoi (`rien`, `coupe`, `eteint`, `adresse`), n'est ni envoyé ni en échec | Le code pose `echoue` (13.2, 15.3). Proposition : ajouter `abandonne` au `check` de 0084, qui n'est pas encore appliquée (chapitre 01) ; `closeDay` et `setChannelStatus` l'écriraient alors |
| 13 | Architecture 9.12, point 5 : le worker passe par `decideAction` ou `undoAction` ; rien sur la réponse à Slack | Note 06 : `response_url` vaut 30 minutes ; ce n'est pas un identifiant | Le job porte `channel` et `ts` (identifiants) ; l'issue est dite par une réponse dans le fil (`chat.postMessage`, `thread_ts`), sans rebâtir le message d'origine (15.4) |
| 14 | Architecture 6 : `notify.ts`, « quel canal, quel message » ; chapitre 04 (8) : `runExecution` | Personne n'appelle `notifyAction` | `notifyProposed(write, execution.id)`, appelé par `runExecution` après le solde du budget (`finie`, `epuisee`) et sur `deja-finie` (un rejeu), hors étape journalisée, sans jamais lever (15.2). Deux lignes au chapitre 04 |
| 15 | Architecture 7.2 : `messages_sortants.genre` a `alerte` ; chapitre 01, son écart 6 (seuil de 80 %) | Rien ne l'écrit ici, et `recaps_dus` ne rend que les personnes qui ont une action à dire | Non construit. Proposition : une ligne dans le récapitulatif d'un administrateur quand `budget_du_mois` passe 80 % du plafond, ce qui demande d'élargir `recaps_dus` (chapitres 01 et 11) |
| 16 | Chapitre 09 (8.3) : textes anglais « To review » pour « À valider » | L'écran dit « To approve » (`agents.pending.title`, `shell.toValidate`) | Le chapitre 09 aligne `agents.manuel.lance` et `deja_lance` sur « To approve » |
| 17 | Chapitre 09 (E09-25) : l'écran de retrait d'un membre « compte les actions en attente de ses agents » (`agents.depart.passation_en_attente`) | Architecture 9.11, point 2 : un administrateur ne voit jamais de compteur par personne. Compter les propositions d'un membre, c'est en voir un | La clé existe avec une phrase fixe, toujours affichée dans la boîte de retrait : « Les propositions de ses agents qui attendent encore sa validation seront annulées. » Pas de nombre |
| 18 | Chapitre 08 (3.5) : `agents.catalog.<id>` ; chapitre 07 : les groupes du catalogue | `catalog.mine` heurterait une fiche nommée `mine` (un `Name` valable) | Les groupes sous `agents.groups.*` (5.5, 10) |
| 19 | Architecture 9.1, point 10 : le détail d'une exécution n'est rendu que si ses sources sont encore visibles | Une action en attente porte des paramètres tirés de ces sources ; la confirmer recopierait dans un outil (une note de CRM lue par des collègues) un texte d'une source que la personne ne voit plus | Tranché : la proposition reste dans « À valider », sans paramètres ni titre de source (`hidden`), avec le seul bouton « Refuser » (`refusePendingActionAction`, qui ne rend que `{ ok }`) ; la confirmer est refusé par `confirmBlock` (`source`) dans `decideActionAction` et `decideFromChannel` (4.3, 8.4, 15.4). Proposé au chapitre 05 : la même garde dans `decideAction`, pour tout appelant futur |
| 20 | Architecture 6 : clés `agents.*` et `discussionView.action.kinds.<outil>.<verbe>` ; 9.12, point 1 : « titres génériques » sans nommer de clé | Les phrases de `discussionView.action.kinds` (chapitre 05) portent les paramètres (« … la fiche HubSpot « {record_name} » ») : les envoyer par e-mail ou Slack sortirait du contenu | Une seconde famille, voulue différente : `agents.kinds.<outil>.<verbe>`, des titres sans argument (« Note dans HubSpot »), lus par le catalogue, le récapitulatif, Slack et `HiddenActionCard`. `model.test.ts` exige un titre par type d'`ACTION_KINDS` et aucun `{` dans ces titres. Ce n'est pas une copie : aucune égalité à tenir avec la carte |
| 21 | Architecture 14.3 : PR 8 « Écrans » avant PR 9 « La fiche » ; chapitre 08 (3.5) : `agents.catalog.suivi_echange` entre avec la PR 9 | L'écran lit `catalog.${id}.name` (catalogue, « À valider », Slack) : sans aucune feuille `agents.catalog.<id>.name`, `translation-keys.test.ts` échoue, et le cast vers `'catalog.suivi_echange.name'` ne se type pas | La PR 07b pose `agents.catalog.suivi_echange` (nom et description, texte du chapitre 08 recopié), en français et en anglais. La PR 08b les trouve en place |
| 22 | Chapitre 01, migration 0084 (pas encore appliquée) : `installations_slack`, `recaps_dus` ; le worker n'est pas administrateur et `admin_update` lui refuse l'installation | Rien ne marque une installation dont le jeton est mort ; rien ne délie les comptes d'un ancien espace Slack ; `recaps_dus` rend une adresse non vérifiée, que `sendRecap` n'envoie jamais | Proposé pour 0084 et écrit en 14.5 : colonne `invalide_le` (et dans le `grant update`), fonctions `marquer_slack_invalide()` et `delier_slack_organisation()`. Pour `recaps_dus` : `and u.email_verified` dans la CTE `reglees` ; en attendant, `closeDay` (13.2) suffit à éviter la boucle |
| 23 | Chapitre 01 (0078) : `activateur_update` laisse tout administrateur écrire une activation d'équipe | L'agent tourne au nom de l'activateur (architecture 9.1, points 3 et 5) : un autre administrateur changerait ce qu'il doit valider, ou rallumerait une activation qu'il ne peut plus faire tourner | `setActivation` refuse (`interdit`) toute activation dont `user_id` n'est pas celui du lecteur (4.2) ; la reprise passe par `takeOverTeamAgent` (07k). La RLS n'est pas changée |
| 24 | Architecture 9.3, point 9 : `agents_actifs = false` « coupe tous les agents : plus aucune exécution n'est créée » ; rien sur ce qui attend | Couper pendant un incident laissait des propositions confirmables, y compris d'un clic dans Slack, et des messages partir | Couper gèle les propositions : elles se refusent, ne se valident plus (`confirmBlock` : `coupe`) ; aucun message Slack, aucun récapitulatif (`eteint`) tant que les agents sont coupés. Rallumer les rend valables jusqu'à leur expiration (8.2) |
| 25 | Chapitre 01 (12) : `"user".locale`, « la langue des messages écrits sans la personne » ; `setLocaleAction` seul l'écrit | La langue se choisit surtout avant l'inscription, sans session : la base restait nulle et le récapitulatif partait en anglais | La langue du cookie est recopiée une fois, au premier rendu connecté, si la base est nulle (`rememberLocale`, `layout.tsx`, 12.2) |

Questions à David et Amos, nées de ce chapitre :

- **Récapitulatif par défaut** (`recap_email` vrai sans ligne, chapitre 01, 12) : confirmé ici, puisque c'est le seul canal qui prévient sans réglage. À dire au client.
- **Slack sans la personne** : faut-il proposer « Lier mon compte Slack » dans l'Accueil, une fois l'appli installée ? Rien ne le fait aujourd'hui ; la vue Canaux est le seul chemin.

## 19. Ce que je n'ai pas vérifié

- **Rien n'a été lancé** : ni serveur, ni test, ni migration, ni `typecheck`. `node_modules` est absent : aucun type de bibliothèque n'a été lu (next-intl, Hono, pg-boss, Drizzle, lucide-react, zod). Les signatures citées (`createTranslator`, `c.redirect(url, 303)`, `csrf`, `bodyLimit`, `boss.schedule(..., { tz, missed })`, `z.looseObject`, `onConflictDoNothing({ target })`, l'icône `RotateCcw`) sont reprises de leur usage dans le dépôt quand il existe, sinon de mémoire.
- **Le typage des clés en gabarit** de `next-intl` : le cast vers une clé réelle (`as 'kinds.hubspot.creer_note'`) suit l'usage de `action-card.tsx:74`, mais je n'ai pas vérifié qu'un `t` dont l'espace de noms est `agents` accepte ce cast pour une clé à trois niveaux.
- **Slack, tout ce qui n'est pas dans la note 06** : l'adresse d'autorisation et `oauth.v2.access` (paramètres, réponse) ; `users.lookupByEmail` (paramètre, `user.id`, `deleted`, `is_bot`) ; `auth.revoke` ; le format formulaire pour ces méthodes ; `Retry-After` sur un 429 ; un bloc `section` en `plain_text`, un bloc `context` ; `blocks: []` accepté ; `chat.postMessage` vers un identifiant `U…` sans `conversations.open`. La note 06 elle-même marque « [MEM] » la signature (`v0:horodatage:corps`), le format du formulaire de clic et le message direct par identifiant d'utilisateur. Le manifeste est « à vérifier contre la référence avant import », comme la note le dit.
- **Resend** : le champ `text`, et ce qu'exigent les grandes messageries d'un envoi quotidien à beaucoup d'adresses (`List-Unsubscribe`, domaine authentifié). Seuls `from`, `to`, `subject`, `html` et les deux adresses sont dans le code existant.
- **`singletonKey` sur une file `standard`** dans pg-boss 12 (architecture 10.1, même réserve) ; le comportement de `boss.schedule` avec `tz: 'UTC'`.
- **Les chapitres voisins sont lus pour leurs signatures**, pas en entier : chapitre 05 (`toView`, `listPendingActions`, `countPendingActions`, `decideAction`, `undoAction`, `readActionRow`, sections 3.4, 9, 11, 15), chapitre 06 (`mustNotify`, `raiseSuggestion`, `readRaiseRows`, `takeOverTeamAgent`), chapitre 01 (0084, 14.3, 16.1), chapitre 03 (`verify.ts`, 4.3), chapitre 09 (8.2, 8.3, E09-20, E09-25), chapitre 08 (3.5, 5.5), chapitre 04 (`runExecution` et le tableau de ses issues, section 8 : `write`, `execution`, `outcome`, `FINAL_STATUSES` sont repris tels quels en 15.2).
- **Les numéros de ligne du dépôt** ont été relus au commit `7a3fffd` pour les fichiers cités dans les sections 8 à 16 (`discussions/actions.ts`, `settings/actions.ts`, `team/actions.ts`, `action-card.tsx`, `email/*.ts`, `auth.ts:73-97`, `env.ts`, `app.ts`, `route-guards.db.test.ts`, `oauth-routes.ts`, `oauth-cookie.ts`, `marks.tsx`, `kit.css`, `briefing/queue.ts`, `briefing/worker.ts`, `fixtures.ts`, `i18n/request.ts`, `messages/*.json`). Aucun fichier de `src/` n'a changé entre `b075333` (sections 1 à 7) et `7a3fffd`.
- **Le format des montants** de `Intl.NumberFormat('fr-FR', { currency: 'USD' })` sous Node (« $US » ou « $ ») : le test accepte les deux (16.2).
- **Le débit de Resend** (2 requêtes par seconde par défaut, de mémoire) et son en-tête `Retry-After` : à lire dans sa documentation, et à mesurer au premier client ; `RESEND_MIN_INTERVAL_MS` (600 ms) en dépend.
- **L'unicité des identifiants d'utilisateur Slack d'un espace à l'autre** : si deux espaces pouvaient donner le même `U…` à deux personnes, une liaison périmée enverrait un message à un inconnu. `delier_slack_organisation` à la réinstallation dans un autre espace, et à la désinstallation, ferme ce cas sans le supposer.
- **Le p95 de la route des clics Slack** sur Railway, avec le pool de 4 connexions de `web` : à mesurer avant 07h (14.8).
- **Drizzle** : `min(column)` rendu en `Date` par le mappeur de la colonne, et ``orderBy(sql`max(…) desc`)`` sur une requête groupée (`countPendingByRun`) ; ``tx.execute(sql`select lier_slack(null)`)`` avec un `null` littéral. De mémoire.
- **Une personne membre de deux espaces** reçoit un récapitulatif par espace, sans nom d'espace (architecture 9.12, point 1 lu au plus strict) ; le lien ouvre l'espace actif de sa session, peut-être l'autre. Non traité.
- **Le contraste** des couleurs du récapitulatif est calculé de tête (`#555555` ≈ 7,5:1, `#666666` ≈ 5,7:1 sur blanc), pas mesuré.
- **L'amendement du 19 octobre** (chapitre 02, 14) promet qu'« une action proposée montre ses sources ». « À valider » montre la source qui a déclenché, en tête du groupe ; le journal compte les sources lues (`run.sources`), sans les nommer. Si l'amendement veut la liste des sources, il faut une lecture de plus (les titres visibles de `source_ids`) : non écrite.

## 20. Relecture contradictoire

Deux critiques ont relu ce chapitre, l'une sur le code (fidélité au dépôt, compilation, contrats de test), l'autre sur le fond (pannes, départs, règles ouvertes). Chaque objection a été vérifiée dans le dépôt, l'architecture ou le chapitre cité avant d'être retenue. Aucune n'a changé l'architecture ; ce qui touche un autre chapitre est aux écarts 1, 2, 12, 14 et 19 à 25.

| # | Angle | Objection | Verdict | Ce qui a changé, ou pourquoi rien |
|---|---|---|---|---|
| C1 | code | `runTone` rend `'danger'`, absent de `Tone` ; `Badge` lève au rendu d'une exécution échouée | Retenue (vérifié : `badge.tsx:4`, `:21-22`) | `RunTone = Extract<Tone, …>`, `'destructive'` pour `echouee` ; cas `runTone('echouee')` dans `model.test.ts` (5.3, 16.2) |
| C2 | code | `model.test.ts` importe le schéma Drizzle : `ui-imports.test.ts` balaie aussi les tests de `src/components` | Retenue (vérifié : `ui-imports.test.ts:6-9`, `:99-106` ; `listFiles` ne filtre pas les tests) | L'égalité des listes passe dans `src/server/agents/runs.test.ts` (16.3, nouveau) ; `model.test.ts` ne garde que le pur et les textes ; tableau 16.1 corrigé |
| C3 | code | `TimedAction.executionId` et `ActionView.reversible` absents du chapitre 05 ; personne ne porte la retouche ; renvoi faux aux « écarts 1 et 2 » du chapitre 05 | Retenue (vérifié : chapitre 05, 3.4 et 9) | `TimedAction` ne change plus : `listPendingGroups` relit `execution_id`, `sendChannelMessage` le lit sur la ligne. `reversible` : quatre lignes données en 9.2, portées par la PR 07a. Renvoi corrigé (section 17 : écarts de ce chapitre) |
| C4 | code | Sans aucune clé `agents.catalog.*` à la PR 07b, `translation-keys.test.ts` et `pnpm typecheck` échouent | Retenue (vérifié : `translation-keys.test.ts:60-77` ; architecture 14.3, PR 8 avant PR 9) | La PR 07b pose `agents.catalog.suivi_echange` (texte du chapitre 08, en français et en anglais) ; `?? {}` dans `notify.ts` ; écart 21 |
| C5 | code | `ChannelsView` nomme à la fois le composant et le type | Retenue | Le type devient `ChannelsViewData` (12.3) ; le composant garde `ChannelsView` |
| C6 | code | Le `toEqual` de `parseAgentsParams` casse quand `slack` arrive ; `agentId` et `agent` lisent le même paramètre sans le dire | Retenue | 12.3 donne le changement du test (clé `slack: null`, deux cas) dans la PR 07g, et dit le double usage de `?agent=` |
| C7 | code | `agents.kinds` serait une seconde copie de 42 phrases, à tenir égale à `discussionView.action.kinds` | Retenue en partie | La seconde famille est voulue différente (titres sans paramètre, la carte porte les paramètres) : aucune égalité à tenir. Retenu : l'attribution floue de la clé (2.4, écart 20) et un test qu'aucun titre ne contient `{` |
| C8 | code | Le retour de Slack sans session rend un JSON 401 brut au navigateur | Retenue (vérifié : `session-routes.ts:30-36` ; retour des connecteurs : `/sign-in`) | `GET …/installation/retour` résout la session lui-même et renvoie vers `/sign-in` ; entrée dans `PUBLIC` avec commentaire ; tests 16.1 corrigés |
| C9 | code | `claimRecap` reprend une ligne `en-file` : deux jobs concurrents envoient deux fois | Retenue | Seule une ligne `echoue` est reprise, par une mise à jour conditionnelle ; une ligne `en-file` jamais. « Au plus un récapitulatif par jour » (13.2) |
| F1 | fond | L'ordre 07e à 07h ne compile pas : `queue.ts`, `worker.ts`, la vue Canaux importent des fichiers de PR suivantes | Retenue | Lignes `// 07h` dans `queue.ts` et `worker.ts` ; `readChannelsView` rend `slack: null` jusqu'à 07g ; actions Slack datées ; tableau des fichiers écrits en deux temps (17) |
| F2 | fond | Une proposition dont la source n'est plus visible reste lisible et confirmable ; point laissé « à trancher » | Retenue | Tranché (écart 19) : `hidden` sans paramètres, `HiddenActionCard` et `refusePendingActionAction`, `confirmBlock` (`source`) dans `decideActionAction` et `decideFromChannel` ; tests 16.4 |
| F3 | fond | Adresse non vérifiée (et `rien`, `coupe`) : la personne revient à chaque tic, et 200 d'entre elles bloquent tout le monde | Retenue | `closeDay` écrit une ligne `echoue` du jour pour toute issue sans envoi ; `email_verified` proposé pour `recaps_dus` (écart 22) ; test des 201 adresses (16.1). L'ordre de `recaps_dus` n'est pas changé : une personne n'y revient plus le même jour |
| F4 | fond | La langue se choisit avant l'inscription, sans session : le récapitulatif part en anglais | Retenue (vérifié : `bar.tsx:19-24`, `site-footer.tsx:21`) | `rememberLocale` et recopie du cookie au premier rendu connecté (`readSidebar`, `layout.tsx`) ; phrase fausse de 12.2 retirée ; écart 25 |
| F5 | fond | Un autre administrateur peut régler ou rallumer l'activation d'équipe d'un premier | Retenue (vérifié : `activateur_update`, chapitre 01) | `setActivation` rend `interdit` si `row.userId !== ctx.userId` ; boutons masqués ; test du second administrateur ; écart 23 |
| F6 | fond | Le crochet dans `run.ts` emploie des noms absents du chapitre 04 et perd le message d'un rejeu | Retenue (vérifié : chapitre 04, `runExecution`) | Code exact avec `write`, `execution`, `outcome`, `FINAL_STATUSES` ; `notifyProposed` après le solde et sur `deja-finie` ; statuts `echouee` et `annulee` couverts (15.2) |
| F7 | fond | Installation morte (appli retirée, jeton révoqué) jamais détectée ; `retryAfterMs` de Slack ignoré | Retenue | `SLACK_DEAD_TOKEN`, `isDeadToken`, `markSlackInvalid` (fonction et colonne proposées pour 0084, écart 22), vue Canaux ; `ratelimited` remis au délai demandé (`reportLater`) |
| F8 | fond | Le récapitulatif ignore la limite de débit de Resend | Retenue (la limite elle-même reste à vérifier) | `MailRefusedError.retryAfterMs`, `RESEND_MIN_INTERVAL_MS`, un lecteur à la fois avec pause, 429 remis au délai demandé (11.1, 15.5) |
| F9 | fond | Un administrateur qui supprime son compte désinstalle Slack en cascade | Écartée | La suppression d'un compte est douce (`delete-account.ts:198-205`, `deleted_at`) : la ligne `"user"` reste, la cascade ne joue pas. Le chapitre affirmait la même erreur : corrigé en 14.5 et retiré de la section 19 |
| F10 | fond | Une ligne Slack restée `en-file` après un envoi à la file raté n'est jamais remise en file | Retenue | `notifyAction` remet en file une ligne `en-file` de plus de cinq minutes ; le rejeu `deja-finie` la rappelle ; test 16.1 |
| F11 | fond | Les 3 secondes de Slack ne sont pas tenues avec certitude (`ensureQueue` au premier clic, pool de 4) | Retenue en partie | `getChannelsBoss()` au démarrage du rôle `web` ; p95 à mesurer avant 07h. Écarté : un message « Validation en cours » posté par la route, qui ajouterait un appel à Slack dans les 3 secondes |
| F12 | fond | Réinstaller dans un autre espace Slack garde les liaisons de l'ancien | Retenue | `delier_slack_organisation` à la réinstallation dans un autre espace et à la désinstallation ; `channel_not_found` délie la personne au premier envoi (14.5, 15.3) |
| F13 | fond | Le décompte par groupe de l'Accueil est faux au-delà de 50 actions | Retenue | `countPendingByRun` compte en SQL, sous la même condition ; `readPendingSummary` en une transaction ; test à 60 actions |
| F14 | fond | Couper les agents laisse des propositions confirmables, y compris par Slack | Retenue | Couper gèle : `confirmBlock` (`coupe`), `canConfirm` sur la carte, `notifyAction` et `sendChannelMessage` n'envoient rien, récapitulatif `eteint` ; textes de l'écran Coût corrigés ; écart 24 |
