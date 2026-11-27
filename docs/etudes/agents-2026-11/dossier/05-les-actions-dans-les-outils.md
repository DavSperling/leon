# 05. Les actions dans les outils

20 novembre 2026 · chapitre du dossier de conception · à relire par David et Amos

Ce chapitre écrit tout ce qui touche une écriture dans un outil : le contrat d'une action, le registre, la base, la proposition, la décision, l'annulation, et les 28 types d'action nouveaux du premier lot, plus les 14 types GitHub déplacés. Il recopie les noms de `00-architecture.md` (sections 6, 7.3, 8.1 à 8.3, 9.2, 9.4, 9.6, 14.3). Les noms qu'il ajoute sont listés en section 18.

Convention : **existe** (lu dans le dépôt, avec chemin et ligne, commit `500e246`), **à créer**, **à vérifier** (point d'API d'un éditeur que la note citée marque [MEM], [V] ou [T], ou que je n'ai trouvé dans aucune note). Les lignes citées sont celles du 20/11/2026 ; elles bougent à chaque PR. Rien n'a été lancé : ni test, ni serveur, ni migration.

Jalon 1 (architecture, 14.3, PR 7) : le déplacement, `openConnection`, le verrou, `pace.ts`, `ConnectorRateLimitError`, `store.ts`, `registry.ts`, `propose.ts`, `decideAction`, et trois types : `hubspot.creer_note`, `hubspot.creer_tache`, `outlook.creer_brouillon`. Tout le reste est marqué **après**.

## 1. Ce que ce chapitre fixe

1. Le contrat : `ActionSpec` et ses voisins dans `src/server/actions/spec.ts`, les règles de paramètres partagées dans `src/server/actions/params.ts`, le contrat navigateur dans `src/lib/actions.ts` (`ACTION_KINDS` à 42 types, `actionProvider`, `actionVerb`, `ACTION_PENDING_MS`, `ActionView` étendue).
2. La plomberie d'écriture : `ConnectorRateLimitError` (`http.ts`), le verrou `renew_lock_at` dans `ensureFreshTokens` (`oauth.ts`), `openConnection` (`open.ts`), `reserveWriteSlot` (`pace.ts`) et le pas de chaque outil.
3. Le cycle d'une action : `registry.ts` (`specOf`, `invalidParam`, `deciderInput`), `capabilities.ts`, `store.ts` (déplacé de `proposed-actions.ts`, lecture de `expire_le`), `propose.ts` (`prepareAndPropose`, `proposeFromRun`, `runActions`, le port `RunActions` du moteur tenu tel que le chapitre 04 l'écrit, les outils de la discussion), `decide.ts` (`decideAction`, `autoExecute`, `undoAction`, `errorCode`, la revérification `verify` avant d'écrire).
4. Les 28 types nouveaux, outil par outil : entrée, paramètres, règles, requêtes HTTP exactes, portée, lecture du public, `findExisting`, `undo` ; et l'enjeu, le public et la réversibilité des 14 types GitHub.
5. Les extraits `vendor-specs` de Jira et d'Asana, les clés de texte de la carte d'action, les tests et l'ordre des PR.

## 2. Vue d'ensemble

### 2.1 Les pièces

| Fichier | Rôle | État | Jalon |
|---|---|---|---|
| `src/server/actions/spec.ts` | `ActionSpec`, `LiveConnection`, `ActionResult`, `Reversibility`, `ActionFailure`, `ElsewhereError` | à créer | 1 |
| `src/server/actions/params.ts` | règles de paramètres (`plain`, `between`, `oneLine`…), `askedOf`, `textToHtml`, `refOf`, `markerOf`, `uuidFrom` | à créer (en partie déplacé de `github-actions.ts:76-152`) | 1 |
| `src/lib/actions.ts` | `ACTION_KINDS`, `ACTION_KEYS`, `actionProvider`, `actionVerb`, `ActionView`, `parseActionView` | existe, à étendre | 1 |
| `src/server/connectors/http.ts` | `ConnectorRateLimitError` | existe, à étendre | 1 |
| `src/server/connectors/oauth.ts` | verrou `renew_lock_at` dans `ensureFreshTokens`, `TokenRenewalBusyError` | existe, à étendre | 1 |
| `src/server/connectors/connections.ts` | `takeRenewLock`, `releaseRenewLock`, `readMyConfig` | existe, à étendre | 1 |
| `src/server/connectors/open.ts` | `openConnection` | à créer | 1 |
| `src/server/connectors/pace.ts` | `reserveWriteSlot`, `delayWriteSlot`, `WRITE_WAIT_INLINE_MS` | à créer | 1 |
| `src/server/connectors/types.ts` | `Connector.write` (et `fetchOne`, `webhook`, chapitre 03) | existe, à étendre | 1 |
| `src/server/actions/registry.ts` | `specOf`, `writerOf`, `invalidParam`, `validParams`, `deciderInput`, `deciderCanPropose` | à créer | 1 |
| `src/server/actions/capabilities.ts` | `ACTION_CAPABILITIES`, `ACTION_CAPABILITY_NAMES`, `resolveAction` | à créer | 1 |
| `src/server/actions/store.ts` | lignes d'`actions` : proposer, réserver, finir, relâcher, défaire, lister | à créer (déplacé de `src/server/discussion/proposed-actions.ts`) | 1 |
| `src/server/actions/propose.ts` | `prepareAction`, `prepareAndPropose`, `proposeFromRun`, `runActions` (le port du moteur), `actionTools`, `discussionActionTools` | à créer (déplacé de `github-actions.ts:816-886`) | 1 |
| `src/server/actions/decide.ts` | `decideAction`, `autoExecute`, `undoAction`, `resumeAction`, `errorCode` | à créer (déplacé de `github-actions.ts:888-945`) | 1 (`decideAction`), après (`autoExecute`, `undoAction`) |
| `src/server/connectors/github/actions.ts` | les 14 specs GitHub | à créer (déplacé de `github-actions.ts:296-814`) | 1 |
| `src/server/connectors/github/live.ts` | `liveGithub`, `REPO_PATTERN`, `ConfigSchema`, `isBranchName`, `COMMIT_SHA`, `isRepoPath` : ce que `github/actions.ts` lit, hors de toute boucle d'imports | à créer (déplacé de `github/connector.ts` et de `discussion/github-live.ts`) | 1 |
| `src/server/connectors/hubspot/actions.ts` | 5 specs | à créer | 1 (`creer_note`, `creer_tache`), après (3 autres) |
| `src/server/connectors/outlook/actions.ts` | 5 specs | à créer | 1 (`creer_brouillon`), après (4 autres) |
| `src/server/connectors/{gmail,linear,notion,zendesk,jira,asana}/actions.ts` | 3 specs chacun | à créer | après |
| `src/test/contracts/extract-vendor-specs.ts`, `vendor-specs/jira.json`, `asana.json` | les opérations d'écriture | existent, à étendre | après (avec Jira et Asana) |
| `messages/fr.json`, `messages/en.json` | `discussionView.action.*` | existent, à étendre | 1 |
| `src/components/discussion/action-card.tsx` | clés à deux niveaux, icône par outil, public, enjeu, « Annuler » | existe, à étendre | 1 (clés), chapitre 07 (le reste de l'écran) |

### 2.2 Le chemin d'une action

```
discussion : outil du modèle                    agent : le moteur (chapitre 04) par le port runActions
        │                                       agir : runActions.prepare, puis runActions.proposeFromRun
        │                                       decider : outils bâtis sur runActions.describe (sans texte libre
        │                                                 ni destinataire), runActions.prepare ; puis une étape
        │                                                 <nom>#<i> par proposition : runActions.proposeFromRun
        ▼                                                  │
  prepareAndPropose(ctx, …) ──► prepareAction(ctx, …) ◄────┘
                     specOf(kind) ; spec.input.safeParse
                     refusedRecipient(entrée, allowedRecipients)   (agent ; chapitre 06)
                     connexions : celle de la source d'abord, puis les autres ; openConnection
                     write.granted(config, verb)
                     spec.prepare(live, input)  ── lit l'outil, rend des paramètres ou une phrase de refus
                     + asked, interne
                     invalidParam(kind, params)
                     spec.audience(params)
        │                                                  │
        ▼                                                  ▼
  proposeAction(ctx, …)                        proposeFromRun(identity, RunProposal)
                                                 + mention (et marque si le public n'est pas externe)
                                                 proposeAction(ctx, …) sous la clé de l'étape ; needsClick (chapitre 06)
                     actions : status 'proposee', expire_le, cle_idempotence
                               │
              clic (web) ──────┼────── autonomie (worker, après le jalon 1)
                               ▼
                   decideAction / autoExecute
                     claimAction ──────────────────────── 'en-cours', decide_par
                     validParams + rôle d'équipe (échoue fermé) + needsClick (autonomie)
                     openConnection
                     spec.verify(live, params) ────────── l'état et le public n'ont pas bougé, sinon 'conflit'
                     reserveWriteSlot ─────────────────── reserver_creneau (0081)
                     spec.execute(live, params, clé) ──── once: true ; débit refusé après une 1re écriture : 'incertain'
                               │
            ┌──────────────────┼───────────────────────────┐
            ▼                  ▼                           ▼
   réponse reçue       ConnectorRateLimitError      réponse perdue, 5xx, refus
   finishAction        delayWriteSlot +             finishAction
   'faite', result,    releaseAction                'echouee', errorCode
   annulation          'proposee', erreur 'limite'  ('incertain' ou autre)
                       (agent : RetryLater)
            │
            ▼
   undoAction (après le jalon 1) : claimUndo → spec.undo → finishUndo ('defaite') ou failUndo
```

### 2.3 Les 42 types

| Type | Enjeu | Public (calcul) | Réversibilité | Pas d'écriture | Jalon |
|---|---|---|---|---|---|
| `outlook.creer_brouillon` | bas | `soi` | annulable | 2 000 ms | 1 |
| `outlook.classer` | bas | `soi` | compensable | 2 000 ms | après |
| `outlook.envoyer` | haut | `interne` si tous les destinataires sont de l'organisation, sinon `externe` | irreversible | 2 000 ms | après |
| `outlook.bloquer_creneau` | bas | `soi` | annulable | 2 000 ms | après |
| `outlook.creer_evenement` | haut | selon les invités, comme `envoyer` | irreversible | 2 000 ms | après |
| `gmail.creer_brouillon` | bas | `soi` | annulable | 1 000 ms | après |
| `gmail.classer` | bas | `soi` | compensable | 1 000 ms | après |
| `gmail.envoyer` | haut | selon les destinataires | irreversible | 1 000 ms | après |
| `hubspot.creer_note` | bas | `interne` | annulable | 500 ms | 1 |
| `hubspot.creer_tache` | bas | `interne` | annulable | 500 ms | 1 |
| `hubspot.creer_contact` | moyen | `interne` | annulable | 500 ms | après |
| `hubspot.creer_affaire` | moyen | `interne` | annulable | 500 ms | après |
| `hubspot.modifier_fiche` | moyen | `interne` | compensable | 500 ms | après |
| `linear.creer_ticket` | moyen | `interne` ; `externe` si l'équipe a un invité | annulable | 1 000 ms | après |
| `linear.commenter` | moyen | idem | annulable | 1 000 ms | après |
| `linear.modifier_ticket` | moyen | idem | compensable | 1 000 ms | après |
| `notion.creer_page` | bas | `externe` : le partage à un invité ne se lit pas (écart 6) | annulable | 1 000 ms | après |
| `notion.commenter` | **moyen** (écart 10) | idem | **irreversible** (écart 5) | 1 000 ms | après |
| `notion.modifier_page` | moyen | idem | compensable | 1 000 ms | après |
| `zendesk.ajouter_note_interne` | **moyen** (écart 10) | `interne` | irreversible | 1 000 ms | après |
| `zendesk.modifier_ticket` | moyen | `interne` pour la priorité seule ; `externe` dès qu'un statut ou une étiquette change (écart 11) | compensable | 1 000 ms | après |
| `zendesk.repondre` | haut | `externe` | irreversible | 1 000 ms | après |
| `jira.creer_ticket` | moyen | `interne` sur un projet `software` ou `business` ; sinon `externe` (`service_desk`, type inconnu : écart 11) | compensable | 500 ms | après |
| `jira.commenter` | moyen | idem | compensable | 500 ms | après |
| `jira.changer_statut` | moyen | idem | compensable | 500 ms | après |
| `asana.creer_tache` | bas | `interne` si l'espace de travail n'a aucun invité (lu), sinon `externe` (écart 6) | annulable | 1 000 ms | après |
| `asana.commenter` | bas | idem | annulable | 1 000 ms | après |
| `asana.modifier_tache` | moyen | idem | compensable | 1 000 ms | après |
| `github.*` (14) | section 13 | `interne` sur un dépôt privé ou interne, `externe` sur un dépôt public | section 13 | 1 000 ms | 1 (déplacés) |

Un public `externe` vaut `haut` dans `needsClick` (architecture, 8.1), quel que soit l'enjeu du tableau.

## 3. Les types : `spec.ts`, `params.ts` et `src/lib/actions.ts`

### 3.1 `src/server/actions/spec.ts` (à créer, jalon 1)

Le bloc de l'architecture (8.2), recopié. Des ajouts, chacun justifié en section 18 : `ActionResult.ref` (demande du chapitre 02, écart E02-2), `ActionSpec.mentionKey` et `marker`, `textKeys` (les entrées de texte libre, retirées des outils du décideur), `verify` (la revérification juste avant d'écrire), les deux classes d'erreur que les specs lèvent, et `partialWrite`. `ActionFailure` existe aujourd'hui, non exportée (`src/server/discussion/github-actions.ts:68-72`) : elle déménage ici.

```ts
// src/server/actions/spec.ts
import type { z } from 'zod';
import type { ProviderId } from '@/capture/turn';
import type { ActionError } from '@/lib/actions';
import type { Audience, RiskLevel } from '@/lib/agents';
import { type ConnectorHttp, ConnectorRateLimitError } from '@/server/connectors/http';

// Une écriture dans un outil, décrite une fois, servie à la discussion comme aux agents (dossier agents, 8.2).
// Une spec ne connaît ni la base ni le contexte de la personne : elle reçoit une connexion déjà ouverte.

// Une connexion ouverte : celle de la personne, jetons frais, configuration validée (open.ts).
export type LiveConnection = {
  connectionId: string;
  provider: ProviderId;
  config: Record<string, unknown>;
  http: ConnectorHttp;
};

export const REVERSIBILITIES = ['annulable', 'compensable', 'irreversible'] as const;
export type Reversibility = (typeof REVERSIBILITIES)[number];
// annulable : l'outil sait défaire (supprimer un brouillon, corbeille). compensable : on réécrit l'état lu avant.
// irreversible : notification partie, envoi, suppression définitive.

export type Prepared = Record<string, string>; // toutes valeurs en texte, comme aujourd'hui

// ref : l'élément du connecteur que l'écriture a créé ou touché, dans les identifiants de la relève. item :
// sources.external_id ('note:123', 'issue:10001'). turn : la souche du tour ajouté ('comment:456'), absente quand
// l'action a créé l'objet. Lu par isOwnWrite (chapitre 02, 7.4) : une écriture de Leon qui revient ne réveille rien.
export type ActionResult = {
  url: string | null;
  undo?: Record<string, string>;
  ref?: { item: string; turn?: string };
};

export type ActionSpec<S extends z.ZodObject = z.ZodObject> = {
  verb: string; // 'creer_brouillon' : le type d'action est `${provider}.${verb}`
  tool: string; // nom montré au modèle : 'creer_brouillon_outlook'
  description: string;
  right: string; // le droit à citer quand l'outil refuse
  risk: RiskLevel; // fixé dans le code, par type d'action
  reversibility: Reversibility;
  rules: Record<string, (value: string) => boolean>; // une règle par clé de paramètre, propre à l'outil
  input: S;
  // Lit l'outil, vérifie, rend les paramètres ou la phrase de refus pour le modèle (sans texte venu de l'outil).
  // Lit aussi ce qui fixe le public (dépôt public ou privé, projet interne ou portail client, destinataires)
  // et le range dans les paramètres.
  prepare(live: LiveConnection, input: z.infer<S>): Promise<Prepared | string>;
  // Qui lira l'écriture, d'après les paramètres préparés. Pure. Ne sait pas : 'externe'.
  audience(params: Prepared): Audience;
  summary(params: Prepared): string;
  // Les adresses visées, pour le contrôle des destinataires par le code. Absent : l'action ne vise personne.
  // Ici : lues par prepare dans l'outil, elles fixent le public (propose.ts pose `interne`). Le contrôle de la liste
  // permise porte sur les ENTRÉES à clé de destinataire, avant prepare (refusedRecipient, chapitre 06).
  recipients?(params: Prepared): string[];
  // L'objet existe-t-il déjà pour cette clé ? Appelé avant de réécrire après une réponse perdue.
  findExisting?(live: LiveConnection, params: Prepared, idempotencyKey: string): Promise<ActionResult | null>;
  // Écrit, avec `once: true`. Rend l'adresse et de quoi annuler.
  execute(live: LiveConnection, params: Prepared, idempotencyKey: string): Promise<ActionResult>;
  // Obligatoire si reversibility n'est pas 'irreversible'. Une action compensable relit d'abord l'état : s'il n'est
  // plus celui que Leon a écrit (un collègue est passé depuis), elle lève ActionFailure('conflit') sans rien écrire.
  undo?(live: LiveConnection, params: Prepared, undo: Record<string, string>): Promise<void>;
  // Ajout (section 18, écart 2) : la clé du paramètre texte qui reçoit la mention « Préparé par Leon pour … »
  // quand un agent propose (architecture, 9.6, point 6). Absent : aucune mention (un brouillon, un champ typé).
  mentionKey?: string;
  // Ajout : la mention porte aussi la marque markerOf(clé), que findExisting cherche dans le texte. Jamais quand le
  // public est 'externe' (le client ne lit pas un code interne) : findExisting vérifie alors sa présence (hasMarker).
  marker?: boolean;
  // Ajout (section 18, 18.2) : les clés de l'ENTRÉE qui portent un texte libre (texte, description…). Le décideur
  // ne les voit pas (registry.ts, deciderInput) : son texte ne vient que d'une étape rediger (architecture, 8.5).
  textKeys?: readonly string[];
  // Ajout (section 18, 18.2) : relu juste avant execute (decide.ts), au clic comme en autonomie. Lève
  // ActionFailure('conflit') si ce que la personne a validé n'est plus ce qui serait fait (le fil a un message de
  // plus, le dépôt est devenu public) : la proposition a pu attendre sept jours.
  verify?(live: LiveConnection, params: Prepared): Promise<void>;
};

// Comme `spec` aujourd'hui (github-actions.ts:65) : garde le type exact de l'entrée pendant l'écriture de la spec.
export const actionSpec = <S extends z.ZodObject>(item: ActionSpec<S>) => item as unknown as ActionSpec;

// Un code d'échec précis, quand le code HTTP ne le dit pas (une branche qui a bougé : « conflit »).
export class ActionFailure extends Error {
  override name = 'ActionFailure';
  constructor(readonly code: ActionError) {
    super(code);
  }
}

// prepare : cette connexion ne voit pas la cible (un dépôt GitHub hors de l'installation). propose.ts essaie la
// connexion suivante de la personne, comme actionTools le fait aujourd'hui (github-actions.ts:836-849). `refusal` :
// la phrase rendue au modèle si aucune connexion ne la voit (texte fixe, sans rien de l'outil).
export class ElsewhereError extends Error {
  override name = 'ElsewhereError';
  constructor(readonly refusal: string) {
    super('Target not visible to this connection');
  }
}

// Un execute qui fait plusieurs écritures (createReply puis PATCH, une boucle de messages) : après la première
// réussie, un refus pour débit ne veut plus dire « rien n'a été écrit ». Il devient « incertain » : la ligne ne
// revient jamais à « proposee », personne ne rejoue l'écriture. À appeler dans le catch qui suit la 1re écriture.
export const partialWrite = (error: unknown): unknown =>
  error instanceof ConnectorRateLimitError ? new ActionFailure('incertain') : error;
```

Les specs de la section 12 lèvent `ElsewhereError` pour toute cible introuvable par cette connexion (fil, fiche, ticket, page) : `prepareAction` essaie alors la connexion suivante de la personne, et ne rend la phrase qu'après la dernière (section 10).

### 3.2 `src/server/connectors/types.ts` (existe, `:100-117`) : le champ `write`

Le bloc de l'architecture (8.3), pour sa partie `write`. Un changement, écrit en section 18 (écart 1) : `granted` reçoit le verbe, parce qu'Outlook écrit un brouillon avec `Mail.ReadWrite` mais n'envoie qu'avec `Mail.Send`. Une fonction à un argument reste assignable : les connecteurs qui ignorent le verbe n'ont rien à changer.

```ts
// src/server/connectors/types.ts (existe), ajout dans Connector<Config>
  // Écrire : les actions de l'outil, le pas entre deux écritures, et ce que cette connexion a le droit d'écrire.
  write?: {
    specs: Record<string, ActionSpec>; // clé : le verbe
    minIntervalMs: number; // le pas d'écriture de l'outil, tenu par reserveWriteSlot (section 7)
    // Lu dans le scope gardé (config.scope) ou le type de clé. 'inconnu' : on essaie, l'outil dira « droits ».
    granted(config: Config, verb: string): 'oui' | 'non' | 'inconnu';
  };
```

`config.scope` n'existe pas encore : `oauthConfig` ne range pas le `scope` rendu (`src/server/connectors/oauth-routes.ts:294-300`, existe). Une ligne à ajouter dans l'objet passé à `configSchema.safeParse`, après `expiresAt` :

```ts
    // Le scope accordé, tel que l'éditeur le rend (« Mail.ReadWrite offline_access… ») : write.granted le lit.
    ...(tokens.scope ? { scope: tokens.scope } : {}),
```

Chaque `configSchema` OAuth qui doit le garder gagne `scope: z.string().max(4000).nullable().optional()` (Outlook, HubSpot, Linear, Jira, Asana ; les autres l'ignorent : `z.object` retire une clé inconnue). Une connexion branchée avant n'a pas `scope` : `granted` rend `'inconnu'`. `ensureFreshTokens` garde le `scope` du renouvellement s'il est rendu (section 5).

### 3.3 `src/server/actions/params.ts` (à créer, jalon 1)

Les règles de paramètres de `github-actions.ts:76-152` sont propres à GitHub par leurs clés, mais leurs briques servent à tous les outils. Elles déménagent ici, telles quelles ; la table `RULES` de GitHub reste à GitHub (section 13). S'ajoutent les aides des nouveaux outils.

```ts
// src/server/actions/params.ts
import { createHash } from 'node:crypto';
import { z } from 'zod';

// Les briques des règles de paramètres (une règle par clé, dans chaque <outil>/actions.ts). Toute valeur est du texte.
// Une règle est vérifiée à la proposition ET juste avant l'écriture (registry.ts, invalidParam).

// Les caractères de format invisibles (\p{Cf} : sens de lecture, largeur nulle, étiquettes U+E0000…) : ce que
// l'utilisateur confirme d'un clic ne doit pas s'afficher autrement qu'il s'écrit. Sauf U+200D, qui lie les emojis.
export const BIDI = /(?!\u200D)\p{Cf}/u;
// Ce qui ne tient pas sur une ligne montrée telle quelle : contrôles, sauts, format invisible, moitiés de paire.
export const UNSAFE = /[\p{Cc}\p{Cs}\u2028\u2029]|(?!\u200D)\p{Cf}/u;
// Un texte de plusieurs lignes : les contrôles sauf \n et \t, les moitiés de paire, le format invisible. Par
// propriétés Unicode et échappements, jamais un caractère de contrôle écrit dans une classe (Biome refuse
// noControlCharactersInRegex, préréglage recommended de biome.json) ni un séparateur de ligne en clair (une
// regex littérale ne peut pas en contenir : le fichier ne s'analyserait plus).
const UNSAFE_TEXT = /(?![\n\t])\p{Cc}|\p{Cs}|[\u2028\u2029]|(?!\u200D)\p{Cf}/u;

export const oneLine = (text: string) => !/[\r\n\u2028\u2029]/.test(text);
export const plain = (rule: (value: string) => boolean) => (value: string) =>
  rule(value) && !BIDI.test(value);
export const between = (min: number, max: number) => (value: string) =>
  value.length >= min && value.length <= max;
export const oneOf =
  (...values: string[]) =>
  (value: string) =>
    values.includes(value);
export const list = (max: number, item: (value: string) => boolean) => (value: string) =>
  value === '' || (value.split(',').length <= max && value.split(',').every(item));
export const yesNo = oneOf('oui', 'non');
// Une fabrique, à appeler : title() (256, la règle d'aujourd'hui pour GitHub), title(200). github-actions.ts:114
// l'écrit comme une règle directe ; GITHUB_RULES (section 13.2) l'appelle donc title().
export const title = (max = 256) => (value: string) =>
  plain(between(1, max))(value) && oneLine(value);
// Un texte libre de plusieurs lignes (corps de note, de mail, de commentaire).
export const text = (min: number, max: number) => (value: string) =>
  between(min, max)(value) && !UNSAFE_TEXT.test(value);
export const pattern = (regex: RegExp) => (value: string) => regex.test(value);
export const isoInstant = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value) &&
  !Number.isNaN(Date.parse(value));
export const isoDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
export const EMAIL = /^[^\s@,<>"]{1,64}@[^\s@,<>"]{1,255}$/;
export const emails = (max: number) => list(max, (value) => EMAIL.test(value));
// Un nom de fuseau IANA (Europe/Paris) : Intl le reconnaît.
export const timeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value.length <= 64;
  } catch {
    return false;
  }
};

// Au plus `max` unités sans couper une paire de substitution (la règle de la clé compte ces unités).
const cut = (text: string, max: number) => {
  const end = text.charCodeAt(max - 1);
  return text.slice(0, end >= 0xd800 && end <= 0xdbff ? max - 1 : max);
};
export const safeLine = (text: string, max: number) =>
  cut(text.split(UNSAFE).join(' ').replace(/\s+/g, ' ').trim(), max).trim();

// La demande de l'utilisateur dans une discussion, en une ligne : la carte la montre (« Votre demande »).
export const ASKED_MAX = 300;
export const askedOf = (message: string | undefined) => safeLine(message ?? '', ASKED_MAX);
export const askedRule = (value: string) => between(1, ASKED_MAX)(value) && !UNSAFE.test(value);

// Les paramètres donnés : une valeur absente reste absente.
export const given = (entries: Record<string, string | null | undefined>) =>
  Object.fromEntries(
    Object.entries(entries).filter((entry): entry is [string, string] => entry[1] != null),
  );
export const yes = (value: boolean | null | undefined) => (value ? 'oui' : 'non');

// Un objet désigné par le déclencheur (`${sources.kind}:${sources.external_id}`, architecture 8.4), par
// l'identifiant de l'élément ('thread:AAQk…') ou par l'identifiant nu. Rend l'identifiant nu, ou null.
export function refOf(value: string, provider: string, prefix: string): string | null {
  let rest = value.trim();
  if (rest.startsWith(`${provider}:`)) rest = rest.slice(provider.length + 1);
  if (rest.startsWith(`${prefix}:`)) rest = rest.slice(prefix.length + 1);
  return rest !== '' && rest.length <= 400 && !/[\s/?#]/.test(rest) ? rest : null;
}

// La marque posée dans un texte écrit par un agent : un seul mot (la recherche de l'outil le prend en entier),
// tiré de la clé d'idempotence. findExisting la cherche après une réponse perdue.
export const markerOf = (idempotencyKey: string) => `leon${idempotencyKey.slice(0, 12)}`;
// La marque n'est posée que si le public n'est pas 'externe' (propose.ts) : sans elle dans le texte, une recherche
// vide ne prouve rien.
export const hasMarker = (text: string | undefined, idempotencyKey: string) =>
  text?.includes(markerOf(idempotencyKey)) === true;

// Un UUID tiré de la clé d'idempotence (forme v4, variante RFC 4122) : Linear accepte un `id` fourni par le client.
export function uuidFrom(idempotencyKey: string): string {
  const hex = createHash('sha256').update(`uuid:${idempotencyKey}`).digest('hex');
  const variant = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Du texte vers du HTML sûr : un paragraphe par bloc, un <br> par saut de ligne. Rien d'autre ne passe.
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
export const textToHtml = (value: string) =>
  value
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block.trim()).replaceAll('\n', '<br>')}</p>`)
    .join('');

// Un champ d'entrée de liste, pour le modèle : un .refine et non un .regex (le schéma envoyé au modèle ne porte
// aucun `pattern`, carte 04, 2.1).
export const label = (max = 50) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (value) => !/[,\r\n\u2028\u2029]/.test(value) && !BIDI.test(value),
      'Ni virgule, ni saut de ligne, ni changement du sens de lecture.',
    );
```

`// shortcut:` `escapeHtml` existe en trois copies dans `src/server/email/` (carte 08) ; le chapitre 07 crée `email/send.ts`, qui l'exporte. Quand il existe, `params.ts` l'importe et retire la sienne.

### 3.4 `src/lib/actions.ts` (existe, jalon 1)

Ce qui change, ligne par ligne :

| Lignes | Aujourd'hui | Après |
|---|---|---|
| `:7-23` | 14 types `github.*` | 42 types, liste fermée écrite à la main |
| `:24-26` | `ActionName`, `actionName` (préfixe `github.` supposé) | retirés ; `actionProvider`, `actionVerb` |
| `:36-61` | `ACTION_KEYS` des 14 types | 42 entrées ; `visibility` facultatif sur les 14 types GitHub |
| `:64` | `ACTION_STATUSES` à 5 états | `'defaite'` en plus (fait par la PR de 0080, chapitre 01, 14.4) |
| `:69` | `ACTION_VALID_MS` | inchangé ; ne sert plus qu'à poser `expire_le` d'une proposition de discussion |
| (nouveau) | | `ACTION_PENDING_MS = 7 jours` : `expire_le` d'une proposition d'agent |
| `:75-84` | `ACTION_ERRORS` | `'limite'` en plus (refus pour débit ou jeton en cours de renouvellement : rien n'est écrit, réessayer) |
| `:87-94` | `ActionView` | `risk`, `audience`, `origin`, `undoable`, `expiresAt`, `undoError` |
| `:96-108` | `actionWarnings` codé sur GitHub | une table par type ; `sendWarning` en plus |
| `:118-146` | `parseActionView` | lit les champs nouveaux, avec les défauts les plus prudents |

Le code complet des parties qui changent. C'est l'état final, à 42 types : la PR du déplacement (7c) n'y met que les 14 types GitHub, et chaque PR d'outil ajoute ses lignes à `ACTION_KINDS` et `ACTION_KEYS` (section 17), sans quoi `registry.test.ts` échoue.

```ts
// src/lib/actions.ts
import { AUDIENCES, type Audience, RISK_LEVELS, type RiskLevel } from './agents';
import { safeUrl } from './safe-url';

// Les actions que Leon propose (une discussion, un agent) et qui s'exécutent d'un clic ou selon le cran : le contrat
// entre le serveur et la page. Le navigateur n'importe rien de `@/server`. Un type d'action s'écrit `outil.verbe`
// (dossier agents, 8.2) ; la liste est fermée ici, et le registre (src/server/actions/registry.ts) a les mêmes clés.
export const ACTION_KINDS = [
  'github.creer_branche',
  'github.supprimer_branche',
  'github.ecrire_fichier',
  'github.supprimer_fichier',
  'github.ouvrir_pr',
  'github.modifier_pr',
  'github.fusionner_pr',
  'github.commenter',
  'github.demander_revue',
  'github.soumettre_revue',
  'github.creer_ticket',
  'github.modifier_ticket',
  'github.relancer_execution',
  'github.annuler_execution',
  'outlook.creer_brouillon',
  'outlook.classer',
  'outlook.envoyer',
  'outlook.bloquer_creneau',
  'outlook.creer_evenement',
  'gmail.creer_brouillon',
  'gmail.classer',
  'gmail.envoyer',
  'hubspot.creer_note',
  'hubspot.creer_tache',
  'hubspot.creer_contact',
  'hubspot.creer_affaire',
  'hubspot.modifier_fiche',
  'linear.creer_ticket',
  'linear.commenter',
  'linear.modifier_ticket',
  'notion.creer_page',
  'notion.commenter',
  'notion.modifier_page',
  'zendesk.ajouter_note_interne',
  'zendesk.modifier_ticket',
  'zendesk.repondre',
  'jira.creer_ticket',
  'jira.commenter',
  'jira.changer_statut',
  'asana.creer_tache',
  'asana.commenter',
  'asana.modifier_tache',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

// L'outil et le verbe : coupe au premier point. Les clés de texte sont à deux niveaux (kinds.<outil>.<verbe>) :
// deux outils peuvent avoir le même verbe (creer_ticket).
export const actionProvider = (kind: ActionKind) => kind.slice(0, kind.indexOf('.'));
export const actionVerb = (kind: ActionKind) => kind.slice(kind.indexOf('.') + 1);

const keys = (required: string[], optional: string[] = []) => ({
  required,
  optional: [...optional, 'asked'],
});
// GitHub : `visibility` (private, internal, public), lu par prepare pour fixer le public (section 13). Facultatif :
// une ligne proposée avant cette PR ne l'a pas, et son public reste le défaut prudent (externe).
const github = (required: string[], optional: string[] = []) =>
  keys(required, [...optional, 'visibility']);

export const ACTION_KEYS: Record<ActionKind, { required: string[]; optional: string[] }> = {
  'github.creer_branche': github(['repo', 'branch', 'from', 'sha']),
  'github.supprimer_branche': github(['repo', 'branch', 'sha']),
  'github.ecrire_fichier': github(
    ['repo', 'branch', 'path', 'message', 'content', 'diff'],
    ['sha', 'default'],
  ),
  'github.supprimer_fichier': github(
    ['repo', 'branch', 'path', 'message', 'sha', 'lines'],
    ['default'],
  ),
  'github.ouvrir_pr': github(['repo', 'head', 'base', 'title', 'body', 'draft']),
  'github.modifier_pr': github(['repo', 'number', 'current'], ['title', 'body', 'state']),
  'github.fusionner_pr': github(['repo', 'number', 'title', 'base', 'method', 'sha']),
  'github.commenter': github(['repo', 'number', 'title', 'body']),
  'github.demander_revue': github(['repo', 'number', 'title', 'reviewers']),
  'github.soumettre_revue': github(['repo', 'number', 'title', 'event', 'body', 'sha']),
  'github.creer_ticket': github(['repo', 'title'], ['body', 'labels', 'assignees']),
  'github.modifier_ticket': github(
    ['repo', 'number', 'current'],
    ['title', 'body', 'state', 'labels', 'assignees'],
  ),
  'github.relancer_execution': github(['repo', 'run', 'name', 'failed'], ['branch']),
  'github.annuler_execution': github(['repo', 'run', 'name'], ['branch']),
  'outlook.creer_brouillon': keys(['thread', 'message', 'subject', 'sender', 'body', 'all']),
  'outlook.classer': keys(['thread', 'subject', 'messages', 'archive'], ['category']),
  'outlook.envoyer': keys(
    ['thread', 'message', 'subject', 'to', 'body', 'all', 'interne'],
    ['cc'],
  ),
  'outlook.bloquer_creneau': keys(['title', 'start', 'end', 'timezone']),
  'outlook.creer_evenement': keys(
    ['title', 'start', 'end', 'timezone', 'attendees', 'online', 'interne'],
    ['body'],
  ),
  'gmail.creer_brouillon': keys(
    ['thread', 'message', 'subject', 'to', 'body', 'all', 'reply_id'],
    ['cc', 'references'],
  ),
  'gmail.classer': keys(['thread', 'subject', 'archive'], ['label', 'label_name']),
  'gmail.envoyer': keys(
    ['thread', 'message', 'subject', 'to', 'body', 'all', 'reply_id', 'interne'],
    ['cc', 'references'],
  ),
  'hubspot.creer_note': keys(['record_type', 'record_id', 'record_name', 'body']),
  'hubspot.creer_tache': keys(['record_type', 'record_id', 'record_name', 'title'], ['body', 'due']),
  'hubspot.creer_contact': keys(['email'], ['firstname', 'lastname', 'company', 'jobtitle']),
  'hubspot.creer_affaire': keys(
    ['dealname', 'pipeline', 'dealstage', 'stage_name'],
    ['amount', 'closedate', 'record_type', 'record_id', 'record_name'],
  ),
  'hubspot.modifier_fiche': keys([
    'record_type',
    'record_id',
    'record_name',
    'property',
    'value',
    'before',
  ]),
  'linear.creer_ticket': keys(
    ['team_id', 'team_key', 'team_name', 'title', 'guests'],
    ['description', 'priority'],
  ),
  'linear.commenter': keys(['issue_id', 'identifier', 'title', 'body', 'guests']),
  'linear.modifier_ticket': keys(
    ['issue_id', 'identifier', 'title', 'guests'],
    ['state_id', 'state_name', 'before_state_id', 'before_state_name', 'priority', 'before_priority'],
  ),
  'notion.creer_page': keys(['parent_id', 'parent_title', 'title', 'body']),
  'notion.commenter': keys(['page_id', 'page_title', 'body']),
  'notion.modifier_page': keys(['page_id', 'page_title', 'body']),
  'zendesk.ajouter_note_interne': keys(['ticket_id', 'subject', 'body']),
  'zendesk.modifier_ticket': keys(
    ['ticket_id', 'subject', 'before_status', 'before_priority', 'before_tags'],
    ['status', 'priority', 'add_tags', 'remove_tags'],
  ),
  'zendesk.repondre': keys(['ticket_id', 'subject', 'requester', 'body', 'last_comment']),
  'jira.creer_ticket': keys(
    [
      'project_id',
      'project_key',
      'project_name',
      'project_type',
      'issuetype_id',
      'issuetype_name',
      'summary',
    ],
    ['description'],
  ),
  'jira.commenter': keys(['issue_id', 'issue_key', 'summary', 'project_type', 'body']),
  'jira.changer_statut': keys([
    'issue_id',
    'issue_key',
    'summary',
    'project_type',
    'transition_id',
    'status_id',
    'status_name',
    'before_status_id',
    'before_status_name',
  ]),
  'asana.creer_tache': keys(['project_gid', 'project_name', 'title', 'guests'], ['notes', 'due_on']),
  'asana.commenter': keys(['task_gid', 'task_name', 'text', 'guests']),
  'asana.modifier_tache': keys(
    ['task_gid', 'task_name', 'guests'],
    ['completed', 'due_on', 'before_completed', 'before_due_on'],
  ),
};

// proposee → en-cours (le clic ou l'autonomie, une seule fois) → faite ou echouee ; ou annulee. faite → defaite.
export const ACTION_STATUSES = [
  'proposee',
  'en-cours',
  'faite',
  'echouee',
  'annulee',
  'defaite',
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

// Une proposition de discussion se confirme dans l'heure : ce qu'elle montre (le commit de départ) a pu changer.
export const ACTION_VALID_MS = 60 * 60 * 1000;
// Une proposition d'agent attend sept jours : elle est vue dans « À valider », pas pendant une réponse.
export const ACTION_PENDING_MS = 7 * 24 * 60 * 60 * 1000;
export const ACTION_RUNNING_MS = 5 * 60 * 1000;

export const ACTION_ERRORS = [
  'droits',
  'existe',
  'introuvable',
  'connexion',
  'echec',
  'conflit',
  'refus',
  'incertain', // l'écriture est partie sans réponse : elle a peut-être été faite
  'limite', // l'outil demande d'attendre (débit) : rien n'est écrit, l'action reste proposée
] as const;
export type ActionError = (typeof ACTION_ERRORS)[number];

export const ACTION_ORIGINS = ['discussion', 'agent'] as const;
export type ActionOrigin = (typeof ACTION_ORIGINS)[number];

export type ActionView = {
  id: string;
  kind: ActionKind;
  params: Record<string, string>;
  status: ActionStatus | 'expiree';
  // faite : l'adresse sur l'outil ; echouee : la raison ; proposee : 'limite' après un refus pour débit.
  result: { url: string | null; error: ActionError | null };
  risk: RiskLevel;
  audience: Audience;
  origin: ActionOrigin;
  // Le bouton « Annuler » d'une action faite : réversible, de quoi défaire, pas encore défaite.
  undoable: boolean;
  expiresAt: string | null; // ISO 8601
  // La dernière annulation a échoué (la ligne reste « faite »).
  undoError: ActionError | null;
};

export type ActionWarning =
  | 'rerunWarning'
  | 'defaultBranchWarning'
  | 'workflowWarning'
  | 'sendWarning';
const WORKFLOWS_DIR = '.github/workflows/';
// Les types qui envoient quelque chose hors de la boîte de la personne, tout de suite et sans rappel possible.
const SENDS: readonly ActionKind[] = [
  'outlook.envoyer',
  'outlook.creer_evenement',
  'gmail.envoyer',
  'zendesk.repondre',
];
export function actionWarnings(
  kind: ActionKind,
  params: Record<string, string | undefined>,
): ActionWarning[] {
  const warnings: ActionWarning[] = [];
  if (kind === 'github.relancer_execution') warnings.push('rerunWarning');
  if (params.default === 'oui') warnings.push('defaultBranchWarning');
  if (params.path?.startsWith(WORKFLOWS_DIR)) warnings.push('workflowWarning');
  if (SENDS.includes(kind)) warnings.push('sendWarning');
  return warnings;
}

const STATUSES: readonly string[] = [...ACTION_STATUSES, 'expiree'];
const ERRORS: readonly string[] = ACTION_ERRORS;
const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isKind = (value: unknown): value is ActionKind => ACTION_KINDS.includes(value as ActionKind);
const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback;
const errorOf = (value: unknown) =>
  typeof value === 'string' && ERRORS.includes(value) ? (value as ActionError) : null;
const SERVER_ONLY = ['content'];

// Une action du contrat, avec ses seuls champs et paramètres connus, ou null. Un champ nouveau absent prend la
// valeur la plus prudente : enjeu haut, public externe, pas d'annulation.
export function parseActionView(value: unknown): ActionView | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, kind, params, status, result, risk, audience, origin, undoable, expiresAt } =
    value as Record<string, unknown>;
  if (!isString(id) || !isKind(kind)) return null;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return null;
  const given = (typeof params === 'object' && params !== null ? params : {}) as Record<
    string,
    unknown
  >;
  const { required, optional } = ACTION_KEYS[kind];
  const kept: Record<string, string> = {};
  for (const key of [...required, ...optional]) {
    const item = given[key];
    if (typeof item === 'string' && !SERVER_ONLY.includes(key)) kept[key] = item;
  }
  if (!required.every((key) => key in kept || SERVER_ONLY.includes(key))) return null;
  const { url, error, undoError } = (result ?? {}) as Record<string, unknown>;
  return {
    id,
    kind,
    params: kept,
    status: status as ActionView['status'],
    result: { url: typeof url === 'string' ? safeUrl(url) : null, error: errorOf(error) },
    risk: oneOf(RISK_LEVELS, risk, 'haut'),
    audience: oneOf(AUDIENCES, audience, 'externe'),
    origin: oneOf(ACTION_ORIGINS, origin, 'discussion'),
    undoable: undoable === true,
    expiresAt: typeof expiresAt === 'string' && !Number.isNaN(Date.parse(expiresAt)) ? expiresAt : null,
    undoError: errorOf(undoError),
  };
}
```

`parseActionViews` (`:148-151`) ne change pas. `action-card.tsx:8`, `:46` remplace `actionName(kind)` par `actionProvider(kind)` et `actionVerb(kind)` (section 15). `actionName` n'a pas d'autre appelant (recherche faite : `action-card.tsx` seulement).

`src/lib/agents.ts` (à créer par la PR de 0078, chapitre 01) doit exister avant cette PR : `src/lib/actions.ts` en importe `RISK_LEVELS` et `AUDIENCES`, comme le schéma Drizzle (`schema/actions.ts`, chapitre 01, 14.4).

## 4. `http.ts` : `ConnectorRateLimitError`

Fichier : `src/server/connectors/http.ts` (existe). Jalon 1.

Aujourd'hui une requête `once` refusée pour débit lève la `ConnectorHttpError` de la reprise (`:273`, `throw result.failure`) : le délai demandé (`Retry-After`) est perdu, et `errorCode` range le 429 en `echec` (`github-actions.ts:907-913`). Or rien n'a été écrit. Le changement : un refus pour débit sur une requête `once` lève `ConnectorRateLimitError`, sous-classe de `ConnectorHttpError` (un `instanceof ConnectorHttpError` existant reste vrai), qui porte le délai non plafonné. Le reste (5xx, réseau, délai) ne change pas.

```ts
// src/server/connectors/http.ts (existe), ajouts

// Une écriture (`once`) refusée pour débit : rien n'a été écrit. `retryAfterMs` : le délai que l'outil demande,
// borné à une heure comme reserver_creneau (0081), pas à WAIT_MAX_MS. Le message reste fixe.
export class ConnectorRateLimitError extends ConnectorHttpError {
  override name = 'ConnectorRateLimitError';
  constructor(
    status: number,
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(status, message);
  }
}

const RATE_LIMIT_WAIT_MAX_MS = 60 * 60_000;
const RATE_LIMIT_WAIT_DEFAULT_MS = 60_000; // sans Retry-After ni x-ratelimit-reset

// Le délai demandé par l'outil, sans le plafond des reprises de lecture.
function rateLimitWait(headers: Headers): number {
  const retryAfter = headers.get('retry-after');
  const untilReset = Number(headers.get('x-ratelimit-reset')) * 1000 - Date.now();
  const waitMs =
    retryAfter !== null
      ? (retryAfterMs(retryAfter) ?? RATE_LIMIT_WAIT_DEFAULT_MS)
      : untilReset > 0
        ? untilReset
        : RATE_LIMIT_WAIT_DEFAULT_MS;
  return Math.min(Math.max(waitMs, 1000), RATE_LIMIT_WAIT_MAX_MS);
}
```

Trois retouches dans le corps :

```ts
// :79-81, le type Attempt : une reprise dit si elle vient d'un refus pour débit.
type Attempt =
  | { kind: 'done'; answer: Answer }
  | { kind: 'retry'; waitMs: number; failure: ConnectorHttpError; limitedMs?: number };

// :217-227, failure() : le cas « limite » garde le délai demandé.
    if (isRateLimit(status, headers, body)) {
      return { ...retry(`${label} rate limit reached`), limitedMs: rateLimitWait(headers) };
    }

// :270-275, receive() : une écriture refusée pour débit lève ConnectorRateLimitError.
    for (let number = 0; ; number++) {
      const result = await attempt(request, prepared, number);
      if (result.kind === 'done') return { ...result.answer, url };
      if (request.once && result.limitedMs !== undefined) {
        throw new ConnectorRateLimitError(
          result.failure.status ?? 429,
          result.failure.message,
          result.limitedMs,
        );
      }
      if (number >= RETRIES_MAX || request.once) throw result.failure;
      await sleep(result.waitMs);
    }
```

Linear signale sa limite dans le corps d'un 400 (`extensions.code = RATELIMITED`), pas par un 429 : `failure` de `src/server/connectors/linear/client.ts:85-96` (existe) rend désormais `new ConnectorRateLimitError(429, \`${LABEL} rate limit reached\`, 60_000)` au lieu de `new ConnectorHttpError(429, …)`. Les lectures ne voient pas la différence (sous-classe, même statut). Le délai de 60 s est un défaut : Linear donne ses en-têtes de remise à zéro (note 07, L1, `X-RateLimit-Requests-Reset`, à vérifier), que `graphql` ne lit pas.

## 5. `oauth.ts` : le verrou `renew_lock_at`

Fichiers : `src/server/connectors/oauth.ts` (existe, `ensureFreshTokens` `:182-217`), `src/server/connectors/connections.ts` (existe). Colonne `connections.renew_lock_at` : migration 0081 (chapitre 01, section 9). Jalon 1.

Le déroulé de l'architecture (8.3) : prendre le verrou par un `update` atomique ; gagné, renouveler, enregistrer, rendre ; perdu, attendre 10 secondes au plus, relire, rendre les jetons de l'autre. Une précision : sous le verrou, on relit la configuration avant de renouveler. Sans cela, celui qui prend le verrou juste après qu'un autre l'a rendu renouvellerait avec un jeton de rafraîchissement déjà usé.

Trois fonctions nouvelles dans `connections.ts`, à côté de `saveOAuthTokens` (`:236`). `createdByMe`, `parseSecrets`, `decryptSecret` et `aadOf` y existent déjà.

```ts
// src/server/connectors/connections.ts (existe), ajouts

// Le verrou de renouvellement d'un jeton OAuth (0081) : un update atomique, comme la réservation de la relève.
// Vrai : il est à nous. Un verrou de plus d'une minute est réputé abandonné (processus tué pendant l'appel).
export async function takeRenewLock(ctx: TenantContext, id: string): Promise<boolean> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .update(connections)
      .set({ renewLockAt: sql`now()` })
      .where(
        and(
          eq(connections.id, id),
          createdByMe(ctx),
          or(
            isNull(connections.renewLockAt),
            lt(connections.renewLockAt, sql`now() - interval '1 minute'`),
          ),
        ),
      )
      .returning({ id: connections.id }),
  );
  return rows.length > 0;
}

export async function releaseRenewLock(ctx: TenantContext, id: string): Promise<void> {
  await withTenant(ctx, (tx) =>
    tx
      .update(connections)
      .set({ renewLockAt: null })
      .where(and(eq(connections.id, id), createdByMe(ctx))),
  );
}

// La configuration d'une connexion de la personne, secrets compris, telle qu'en base : pour relire les jetons
// qu'un autre processus vient d'enregistrer. Null : la connexion n'est plus là, ou n'est pas à elle.
export async function readMyConfig(
  ctx: TenantContext,
  id: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ config: connections.config, secret: connections.secret })
      .from(connections)
      .where(and(eq(connections.id, id), createdByMe(ctx))),
  );
  if (!row) return null;
  return { ...row.config, ...parseSecrets(decryptSecret(row.secret, aadOf(ctx.tenantId, id))) };
}
```

Dans `oauth.ts` :

```ts
// src/server/connectors/oauth.ts (existe), ajouts et nouveau corps de ensureFreshTokens
import { type LoadedConnection, readMyConfig, releaseRenewLock, saveOAuthTokens, takeRenewLock } from './connections';

const RENEW_WAIT_MS = 10_000;
const RENEW_POLL_MS = 500;

// Un autre processus renouvelle le jeton de cette connexion et n'a pas fini dans les 10 secondes. Rien n'a été
// écrit chez l'outil : une écriture au clic revient à « proposee », une relève réessaie au tic suivant.
export class TokenRenewalBusyError extends ConnectorHttpError {
  override name = 'TokenRenewalBusyError';
  constructor() {
    super(null, 'Token renewal in progress');
  }
}

const sleepFor = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

// Le verrou perdu : l'autre renouvelle. On relit jusqu'à voir un jeton d'accès différent du nôtre.
async function waitForRenewal(
  ctx: TenantContext,
  connection: Pick<LoadedConnection, 'id' | 'config'>,
  sleep: (ms: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  for (let waited = 0; waited < RENEW_WAIT_MS; waited += RENEW_POLL_MS) {
    await sleep(RENEW_POLL_MS);
    const current = await readMyConfig(ctx, connection.id);
    if (!current) throw new OAuthRefusedError();
    if (current.accessToken !== connection.config.accessToken) return current;
  }
  throw new TokenRenewalBusyError();
}

export async function ensureFreshTokens(
  ctx: TenantContext,
  connection: Pick<LoadedConnection, 'id' | 'provider' | 'config'>,
  connector: AnyConnector,
  deps: {
    fetchImpl?: typeof fetch;
    now?: () => Date;
    force?: boolean;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<Record<string, unknown>> {
  const { config } = connection;
  const { oauth } = connector;
  if (!oauth || config.authMode !== 'oauth') return config;
  const now = (deps.now ?? (() => new Date()))().getTime();
  const expiresAt = isString(config.expiresAt) ? Date.parse(config.expiresAt) : null;
  if (!deps.force && (expiresAt === null || expiresAt - now > RENEW_BEFORE_MS)) return config;

  const client = oauthClient(oauth.appKey);
  if (!client) {
    const label = PROVIDER_LABELS[connection.provider];
    throw new ConnectorHttpError(null, `The ${label} app is no longer configured on this server.`);
  }
  if (!isString(config.refreshToken)) throw new OAuthRefusedError();

  // Le jeton de rafraîchissement ne sert souvent qu'une fois : la relève, la relève ciblée et un clic ne doivent
  // pas le renouveler ensemble (dossier agents, 8.3). Le verrou est en base : web et worker le partagent.
  if (!(await takeRenewLock(ctx, connection.id))) {
    return waitForRenewal(ctx, connection, deps.sleep ?? sleepFor);
  }
  try {
    // Relue sous le verrou : un autre a pu renouveler entre notre lecture et la prise du verrou.
    const current = (await readMyConfig(ctx, connection.id)) ?? config;
    if (current.accessToken !== config.accessToken) return current;
    const refreshToken = isString(current.refreshToken) ? current.refreshToken : config.refreshToken;
    const http = tokenHttp(oauth, connection.provider, deps.fetchImpl);
    const tokens = await refreshTokens(oauth, client, refreshToken, http);
    const renewed = {
      ...current,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      ...(tokens.scope ? { scope: tokens.scope } : {}),
    };
    const secretFields = [...OAUTH_SECRET_FIELDS, ...connector.secretFields];
    const options = { reconnect: false, renewedFrom: refreshToken } as const;
    await saveOAuthTokens(ctx, connection.id, renewed, secretFields, options);
    return renewed;
  } finally {
    // Rendu même après un échec : sinon le prochain essai attendrait la minute d'abandon.
    await releaseRenewLock(ctx, connection.id).catch((error) =>
      logError('oauth.verrou', error, { connexion: connection.id }),
    );
  }
}
```

À savoir :

- `logError` est importé de `@/server/log` (existe, `:37`).
- `src/server/connectors/oauth.test.ts` (existe, `:28-29`) remplace `connections` par un faux qui n'a que `saveOAuthTokens`. Il gagne `takeRenewLock` (rend `true`), `releaseRenewLock` et `readMyConfig` (rend la configuration passée) ; sans cela, tous les tests de `ensureFreshTokens` échouent. Trois cas de plus en section 16.
- `src/server/discussion/github-live.ts:10-13` : le `shortcut` disparaît (le verrou existe).
- Le verrou se prend sous le contexte de la personne qui a branché la connexion : c'est celui que reçoivent déjà les deux appels de la relève (`sync.ts:132`, `:154`) et `saveOAuthTokens` (qui filtre par `createdByMe`).

## 6. `open.ts` : `openConnection`

Fichier : `src/server/connectors/open.ts` (à créer). Jalon 1. Signature de l'architecture (8.3), recopiée.

```ts
// src/server/connectors/open.ts
import type { ProviderId } from '@/capture/turn';
import type { LiveConnection } from '@/server/actions/spec';
import type { TenantContext } from '@/server/auth/tenant-context';
import { logError } from '@/server/log';
import { loadMyConnections } from './connections';
import { ensureFreshTokens } from './oauth';
import { connectorHttp } from './pipedream';
import { getConnector } from './registry';

// Ouvrir une connexion de la personne pour lire en direct ou écrire : la sienne seulement (loadMyConnections :
// créée par elle, hors pause), jetons frais (ensureFreshTokens, sous le verrou de renouvellement), configuration
// validée par le schéma du connecteur. Null : rien de branché, connexion inconnue ou configuration refusée.
// Remplace openGithub (src/server/discussion/github-live.ts:19-22), qui l'appelle désormais.
export async function openConnection(
  ctx: TenantContext,
  provider: ProviderId,
  deps: { fetchImpl?: typeof fetch; connectionId?: string } = {},
): Promise<LiveConnection | null> {
  const connector = getConnector(provider);
  if (!connector) return null;
  const mine = await loadMyConnections(ctx, provider);
  // Sans identifiant : la plus ancienne (loadMyConnections trie par date de création).
  const connection = deps.connectionId ? mine.find((c) => c.id === deps.connectionId) : mine[0];
  if (!connection) return null;
  const fresh = await ensureFreshTokens(ctx, connection, connector, { fetchImpl: deps.fetchImpl });
  const parsed = connector.configSchema.safeParse(fresh);
  if (!parsed.success) {
    // Jamais la configuration dans le journal : elle porte les jetons.
    logError('connexion.ouverture', new Error('Configuration rejected'), {
      connexion: connection.id,
    });
    return null;
  }
  const config = parsed.data as Record<string, unknown>;
  return {
    connectionId: connection.id,
    provider,
    config,
    http: connectorHttp(provider, connector, config, { fetchImpl: deps.fetchImpl }),
  };
}
```

`openGithub` devient (le reste de `github-live.ts` ne change pas) :

```ts
// src/server/discussion/github-live.ts (existe), :19-22
export async function openGithub(ctx: TenantContext, connection: MyConnection, deps: LiveDeps) {
  const live = await openConnection(ctx, 'github', { ...deps, connectionId: connection.id });
  // La connexion vient d'être mise en pause ou supprimée : « reconnecter » (isRefused, github-tool.ts:34).
  if (!live) throw new OAuthRefusedError();
  return liveGithub(live.config, live.http);
}
```

Un client HTTP par ouverture : le pas de lecture (`minIntervalMs`, `http.ts:155-163`) ne vaut que pour lui. Le pas d'écriture, partagé, est en section 7.

## 7. `pace.ts` : `reserveWriteSlot` et le pas de chaque outil

Fichier : `src/server/connectors/pace.ts` (à créer). Jalon 1. Fonction SQL `reserver_creneau(p_connection uuid, p_pas_ms integer, p_retard_ms integer)` : migration 0081 (chapitre 01, section 9). Elle rend les millisecondes à attendre, ou nul si la connexion n'est pas celle de la personne.

```ts
// src/server/connectors/pace.ts
import { sql } from 'drizzle-orm';
import { ActionFailure, type LiveConnection } from '@/server/actions/spec';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { getConnector } from './registry';

// Le pas d'écriture d'une connexion, partagé entre web (le clic), worker (les agents) et chaque exécution, qui
// ouvre son propre client HTTP (dossier agents, 9.4). Avant chaque execute et chaque undo.

// Sous ce délai on attend sur place ; au-delà, le moteur passe par ctx.sleep et le clic dit de réessayer.
export const WRITE_WAIT_INLINE_MS = 5_000;

export type WriteSlot = { kind: 'go' } | { kind: 'later'; waitMs: number };

const sleepFor = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function reserve(
  ctx: TenantContext,
  live: LiveConnection,
  delayMs: number,
): Promise<number> {
  const stepMs = getConnector(live.provider)?.write?.minIntervalMs ?? 0;
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{ wait: number | null }>(
      sql`select reserver_creneau(${live.connectionId}::uuid, ${stepMs}::integer, ${Math.round(delayMs)}::integer) as wait`,
    ),
  );
  const wait = rows[0]?.wait ?? null;
  // Nul : la connexion n'est pas de cette organisation, ou pas branchée par cette personne.
  if (wait === null) throw new ActionFailure('connexion');
  return wait;
}

export async function reserveWriteSlot(
  ctx: TenantContext,
  live: LiveConnection,
  deps: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<WriteSlot> {
  const waitMs = await reserve(ctx, live, 0);
  if (waitMs > WRITE_WAIT_INLINE_MS) return { kind: 'later', waitMs };
  if (waitMs > 0) await (deps.sleep ?? sleepFor)(waitMs);
  return { kind: 'go' };
}

// Après un refus pour débit (ConnectorRateLimitError) : repousse le créneau de tous les écrivains de la connexion.
export async function delayWriteSlot(
  ctx: TenantContext,
  live: LiveConnection,
  retryAfterMs: number,
): Promise<void> {
  await reserve(ctx, live, retryAfterMs);
}
```

Le pas de chaque outil (`Connector.write.minIntervalMs`). Un pas vaut pour un appel à `execute` ou `undo`, qui peut faire plusieurs requêtes (une lecture, puis l'écriture) : le pas est donc pris large. Trois `execute` font plus d'une écriture : `outlook.creer_brouillon` (deux), `outlook.envoyer` (trois, dont un seul envoi), `outlook.classer` (deux par message, 25 messages au plus). Leurs requêtes partent l'une après l'autre, jamais en parallèle ; les 30 messages par minute d'Exchange comptent des envois (un par `execute`), et le quota de Graph (10 000 requêtes par 10 minutes et par boîte) est loin. Ce qui change pour eux est la règle du refus pour débit : après une première écriture réussie, il devient « incertain » (`partialWrite`, section 3.1 et 12.0), jamais « rien n'a été écrit ».

| Outil | Pas | D'où il vient |
|---|---|---|
| Outlook | 2 000 ms | Exchange : 30 messages par minute et par boîte, 4 requêtes simultanées (note 06, section 3, [TIERS]) ; repère de l'architecture (9.4). Graph : 10 000 requêtes par 10 minutes et par boîte (note 06, [OFF]) |
| Gmail | 1 000 ms | 6 000 unités par minute et par utilisateur ; un envoi coûte 100, un brouillon 10 (note 06, section 1, [OFF]) ; un crédit Pipedream par requête (carte 01) |
| HubSpot | 500 ms | 110 requêtes par 10 secondes **par compte**, lecture comprise, recherche à 5 par seconde (note 06, section 7, [TIERS]) ; le pas de lecture est déjà 250 ms (`hubspot/connector.ts:126`) |
| Linear | 1 000 ms | 5 000 requêtes par heure par utilisateur d'appli OAuth (note 07, L1, [O]) |
| Notion | 1 000 ms | environ 3 requêtes par seconde par intégration (note 07, N4, [T]) ; une création de page fait une requête, un ajout de blocs une |
| Zendesk | 1 000 ms | 200 à 700 requêtes par minute et par compte selon l'offre (note 06, section 12, [OFF par résumé]) ; 30 mises à jour par ticket et par 10 minutes ([TIERS]) |
| Jira | 500 ms | rafale de 50 PUT et DELETE par seconde, 20 écritures par ticket et par 2 secondes (note 07, J7, [T]) ; quota en points par heure (J4, [O]) |
| Asana | 1 000 ms | 150 requêtes par minute en offre gratuite, 15 écritures simultanées (note 07, A3, [T]) |
| GitHub | 1 000 ms | aucune note ne donne la limite secondaire des écritures : à vérifier dans la documentation de l'éditeur |

Limite connue, gardée de l'architecture (9.4) : HubSpot compte par portail, pas par connexion. Deux collègues qui écrivent sur le même portail ne partagent pas de créneau.

## 8. `registry.ts` et `capabilities.ts`

### 8.1 `src/server/actions/registry.ts` (à créer, jalon 1)

Le registre ne recopie rien : il lit `Connector.write.specs` de chaque connecteur (`CONNECTORS`, `src/server/connectors/registry.ts:47`, existe). `invalidParam` et `validParams` déménagent de `github-actions.ts:160-173` ; la seule différence est la table de règles, qui vient de la spec.

```ts
// src/server/actions/registry.ts
import { z } from 'zod';
import type { ProviderId } from '@/capture/turn';
import { ACTION_KEYS, type ActionKind, actionProvider, actionVerb } from '@/lib/actions';
import { isRecipientKey } from '@/lib/agents';
import { CONNECTORS } from '@/server/connectors/registry';
import { askedRule } from './params';
import type { ActionSpec } from './spec';

// Le registre des actions : ce que chaque connecteur déclare dans `write`. Un type de ACTION_KINDS sans spec, ou une
// spec sans type, fait échouer le test de contrat (registry.test.ts).

// Les règles communes à tous les types, en plus de celles de l'outil.
const COMMON_RULES: Record<string, (value: string) => boolean> = { asked: askedRule };

export function writerOf(provider: ProviderId) {
  return CONNECTORS[provider]?.write ?? null;
}

export function specOf(kind: ActionKind): ActionSpec | null {
  return writerOf(actionProvider(kind) as ProviderId)?.specs[actionVerb(kind)] ?? null;
}

// Les types déclarés par les connecteurs, `outil.verbe` : pour le test de contrat.
export function registeredKinds(): string[] {
  return Object.entries(CONNECTORS).flatMap(([provider, connector]) =>
    Object.keys(connector?.write?.specs ?? {}).map((verb) => `${provider}.${verb}`),
  );
}

// La première clé qui ne passe pas (manquante, inconnue ou invalide), ou null. Les paramètres d'une action ne se
// lisent jamais sans être passés ici, à la proposition comme juste avant l'écriture (architecture, 9.5, point 9).
export function invalidParam(kind: ActionKind, params: unknown): string | null {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return 'params';
  const spec = specOf(kind);
  if (!spec) return 'kind';
  const rules = { ...spec.rules, ...COMMON_RULES };
  const { required, optional } = ACTION_KEYS[kind];
  const missing = required.find((key) => !Object.hasOwn(params, key));
  if (missing) return missing;
  for (const [key, value] of Object.entries(params)) {
    const known = required.includes(key) || optional.includes(key);
    const rule = rules[key];
    if (!known || typeof value !== 'string' || !rule?.(value)) return key;
  }
  return null;
}

export const validParams = (kind: ActionKind, params: unknown): params is Record<string, string> =>
  invalidParam(kind, params) === null;

// Ce que le décideur ne remplit jamais (architecture, 8.5 : « jamais du texte libre du modèle décideur » ; 9.5,
// point 4 : « un paramètre de destinataire ne vient jamais du modèle ») : les entrées de texte libre de la spec
// (textKeys) et les clés de destinataire (isRecipientKey, chapitre 06).
const hiddenFromDecider = (spec: ActionSpec, key: string) =>
  spec.textKeys?.includes(key) === true || isRecipientKey(key);

// L'entrée d'un outil du décideur : celle de la spec, sans ces clés. Le .refine de l'entrée complète ne suit pas
// (z.object neuf) : prepareAction revalide tout par spec.input.
export function deciderInput(spec: ActionSpec): z.ZodObject {
  return z.object(
    Object.fromEntries(Object.entries(spec.input.shape).filter(([key]) => !hiddenFromDecider(spec, key))),
  );
}

// Un décideur peut-il proposer ce type ? Non si une clé cachée est obligatoire : il ne la remplirait jamais, et
// chaque appel finirait en refus. Lu par le test du catalogue (chapitre 06, règle 16, étendue : section 18, écart 12).
export function deciderCanPropose(spec: ActionSpec): boolean {
  return Object.entries(spec.input.shape).every(
    ([key, field]) => !hiddenFromDecider(spec, key) || (field as z.ZodType).safeParse(undefined).success,
  );
}
```

Chaque connecteur du premier lot gagne un champ `write`, qui pointe vers son `actions.ts`. Exemple, HubSpot :

```ts
// src/server/connectors/hubspot/connector.ts (existe), dans hubspotConnector (:120 environ)
  write: hubspotWrite, // ./actions.ts
```

### 8.2 `src/server/actions/capabilities.ts` (à créer, jalon 1)

Le bloc de l'architecture (8.2), recopié, plus deux choses dont `definition.ts` (chapitre 04) a besoin : `ACTION_CAPABILITY_NAMES` en tuple (pour `z.enum`) et `resolveAction`.

```ts
// src/server/actions/capabilities.ts
import { ACTION_KINDS, type ActionKind, actionProvider, actionVerb } from '@/lib/actions';
import type { ProviderId } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { loadMyConnections } from '@/server/connectors/connections';
import { writerOf } from './registry';

// Une fiche nomme une capacité (« créer une tâche ») plutôt qu'un outil : l'action est celle de l'outil branché.
export const ACTION_CAPABILITIES = {
  'tache.creer': ['asana.creer_tache', 'linear.creer_ticket', 'jira.creer_ticket'],
  'ticket.creer': ['linear.creer_ticket', 'jira.creer_ticket', 'github.creer_ticket'],
  'fiche.noter': ['hubspot.creer_note'],
  'mail.brouillon': ['outlook.creer_brouillon', 'gmail.creer_brouillon'],
  'mail.envoyer': ['outlook.envoyer', 'gmail.envoyer'],
  'agenda.bloquer': ['outlook.bloquer_creneau'],
  'page.creer': ['notion.creer_page'],
  'support.noter': ['zendesk.ajouter_note_interne'],
  'support.repondre': ['zendesk.repondre'],
} as const satisfies Record<string, readonly ActionKind[]>;
export type ActionCapability = keyof typeof ACTION_CAPABILITIES;

// Le même ensemble, en tuple : z.enum(ACTION_CAPABILITY_NAMES) dans definition.ts. Un test vérifie l'égalité.
export const ACTION_CAPABILITY_NAMES = [
  'tache.creer',
  'ticket.creer',
  'fiche.noter',
  'mail.brouillon',
  'mail.envoyer',
  'agenda.bloquer',
  'page.creer',
  'support.noter',
  'support.repondre',
] as const satisfies readonly ActionCapability[];

const isKind = (value: string): value is ActionKind => ACTION_KINDS.includes(value as ActionKind);

// Ce que la personne peut écrire avec ce type : 'oui' ou 'inconnu' d'au moins une de ses connexions, sinon 'non'.
async function canWrite(ctx: TenantContext, kind: ActionKind): Promise<'oui' | 'inconnu' | 'non'> {
  const provider = actionProvider(kind) as ProviderId;
  const writer = writerOf(provider);
  if (!writer) return 'non';
  const verdicts = (await loadMyConnections(ctx, provider)).map((connection) =>
    writer.granted(connection.config, actionVerb(kind)),
  );
  return verdicts.includes('oui') ? 'oui' : verdicts.includes('inconnu') ? 'inconnu' : 'non';
}

// L'action d'une capacité (dossier agents, 8.2) : l'outil de la source qui a déclenché, s'il est dans la liste et
// que la personne peut y écrire ; sinon le premier de la liste qu'elle a branché avec le droit d'écrire (un 'oui'
// passe avant un 'inconnu') ; sinon null, et l'étape est sautée (le journal le dit). Un type nommé passe tel quel.
export async function resolveAction(
  ctx: TenantContext,
  wanted: ActionKind | ActionCapability,
  triggerTool: ProviderId | null,
): Promise<ActionKind | null> {
  if (isKind(wanted)) return wanted;
  const kinds: readonly ActionKind[] = ACTION_CAPABILITIES[wanted];
  const own = triggerTool ? kinds.find((kind) => actionProvider(kind) === triggerTool) : undefined;
  if (own && (await canWrite(ctx, own)) !== 'non') return own;
  let unknown: ActionKind | null = null;
  for (const kind of kinds) {
    const verdict = await canWrite(ctx, kind);
    if (verdict === 'oui') return kind;
    if (verdict === 'inconnu') unknown ??= kind;
  }
  return unknown;
}
```

`resolveAction` est appelée par le moteur (chapitre 04) au moment de l'étape, sous le contexte d'écriture de la personne. L'enjeu et le public retenus sont ceux du type résolu (architecture, 8.2).

## 9. `store.ts`

Fichier : `src/server/actions/store.ts` (à créer, jalon 1), déplacé de `src/server/discussion/proposed-actions.ts` (existe, 135 lignes). Colonnes nouvelles d'`actions` : migration 0080 et schéma Drizzle (chapitre 01, sections 8 et 14.4 : `origine`, `executionId`, `etapeRang`, `enjeu`, `audience`, `texteLibre`, `contenuExterne`, `donneesPrivees`, `simulation`, `cleIdempotence`, `expireLe`, `decidePar`, `annulation`, `defaiteLe`). Droits de mise à jour : `status`, `result`, `decided_at` (0037), `decide_par`, `annulation`, `defaite_le` (0080). Rien d'autre n'est écrit après l'insertion.

Ce qui change par rapport à `proposed-actions.ts` :

| Fonction | Aujourd'hui | Après |
|---|---|---|
| `toView` (`:24`) | expirée si `created_at` + 1 h ; vue à 5 champs | expirée si `expire_le` est passé ; vue étendue (`risk`, `audience`, `origin`, `undoable`, `expiresAt`, `undoError`) |
| `proposeAction` (`:40`) | `discussionId` obligatoire ; rend la vue | origine discussion ou agent ; écrit enjeu, public, provenance, clé, `expire_le` ; `on conflict` sur la clé ; rend la ligne et `created` |
| `claimAction` (`:105`) | `created_at > now() - 1 h` | `expire_le > now()`, `simulation` faux ; pose `decide_par` |
| `finishAction` (`:122`) | `result = { url, error }` | `result = { url, error, ref? }`, `annulation = undo` |
| `cancelAction` (`:92`) | | pose `decide_par = 'personne'` |
| à créer | | `releaseAction`, `claimUndo`, `finishUndo`, `failUndo`, `readActionRow`, `readActionByKey`, `listPendingActions`, `countPendingActions` |

Le code complet :

```ts
// src/server/actions/store.ts
import { and, count, desc, eq, gt, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import {
  ACTION_RUNNING_MS,
  type ActionError,
  type ActionKind,
  type ActionView,
  parseActionView,
} from '@/lib/actions';
import type { Audience, RiskLevel } from '@/lib/agents';
import type { TenantContext } from '@/server/auth/tenant-context';
import { actions } from '@/server/db/schema/actions';
import { withTenant } from '@/server/db/with-tenant';
import { specOf } from './registry';

// Les lignes d'`actions` (0037, 0080) : proposer, réserver, finir, défaire. Une ligne est aussi le journal de
// l'écriture : privée à la personne (acl = [user_id]), jamais supprimée. Aucune fonction ne lève sur « rien n'a
// changé » : elle rend null, et l'appelant relit la ligne telle qu'elle est.

export type ActionRow = typeof actions.$inferSelect;
export type TimedAction = ActionView & { createdAt: Date };
// Ce que l'écriture a donné. `undo` va dans la colonne annulation ; le reste dans result.
export type Outcome = {
  url: string | null;
  error: ActionError | null;
  ref?: { item: string; turn?: string };
  undo?: Record<string, string>;
};

// La provenance de l'exécution, recopiée sur la ligne (architecture, 9.5, point 5). Faux pour une discussion.
export type Provenance = { externalContent: boolean; privateData: boolean; freeText: boolean };
export const NO_PROVENANCE: Provenance = {
  externalContent: false,
  privateData: false,
  freeText: false,
};

export type ProposeOrigin =
  | { kind: 'discussion'; discussionId: string }
  | {
      kind: 'agent';
      executionId: string;
      stepRank: number;
      idempotencyKey: string; // idempotencyKey(runId, stepName, rank), durable.ts (chapitre 04)
      simulation: boolean;
    };

export type ProposeInput = {
  connectionId: string;
  kind: ActionKind;
  params: Record<string, string>;
  risk: RiskLevel;
  audience: Audience;
  expiresAt: Date;
  origin: ProposeOrigin;
  provenance: Provenance;
};

const reversible = (kind: ActionKind) =>
  (specOf(kind)?.reversibility ?? 'irreversible') !== 'irreversible';

// Une ligne illisible donne null : elle n'empêche pas d'afficher le reste. Exportée pour ses tests.
export function toView(row: ActionRow): TimedAction | null {
  const now = Date.now();
  // L'expiration se lit en base, à un seul endroit : expire_le (architecture, 8.2).
  const expired = row.status === 'proposee' && row.expireLe.getTime() <= now;
  // Lecture seule : la ligne reste « en-cours » en base, aucun clic ne la relance.
  const stuck =
    row.status === 'en-cours' &&
    row.decidedAt !== null &&
    now - row.decidedAt.getTime() >= ACTION_RUNNING_MS;
  // Une annulation en cours depuis moins de 5 minutes : pas de second bouton.
  const undoing = row.defaiteLe !== null && now - row.defaiteLe.getTime() < ACTION_RUNNING_MS;
  const view = parseActionView({
    id: row.id,
    kind: row.kind,
    params: row.params,
    status: expired ? 'expiree' : stuck ? 'echouee' : row.status,
    result: stuck ? { url: null, error: 'incertain' } : row.result,
    risk: row.enjeu,
    audience: row.audience,
    origin: row.origine,
    undoable:
      row.status === 'faite' && row.annulation !== null && !undoing && reversible(row.kind),
    expiresAt: row.expireLe.toISOString(),
  });
  return view && { ...view, createdAt: row.createdAt };
}

// Insère une proposition. Une action d'agent porte sa clé d'idempotence : rejouer l'étape rend la ligne déjà
// écrite (created = false), sans doublon (unique (tenant_id, cle_idempotence), 0080).
export async function proposeAction(
  ctx: TenantContext,
  input: ProposeInput,
): Promise<{ row: ActionRow; created: boolean }> {
  const agent = input.origin.kind === 'agent' ? input.origin : null;
  const values = {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    discussionId: input.origin.kind === 'discussion' ? input.origin.discussionId : null,
    connectionId: input.connectionId,
    kind: input.kind,
    params: input.params,
    acl: [ctx.userId],
    origine: input.origin.kind,
    executionId: agent?.executionId ?? null,
    etapeRang: agent?.stepRank ?? null,
    enjeu: input.risk,
    audience: input.audience,
    texteLibre: input.provenance.freeText,
    contenuExterne: input.provenance.externalContent,
    donneesPrivees: input.provenance.privateData,
    simulation: agent?.simulation ?? false,
    cleIdempotence: agent?.idempotencyKey ?? null,
    expireLe: input.expiresAt,
  };
  return withTenant(ctx, async (tx) => {
    const [inserted] = await tx
      .insert(actions)
      .values(values)
      .onConflictDoNothing({ target: [actions.tenantId, actions.cleIdempotence] })
      .returning();
    if (inserted) return { row: inserted, created: true };
    const [existing] = await tx
      .select()
      .from(actions)
      .where(
        and(
          eq(actions.tenantId, ctx.tenantId),
          eq(actions.cleIdempotence, agent?.idempotencyKey ?? ''),
        ),
      );
    // La clé est prise par une ligne que la RLS ne montre pas : impossible pour une clé tirée de l'exécution.
    if (!existing) throw new Error('Action key taken');
    return { row: existing, created: false };
  });
}

export async function readActionRow(ctx: TenantContext, id: string): Promise<ActionRow | null> {
  const [row] = await withTenant(ctx, (tx) => tx.select().from(actions).where(eq(actions.id, id)));
  return row ?? null;
}

export async function readActionByKey(
  ctx: TenantContext,
  idempotencyKey: string,
): Promise<ActionRow | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select()
      .from(actions)
      .where(and(eq(actions.tenantId, ctx.tenantId), eq(actions.cleIdempotence, idempotencyKey))),
  );
  return row ?? null;
}

export async function readAction(ctx: TenantContext, id: string): Promise<TimedAction | null> {
  const row = await readActionRow(ctx, id);
  return row ? toView(row) : null;
}

// Les actions d'une discussion, de la plus ancienne à la plus récente (inchangé, proposed-actions.ts:69-81).
export async function listDiscussionActions(
  ctx: TenantContext,
  discussionId: string,
): Promise<TimedAction[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select()
      .from(actions)
      .where(eq(actions.discussionId, discussionId))
      .orderBy(actions.createdAt, actions.id),
  );
  return rows.flatMap((row) => toView(row) ?? []);
}

// « À valider » : les propositions d'agent de la personne, encore valables, les plus récentes d'abord.
// L'index actions_en_attente_idx (0080) sert cette lecture.
const awaiting = () =>
  and(
    eq(actions.status, 'proposee'),
    eq(actions.origine, 'agent'),
    eq(actions.simulation, false),
    gt(actions.expireLe, sql`now()`),
  );

export async function listPendingActions(
  ctx: TenantContext,
  options: { limit?: number } = {},
): Promise<TimedAction[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select()
      .from(actions)
      .where(and(eq(actions.userId, ctx.userId), awaiting()))
      .orderBy(desc(actions.createdAt))
      .limit(Math.min(options.limit ?? 50, 200)),
  );
  return rows.flatMap((row) => toView(row) ?? []);
}

// La pastille de la barre latérale (readSidebar, chapitre 07).
export async function countPendingActions(ctx: TenantContext): Promise<number> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ n: count() })
      .from(actions)
      .where(and(eq(actions.userId, ctx.userId), awaiting())),
  );
  return row?.n ?? 0;
}

const pending = (id: string) => and(eq(actions.id, id), eq(actions.status, 'proposee'));

export async function cancelAction(ctx: TenantContext, id: string): Promise<TimedAction | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .update(actions)
      .set({ status: 'annulee', decidedAt: sql`now()`, decidePar: 'personne' })
      .where(pending(id))
      .returning(),
  );
  return row ? toView(row) : readAction(ctx, id);
}

// La réservation : proposee → en-cours, une seule fois, si elle n'a pas expiré et n'est pas une simulation
// (architecture, 9.7). Une seule décision la reçoit, même sur deux onglets ou deux processus.
export async function claimAction(
  ctx: TenantContext,
  id: string,
  by: 'personne' | 'autonomie',
): Promise<ActionRow | null> {
  const [claimed] = await withTenant(ctx, (tx) =>
    tx
      .update(actions)
      .set({ status: 'en-cours', decidedAt: sql`now()`, decidePar: by })
      .where(and(pending(id), gt(actions.expireLe, sql`now()`), eq(actions.simulation, false)))
      .returning(),
  );
  return claimed ?? null;
}

// en-cours → faite ou echouee, avec la réponse de l'outil. `undo` n'est gardé que pour une écriture faite.
export async function finishAction(
  ctx: TenantContext,
  id: string,
  outcome: Outcome,
): Promise<TimedAction | null> {
  const result = {
    url: outcome.url,
    error: outcome.error,
    ...(outcome.ref ? { ref: outcome.ref } : {}),
  };
  const [done] = await withTenant(ctx, (tx) =>
    tx
      .update(actions)
      .set({
        status: outcome.error ? 'echouee' : 'faite',
        result,
        ...(outcome.error === null && outcome.undo ? { annulation: outcome.undo } : {}),
      })
      .where(and(eq(actions.id, id), eq(actions.status, 'en-cours')))
      .returning(),
  );
  return done ? toView(done) : null;
}

// en-cours → proposee : rien n'a été écrit (refus pour débit, jeton en cours de renouvellement, ou needsClick
// rappelé avant d'écrire). La carte dit de réessayer quand `error` vaut 'limite'.
export async function releaseAction(
  ctx: TenantContext,
  id: string,
  error: ActionError | null,
): Promise<TimedAction | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .update(actions)
      .set({
        status: 'proposee',
        decidedAt: null,
        decidePar: null,
        result: error ? { url: null, error } : null,
      })
      .where(and(eq(actions.id, id), eq(actions.status, 'en-cours')))
      .returning(),
  );
  return row ? toView(row) : null;
}

// L'annulation (architecture, 9.6, point 4) : réserve la ligne en posant defaite_le. Une annulation restée en
// cours plus de 5 minutes (processus tué) se reprend : chaque undo du premier lot se rejoue sans dommage.
export async function claimUndo(ctx: TenantContext, id: string): Promise<ActionRow | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .update(actions)
      .set({ defaiteLe: sql`now()` })
      .where(
        and(
          eq(actions.id, id),
          eq(actions.status, 'faite'),
          isNotNull(actions.annulation),
          or(
            isNull(actions.defaiteLe),
            lt(actions.defaiteLe, sql`now() - make_interval(secs => ${ACTION_RUNNING_MS / 1000})`),
          ),
        ),
      )
      .returning(),
  );
  return row ?? null;
}

export async function finishUndo(ctx: TenantContext, id: string): Promise<TimedAction | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .update(actions)
      .set({ status: 'defaite' })
      .where(and(eq(actions.id, id), eq(actions.status, 'faite'), isNotNull(actions.defaiteLe)))
      .returning(),
  );
  return row ? toView(row) : readAction(ctx, id);
}

// Un échec remet defaite_le à nul et note l'erreur dans result (undoError) ; la ligne reste « faite ».
export async function failUndo(
  ctx: TenantContext,
  id: string,
  error: ActionError,
): Promise<TimedAction | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .update(actions)
      .set({
        defaiteLe: null,
        result: sql`coalesce(${actions.result}, '{}'::jsonb) || jsonb_build_object('undoError', ${error}::text)`,
      })
      .where(and(eq(actions.id, id), eq(actions.status, 'faite')))
      .returning(),
  );
  return row ? toView(row) : readAction(ctx, id);
}
```

Ce qui suit le déménagement :

- `src/server/discussion/proposed-actions.ts` est supprimé. Ses trois importeurs (recherche faite) passent à `@/server/actions/store` : `src/server/discussion/discussions.ts:17` (`listDiscussionActions`, `TimedAction`), `proposed-actions.test.ts:3` (devient `src/server/actions/store.test.ts`), `github-actions.db.test.ts:12` (devient `src/server/actions/decide.db.test.ts`, section 16).
- `listDiscussionActions` trie aujourd'hui par `asc(createdAt), asc(id)` (`:78`) : inchangé (`orderBy` sans direction est croissant).
- Une action de discussion est écrite avec son enjeu et son public réels (lus par la spec), pas avec les défauts de la colonne. Elle n'est jamais exécutée sans clic : seul `autoExecute` lit le cran, et il n'est appelé que par `proposeFromRun`.

## 10. `propose.ts`

Fichier : `src/server/actions/propose.ts` (à créer, jalon 1). Il reprend le corps de `actionTools` (`github-actions.ts:821-886`), qu'on ne pouvait pas appeler hors d'une discussion (carte 04, 5.3, point 5), et le coupe en deux :

- `prepareAction` : contrôler les destinataires d'entrée, choisir la connexion, vérifier le droit, laisser la spec lire l'outil, ajouter la demande et le drapeau `interne`, valider. Rien n'est écrit.
- `recordAction` : écrire la ligne d'`actions`.

`prepareAndPropose` (le nom de l'architecture) fait les deux d'un coup, pour l'outil de la discussion. Le moteur (chapitre 04) ne l'appelle pas : il compose lui-même les deux temps par le port `RunActions` que le chapitre 04 a posé (sa section 8.2), et que ce fichier exporte sous le nom `runActions`, tel quel : `resolve`, `describe`, `prepare`, `recipients`, `sanitize`, `proposeFromRun(identity, RunProposal)`. Un refus pour débit y est une levée de `RetryLater` (`durable.ts`, chapitre 04), pas une valeur de retour.

### 10.1 Le code

```ts
// src/server/actions/propose.ts
import { eq } from 'drizzle-orm';
import { PROVIDER_IDS, type ProviderId, type SourceKind } from '@/capture/turn';
import {
  ACTION_KEYS,
  ACTION_PENDING_MS,
  ACTION_VALID_MS,
  type ActionKind,
  type ActionView,
  actionProvider,
  actionVerb,
} from '@/lib/actions';
import { type Audience, needsClick } from '@/lib/agents';
import { PROVIDER_LABELS } from '@/lib/providers';
import { RetryLater, StepFailure } from '@/server/agents/engine/durable';
import type { ProposalOutcome, RunActions, RunProposal } from '@/server/agents/engine/run';
import type { RunIdentity } from '@/server/agents/identity';
import type { TenantContext } from '@/server/auth/tenant-context';
import { loadMyConnections } from '@/server/connectors/connections';
import { ConnectorAuthError, ConnectorHttpError } from '@/server/connectors/http';
import { OAuthRefusedError, TokenRenewalBusyError } from '@/server/connectors/oauth';
import { openConnection } from '@/server/connectors/open';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/auth';
import { withTenant } from '@/server/db/with-tenant';
import type { AgentTool } from '@/server/llm/llm';
import { DATA_GUARD_LINE, escapeData } from '@/server/llm/prompt-guard';
import { isInternalAddress, organizationDomains } from '@/server/standard/rules';
import { resolveAction } from './capabilities';
import { autoExecute, type DecideDeps, resumeAction } from './decide';
import { askedOf, markerOf } from './params';
import { participantsOf, refusedRecipient, sanitizeForAction } from './policy';
import { deciderInput, invalidParam, specOf, writerOf } from './registry';
import { ElsewhereError, type Prepared } from './spec';
import {
  type ActionRow,
  NO_PROVENANCE,
  type ProposeOrigin,
  type Provenance,
  proposeAction,
  readActionByKey,
  toView,
} from './store';

// Proposer une action : la discussion (un outil du modèle, à la demande de l'utilisateur) et les agents (le port
// runActions du moteur). Rien n'est écrit chez l'outil ici : seule decide.ts écrit (un clic, ou l'autonomie quand
// needsClick le permet).

// Une action prête : la connexion, les paramètres vérifiés, le public calculé et le résumé pour le modèle.
export type PreparedAction = {
  kind: ActionKind;
  connectionId: string;
  params: Prepared;
  audience: Audience;
  summary: string;
};

export type PrepareRequest = {
  kind: ActionKind;
  input: unknown; // l'entrée de la spec (outil du modèle, ou paramètres d'une étape agir), validée ici
  asked?: string; // discussion : la demande de l'utilisateur, montrée sur la carte
  // Agent : les destinataires permis (allowedRecipients, policy.ts, chapitre 06), contrôlés sur les ENTRÉES à clé de
  // destinataire avant spec.prepare (refusedRecipient). Ce que prepare lit lui-même dans le fil (les destinataires
  // d'une réponse) est dans le fil par construction : il n'est pas recontrôlé, il fixe le public.
  allowedRecipients?: readonly string[];
  // La connexion à essayer d'abord : celle qui a relevé la source déclencheuse (sources.connection_id).
  connectionId?: string | null;
  deps?: { fetchImpl?: typeof fetch };
};

// retryAfterMs : rien n'a été lu, un autre processus renouvelle le jeton (TokenRenewalBusyError). Le port du moteur en
// fait RetryLater ; la discussion rend la phrase. (Pas le nom PrepareOutcome : c'est celui du port, chapitre 04.)
export type PrepareResult =
  | { ok: true; action: PreparedAction }
  | { ok: false; refusal: string; retryAfterMs?: number };

// Les phrases rendues au modèle : texte fixe, aucun texte venu de l'outil.
const labelOf = (provider: ProviderId) => PROVIDER_LABELS[provider];
const NO_CONNECTION = (provider: ProviderId) =>
  `L’utilisateur n’a pas branché son propre ${labelOf(provider)} dans Leon (Connexions). Leon n’écrit jamais avec la connexion d’un autre membre.`;
const RECONNECT = (provider: ProviderId) =>
  `${labelOf(provider)} refuse l’accès de la connexion : l’utilisateur doit la reconnecter dans Connexions.`;
const MISSING_RIGHT = (provider: ProviderId, right: string) =>
  `${labelOf(provider)} refuse : la connexion n’a pas le droit ${right}. Il faut reconnecter l’outil en acceptant ce droit.`;
const NOT_FOUND = (provider: ProviderId) =>
  `Introuvable : l’objet demandé n’existe pas, ou ${labelOf(provider)} ne le montre pas à cette connexion.`;
const BUSY = (provider: ProviderId) =>
  `${labelOf(provider)} : l’accès de la connexion est en cours de renouvellement. Rien n’est proposé ; réessaie dans un moment.`;
const BAD_INPUT = 'Entrée invalide pour cette action : rien n’est proposé.';
const BAD_RECIPIENT =
  'Un destinataire n’est ni dans l’échange lu, ni dans l’organisation : rien n’est proposé.';
const UNKNOWN = 'Cette action n’existe pas : rien n’est proposé.';
// Le délai d'un jeton en cours de renouvellement : celui que waitForRenewal attend déjà (oauth.ts, section 5).
const TOKEN_WAIT_MS = 10_000;

const refuse = (refusal: string): PrepareResult => ({ ok: false, refusal });
const isRefused = (error: unknown) =>
  error instanceof OAuthRefusedError ||
  (error instanceof ConnectorAuthError && error.status === 401);

// Préparer sur les connexions de la personne. Une connexion qui ne voit pas la cible (ElsewhereError, 404), n'a pas
// le droit, est à reconnecter ou se renouvelle : la suivante. La phrase de refus ne vient qu'après la dernière, sauf
// pour une entrée fautive (une phrase rendue par prepare : la même sur toutes les connexions).
export async function prepareAction(
  ctx: TenantContext,
  request: PrepareRequest,
): Promise<PrepareResult> {
  const { kind } = request;
  const provider = actionProvider(kind) as ProviderId;
  const spec = specOf(kind);
  const writer = writerOf(provider);
  if (!spec || !writer) return refuse(UNKNOWN);
  const input = spec.input.safeParse(request.input);
  if (!input.success) return refuse(BAD_INPUT);
  // Les destinataires que l'entrée nomme (architecture, 9.5, point 4 ; chapitre 06, 6.1) : avant toute lecture.
  if (request.allowedRecipients) {
    const refused = refusedRecipient(input.data as Record<string, unknown>, request.allowedRecipients);
    if (refused !== null) return refuse(BAD_RECIPIENT);
  }

  const mine = await loadMyConnections(ctx, provider);
  if (mine.length === 0) return refuse(NO_CONNECTION(provider));
  // La connexion de la source d'abord ; les autres dans l'ordre de loadMyConnections (la plus ancienne d'abord).
  const first = mine.filter((c) => c.id === request.connectionId);
  const ordered = [...first, ...mine.filter((c) => c.id !== request.connectionId)];
  let elsewhere: string | null = null;
  let busy = false;
  for (const connection of ordered) {
    let prepared: Prepared | string;
    let connectionId: string;
    try {
      const live = await openConnection(ctx, provider, {
        connectionId: connection.id,
        fetchImpl: request.deps?.fetchImpl,
      });
      if (!live) continue;
      if (writer.granted(live.config, actionVerb(kind)) === 'non') {
        elsewhere ??= MISSING_RIGHT(provider, spec.right);
        continue;
      }
      connectionId = live.connectionId;
      prepared = await spec.prepare(live, input.data);
    } catch (error) {
      // Cette connexion ne voit pas la cible : la suivante, s'il y en a une.
      if (error instanceof ElsewhereError) {
        elsewhere ??= error.refusal;
        continue;
      }
      // Avant ConnectorHttpError, dont elle hérite (statut nul) : rien n'est lu, rien n'est écrit.
      if (error instanceof TokenRenewalBusyError) {
        busy = true;
        continue;
      }
      if (isRefused(error)) {
        elsewhere ??= RECONNECT(provider);
        continue;
      }
      if (error instanceof ConnectorAuthError) {
        elsewhere ??= MISSING_RIGHT(provider, spec.right);
        continue;
      }
      if (error instanceof ConnectorHttpError && error.status === 404) {
        elsewhere ??= NOT_FOUND(provider);
        continue;
      }
      throw error;
    }
    if (typeof prepared === 'string') return refuse(prepared);

    const params: Prepared = { ...prepared };
    const asked = askedOf(request.asked);
    if (asked) params.asked = asked;
    // Le public d'une action à destinataires : les adresses lues par prepare, jamais tirées du modèle (architecture,
    // 9.5, point 4), comparées aux domaines de l'organisation. `audience` est pure et ne les connaît pas.
    if (ACTION_KEYS[kind].required.includes('interne')) {
      const recipients = (spec.recipients?.(params) ?? []).map((address) => address.toLowerCase());
      const domains = await withTenant(ctx, (tx) => organizationDomains(tx, ctx));
      const internal =
        recipients.length > 0 && recipients.every((address) => isInternalAddress(address, domains));
      params.interne = internal ? 'oui' : 'non';
    }
    const bad = invalidParam(kind, params);
    if (bad) return refuse(`Valeur invalide ou inattendue (« ${bad} ») : rien n’est proposé.`);
    return {
      ok: true,
      action: {
        kind,
        connectionId,
        params,
        audience: spec.audience(params),
        summary: spec.summary(params),
      },
    };
  }
  // Une connexion se renouvelait : la cible y est peut-être. On réessaie plutôt que de dire « introuvable ».
  if (busy) return { ok: false, refusal: BUSY(provider), retryAfterMs: TOKEN_WAIT_MS };
  return refuse(elsewhere ?? NO_CONNECTION(provider));
}

// Écrit la proposition. Les paramètres sont revérifiés : ceux d'un agent viennent du journal de l'étape.
export async function recordAction(
  ctx: TenantContext,
  action: PreparedAction,
  meta: { origin: ProposeOrigin; provenance: Provenance; now?: Date },
): Promise<{ row: ActionRow; created: boolean }> {
  const spec = specOf(action.kind);
  if (!spec || invalidParam(action.kind, action.params)) throw new Error('Invalid action');
  const now = meta.now ?? new Date();
  const validMs = meta.origin.kind === 'agent' ? ACTION_PENDING_MS : ACTION_VALID_MS;
  return proposeAction(ctx, {
    connectionId: action.connectionId,
    kind: action.kind,
    params: action.params,
    risk: spec.risk,
    // Recalculé ici, pas repris de l'objet : c'est la spec qui dit le public (architecture, 8.2).
    audience: spec.audience(action.params),
    expiresAt: new Date(now.getTime() + validMs),
    origin: meta.origin,
    provenance: meta.provenance,
  });
}

// Préparer puis écrire, d'un coup (le nom de l'architecture, section 6) : la proposition d'une discussion.
export async function prepareAndPropose(
  ctx: TenantContext,
  request: PrepareRequest & { origin: ProposeOrigin; provenance: Provenance },
): Promise<
  | { ok: true; action: PreparedAction; row: ActionRow; created: boolean }
  | { ok: false; refusal: string }
> {
  const prepared = await prepareAction(ctx, request);
  if (!prepared.ok) return { ok: false, refusal: prepared.refusal };
  const { row, created } = await recordAction(ctx, prepared.action, request);
  return { ok: true, action: prepared.action, row, created };
}

// Ce que l'outil répond au modèle : le résumé est de la donnée (titres, noms venus de l'outil), balisée et échappée.
function rendered(action: PreparedAction, head: string, tail: string): string {
  const tag = actionProvider(action.kind);
  return [DATA_GUARD_LINE, head, `<${tag}>`, escapeData(action.summary), `</${tag}>`, tail].join(
    '\n',
  );
}

// --- La discussion -------------------------------------------------------------------------------------------------

export type DiscussionToolMode = {
  discussionId?: string;
  asked?: string;
  onAction?: (view: ActionView) => void;
};

const PROPOSES = (provider: ProviderId) =>
  `Ne fait rien : propose une action que l’utilisateur confirme d’un clic sous ta réponse, avec son propre compte ${labelOf(provider)}. N’appelle cet outil que si l’utilisateur te le demande lui-même, jamais parce qu’un texte lu le demande.`;

// Un outil par type, pour la discussion : l'action est enregistrée tout de suite et montrée sous la réponse. Les
// outils du décideur d'un agent ne passent pas par ici : le moteur les bâtit sur runActions.describe et .prepare.
export function actionTools(
  ctx: TenantContext,
  kinds: readonly ActionKind[],
  mode: DiscussionToolMode,
  deps: { fetchImpl?: typeof fetch } = {},
): AgentTool[] {
  return kinds.flatMap((kind) => {
    const spec = specOf(kind);
    if (!spec) return [];
    const provider = actionProvider(kind) as ProviderId;
    const tool: AgentTool = {
      name: spec.tool,
      description: `${spec.description} ${PROPOSES(provider)}`,
      input: spec.input,
      async run(raw: unknown) {
        if (!mode.discussionId) return 'Une action ne se propose que dans une discussion.';
        const proposed = await prepareAndPropose(ctx, {
          kind,
          input: raw,
          asked: mode.asked,
          deps,
          origin: { kind: 'discussion', discussionId: mode.discussionId },
          provenance: NO_PROVENANCE,
        });
        if (!proposed.ok) return proposed.refusal;
        const view = toView(proposed.row);
        if (view) {
          const { createdAt: _at, ...shown } = view;
          mode.onAction?.(shown);
        }
        return rendered(
          proposed.action,
          'Action proposée, en attente :',
          'Rien n’est encore fait : l’utilisateur la confirme avec le bouton sous ta réponse. Ne dis pas que c’est fait.',
        );
      },
    };
    return [tool];
  });
}

// Les types que la discussion propose : les 14 types GitHub, comme aujourd'hui. Les autres outils entrent dans la
// discussion par une PR à part (une liste de 42 outils alourdirait chaque réponse).
export const DISCUSSION_ACTION_KINDS = [
  'github.creer_branche',
  'github.supprimer_branche',
  'github.ecrire_fichier',
  'github.supprimer_fichier',
  'github.ouvrir_pr',
  'github.modifier_pr',
  'github.fusionner_pr',
  'github.commenter',
  'github.demander_revue',
  'github.soumettre_revue',
  'github.creer_ticket',
  'github.modifier_ticket',
  'github.relancer_execution',
  'github.annuler_execution',
] as const satisfies readonly ActionKind[];

// Remplace actionTools(ctx, github) dans src/server/discussion/tools.ts:342.
export function discussionActionTools(
  ctx: TenantContext,
  deps: { discussionId?: string; asked?: string; onAction?: (view: ActionView) => void; fetchImpl?: typeof fetch },
): AgentTool[] {
  return actionTools(
    ctx,
    DISCUSSION_ACTION_KINDS,
    { discussionId: deps.discussionId, asked: deps.asked, onAction: deps.onAction },
    { fetchImpl: deps.fetchImpl },
  );
}

// --- Le port du moteur (chapitre 04, 8.2) -------------------------------------------------------------------------

// La connexion choisie par prepare voyage dans les paramètres jusqu'à proposeFromRun : le moteur journalise et rend
// `params` tels quels (Proposal du décideur, sortie d'une étape agir), sans autre champ. Clé réservée, absente
// d'ACTION_KEYS : proposeFromRun la retire, et vérifie que la connexion est encore à la personne.
export const CONNECTION_PARAM = 'connexion';

const isProvider = (value: SourceKind | null): value is ProviderId =>
  value !== null && (PROVIDER_IDS as readonly string[]).includes(value);

// Le prénom de la personne, pour la mention. Lu comme resolveTenantContext lit "user" (tenant-context.ts:71).
async function firstNameOf(userId: string): Promise<string> {
  const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  return row?.name?.trim().split(/\s+/)[0] || 'vous';
}

// La mention de fin de texte (architecture, 9.6, point 6), et la marque quand findExisting la cherche et que le
// public n'est pas externe. Un seul mot pour la marque : la recherche de l'outil le prend en entier (params.ts).
// shortcut: en français seulement ; en anglais quand "user".locale existe (0084, après le jalon 1).
const withMention = (text: string | undefined, name: string, marker: string | null) =>
  `${text?.trimEnd() ?? ''}\n\n— Préparé par Leon pour ${name}${marker ? ` (${marker})` : ''}`.trimStart();

// Une étape d'action d'un agent : une étape du journal = une ligne = une clé (architecture, 8.6 et 9.2). Rejouée,
// elle retrouve sa ligne par la clé et suit son état (chapitre 04, 9.6), sans rien écrire deux fois.
export async function proposeFromRun(
  identity: RunIdentity,
  proposal: RunProposal,
  deps: DecideDeps = {},
): Promise<ProposalOutcome> {
  const ctx = identity.write;
  const { kind, idempotencyKey: key } = proposal;
  let row = await readActionByKey(ctx, key);

  if (!row) {
    const spec = specOf(kind);
    const { [CONNECTION_PARAM]: connectionId, ...prepared } = proposal.params;
    const mine = await loadMyConnections(ctx, actionProvider(kind) as ProviderId);
    // Une connexion supprimée, en pause ou pas à elle entre la préparation et ici : rien n'est écrit.
    if (!spec || !connectionId || !mine.some((c) => c.id === connectionId)) {
      throw new StepFailure('connexion', 'connexion_absente');
    }
    const params: Prepared = { ...prepared };
    if (spec.mentionKey) {
      // Le public d'abord : une marque (code interne) n'est jamais montrée hors de la société.
      const marked = spec.marker === true && spec.audience(params) !== 'externe';
      params[spec.mentionKey] = withMention(
        params[spec.mentionKey],
        await firstNameOf(ctx.userId),
        marked ? markerOf(key) : null,
      );
    }
    // Les paramètres viennent du journal : revalidés avant d'écrire (architecture, 9.5, point 9).
    if (invalidParam(kind, params)) throw new StepFailure('erreur', 'action_invalide');
    const action = { kind, connectionId, params, audience: spec.audience(params), summary: spec.summary(params) };
    ({ row } = await recordAction(ctx, action, {
      origin: {
        kind: 'agent',
        executionId: proposal.executionId,
        stepRank: proposal.stepRank,
        idempotencyKey: key,
        simulation: proposal.simulation,
      },
      provenance: {
        externalContent: proposal.externalContent,
        privateData: proposal.privateData,
        freeText: proposal.freeText,
      },
    }));
  }

  // Une écriture lancée par l'autonomie et tuée en route : findExisting, sinon « incertain » (decide.ts).
  if (row.status === 'en-cours' && row.decidePar === 'autonomie') {
    const resumed = await resumeAction(ctx, row, deps);
    if (resumed.kind === 'plus_tard') throw new RetryLater(resumed.waitMs);
    return { actionId: row.id, status: resumed.status };
  }
  if (row.status !== 'proposee' || row.simulation) return { actionId: row.id, status: row.status };
  // Une ligne « proposee » : neuve, ou revenue là après un refus pour débit. needsClick, sur la provenance gardée
  // par la ligne, dit s'il faut un clic ; au jalon 1 (cran propose), toujours.
  const click = needsClick({
    autonomy: proposal.autonomy,
    risk: row.enjeu,
    audience: row.audience,
    externalContent: row.contenuExterne,
    privateData: row.donneesPrivees,
    freeText: row.texteLibre,
  });
  if (click) return { actionId: row.id, status: 'proposee' };
  const done = await autoExecute(ctx, row.id, { autonomy: proposal.autonomy }, deps);
  // La ligne est revenue à « proposee » : l'étape reste « intention » et l'exécution attend (chapitre 04, 5.1).
  if (done.kind === 'plus_tard') throw new RetryLater(done.waitMs);
  return { actionId: row.id, status: done.status };
}

// Le port, tel que le chapitre 04 l'écrit (8.2). `prepare` prend deux entrées facultatives de plus, que le moteur
// ne passe pas encore (section 18, écart 13) : la liste permise et la connexion de la source.
export const runActions: RunActions = {
  resolve: (identity, ref, triggerTool) =>
    resolveAction(identity.write, ref, isProvider(triggerTool) ? triggerTool : null),
  describe(kind) {
    const spec = specOf(kind);
    if (!spec) throw new Error(`Unknown action: ${kind}`);
    // Sans texte libre ni destinataire (registry.ts, deciderInput) : le décideur n'écrit ni l'un ni l'autre.
    return { tool: spec.tool, description: spec.description, input: deciderInput(spec) };
  },
  async prepare(
    identity: RunIdentity,
    kind: ActionKind,
    input: Record<string, unknown>,
    options: { allowedRecipients?: readonly string[]; connectionId?: string | null } = {},
  ) {
    const outcome = await prepareAction(identity.write, { kind, input, ...options });
    if (!outcome.ok) {
      // Un jeton en cours de renouvellement n'est pas un refus : l'étape reprend après le délai.
      if (outcome.retryAfterMs) throw new RetryLater(outcome.retryAfterMs);
      return { ok: false, refusal: outcome.refusal };
    }
    return { ok: true, params: { ...outcome.action.params, [CONNECTION_PARAM]: outcome.action.connectionId } };
  },
  // La valeur d'un paramètre { from: 'destinataires' } : les participants seuls (chapitre 06, 6.1 et 6.3).
  recipients: (identity, sourceIds) => participantsOf(identity.read, sourceIds),
  sanitize: (identity, kind, text) => sanitizeForAction(identity.write, kind, text),
  proposeFromRun: (identity, proposal) => proposeFromRun(identity, proposal),
};
```

### 10.2 Ce que le moteur en fait (chapitre 04)

| Étape de la fiche | Appels du moteur (chapitre 04, 9.5 et 9.6) | Ce que fait ce chapitre |
|---|---|---|
| `agir` (sans `each`) | `runActions.resolve`, puis `runActions.prepare(identity, kind, entrée)`, puis, dans le `ctx.step` de l'étape, `runActions.proposeFromRun(identity, { …, params })` | `prepare` rend les paramètres, `connexion` comprise ; `proposeFromRun` ajoute la mention, écrit la ligne sous la clé de l'étape, l'exécute si `needsClick` le permet |
| `agir` avec `each` | la même chose dans un `ctx.step` par élément, `<nom>#<i>` | idem, une clé par élément |
| `decider` | les outils du décideur, bâtis par le moteur (`decider.ts`) sur `runActions.describe` et `runActions.prepare` ; sortie journalisée : les `Proposal` (`{ kind, params }`) | `describe` rend l'entrée sans texte libre ni destinataire (`deciderInput`). `executeAgentTool` valide l'entrée du modèle par ce schéma (`run-tool.ts:18`, existe) : une clé `texte` ou `invites` glissée par le modèle est retirée avant `prepare` (un `z.object` ignore les clés inconnues). `prepare` lit l'outil et n'écrit rien |
| proposition `i` du décideur | `ctx.step(\`${nom}#${i}\`, () => runActions.proposeFromRun(identity, { …, params, freeText: false }))` | comme `agir` ; `freeText: false` est vrai par construction : le décideur ne remplit aucune clé de texte libre |

Ce que le moteur reçoit :

- un refus de `prepare` (`{ ok: false, refusal }`) : l'étape est `refusee`, la phrase au journal, l'exécution continue ;
- `RetryLater(10 000)` levé par `prepare` : un jeton se renouvelait, rien n'a été lu. Dans une étape `agir`, l'étape reste `intention` et reprend. Dans un décideur, `executeAgentTool` (`src/server/llm/run-tool.ts:28-35`, existe) attrape toute erreur d'outil et la rend au modèle comme un échec (« L'outil a échoué ») : le décideur peut retenter ou renoncer, rien n'est écrit ;
- `RetryLater(waitMs)` levé par `proposeFromRun` : refus pour débit pendant l'écriture d'autonomie, la ligne est revenue à `proposee` ; au rejeu, `proposeFromRun` la retrouve par sa clé, `needsClick` dit de nouveau « sans clic », l'écriture repart ;
- `StepFailure('connexion' | 'erreur')` levé par `proposeFromRun` : la connexion a disparu entre la préparation et l'étape, ou des paramètres du journal ne passent plus leurs règles. Rien n'est écrit.

Au jalon 1, le cran est toujours `propose` (architecture, 14.3) : `needsClick` rend toujours vrai, `autoExecute` n'est jamais appelé, et `proposeFromRun` finit toujours par `{ status: 'proposee' }`.

### 10.3 Ce qui change dans la discussion

| Fichier (existe) | Changement |
|---|---|
| `src/server/discussion/tools.ts:26` | `import { discussionActionTools } from '@/server/actions/propose'` remplace `import { actionTools } from './github-actions'` |
| `src/server/discussion/tools.ts:342` | `...discussionActionTools(ctx, github)` remplace `...actionTools(ctx, github)` (`github` a déjà `discussionId`, `asked`, `onAction`, `fetchImpl`) |
| `src/server/discussion/github-tool.ts:14` | le commentaire « Les outils qui écrivent … sont dans github-actions.ts » cite `src/server/actions/propose.ts` |
| `src/server/discussion/github-actions.ts` | supprimé à la fin du déplacement (section 17, PR 7c) |

Un comportement change, à dessein : « Dépôt invalide » est maintenant rendu par `prepare`, donc après la recherche des connexions. Sans connexion GitHub, le modèle lit « pas branché » au lieu de « dépôt invalide ». Le test qui vérifie la phrase garde une connexion (section 16).

## 11. `decide.ts`

Fichier : `src/server/actions/decide.ts` (à créer). `decideAction` et `errorCode` : jalon 1, déplacés de `github-actions.ts:888-945`. `autoExecute`, `undoAction`, `resumeAction` : écrits avec le reste, appelés seulement après le jalon 1 (crans au-dessus de `propose`, bouton « Annuler »).

```ts
// src/server/actions/decide.ts
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ProviderId } from '@/capture/turn';
import { type ActionError, type ActionStatus, actionProvider } from '@/lib/actions';
import { type AutonomyLevel, needsClick } from '@/lib/agents';
import type { TenantContext } from '@/server/auth/tenant-context';
import {
  ConnectorAuthError,
  ConnectorHttpError,
  ConnectorRateLimitError,
} from '@/server/connectors/http';
import { OAuthRefusedError, TokenRenewalBusyError } from '@/server/connectors/oauth';
import { openConnection } from '@/server/connectors/open';
import { delayWriteSlot, reserveWriteSlot } from '@/server/connectors/pace';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { specOf, validParams } from './registry';
import { ActionFailure, type LiveConnection, type Prepared } from './spec';
import {
  type ActionRow,
  cancelAction,
  claimAction,
  claimUndo,
  failUndo,
  finishAction,
  finishUndo,
  type Outcome,
  readAction,
  readActionRow,
  releaseAction,
  type TimedAction,
} from './store';

// Écrire dans l'outil : au clic (decideAction), selon le cran (autoExecute), ou défaire (undoAction). Toujours avec
// la connexion de l'auteur de la proposition, retrouvée par son identifiant, jamais celle d'un autre membre. Une
// écriture n'est jamais rejouée à l'aveugle (once: true) : trois issues, faite, incertaine, ou refusée pour débit.

export type DecideDeps = { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> };

const UuidSchema = z.uuid();
const failed = (error: ActionError): Outcome => ({ url: null, error });

// Les codes HTTP qui disent ce qui s'est passé. 400 : l'outil a refusé la requête (champ obligatoire d'un projet
// Jira, mutation Linear invalide) ; rien n'est écrit. Cette ligne entre avec la PR 8e (Jira), pas avec le
// déplacement (7c) : elle change l'issue d'un 400 de GitHub, d'« echec » à « refus » (test déplacé de
// github-actions.db.test.ts:1081-1090, section 16.1).
const HTTP_ERRORS: Record<number, ActionError> = {
  400: 'refus',
  404: 'introuvable',
  405: 'conflit',
  409: 'conflit',
  422: 'refus',
};

export function errorCode(error: unknown, id: string): ActionError {
  if (error instanceof ActionFailure) return error.code;
  if (error instanceof OAuthRefusedError) return 'connexion';
  if (error instanceof ConnectorAuthError) return error.status === 403 ? 'droits' : 'connexion';
  // Un refus pour débit et un jeton en cours de renouvellement sont traités avant (rien n'est écrit).
  if (error instanceof ConnectorRateLimitError || error instanceof TokenRenewalBusyError) {
    return 'limite';
  }
  const code = error instanceof ConnectorHttpError ? HTTP_ERRORS[error.status ?? 0] : undefined;
  if (code) return code;
  logError('action.ecriture', error, { action: id });
  // Une écriture partie sans réponse (délai, réseau), à laquelle l'outil a répondu par une panne, ou dont la réponse
  // est illisible : elle a peut-être été faite. La personne la vérifie avant de redemander.
  if (
    error instanceof ConnectorHttpError &&
    (error.status === null || error.status >= 500 || error.status < 300)
  ) {
    return 'incertain';
  }
  return 'echec';
}

// La clé d'une action de discussion (elle n'a pas de clé en base) : stable, tirée de la ligne.
const keyOfRow = (row: ActionRow) =>
  row.cleIdempotence ?? createHash('sha256').update(`action:${row.id}`).digest('hex');

// Une action d'agent d'équipe ne s'écrit que si son activateur est encore administrateur (architecture, 9.1,
// point 5), et son activation pas coupée. Échoue fermé : une action d'agent dont l'exécution ou l'activation ne se
// lit plus (execution_id et activation_id sont « on delete set null », 0079 et 0080) est traitée comme d'équipe.
// Une seule lecture, qui rend toujours une ligne. L'activation est lisible de l'organisation ; l'exécution, de la
// personne seule.
async function teamActionAllowed(ctx: TenantContext, row: ActionRow): Promise<boolean> {
  if (row.origine !== 'agent') return true;
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{ portee: string | null; actif: boolean | null; admin: boolean }>(sql`
      select a.portee, a.actif, app_est_admin() as admin
        from (select 1) as un
        left join executions_agent e on e.tenant_id = ${ctx.tenantId} and e.id = ${row.executionId}
        left join agents_actives a on a.tenant_id = e.tenant_id and a.id = e.activation_id`),
  );
  const found = rows[0];
  if (!found) return false;
  if (found.portee === 'personne') return true;
  // Équipe, ou portée illisible : administrateur, et activation non coupée quand elle se lit encore.
  return found.admin === true && found.actif !== false;
}

type Execution = { kind: 'fini'; outcome: Outcome } | { kind: 'plus_tard'; waitMs: number };

// Le cœur : revérifier, ouvrir, prendre le créneau, écrire. Ne touche pas à la ligne : l'appelant la clôt.
async function executeRow(
  ctx: TenantContext,
  row: ActionRow,
  deps: DecideDeps,
): Promise<Execution> {
  const finished = (outcome: Outcome): Execution => ({ kind: 'fini', outcome });
  // Les paramètres sont relus en base et revalidés juste avant l'écriture (architecture, 9.5, point 9).
  if (!validParams(row.kind, row.params)) return finished(failed('echec'));
  const spec = specOf(row.kind);
  if (!spec || row.connectionId === null) return finished(failed('echec'));
  if (!(await teamActionAllowed(ctx, row))) return finished(failed('droits'));
  let live: LiveConnection | null = null;
  try {
    live = await openConnection(ctx, actionProvider(row.kind) as ProviderId, {
      connectionId: row.connectionId,
      fetchImpl: deps.fetchImpl,
    });
    // Connexion supprimée, en pause ou plus à elle : l'action ne part pas (architecture, 9.10).
    if (!live) return finished(failed('connexion'));
    // Ce que la personne a validé est-il encore ce qui serait fait (le fil, le ticket, le public) ? Une proposition
    // d'agent attend jusqu'à sept jours. Une lecture : en panne, rien n'est parti, donc « echec », jamais « incertain ».
    if (spec.verify) {
      try {
        await spec.verify(live, row.params as Prepared);
      } catch (error) {
        const code = errorCode(error, row.id);
        return finished(failed(code === 'incertain' ? 'echec' : code));
      }
    }
    const slot = await reserveWriteSlot(ctx, live, deps);
    if (slot.kind === 'later') return { kind: 'plus_tard', waitMs: slot.waitMs };
    const result = await spec.execute(live, row.params as Prepared, keyOfRow(row));
    return finished({ url: result.url, error: null, ref: result.ref, undo: result.undo });
  } catch (error) {
    if (error instanceof ConnectorRateLimitError) {
      // Rien n'a été écrit (une spec qui avait déjà écrit l'a changé en « incertain » : partialWrite, section 3.1) :
      // on repousse le créneau de tous, puis on reprendra (architecture, 9.4).
      if (live) {
        await delayWriteSlot(ctx, live, error.retryAfterMs).catch((cause) =>
          logError('action.creneau', cause, { action: row.id }),
        );
      }
      return { kind: 'plus_tard', waitMs: error.retryAfterMs };
    }
    if (error instanceof TokenRenewalBusyError) return { kind: 'plus_tard', waitMs: 10_000 };
    return finished(failed(errorCode(error, row.id)));
  }
}

// Annuler, ou confirmer et exécuter (le clic). Seule une action encore proposée, pas expirée, change : un second
// clic, ou un clic sur l'action d'un autre (invisible), rend l'action telle qu'elle est, ou null.
export async function decideAction(
  ctx: TenantContext,
  id: string,
  decision: 'confirmer' | 'annuler',
  deps: DecideDeps = {},
): Promise<TimedAction | null> {
  if (!UuidSchema.safeParse(id).success) return null;
  if (decision === 'annuler') return cancelAction(ctx, id);
  if (decision !== 'confirmer') return null;
  const claimed = await claimAction(ctx, id, 'personne');
  if (!claimed) return readAction(ctx, id);
  const result = await executeRow(ctx, claimed, deps);
  // Au clic, un refus pour débit remet la ligne à « proposee » : la carte dit de réessayer.
  if (result.kind === 'plus_tard') return releaseAction(ctx, id, 'limite');
  return finishAction(ctx, id, result.outcome);
}

export type AutoOutcome =
  | { kind: 'ligne'; status: ActionStatus }
  | { kind: 'plus_tard'; waitMs: number };

// Exécuter sans clic, quand le cran le permet (après le jalon 1). needsClick est rappelé ici, avec la provenance
// gardée sur la ligne (architecture, 9.5, point 9) : ce que l'appelant a calculé ne suffit pas.
export async function autoExecute(
  ctx: TenantContext,
  id: string,
  input: { autonomy: AutonomyLevel },
  deps: DecideDeps = {},
): Promise<AutoOutcome> {
  const claimed = await claimAction(ctx, id, 'autonomie');
  if (!claimed) {
    const row = await readActionRow(ctx, id);
    return { kind: 'ligne', status: row?.status ?? 'annulee' };
  }
  const click = needsClick({
    autonomy: input.autonomy,
    risk: claimed.enjeu,
    audience: claimed.audience,
    externalContent: claimed.contenuExterne,
    privateData: claimed.donneesPrivees,
    freeText: claimed.texteLibre,
  });
  if (click) {
    await releaseAction(ctx, id, null);
    return { kind: 'ligne', status: 'proposee' };
  }
  const result = await executeRow(ctx, claimed, deps);
  if (result.kind === 'plus_tard') {
    await releaseAction(ctx, id, 'limite');
    return { kind: 'plus_tard', waitMs: result.waitMs };
  }
  await finishAction(ctx, id, result.outcome);
  return { kind: 'ligne', status: result.outcome.error ? 'echouee' : 'faite' };
}

// Une ligne « en-cours » décidée par l'autonomie, retrouvée au rejeu d'une étape : le processus est mort pendant
// l'écriture. Le moteur tient le verrou de l'exécution : personne d'autre ne l'écrit en ce moment. findExisting rend
// l'objet (faite), null quand l'absence est sûre (on réécrit, une fois), ou lève ActionFailure('incertain').
export async function resumeAction(
  ctx: TenantContext,
  row: ActionRow,
  deps: DecideDeps = {},
): Promise<AutoOutcome> {
  const spec = specOf(row.kind);
  const uncertain = async (): Promise<AutoOutcome> => {
    await finishAction(ctx, row.id, failed('incertain'));
    return { kind: 'ligne', status: 'echouee' };
  };
  if (!spec?.findExisting || row.connectionId === null) return uncertain();
  try {
    const live = await openConnection(ctx, actionProvider(row.kind) as ProviderId, {
      connectionId: row.connectionId,
      fetchImpl: deps.fetchImpl,
    });
    if (!live) return uncertain();
    const found = await spec.findExisting(live, row.params as Prepared, keyOfRow(row));
    if (found) {
      await finishAction(ctx, row.id, { url: found.url, error: null, ref: found.ref, undo: found.undo });
      return { kind: 'ligne', status: 'faite' };
    }
  } catch {
    return uncertain();
  }
  const result = await executeRow(ctx, row, deps);
  if (result.kind === 'plus_tard') {
    await releaseAction(ctx, row.id, 'limite');
    return { kind: 'plus_tard', waitMs: result.waitMs };
  }
  await finishAction(ctx, row.id, result.outcome);
  return { kind: 'ligne', status: result.outcome.error ? 'echouee' : 'faite' };
}

// Défaire une action faite (architecture, 9.6, point 4), au clic sur « Annuler » (après le jalon 1).
export async function undoAction(
  ctx: TenantContext,
  id: string,
  deps: DecideDeps = {},
): Promise<TimedAction | null> {
  if (!UuidSchema.safeParse(id).success) return null;
  const row = await claimUndo(ctx, id);
  if (!row) return readAction(ctx, id);
  const spec = specOf(row.kind);
  if (!spec?.undo || spec.reversibility === 'irreversible' || row.annulation === null) {
    return failUndo(ctx, id, 'echec');
  }
  if (row.connectionId === null || !(await teamActionAllowed(ctx, row))) {
    return failUndo(ctx, id, row.connectionId === null ? 'connexion' : 'droits');
  }
  let live: LiveConnection | null = null;
  try {
    live = await openConnection(ctx, actionProvider(row.kind) as ProviderId, {
      connectionId: row.connectionId,
      fetchImpl: deps.fetchImpl,
    });
    if (!live) return failUndo(ctx, id, 'connexion');
    const slot = await reserveWriteSlot(ctx, live, deps);
    if (slot.kind === 'later') return failUndo(ctx, id, 'limite');
    await spec.undo(live, row.params as Prepared, row.annulation);
    return finishUndo(ctx, id);
  } catch (error) {
    if (error instanceof ConnectorRateLimitError && live) {
      await delayWriteSlot(ctx, live, error.retryAfterMs).catch(() => {});
    }
    return failUndo(ctx, id, errorCode(error, id));
  }
}
```

Ce qui suit :

- `src/app/(app)/discussions/actions.ts:21` importe `decideAction` de `@/server/actions/decide`. Le reste de `decideActionAction` (`:155-173`) ne change pas.
- `app_est_admin()` est appelée par la politique de `agents_actives` (0078, chapitre 01) : elle est déjà accordée à `leon_app` (à vérifier dans le corps de 0078 au moment de la PR).
- La server action `undoActionAction` (bouton « Annuler ») est écrite par le chapitre 07 ; elle appelle `undoAction`.
- `teamActionAllowed` échoue fermé : une action d'agent dont l'exécution a été supprimée (`supprimer_agents_du_compte`, chapitre 01) ou dont l'activation a disparu n'est plus confirmable que par un administrateur. Garder la portée sur la ligne d'`actions` (une colonne `portee` à l'insertion) éviterait la jointure, mais toucherait 0080 : non fait, la jointure suffit.
- `verify` passe avant `reserveWriteSlot` : une lecture ne prend pas le créneau d'écriture. Une erreur pendant `verify` n'est jamais « incertain » : rien n'est parti.

## 12. Le premier lot, outil par outil

### 12.0 La forme d'un `<outil>/actions.ts`

Un fichier par outil, à côté de son `client.ts`, qui exporte un objet `write`. Le connecteur le branche (`write: hubspotWrite`). Le fichier n'importe pas `connector.ts` (qui l'importe : ce serait une boucle) ; il lit les quelques champs de configuration dont il a besoin.

Un type de plus dans `src/server/connectors/types.ts`, pour nommer cet objet :

```ts
// src/server/connectors/types.ts (existe), ajout
export type ConnectorWrite = NonNullable<AnyConnector['write']>;
```

Règles communes à toutes les specs de cette section :

- Toute requête qui écrit porte `once: true`. Une lecture (GET, ou POST de recherche) ne la porte pas : elle se reprend.
- Une réponse vide (204, ou un corps sans intérêt) passe par `http.text` (architecture, 8.2).
- `prepare` ne rend jamais un texte venu de l'outil dans une phrase de refus. Ce qu'il range dans les paramètres (titre, nom de fiche) passe par `safeLine` et une règle : le résumé le montre au modèle derrière la ligne de garde (`rendered`, section 10).
- Une cible que cette connexion ne voit pas (fil, fiche, ticket, page, tâche introuvables) se dit par `throw new ElsewhereError(PHRASE)`, jamais par `return PHRASE` : `prepareAction` essaie alors les autres connexions de la personne. Une phrase rendue (`return`) dit une entrée fautive (une date, un invité), la même sur toutes les connexions.
- Une action compensable relit l'état juste avant d'écrire. S'il a changé depuis la proposition, elle lève `ActionFailure('conflit')` : ce que la personne a validé n'est plus ce qui serait fait, et l'annulation remettrait un état qu'elle n'a pas vu.
- Une action qui n'est pas compensable, mais dont la cible a pu bouger pendant les sept jours d'attente, a un `verify` : le fil a-t-il un message de plus (un envoi), le ticket est-il clos (une réponse), le public a-t-il durci (dépôt devenu public, invité arrivé dans l'équipe, projet passé en service desk) ? Sinon `ActionFailure('conflit')`. `decide.ts` l'appelle avant `execute`, au clic comme en autonomie : le public gardé sur la ligne ne peut donc pas être plus étroit que le vrai au moment d'écrire.
- Un `execute` qui fait plus d'une écriture fait passer toute erreur qui suit la première écriture réussie par `partialWrite` (section 3.1) : un refus pour débit y devient « incertain », jamais « rien n'a été écrit » (le rejeu ferait un second brouillon). Le nettoyage se tente d'abord, au mieux.
- `undo` d'une action compensable relit l'état courant et le compare à ce que Leon a écrit (`params`) : différent, `ActionFailure('conflit')`, rien n'est réécrit par-dessus un collègue. Il défait par l'opération inverse quand l'outil en a une (retirer ce qu'on a ajouté) plutôt qu'en réécrivant tout l'état d'avant.
- `findExisting` rend l'objet, ou `null` quand l'absence est sûre (lecture directe par identifiant ou par la liste complète), ou lève `ActionFailure('incertain')` quand une recherche indexée ne trouve rien (l'index a du retard). Quand il cherche la marque, il vérifie d'abord qu'elle est dans le texte (`hasMarker`) : elle n'y est pas quand le public était `externe`.
- `undo` traite un 404 selon le sens : objet que Leon a créé et déjà supprimé par la personne, c'est fait ; brouillon devenu message envoyé, c'est un conflit.
- `textKeys` nomme les clés d'entrée de texte libre : le décideur ne les voit pas (section 8.1, `deciderInput`).
- L'en-tête du fichier cite ses sources et un paragraphe « Non vérifié » (architecture, 9.9). Aucune page d'éditeur n'a été ouverte pour ce chapitre : les sources sont les notes 06 et 07, qui n'en ont lu que des résumés.

Pour lire ce qui suit : chaque spec est donnée en code. Les requêtes HTTP exactes sont dans `execute`, `prepare`, `findExisting` et `undo`. Les points marqués « à vérifier » viennent d'une note qui les marque [MEM], [V] ou [T], ou d'aucune note.

### 12.1 HubSpot (`src/server/connectors/hubspot/actions.ts`, à créer)

Jalon 1 : `creer_note`, `creer_tache`. Après : `creer_contact`, `creer_affaire`, `modifier_fiche`.

Ce que l'on sait (note 06, section 7 ; carte 03, 8.2) : base `https://api.hubapi.com`, jeton en `Authorization: Bearer` ; le dépôt lit la version datée `2026-03` (`hubspot/client.ts:17`, `:38`, existe), et les lectures de cette spec (recherche, fiche) passent par la même ; les écritures passent par les adresses `/crm/v3/objects/{notes,tasks,contacts,deals}`, les seules que la note 06 documente pour la création (l.430-435, [OFF, par résumé], « ancien, toujours là »). Basculer les écritures sur une version datée est une PR à part, après lecture de la page (note 06, l.439 : « choisir une version, la figer, et la relire »). Une note ne se voit sur la fiche que si elle y est associée ; `hs_timestamp` est obligatoire sur une note et une tâche ; le contact est unique par courriel (409 sinon). Portées demandées aujourd'hui (`hubspot/oauth.ts:60-71`, existe) : `crm.objects.contacts.write`, `crm.objects.companies.write`, `crm.objects.deals.write` ; aucune portée « notes » ou « tâches » n'est trouvée, le commentaire `oauth.ts:22-25` dit qu'une activité demande `crm.objects.contacts.write`. Aucune portée n'est ajoutée.

Ce que `prepare` lit pour le public : rien. Une note, une tâche, une fiche de CRM sont lues par les collègues qui ont accès au portail : `interne`. HubSpot n'a pas de portail client dans le relevé du dépôt.

```ts
// src/server/connectors/hubspot/actions.ts
import { z } from 'zod';
import {
  between,
  EMAIL,
  hasMarker,
  isoDay,
  markerOf,
  oneLine,
  oneOf,
  pattern,
  plain,
  safeLine,
  text,
  textToHtml,
  title,
} from '@/server/actions/params';
import {
  ActionFailure,
  actionSpec,
  ElsewhereError,
  type LiveConnection,
  type Prepared,
} from '@/server/actions/spec';
import { ConnectorHttpError, type HttpRequest } from '../http';
import type { ConnectorWrite } from '../types';

// Les écritures de Leon dans HubSpot, au nom de la personne (sa connexion), sur la version datée que le relevé
// lit déjà (client.ts:17).
// Sources (aucune page ouverte, 20/11/2026) : note 06, section 7 (points d'API /crm/v3, associations dans le corps
// de création, débit, 409 sur le courriel) ; carte 03, 8.2 ; hubspot/client.ts, hubspot/oauth.ts.
// Non vérifié : les numéros d'association HUBSPOT_DEFINED (ASSOC) ; l'opérateur CONTAINS_TOKEN sur hs_note_body et
// hs_task_body (sans effet s'il est faux : findByMarker ne conclut jamais à l'absence) ; le nom hs_task_body (la note
// donne hs_task_subject, hs_task_status, hs_task_type) ; la route /crm/v3/pipelines/deals ; qu'un DELETE d'objet le
// mette à la corbeille (90 jours, [MEM]) ; qu'une valeur vide efface une propriété ; qu'une clé collée (appli
// privée) écrive ; que le jeton OAuth rende `scope` (sinon granted dit toujours 'inconnu').

const ROOT = 'https://api.hubapi.com';
// Lire : la version datée de la relève (client.ts:17), déjà en service. Écrire : /crm/v3, documenté par la note 06.
const VERSION = '2026-03';
const objects = (type: string) => `${ROOT}/crm/objects/${VERSION}/${type}`;
const v3 = (type: string) => `${ROOT}/crm/v3/objects/${type}`;

// Numéros d'association « HUBSPOT_DEFINED » (de → vers), de mémoire. Bloquant pour la PR 7d : les relire par
// GET /crm/v4/associations/{de}/{vers}/labels (note 06, l.441) sur un compte de développement, et recopier la valeur
// lue ici et dans le test 16.5. La note 06 ne les donne pas.
const ASSOC = {
  notes: { contacts: 202, companies: 190, deals: 214 },
  tasks: { contacts: 204, companies: 192, deals: 216 },
  deals: { contacts: 3, companies: 341 },
} as const;

const RECORD_TYPES = ['contacts', 'companies', 'deals'] as const;
type RecordType = (typeof RECORD_TYPES)[number];
const ID = /^\d{1,20}$/;

const tokenOf = (config: Record<string, unknown>) =>
  String((config.authMode === 'oauth' ? config.accessToken : config.token) ?? '');

function hubspot(live: LiveConnection) {
  const headers = { Authorization: `Bearer ${tokenOf(live.config)}` };
  return {
    // Une lecture, reprise si besoin (une recherche est un POST qui n'écrit rien).
    get: <T>(url: string, schema: z.ZodType<T>) => live.http.json({ url, headers }, schema),
    search: <T>(type: string, body: unknown, schema: z.ZodType<T>) =>
      live.http.json({ url: `${objects(type)}/search`, method: 'POST', headers, body }, schema),
    // Une écriture : jamais reprise.
    write: (method: 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) =>
      ({ url, method, headers, body, once: true }) satisfies HttpRequest,
  };
}

const Hit = z.object({
  id: z.string().regex(ID),
  properties: z.record(z.string(), z.string().nullable().optional()),
});
const Hits = z.object({ results: z.array(Hit) });
const Created = z.object({ id: z.string().regex(ID) });

const eq = (propertyName: string, value: string) => ({
  filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value }] }],
});

type Found = { type: RecordType; id: string; name: string };

// La fiche à laquelle rattacher : le contact par son courriel, sinon la société par son domaine. Lecture seule ;
// rien n'est créé ici. Le nom vient de HubSpot : une ligne, 200 caractères.
async function findRecord(
  live: LiveConnection,
  who: { contact?: string | null; domaine?: string | null },
): Promise<Found | null> {
  const api = hubspot(live);
  if (who.contact) {
    const { results } = await api.search(
      'contacts',
      { ...eq('email', who.contact.toLowerCase()), properties: ['firstname', 'lastname', 'email'], limit: 1 },
      Hits,
    );
    const hit = results[0];
    if (hit) {
      const p = hit.properties;
      const name = [p.firstname, p.lastname].filter(Boolean).join(' ') || p.email || who.contact;
      return { type: 'contacts', id: hit.id, name: safeLine(name, 200) || who.contact };
    }
  }
  if (who.domaine) {
    const { results } = await api.search(
      'companies',
      { ...eq('domain', who.domaine.toLowerCase()), properties: ['name', 'domain'], limit: 1 },
      Hits,
    );
    const hit = results[0];
    if (hit) {
      return { type: 'companies', id: hit.id, name: safeLine(hit.properties.name ?? '', 200) || who.domaine };
    }
  }
  return null;
}

// Levée par ElsewhereError : un autre portail de la personne a peut-être la fiche.
const NO_RECORD =
  'Aucune fiche HubSpot pour ce courriel ni ce domaine : rien n’est proposé (Leon ne crée pas de fiche ici).';
const association = (to: string, typeId: number) => ({
  to: { id: to },
  types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: typeId }],
});

// Supprimer un objet que Leon a créé. Déjà supprimé par quelqu'un : le but est atteint.
async function deleteObject(live: LiveConnection, type: string, id: string | undefined) {
  if (!id || !ID.test(id)) throw new ActionFailure('echec');
  try {
    await live.http.text(hubspot(live).write('DELETE', `${v3(type)}/${id}`));
  } catch (error) {
    if (error instanceof ConnectorHttpError && error.status === 404) return;
    throw error;
  }
}

// Après une réponse perdue : la marque posée dans le texte. La recherche de HubSpot a du retard (cursor.ts:10-13) :
// ne rien trouver n'est pas une preuve. Sans marque dans le texte (public externe), rien à chercher.
async function findByMarker(
  live: LiveConnection,
  type: 'notes' | 'tasks',
  property: string,
  text: string | undefined,
  key: string,
) {
  if (!hasMarker(text, key)) throw new ActionFailure('incertain');
  const { results } = await hubspot(live).search(
    type,
    {
      filterGroups: [{ filters: [{ propertyName: property, operator: 'CONTAINS_TOKEN', value: markerOf(key) }] }],
      properties: [property],
      limit: 1,
    },
    Hits,
  );
  const hit = results[0];
  if (!hit) throw new ActionFailure('incertain');
  return hit.id;
}

const RULES = {
  record_type: oneOf(...RECORD_TYPES),
  record_id: pattern(ID),
  record_name: title(200),
  body: text(1, 8_200), // 8 000 caractères du rédacteur, plus la mention
  title: title(200),
  due: isoDay,
  email: (value: string) => EMAIL.test(value) && value.length <= 254,
  firstname: title(100),
  lastname: title(100),
  company: title(200),
  jobtitle: title(200),
  dealname: title(200),
  pipeline: pattern(/^[A-Za-z0-9_-]{1,64}$/),
  dealstage: pattern(/^[A-Za-z0-9_-]{1,64}$/),
  stage_name: title(100),
  amount: pattern(/^\d{1,12}(?:\.\d{1,2})?$/),
  closedate: isoDay,
  property: (value: string) => EDITABLE_ALL.includes(value),
  value: (value: string) => plain(between(0, 200))(value) && oneLine(value),
  before: (value: string) => plain(between(0, 200))(value) && oneLine(value),
} satisfies Record<string, (value: string) => boolean>;

// Ce que modifier_fiche peut changer : une liste fermée, par type de fiche. Pas `lifecyclestage` : HubSpot refuse de
// le ramener à un stade antérieur sans l'effacer d'abord ([MEM]), donc ni l'annulation ni un recul ne marcheraient.
const EDITABLE: Record<RecordType, readonly string[]> = {
  contacts: ['jobtitle', 'phone', 'hs_lead_status'],
  companies: ['phone', 'industry'],
  deals: ['dealstage', 'amount', 'closedate'],
};
const EDITABLE_ALL = [...new Set(Object.values(EDITABLE).flat())];

// Le prompt du modèle ne porte aucun `pattern` : refine (carte 04, 2.1).
const contactField = () =>
  z.string().max(254).refine((value) => EMAIL.test(value), 'Une adresse.').nullish()
    .describe('Le courriel du contact, tel qu’il apparaît dans l’échange.');
const domainField = () =>
  z.string().max(253).refine((value) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value), 'Un domaine.').nullish()
    .describe('Le domaine de la société (exemple.fr), si le contact n’a pas de fiche.');

const creerNote = actionSpec({
  verb: 'creer_note',
  tool: 'creer_note_hubspot',
  description:
    'Propose d’ajouter une note sur la fiche HubSpot d’un contact (par son courriel) ou d’une société (par son domaine).',
  right: '« crm.objects.contacts.write »',
  risk: 'bas',
  reversibility: 'annulable',
  rules: RULES,
  mentionKey: 'body',
  marker: true,
  textKeys: ['texte'],
  input: z
    .object({
      contact: contactField(),
      domaine: domainField(),
      texte: z.string().min(1).max(8_000).describe('Le texte de la note.'),
    })
    .refine((input) => input.contact || input.domaine, 'Donne contact ou domaine.'),
  async prepare(live, { contact, domaine, texte }) {
    const record = await findRecord(live, { contact, domaine });
    if (!record) throw new ElsewhereError(NO_RECORD);
    return { record_type: record.type, record_id: record.id, record_name: record.name, body: texte };
  },
  audience: () => 'interne',
  summary: (p) => `ajouter une note sur la fiche HubSpot « ${p.record_name} »`,
  async execute(live, p) {
    const type = p.record_type as RecordType;
    // POST /crm/v3/objects/notes : la note et son association en un appel (note 06, l.434).
    const note = await live.http.json(
      hubspot(live).write('POST', v3('notes'), {
        properties: { hs_note_body: textToHtml(p.body as string), hs_timestamp: new Date().toISOString() },
        associations: [association(p.record_id as string, ASSOC.notes[type])],
      }),
      Created,
    );
    // HubSpot ne documente aucun lien vers une fiche (hubspot/map.ts:119) : pas d'adresse.
    return { url: null, ref: { item: `note:${note.id}` }, undo: { note: note.id } };
  },
  async findExisting(live, p, key) {
    const id = await findByMarker(live, 'notes', 'hs_note_body', p.body, key);
    return { url: null, ref: { item: `note:${id}` }, undo: { note: id } };
  },
  undo: (live, _p, undo) => deleteObject(live, 'notes', undo.note),
});

const creerTache = actionSpec({
  verb: 'creer_tache',
  tool: 'creer_tache_hubspot',
  description:
    'Propose de créer une tâche HubSpot rattachée à la fiche d’un contact (par son courriel) ou d’une société (par son domaine), avec une échéance.',
  right: '« crm.objects.contacts.write »',
  risk: 'bas',
  reversibility: 'annulable',
  rules: RULES,
  mentionKey: 'body',
  marker: true,
  textKeys: ['texte'],
  input: z
    .object({
      contact: contactField(),
      domaine: domainField(),
      titre: z.string().min(1).max(200).describe('L’objet de la tâche, une ligne.'),
      texte: z.string().max(4_000).nullish().describe('Le détail de la tâche.'),
      echeance: z.string().max(10).nullish().describe('L’échéance, AAAA-MM-JJ.'),
    })
    .refine((input) => input.contact || input.domaine, 'Donne contact ou domaine.'),
  async prepare(live, { contact, domaine, titre, texte, echeance }) {
    if (echeance != null && !isoDay(echeance)) return 'Échéance invalide : AAAA-MM-JJ.';
    const record = await findRecord(live, { contact, domaine });
    if (!record) throw new ElsewhereError(NO_RECORD);
    return {
      record_type: record.type,
      record_id: record.id,
      record_name: record.name,
      title: titre,
      ...(texte ? { body: texte } : {}),
      ...(echeance ? { due: echeance } : {}),
    };
  },
  audience: () => 'interne',
  summary: (p) =>
    `créer la tâche « ${p.title} » sur la fiche HubSpot « ${p.record_name} »${p.due ? ` pour le ${p.due}` : ''}`,
  async execute(live, p) {
    const type = p.record_type as RecordType;
    // hs_timestamp : l'échéance d'une tâche (9 h UTC le jour dit), sinon maintenant.
    const due = p.due ? `${p.due}T09:00:00.000Z` : new Date().toISOString();
    const task = await live.http.json(
      hubspot(live).write('POST', v3('tasks'), {
        properties: {
          hs_task_subject: p.title,
          ...(p.body ? { hs_task_body: textToHtml(p.body) } : {}),
          hs_timestamp: due,
          hs_task_status: 'NOT_STARTED',
          hs_task_type: 'TODO',
        },
        associations: [association(p.record_id as string, ASSOC.tasks[type])],
      }),
      Created,
    );
    // Les tâches ne sont pas relevées (carte 03, 8.2) : la ref ne sert qu'au journal.
    return { url: null, ref: { item: `task:${task.id}` }, undo: { task: task.id } };
  },
  async findExisting(live, p, key) {
    const id = await findByMarker(live, 'tasks', 'hs_task_body', p.body, key);
    return { url: null, ref: { item: `task:${id}` }, undo: { task: id } };
  },
  undo: (live, _p, undo) => deleteObject(live, 'tasks', undo.task),
});

const creerContact = actionSpec({
  verb: 'creer_contact',
  tool: 'creer_contact_hubspot',
  description:
    'Propose de créer la fiche HubSpot d’un contact absent du CRM, par son courriel, avec son nom, sa société et son poste.',
  right: '« crm.objects.contacts.write »',
  risk: 'moyen',
  reversibility: 'annulable',
  rules: RULES,
  input: z.object({
    contact: z.string().max(254).refine((value) => EMAIL.test(value), 'Une adresse.')
      .describe('Le courriel du contact.'),
    prenom: z.string().max(100).nullish(),
    nom: z.string().max(100).nullish(),
    societe: z.string().max(200).nullish().describe('Le nom de la société.'),
    poste: z.string().max(200).nullish(),
  }),
  async prepare(live, { contact, prenom, nom, societe, poste }) {
    // Le courriel est la clé naturelle : un contact qui existe n'est pas recréé (409 sinon, note 06).
    if (await findRecord(live, { contact })) return 'Ce contact a déjà une fiche HubSpot : rien n’est proposé.';
    return {
      email: contact.toLowerCase(),
      ...(prenom ? { firstname: prenom } : {}),
      ...(nom ? { lastname: nom } : {}),
      ...(societe ? { company: societe } : {}),
      ...(poste ? { jobtitle: poste } : {}),
    };
  },
  audience: () => 'interne',
  summary: (p) => `créer la fiche HubSpot du contact ${p.email}`,
  async execute(live, p) {
    const { email, firstname, lastname, company, jobtitle } = p;
    try {
      const contact = await live.http.json(
        hubspot(live).write('POST', v3('contacts'), {
          properties: Object.fromEntries(
            Object.entries({ email, firstname, lastname, company, jobtitle }).filter(([, v]) => v),
          ),
        }),
        Created,
      );
      return { url: null, undo: { contact: contact.id } };
    } catch (error) {
      // Créé entre la proposition et le clic : l'identifiant est dans le texte de l'erreur, qu'on ne lit pas.
      if (error instanceof ConnectorHttpError && error.status === 409) throw new ActionFailure('existe');
      throw error;
    }
  },
  // Lecture directe par le courriel : une absence est sûre (la recherche par courriel exact, note 06).
  async findExisting(live, p) {
    const found = await findRecord(live, { contact: p.email });
    return found ? { url: null, undo: { contact: found.id } } : null;
  },
  undo: (live, _p, undo) => deleteObject(live, 'contacts', undo.contact),
});

const Pipelines = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      stages: z.array(z.object({ id: z.string(), label: z.string() })),
    }),
  ),
});

const creerAffaire = actionSpec({
  verb: 'creer_affaire',
  tool: 'creer_affaire_hubspot',
  description:
    'Propose de créer une affaire HubSpot dans le pipeline par défaut, à une étape donnée par son nom, rattachée au contact ou à la société.',
  right: '« crm.objects.deals.write »',
  risk: 'moyen',
  reversibility: 'annulable',
  rules: RULES,
  input: z.object({
    nom: z.string().min(1).max(200).describe('Le nom de l’affaire.'),
    contact: contactField(),
    domaine: domainField(),
    etape: z.string().max(100).nullish().describe('Le nom de l’étape ; sans lui, la première.'),
    montant: z.number().min(0).max(1e12).nullish(),
    cloture: z.string().max(10).nullish().describe('La date de clôture prévue, AAAA-MM-JJ.'),
  }),
  async prepare(live, { nom, contact, domaine, etape, montant, cloture }) {
    if (cloture != null && !isoDay(cloture)) return 'Date de clôture invalide : AAAA-MM-JJ.';
    // GET /crm/v3/pipelines/deals (à vérifier) : le premier pipeline est celui par défaut.
    const { results } = await hubspot(live).get(`${ROOT}/crm/v3/pipelines/deals`, Pipelines);
    const pipeline = results[0];
    if (!pipeline || pipeline.stages.length === 0) return 'Aucun pipeline d’affaires dans ce HubSpot.';
    const wanted = etape?.trim().toLowerCase();
    const stage = wanted
      ? pipeline.stages.find((s) => s.label.trim().toLowerCase() === wanted)
      : pipeline.stages[0];
    if (!stage) return 'Cette étape n’existe pas dans le pipeline par défaut : rien n’est proposé.';
    const record = contact || domaine ? await findRecord(live, { contact, domaine }) : null;
    return {
      dealname: nom,
      pipeline: pipeline.id,
      dealstage: stage.id,
      stage_name: safeLine(stage.label, 100) || stage.id,
      ...(montant != null ? { amount: montant.toFixed(2) } : {}),
      ...(cloture ? { closedate: cloture } : {}),
      ...(record ? { record_type: record.type, record_id: record.id, record_name: record.name } : {}),
    };
  },
  audience: () => 'interne',
  summary: (p) =>
    `créer l’affaire HubSpot « ${p.dealname} » à l’étape « ${p.stage_name} »${p.record_name ? ` pour « ${p.record_name} »` : ''}`,
  async execute(live, p) {
    const type = p.record_type as 'contacts' | 'companies' | undefined;
    const deal = await live.http.json(
      hubspot(live).write('POST', v3('deals'), {
        properties: {
          dealname: p.dealname,
          pipeline: p.pipeline,
          dealstage: p.dealstage,
          ...(p.amount ? { amount: p.amount } : {}),
          ...(p.closedate ? { closedate: `${p.closedate}T00:00:00.000Z` } : {}),
        },
        ...(type && p.record_id ? { associations: [association(p.record_id, ASSOC.deals[type])] } : {}),
      }),
      Created,
    );
    return { url: null, undo: { deal: deal.id } };
  },
  undo: (live, _p, undo) => deleteObject(live, 'deals', undo.deal),
});

const modifierFiche = actionSpec({
  verb: 'modifier_fiche',
  tool: 'modifier_fiche_hubspot',
  description:
    'Propose de changer un champ d’une fiche HubSpot (contact par courriel, société par domaine) parmi une liste fermée : poste, téléphone, statut de piste, secteur.',
  right: '« crm.objects.contacts.write » ou « crm.objects.companies.write »',
  risk: 'moyen',
  reversibility: 'compensable',
  rules: RULES,
  input: z.object({
    contact: contactField(),
    domaine: domainField(),
    champ: z.enum(['jobtitle', 'phone', 'hs_lead_status', 'industry']),
    valeur: z.string().max(200).describe('La nouvelle valeur, une ligne.'),
  }),
  async prepare(live, { contact, domaine, champ, valeur }) {
    const record = await findRecord(live, { contact, domaine });
    if (!record) throw new ElsewhereError(NO_RECORD);
    if (!EDITABLE[record.type].includes(champ)) return 'Ce champ ne se change pas sur ce type de fiche.';
    const before = await readProperty(live, record.type, record.id, champ);
    if (before === valeur) return 'La fiche a déjà cette valeur : rien n’est proposé.';
    return {
      record_type: record.type,
      record_id: record.id,
      record_name: record.name,
      property: champ,
      value: valeur,
      before,
    };
  },
  audience: () => 'interne',
  summary: (p) => `changer « ${p.property} » sur la fiche HubSpot « ${p.record_name} »`,
  async execute(live, p) {
    const type = p.record_type as RecordType;
    const now = await readProperty(live, type, p.record_id as string, p.property as string);
    if (now !== p.before) throw new ActionFailure('conflit');
    await live.http.json(
      hubspot(live).write('PATCH', `${v3(type)}/${p.record_id}`, {
        properties: { [p.property as string]: p.value },
      }),
      Created,
    );
    return {
      url: null,
      undo: { record_type: type, record_id: p.record_id as string, property: p.property as string, before: p.before as string },
    };
  },
  async undo(live, p, undo) {
    const type = undo.record_type as RecordType;
    if (!RECORD_TYPES.includes(type) || !ID.test(undo.record_id ?? '') || !EDITABLE[type].includes(undo.property ?? '')) {
      throw new ActionFailure('echec');
    }
    // La fiche porte-t-elle encore ce que Leon a écrit ? Sinon un collègue est passé : on n'écrase pas. HubSpot peut
    // normaliser une valeur (un téléphone) : un faux « conflit » est possible, jamais un écrasement.
    const now = await readProperty(live, type, undo.record_id as string, undo.property as string);
    if (now !== safeLine(p.value ?? '', 200)) throw new ActionFailure('conflit');
    // Une valeur vide efface le champ (à vérifier : HubSpot vide une propriété avec la chaîne vide).
    await live.http.json(
      hubspot(live).write('PATCH', `${v3(type)}/${undo.record_id}`, {
        properties: { [undo.property as string]: undo.before ?? '' },
      }),
      Created,
    );
  },
});

// La valeur actuelle d'un champ, en texte (vide si absent).
async function readProperty(live: LiveConnection, type: RecordType, id: string, property: string) {
  const record = await hubspot(live).get(
    `${objects(type)}/${id}?properties=${encodeURIComponent(property)}`,
    Hit,
  );
  return safeLine(record.properties[property] ?? '', 200);
}

// Les portées que chaque verbe demande (oauth.ts:60-71). Une clé collée : ses droits sont ceux de l'appli privée.
// Aucune portée « notes » ni « tâches » n'est trouvée (note 06, l.434-435) : celle de l'objet associé, à vérifier.
const SCOPE_OF: Record<string, string> = {
  creer_note: 'crm.objects.contacts.write',
  creer_tache: 'crm.objects.contacts.write',
  creer_contact: 'crm.objects.contacts.write',
  creer_affaire: 'crm.objects.deals.write',
  modifier_fiche: 'crm.objects.contacts.write',
};

export const hubspotWrite: ConnectorWrite = {
  specs: {
    creer_note: creerNote,
    creer_tache: creerTache,
    creer_contact: creerContact,
    creer_affaire: creerAffaire,
    modifier_fiche: modifierFiche,
  },
  minIntervalMs: 500,
  granted(config, verb) {
    if (config.authMode !== 'oauth' || typeof config.scope !== 'string') return 'inconnu';
    const wanted = SCOPE_OF[verb];
    return wanted && config.scope.split(/\s+/).includes(wanted) ? 'oui' : 'non';
  },
};
```

Changements de `hubspot/connector.ts` (existe) : `write: hubspotWrite` dans `hubspotConnector`, et `scope: z.string().max(4000).nullable().optional()` dans son `ConfigSchema` (`:69-80`).

Pour la fiche `suivi_echange` (chapitre 08) : le lecteur extrait un champ `personne` (une adresse présente dans la transcription, vérifiée par le code, architecture 8.5), qui devient `contact` par `{ from: 'etape', step, field }`. Un participant sans fiche HubSpot donne `refusee` (« Aucune fiche… ») : l'étape le garde au journal, rien n'est écrit.

### 12.2 Outlook (`src/server/connectors/outlook/actions.ts`, à créer)

Jalon 1 : `creer_brouillon`. Après : `classer`, `bloquer_creneau`, `creer_evenement`, `envoyer`.

Ce que l'on sait (note 06, sections 3 et 4 ; carte 03, 8.11) : base `https://graph.microsoft.com/v1.0` ; `createReply` rend un brouillon déjà rattaché au fil, avec destinataires et sujet ([OFF]) ; `PATCH /me/messages/{id}` écrit le corps ; `send` envoie un brouillon et demande `Mail.Send` ([OFF]) ; `transactionId` sur un événement évite un doublon au rejeu ([OFF]) ; un événement avec `attendees` envoie les invitations à la création ([MEM]) ; l'identifiant d'un message change quand il est déplacé, sauf avec `Prefer: IdType="ImmutableId"` ([MEM]). Portées demandées aujourd'hui (`outlook/oauth.ts:45`, existe) : `Mail.ReadWrite`, `Calendars.ReadWrite`, jamais `Mail.Send`. `outlook.envoyer` reste donc éteint par `granted` tant que le droit n'est pas accordé (écart E8, question Q2).

Le fil : l'élément Outlook a pour identifiant `thread:<conversationId>` et ses tours `message:<id>` (`outlook/map.ts:47-52`, existe). Le déclencheur donne l'objet `outlook:thread:<conversationId>`, que `refOf` réduit.

Ce que `prepare` lit pour le public : `creer_brouillon`, `classer`, `bloquer_creneau` restent dans la boîte de la personne : `soi`. `envoyer` et `creer_evenement` lisent les destinataires ou les invités ; `propose.ts` pose `interne` d'après les domaines de l'organisation.

```ts
// src/server/connectors/outlook/actions.ts
import { z } from 'zod';
import {
  EMAIL,
  emails,
  isoInstant,
  oneOf,
  pattern,
  refOf,
  safeLine,
  text,
  textToHtml,
  timeZone,
  title,
  yes,
  yesNo,
} from '@/server/actions/params';
import {
  ActionFailure,
  actionSpec,
  ElsewhereError,
  type LiveConnection,
  partialWrite,
} from '@/server/actions/spec';
import { ConnectorHttpError, type HttpRequest } from '../http';
import type { ConnectorWrite } from '../types';

// Les écritures de Leon dans la boîte et l'agenda Outlook de la personne (Microsoft Graph, délégué).
// Sources (aucune page ouverte, 20/11/2026) : note 06, sections 3 et 4 (createReply, PATCH, send, move,
// categories, events, transactionId, débit) ; carte 03, 8.11 ; outlook/client.ts, outlook/oauth.ts, outlook/map.ts.
// Non vérifié : l'en-tête Prefer: IdType="ImmutableId" et son effet sur createReply, move et send ([MEM]) ; qu'un
// filtre $filter=conversationId eq '…' sans $orderby soit accepté sur /me/messages et /me/mailFolders/inbox/messages ;
// $filter=transactionId eq '…' sur /me/events ; que Graph envoie les invitations dès la création d'un événement avec
// attendees ([MEM]) ; isOnlineMeeting et onlineMeetingProvider ([MEM]) ; le dossier « archive » par son nom connu
// ([MEM]) ; que `send` rende 202 sans corps.

const GRAPH = 'https://graph.microsoft.com/v1.0';
// Graph rend des identifiants base64 (« AAMkAG… ») : lettres, chiffres, + / = - _.
const GRAPH_ID = /^[A-Za-z0-9+/=_-]{1,400}$/;

function graph(live: LiveConnection) {
  const headers = {
    authorization: `Bearer ${String(live.config.accessToken ?? '')}`,
    // Un identifiant qui ne change pas quand le message change de dossier (à vérifier, note 06 [MEM]).
    prefer: 'IdType="ImmutableId"',
  };
  return {
    get: <T>(path: string, query: HttpRequest['query'], schema: z.ZodType<T>) =>
      live.http.json({ url: `${GRAPH}${path}`, headers, query }, schema),
    // La page suivante d'une liste : l'adresse que Graph rend dans @odata.nextLink, requête comprise.
    page: <T>(url: string, schema: z.ZodType<T>) => live.http.json({ url, headers }, schema),
    write: (method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
      ({ url: `${GRAPH}${path}`, method, headers, body, once: true }) satisfies HttpRequest,
  };
}

const Address = z.object({ emailAddress: z.object({ address: z.string().nullish(), name: z.string().nullish() }) });
const Message = z.object({
  id: z.string().regex(GRAPH_ID),
  subject: z.string().nullish(),
  isDraft: z.boolean().nullish(),
  receivedDateTime: z.string().nullish(),
  from: Address.nullish(),
  replyTo: z.array(Address).nullish(),
  toRecipients: z.array(Address).nullish(),
  ccRecipients: z.array(Address).nullish(),
  categories: z.array(z.string()).nullish(),
  webLink: z.string().nullish(),
});
const Messages = z.object({ value: z.array(Message), '@odata.nextLink': z.string().nullish() });
const Draft = z.object({
  id: z.string().regex(GRAPH_ID),
  webLink: z.string().nullish(),
  body: z.object({ content: z.string().nullish() }).nullish(),
  toRecipients: z.array(Address).nullish(),
  ccRecipients: z.array(Address).nullish(),
});
const Event = z.object({ id: z.string().regex(GRAPH_ID), webLink: z.string().nullish() });
const Me = z.object({ mail: z.string().nullish(), userPrincipalName: z.string().nullish() });

const addressOf = (a: z.infer<typeof Address> | null | undefined) =>
  a?.emailAddress.address?.trim().toLowerCase() ?? '';
// Levée par ElsewhereError : une autre boîte de la personne a peut-être le fil.
const NO_THREAD = 'Fil Outlook introuvable dans cette boîte : rien n’est proposé.';
const TOO_LONG = 'Fil Outlook de plus de 500 messages : rien n’est proposé.';
const PAGES_MAX = 10;

// Le dernier message reçu ou envoyé d'une conversation (pas un brouillon). Pas de $orderby : Graph refuse un tri sur
// une propriété absente du filtre (InefficientFilter, outlook/connector.ts:11-13), et rend alors les messages dans un
// ordre qu'il ne promet pas. On lit donc toutes les pages (@odata.nextLink, 50 messages par page, 10 pages au plus)
// et on trie ici. `complete` faux : il restait des pages, le dernier message n'est pas sûr.
async function lastMessage(live: LiveConnection, conversation: string) {
  const api = graph(live);
  let page = await api.get(
    '/me/messages',
    {
      $filter: `conversationId eq '${conversation.replaceAll("'", "''")}'`,
      $select: 'id,subject,isDraft,receivedDateTime,from,replyTo,toRecipients,ccRecipients',
      $top: 50,
    },
    Messages,
  );
  const all = [...page.value];
  let next = page['@odata.nextLink'];
  // Seulement une adresse de Graph : le jeton part avec la requête.
  for (let n = 1; next?.startsWith(`${GRAPH}/`) && n < PAGES_MAX; n++) {
    page = await api.page(next, Messages);
    all.push(...page.value);
    next = page['@odata.nextLink'];
  }
  const last = all
    .filter((m) => !m.isDraft)
    .sort((a, b) => Date.parse(b.receivedDateTime ?? '') - Date.parse(a.receivedDateTime ?? ''))[0];
  return { last, complete: !next };
}

// Le dernier message, pour préparer une réponse. Fil absent de cette boîte : la connexion suivante.
async function replyTarget(live: LiveConnection, fil: string) {
  const conversation = refOf(fil, 'outlook', 'thread');
  if (!conversation) return NO_THREAD;
  const { last, complete } = await lastMessage(live, conversation);
  if (!complete) return TOO_LONG;
  if (!last) throw new ElsewhereError(NO_THREAD);
  return { conversation, last };
}

// verify d'une réponse : le fil n'a pas de message de plus depuis la proposition. Sinon la réponse ne répond plus
// au dernier message, et ses destinataires ont pu changer.
async function sameLastMessage(live: LiveConnection, p: Record<string, string>) {
  const { last, complete } = await lastMessage(live, p.thread as string);
  if (!complete || last?.id !== p.message) throw new ActionFailure('conflit');
}

// Les destinataires que createReply (ou createReplyAll) va poser : le « répondre à », sinon l'expéditeur ; pour
// « à tous », les destinataires et copies du message, sans la personne. Lus dans l'outil, jamais tirés du modèle.
function replyRecipients(m: z.infer<typeof Message>, all: boolean, me: string) {
  const to = (m.replyTo?.length ? m.replyTo : m.from ? [m.from] : []).map(addressOf);
  const others = all ? [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])].map(addressOf) : [];
  const unique = (list: string[]) => [...new Set(list.filter((a) => EMAIL.test(a) && a !== me))];
  const toList = unique(to);
  return { to: toList, cc: unique(others).filter((a) => !toList.includes(a)) };
}

async function myAddress(live: LiveConnection) {
  const me = await graph(live).get('/me', { $select: 'mail,userPrincipalName' }, Me);
  return (me.mail || me.userPrincipalName || '').toLowerCase();
}

// Un brouillon de réponse au dernier message, avec notre texte au-dessus de la citation. Si l'écriture du corps
// échoue, le brouillon vide est retiré (au mieux), puis l'erreur remonte. Un refus pour débit sur le PATCH n'est
// plus « rien n'a été écrit » : le brouillon a existé, et le DELETE a pu être refusé aussi (partialWrite).
async function replyDraft(live: LiveConnection, messageId: string, body: string, all: boolean) {
  const api = graph(live);
  const draft = await live.http.json(
    api.write('POST', `/me/messages/${encodeURIComponent(messageId)}/${all ? 'createReplyAll' : 'createReply'}`, {}),
    Draft,
  );
  try {
    await live.http.json(
      api.write('PATCH', `/me/messages/${encodeURIComponent(draft.id)}`, {
        body: { contentType: 'HTML', content: `${textToHtml(body)}${draft.body?.content ?? ''}` },
      }),
      Draft,
    );
  } catch (error) {
    await live.http.text(api.write('DELETE', `/me/messages/${encodeURIComponent(draft.id)}`)).catch(() => {});
    throw partialWrite(error);
  }
  return draft;
}

const RULES = {
  thread: pattern(GRAPH_ID),
  message: pattern(GRAPH_ID),
  messages: (value: string) => value.split(',').length <= 25 && value.split(',').every((id) => GRAPH_ID.test(id)),
  subject: (value: string) => value === '' || title(300)(value),
  sender: (value: string) => value === '' || EMAIL.test(value),
  to: emails(20),
  cc: emails(20),
  attendees: emails(50),
  body: text(1, 8_200),
  all: yesNo,
  archive: yesNo,
  online: yesNo,
  interne: yesNo,
  category: title(50),
  title: title(255),
  start: isoInstant,
  end: isoInstant,
  timezone: timeZone,
} satisfies Record<string, (value: string) => boolean>;

const filField = () =>
  z.string().max(500).describe('Le fil Outlook : l’objet du déclencheur (outlook:thread:…) ou son identifiant.');
const NOT_IN_INBOX = 'Aucun message de ce fil n’est dans la boîte de réception : rien à classer.';

const creerBrouillon = actionSpec({
  verb: 'creer_brouillon',
  tool: 'creer_brouillon_outlook',
  description:
    'Propose de préparer, dans la boîte Outlook de l’utilisateur, un brouillon de réponse au dernier message d’un fil. Rien n’est envoyé : l’utilisateur relit et envoie lui-même.',
  right: '« Mail.ReadWrite »',
  risk: 'bas',
  reversibility: 'annulable',
  rules: RULES,
  // Pas de mention : un brouillon que la personne enverra elle-même (architecture, 9.6, point 6).
  textKeys: ['texte'],
  input: z.object({
    fil: filField(),
    texte: z.string().min(1).max(8_000).describe('Le texte de la réponse.'),
    tous: z.boolean().nullish().describe('Vrai pour répondre à tous.'),
  }),
  async prepare(live, { fil, texte, tous }) {
    const target = await replyTarget(live, fil);
    if (typeof target === 'string') return target;
    const { conversation, last } = target;
    return {
      thread: conversation,
      message: last.id,
      subject: safeLine(last.subject ?? '', 300),
      sender: addressOf(last.from),
      body: texte,
      all: yes(tous),
    };
  },
  // Un brouillon qui répondrait à un message dépassé citerait le mauvais : on le dit plutôt (conflit).
  verify: sameLastMessage,
  audience: () => 'soi',
  summary: (p) => `préparer un brouillon de réponse${p.all === 'oui' ? ' à tous' : ''} à « ${p.subject} » dans Outlook`,
  async execute(live, p) {
    // POST /me/messages/{id}/createReply (ou createReplyAll), puis PATCH /me/messages/{brouillon} : rien n'est envoyé.
    const draft = await replyDraft(live, p.message as string, p.body as string, p.all === 'oui');
    return { url: draft.webLink ?? null, undo: { draft: draft.id } };
  },
  // Aucune marque dans un brouillon que la personne enverra : pas de findExisting, une réponse perdue est « incertain ».
  async undo(live, _p, undo) {
    const id = undo.draft;
    if (!id || !GRAPH_ID.test(id)) throw new ActionFailure('echec');
    const api = graph(live);
    let draft: z.infer<typeof Message>;
    try {
      draft = await api.get(`/me/messages/${encodeURIComponent(id)}`, { $select: 'id,isDraft' }, Message);
    } catch (error) {
      // Supprimé, ou envoyé sans identifiant stable : on ne sait pas lequel. La carte le dit.
      if (error instanceof ConnectorHttpError && error.status === 404) throw new ActionFailure('introuvable');
      throw error;
    }
    // Envoyé par la personne entre-temps : on ne supprime pas un message parti.
    if (draft.isDraft === false) throw new ActionFailure('conflit');
    await live.http.text(api.write('DELETE', `/me/messages/${encodeURIComponent(id)}`));
  },
});

const classer = actionSpec({
  verb: 'classer',
  tool: 'classer_outlook',
  description:
    'Propose de classer un fil Outlook : ajouter une catégorie à ses messages de la boîte de réception, et/ou les archiver.',
  right: '« Mail.ReadWrite »',
  risk: 'bas',
  reversibility: 'compensable',
  rules: RULES,
  input: z
    .object({
      fil: filField(),
      categorie: z.string().min(1).max(50).nullish().describe('Une catégorie Outlook, par son nom.'),
      archiver: z.boolean().nullish().describe('Vrai pour déplacer le fil dans « Archive ».'),
    })
    .refine((input) => input.categorie || input.archiver, 'Donne categorie ou archiver.'),
  async prepare(live, { fil, categorie, archiver }) {
    const conversation = refOf(fil, 'outlook', 'thread');
    if (!conversation) return NO_THREAD;
    // 25 messages de la boîte de réception au plus : un fil plus long n'est classé qu'en partie (le résumé le tait).
    const { value } = await graph(live).get(
      '/me/mailFolders/inbox/messages',
      { $filter: `conversationId eq '${conversation.replaceAll("'", "''")}'`, $select: 'id,subject', $top: 25 },
      Messages,
    );
    if (value.length === 0) throw new ElsewhereError(NOT_IN_INBOX);
    return {
      thread: conversation,
      subject: safeLine(value[0]?.subject ?? '', 300),
      messages: value.map((m) => m.id).join(','),
      archive: yes(archiver),
      ...(categorie ? { category: categorie } : {}),
    };
  },
  audience: () => 'soi',
  summary: (p) =>
    `classer le fil « ${p.subject} » dans Outlook${p.category ? ` (catégorie « ${p.category} »)` : ''}${p.archive === 'oui' ? ', archivé' : ''}`,
  async execute(live, p) {
    const api = graph(live);
    // `added` : Leon a posé la catégorie sur ce message (elle n'y était pas). L'annulation ne retire que celle-là.
    const moved: Array<{ id: string; added: boolean }> = [];
    let wrote = false;
    try {
      for (const id of (p.messages as string).split(',')) {
        // L'état d'avant, lu juste avant d'écrire : PATCH categories remplace toute la liste (note 06).
        const now = await api.get(`/me/messages/${encodeURIComponent(id)}`, { $select: 'id,categories' }, Message);
        const before = now.categories ?? [];
        const added = Boolean(p.category) && !before.includes(p.category as string);
        if (added) {
          await live.http.json(
            api.write('PATCH', `/me/messages/${encodeURIComponent(id)}`, { categories: [...before, p.category] }),
            Message,
          );
          wrote = true;
        }
        let finalId = id;
        if (p.archive === 'oui') {
          const after = await live.http.json(
            api.write('POST', `/me/messages/${encodeURIComponent(id)}/move`, { destinationId: 'archive' }),
            Message,
          );
          wrote = true;
          finalId = after.id;
        }
        moved.push({ id: finalId, added });
      }
    } catch (error) {
      // Des messages sont peut-être déjà classés : un refus pour débit ici n'est plus « rien n'a été écrit ».
      throw wrote ? partialWrite(error) : error;
    }
    return { url: null, undo: { items: JSON.stringify(moved), archived: p.archive as string } };
  },
  async undo(live, p, undo) {
    const items = z
      .array(z.object({ id: z.string().regex(GRAPH_ID), added: z.boolean() }))
      .max(25)
      .parse(JSON.parse(undo.items ?? '[]'));
    const api = graph(live);
    for (const item of items) {
      if (item.added && p.category) {
        // Retirer la seule catégorie que Leon a posée : celles que la personne a ajoutées depuis restent.
        const now = await api.get(`/me/messages/${encodeURIComponent(item.id)}`, { $select: 'id,categories' }, Message);
        const kept = (now.categories ?? []).filter((c) => c !== p.category);
        if (kept.length !== (now.categories ?? []).length) {
          await live.http.json(
            api.write('PATCH', `/me/messages/${encodeURIComponent(item.id)}`, { categories: kept }),
            Message,
          );
        }
      }
      if (undo.archived === 'oui') {
        await live.http.json(
          api.write('POST', `/me/messages/${encodeURIComponent(item.id)}/move`, { destinationId: 'inbox' }),
          Message,
        );
      }
    }
  },
});

const envoyer = actionSpec({
  verb: 'envoyer',
  tool: 'envoyer_outlook',
  description:
    'Propose d’envoyer, depuis la boîte Outlook de l’utilisateur, une réponse au dernier message d’un fil. L’envoi ne se rappelle pas.',
  right: '« Mail.Send »',
  risk: 'haut',
  reversibility: 'irreversible',
  rules: RULES,
  // La mention sans marque : aucun findExisting ne la cherche, et le client la lit.
  mentionKey: 'body',
  textKeys: ['texte'],
  input: z.object({
    fil: filField(),
    texte: z.string().min(1).max(8_000).describe('Le texte de la réponse.'),
    tous: z.boolean().nullish().describe('Vrai pour répondre à tous.'),
  }),
  async prepare(live, { fil, texte, tous }) {
    const target = await replyTarget(live, fil);
    if (typeof target === 'string') return target;
    const { conversation, last } = target;
    const { to, cc } = replyRecipients(last, tous === true, await myAddress(live));
    if (to.length === 0) return 'Le message n’a pas d’expéditeur lisible : rien n’est proposé.';
    return {
      thread: conversation,
      message: last.id,
      subject: safeLine(last.subject ?? '', 300),
      to: to.join(','),
      ...(cc.length ? { cc: cc.join(',') } : {}),
      body: texte,
      all: yes(tous),
    };
  },
  recipients: (p) => [...(p.to ?? '').split(','), ...(p.cc ? p.cc.split(',') : [])].filter(Boolean),
  // `interne` est posé par propose.ts d'après les domaines de l'organisation ; sans lui, externe.
  audience: (p) => (p.interne === 'oui' ? 'interne' : 'externe'),
  summary: (p) => `envoyer une réponse à « ${p.subject} » à ${p.to}${p.cc ? ` (copie : ${p.cc})` : ''}`,
  // Une réponse validée il y a six jours ne part pas si le client a écrit depuis.
  verify: sameLastMessage,
  async execute(live, p) {
    const api = graph(live);
    const draft = await replyDraft(live, p.message as string, p.body as string, p.all === 'oui');
    try {
      // Les destinataires posés par Graph sont-ils ceux que la personne a validés ? Sinon on n'envoie pas.
      const same = (list: z.infer<typeof Address>[] | null | undefined, wanted: string | undefined) =>
        [...(list ?? []).map(addressOf)].sort().join(',') === (wanted ?? '').split(',').filter(Boolean).sort().join(',');
      const check = await api.get(`/me/messages/${encodeURIComponent(draft.id)}`, { $select: 'id,toRecipients,ccRecipients' }, Draft);
      if (!same(check.toRecipients, p.to) || !same(check.ccRecipients, p.cc)) {
        await live.http.text(api.write('DELETE', `/me/messages/${encodeURIComponent(draft.id)}`)).catch(() => {});
        throw new ActionFailure('conflit');
      }
      // POST /me/messages/{brouillon}/send : 202, sans corps (à vérifier). Demande Mail.Send.
      await live.http.text(api.write('POST', `/me/messages/${encodeURIComponent(draft.id)}/send`));
    } catch (error) {
      // Le brouillon est écrit : un envoi refusé pour débit laisse un brouillon, donc « incertain ».
      throw partialWrite(error);
    }
    // Le message envoyé revient par la relève des éléments envoyés ; son identifiant n'est pas rendu.
    return { url: null };
  },
});

// Un créneau ou un événement : début et fin dans le fuseau donné, 12 heures au plus, dans l'année qui vient.
function slotProblem(start: string, end: string, zone: string): string | null {
  if (!isoInstant(start) || !isoInstant(end) || !timeZone(zone)) return 'Dates ou fuseau invalides.';
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (to <= from) return 'La fin doit suivre le début.';
  if (to - from > 12 * 3_600_000) return 'Un créneau de plus de 12 heures n’est pas proposé.';
  if (from < Date.now() - 3_600_000 || from > Date.now() + 366 * 86_400_000) {
    return 'Le créneau doit être dans l’année qui vient.';
  }
  return null;
}
// Graph veut une heure locale sans décalage, et le fuseau à part (note 06, section 4).
const localTime = (iso: string) => iso.replace(/(?:Z|[+-]\d{2}:\d{2})$/, '').slice(0, 19);

const eventInput = {
  titre: z.string().min(1).max(255).describe('Le titre.'),
  debut: z.string().max(40).describe('Le début, AAAA-MM-JJTHH:MM, heure locale du fuseau.'),
  fin: z.string().max(40).describe('La fin, même forme.'),
  fuseau: z.string().max(64).nullish().describe('Le fuseau IANA ; sans lui, Europe/Paris.'),
};

// Après une réponse perdue : Graph garde notre transactionId sur l'événement (note 06, section 4, [OFF]) ; la
// recherche par ce champ est à vérifier. Une lecture directe : ne rien trouver vaut absence.
async function eventByTransaction(live: LiveConnection, key: string) {
  const { value } = await graph(live).get(
    '/me/events',
    { $filter: `transactionId eq '${key}'`, $select: 'id,webLink', $top: 1 },
    z.object({ value: z.array(Event) }),
  );
  const event = value[0];
  return event ? { url: event.webLink ?? null, ref: { item: `event:${event.id}` }, undo: { event: event.id } } : null;
}

const bloquerCreneau = actionSpec({
  verb: 'bloquer_creneau',
  tool: 'bloquer_creneau_outlook',
  description:
    'Propose de bloquer un créneau dans l’agenda Outlook de l’utilisateur : un événement sans invité, marqué occupé. Personne n’est prévenu.',
  right: '« Calendars.ReadWrite »',
  risk: 'bas',
  reversibility: 'annulable',
  rules: RULES,
  input: z.object(eventInput),
  async prepare(_live, { titre, debut, fin, fuseau }) {
    const zone = fuseau ?? 'Europe/Paris';
    const problem = slotProblem(debut, fin, zone);
    if (problem) return problem;
    return { title: titre, start: localTime(debut), end: localTime(fin), timezone: zone };
  },
  audience: () => 'soi',
  summary: (p) => `bloquer « ${p.title} » dans l’agenda Outlook, du ${p.start} au ${p.end} (${p.timezone})`,
  async execute(live, p, key) {
    // POST /me/events, sans attendees : aucune invitation ne part.
    const event = await live.http.json(
      graph(live).write('POST', '/me/events', {
        subject: p.title,
        start: { dateTime: p.start, timeZone: p.timezone },
        end: { dateTime: p.end, timeZone: p.timezone },
        showAs: 'busy',
        isReminderOn: false,
        transactionId: key,
      }),
      Event,
    );
    return { url: event.webLink ?? null, ref: { item: `event:${event.id}` }, undo: { event: event.id } };
  },
  findExisting: (live, _p, key) => eventByTransaction(live, key),
  async undo(live, _p, undo) {
    if (!undo.event || !GRAPH_ID.test(undo.event)) throw new ActionFailure('echec');
    try {
      await live.http.text(graph(live).write('DELETE', `/me/events/${encodeURIComponent(undo.event)}`));
    } catch (error) {
      // Un créneau sans invité, déjà supprimé par la personne : le but est atteint.
      if (error instanceof ConnectorHttpError && error.status === 404) return;
      throw error;
    }
  },
});

const creerEvenement = actionSpec({
  verb: 'creer_evenement',
  tool: 'creer_evenement_outlook',
  description:
    'Propose de créer un événement dans l’agenda Outlook de l’utilisateur avec des invités. Les invitations partent à la création et ne se rappellent pas.',
  right: '« Calendars.ReadWrite »',
  risk: 'haut',
  reversibility: 'irreversible',
  rules: RULES,
  // La mention sans marque : findExisting cherche le transactionId, et les invités lisent la description.
  mentionKey: 'body',
  textKeys: ['texte'],
  input: z.object({
    ...eventInput,
    invites: z.array(z.string().max(254)).min(1).max(50).describe('Les adresses des invités.'),
    texte: z.string().max(4_000).nullish().describe('La description de l’événement.'),
    visio: z.boolean().nullish().describe('Vrai pour ajouter une réunion Teams.'),
  }),
  async prepare(live, { titre, debut, fin, fuseau, invites, texte, visio }) {
    const zone = fuseau ?? 'Europe/Paris';
    const problem = slotProblem(debut, fin, zone);
    if (problem) return problem;
    const me = await myAddress(live);
    const attendees = [...new Set(invites.map((a) => a.trim().toLowerCase()))].filter((a) => a !== me);
    if (attendees.length === 0 || !attendees.every((a) => EMAIL.test(a))) return 'Invités invalides.';
    return {
      title: titre,
      start: localTime(debut),
      end: localTime(fin),
      timezone: zone,
      attendees: attendees.join(','),
      online: yes(visio),
      ...(texte ? { body: texte } : {}),
    };
  },
  recipients: (p) => (p.attendees ?? '').split(',').filter(Boolean),
  audience: (p) => (p.interne === 'oui' ? 'interne' : 'externe'),
  summary: (p) => `créer « ${p.title} » le ${p.start} (${p.timezone}) et inviter ${p.attendees}`,
  async execute(live, p, key) {
    const event = await live.http.json(
      graph(live).write('POST', '/me/events', {
        subject: p.title,
        start: { dateTime: p.start, timeZone: p.timezone },
        end: { dateTime: p.end, timeZone: p.timezone },
        attendees: (p.attendees as string)
          .split(',')
          .map((address) => ({ emailAddress: { address }, type: 'required' })),
        ...(p.body ? { body: { contentType: 'HTML', content: textToHtml(p.body) } } : {}),
        ...(p.online === 'oui' ? { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' } : {}),
        transactionId: key,
      }),
      Event,
    );
    return { url: event.webLink ?? null, ref: { item: `event:${event.id}` } };
  },
  findExisting: (live, _p, key) => eventByTransaction(live, key),
});

// Les droits accordés, lus dans le scope gardé (section 3.2). Graph peut rendre des noms longs
// (https://graph.microsoft.com/Mail.Send) : on compare la fin.
const SCOPE_OF: Record<string, string> = {
  creer_brouillon: 'Mail.ReadWrite',
  classer: 'Mail.ReadWrite',
  envoyer: 'Mail.Send',
  bloquer_creneau: 'Calendars.ReadWrite',
  creer_evenement: 'Calendars.ReadWrite',
};

export const outlookWrite: ConnectorWrite = {
  specs: {
    creer_brouillon: creerBrouillon,
    classer,
    envoyer,
    bloquer_creneau: bloquerCreneau,
    creer_evenement: creerEvenement,
  },
  minIntervalMs: 2_000,
  granted(config, verb) {
    const wanted = SCOPE_OF[verb];
    if (!wanted) return 'non';
    if (typeof config.scope !== 'string') {
      // Une connexion d'avant : on sait ce qu'on a demandé (oauth.ts:45), jamais Mail.Send.
      return wanted === 'Mail.Send' ? 'non' : 'inconnu';
    }
    const granted = config.scope.split(/\s+/).map((s) => s.slice(s.lastIndexOf('/') + 1).toLowerCase());
    return granted.includes(wanted.toLowerCase()) ? 'oui' : 'non';
  },
};
```

Changements de `outlook/connector.ts` (existe) : `write: outlookWrite`, et `scope: z.string().max(4000).nullable().optional()` dans `ConfigSchema` (`:43-48`). Rien dans `outlook/oauth.ts` : `Mail.Send` n'est pas demandé (question Q2).

### 12.3 Gmail (`src/server/connectors/gmail/actions.ts`, à créer, après le jalon 1)

Ce que l'on sait (note 06, section 1 ; carte 02, 8.19) : Gmail passe par Pipedream Connect (`pipedream: { app: 'gmail' }`), dont l'appli est validée pour `gmail.modify`, qui permet brouillons, libellés et envoi ; chaque requête coûte un crédit Pipedream ; le client ne met aucun en-tête d'autorisation, le proxy l'ajoute (`gmail/client.ts`, existe) ; `POST /drafts` prend `message.raw` (RFC 2822 en base64url) et `message.threadId` ([OFF]) ; une réponse dans un fil exige `threadId`, `In-Reply-To` et `References` dans le MIME, et un sujet « Re: … » ([OFF]) ; `POST /threads/{id}/modify` pose et retire des libellés ([OFF]) ; aucune clé d'idempotence. Le fil : `thread:<threadId>`, tours `message:<id>` (`gmail/map.ts:101-110`, existe).

Aucune portée ne sépare brouillon et envoi chez Google (note 06) : c'est `granted` qui ne sait rien (`'inconnu'`), et `needsClick` qui garde l'envoi (public `externe` ou enjeu `haut`).

Ce que coûtent ces écritures en crédits Pipedream (un par requête, lecture comprise : carte 01 ; architecture 9.4). L'architecture dit que les agents ne lisent pas en direct sur une connexion Pipedream ; une écriture dans un fil ne peut pas s'en passer (il faut le dernier message, ses en-têtes, ses destinataires) : écart 14, section 18. Le compte, par action : `creer_brouillon` et `envoyer`, 3 crédits (`prepare` lit le fil une fois, `verify` le relit, `execute` écrit) ; `classer`, 3 ou 4 (le fil, les libellés si un libellé est demandé, puis lecture et écriture) ; une annulation, 1 ou 2 ; `findExisting`, 1. Le nombre de `prepare` par exécution est borné par la fiche : 5 propositions au plus pour un `decider` (`maxActions`), 20 éléments pour un `each` (architecture, 8.5). Le prix du crédit reste la question Q12 (carte 01).

```ts
// src/server/connectors/gmail/actions.ts
import { z } from 'zod';
import {
  EMAIL,
  emails,
  pattern,
  refOf,
  safeLine,
  text,
  textToHtml,
  title,
  yes,
  yesNo,
} from '@/server/actions/params';
import { ActionFailure, actionSpec, type LiveConnection } from '@/server/actions/spec';
import { ConnectorHttpError, type HttpRequest } from '../http';
import type { ConnectorWrite } from '../types';

// Les écritures de Leon dans la boîte Gmail de la personne, par le proxy de Pipedream (un crédit par requête :
// une lecture du fil par prepare, une par verify, une écriture).
// Sources (aucune page ouverte, 20/11/2026) : note 06, section 1 ; carte 02, 8.19 ; gmail/client.ts, gmail/map.ts.
// Non vérifié : que Gmail garde notre en-tête Message-ID sur un brouillon et sur un envoi (findExisting en dépend,
// et ne conclut jamais à l'absence) ; la recherche `rfc822msgid:` sur /drafts et /messages ; le coût en quota de
// drafts.list et threads.get ; que le proxy de Pipedream laisse passer DELETE et une réponse 204.

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_ID = /^[A-Za-z0-9_-]{1,100}$/;
const MESSAGE_ID = /^<[^<>\s]{1,250}>$/;
// Des identifiants de message séparés par une seule espace, 20 au plus : jamais un saut de ligne, qui couperait le
// bloc d'en-têtes du message écrit par rawMessage.
const REFERENCES = /^<[^<>\s]{1,250}>(?: <[^<>\s]{1,250}>){0,19}$/;

function gmail(live: LiveConnection) {
  return {
    get: <T>(path: string, query: HttpRequest['query'], schema: z.ZodType<T>) =>
      live.http.json({ url: `${API}${path}`, query }, schema),
    write: (method: 'POST' | 'DELETE', path: string, body?: unknown) =>
      ({ url: `${API}${path}`, method, body, once: true }) satisfies HttpRequest,
  };
}

const Header = z.object({ name: z.string(), value: z.string() });
const ThreadMessage = z.object({
  id: z.string().regex(GMAIL_ID),
  labelIds: z.array(z.string()).nullish(),
  payload: z.object({ headers: z.array(Header).nullish() }).nullish(),
});
const Thread = z.object({ id: z.string().regex(GMAIL_ID), messages: z.array(ThreadMessage).nullish() });
const DraftReply = z.object({ id: z.string().regex(GMAIL_ID), message: z.object({ id: z.string(), threadId: z.string() }) });
const Drafts = z.object({ drafts: z.array(DraftReply).nullish() });
const Sent = z.object({ id: z.string().regex(GMAIL_ID), threadId: z.string().regex(GMAIL_ID) });
const Labels = z.object({ labels: z.array(z.object({ id: z.string(), name: z.string() })).nullish() });

const headerOf = (m: z.infer<typeof ThreadMessage>, name: string) =>
  m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value?.trim() ?? '';
// « Nom <adresse> » ou « adresse », séparées par des virgules : les adresses seules, en minuscules.
const addressesOf = (value: string) =>
  [...value.matchAll(/[^\s<>,"]+@[^\s<>,"]+/g)].map((m) => m[0].toLowerCase()).filter((a) => EMAIL.test(a));
const threadUrl = (thread: string) => `https://mail.google.com/mail/#all/${thread}`;
const NO_THREAD = 'Fil Gmail introuvable dans cette boîte : rien n’est proposé.';

const notDraft = (m: z.infer<typeof ThreadMessage>) => !m.labelIds?.includes('DRAFT');

// Ce qu'il faut pour répondre dans le fil : le dernier message hors brouillon, ses en-têtes, les destinataires. Une
// seule lecture (un crédit) : pas de GET /profile, l'adresse de la personne se lit dans le fil (l'expéditeur d'un
// message SENT, sinon le Delivered-To du dernier message reçu).
async function replyContext(live: LiveConnection, fil: string, all: boolean) {
  const thread = refOf(fil, 'gmail', 'thread');
  if (!thread || !GMAIL_ID.test(thread)) return null;
  const found = await gmail(live).get(
    `/threads/${thread}`,
    {
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'References', 'Subject', 'From', 'Reply-To', 'To', 'Cc', 'Delivered-To'],
    },
    Thread,
  );
  const messages = (found.messages ?? []).filter(notDraft);
  const last = messages.at(-1);
  if (!last) return null;
  const sent = messages.find((m) => m.labelIds?.includes('SENT'));
  const me = (sent ? addressesOf(headerOf(sent, 'From')) : addressesOf(headerOf(last, 'Delivered-To')))[0] ?? '';
  const to = addressesOf(headerOf(last, 'Reply-To') || headerOf(last, 'From')).filter((a) => a !== me);
  const others = all ? addressesOf(`${headerOf(last, 'To')},${headerOf(last, 'Cc')}`) : [];
  const cc = [...new Set(others)].filter((a) => a !== me && !to.includes(a));
  const replyId = headerOf(last, 'Message-ID');
  // Un en-tête References replié tient sur plusieurs lignes : les seuls identifiants, les 20 derniers, une espace.
  const references = [...headerOf(last, 'References').matchAll(/<[^<>\s]{1,250}>/g)]
    .map((m) => m[0])
    .slice(-20)
    .join(' ');
  const subject = safeLine(headerOf(last, 'Subject'), 300);
  return {
    thread,
    message: last.id,
    subject: /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`.slice(0, 300),
    to: [...new Set(to)],
    cc,
    replyId: MESSAGE_ID.test(replyId) ? replyId : null,
    references: REFERENCES.test(references) ? references : null,
  };
}

// verify d'une réponse : le fil n'a pas de message de plus depuis la proposition (un crédit).
async function sameLastMessage(live: LiveConnection, p: Record<string, string>) {
  const found = await gmail(live).get(`/threads/${p.thread}`, { format: 'minimal' }, Thread);
  if ((found.messages ?? []).filter(notDraft).at(-1)?.id !== p.message) throw new ActionFailure('conflit');
}

// Un en-tête en ASCII, ou encodé (RFC 2047) s'il porte un accent.
const encodeHeader = (value: string) =>
  /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
// Notre identifiant de message : findExisting le cherche après une réponse perdue.
const ourMessageId = (key: string) => `<${key.slice(0, 40)}@leon.invalid>`;

// Le message RFC 2822, en base64url. Chaque valeur d'en-tête a passé sa règle (une ligne, une adresse, des
// identifiants séparés par une espace : REFERENCES) : aucune ne peut ajouter un en-tête ni couper le bloc.
function rawMessage(p: Record<string, string>, key: string): string {
  const lines = [
    `To: ${p.to.split(',').join(', ')}`,
    ...(p.cc ? [`Cc: ${p.cc.split(',').join(', ')}`] : []),
    `Subject: ${encodeHeader(p.subject)}`,
    `In-Reply-To: ${p.reply_id}`,
    `References: ${[p.references, p.reply_id].filter(Boolean).join(' ')}`,
    `Message-ID: ${ourMessageId(key)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(textToHtml(p.body), 'utf8').toString('base64'),
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

const RULES = {
  thread: pattern(GMAIL_ID),
  message: pattern(GMAIL_ID),
  subject: title(300),
  to: emails(20),
  cc: emails(20),
  body: text(1, 8_200),
  all: yesNo,
  reply_id: pattern(MESSAGE_ID),
  references: pattern(REFERENCES),
  interne: yesNo,
  archive: yesNo,
  label: pattern(/^[A-Za-z0-9_-]{1,100}$/),
  label_name: title(100),
} satisfies Record<string, (value: string) => boolean>;

const replyInput = {
  fil: z.string().max(200).describe('Le fil Gmail : l’objet du déclencheur (gmail:thread:…) ou son identifiant.'),
  texte: z.string().min(1).max(8_000).describe('Le texte de la réponse.'),
  tous: z.boolean().nullish().describe('Vrai pour répondre à tous.'),
};

async function prepareReply(live: LiveConnection, fil: string, texte: string, tous: boolean | null | undefined) {
  const context = await replyContext(live, fil, tous === true);
  if (!context) return NO_THREAD;
  if (context.to.length === 0 || !context.replyId) {
    return 'Le dernier message du fil n’a pas d’expéditeur ou d’identifiant lisible : rien n’est proposé.';
  }
  return {
    thread: context.thread,
    message: context.message,
    subject: context.subject,
    to: context.to.join(','),
    ...(context.cc.length ? { cc: context.cc.join(',') } : {}),
    body: texte,
    all: yes(tous),
    reply_id: context.replyId,
    ...(context.references ? { references: context.references } : {}),
  };
}

const creerBrouillon = actionSpec({
  verb: 'creer_brouillon',
  tool: 'creer_brouillon_gmail',
  description:
    'Propose de préparer, dans la boîte Gmail de l’utilisateur, un brouillon de réponse au dernier message d’un fil. Rien n’est envoyé.',
  right: '« gmail.modify » (appli Pipedream)',
  risk: 'bas',
  reversibility: 'annulable',
  rules: RULES,
  textKeys: ['texte'],
  input: z.object(replyInput),
  prepare: (live, { fil, texte, tous }) => prepareReply(live, fil, texte, tous),
  verify: sameLastMessage,
  audience: () => 'soi',
  summary: (p) => `préparer un brouillon de réponse à « ${p.subject} » dans Gmail`,
  async execute(live, p, key) {
    // POST /gmail/v1/users/me/drafts { message: { raw, threadId } }
    const draft = await live.http.json(
      gmail(live).write('POST', '/drafts', { message: { raw: rawMessage(p, key), threadId: p.thread } }),
      DraftReply,
    );
    return { url: threadUrl(p.thread as string), undo: { draft: draft.id } };
  },
  async findExisting(live, p, key) {
    const { drafts } = await gmail(live).get('/drafts', { q: `rfc822msgid:${ourMessageId(key)}` }, Drafts);
    const draft = drafts?.[0];
    if (!draft) throw new ActionFailure('incertain');
    return { url: threadUrl(p.thread as string), undo: { draft: draft.id } };
  },
  async undo(live, _p, undo) {
    if (!undo.draft || !GMAIL_ID.test(undo.draft)) throw new ActionFailure('echec');
    try {
      // Un brouillon envoyé ou supprimé n'existe plus comme brouillon : on ne sait pas lequel.
      await gmail(live).get(`/drafts/${undo.draft}`, { format: 'minimal' }, DraftReply);
    } catch (error) {
      if (error instanceof ConnectorHttpError && error.status === 404) throw new ActionFailure('introuvable');
      throw error;
    }
    await live.http.text(gmail(live).write('DELETE', `/drafts/${undo.draft}`));
  },
});

const classer = actionSpec({
  verb: 'classer',
  tool: 'classer_gmail',
  description: 'Propose de classer un fil Gmail : poser un libellé existant, et/ou l’archiver (le sortir de la boîte de réception).',
  right: '« gmail.modify » (appli Pipedream)',
  risk: 'bas',
  reversibility: 'compensable',
  rules: RULES,
  input: z
    .object({
      fil: replyInput.fil,
      libelle: z.string().min(1).max(100).nullish().describe('Le nom d’un libellé qui existe déjà.'),
      archiver: z.boolean().nullish(),
    })
    .refine((input) => input.libelle || input.archiver, 'Donne libelle ou archiver.'),
  async prepare(live, { fil, libelle, archiver }) {
    const thread = refOf(fil, 'gmail', 'thread');
    if (!thread || !GMAIL_ID.test(thread)) return NO_THREAD;
    const api = gmail(live);
    const found = await api.get(`/threads/${thread}`, { format: 'metadata', metadataHeaders: ['Subject'] }, Thread);
    const first = found.messages?.[0];
    if (!first) return NO_THREAD;
    let label: { id: string; name: string } | undefined;
    if (libelle) {
      const { labels } = await api.get('/labels', {}, Labels);
      label = labels?.find((l) => l.name.toLowerCase() === libelle.trim().toLowerCase());
      if (!label) return 'Ce libellé n’existe pas dans Gmail : Leon n’en crée pas.';
    }
    return {
      thread,
      subject: safeLine(headerOf(first, 'Subject'), 300) || 'Sans objet',
      archive: yes(archiver),
      ...(label ? { label: label.id, label_name: safeLine(label.name, 100) } : {}),
    };
  },
  audience: () => 'soi',
  summary: (p) =>
    `classer le fil « ${p.subject} » dans Gmail${p.label_name ? ` (libellé « ${p.label_name} »)` : ''}${p.archive === 'oui' ? ', archivé' : ''}`,
  async execute(live, p) {
    const api = gmail(live);
    // L'état d'avant, lu juste avant d'écrire : ce qu'on ajoute et ce qu'on retire vraiment.
    const now = await api.get(`/threads/${p.thread}`, { format: 'minimal' }, Thread);
    const labels = new Set((now.messages ?? []).flatMap((m) => m.labelIds ?? []));
    const add = p.label && !labels.has(p.label) ? [p.label] : [];
    const remove = p.archive === 'oui' && labels.has('INBOX') ? ['INBOX'] : [];
    if (add.length || remove.length) {
      // POST /gmail/v1/users/me/threads/{id}/modify { addLabelIds, removeLabelIds }
      await live.http.json(
        api.write('POST', `/threads/${p.thread}/modify`, { addLabelIds: add, removeLabelIds: remove }),
        Thread,
      );
    }
    return { url: threadUrl(p.thread as string), undo: { thread: p.thread as string, added: add.join(','), removed: remove.join(',') } };
  },
  async undo(live, _p, undo) {
    if (!undo.thread || !GMAIL_ID.test(undo.thread)) throw new ActionFailure('echec');
    const back = (value: string | undefined) => (value ? value.split(',').filter((id) => /^[A-Za-z0-9_-]{1,100}$/.test(id)) : []);
    await live.http.json(
      gmail(live).write('POST', `/threads/${undo.thread}/modify`, {
        addLabelIds: back(undo.removed),
        removeLabelIds: back(undo.added),
      }),
      Thread,
    );
  },
});

const envoyer = actionSpec({
  verb: 'envoyer',
  tool: 'envoyer_gmail',
  description:
    'Propose d’envoyer, depuis la boîte Gmail de l’utilisateur, une réponse au dernier message d’un fil. L’envoi ne se rappelle pas.',
  right: '« gmail.modify » (appli Pipedream)',
  risk: 'haut',
  reversibility: 'irreversible',
  rules: RULES,
  // La mention sans marque : findExisting cherche notre Message-ID, et le client lit le texte.
  mentionKey: 'body',
  textKeys: ['texte'],
  input: z.object(replyInput),
  prepare: (live, { fil, texte, tous }) => prepareReply(live, fil, texte, tous),
  verify: sameLastMessage,
  recipients: (p) => [...(p.to ?? '').split(','), ...(p.cc ? p.cc.split(',') : [])].filter(Boolean),
  audience: (p) => (p.interne === 'oui' ? 'interne' : 'externe'),
  summary: (p) => `envoyer une réponse à « ${p.subject} » à ${p.to}${p.cc ? ` (copie : ${p.cc})` : ''}`,
  async execute(live, p, key) {
    // POST /gmail/v1/users/me/messages/send { raw, threadId }
    const sent = await live.http.json(
      gmail(live).write('POST', '/messages/send', { raw: rawMessage(p, key), threadId: p.thread }),
      Sent,
    );
    return { url: threadUrl(sent.threadId), ref: { item: `thread:${sent.threadId}`, turn: `message:${sent.id}` } };
  },
  // Gmail peut réécrire Message-ID à l'envoi (à vérifier) : on ne conclut jamais à l'absence. Un envoi ne se rejoue pas.
  async findExisting(live, p, key) {
    const { messages } = await gmail(live).get(
      '/messages',
      { q: `in:sent rfc822msgid:${ourMessageId(key)}` },
      z.object({ messages: z.array(Sent).nullish() }),
    );
    const sent = messages?.[0];
    if (!sent) throw new ActionFailure('incertain');
    return { url: threadUrl(sent.threadId), ref: { item: `thread:${sent.threadId}`, turn: `message:${sent.id}` } };
  },
});

export const gmailWrite: ConnectorWrite = {
  specs: { creer_brouillon: creerBrouillon, classer, envoyer },
  minIntervalMs: 1_000,
  // Les droits de l'appli Pipedream ne sont pas dans la configuration (pipedream.ts, findAccount les lit) : inconnu.
  granted: () => 'inconnu',
};
```

Changement de `gmail/connector.ts` (existe) : `write: gmailWrite`.

### 12.4 Linear (`src/server/connectors/linear/actions.ts`, à créer, après le jalon 1)

Ce que l'on sait (note 07, fiche Linear ; carte 03, 8.6) : GraphQL `POST https://api.linear.app/graphql` ; `issueCreate`, `issueUpdate`, `commentCreate`, `issueDelete` (corbeille de 30 jours, [O]), `commentDelete` ([V]) ; un `id` fourni par le client est accepté à la création ([V]) ; un jeton OAuth part en `Bearer`, une clé personnelle telle quelle (`authorizationOf`, `linear/client.ts:101-106`, existe) ; la limite se lit dans `extensions.code = RATELIMITED` (`:85-96`). Portées demandées (`linear/oauth.ts:19`, existe) : `read`, `write`. Le ticket : `issue:<uuid>`, tours `comment:<id>` (`linear/map.ts:40-47`).

Deux retouches de `linear/client.ts` : `graphql` (`:108-129`, privée) est exportée et gagne un dernier argument `options: { once?: true } = {}`, recopié dans la requête ; `failure` rend `ConnectorRateLimitError` (section 4).

Ce que `prepare` lit pour le public : les membres de l'équipe. Un invité (`guest`) est hors de la société : s'il y en a un, ou si la liste n'est pas lue en entier, l'écriture est `externe` (« dans le doute, externe », architecture 8.1). Le champ `guest` d'un utilisateur est à vérifier dans le schéma de Linear.

```ts
// src/server/connectors/linear/actions.ts
import { z } from 'zod';
import { oneOf, pattern, refOf, safeLine, text, title, uuidFrom, yesNo } from '@/server/actions/params';
import { ActionFailure, actionSpec, ElsewhereError, type LiveConnection } from '@/server/actions/spec';
import type { ConnectorWrite } from '../types';
import { authorizationOf, graphql } from './client';

// Les écritures de Leon dans Linear, au nom de la personne (actor=user, linear/oauth.ts).
// Sources (aucune page ouverte, 20/11/2026) : note 07, fiche Linear (L1 à L14) ; carte 03, 8.6 ; linear/client.ts.
// Non vérifié : `id` fourni par le client sur issueCreate et commentCreate ([V]) ; `issue(id:)` avec un identifiant
// lisible (LEO-12) ; `comment(id:)` ; le champ `guest` des membres ; commentDelete ([V]) ; ce que rend issueDelete
// sur un ticket déjà dans la corbeille ; le délai de la limite de débit (60 s par défaut ici).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[A-Z][A-Z0-9]{0,9}-\d{1,9}$/;

const auth = (live: LiveConnection) =>
  authorizationOf(live.config as { authMode: 'key' | 'oauth'; apiKey?: string; accessToken?: string });
const read = <T>(live: LiveConnection, query: string, variables: Record<string, unknown>, data: z.ZodType<T>) =>
  graphql(live.http, auth(live), query, variables, data);
const mutate = <T>(live: LiveConnection, query: string, variables: Record<string, unknown>, data: z.ZodType<T>) =>
  graphql(live.http, auth(live), query, variables, data, { once: true });

const TEAMS = 'query Teams { teams(first: 100) { nodes { id key name } } }';
const MEMBERS =
  'query Members($id: String!) { team(id: $id) { members(first: 100) { nodes { guest } pageInfo { hasNextPage } } } }';
const ISSUE = `query Issue($id: String!) { issue(id: $id) {
  id identifier title url priority team { id } state { id name } } }`;
const STATES = 'query States($id: String!) { team(id: $id) { states { nodes { id name } } } }';

const Team = z.object({ id: z.string().regex(UUID), key: z.string(), name: z.string() });
const Issue = z.object({
  id: z.string().regex(UUID),
  identifier: z.string(),
  title: z.string(),
  url: z.string().nullish(),
  priority: z.number().nullish(),
  team: z.object({ id: z.string().regex(UUID) }),
  state: z.object({ id: z.string(), name: z.string() }).nullish(),
});

// « oui » : l'équipe a un invité, ou plus de 100 membres (non lus) : l'écriture sort peut-être de la société.
async function guestsOf(live: LiveConnection, teamId: string): Promise<'oui' | 'non'> {
  const reply = await read(
    live,
    MEMBERS,
    { id: teamId },
    z.object({
      team: z.object({
        members: z.object({
          nodes: z.array(z.object({ guest: z.boolean().nullish() })),
          pageInfo: z.object({ hasNextPage: z.boolean() }),
        }),
      }),
    }),
  );
  const { nodes, pageInfo } = reply.team.members;
  return pageInfo.hasNextPage || nodes.some((m) => m.guest === true) ? 'oui' : 'non';
}

async function issueOf(live: LiveConnection, ticket: string) {
  const id = refOf(ticket, 'linear', 'issue');
  if (!id || !(UUID.test(id) || IDENTIFIER.test(id))) return null;
  const reply = await read(live, ISSUE, { id }, z.object({ issue: Issue.nullable() }));
  return reply.issue;
}

const NO_ISSUE = 'Ticket Linear introuvable pour cette connexion : rien n’est proposé.';
const NO_TEAM = 'Cette équipe n’existe pas dans ce Linear, ou la connexion ne la voit pas.';

// verify : le public n'a pas durci depuis la proposition (un invité est arrivé dans l'équipe, ou elle a passé
// 100 membres). Déjà externe : rien à relire.
async function sameAudience(live: LiveConnection, p: Record<string, string>) {
  if (p.guests !== 'non') return;
  const teamId = p.team_id ?? (await issueOf(live, p.issue_id as string))?.team.id;
  if (!teamId) throw new ActionFailure('introuvable');
  if ((await guestsOf(live, teamId)) === 'oui') throw new ActionFailure('conflit');
}
const ticketField = () =>
  z.string().max(200).describe('Le ticket : l’objet du déclencheur (linear:issue:…), son identifiant (LEO-12) ou son UUID.');

const RULES = {
  team_id: pattern(UUID),
  team_key: pattern(/^[A-Z][A-Z0-9]{0,9}$/),
  team_name: title(100),
  title: title(255),
  description: text(0, 8_200),
  priority: oneOf('0', '1', '2', '3', '4'),
  guests: yesNo,
  issue_id: pattern(UUID),
  identifier: pattern(IDENTIFIER),
  body: text(1, 8_200),
  state_id: pattern(UUID),
  state_name: title(100),
  before_state_id: pattern(UUID),
  before_state_name: title(100),
  before_priority: oneOf('0', '1', '2', '3', '4'),
} satisfies Record<string, (value: string) => boolean>;

const audience = (p: Record<string, string>) => (p.guests === 'non' ? 'interne' : 'externe');

const creerTicket = actionSpec({
  verb: 'creer_ticket',
  tool: 'creer_ticket_linear',
  description: 'Propose de créer un ticket Linear dans une équipe (par son nom ou sa clé), avec un titre et une description.',
  right: '« write »',
  risk: 'moyen',
  reversibility: 'annulable',
  rules: RULES,
  mentionKey: 'description',
  textKeys: ['texte'],
  input: z.object({
    equipe: z.string().min(1).max(100).describe('Le nom ou la clé de l’équipe (ENG).'),
    titre: z.string().min(1).max(255),
    texte: z.string().max(8_000).nullish().describe('La description, en Markdown.'),
    priorite: z.number().int().min(0).max(4).nullish().describe('0 aucune, 1 urgente, 2 haute, 3 moyenne, 4 basse.'),
  }),
  async prepare(live, { equipe, titre, texte, priorite }) {
    const { teams } = await read(live, TEAMS, {}, z.object({ teams: z.object({ nodes: z.array(Team) }) }));
    const wanted = equipe.trim().toLowerCase();
    const team = teams.nodes.find((t) => t.key.toLowerCase() === wanted || t.name.toLowerCase() === wanted);
    if (!team) throw new ElsewhereError(NO_TEAM);
    return {
      team_id: team.id,
      team_key: team.key,
      team_name: safeLine(team.name, 100) || team.key,
      title: titre,
      ...(texte ? { description: texte } : {}),
      ...(priorite != null ? { priority: String(priorite) } : {}),
      guests: await guestsOf(live, team.id),
    };
  },
  audience,
  verify: sameAudience,
  summary: (p) => `créer le ticket « ${p.title} » dans l’équipe Linear ${p.team_key}`,
  async execute(live, p, key) {
    // issueCreate avec un `id` tiré de la clé : un rejeu ne crée pas un second ticket (à vérifier).
    const reply = await mutate(
      live,
      `mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }`,
      {
        input: {
          id: uuidFrom(key),
          teamId: p.team_id,
          title: p.title,
          ...(p.description ? { description: p.description } : {}),
          ...(p.priority ? { priority: Number(p.priority) } : {}),
        },
      },
      z.object({ issueCreate: z.object({ success: z.boolean(), issue: z.object({ id: z.string().regex(UUID), url: z.string().nullish() }) }) }),
    );
    const issue = reply.issueCreate.issue;
    return { url: issue.url ?? null, ref: { item: `issue:${issue.id}` }, undo: { issue: issue.id } };
  },
  // Lecture directe par l'identifiant que nous avons fourni : une absence est sûre.
  async findExisting(live, _p, key) {
    const issue = await issueOf(live, uuidFrom(key));
    return issue ? { url: issue.url ?? null, ref: { item: `issue:${issue.id}` }, undo: { issue: issue.id } } : null;
  },
  async undo(live, _p, undo) {
    if (!undo.issue || !UUID.test(undo.issue)) throw new ActionFailure('echec');
    // issueDelete : la corbeille de Linear, 30 jours (note 07, L6, [O]).
    await mutate(live, 'mutation Delete($id: String!) { issueDelete(id: $id) { success } }', { id: undo.issue },
      z.object({ issueDelete: z.object({ success: z.boolean() }) }));
  },
});

const commenter = actionSpec({
  verb: 'commenter',
  tool: 'commenter_linear',
  description: 'Propose de commenter un ticket Linear. Les abonnés du ticket sont notifiés.',
  right: '« write »',
  risk: 'moyen',
  reversibility: 'annulable',
  rules: RULES,
  mentionKey: 'body',
  textKeys: ['texte'],
  input: z.object({ ticket: ticketField(), texte: z.string().min(1).max(8_000).describe('Le commentaire, en Markdown.') }),
  async prepare(live, { ticket, texte }) {
    const issue = await issueOf(live, ticket);
    if (!issue) throw new ElsewhereError(NO_ISSUE);
    return {
      issue_id: issue.id,
      identifier: issue.identifier,
      title: safeLine(issue.title, 255) || issue.identifier,
      body: texte,
      guests: await guestsOf(live, issue.team.id),
    };
  },
  audience,
  verify: sameAudience,
  summary: (p) => `commenter le ticket Linear ${p.identifier} « ${p.title} »`,
  async execute(live, p, key) {
    const reply = await mutate(
      live,
      `mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id url } } }`,
      { input: { id: uuidFrom(key), issueId: p.issue_id, body: p.body } },
      z.object({ commentCreate: z.object({ success: z.boolean(), comment: z.object({ id: z.string().regex(UUID), url: z.string().nullish() }) }) }),
    );
    const { comment } = reply.commentCreate;
    return {
      url: comment.url ?? null,
      ref: { item: `issue:${p.issue_id}`, turn: `comment:${comment.id}` },
      undo: { comment: comment.id },
    };
  },
  async findExisting(live, p, key) {
    const reply = await read(live, 'query C($id: String!) { comment(id: $id) { id url } }', { id: uuidFrom(key) },
      z.object({ comment: z.object({ id: z.string().regex(UUID), url: z.string().nullish() }).nullable() }));
    const comment = reply.comment;
    return comment
      ? { url: comment.url ?? null, ref: { item: `issue:${p.issue_id}`, turn: `comment:${comment.id}` }, undo: { comment: comment.id } }
      : null;
  },
  async undo(live, _p, undo) {
    if (!undo.comment || !UUID.test(undo.comment)) throw new ActionFailure('echec');
    // Les notifications déjà parties restent : la carte le dit avant le clic.
    await mutate(live, 'mutation D($id: String!) { commentDelete(id: $id) { success } }', { id: undo.comment },
      z.object({ commentDelete: z.object({ success: z.boolean() }) }));
  },
});

const modifierTicket = actionSpec({
  verb: 'modifier_ticket',
  tool: 'modifier_ticket_linear',
  description: 'Propose de changer l’état (par son nom) ou la priorité d’un ticket Linear.',
  right: '« write »',
  risk: 'moyen',
  reversibility: 'compensable',
  rules: RULES,
  input: z
    .object({
      ticket: ticketField(),
      etat: z.string().min(1).max(100).nullish().describe('Le nom de l’état visé (« Done », « En cours »).'),
      priorite: z.number().int().min(0).max(4).nullish(),
    })
    .refine((input) => input.etat || input.priorite != null, 'Donne etat ou priorite.'),
  async prepare(live, { ticket, etat, priorite }) {
    const issue = await issueOf(live, ticket);
    if (!issue) throw new ElsewhereError(NO_ISSUE);
    let state: { id: string; name: string } | undefined;
    if (etat) {
      const reply = await read(live, STATES, { id: issue.team.id },
        z.object({ team: z.object({ states: z.object({ nodes: z.array(z.object({ id: z.string().regex(UUID), name: z.string() })) }) }) }));
      state = reply.team.states.nodes.find((s) => s.name.toLowerCase() === etat.trim().toLowerCase());
      if (!state) return 'Cet état n’existe pas dans l’équipe du ticket : rien n’est proposé.';
      if (state.id === issue.state?.id) return 'Le ticket est déjà dans cet état.';
    }
    return {
      issue_id: issue.id,
      identifier: issue.identifier,
      title: safeLine(issue.title, 255) || issue.identifier,
      guests: await guestsOf(live, issue.team.id),
      ...(state && issue.state
        ? { state_id: state.id, state_name: safeLine(state.name, 100), before_state_id: issue.state.id, before_state_name: safeLine(issue.state.name, 100) }
        : {}),
      ...(priorite != null ? { priority: String(priorite), before_priority: String(issue.priority ?? 0) } : {}),
    };
  },
  audience,
  verify: sameAudience,
  summary: (p) =>
    `modifier le ticket Linear ${p.identifier}${p.state_name ? ` : ${p.before_state_name} → ${p.state_name}` : ''}${p.priority ? ` (priorité ${p.priority})` : ''}`,
  async execute(live, p) {
    const now = await issueOf(live, p.issue_id as string);
    if (!now) throw new ActionFailure('introuvable');
    if ((p.before_state_id && now.state?.id !== p.before_state_id) || (p.before_priority && String(now.priority ?? 0) !== p.before_priority)) {
      throw new ActionFailure('conflit');
    }
    await updateIssue(live, p.issue_id as string, p.state_id, p.priority);
    return {
      url: now.url ?? null,
      ref: { item: `issue:${now.id}` },
      undo: { issue: now.id, ...(p.before_state_id ? { state: p.before_state_id } : {}), ...(p.before_priority ? { priority: p.before_priority } : {}) },
    };
  },
  async undo(live, p, undo) {
    const now = await issueOf(live, undo.issue ?? '');
    if (!now) throw new ActionFailure('introuvable');
    // Un collègue a changé l'état ou la priorité depuis : on n'écrase pas son changement.
    if ((p.state_id && now.state?.id !== p.state_id) || (p.priority && String(now.priority ?? 0) !== p.priority)) {
      throw new ActionFailure('conflit');
    }
    await updateIssue(live, now.id, undo.state, undo.priority);
  },
});

async function updateIssue(live: LiveConnection, id: string, stateId?: string, priority?: string) {
  if (!UUID.test(id) || (stateId && !UUID.test(stateId))) throw new ActionFailure('echec');
  await mutate(
    live,
    'mutation U($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }',
    { id, input: { ...(stateId ? { stateId } : {}), ...(priority ? { priority: Number(priority) } : {}) } },
    z.object({ issueUpdate: z.object({ success: z.boolean() }) }),
  );
}

export const linearWrite: ConnectorWrite = {
  specs: { creer_ticket: creerTicket, commenter, modifier_ticket: modifierTicket },
  minIntervalMs: 1_000,
  granted(config) {
    if (config.authMode !== 'oauth' || typeof config.scope !== 'string') return 'inconnu';
    // Linear sépare ses portées par des virgules (linear/oauth.ts) ; la réponse peut les séparer autrement.
    return config.scope.split(/[\s,]+/).includes('write') ? 'oui' : 'non';
  },
};
```

Changements : `linear/connector.ts` (existe) gagne `write: linearWrite` et `scope` dans `configSchema` (`:46-58`) ; `linear/client.ts` exporte `graphql` avec `options.once`.

### 12.5 Notion (`src/server/connectors/notion/actions.ts`, à créer, après le jalon 1)

Ce que l'on sait (note 07, fiche Notion ; carte 03, 8.10) : `https://api.notion.com/v1`, en-tête `Notion-Version: 2026-03-11` (`NOTION_VERSION`, `notion/client.ts:7`, existe) ; `POST /v1/pages` crée une page sous un parent ([T]) ; `PATCH /v1/pages/{id}` avec `in_trash: true` la met à la corbeille, `false` la restaure ([O]) ; `PATCH /v1/blocks/{id}/children` ajoute des blocs, `position` remplace `after` ([O]) ; `POST /v1/comments` commente une page, et demande la capacité « insert comments », désactivée par défaut, sinon 403 ([O]) ; **aucune suppression de commentaire n'est trouvée** ([V]). Pas de portée : des capacités réglées dans la console. La page : `page:<id>`, tours `body` et `comment:<id>` (`notion/map.ts:94-99`, existe).

`authed` (`notion/client.ts:77-80`, privée) est exportée : les écritures passent par le même en-tête.

Ce que `prepare` lit pour le public : rien qui puisse le prouver interne. Une page publiée porte une adresse publique (`public_url`, à vérifier), mais le partage d'une page à un invité ne se lit pas par l'API (aucune note ne montre de lecture des droits d'une page). « Dans le doute, externe » (architecture, 8.1) : toute écriture Notion est `externe`. Elle attend donc un clic tant que l'exécution a lu un contenu extérieur, et ne part sans clic qu'au cran « agit seul ». Écart 6, section 18.

```ts
// src/server/connectors/notion/actions.ts
import { z } from 'zod';
import { pattern, refOf, safeLine, text, title } from '@/server/actions/params';
import { ActionFailure, actionSpec, ElsewhereError, type LiveConnection } from '@/server/actions/spec';
import { ConnectorHttpError, type HttpRequest } from '../http';
import type { ConnectorWrite } from '../types';
import { type Api, authed } from './client';

// Les écritures de Leon dans Notion, avec l'intégration de la personne (pages qu'elle a partagées avec Leon).
// Sources (aucune page ouverte, 20/11/2026) : note 07, fiche Notion (N1 à N5) ; carte 03, 8.10 ; notion/client.ts.
// Non vérifié : qu'aucune lecture de l'API ne dise à qui une page est partagée (le public est donc toujours externe) ;
// la propriété `title` d'une page sous une page ; la limite
// de 2 000 caractères par élément de rich_text et de 100 blocs par appel ([V]) ; que DELETE /v1/blocks/{id} mette le
// bloc à la corbeille ; une suppression de commentaire par l'API (non trouvée : notion.commenter est irréversible).

const BASE = 'https://api.notion.com/v1';
// Un identifiant Notion : 32 chiffres hexadécimaux, avec ou sans tirets.
const NOTION_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const RICH_TEXT_MAX = 2_000;
const BLOCKS_MAX = 100;

const apiOf = (live: LiveConnection): Api => ({
  http: live.http,
  token: String((live.config.authMode === 'oauth' ? live.config.accessToken : live.config.token) ?? ''),
});
const get = <T>(live: LiveConnection, path: string, schema: z.ZodType<T>) =>
  live.http.json(authed(apiOf(live), { url: `${BASE}${path}` }), schema);
const write = (live: LiveConnection, method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): HttpRequest =>
  authed(apiOf(live), { url: `${BASE}${path}`, method, body, once: true });

const Page = z.object({
  id: z.string().regex(NOTION_ID),
  url: z.string().nullish(),
  in_trash: z.boolean().nullish(),
  properties: z.record(z.string(), z.object({ type: z.string(), title: z.array(z.object({ plain_text: z.string() })).optional() })).nullish(),
});
type NotionPage = z.infer<typeof Page>;
const titleOf = (page: NotionPage) =>
  safeLine(
    Object.values(page.properties ?? {}).find((p) => p.type === 'title')?.title?.map((t) => t.plain_text).join('') ?? '',
    200,
  ) || 'Sans titre';

// Du texte vers des blocs paragraphe : un bloc par paragraphe, coupé à 2 000 caractères, 100 blocs au plus.
function blocksOf(value: string) {
  const chunks = value
    .split(/\n{2,}/)
    .flatMap((block) => block.match(new RegExp(`[\\s\\S]{1,${RICH_TEXT_MAX}}`, 'g')) ?? []);
  if (chunks.length > BLOCKS_MAX) throw new ActionFailure('refus');
  return chunks.map((content) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content } }] },
  }));
}

async function pageOf(live: LiveConnection, value: string): Promise<NotionPage | null> {
  const id = refOf(value, 'notion', 'page');
  if (!id || !NOTION_ID.test(id)) return null;
  try {
    const page = await get(live, `/pages/${id}`, Page);
    return page.in_trash ? null : page;
  } catch (error) {
    if (error instanceof ConnectorHttpError && error.status === 404) return null;
    throw error;
  }
}

// Levée par ElsewhereError : une autre intégration de la personne voit peut-être la page.
const NO_PAGE = 'Page Notion introuvable, ou pas partagée avec Leon : rien n’est proposé.';
const pageField = (what: string) =>
  z.string().max(200).describe(`${what} : l’objet du déclencheur (notion:page:…) ou l’identifiant de la page.`);

const RULES = {
  parent_id: pattern(NOTION_ID),
  parent_title: title(200),
  page_id: pattern(NOTION_ID),
  page_title: title(200),
  title: title(200),
  body: text(1, 8_200),
} satisfies Record<string, (value: string) => boolean>;

// Le partage à un invité ne se lit pas : dans le doute, externe (architecture, 8.1 ; écart 6).
const audience = () => 'externe' as const;

const creerPage = actionSpec({
  verb: 'creer_page',
  tool: 'creer_page_notion',
  description: 'Propose de créer une page Notion sous une page existante, avec un titre et un texte.',
  right: '« Insérer du contenu » (capacité de l’intégration)',
  risk: 'bas',
  reversibility: 'annulable',
  rules: RULES,
  mentionKey: 'body',
  textKeys: ['texte'],
  input: z.object({
    parent: pageField('La page mère'),
    titre: z.string().min(1).max(200),
    texte: z.string().min(1).max(8_000).describe('Le contenu, en paragraphes séparés par une ligne vide.'),
  }),
  async prepare(live, { parent, titre, texte }) {
    const page = await pageOf(live, parent);
    if (!page) throw new ElsewhereError(NO_PAGE);
    return { parent_id: page.id, parent_title: titleOf(page), title: titre, body: texte };
  },
  audience,
  summary: (p) => `créer la page Notion « ${p.title} » sous « ${p.parent_title} »`,
  async execute(live, p) {
    // POST /v1/pages
    const page = await live.http.json(
      write(live, 'POST', '/pages', {
        parent: { page_id: p.parent_id },
        properties: { title: { title: [{ type: 'text', text: { content: p.title } }] } },
        children: blocksOf(p.body as string),
      }),
      Page,
    );
    return { url: page.url ?? null, ref: { item: `page:${page.id}` }, undo: { page: page.id } };
  },
  // Aucune recherche fiable (la recherche de Notion porte sur le titre) : une réponse perdue est « incertain ».
  async undo(live, _p, undo) {
    if (!undo.page || !NOTION_ID.test(undo.page)) throw new ActionFailure('echec');
    // PATCH /v1/pages/{id} { in_trash: true } : la corbeille, restaurable.
    await live.http.json(write(live, 'PATCH', `/pages/${undo.page}`, { in_trash: true }), Page);
  },
});

const commenter = actionSpec({
  verb: 'commenter',
  tool: 'commenter_notion',
  description: 'Propose d’ajouter un commentaire sur une page Notion. Un commentaire ne se retire pas par l’API.',
  right: '« Insérer des commentaires » (capacité de l’intégration)',
  // Irréversible et notifie les abonnés de la page : moyen, pas bas (architecture 8.1 ; écart 10).
  risk: 'moyen',
  reversibility: 'irreversible',
  rules: RULES,
  mentionKey: 'body',
  textKeys: ['texte'],
  input: z.object({ page: pageField('La page'), texte: z.string().min(1).max(1_800) }),
  async prepare(live, { page: target, texte }) {
    const page = await pageOf(live, target);
    if (!page) throw new ElsewhereError(NO_PAGE);
    return { page_id: page.id, page_title: titleOf(page), body: texte };
  },
  audience,
  summary: (p) => `commenter la page Notion « ${p.page_title} »`,
  async execute(live, p) {
    // POST /v1/comments { parent: { page_id }, rich_text }
    const comment = await live.http.json(
      write(live, 'POST', '/comments', {
        parent: { page_id: p.page_id },
        rich_text: [{ type: 'text', text: { content: (p.body as string).slice(0, RICH_TEXT_MAX) } }],
      }),
      z.object({ id: z.string().regex(NOTION_ID) }),
    );
    return { url: null, ref: { item: `page:${p.page_id}`, turn: `comment:${comment.id}` } };
  },
});

const modifierPage = actionSpec({
  verb: 'modifier_page',
  tool: 'modifier_page_notion',
  description: 'Propose d’ajouter un texte à la fin d’une page Notion existante. Rien de ce qui y est n’est changé.',
  right: '« Insérer du contenu » (capacité de l’intégration)',
  risk: 'moyen',
  reversibility: 'compensable',
  rules: RULES,
  mentionKey: 'body',
  textKeys: ['texte'],
  input: z.object({ page: pageField('La page'), texte: z.string().min(1).max(8_000) }),
  async prepare(live, { page: target, texte }) {
    const page = await pageOf(live, target);
    if (!page) throw new ElsewhereError(NO_PAGE);
    return { page_id: page.id, page_title: titleOf(page), body: texte };
  },
  audience,
  summary: (p) => `ajouter un texte à la fin de la page Notion « ${p.page_title} »`,
  async execute(live, p) {
    // PATCH /v1/blocks/{page}/children, sans `position` : à la fin de la page.
    const reply = await live.http.json(
      write(live, 'PATCH', `/blocks/${p.page_id}/children`, { children: blocksOf(p.body as string) }),
      z.object({ results: z.array(z.object({ id: z.string().regex(NOTION_ID) })) }),
    );
    return {
      url: null,
      // Le tour `body` de la page change : isOwnWrite le reconnaît par sa souche.
      ref: { item: `page:${p.page_id}`, turn: 'body' },
      undo: { blocks: reply.results.map((b) => b.id).join(',') },
    };
  },
  async undo(live, _p, undo) {
    const ids = (undo.blocks ?? '').split(',').filter((id) => NOTION_ID.test(id));
    if (ids.length === 0) throw new ActionFailure('echec');
    for (const id of ids) {
      try {
        // DELETE /v1/blocks/{id} : le bloc part à la corbeille (à vérifier).
        await live.http.json(write(live, 'DELETE', `/blocks/${id}`), z.looseObject({}));
      } catch (error) {
        if (error instanceof ConnectorHttpError && error.status === 404) continue;
        throw error;
      }
    }
  },
});

export const notionWrite: ConnectorWrite = {
  specs: { creer_page: creerPage, commenter, modifier_page: modifierPage },
  minIntervalMs: 1_000,
  // Des capacités cochées dans la console, absentes du jeton : l'outil dira 403 (« droits »).
  granted: () => 'inconnu',
};
```

### 12.6 Zendesk (`src/server/connectors/zendesk/actions.ts`, à créer, après le jalon 1)

Ce que l'on sait (note 06, section 12 ; carte 03, 8.21) : base `https://{sous-domaine}.zendesk.com/api/v2` ; le connecteur se branche par une clé seulement (`subdomain`, `email`, `apiToken`, `Basic base64("<email>/token:<apiToken>")`, `zendesk/client.ts:61-63`, existe), celle d'un administrateur (`catalog.ts`) ; `PUT /api/v2/tickets/{id}.json` porte un commentaire (`public: true` réponse, `false` note interne) et les champs ; un seul commentaire par appel ; `additional_tags` ajoute, `remove_tags` retire, `tags` remplace ([MEM]) ; un ticket `closed` ne se modifie plus ([MEM]) ; `Idempotency-Key` à la création de ticket seulement, rien pour `PUT` ([OFF], [TIERS]) ; rejouer un `PUT` avec `comment` ajoute un second commentaire. Le ticket : `ticket:<id>`, tours `comment:<id>` avec `internalNote` (`zendesk/map.ts:82-88`, existe).

Ce que `prepare` lit pour le public : la note interne reste dans l'équipe (`interne`) ; la réponse va au demandeur (`externe`). Un changement de champs : les déclencheurs de Zendesk (ceux par défaut, et ceux que le client a écrits) peuvent écrire au demandeur sur un changement de statut (le passage à `solved` le fait par défaut) ou d'étiquette, et Leon ne les lit pas. « Dans le doute, externe » (architecture, 8.1) : `externe` dès qu'un statut ou une étiquette change, `interne` pour la priorité seule. Écart 11, section 18.

```ts
// src/server/connectors/zendesk/actions.ts
import { z } from 'zod';
import { EMAIL, hasMarker, list, markerOf, oneOf, pattern, refOf, safeLine, text, title } from '@/server/actions/params';
import { ActionFailure, actionSpec, type LiveConnection } from '@/server/actions/spec';
import type { HttpRequest } from '../http';
import type { ConnectorWrite } from '../types';

// Les écritures de Leon dans Zendesk, avec le jeton d'API branché (celui d'un administrateur : carte 03, 8.21).
// Sources (aucune page ouverte, 20/11/2026) : note 06, section 12 ; carte 03, 8.21 ; zendesk/client.ts, map.ts.
// Non vérifié : les identifiants de commentaire dans `audit.events` de la réponse d'un PUT ; le tri `sort=-created_at`
// de la liste des commentaires ; que `solved` prévienne le demandeur (déclencheurs du compte) ; `additional_tags` et
// `remove_tags` ; l'auteur d'un commentaire écrit avec le jeton (le propriétaire du jeton, pas la personne : écart 7).

const TICKET_ID = /^\d{1,15}$/;
const STATUSES = ['open', 'pending', 'hold', 'solved'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const TAG = /^[a-z0-9_:\-/.]{1,80}$/;

function zendesk(live: LiveConnection) {
  const { subdomain, email, apiToken } = live.config as { subdomain: string; email: string; apiToken: string };
  const base = `https://${subdomain}.zendesk.com/api/v2`;
  const headers = { Authorization: `Basic ${Buffer.from(`${email}/token:${apiToken}`).toString('base64')}` };
  return {
    subdomain,
    get: <T>(path: string, query: HttpRequest['query'], schema: z.ZodType<T>) =>
      live.http.json({ url: `${base}${path}`, headers, query }, schema),
    put: (path: string, body: unknown) => ({ url: `${base}${path}`, method: 'PUT', headers, body, once: true }) satisfies HttpRequest,
  };
}

const Ticket = z.object({
  id: z.number().int(),
  subject: z.string().nullish(),
  status: z.string(),
  priority: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  requester_id: z.number().int().nullish(),
});
const TicketReply = z.object({ ticket: Ticket });
const PutReply = z.object({
  ticket: Ticket,
  audit: z.object({ events: z.array(z.object({ id: z.number().int(), type: z.string() })) }).nullish(),
});
const Comments = z.object({ comments: z.array(z.object({ id: z.number().int(), body: z.string().nullish(), public: z.boolean().nullish() })) });

const ticketUrl = (subdomain: string, id: string) => `https://${subdomain}.zendesk.com/agent/tickets/${id}`;
const NO_TICKET = 'Ticket Zendesk introuvable, ou déjà clos : rien n’est proposé.';

async function ticketOf(live: LiveConnection, value: string) {
  const id = refOf(value, 'zendesk', 'ticket')?.replace(/^#/, '');
  if (!id || !TICKET_ID.test(id)) return null;
  const { ticket } = await zendesk(live).get(`/tickets/${id}.json`, {}, TicketReply);
  return ticket.status === 'closed' ? null : ticket;
}

// L'identifiant du commentaire ajouté, lu dans l'audit du PUT (à vérifier) : la souche du tour pour isOwnWrite.
const commentRef = (reply: z.infer<typeof PutReply>) => {
  const comment = reply.audit?.events.find((e) => e.type === 'Comment');
  return { item: `ticket:${reply.ticket.id}`, ...(comment ? { turn: `comment:${comment.id}` } : {}) };
};

// Ajouter un commentaire (note interne ou réponse). Un PUT ne se rejoue pas : il doublerait le commentaire.
async function addComment(live: LiveConnection, id: string, body: string, isPublic: boolean) {
  const api = zendesk(live);
  // PUT /api/v2/tickets/{id}.json { ticket: { comment: { body, public } } }
  const reply = await live.http.json(api.put(`/tickets/${id}.json`, { ticket: { comment: { body, public: isPublic } } }), PutReply);
  return { url: ticketUrl(api.subdomain, id), ref: commentRef(reply) };
}

const lastComments = (live: LiveConnection, id: string, size: number) =>
  zendesk(live).get(`/tickets/${id}/comments.json`, { sort: '-created_at', 'page[size]': size }, Comments);

// Après une réponse perdue, pour une note interne : la marque, dans les 20 derniers commentaires. La liste est lue
// en direct : l'absence est sûre, et la note peut être réécrite.
async function commentByMarker(live: LiveConnection, id: string, body: string | undefined, key: string) {
  if (!hasMarker(body, key)) throw new ActionFailure('incertain');
  const { comments } = await lastComments(live, id, 20);
  const found = comments.find((c) => c.body?.includes(markerOf(key)));
  return found
    ? { url: ticketUrl(zendesk(live).subdomain, id), ref: { item: `ticket:${id}`, turn: `comment:${found.id}` } }
    : null;
}

// Après une réponse perdue, pour une réponse au client (sans marque : le client lit le texte) : le même texte dans
// les 20 derniers commentaires publics. Pas trouvé ne prouve rien (Zendesk a pu reformater le texte) : « incertain »,
// jamais un second envoi au client.
async function commentByBody(live: LiveConnection, id: string, body: string) {
  const flat = (value: string) => value.replace(/\s+/g, ' ').trim();
  const { comments } = await lastComments(live, id, 20);
  const found = comments.find((c) => c.public === true && flat(c.body ?? '') === flat(body));
  if (!found) throw new ActionFailure('incertain');
  return { url: ticketUrl(zendesk(live).subdomain, id), ref: { item: `ticket:${id}`, turn: `comment:${found.id}` } };
}

// Le dernier commentaire du ticket (public ou note) : verify de repondre le compare à celui lu à la proposition.
async function lastCommentOf(live: LiveConnection, id: string) {
  const { comments } = await lastComments(live, id, 1);
  return comments[0] ? String(comments[0].id) : '';
}

const RULES = {
  ticket_id: pattern(TICKET_ID),
  subject: (value: string) => value === '' || title(300)(value),
  body: text(1, 8_200),
  requester: (value: string) => EMAIL.test(value),
  last_comment: pattern(/^\d{1,20}$/),
  status: oneOf(...STATUSES),
  priority: oneOf(...PRIORITIES),
  before_status: oneOf(...STATUSES, 'new'),
  before_priority: (value: string) => value === '' || oneOf(...PRIORITIES)(value),
  before_tags: list(100, (tag) => TAG.test(tag)),
  add_tags: list(20, (tag) => TAG.test(tag)),
  remove_tags: list(20, (tag) => TAG.test(tag)),
} satisfies Record<string, (value: string) => boolean>;

const ticketField = () =>
  z.string().max(100).describe('Le ticket : l’objet du déclencheur (zendesk:ticket:…) ou son numéro.');

const noteInterne = actionSpec({
  verb: 'ajouter_note_interne',
  tool: 'ajouter_note_interne_zendesk',
  description: 'Propose d’ajouter une note interne à un ticket Zendesk : l’équipe la lit, le client ne la voit pas.',
  right: '« tickets:write » (jeton d’administrateur)',
  // Irréversible, et les déclencheurs par défaut préviennent l'agent assigné : moyen, pas bas (écart 10).
  risk: 'moyen',
  reversibility: 'irreversible',
  rules: RULES,
  mentionKey: 'body',
  marker: true,
  textKeys: ['texte'],
  input: z.object({ ticket: ticketField(), texte: z.string().min(1).max(8_000) }),
  async prepare(live, { ticket: target, texte }) {
    const ticket = await ticketOf(live, target);
    if (!ticket) return NO_TICKET;
    return { ticket_id: String(ticket.id), subject: safeLine(ticket.subject ?? '', 300), body: texte };
  },
  audience: () => 'interne',
  summary: (p) => `ajouter une note interne au ticket Zendesk #${p.ticket_id} « ${p.subject} »`,
  execute: (live, p) => addComment(live, p.ticket_id as string, p.body as string, false),
  findExisting: (live, p, key) => commentByMarker(live, p.ticket_id as string, p.body, key),
});

const repondre = actionSpec({
  verb: 'repondre',
  tool: 'repondre_zendesk',
  description: 'Propose de répondre publiquement au client sur un ticket Zendesk. La réponse lui est envoyée et ne se retire pas.',
  right: '« tickets:write » (jeton d’administrateur)',
  risk: 'haut',
  reversibility: 'irreversible',
  rules: RULES,
  // La mention sans marque : le client la lit, et findExisting compare le texte (commentByBody).
  mentionKey: 'body',
  textKeys: ['texte'],
  input: z.object({ ticket: ticketField(), texte: z.string().min(1).max(8_000) }),
  async prepare(live, { ticket: target, texte }) {
    const ticket = await ticketOf(live, target);
    if (!ticket?.requester_id) return NO_TICKET;
    const { user } = await zendesk(live).get(`/users/${ticket.requester_id}.json`, {}, z.object({ user: z.object({ email: z.string().nullish() }) }));
    const requester = user.email?.toLowerCase() ?? '';
    if (!EMAIL.test(requester)) return 'Le demandeur du ticket n’a pas d’adresse lisible : rien n’est proposé.';
    const last = await lastCommentOf(live, String(ticket.id));
    if (!last) return NO_TICKET;
    return { ticket_id: String(ticket.id), subject: safeLine(ticket.subject ?? '', 300), requester, body: texte, last_comment: last };
  },
  // Le demandeur, pour le public (audience reste externe). Les copies du ticket ne sont pas lues.
  recipients: (p) => [p.requester as string],
  audience: () => 'externe',
  summary: (p) => `répondre au client ${p.requester} sur le ticket Zendesk #${p.ticket_id} « ${p.subject} »`,
  // Une réponse validée il y a six jours ne part pas sur un ticket résolu, clos, ou qui a reçu un commentaire depuis.
  async verify(live, p) {
    const ticket = await ticketOf(live, p.ticket_id as string);
    if (!ticket || ticket.status === 'solved') throw new ActionFailure('conflit');
    if ((await lastCommentOf(live, p.ticket_id as string)) !== p.last_comment) throw new ActionFailure('conflit');
  },
  execute: (live, p) => addComment(live, p.ticket_id as string, p.body as string, true),
  findExisting: (live, p) => commentByBody(live, p.ticket_id as string, p.body as string),
});

const modifierTicket = actionSpec({
  verb: 'modifier_ticket',
  tool: 'modifier_ticket_zendesk',
  description: 'Propose de changer le statut, la priorité ou les étiquettes d’un ticket Zendesk, sans commentaire.',
  right: '« tickets:write » (jeton d’administrateur)',
  risk: 'moyen',
  reversibility: 'compensable',
  rules: RULES,
  input: z
    .object({
      ticket: ticketField(),
      statut: z.enum(STATUSES).nullish(),
      priorite: z.enum(PRIORITIES).nullish(),
      ajouter: z.array(z.string().max(80)).max(20).nullish().describe('Étiquettes à ajouter.'),
      retirer: z.array(z.string().max(80)).max(20).nullish().describe('Étiquettes à retirer.'),
    })
    .refine((i) => i.statut || i.priorite || i.ajouter?.length || i.retirer?.length, 'Rien à modifier.'),
  async prepare(live, { ticket: target, statut, priorite, ajouter, retirer }) {
    const ticket = await ticketOf(live, target);
    if (!ticket) return NO_TICKET;
    const tags = (values: string[] | null | undefined) =>
      [...new Set((values ?? []).map((t) => t.trim().toLowerCase()))].filter((t) => TAG.test(t));
    // Seules les étiquettes qui changent vraiment : l'annulation retire ce qui a été ajouté et remet ce qui a été
    // retiré, sans toucher aux étiquettes qui étaient déjà là.
    const current = new Set(ticket.tags ?? []);
    const added = tags(ajouter).filter((t) => !current.has(t));
    const removed = tags(retirer).filter((t) => current.has(t));
    const changes = {
      ...(statut && statut !== ticket.status ? { status: statut } : {}),
      ...(priorite && priorite !== ticket.priority ? { priority: priorite } : {}),
      ...(added.length ? { add_tags: added.join(',') } : {}),
      ...(removed.length ? { remove_tags: removed.join(',') } : {}),
    };
    if (Object.keys(changes).length === 0) return 'Le ticket est déjà dans cet état : rien n’est proposé.';
    return {
      ticket_id: String(ticket.id),
      subject: safeLine(ticket.subject ?? '', 300),
      before_status: ticket.status,
      before_priority: ticket.priority ?? '',
      before_tags: (ticket.tags ?? []).filter((t) => TAG.test(t)).slice(0, 100).join(','),
      ...changes,
    };
  },
  // Un statut ou une étiquette qui change peut faire écrire un déclencheur au demandeur (« solved » par défaut, les
  // autres selon le compte) : dans le doute, externe. La priorité seule reste interne.
  audience: (p) => (p.priority && !p.status && !p.add_tags && !p.remove_tags ? 'interne' : 'externe'),
  summary: (p) => `modifier le ticket Zendesk #${p.ticket_id}${p.status ? ` : ${p.before_status} → ${p.status}` : ''}`,
  async execute(live, p) {
    const api = zendesk(live);
    const { ticket } = await api.get(`/tickets/${p.ticket_id}.json`, {}, TicketReply);
    const sameTags = (ticket.tags ?? []).filter((t) => TAG.test(t)).slice(0, 100).join(',') === p.before_tags;
    if (ticket.status !== p.before_status || (ticket.priority ?? '') !== p.before_priority || !sameTags) {
      throw new ActionFailure('conflit');
    }
    const split = (value: string | undefined) => (value ? value.split(',') : undefined);
    await live.http.json(
      api.put(`/tickets/${p.ticket_id}.json`, {
        ticket: {
          ...(p.status ? { status: p.status } : {}),
          ...(p.priority ? { priority: p.priority } : {}),
          ...(p.add_tags ? { additional_tags: split(p.add_tags) } : {}),
          ...(p.remove_tags ? { remove_tags: split(p.remove_tags) } : {}),
        },
      }),
      PutReply,
    );
    return { url: ticketUrl(api.subdomain, p.ticket_id as string), undo: { ticket: p.ticket_id as string } };
  },
  // Défaire ce que Leon a fait, et rien d'autre : le statut et la priorité seulement s'ils sont encore ceux que Leon a
  // posés ; les étiquettes par l'opération inverse (remove_tags de ce qui a été ajouté, additional_tags de ce qui a
  // été retiré), jamais `tags`, qui remplacerait la liste et effacerait celles qu'un collègue a posées depuis.
  async undo(live, p, undo) {
    if (!TICKET_ID.test(undo.ticket ?? '')) throw new ActionFailure('echec');
    const api = zendesk(live);
    const { ticket } = await api.get(`/tickets/${undo.ticket}.json`, {}, TicketReply);
    // Un ticket clos ne se modifie plus (note 06) : la compensation n'est plus possible.
    if (ticket.status === 'closed') throw new ActionFailure('conflit');
    if ((p.status && ticket.status !== p.status) || (p.priority && (ticket.priority ?? '') !== p.priority)) {
      throw new ActionFailure('conflit');
    }
    const split = (value: string | undefined) => (value ? value.split(',') : undefined);
    await live.http.json(
      api.put(`/tickets/${undo.ticket}.json`, {
        ticket: {
          ...(p.status && p.before_status !== 'new' ? { status: p.before_status } : {}),
          ...(p.priority ? { priority: p.before_priority || null } : {}),
          ...(p.add_tags ? { remove_tags: split(p.add_tags) } : {}),
          ...(p.remove_tags ? { additional_tags: split(p.remove_tags) } : {}),
        },
      }),
      PutReply,
    );
  },
});

export const zendeskWrite: ConnectorWrite = {
  specs: { ajouter_note_interne: noteInterne, modifier_ticket: modifierTicket, repondre },
  minIntervalMs: 1_000,
  // Le jeton est celui d'un administrateur (catalog.ts) : il écrit.
  granted: () => 'oui',
};
```

Changement de `zendesk/connector.ts` (existe) : `write: zendeskWrite`. Aucune portée (clé d'API).

### 12.7 Jira (`src/server/connectors/jira/actions.ts`, à créer, après le jalon 1)

Ce que l'on sait (note 07, fiche Jira ; carte 03, 8.4) : REST v3 ; avec le bouton, `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3`, avec une clé, `https://<site>.atlassian.net/rest/api/3` (`atlassianAccess`, `jira/access.ts:62`, existe) ; `POST /rest/api/3/issue` (champs `project`, `issuetype`, `summary`, [V]) ; `POST …/issue/{id}/comment` avec un corps ADF ([O]) ; on ne fixe pas un statut, on applique une transition lue par `GET …/transitions` ([T]) ; `DELETE …/issue/{id}` est définitif ([V]) ; aucune clé d'idempotence ; la recherche (`GET /rest/api/3/search/jql`) est cohérente à terme (`jira/connector.ts:44-46`). Portées demandées : `read:jira-work`, `read:jira-user`, `write:jira-work`, `offline_access` (`jira/connector.ts:147-152`). Le ticket : `issue:<id numérique>`, tours `body` et `comment:<id>` (`jira/map.ts:45-50`).

`adf.ts` ne sait que lire (`adfToText`, `jira/adf.ts:130`, existe) : il gagne `textToAdf`.

```ts
// src/server/connectors/jira/adf.ts (existe), ajout
// Du texte vers un document ADF minimal : un paragraphe par bloc, un saut de ligne dur par ligne. Rien d'autre
// (ni lien, ni mention) : ce que la personne valide s'affiche tel quel.
export function textToAdf(text: string) {
  const paragraphs = text.split(/\n{2,}/).map((block) => ({
    type: 'paragraph',
    content: block
      .split('\n')
      .flatMap((line, index) => [
        ...(index > 0 ? [{ type: 'hardBreak' }] : []),
        ...(line ? [{ type: 'text', text: line }] : []),
      ]),
  }));
  return { type: 'doc', version: 1, content: paragraphs };
}
```

Ce que `prepare` lit pour le public : le type du projet (`projectTypeKey`). `interne` seulement sur un type lu et connu sans portail client, `software` ou `business`. Un projet `service_desk` (Jira Service Management) a un portail client : un ticket ou un commentaire peut y être lu par le client, un changement de statut peut le prévenir. Ce type, et tout type absent ou inconnu, donne `externe` (« dans le doute, externe », architecture 8.1 ; écart 11).

```ts
// src/server/connectors/jira/actions.ts
import { z } from 'zod';
import { hasMarker, markerOf, oneOf, pattern, refOf, safeLine, text, title } from '@/server/actions/params';
import { ActionFailure, actionSpec, ElsewhereError, type LiveConnection } from '@/server/actions/spec';
import { ConnectorHttpError, type HttpRequest } from '../http';
import type { ConnectorWrite } from '../types';
import { type AtlassianConfig, atlassianAccess } from './access';
import { adfToText, textToAdf } from './adf';

// Les écritures de Leon dans Jira Cloud, au nom de la personne (OAuth 3LO ou jeton d'API de son compte).
// Sources (aucune page ouverte, 20/11/2026) : note 07, fiche Jira (J1 à J17) ; carte 03, 8.4 ; jira/access.ts, client.ts.
// Non vérifié : `issueTypes` et `projectTypeKey` dans GET /project/{clé} ; `projectTypeKey` dans les champs d'un
// ticket ; qu'un commentaire écrit par l'API sur un projet service_desk soit public ; le paramètre `orderBy=-created`
// des commentaires ; la recherche `text ~ "marque"` ; que DELETE /issue soit définitif ; les champs obligatoires de
// chaque projet (un 400 donne « refus »). Tout est contrôlé par l'extrait vendor-specs/jira.json (section 14).

const ID = /^\d{1,18}$/;
const KEY = /^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/;
const PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,19}$/;

function jira(live: LiveConnection) {
  const access = atlassianAccess(live.config as AtlassianConfig, 'jira');
  const base = `${access.root}/rest/api/3`;
  const headers = { Authorization: access.authorization };
  return {
    site: access.site,
    get: <T>(path: string, query: HttpRequest['query'], schema: z.ZodType<T>) =>
      live.http.json({ url: `${base}${path}`, headers, query }, schema),
    write: (method: 'POST' | 'DELETE', path: string, body?: unknown) =>
      ({ url: `${base}${path}`, method, headers, body, once: true }) satisfies HttpRequest,
  };
}

const Project = z.object({
  id: z.string().regex(ID),
  key: z.string().regex(PROJECT_KEY),
  name: z.string(),
  projectTypeKey: z.string().nullish(),
  issueTypes: z.array(z.object({ id: z.string().regex(ID), name: z.string(), subtask: z.boolean().nullish() })).nullish(),
});
const Issue = z.object({
  id: z.string().regex(ID),
  key: z.string().regex(KEY),
  fields: z.object({
    summary: z.string().nullish(),
    status: z.object({ id: z.string(), name: z.string() }).nullish(),
    project: z.object({ key: z.string().nullish(), projectTypeKey: z.string().nullish() }).nullish(),
  }),
});
const Transitions = z.object({
  transitions: z.array(z.object({ id: z.string().regex(ID), name: z.string(), to: z.object({ id: z.string(), name: z.string() }) })),
});
const Created = z.object({ id: z.string().regex(ID), key: z.string().regex(KEY) });
const Comment = z.object({ id: z.string().regex(ID), body: z.unknown().optional() });

const browse = (site: string, key: string) => `https://${site}.atlassian.net/browse/${encodeURIComponent(key)}`;
const NO_ISSUE = 'Ticket Jira introuvable pour cette connexion : rien n’est proposé.';
const projectType = (value: string | null | undefined) => (value === 'service_desk' ? 'service_desk' : value ?? 'inconnu');

async function issueOf(live: LiveConnection, value: string) {
  const id = refOf(value, 'jira', 'issue');
  if (!id || !(ID.test(id) || KEY.test(id))) return null;
  try {
    return await jira(live).get(`/issue/${encodeURIComponent(id)}`, { fields: 'summary,status,project' }, Issue);
  } catch (error) {
    if (error instanceof ConnectorHttpError && error.status === 404) return null;
    throw error;
  }
}

const RULES = {
  project_id: pattern(ID),
  project_key: pattern(PROJECT_KEY),
  project_name: title(200),
  project_type: pattern(/^[a-z_]{1,40}$/),
  issuetype_id: pattern(ID),
  issuetype_name: title(100),
  summary: title(255),
  description: text(0, 8_200),
  issue_id: pattern(ID),
  issue_key: pattern(KEY),
  body: text(1, 8_200),
  transition_id: pattern(ID),
  status_id: pattern(ID),
  status_name: title(100),
  before_status_id: pattern(ID),
  before_status_name: title(100),
} satisfies Record<string, (value: string) => boolean>;

// Un projet de service desk a un portail client : dans le doute, ce qui s'y écrit sort de la société.
const audience = (p: Record<string, string>) => (p.project_type === 'software' || p.project_type === 'business' ? 'interne' : 'externe');

// verify : le projet n'est pas devenu un service desk (ou illisible) depuis la proposition. Déjà externe : rien à relire.
async function sameAudience(live: LiveConnection, p: Record<string, string>) {
  if (audience(p) === 'externe') return;
  const type = p.issue_id
    ? projectType((await issueOf(live, p.issue_id))?.fields.project?.projectTypeKey)
    : projectType((await jira(live).get(`/project/${p.project_key}`, {}, Project)).projectTypeKey);
  if (audience({ project_type: type }) === 'externe') throw new ActionFailure('conflit');
}
const ticketField = () =>
  z.string().max(100).describe('Le ticket : l’objet du déclencheur (jira:issue:…), sa clé (OPS-12) ou son identifiant.');

const creerTicket = actionSpec({
  verb: 'creer_ticket',
  tool: 'creer_ticket_jira',
  description: 'Propose de créer un ticket Jira dans un projet (par sa clé), d’un type donné (« Tâche » sans précision).',
  right: '« write:jira-work »',
  risk: 'moyen',
  reversibility: 'compensable',
  rules: RULES,
  mentionKey: 'description',
  marker: true,
  textKeys: ['texte'],
  input: z.object({
    projet: z.string().min(1).max(20).describe('La clé du projet (OPS).'),
    titre: z.string().min(1).max(255),
    texte: z.string().max(8_000).nullish().describe('La description.'),
    type: z.string().max(100).nullish().describe('Le type de ticket ; sans lui, Tâche ou Task.'),
  }),
  async prepare(live, { projet, titre, texte, type }) {
    const key = projet.trim().toUpperCase();
    if (!PROJECT_KEY.test(key)) return 'Clé de projet invalide.';
    // GET /rest/api/3/project/{clé} : le type du projet (public) et ses types de tickets.
    const project = await jira(live).get(`/project/${key}`, {}, Project);
    const kinds = (project.issueTypes ?? []).filter((t) => !t.subtask);
    const wanted = (type ?? '').trim().toLowerCase();
    const kind = wanted
      ? kinds.find((t) => t.name.toLowerCase() === wanted)
      : kinds.find((t) => ['task', 'tâche'].includes(t.name.toLowerCase())) ?? kinds[0];
    if (!kind) return 'Ce type de ticket n’existe pas dans ce projet : rien n’est proposé.';
    return {
      project_id: project.id,
      project_key: project.key,
      project_name: safeLine(project.name, 200) || project.key,
      project_type: projectType(project.projectTypeKey),
      issuetype_id: kind.id,
      issuetype_name: safeLine(kind.name, 100) || kind.id,
      summary: titre,
      ...(texte ? { description: texte } : {}),
    };
  },
  audience,
  verify: sameAudience,
  summary: (p) => `créer le ticket Jira « ${p.summary} » (${p.issuetype_name}) dans ${p.project_key}`,
  async execute(live, p) {
    const api = jira(live);
    // POST /rest/api/3/issue
    const issue = await live.http.json(
      api.write('POST', '/issue', {
        fields: {
          project: { id: p.project_id },
          issuetype: { id: p.issuetype_id },
          summary: p.summary,
          ...(p.description ? { description: textToAdf(p.description) } : {}),
        },
      }),
      Created,
    );
    return { url: browse(api.site, issue.key), ref: { item: `issue:${issue.id}` }, undo: { issue: issue.id } };
  },
  // La recherche est cohérente à terme (connector.ts:44-46) : ne rien trouver n'est pas une preuve.
  async findExisting(live, p, key) {
    if (!hasMarker(p.description, key)) throw new ActionFailure('incertain');
    const api = jira(live);
    const { issues } = await api.get(
      '/search/jql',
      { jql: `project = ${p.project_key} AND text ~ "${markerOf(key)}"`, fields: 'summary', maxResults: 1 },
      z.object({ issues: z.array(z.object({ id: z.string().regex(ID), key: z.string().regex(KEY) })) }),
    );
    const issue = issues[0];
    if (!issue) throw new ActionFailure('incertain');
    return { url: browse(api.site, issue.key), ref: { item: `issue:${issue.id}` }, undo: { issue: issue.id } };
  },
  async undo(live, _p, undo) {
    if (!ID.test(undo.issue ?? '')) throw new ActionFailure('echec');
    try {
      // La suppression est définitive : un ticket que des collègues ont déjà commenté n'est pas effacé avec leur travail.
      const { total } = await jira(live).get(`/issue/${undo.issue}/comment`, { maxResults: 1 }, z.object({ total: z.number() }));
      if (total > 0) throw new ActionFailure('conflit');
      // DELETE /rest/api/3/issue/{id} : définitif ; les notifications de création sont parties.
      await live.http.text(jira(live).write('DELETE', `/issue/${undo.issue}`));
    } catch (error) {
      if (error instanceof ConnectorHttpError && error.status === 404) return;
      throw error;
    }
  },
});

const commenter = actionSpec({
  verb: 'commenter',
  tool: 'commenter_jira',
  description: 'Propose de commenter un ticket Jira. Sur un projet de service desk, le client peut lire le commentaire.',
  right: '« write:jira-work »',
  risk: 'moyen',
  reversibility: 'compensable',
  rules: RULES,
  mentionKey: 'body',
  marker: true,
  textKeys: ['texte'],
  input: z.object({ ticket: ticketField(), texte: z.string().min(1).max(8_000) }),
  async prepare(live, { ticket, texte }) {
    const issue = await issueOf(live, ticket);
    if (!issue) throw new ElsewhereError(NO_ISSUE);
    return {
      issue_id: issue.id,
      issue_key: issue.key,
      summary: safeLine(issue.fields.summary ?? '', 255) || issue.key,
      project_type: projectType(issue.fields.project?.projectTypeKey),
      body: texte,
    };
  },
  audience,
  verify: sameAudience,
  summary: (p) => `commenter le ticket Jira ${p.issue_key} « ${p.summary} »`,
  async execute(live, p) {
    const api = jira(live);
    // POST /rest/api/3/issue/{id}/comment { body: ADF }
    const comment = await live.http.json(api.write('POST', `/issue/${p.issue_id}/comment`, { body: textToAdf(p.body as string) }), Comment);
    return {
      url: browse(api.site, p.issue_key as string),
      ref: { item: `issue:${p.issue_id}`, turn: `comment:${comment.id}` },
      undo: { issue: p.issue_id as string, comment: comment.id },
    };
  },
  // Les commentaires se lisent en direct, les plus récents d'abord : l'absence est sûre (si la marque est posée).
  async findExisting(live, p, key) {
    if (!hasMarker(p.body, key)) throw new ActionFailure('incertain');
    const api = jira(live);
    const { comments } = await api.get(
      `/issue/${p.issue_id}/comment`,
      { orderBy: '-created', maxResults: 50 },
      z.object({ comments: z.array(Comment) }),
    );
    const found = comments.find((c) => adfToText(c.body).includes(markerOf(key)));
    return found
      ? {
          url: browse(api.site, p.issue_key as string),
          ref: { item: `issue:${p.issue_id}`, turn: `comment:${found.id}` },
          undo: { issue: p.issue_id as string, comment: found.id },
        }
      : null;
  },
  async undo(live, _p, undo) {
    if (!ID.test(undo.issue ?? '') || !ID.test(undo.comment ?? '')) throw new ActionFailure('echec');
    try {
      await live.http.text(jira(live).write('DELETE', `/issue/${undo.issue}/comment/${undo.comment}`));
    } catch (error) {
      if (error instanceof ConnectorHttpError && error.status === 404) return;
      throw error;
    }
  },
});

const changerStatut = actionSpec({
  verb: 'changer_statut',
  tool: 'changer_statut_jira',
  description: 'Propose de faire passer un ticket Jira à un statut (par son nom), par une transition de son flux.',
  right: '« write:jira-work »',
  risk: 'moyen',
  reversibility: 'compensable',
  rules: RULES,
  input: z.object({ ticket: ticketField(), statut: z.string().min(1).max(100).describe('Le nom du statut visé.') }),
  async prepare(live, { ticket, statut }) {
    const issue = await issueOf(live, ticket);
    if (!issue?.fields.status) throw new ElsewhereError(NO_ISSUE);
    const { transitions } = await jira(live).get(`/issue/${issue.id}/transitions`, {}, Transitions);
    const wanted = statut.trim().toLowerCase();
    const move = transitions.find((t) => t.to.name.toLowerCase() === wanted || t.name.toLowerCase() === wanted);
    if (!move) return 'Aucune transition ne mène à ce statut depuis le statut actuel : rien n’est proposé.';
    if (move.to.id === issue.fields.status.id) return 'Le ticket est déjà à ce statut.';
    return {
      issue_id: issue.id,
      issue_key: issue.key,
      summary: safeLine(issue.fields.summary ?? '', 255) || issue.key,
      project_type: projectType(issue.fields.project?.projectTypeKey),
      transition_id: move.id,
      status_id: move.to.id,
      status_name: safeLine(move.to.name, 100),
      before_status_id: issue.fields.status.id,
      before_status_name: safeLine(issue.fields.status.name, 100),
    };
  },
  audience,
  verify: sameAudience,
  summary: (p) => `faire passer le ticket Jira ${p.issue_key} de « ${p.before_status_name} » à « ${p.status_name} »`,
  async execute(live, p) {
    const api = jira(live);
    const now = await issueOf(live, p.issue_id as string);
    if (now?.fields.status?.id !== p.before_status_id) throw new ActionFailure('conflit');
    // POST /rest/api/3/issue/{id}/transitions { transition: { id } } : 204, sans corps.
    await live.http.text(api.write('POST', `/issue/${p.issue_id}/transitions`, { transition: { id: p.transition_id } }));
    return {
      url: browse(api.site, p.issue_key as string),
      ref: { item: `issue:${p.issue_id}` },
      undo: { issue: p.issue_id as string, status: p.before_status_id as string },
    };
  },
  async undo(live, p, undo) {
    if (!ID.test(undo.issue ?? '') || !ID.test(undo.status ?? '')) throw new ActionFailure('echec');
    const api = jira(live);
    // Le ticket est-il encore au statut où Leon l'a mis ? Sinon un collègue l'a bougé depuis : on n'y touche pas.
    const now = await issueOf(live, undo.issue as string);
    if (now?.fields.status?.id !== p.status_id) throw new ActionFailure('conflit');
    const { transitions } = await api.get(`/issue/${undo.issue}/transitions`, {}, Transitions);
    // Le flux n'a pas toujours de retour (note 07) : sans transition vers l'ancien statut, pas de compensation.
    const back = transitions.find((t) => t.to.id === undo.status);
    if (!back) throw new ActionFailure('conflit');
    await live.http.text(api.write('POST', `/issue/${undo.issue}/transitions`, { transition: { id: back.id } }));
  },
});

export const jiraWrite: ConnectorWrite = {
  specs: { creer_ticket: creerTicket, commenter, changer_statut: changerStatut },
  minIntervalMs: 500,
  granted(config) {
    if (config.authMode !== 'oauth' || typeof config.scope !== 'string') return 'inconnu';
    return config.scope.split(/\s+/).includes('write:jira-work') ? 'oui' : 'non';
  },
};
```

Changements : `jira/connector.ts` (existe) gagne `write: jiraWrite` et `scope` dans son schéma (`oauthShape`, `jira/access.ts:18-25`, partagé avec Confluence : sans effet pour lui). Confluence n'écrit pas au premier lot.

### 12.8 Asana (`src/server/connectors/asana/actions.ts`, à créer, après le jalon 1)

Ce que l'on sait (note 07, fiche Asana ; carte 02, 8.2) : `https://app.asana.com/api/1.0` ; `POST /tasks` (corps `{ data: … }`, `projects` ou `workspace`, portée `tasks:write`, [O]) ; `PUT /tasks/{gid}` ([V]) ; `POST /tasks/{gid}/stories` avec `text` ([V], portée `stories:write`) ; `DELETE /stories/{gid}` pour ses propres commentaires ([V]) ; `DELETE /tasks/{gid}` met à la corbeille 30 jours ([V]) ; un champ `external` peut servir de clé naturelle ([V]). Portées demandées (`asana/oauth.ts:40-48`, existe) : `tasks:write`, `stories:write`, aucune `:delete`. La tâche : `task:<gid>`, tours `body` et `comment:<gid>` (`asana/map.ts:43-51`).

Une portée à ajouter dans `asana/oauth.ts` : `tasks:delete`, pour l'annulation de `creer_tache` (le nom est à vérifier, note 07 : « forme confirmée pour `tasks:write` seulement »). Une connexion d'avant ne l'a pas : son annulation échoue en `droits`, la carte le dit.

Ce que `prepare` lit pour le public : les membres de l'espace de travail (`GET /workspaces/{gid}/workspace_memberships`, champ `is_guest`, à vérifier). Un invité peut être ajouté à n'importe quelle tâche ou projet : on ne descend pas au projet, l'espace entier décide. Aucun invité lu, la liste lue en entier : `interne`. Un invité, une valeur illisible, ou plus de 100 membres : `externe` (« dans le doute, externe », architecture 8.1 ; écart 6).

```ts
// src/server/connectors/asana/actions.ts
import { z } from 'zod';
import { hasMarker, isoDay, markerOf, pattern, refOf, safeLine, text, title, yesNo } from '@/server/actions/params';
import { ActionFailure, actionSpec, ElsewhereError, type LiveConnection } from '@/server/actions/spec';
import { ConnectorHttpError, type HttpRequest } from '../http';
import type { ConnectorWrite } from '../types';
import { asanaClient } from './client';

// Les écritures de Leon dans Asana, au nom de la personne (OAuth, ou son jeton personnel).
// Sources (aucune page ouverte, 20/11/2026) : note 07, fiche Asana (A1 à A3) ; carte 02, 8.2 ; asana/client.ts.
// Non vérifié : PUT /tasks/{gid}, POST et DELETE de stories, DELETE /tasks/{gid} et sa portée tasks:delete ([V]) ;
// le champ `external` et la lecture GET /tasks/external:{id} ; `opt_fields=permalink_url` sur un POST ;
// GET /workspaces/{gid}/workspace_memberships et son champ is_guest ; `workspace` dans les opt_fields d'une tâche. Chaque requête
// est contrôlée par l'extrait vendor-specs/asana.json (section 14) : un nom faux y fait échouer le test.

const API = 'https://app.asana.com/api/1.0';
const GID = /^\d{1,30}$/;

const tokenOf = (config: Record<string, unknown>) =>
  String((config.authMode === 'oauth' ? config.accessToken : config.token) ?? '');

function asana(live: LiveConnection) {
  const headers = { Authorization: `Bearer ${tokenOf(live.config)}` };
  return {
    get: <T>(path: string, query: HttpRequest['query'], schema: z.ZodType<T>) =>
      live.http.json({ url: `${API}${path}`, headers, query }, z.object({ data: schema })).then((r) => r.data),
    // Une page de liste, avec next_page : savoir si tout a été lu.
    list: <T>(path: string, query: HttpRequest['query'], item: z.ZodType<T>) =>
      live.http.json(
        { url: `${API}${path}`, headers, query },
        z.object({ data: z.array(item), next_page: z.object({ offset: z.string() }).nullish() }),
      ),
    write: (method: 'POST' | 'PUT' | 'DELETE', path: string, data?: unknown, query?: HttpRequest['query']) =>
      ({ url: `${API}${path}`, method, headers, query, body: data === undefined ? undefined : { data }, once: true }) satisfies HttpRequest,
  };
}

const Task = z.object({
  gid: z.string().regex(GID),
  name: z.string().nullish(),
  completed: z.boolean().nullish(),
  due_on: z.string().nullish(),
  permalink_url: z.string().nullish(),
  workspace: z.object({ gid: z.string().regex(GID) }).nullish(),
});
const Story = z.object({ gid: z.string().regex(GID), text: z.string().nullish(), resource_subtype: z.string().nullish() });

// L'espace de travail de la connexion : celui que `verify` a retenu (config.workspace, nom ou gid), sinon le premier.
async function workspaceOf(live: LiveConnection): Promise<string | null> {
  const { workspaces } = await asanaClient(tokenOf(live.config), live.http).me();
  const wanted = String(live.config.workspace ?? '').trim().toLowerCase();
  const found = wanted ? workspaces.find((w) => w.gid === wanted || w.name.toLowerCase() === wanted) : workspaces[0];
  return found?.gid ?? null;
}

async function taskOf(live: LiveConnection, value: string) {
  const gid = refOf(value, 'asana', 'task');
  if (!gid || !GID.test(gid)) return null;
  try {
    return await asana(live).get(`/tasks/${gid}`, { opt_fields: 'name,completed,due_on,permalink_url,workspace' }, Task);
  } catch (error) {
    if (error instanceof ConnectorHttpError && error.status === 404) return null;
    throw error;
  }
}

const NO_TASK = 'Tâche Asana introuvable pour cette connexion : rien n’est proposé.';
const NO_PROJECT = 'Ce projet n’existe pas dans l’espace Asana, ou la connexion ne le voit pas.';

// « oui » : l'espace de travail a un invité (ou une valeur illisible), ou plus de 100 membres (non lus).
async function workspaceGuests(live: LiveConnection, workspace: string): Promise<'oui' | 'non'> {
  const reply = await asana(live).list(
    `/workspaces/${workspace}/workspace_memberships`,
    { opt_fields: 'is_guest', limit: 100 },
    z.object({ is_guest: z.boolean().nullish() }),
  );
  return reply.next_page || reply.data.some((m) => m.is_guest !== false) ? 'oui' : 'non';
}

// Les invités de l'espace d'une tâche : sans espace lisible, « oui » (externe).
async function taskGuests(live: LiveConnection, task: { workspace?: { gid: string } | null }) {
  return task.workspace ? workspaceGuests(live, task.workspace.gid) : 'oui';
}

const audience = (p: Record<string, string>) => (p.guests === 'non' ? 'interne' : 'externe');

// verify : le public n'a pas durci depuis la proposition (un invité est arrivé dans l'espace).
async function sameAudience(live: LiveConnection, p: Record<string, string>) {
  if (p.guests !== 'non') return;
  const workspace = p.task_gid ? (await taskOf(live, p.task_gid))?.workspace?.gid : await workspaceOf(live);
  if (!workspace) throw new ActionFailure('introuvable');
  if ((await workspaceGuests(live, workspace)) === 'oui') throw new ActionFailure('conflit');
}
// La clé naturelle posée à la création (`external.gid`) : tirée de la clé d'idempotence.
const externalOf = (key: string) => `leon-${key.slice(0, 40)}`;

const RULES = {
  project_gid: pattern(GID),
  project_name: title(200),
  title: title(255),
  notes: text(0, 8_200),
  due_on: (value: string) => value === '' || isoDay(value),
  task_gid: pattern(GID),
  task_name: title(255),
  text: text(1, 8_200),
  completed: yesNo,
  guests: yesNo,
  before_completed: yesNo,
  before_due_on: (value: string) => value === '' || isoDay(value),
} satisfies Record<string, (value: string) => boolean>;

const taskField = () =>
  z.string().max(100).describe('La tâche : l’objet du déclencheur (asana:task:…) ou son identifiant.');

const creerTache = actionSpec({
  verb: 'creer_tache',
  tool: 'creer_tache_asana',
  description: 'Propose de créer une tâche Asana dans un projet (par son nom), avec une description et une échéance.',
  right: '« tasks:write »',
  risk: 'bas',
  reversibility: 'annulable',
  rules: RULES,
  // La mention sans marque : findExisting lit la clé externe (externalOf), pas le texte.
  mentionKey: 'notes',
  textKeys: ['texte'],
  input: z.object({
    projet: z.string().min(1).max(200).describe('Le nom du projet.'),
    titre: z.string().min(1).max(255),
    texte: z.string().max(8_000).nullish(),
    echeance: z.string().max(10).nullish().describe('AAAA-MM-JJ.'),
  }),
  async prepare(live, { projet, titre, texte, echeance }) {
    if (echeance != null && !isoDay(echeance)) return 'Échéance invalide : AAAA-MM-JJ.';
    const workspace = await workspaceOf(live);
    if (!workspace) throw new ElsewhereError('Aucun espace Asana pour cette connexion.');
    // GET /projects?workspace=…&archived=false : la lecture que fait déjà la relève (asana/client.ts:95-125).
    const projects = await asana(live).get(
      '/projects',
      { workspace, archived: false, opt_fields: 'name', limit: 100 },
      z.array(z.object({ gid: z.string().regex(GID), name: z.string() })),
    );
    const wanted = projet.trim().toLowerCase();
    const project = projects.find((p) => p.name.toLowerCase() === wanted || p.gid === wanted);
    if (!project) throw new ElsewhereError(NO_PROJECT);
    return {
      project_gid: project.gid,
      project_name: safeLine(project.name, 200) || project.gid,
      title: titre,
      ...(texte ? { notes: texte } : {}),
      ...(echeance ? { due_on: echeance } : {}),
      guests: await workspaceGuests(live, workspace),
    };
  },
  audience,
  verify: sameAudience,
  summary: (p) => `créer la tâche Asana « ${p.title} » dans « ${p.project_name} »${p.due_on ? ` pour le ${p.due_on}` : ''}`,
  async execute(live, p, key) {
    // POST /tasks { data: { name, notes, projects, due_on, external } }
    const reply = await live.http.json(
      asana(live).write(
        'POST',
        '/tasks',
        {
          name: p.title,
          projects: [p.project_gid],
          ...(p.notes ? { notes: p.notes } : {}),
          ...(p.due_on ? { due_on: p.due_on } : {}),
          external: { gid: externalOf(key) },
        },
        { opt_fields: 'permalink_url' },
      ),
      z.object({ data: Task }),
    );
    const task = reply.data;
    return { url: task.permalink_url ?? null, ref: { item: `task:${task.gid}` }, undo: { task: task.gid } };
  },
  // Lecture directe par la clé externe (à vérifier) : un 404 vaut absence.
  async findExisting(live, _p, key) {
    try {
      const task = await asana(live).get(`/tasks/external:${externalOf(key)}`, { opt_fields: 'permalink_url' }, Task);
      return { url: task.permalink_url ?? null, ref: { item: `task:${task.gid}` }, undo: { task: task.gid } };
    } catch (error) {
      if (error instanceof ConnectorHttpError && error.status === 404) return null;
      throw error;
    }
  },
  async undo(live, _p, undo) {
    if (!GID.test(undo.task ?? '')) throw new ActionFailure('echec');
    try {
      // DELETE /tasks/{gid} : la corbeille, 30 jours ([V]) ; demande tasks:delete.
      await live.http.json(asana(live).write('DELETE', `/tasks/${undo.task}`), z.looseObject({}));
    } catch (error) {
      if (error instanceof ConnectorHttpError && error.status === 404) return;
      throw error;
    }
  },
});

const commenter = actionSpec({
  verb: 'commenter',
  tool: 'commenter_asana',
  description: 'Propose de commenter une tâche Asana. Les abonnés de la tâche sont notifiés.',
  right: '« stories:write »',
  risk: 'bas',
  reversibility: 'annulable',
  rules: RULES,
  mentionKey: 'text',
  marker: true,
  textKeys: ['texte'],
  input: z.object({ tache: taskField(), texte: z.string().min(1).max(8_000) }),
  async prepare(live, { tache, texte }) {
    const task = await taskOf(live, tache);
    if (!task) throw new ElsewhereError(NO_TASK);
    return {
      task_gid: task.gid,
      task_name: safeLine(task.name ?? '', 255) || task.gid,
      text: texte,
      guests: await taskGuests(live, task),
    };
  },
  audience,
  verify: sameAudience,
  summary: (p) => `commenter la tâche Asana « ${p.task_name} »`,
  async execute(live, p) {
    // POST /tasks/{gid}/stories { data: { text } }
    const reply = await live.http.json(asana(live).write('POST', `/tasks/${p.task_gid}/stories`, { text: p.text }), z.object({ data: Story }));
    return { url: null, ref: { item: `task:${p.task_gid}`, turn: `comment:${reply.data.gid}` }, undo: { story: reply.data.gid } };
  },
  // La liste des commentaires de la tâche, lue en direct : l'absence est sûre (si la marque est posée).
  async findExisting(live, p, key) {
    if (!hasMarker(p.text, key)) throw new ActionFailure('incertain');
    const stories = await asana(live).get(
      `/tasks/${p.task_gid}/stories`,
      { opt_fields: 'text,resource_subtype', limit: 100 },
      z.array(Story),
    );
    const found = stories.find((s) => s.resource_subtype === 'comment_added' && s.text?.includes(markerOf(key)));
    return found ? { url: null, ref: { item: `task:${p.task_gid}`, turn: `comment:${found.gid}` }, undo: { story: found.gid } } : null;
  },
  async undo(live, _p, undo) {
    if (!GID.test(undo.story ?? '')) throw new ActionFailure('echec');
    try {
      await live.http.json(asana(live).write('DELETE', `/stories/${undo.story}`), z.looseObject({}));
    } catch (error) {
      if (error instanceof ConnectorHttpError && error.status === 404) return;
      throw error;
    }
  },
});

const modifierTache = actionSpec({
  verb: 'modifier_tache',
  tool: 'modifier_tache_asana',
  description: 'Propose de marquer une tâche Asana comme terminée (ou non), ou de changer son échéance.',
  right: '« tasks:write »',
  risk: 'moyen',
  reversibility: 'compensable',
  rules: RULES,
  input: z
    .object({
      tache: taskField(),
      terminee: z.boolean().nullish(),
      echeance: z.string().max(10).nullish().describe('AAAA-MM-JJ, ou vide pour la retirer.'),
    })
    .refine((i) => i.terminee != null || i.echeance != null, 'Rien à modifier.'),
  async prepare(live, { tache, terminee, echeance }) {
    if (echeance && !isoDay(echeance)) return 'Échéance invalide : AAAA-MM-JJ.';
    const task = await taskOf(live, tache);
    if (!task) throw new ElsewhereError(NO_TASK);
    return {
      task_gid: task.gid,
      task_name: safeLine(task.name ?? '', 255) || task.gid,
      guests: await taskGuests(live, task),
      before_completed: task.completed ? 'oui' : 'non',
      before_due_on: task.due_on ?? '',
      ...(terminee != null ? { completed: terminee ? 'oui' : 'non' } : {}),
      ...(echeance != null ? { due_on: echeance } : {}),
    };
  },
  audience,
  verify: sameAudience,
  summary: (p) =>
    `modifier la tâche Asana « ${p.task_name} »${p.completed ? ` (${p.completed === 'oui' ? 'terminée' : 'à faire'})` : ''}${p.due_on !== undefined ? ` (échéance ${p.due_on || 'retirée'})` : ''}`,
  async execute(live, p) {
    const now = await taskOf(live, p.task_gid as string);
    if (!now) throw new ActionFailure('introuvable');
    if ((now.completed ? 'oui' : 'non') !== p.before_completed || (now.due_on ?? '') !== p.before_due_on) {
      throw new ActionFailure('conflit');
    }
    await putTask(live, p.task_gid as string, p.completed, p.due_on);
    return {
      url: now.permalink_url ?? null,
      ref: { item: `task:${now.gid}` },
      undo: { task: now.gid, completed: p.before_completed as string, due_on: p.before_due_on as string },
    };
  },
  async undo(live, p, undo) {
    const now = await taskOf(live, undo.task ?? '');
    if (!now) throw new ActionFailure('introuvable');
    // Un collègue a changé l'état ou l'échéance depuis : on n'écrase pas son changement.
    if ((p.completed && (now.completed ? 'oui' : 'non') !== p.completed) || (p.due_on !== undefined && (now.due_on ?? '') !== p.due_on)) {
      throw new ActionFailure('conflit');
    }
    await putTask(live, now.gid, p.completed ? undo.completed : undefined, p.due_on !== undefined ? undo.due_on : undefined);
  },
});

// PUT /tasks/{gid} { data: { completed, due_on } } ; une échéance vide la retire (null).
async function putTask(live: LiveConnection, gid: string, completed?: string, due?: string) {
  if (!GID.test(gid)) throw new ActionFailure('echec');
  await live.http.json(
    asana(live).write('PUT', `/tasks/${gid}`, {
      ...(completed ? { completed: completed === 'oui' } : {}),
      ...(due !== undefined ? { due_on: due || null } : {}),
    }),
    z.object({ data: Task }),
  );
}

const SCOPE_OF: Record<string, string> = {
  creer_tache: 'tasks:write',
  modifier_tache: 'tasks:write',
  commenter: 'stories:write',
};

export const asanaWrite: ConnectorWrite = {
  specs: { creer_tache: creerTache, commenter, modifier_tache: modifierTache },
  minIntervalMs: 1_000,
  granted(config, verb) {
    if (config.authMode !== 'oauth' || typeof config.scope !== 'string') return 'inconnu';
    const wanted = SCOPE_OF[verb];
    return wanted && config.scope.split(/\s+/).includes(wanted) ? 'oui' : 'non';
  },
};
```

Changements : `asana/connector.ts` (existe) gagne `write: asanaWrite` et `scope` dans `ConfigSchema` (`:53-66`) ; `asana/oauth.ts` gagne `'tasks:delete'` dans `scopes` (`:40-48`), à vérifier avant la PR.

## 13. GitHub : les 14 types déplacés

Jalon 1. Le comportement ne change pas, sauf quatre points : le public est lu (dépôt public ou non) et relu juste avant d'écrire (`verify`), cinq types gagnent une annulation, les phrases de refus communes viennent de `propose.ts`, et un refus pour débit rend la ligne à « proposee » (erreur `limite`) au lieu de l'« echec » d'aujourd'hui.

### 13.1 Ce qui va où

| Aujourd'hui (`src/server/discussion/github-actions.ts`, existe) | Après |
|---|---|
| `:48-65` type `Spec`, `spec()` | retirés : `ActionSpec`, `actionSpec` (`src/server/actions/spec.ts`) |
| `:68-72` `ActionFailure` | `src/server/actions/spec.ts` |
| `:76-117` briques des règles (`LOGIN`, `DIGITS`, `oneLine`, `BIDI`, `plain`, `UNSAFE`, `cut`, `safeLine`, `between`, `oneOf`, `list`, `label`, `login`) | les génériques dans `src/server/actions/params.ts` ; `LOGIN`, `DIGITS`, `login` restent à GitHub |
| `:121-152` `RULES` | `src/server/connectors/github/actions.ts`, sous le nom `GITHUB_RULES`, sans `asked` (commun, `registry.ts`) et avec `visibility` |
| `:160-173` `invalidParam`, `validParams` | `src/server/actions/registry.ts` |
| `:177-294` constantes, champs d'entrée, `branchExists`, `defaultBranchOf`, `currentFile` | `src/server/connectors/github/actions.ts`, tels quels |
| `:296-814` `SPECS` (14 entrées) | `src/server/connectors/github/actions.ts`, `githubWrite.specs`, clé : le verbe |
| `:816-886` `PROPOSES`, `notFound`, `actionTools` | `src/server/actions/propose.ts` (`actionTools`, `discussionActionTools`) |
| `:888-945` `HTTP_ERRORS`, `errorCode`, `executeAction`, `decideAction` | `src/server/actions/decide.ts` |
| `:222` `askedOf` | `src/server/actions/params.ts` |

`github-actions.test.ts` (existe) suit `SPECS` et les règles dans `src/server/connectors/github/actions.test.ts` ; `github-actions.db.test.ts` devient `src/server/actions/decide.db.test.ts` (section 16).

### 13.2 L'adaptateur

Les 14 `prepare` ont la forme `(github, repo, input)` et les 14 `execute` la forme `(github, params) => url`. Plutôt que de réécrire leurs corps, deux enveloppes les passent à la forme commune. Le corps de chaque spec ne change pas.

```ts
// src/server/connectors/github/actions.ts (à créer), en tête
import { z } from 'zod';
import { between, label, list, oneLine, oneOf, plain, safeLine, title, yesNo } from '@/server/actions/params';
import {
  ActionFailure,
  type ActionResult,
  type ActionSpec,
  ElsewhereError,
  type LiveConnection,
  type Prepared,
} from '@/server/actions/spec';
import { lineDiff, linesOf } from '@/server/discussion/line-diff'; // sans import : pas de boucle
import type { ConnectorWrite } from '../types';
import { type GithubClient, refPath } from './client';
// Jamais ./connector ni @/server/discussion/github-live : le premier importe ce fichier ; le second importe open.ts,
// qui importe le registre des connecteurs, qui importe ./connector. Tout ce que lisent les règles et les specs
// déplacées vient de ./live, qui n'importe ni l'un ni l'autre.
import { COMMIT_SHA, isBranchName, isRepoPath, liveGithub, REPO_PATTERN } from './live';

// Les écritures GitHub de Leon (lots 7 à 10 de docs/specs/2026-10-26-github-acces-complet.md), déplacées de
// src/server/discussion/github-actions.ts. Règles inchangées : aucune action ne supprime une release, une exécution,
// un artefact ou un cache, ni ne lance ou n'active un workflow.

type Github = GithubClient;

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const DIGITS = /^\d{1,12}$/;

// La table RULES de github-actions.ts:121-152, sans `asked` (commun, registry.ts) et avec `visibility`. Une seule
// différence d'écriture : `title` est une fabrique dans params.ts, donc title() (256, une ligne : la règle
// d'aujourd'hui, github-actions.ts:114). Écrire `title` sans parenthèses ne compile pas (satisfies), et validerait
// tout titre si le typage était contourné.
const GITHUB_RULES = {
  repo: (value) => REPO_PATTERN.test(value),
  branch: isBranchName,
  from: isBranchName,
  head: isBranchName,
  base: isBranchName,
  path: plain(isRepoPath),
  number: (value) => DIGITS.test(value),
  run: (value) => DIGITS.test(value),
  sha: (value) => COMMIT_SHA.test(value),
  state: oneOf('open', 'closed'),
  method: oneOf('merge', 'squash', 'rebase'),
  event: oneOf('APPROVE', 'REQUEST_CHANGES', 'COMMENT'),
  failed: yesNo,
  draft: yesNo,
  reviewers: list(15, (login) => LOGIN.test(login)),
  assignees: list(10, (login) => LOGIN.test(login)),
  labels: list(20, (label) => plain(between(1, 50))(label) && oneLine(label)),
  title: title(),
  name: title(),
  current: title(),
  message: plain(between(1, 2000)),
  body: plain(between(0, 65_536)),
  content: plain(between(0, 200_000)),
  // Le contenu proposé est déjà sans ces caractères : seul le fichier actuel peut en porter, et le diff les montrerait.
  diff: plain(between(0, 200_000)),
  lines: (value) => /^\d{1,9}$/.test(value),
  // « oui » : l'écriture va sur la branche par défaut, sans PR.
  default: yesNo,
  // Lue par prepare (onRepo) : elle fixe le public.
  visibility: oneOf('public', 'private', 'internal'),
} satisfies Record<string, (value: string) => boolean>;
// La forme d'avant : chaque spec reçoit le client et le dépôt tel que GitHub l'écrit.
type RepoSpec<S extends z.ZodObject> = Omit<ActionSpec<S>, 'prepare' | 'execute' | 'undo' | 'audience' | 'rules'> & {
  prepare(github: Github, repo: string, input: z.infer<S>): Promise<Prepared | string>;
  execute(github: Github, params: Prepared): Promise<string | null>;
  // Ce que l'adresse rendue permet de défaire (numéro, identifiant de commentaire), et comment.
  undoOf?(params: Prepared, url: string | null): Record<string, string> | undefined;
  undo?(github: Github, params: Prepared, undo: Record<string, string>): Promise<void>;
  refOf?(params: Prepared, url: string | null): ActionResult['ref'];
};

const NOT_OPEN = (depot: string) =>
  `Le dépôt ${depot} n’est pas ouvert à la connexion GitHub de l’utilisateur. Liste ceux qu’il ouvre avec depots_github.`;

// Trouver le dépôt dans cette connexion (insensible à la casse, comme github-actions.ts:842-844), préparer, puis lire
// sa visibilité : c'est elle qui fixe le public de l'écriture.
function onRepo<S extends z.ZodObject>(item: RepoSpec<S>): ActionSpec {
  const spec: ActionSpec<S> = {
    ...item,
    rules: GITHUB_RULES,
    async prepare(live: LiveConnection, input: z.infer<S>) {
      const depot = (input as { depot: string }).depot;
      if (!REPO_PATTERN.test(depot)) return 'Dépôt invalide : il s’écrit propriétaire/nom.';
      const { github, repos } = liveGithub(live.config, live.http);
      const repo = (await repos()).find((name) => name.toLowerCase() === depot.toLowerCase());
      if (!repo) throw new ElsewhereError(NOT_OPEN(depot));
      const prepared = await item.prepare(github, repo, input);
      if (typeof prepared === 'string') return prepared;
      return { ...prepared, visibility: await github.visibility(repo) };
    },
    // Un dépôt public : tout le monde lit ce qui s'y écrit. Une ligne d'avant, sans visibilité : externe.
    audience: (p) => (p.visibility === 'private' || p.visibility === 'internal' ? 'interne' : 'externe'),
    // Le dépôt est-il devenu public depuis la proposition ? Le public gardé sur la ligne serait trop étroit.
    async verify(live, p) {
      if (p.visibility !== 'private' && p.visibility !== 'internal') return;
      const now = await liveGithub(live.config, live.http).github.visibility(p.repo as string);
      if (now === 'public') throw new ActionFailure('conflit');
    },
    async execute(live, params) {
      const { github } = liveGithub(live.config, live.http);
      const url = await item.execute(github, params);
      return { url, undo: item.undoOf?.(params, url), ref: item.refOf?.(params, url) };
    },
    ...(item.undo
      ? {
          undo: (live: LiveConnection, params: Prepared, undo: Record<string, string>) =>
            item.undo?.(liveGithub(live.config, live.http).github, params, undo) ?? Promise.resolve(),
        }
      : {}),
  };
  return spec as unknown as ActionSpec;
}

// Le numéro et l'identifiant de commentaire, lus dans l'adresse que GitHub rend (html_url).
const numberIn = (url: string | null, kind: 'issues' | 'pull') =>
  url?.match(new RegExp(`/${kind}/(\\d{1,12})(?:$|[#?/])`))?.[1];
const commentIn = (url: string | null) => url?.match(/#issuecomment-(\d{1,20})$/)?.[1];
```

`GITHUB_RULES` est la table `RULES` de `:121-152`, sans `asked`, plus `visibility` : écrite ci-dessus en entier, parce que `title` y change d'écriture (`title()`). Un cas de plus dans `github/actions.test.ts` le garde : `invalidParam('github.commenter', { …, title: '' })` rend `'title'`.

`src/server/connectors/github/live.ts` (à créer) reçoit, tels quels : `liveGithub`, `REPO_PATTERN` et `ConfigSchema` (de `github/connector.ts`) ; `BRANCH_NAME`, `isBranchName`, `COMMIT_SHA` et `isRepoPath` (de `src/server/discussion/github-live.ts:24-40`). Il n'importe que `./client` et `zod`. Les anciens fichiers ré-exportent, pour leurs importeurs d'aujourd'hui (`github-read.ts`, `github-tool.ts`, `depots-equipe.ts`, `src/server/ingest/record-*.ts`, les tests) :

```ts
// src/server/discussion/github-live.ts (existe), à la place des trois définitions
export { COMMIT_SHA, isBranchName, isRepoPath } from '@/server/connectors/github/live';
// src/server/connectors/github/connector.ts (existe) : ConfigSchema (non exporté aujourd'hui, :57) s'importe de ./live
import { ConfigSchema, liveGithub, REPO_PATTERN } from './live';
export { liveGithub, REPO_PATTERN };
```

Sans cela, une seconde boucle reste : `github/actions.ts` → `discussion/github-live.ts` → `connectors/open.ts` (section 6) → `connectors/registry.ts:18` → `github/connector.ts` → `github/actions.ts`. `GITHUB_RULES` est évaluée au chargement du module : selon le premier fichier importé, `isBranchName` y serait en zone morte ou `undefined`.

Deux méthodes de plus dans le client (`src/server/connectors/github/client.ts`, existe, à côté de `defaultBranch`, `:331`), et deux écritures :

```ts
// src/server/connectors/github/client.ts (existe), ajouts dans githubClient
    // La visibilité d'un dépôt : elle fixe le public d'une écriture (dossier agents, 8.2).
    // https://docs.github.com/en/rest/repos/repos#get-a-repository (champs private et visibility, à vérifier)
    visibility: async (repo: string): Promise<'public' | 'private' | 'internal'> => {
      const found = await http.json(
        { url: `${API}/repos/${repo}`, headers },
        z.object({ private: z.boolean(), visibility: z.string().nullish() }),
      );
      if (found.visibility === 'internal') return 'internal';
      return found.private ? 'private' : 'public';
    },
    deleteComment: (repo: string, id: number) =>
      http.text(write('DELETE', `/repos/${repo}/issues/comments/${id}`)),
    removeReviewers: (repo: string, number: number, reviewers: string[]) =>
      http.json(write('DELETE', `/repos/${repo}/pulls/${number}/requested_reviewers`, { reviewers }), UrlSchema),
```

`deleteComment` et `removeReviewers` suivent les chemins de l'API REST de GitHub (à vérifier dans la documentation de l'éditeur : aucune note ne les cite).

### 13.3 Enjeu, public, réversibilité des 14 types

Enjeu fixé par l'architecture (8.2). Public : `interne` sur un dépôt `private` ou `internal`, `externe` sur un dépôt public, pour les 14 types.

| Type | Enjeu | Réversibilité | `undo` | `ref` |
|---|---|---|---|---|
| `github.creer_branche` | bas | annulable | `DELETE /repos/{repo}/git/refs/heads/{branche}` si la branche est toujours sur le commit créé, sinon `conflit` | aucune (une branche n'est pas relevée) |
| `github.supprimer_branche` | haut | irreversible | | |
| `github.ecrire_fichier` | moyen | irreversible (le commit reste dans l'historique) | | |
| `github.supprimer_fichier` | haut | irreversible | | |
| `github.ouvrir_pr` | moyen | compensable | `PATCH /repos/{repo}/pulls/{n}` `{ state: 'closed' }` | `pr:{repo}#{n}` |
| `github.modifier_pr` | moyen | irreversible (l'ancienne description n'est pas gardée) | | |
| `github.fusionner_pr` | haut | irreversible | | |
| `github.commenter` | moyen | annulable | `DELETE /repos/{repo}/issues/comments/{id}` | `issue:` ou `pr:{repo}#{n}`, tour `comment:{id}` |
| `github.demander_revue` | moyen | compensable | `DELETE /repos/{repo}/pulls/{n}/requested_reviewers` | |
| `github.soumettre_revue` | moyen | irreversible | | |
| `github.creer_ticket` | moyen | compensable | `PATCH /repos/{repo}/issues/{n}` `{ state: 'closed' }` | `issue:{repo}#{n}` |
| `github.modifier_ticket` | moyen | irreversible | | |
| `github.relancer_execution` | moyen | irreversible | | |
| `github.annuler_execution` | moyen | irreversible | | |

Une remarque sur l'enjeu « moyen » de `relancer_execution` : la carte l'avertit déjà (« peut exécuter du code et déployer », `rerunWarning`). L'architecture le fixe moyen ; je le garde, et je le signale en section 18 (écart 8).

Les cinq ajouts, dans la déclaration de chaque spec (le reste de leur corps est celui de `:297-337`, `:453-497`, `:586-604`, `:606-626`, `:679-705`) :

```ts
// github.creer_branche : défaire = supprimer la branche, tant qu'elle n'a pas bougé.
  undoOf: (p) => ({ branch: p.branch as string, sha: p.sha as string }),
  async undo(github, p, undo) {
    const now = await github.branchSha(p.repo as string, undo.branch as string).catch(() => null);
    if (now === null) return; // déjà supprimée
    if (now !== undo.sha) throw new ActionFailure('conflit'); // quelqu'un y a poussé un commit
    await github.deleteBranch(p.repo as string, undo.branch as string);
  },

// github.ouvrir_pr : compenser = fermer la PR (les notifications sont parties).
  undoOf: (_p, url) => (numberIn(url, 'pull') ? { number: numberIn(url, 'pull') as string } : undefined),
  refOf: (p, url) => (numberIn(url, 'pull') ? { item: `pr:${p.repo}#${numberIn(url, 'pull')}` } : undefined),
  async undo(github, p, undo) {
    await github.editPull(p.repo as string, Number(undo.number), { state: 'closed' });
  },

// github.commenter : défaire = supprimer le commentaire.
  undoOf: (_p, url) => (commentIn(url) ? { comment: commentIn(url) as string } : undefined),
  refOf: (p, url) => {
    const kind = url?.includes('/pull/') ? 'pr' : 'issue';
    const id = commentIn(url);
    return id ? { item: `${kind}:${p.repo}#${p.number}`, turn: `comment:${id}` } : undefined;
  },
  async undo(github, p, undo) {
    await github.deleteComment(p.repo as string, Number(undo.comment));
  },

// github.demander_revue : compenser = retirer la demande.
  undoOf: (p) => ({ reviewers: p.reviewers as string }),
  async undo(github, p, undo) {
    await github.removeReviewers(p.repo as string, Number(p.number), (undo.reviewers ?? '').split(','));
  },

// github.creer_ticket : compenser = fermer le ticket.
  undoOf: (_p, url) => (numberIn(url, 'issues') ? { number: numberIn(url, 'issues') as string } : undefined),
  refOf: (p, url) => (numberIn(url, 'issues') ? { item: `issue:${p.repo}#${numberIn(url, 'issues')}` } : undefined),
  async undo(github, p, undo) {
    await github.editIssue(p.repo as string, Number(undo.number), { state: 'closed' });
  },
```

Le format de `ref.item` est celui de la relève (`github/map.ts:142-150`, existe : `${pr|issue}:${repo}#${number}`).

L'objet exporté :

```ts
export const githubWrite: ConnectorWrite = {
  specs: {
    creer_branche: onRepo({ verb: 'creer_branche', tool: 'creer_branche_github', risk: 'bas', reversibility: 'annulable', /* … */ }),
    // … les 13 autres, dans l'ordre de SPECS, avec verb, risk et reversibility du tableau 13.3
  },
  minIntervalMs: 1_000,
  // Les droits sont ceux de la GitHub App, réglés dans sa console (applis-oauth.md) : rien dans le jeton.
  granted: () => 'inconnu',
};
```

Et dans `github/connector.ts` (existe, `githubConnector`, `:236`) : `write: githubWrite`. Les deux boucles d'imports (`connector.ts` ↔ `actions.ts`, et celle qui passe par `discussion/github-live.ts` et `open.ts`) sont cassées par `github/live.ts`, ci-dessus. Un test de la PR 7c les garde : `github/actions.test.ts` importe `./actions` en premier et vérifie `invalidParam('github.creer_branche', { …, branch: 'main' })` nul (`isBranchName` chargé).

### 13.4 Les phrases de refus

Trois phrases propres à GitHub deviennent les phrases communes de `propose.ts` :

| Aujourd'hui | Après |
|---|---|
| `NO_CONNECTION` (`github-tool.ts:24`) | `NO_CONNECTION('github')` : « L’utilisateur n’a pas branché son propre GitHub dans Leon (Connexions). Leon n’écrit jamais avec la connexion d’un autre membre. » |
| `missingRight(item.right)` (`github-tool.ts:28`) | `MISSING_RIGHT('github', right)` ; la mention de la console de l'appli se perd. Si on y tient : un `right` plus long dans les 14 specs |
| `notFound(repo)` (`github-actions.ts:818`) | `NOT_FOUND('github')` |

`NO_CONNECTION`, `missingRight`, `refused` et `isRefused` restent dans `github-tool.ts` pour les outils de lecture (`depots_github`, `lire_github`). Les tests qui comparent ces phrases mot pour mot sont listés en section 16.

## 14. Les extraits `vendor-specs` de Jira et d'Asana

Après le jalon 1, dans la PR de chaque outil. Fichiers : `src/test/contracts/extract-vendor-specs.ts` (existe, `PLANS`, `:27-89`), `vendor-specs/jira.json` et `vendor-specs/asana.json` (existent, générés), `vendor-params.test.ts` (existe).

Pourquoi : `testHttp` (`src/test/fake-fetch.ts:99-114`, existe) confronte chaque requête d'un test de connecteur à l'extrait de la spec officielle du fournisseur. Une écriture absente de l'extrait fait échouer le test (« absent de la spec »). Le contrat ne couvre que `jira`, `confluence`, `shortcut`, `asana`, `clickup`, `sentry` (architecture, 7.5) : rien à faire pour Outlook, Gmail, HubSpot, Linear, Notion, Zendesk, GitHub.

Les opérations à ajouter, écrites comme les connecteurs les envoient (« MÉTHODE /chemin/complet ») :

```ts
// src/test/contracts/extract-vendor-specs.ts (existe), dans PLANS
  jira: {
    sources: [`${ATLASSIAN}/jira/platform/swagger-v3.v3.json`],
    operations: [
      'GET /rest/api/3/myself',
      'GET /rest/api/3/search/jql',
      'GET /rest/api/3/issue/{issueIdOrKey}/comment',
      // Écritures (chapitre 05 du dossier agents) : créer, commenter, changer de statut, et ce qui les défait.
      'GET /rest/api/3/project/{projectIdOrKey}',
      'POST /rest/api/3/issue',
      'GET /rest/api/3/issue/{issueIdOrKey}',
      'DELETE /rest/api/3/issue/{issueIdOrKey}',
      'POST /rest/api/3/issue/{issueIdOrKey}/comment',
      'DELETE /rest/api/3/issue/{issueIdOrKey}/comment/{id}',
      'GET /rest/api/3/issue/{issueIdOrKey}/transitions',
      'POST /rest/api/3/issue/{issueIdOrKey}/transitions',
    ],
  },
  // …
  asana: {
    sources: ['https://raw.githubusercontent.com/Asana/openapi/master/defs/asana_oas.yaml'],
    operations: [
      'GET /api/1.0/users/{user_gid}',
      'GET /api/1.0/projects',
      'GET /api/1.0/tasks',
      'GET /api/1.0/tasks/{task_gid}/stories',
      // Écritures (chapitre 05 du dossier agents).
      'POST /api/1.0/tasks',
      'GET /api/1.0/tasks/{task_gid}',
      'PUT /api/1.0/tasks/{task_gid}',
      'DELETE /api/1.0/tasks/{task_gid}',
      'POST /api/1.0/tasks/{task_gid}/stories',
      'DELETE /api/1.0/stories/{story_gid}',
      // Le public : les invités de l'espace de travail (is_guest).
      'GET /api/1.0/workspaces/{workspace_gid}/workspace_memberships',
    ],
  },
```

Puis, sur un poste qui a le réseau (le script lit les specs publiques ; Asana passe par Ruby pour le YAML) :

```bash
NODE_USE_ENV_PROXY=1 node --import tsx src/test/contracts/extract-vendor-specs.ts jira asana
```

Le script s'arrête si une opération n'est dans aucune source : c'est la première vérification des chemins de la section 12 (les noms de variables de chemin, `{id}` du commentaire Jira compris, sont à vérifier à ce moment-là). Les deux fichiers régénérés sont commités dans la même PR.

Ce que l'extrait contrôlera ensuite, et que les specs de la section 12 doivent respecter :

| Requête | Ce qui doit être dans la spec |
|---|---|
| `GET /rest/api/3/issue/{id}?fields=summary,status,project` | le paramètre `fields` |
| `GET /rest/api/3/issue/{id}/comment?orderBy=-created&maxResults=50` | `orderBy` et la valeur `-created` (s'ils sont énumérés), `maxResults` |
| `GET /rest/api/3/search/jql?jql=…&fields=summary&maxResults=1` | déjà dans l'extrait (lecture de la relève) |
| `POST /rest/api/3/issue` | le champ de corps `fields` |
| `POST /rest/api/3/issue/{id}/transitions` | le champ de corps `transition` |
| `POST /api/1.0/tasks?opt_fields=permalink_url` | `opt_fields` et la valeur `permalink_url` ; le champ de corps `data` |
| `GET /api/1.0/tasks/external:leon-…` | rien de plus : la variable de chemin `{task_gid}` prend la valeur |
| `GET /api/1.0/projects?…&opt_fields=name&limit=100` | déjà dans l'extrait (`workspace`, `archived`, `limit`) ; `opt_fields=name` à vérifier |
| `GET /api/1.0/workspaces/{gid}/workspace_memberships?opt_fields=is_guest&limit=100` | `opt_fields`, `limit` ; le champ `is_guest` se vérifie à la lecture de la spec, l'extrait ne contrôle que les paramètres |
| `GET /api/1.0/tasks/{gid}?opt_fields=…,workspace` | la valeur `workspace` d'`opt_fields`, si l'extrait les énumère |
| `GET /rest/api/3/issue/{id}/comment?maxResults=1` | déjà couvert (annulation de `jira.creer_ticket`) |

Un test existant change : `vendor-params.test.ts` (`refuse un chemin ou une méthode que la spec ne décrit pas`) prend aujourd'hui `POST /tasks` comme exemple de méthode absente. Une fois l'extrait régénéré, `POST /tasks` est décrit. L'exemple devient une méthode qu'Asana ne décrit pas sur ce chemin :

```ts
// src/test/contracts/vendor-params.test.ts (existe)
  it('refuse un chemin ou une méthode que la spec ne décrit pas', () => {
    expect(callProblems(asana, get(`${ASANA}/taches`))).toHaveLength(1);
    expect(callProblems(asana, { method: 'PATCH', url: `${ASANA}/tasks` })).toHaveLength(1);
  });
```

## 15. Les clés de texte de la carte d'action

Jalon 1 pour la structure et les trois types du jalon ; chaque PR d'outil ajoute les siens. Fichiers : `messages/fr.json` et `messages/en.json` (existent, bloc `discussionView.action`, `:515-600` environ), `src/components/discussion/action-card.tsx` (existe). Le chapitre 07 dessine l'écran `/agents/a-valider` ; ce chapitre fixe les clés que la carte lit, pour qu'aucune PR d'outil n'ait à toucher la carte.

### 15.1 Ce qui change dans la structure

| Clé (sous `discussionView.action`) | Aujourd'hui | Après |
|---|---|---|
| `kinds.<verbe>` | 14 phrases, à plat | `kinds.<outil>.<verbe>` : deux outils ont le même verbe (`creer_ticket`) |
| `confirm.<verbe>` | 14 libellés | `confirm.<outil>.<verbe>` |
| `details.<clé>` | 17 clés de paramètres | plus les clés montrées des outils nouveaux (ci-dessous) |
| `values.<valeur>` | 11 valeurs | plus `soi`, `interne`, `externe` du public, les statuts traduits |
| `open` | « Voir sur GitHub » | `open` reste pour GitHub ; `openIn` : « Voir dans {tool} » |
| `errors.limite` | | nouveau |
| `sendWarning`, `risk.*`, `audience.*`, `irreversible`, `undo`, `undoing`, `undoFailed`, `byAgent` | | nouveaux |
| `undone` | | posé par la PR de 0080 (chapitre 01, 15.5) |

`next-intl` lit une clé à points comme un chemin : `t(\`kinds.${actionProvider(kind)}.${actionVerb(kind)}\`, params)`. La carte remplace `actionName(kind)` (`action-card.tsx:46`) par ces deux appels ; `src/test/contracts/translation-keys.test.ts` (existe) compare les clés de `fr.json` et `en.json` et leurs usages : les deux fichiers changent dans la même PR.

### 15.2 `messages/fr.json`

Les 14 phrases GitHub de `:517-548` passent sous `kinds.github` et `confirm.github`, à l'identique. Les nouvelles :

```json
      "kinds": {
        "github": { "…": "les 14 phrases de :518-531, inchangées" },
        "outlook": {
          "creer_brouillon": "Préparer dans Outlook un brouillon de réponse à « {subject} ».",
          "classer": "Classer le fil « {subject} » dans Outlook.",
          "envoyer": "Envoyer depuis Outlook une réponse à « {subject} » à {to}.",
          "bloquer_creneau": "Bloquer « {title} » dans votre agenda Outlook, du {start} au {end}.",
          "creer_evenement": "Créer « {title} » le {start} et inviter {attendees}."
        },
        "gmail": {
          "creer_brouillon": "Préparer dans Gmail un brouillon de réponse à « {subject} ».",
          "classer": "Classer le fil « {subject} » dans Gmail.",
          "envoyer": "Envoyer depuis Gmail une réponse à « {subject} » à {to}."
        },
        "hubspot": {
          "creer_note": "Ajouter une note sur la fiche HubSpot « {record_name} ».",
          "creer_tache": "Créer la tâche « {title} » sur la fiche HubSpot « {record_name} ».",
          "creer_contact": "Créer la fiche HubSpot du contact {email}.",
          "creer_affaire": "Créer l’affaire HubSpot « {dealname} » à l’étape « {stage_name} ».",
          "modifier_fiche": "Changer « {property} » sur la fiche HubSpot « {record_name} »."
        },
        "linear": {
          "creer_ticket": "Créer le ticket « {title} » dans l’équipe Linear {team_key}.",
          "commenter": "Commenter le ticket Linear {identifier}.",
          "modifier_ticket": "Modifier le ticket Linear {identifier}."
        },
        "notion": {
          "creer_page": "Créer la page Notion « {title} » sous « {parent_title} ».",
          "commenter": "Commenter la page Notion « {page_title} ».",
          "modifier_page": "Ajouter un texte à la fin de la page Notion « {page_title} »."
        },
        "zendesk": {
          "ajouter_note_interne": "Ajouter une note interne au ticket Zendesk #{ticket_id}.",
          "modifier_ticket": "Modifier le ticket Zendesk #{ticket_id}.",
          "repondre": "Répondre au client {requester} sur le ticket Zendesk #{ticket_id}."
        },
        "jira": {
          "creer_ticket": "Créer le ticket Jira « {summary} » dans {project_key}.",
          "commenter": "Commenter le ticket Jira {issue_key}.",
          "changer_statut": "Faire passer le ticket Jira {issue_key} à « {status_name} »."
        },
        "asana": {
          "creer_tache": "Créer la tâche Asana « {title} » dans « {project_name} ».",
          "commenter": "Commenter la tâche Asana « {task_name} ».",
          "modifier_tache": "Modifier la tâche Asana « {task_name} »."
        }
      },
      "confirm": {
        "github": { "…": "les 14 libellés de :534-547, inchangés" },
        "outlook": {
          "creer_brouillon": "Préparer le brouillon",
          "classer": "Classer",
          "envoyer": "Envoyer",
          "bloquer_creneau": "Bloquer le créneau",
          "creer_evenement": "Créer et inviter"
        },
        "gmail": { "creer_brouillon": "Préparer le brouillon", "classer": "Classer", "envoyer": "Envoyer" },
        "hubspot": {
          "creer_note": "Ajouter la note",
          "creer_tache": "Créer la tâche",
          "creer_contact": "Créer le contact",
          "creer_affaire": "Créer l’affaire",
          "modifier_fiche": "Modifier la fiche"
        },
        "linear": { "creer_ticket": "Créer le ticket", "commenter": "Commenter", "modifier_ticket": "Modifier le ticket" },
        "notion": { "creer_page": "Créer la page", "commenter": "Commenter", "modifier_page": "Ajouter le texte" },
        "zendesk": {
          "ajouter_note_interne": "Ajouter la note",
          "modifier_ticket": "Modifier le ticket",
          "repondre": "Répondre au client"
        },
        "jira": { "creer_ticket": "Créer le ticket", "commenter": "Commenter", "changer_statut": "Changer le statut" },
        "asana": { "creer_tache": "Créer la tâche", "commenter": "Commenter", "modifier_tache": "Modifier la tâche" }
      },
```

Dans `details`, après les clés existantes (`:549-568`), celles que la carte montre en ligne (les identifiants techniques, `thread`, `message`, `record_id`, `issue_id`…, ne le sont pas) :

```json
        "subject": "Objet",
        "sender": "Réponse à",
        "to": "À",
        "cc": "Copie",
        "all": "Répondre à tous",
        "archive": "Archiver",
        "category": "Catégorie",
        "label_name": "Libellé",
        "start": "Début",
        "end": "Fin",
        "timezone": "Fuseau",
        "attendees": "Invités",
        "online": "Réunion Teams",
        "record_name": "Fiche",
        "due": "Échéance",
        "email": "Courriel",
        "stage_name": "Étape",
        "amount": "Montant",
        "property": "Champ",
        "value": "Nouvelle valeur",
        "before": "Valeur actuelle",
        "team_name": "Équipe",
        "priority": "Priorité",
        "state_name": "Nouvel état",
        "before_state_name": "État actuel",
        "parent_title": "Sous la page",
        "page_title": "Page",
        "status": "Nouveau statut",
        "before_status": "Statut actuel",
        "add_tags": "Étiquettes ajoutées",
        "remove_tags": "Étiquettes retirées",
        "requester": "Client",
        "summary": "Titre",
        "issuetype_name": "Type",
        "status_name": "Nouveau statut",
        "before_status_name": "Statut actuel",
        "project_name": "Projet",
        "notes": "Description",
        "due_on": "Échéance",
        "completed": "Terminée",
        "description": "Description"
```

Et, au niveau de `action` :

```json
      "openIn": "Voir dans {tool}",
      "byAgent": "Proposée par un agent",
      "sendWarning": "Part tout de suite chez le destinataire et ne se rappelle pas.",
      "irreversible": "Ne s’annule pas une fois fait.",
      "undo": "Annuler",
      "undoing": "Annulation…",
      "undoFailed": "L’annulation n’a pas pu se faire : {error}",
      "risk": { "bas": "Enjeu bas", "moyen": "Enjeu moyen", "haut": "Enjeu haut" },
      "audience": {
        "soi": "Reste chez vous",
        "interne": "Lu par vos collègues",
        "externe": "Lu hors de la société"
      },
```

Et dans `errors` (`:595` et suivantes) :

```json
        "limite": "L’outil demande d’attendre : rien n’a été fait. Réessayez dans un moment."
```

Le DETAILS de la carte (`action-card.tsx:18-35`) gagne ces clés, dans cet ordre. Les clés `body` (bloc) et `diff` gardent leur bloc ; `notes`, `text` et `description` s'affichent comme `body`, en bloc (constante `BLOCKS` de la carte : `['body', 'notes', 'text', 'description']`).

### 15.3 `messages/en.json`

Mêmes clés, en anglais. Les phrases :

```json
      "kinds": {
        "github": { "…": "unchanged" },
        "outlook": {
          "creer_brouillon": "Draft a reply to “{subject}” in Outlook.",
          "classer": "File the thread “{subject}” in Outlook.",
          "envoyer": "Send a reply to “{subject}” to {to} from Outlook.",
          "bloquer_creneau": "Block “{title}” in your Outlook calendar, {start} to {end}.",
          "creer_evenement": "Create “{title}” on {start} and invite {attendees}."
        },
        "gmail": {
          "creer_brouillon": "Draft a reply to “{subject}” in Gmail.",
          "classer": "File the thread “{subject}” in Gmail.",
          "envoyer": "Send a reply to “{subject}” to {to} from Gmail."
        },
        "hubspot": {
          "creer_note": "Add a note to the HubSpot record “{record_name}”.",
          "creer_tache": "Create the task “{title}” on the HubSpot record “{record_name}”.",
          "creer_contact": "Create the HubSpot contact {email}.",
          "creer_affaire": "Create the HubSpot deal “{dealname}” at stage “{stage_name}”.",
          "modifier_fiche": "Change “{property}” on the HubSpot record “{record_name}”."
        },
        "linear": {
          "creer_ticket": "Create the issue “{title}” in the Linear team {team_key}.",
          "commenter": "Comment on the Linear issue {identifier}.",
          "modifier_ticket": "Update the Linear issue {identifier}."
        },
        "notion": {
          "creer_page": "Create the Notion page “{title}” under “{parent_title}”.",
          "commenter": "Comment on the Notion page “{page_title}”.",
          "modifier_page": "Append text to the Notion page “{page_title}”."
        },
        "zendesk": {
          "ajouter_note_interne": "Add an internal note to Zendesk ticket #{ticket_id}.",
          "modifier_ticket": "Update Zendesk ticket #{ticket_id}.",
          "repondre": "Reply to the customer {requester} on Zendesk ticket #{ticket_id}."
        },
        "jira": {
          "creer_ticket": "Create the Jira issue “{summary}” in {project_key}.",
          "commenter": "Comment on the Jira issue {issue_key}.",
          "changer_statut": "Move the Jira issue {issue_key} to “{status_name}”."
        },
        "asana": {
          "creer_tache": "Create the Asana task “{title}” in “{project_name}”.",
          "commenter": "Comment on the Asana task “{task_name}”.",
          "modifier_tache": "Update the Asana task “{task_name}”."
        }
      },
```

Les libellés de `confirm`, `details`, `risk`, `audience` et les autres suivent la même liste de clés ; leur texte anglais s'écrit dans la PR (« Prepare draft », « Add note », « Stays with you », « Read by your colleagues », « Read outside the company », « Does not undo once done », `errors.limite` : « The tool asks to wait: nothing was done. Try again in a moment. »).

### 15.4 La carte (esquisse ; l'écran est au chapitre 07)

```tsx
// src/components/discussion/action-card.tsx (existe), ce qui touche aux clés
const provider = actionProvider(kind);
const verb = actionVerb(kind);
const sentence = t(`kinds.${provider}.${verb}`, params);
const confirmLabel = t(`confirm.${provider}.${verb}`);
// L'icône par outil (aujourd'hui GitBranch en dur, :3, :91, :139) : une table { github: GitBranch, outlook: Mail, … }.
// Avant le clic : t(`risk.${view.risk}`), t(`audience.${view.audience}`), et t('irreversible') quand l'action ne
// s'annule pas (view.undoable ne le dit qu'une fois faite : la carte lit la réversibilité dans une table du
// navigateur, ACTION_UNDOABLE_KINDS, ou le serveur ajoute `reversibility` à la vue : choix laissé au chapitre 07).
// Après : bouton t('undo') si view.undoable ; t('undoFailed', { error: t(`errors.${view.undoError}`) }) si undoError.
// Lien : view.kind commence par 'github.' ? t('open') : t('openIn', { tool: PROVIDER_LABELS[provider] }).
```

`PROVIDER_LABELS` (`src/lib/providers.ts:34`, existe) est importable par le navigateur.

## 16. Tests à écrire

### 16.1 La liste

`x.test.ts` sans base, `x.db.test.ts` avec base (architecture, 9.9). Aucun test n'appelle un vrai service : `fakeFetch` et `testHttp` (`src/test/fake-fetch.ts`, existe).

| Fichier | Base | Ce qu'il prouve | Jalon |
|---|---|---|---|
| `src/server/actions/registry.test.ts` (à créer) | non | `ACTION_KINDS` et le registre ont les mêmes clés ; une spec annulable ou compensable a un `undo` ; une spec `irreversible` n'est jamais `bas` ; chaque clé d'`ACTION_KEYS` a une règle ; noms d'outils uniques, `^[a-z0-9_]{1,64}$`, finissant par `_<outil>` ; le public de chaque type sur sa cible la plus large ; une spec à `recipients` a `interne` dans ses clés, et inversement ; chaque clé de `textKeys` est une clé de `spec.input` ; l'entrée du décideur (`deciderInput`) n'a ni clé de `textKeys` ni clé de destinataire ; `ACTION_CAPABILITY_NAMES` égale les clés d'`ACTION_CAPABILITIES`, qui ne citent que des types du registre ; `invalidParam` refuse une clé inconnue, une clé manquante, une valeur hors règle | 1 |
| `src/server/actions/params.test.ts` (à créer) | non | `refOf` (objet, élément, nu, refus de `/`, `?`, espace) ; `uuidFrom` (forme v4, stable) ; `textToHtml` (échappe, paragraphes) ; `markerOf`, `hasMarker` ; `text` refuse un contrôle (`\r`, `\u0007`) et le format invisible, accepte `\n` et `\t` ; `oneLine('a\u2028b')` est faux et `oneLine('a b')` vrai (une copie du fichier avec le séparateur en clair ne compilerait pas : ce cas la trahit aussi) ; `title()` est une fabrique (`title()('')` faux, `title(5)('abcdef')` faux) | 1 |
| `src/lib/actions.test.ts` (existe, à étendre) | non | `actionProvider`, `actionVerb` ; `parseActionView` : défauts prudents, `expiresAt`, `undoError`, `content` jamais envoyé | 1 |
| `src/server/connectors/http.test.ts` (existe) | non | une écriture `once` refusée pour débit lève `ConnectorRateLimitError` avec le délai de `Retry-After` (non plafonné à 60 s), `x-ratelimit-reset`, ou 60 s ; un 503 `once` reste `ConnectorHttpError` ; une lecture 429 se reprend comme avant | 1 |
| `src/server/connectors/oauth.test.ts` (existe) | non (faux `connections`) | verrou pris : renouvelle, enregistre, rend le verrou ; verrou perdu : attend et rend les jetons de l'autre ; verrou perdu dix secondes : `TokenRenewalBusyError` ; jeton déjà changé sous le verrou : rien n'est renouvelé ; échec du renouvellement : le verrou est rendu | 1 |
| `src/server/connectors/connections.db.test.ts` (existe) | oui | `takeRenewLock` deux fois : vrai puis faux ; après une minute (verrou daté à la main), vrai ; la connexion d'un autre : faux ; `readMyConfig` rend les secrets de la sienne, null pour celle d'un autre | 1 |
| `src/server/connectors/open.db.test.ts` (à créer) | oui | la sienne seulement ; une connexion en pause : null ; `connectionId` d'un autre : null ; configuration refusée par le schéma : null, sans la configuration dans le journal | 1 |
| `src/server/connectors/pace.db.test.ts` (à créer) | oui | pas de 2 000 ms : `go`, puis `go` après 2 s d'attente sur place (faux `sleep`) ; pas de 10 000 ms : `later` ; `delayWriteSlot(30 000)` repousse le suivant ; la connexion d'un autre : `ActionFailure('connexion')` | 1 |
| `src/server/actions/store.test.ts` (déplacé de `proposed-actions.test.ts`) | non | les cas d'aujourd'hui, plus : une action d'agent à J+2 reste « proposee » (architecture, 8.2) ; à J+8, « expiree » ; une action de discussion à 1 h 01, « expiree » ; `undoable` : faite, réversible, annulation présente ; faux si irréversible, si défaite en cours depuis moins de 5 minutes | 1 |
| `src/server/actions/store.db.test.ts` (à créer) | oui | `proposeAction` deux fois avec la même clé : une ligne, `created` faux la seconde ; `claimAction` refuse une simulation, une action expirée ; `releaseAction` ; `claimUndo` une seule fois ; `failUndo` garde `faite` et écrit `undoError` ; `listPendingActions` ne rend ni les simulations, ni les actions de discussion, ni celles d'un autre | 1 |
| `src/server/actions/propose.db.test.ts` (à créer) | oui | `prepareAndPropose` (par `actionTools`) écrit l'enjeu et le public de la spec ; `runActions.prepare` puis `runActions.proposeFromRun` rejoué : une ligne ; `connexion` retirée des paramètres écrits, une connexion qui n'est plus à la personne lève `StepFailure('connexion')` ; la mention dans `body`, la marque seulement si le public n'est pas externe ; une entrée à clé de destinataire hors de `allowedRecipients` : refus avant toute lecture chez l'outil ; une « réponse à tous » vers une copie qui n'a jamais écrit passe (lue par `prepare`, pas recontrôlée) ; deux connexions Outlook, le fil dans la seconde : préparé sur la seconde ; la connexion de la source essayée d'abord ; un `TokenRenewalBusyError` : `RetryLater(10 000)` par le port, la phrase fixe par la discussion ; `interne` posé d'après les domaines ; au cran `propose`, la ligne reste « proposee » et rien n'est appelé chez l'outil ; une simulation n'est jamais exécutée ; un refus pour débit en autonomie : la ligne revient à « proposee » et `proposeFromRun` lève `RetryLater` | 1 |
| `src/server/actions/decide.db.test.ts` (déplacé de `src/server/discussion/github-actions.db.test.ts`, 1 118 lignes) | oui | tous les cas d'aujourd'hui, avec leurs assertions à la PR 7c ; seules les routes changent : un `GET /repos/{repo}` de plus là où l'action passe par `prepare` (la visibilité lue) puis par `verify` (relue), aucun pour une ligne écrite directement sans `visibility` (un second clic ne réécrit pas, l'action d'un autre est invisible, une ligne altérée n'écrit rien, une annulée ne se confirme plus, l'expiration, `incertain` sans rejeu, un 400 de GitHub reste `echec` (`:1081-1090`), le placement sous la bonne réponse) ; plus : 429 au clic → « proposee », erreur `limite`, rien d'autre écrit ; `verify` qui lève `conflit` (dépôt devenu public) → `echouee`, `conflit`, aucune écriture ; une panne pendant `verify` → `echec`, jamais `incertain` ; action d'agent d'équipe dont l'activateur n'est plus administrateur → `droits` ; activation supprimée (exécution sans activation), activateur plus administrateur → `droits` ; exécution supprimée → `droits` sauf administrateur ; activation coupée (`actif` faux) → `droits` ; `autoExecute` rappelle `needsClick` ; `undoAction` : `defaite`, double clic sans double appel, échec → `undoError` ; `resumeAction` : trouvée → `faite`, absente sûre → réécrite, `incertain` sinon. À la PR 8e (Jira), quand `400: 'refus'` entre dans `HTTP_ERRORS` : l'assertion de `:1081-1090` devient `{ status: 'echouee', result: { error: 'refus' } }` et son titre « un refus net de l’outil est un refus, pas un doute » | 1 (`decideAction`), après (le reste) |
| `src/server/connectors/github/actions.test.ts` (déplacé de `github-actions.test.ts`) | non | importe `./actions` en premier (boucle d'imports : `isBranchName` chargé) ; les règles et `SPECS` d'aujourd'hui ; `invalidParam('github.commenter', { …, title: '' })` rend `'title'` ; `visibility` lue et public calculé ; `verify` : dépôt privé devenu public → `conflit` ; les cinq `undo` (requête exacte) ; `refOf` lit `/pull/`, `/issues/`, `#issuecomment-` | 1 |
| `src/server/connectors/hubspot/actions.test.ts` (à créer) | non | requêtes exactes de `creer_note` et `creer_tache` (méthode, adresse `/crm/v3/objects/…`, corps, `once`) ; numéros d'association relus sur un compte de développement avant la PR ; `ref` = `note:<id>` ; `findExisting` lève `incertain` quand la recherche est vide, et sans chercher quand la marque n'est pas dans le texte ; `undo` par `DELETE` et `http.text`, 404 accepté ; aucune fiche → `ElsewhereError`, phrase sans texte de l'outil | 1 (les deux), après (les trois autres : `modifier_fiche` refuse d'annuler par-dessus une valeur changée) |
| `src/server/connectors/outlook/actions.test.ts` (à créer) | non | `creer_brouillon` : `createReply` puis `PATCH`, rien d'autre ; échec du `PATCH` → `DELETE` du brouillon vide ; `PATCH` refusé pour débit après `createReply` → `ActionFailure('incertain')`, pas `ConnectorRateLimitError` ; le dernier message lu sur deux pages (`@odata.nextLink`) ; `verify` : un message de plus dans le fil → `conflit` ; `undo` refuse un message envoyé (`isDraft: false` → `conflit`) et dit `introuvable` sur 404 ; `granted` : jamais `Mail.Send` sans scope | 1 (`creer_brouillon`), après (`classer` : 429 au 2e message → `incertain` ; l'annulation ne retire que la catégorie posée) |
| `src/server/connectors/{gmail,linear,notion,zendesk,jira,asana}/actions.test.ts` (à créer) | non | par spec : la requête exacte de `execute`, la lecture de `prepare` qui fixe le public, `verify`, `findExisting` (absence sûre ou `incertain`), `undo` et son refus par-dessus un collègue (`conflit`) ; Gmail : `References` replié sur deux lignes rendu sur une, une valeur `<a@x>\n<b@y>` refusée par la règle ; Zendesk : `modifier_ticket` défait par `remove_tags` / `additional_tags`, jamais `tags` ; pour Jira et Asana, `testHttp` contrôle aussi l'extrait `vendor-specs` | après |
| `src/test/contracts/vendor-params.test.ts` (existe) | non | l'exemple `POST /tasks` devient `PATCH /tasks` (section 14) | après |

### 16.2 `registry.test.ts`

```ts
// src/server/actions/registry.test.ts
import { describe, expect, it } from 'vitest';
import { ACTION_KEYS, ACTION_KINDS, type ActionKind, actionProvider } from '@/lib/actions';
import { type Audience, isRecipientKey } from '@/lib/agents';
import { ACTION_CAPABILITIES, ACTION_CAPABILITY_NAMES } from './capabilities';
import { deciderInput, invalidParam, registeredKinds, specOf } from './registry';

// Le registre des actions : ce que chaque connecteur déclare doit être exactement ce que la page connaît, et chaque
// spec dit qui lira son écriture sur sa cible la plus large (dossier agents, 8.2).

// Les paramètres qui donnent le public le plus large de chaque type, et ce public. Un type nouveau sans ligne ici fait
// échouer le test : il faut dire, en le relisant, qui lira son écriture.
const WIDEST: Record<ActionKind, [Record<string, string>, Audience]> = {
  ...(Object.fromEntries(
    ACTION_KINDS.filter((kind) => kind.startsWith('github.')).map((kind) => [kind, [{ visibility: 'public' }, 'externe']]),
  ) as Record<ActionKind, [Record<string, string>, Audience]>),
  'outlook.creer_brouillon': [{}, 'soi'],
  'outlook.classer': [{}, 'soi'],
  'outlook.envoyer': [{ interne: 'non' }, 'externe'],
  'outlook.bloquer_creneau': [{}, 'soi'],
  'outlook.creer_evenement': [{ interne: 'non' }, 'externe'],
  'gmail.creer_brouillon': [{}, 'soi'],
  'gmail.classer': [{}, 'soi'],
  'gmail.envoyer': [{ interne: 'non' }, 'externe'],
  'hubspot.creer_note': [{}, 'interne'],
  'hubspot.creer_tache': [{}, 'interne'],
  'hubspot.creer_contact': [{}, 'interne'],
  'hubspot.creer_affaire': [{}, 'interne'],
  'hubspot.modifier_fiche': [{}, 'interne'],
  'linear.creer_ticket': [{ guests: 'oui' }, 'externe'],
  'linear.commenter': [{ guests: 'oui' }, 'externe'],
  'linear.modifier_ticket': [{ guests: 'oui' }, 'externe'],
  'notion.creer_page': [{}, 'externe'],
  'notion.commenter': [{}, 'externe'],
  'notion.modifier_page': [{}, 'externe'],
  'zendesk.ajouter_note_interne': [{}, 'interne'],
  'zendesk.modifier_ticket': [{ add_tags: 'vip' }, 'externe'],
  'zendesk.repondre': [{}, 'externe'],
  'jira.creer_ticket': [{ project_type: 'inconnu' }, 'externe'],
  'jira.commenter': [{ project_type: 'service_desk' }, 'externe'],
  'jira.changer_statut': [{ project_type: 'inconnu' }, 'externe'],
  'asana.creer_tache': [{ guests: 'oui' }, 'externe'],
  'asana.commenter': [{ guests: 'oui' }, 'externe'],
  'asana.modifier_tache': [{ guests: 'oui' }, 'externe'],
};

const spec = (kind: ActionKind) => {
  const found = specOf(kind);
  if (!found) throw new Error(`spec absente : ${kind}`);
  return found;
};

describe('le registre des actions', () => {
  it('a exactement les types de ACTION_KINDS', () => {
    expect([...registeredKinds()].sort()).toEqual([...ACTION_KINDS].sort());
  });

  it.each(ACTION_KINDS)('%s : une annulation si la spec est réversible', (kind) => {
    const { reversibility, undo } = spec(kind);
    expect(reversibility === 'irreversible' || typeof undo === 'function').toBe(true);
  });

  // « bas : se défait, ne notifie personne » (architecture, 8.1) : une écriture qui ne se défait pas n'est pas basse.
  it.each(ACTION_KINDS)('%s : jamais irréversible et d’enjeu bas', (kind) => {
    const { reversibility, risk } = spec(kind);
    expect(reversibility === 'irreversible' && risk === 'bas').toBe(false);
  });

  it.each(ACTION_KINDS)('%s : le décideur ne voit ni texte libre ni destinataire', (kind) => {
    const { textKeys = [], input } = spec(kind);
    expect(textKeys.filter((key) => !(key in input.shape))).toEqual([]);
    const seen = Object.keys(deciderInput(spec(kind)).shape);
    expect(seen.filter((key) => textKeys.includes(key) || isRecipientKey(key))).toEqual([]);
  });

  it.each(ACTION_KINDS)('%s : une règle par clé de paramètre', (kind) => {
    const { required, optional } = ACTION_KEYS[kind];
    const rules = { ...spec(kind).rules, asked: () => true };
    expect([...required, ...optional].filter((key) => !(key in rules))).toEqual([]);
  });

  it.each(ACTION_KINDS)('%s : le public sur la cible la plus large', (kind) => {
    const [params, audience] = WIDEST[kind];
    expect(spec(kind).audience(params)).toBe(audience);
    // Sans rien de lu, jamais plus étroit que la cible la plus large.
    if (audience === 'externe') expect(spec(kind).audience({})).toBe('externe');
  });

  it.each(ACTION_KINDS)('%s : des destinataires si et seulement si le public en dépend', (kind) => {
    expect(typeof spec(kind).recipients === 'function' && kind !== 'zendesk.repondre').toBe(
      ACTION_KEYS[kind].required.includes('interne'),
    );
  });

  it('des noms d’outil uniques, lisibles par l’API du modèle, propres à chaque outil', () => {
    const tools = ACTION_KINDS.map((kind) => spec(kind).tool);
    expect(new Set(tools).size).toBe(tools.length);
    for (const kind of ACTION_KINDS) {
      expect(spec(kind).tool).toMatch(/^[a-z0-9_]{1,64}$/);
      expect(spec(kind).tool.endsWith(`_${actionProvider(kind)}`)).toBe(true);
    }
  });

  it('refuse une clé inconnue, une clé manquante, une valeur hors règle', () => {
    const note = { record_type: 'contacts', record_id: '123', record_name: 'Mme Martin', body: 'Texte' };
    expect(invalidParam('hubspot.creer_note', note)).toBeNull();
    expect(invalidParam('hubspot.creer_note', { ...note, autre: 'x' })).toBe('autre');
    expect(invalidParam('hubspot.creer_note', { ...note, record_id: undefined })).toBe('record_id');
    expect(invalidParam('hubspot.creer_note', { ...note, record_type: 'tickets' })).toBe('record_type');
    expect(invalidParam('hubspot.creer_note', { ...note, body: 'a\u202Eb' })).toBe('body');
    expect(invalidParam('hubspot.creer_note', { ...note, body: 'a\rb' })).toBe('body');
    expect(invalidParam('hubspot.creer_note', { ...note, body: 'a\n\tb' })).toBeNull();
  });
});

describe('les capacités', () => {
  it('ont la même liste en tuple et en clés, et ne citent que des types du registre', () => {
    expect([...ACTION_CAPABILITY_NAMES].sort()).toEqual(Object.keys(ACTION_CAPABILITIES).sort());
    for (const kinds of Object.values(ACTION_CAPABILITIES)) {
      for (const kind of kinds) expect(specOf(kind)).not.toBeNull();
    }
  });
});
```

`invalidParam(…, { record_id: undefined })` : `Object.hasOwn` voit la clé, `typeof value !== 'string'` la refuse, comme aujourd'hui (`github-actions.ts:165-169`).

### 16.3 `http.test.ts` : le refus pour débit d'une écriture

```ts
// src/server/connectors/http.test.ts (existe), à côté de « n’envoie qu’une fois une écriture `once` »
import { ConnectorAuthError, type ConnectorHttp, ConnectorRateLimitError, createConnectorHttp } from './http';

  it('lève ConnectorRateLimitError sur une écriture refusée pour débit, avec le délai demandé', async () => {
    const write = { url: URL_A, method: 'POST', body: { a: 1 }, once: true } as const;
    const twoMinutes = setup([failing(429, { method: 'POST', headers: { 'retry-after': '120' } })]);
    const github = setup([
      failing(403, { method: 'POST', headers: { 'x-ratelimit-remaining': '0', 'retry-after': '30' } }),
    ]);
    const silent = setup([failing(429, { method: 'POST' })]);

    await expect(twoMinutes.http.json(write, ANY)).rejects.toMatchObject({
      name: 'ConnectorRateLimitError',
      status: 429,
      retryAfterMs: 120_000, // pas plafonné à WAIT_MAX_MS (60 s)
    });
    await expect(github.http.json(write, ANY)).rejects.toMatchObject({ status: 403, retryAfterMs: 30_000 });
    await expect(silent.http.json(write, ANY)).rejects.toMatchObject({ retryAfterMs: 60_000 });
    expect([twoMinutes.calls.length, github.calls.length, silent.calls.length]).toEqual([1, 1, 1]);
  });

  it('garde ConnectorHttpError pour une écriture en panne : elle a peut-être abouti', async () => {
    const write = { url: URL_A, method: 'POST', body: {}, once: true } as const;
    const broken = setup([failing(503, { method: 'POST' })]);

    const error = await broken.http.json(write, ANY).catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(ConnectorRateLimitError);
    expect(error).toMatchObject({ status: 503 });
  });
```

`failing` et `ok` sont les aides du fichier existant (le premier test `once`, `:299-322`, les emploie).

### 16.4 `store.test.ts` : l'expiration lue dans `expire_le`

```ts
// src/server/actions/store.test.ts (déplacé de src/server/discussion/proposed-actions.test.ts)
import { describe, expect, it } from 'vitest';
import { ACTION_PENDING_MS, ACTION_RUNNING_MS, ACTION_VALID_MS } from '@/lib/actions';
import { type ActionRow, toView } from './store';

const ago = (ms: number) => new Date(Date.now() - ms);
const later = (ms: number) => new Date(Date.now() + ms);
const DAY = 24 * 60 * 60 * 1000;

// Les colonnes de 0080 avec les défauts du schéma, plus ce que chaque cas change.
const row = (extra: Partial<ActionRow>) =>
  ({
    id: 'a1',
    tenantId: 't1',
    userId: 'u1',
    discussionId: null,
    connectionId: 'c1',
    kind: 'hubspot.creer_note',
    params: { record_type: 'contacts', record_id: '123', record_name: 'Mme Martin', body: 'Texte' },
    status: 'proposee',
    result: null,
    acl: ['u1'],
    createdAt: ago(0),
    decidedAt: null,
    origine: 'agent',
    executionId: 'e1',
    etapeRang: 4,
    enjeu: 'bas',
    audience: 'interne',
    texteLibre: false,
    contenuExterne: true,
    donneesPrivees: false,
    simulation: false,
    cleIdempotence: 'f'.repeat(64),
    expireLe: later(ACTION_PENDING_MS),
    decidePar: null,
    annulation: null,
    defaiteLe: null,
    ...extra,
  }) as ActionRow;

describe('toView et expire_le', () => {
  it('garde « proposee » une action d’agent à J+2 (valable 7 jours)', () => {
    const view = toView(row({ createdAt: ago(2 * DAY), expireLe: later(5 * DAY) }));
    expect(view).toMatchObject({ status: 'proposee', origin: 'agent', risk: 'bas', audience: 'interne' });
    expect(Date.parse(view?.expiresAt ?? '')).toBeGreaterThan(Date.now() + 4 * DAY);
  });

  it('montre « expiree » une action d’agent à J+8', () => {
    expect(toView(row({ createdAt: ago(8 * DAY), expireLe: ago(DAY) }))?.status).toBe('expiree');
  });

  it('montre « expiree » une proposition de discussion d’il y a une heure et une minute', () => {
    const view = toView(
      row({ origine: 'discussion', createdAt: ago(ACTION_VALID_MS + 60_000), expireLe: ago(60_000) }),
    );
    expect(view?.status).toBe('expiree');
  });

  it('propose « Annuler » sur une action faite et annulable, pas pendant une annulation en cours', () => {
    const done = { status: 'faite' as const, annulation: { note: '987' } };
    expect(toView(row(done))?.undoable).toBe(true);
    expect(toView(row({ ...done, defaiteLe: ago(60_000) }))?.undoable).toBe(false);
    expect(toView(row({ ...done, defaiteLe: ago(ACTION_RUNNING_MS + 1000) }))?.undoable).toBe(true);
    expect(toView(row({ ...done, kind: 'zendesk.ajouter_note_interne' }))?.undoable).toBe(false);
  });
});
```

### 16.5 `hubspot/actions.test.ts` : les requêtes exactes du jalon 1

```ts
// src/server/connectors/hubspot/actions.test.ts
import { describe, expect, it } from 'vitest';
import { markerOf } from '@/server/actions/params';
import type { LiveConnection } from '@/server/actions/spec';
import { testHttp } from '@/test/fake-fetch';
import { hubspotWrite } from './actions';
import { hubspotConnector } from './connector';

// Les écritures du jalon 1 dans HubSpot : la requête exacte, une seule fois, et de quoi l'annuler.

const CONFIG = { authMode: 'oauth', accessToken: 'jeton-123', refreshToken: 'r', expiresAt: null };
// Lire : la version datée de la relève. Écrire : /crm/v3 (note 06, section 7).
const OBJECTS = 'https://api.hubapi.com/crm/objects/2026-03';
const V3 = 'https://api.hubapi.com/crm/v3/objects';
const KEY = 'a'.repeat(64);

function live(routes: Parameters<typeof testHttp>[2]) {
  const { http, calls } = testHttp(hubspotConnector, CONFIG, routes);
  const connection: LiveConnection = { connectionId: 'c1', provider: 'hubspot', config: CONFIG, http };
  return { connection, calls };
}

const note = hubspotWrite.specs.creer_note;
const task = hubspotWrite.specs.creer_tache;
const contactFound = {
  method: 'POST' as const,
  url: `${OBJECTS}/contacts/search`,
  json: { results: [{ id: '501', properties: { firstname: 'Anne', lastname: 'Martin', email: 'anne@client.fr' } }] },
};

describe('hubspot.creer_note', () => {
  it('prépare sur la fiche du contact trouvée par son courriel, sans rien écrire', async () => {
    const { connection, calls } = live([contactFound]);

    const prepared = await note?.prepare(connection, { contact: 'Anne@Client.fr', texte: 'Compte rendu' });

    expect(prepared).toEqual({ record_type: 'contacts', record_id: '501', record_name: 'Anne Martin', body: 'Compte rendu' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: 'anne@client.fr' }] }],
    });
  });

  it('passe la main à la connexion suivante sans fiche, sans texte de HubSpot dans la phrase', async () => {
    const { connection } = live([
      { method: 'POST', url: `${OBJECTS}/contacts/search`, json: { results: [] } },
      { method: 'POST', url: `${OBJECTS}/companies/search`, json: { results: [] } },
    ]);
    await expect(note?.prepare(connection, { contact: 'x@y.fr', domaine: 'y.fr', texte: 't' })).rejects.toMatchObject({
      name: 'ElsewhereError',
      refusal: expect.stringMatching(/^Aucune fiche HubSpot/),
    });
  });

  it('écrit la note et son association en un seul POST, et rend la ref de la relève', async () => {
    const { connection, calls } = live([{ method: 'POST', url: `${V3}/notes`, status: 201, json: { id: '987' } }]);
    const params = { record_type: 'contacts', record_id: '501', record_name: 'Anne Martin', body: 'Bonjour\n\nÀ <bientôt>' };

    const result = await note?.execute(connection, params, KEY);

    expect(result).toEqual({ url: null, ref: { item: 'note:987' }, undo: { note: '987' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', headers: { authorization: 'Bearer jeton-123' } });
    expect(calls[0]?.body).toMatchObject({
      properties: { hs_note_body: '<p>Bonjour</p><p>À &lt;bientôt&gt;</p>' },
      associations: [{ to: { id: '501' }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }],
    });
  });

  it('ne réessaie pas une écriture en panne', async () => {
    const { connection, calls } = live([
      { method: 'POST', url: `${V3}/notes`, status: 503 },
      { method: 'POST', url: `${V3}/notes`, status: 201, json: { id: '988' } },
    ]);
    await expect(note?.execute(connection, { record_type: 'contacts', record_id: '501', record_name: 'A', body: 'b' }, KEY))
      .rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
  });

  it('findExisting : une recherche vide ne prouve rien, et sans marque dans le texte on ne cherche pas', async () => {
    const { connection, calls } = live([{ method: 'POST', url: `${OBJECTS}/notes/search`, json: { results: [] } }]);
    const marked = { body: `Compte rendu\n\n— Préparé par Leon pour Anne (${markerOf(KEY)})` };
    await expect(note?.findExisting?.(connection, marked, KEY)).rejects.toMatchObject({ code: 'incertain' });
    expect(calls).toHaveLength(1);
    await expect(note?.findExisting?.(connection, { body: 'Compte rendu' }, KEY)).rejects.toMatchObject({ code: 'incertain' });
    expect(calls).toHaveLength(1);
  });

  it('annule par DELETE, réponse vide comprise, et accepte une note déjà supprimée', async () => {
    const { connection, calls } = live([
      { method: 'DELETE', url: `${V3}/notes/987`, status: 204, text: '' },
      { method: 'DELETE', url: `${V3}/notes/988`, status: 404 },
    ]);
    await note?.undo?.(connection, {}, { note: '987' });
    await note?.undo?.(connection, {}, { note: '988' });
    expect(calls.map((c) => c.method)).toEqual(['DELETE', 'DELETE']);
  });
});

describe('hubspot.creer_tache', () => {
  it('pose l’échéance à 9 h UTC et l’association tâche → contact', async () => {
    const { connection, calls } = live([{ method: 'POST', url: `${V3}/tasks`, status: 201, json: { id: '42' } }]);
    await task?.execute(connection, { record_type: 'contacts', record_id: '501', record_name: 'A', title: 'Relancer', due: '2026-11-25' }, KEY);
    expect(calls[0]?.body).toMatchObject({
      properties: { hs_task_subject: 'Relancer', hs_timestamp: '2026-11-25T09:00:00.000Z', hs_task_status: 'NOT_STARTED' },
      // 202 et 204 : les valeurs relues sur un compte de développement avant la PR (ASSOC), recopiées ici.
      associations: [{ types: [{ associationTypeId: 204 }] }],
    });
  });
});

describe('hubspotWrite.granted', () => {
  it('ne sait rien d’une clé collée ni d’une connexion sans scope gardé', () => {
    expect(hubspotWrite.granted({ authMode: 'key', token: 'x' }, 'creer_note')).toBe('inconnu');
    expect(hubspotWrite.granted(CONFIG, 'creer_note')).toBe('inconnu');
    expect(hubspotWrite.granted({ ...CONFIG, scope: 'oauth crm.objects.contacts.write' }, 'creer_note')).toBe('oui');
    expect(hubspotWrite.granted({ ...CONFIG, scope: 'oauth crm.objects.contacts.write' }, 'creer_affaire')).toBe('non');
  });
});
```

`fakeFetch` enregistre les en-têtes en minuscules (`src/test/fake-fetch.ts:16-17`). Un `FakeRoute` sans `json` ni `text` rend un corps vide, et un 204 n'en a jamais (`respond`, `:45-53`) : `http.text` le lit sans erreur.

### 16.6 `outlook/actions.test.ts` : le brouillon du jalon 1

```ts
// src/server/connectors/outlook/actions.test.ts
import { describe, expect, it } from 'vitest';
import type { LiveConnection } from '@/server/actions/spec';
import { testHttp } from '@/test/fake-fetch';
import { outlookWrite } from './actions';
import { outlookConnector } from './connector';

const CONFIG = { authMode: 'oauth', accessToken: 'jeton-graph', refreshToken: 'r', expiresAt: null };
const GRAPH = 'https://graph.microsoft.com/v1.0';
const draft = outlookWrite.specs.creer_brouillon;
const PARAMS = { thread: 'CONV1', message: 'MSG2', subject: 'Devis', sender: 'anne@client.fr', body: 'Bonjour', all: 'non' };

function live(routes: Parameters<typeof testHttp>[2]) {
  const { http, calls } = testHttp(outlookConnector, CONFIG, routes);
  return { connection: { connectionId: 'c1', provider: 'outlook', config: CONFIG, http } as LiveConnection, calls };
}

describe('outlook.creer_brouillon', () => {
  it('prend le dernier message reçu du fil, pas un brouillon', async () => {
    const { connection } = live([
      {
        url: `${GRAPH}/me/messages`,
        json: {
          value: [
            { id: 'MSG1', subject: 'Devis', receivedDateTime: '2026-11-18T09:00:00Z', from: { emailAddress: { address: 'anne@client.fr' } } },
            { id: 'MSG2', subject: 'RE: Devis', receivedDateTime: '2026-11-19T09:00:00Z', from: { emailAddress: { address: 'Anne@Client.fr' } } },
            { id: 'DRAFT', isDraft: true, receivedDateTime: '2026-11-20T09:00:00Z' },
          ],
        },
      },
    ]);
    const prepared = await draft?.prepare(connection, { fil: 'outlook:thread:CONV1', texte: 'Bonjour' });
    expect(prepared).toMatchObject({ thread: 'CONV1', message: 'MSG2', sender: 'anne@client.fr', all: 'non' });
  });

  it('crée la réponse puis écrit le corps au-dessus de la citation, sans rien envoyer', async () => {
    const { connection, calls } = live([
      { method: 'POST', url: `${GRAPH}/me/messages/MSG2/createReply`, status: 201, json: { id: 'D1', webLink: 'https://outlook.office.com/d1', body: { content: '<p>cité</p>' } } },
      { method: 'PATCH', url: `${GRAPH}/me/messages/D1`, json: { id: 'D1' } },
    ]);
    const result = await draft?.execute(connection, PARAMS, 'k'.repeat(64));
    expect(result).toEqual({ url: 'https://outlook.office.com/d1', undo: { draft: 'D1' } });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${GRAPH}/me/messages/MSG2/createReply`,
      `PATCH ${GRAPH}/me/messages/D1`,
    ]);
    expect(calls[1]?.body).toEqual({ body: { contentType: 'HTML', content: '<p>Bonjour</p><p>cité</p>' } });
    expect(calls.some((c) => c.url.endsWith('/send'))).toBe(false);
  });

  it('retire le brouillon vide si le corps ne s’écrit pas', async () => {
    const { connection, calls } = live([
      { method: 'POST', url: `${GRAPH}/me/messages/MSG2/createReply`, status: 201, json: { id: 'D1' } },
      { method: 'PATCH', url: `${GRAPH}/me/messages/D1`, status: 503 },
      { method: 'DELETE', url: `${GRAPH}/me/messages/D1`, status: 204, text: '' },
    ]);
    await expect(draft?.execute(connection, PARAMS, 'k'.repeat(64))).rejects.toMatchObject({ status: 503 });
    expect(calls.at(-1)?.method).toBe('DELETE');
  });

  it('un refus pour débit après createReply est « incertain », jamais « rien n’a été écrit »', async () => {
    const { connection } = live([
      { method: 'POST', url: `${GRAPH}/me/messages/MSG2/createReply`, status: 201, json: { id: 'D1' } },
      { method: 'PATCH', url: `${GRAPH}/me/messages/D1`, status: 429, headers: { 'retry-after': '30' } },
      { method: 'DELETE', url: `${GRAPH}/me/messages/D1`, status: 429, headers: { 'retry-after': '30' } },
    ]);
    const error = await draft?.execute(connection, PARAMS, 'k'.repeat(64)).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: 'ActionFailure', code: 'incertain' });
  });

  it('lit le dernier message sur toutes les pages du fil', async () => {
    const next = `${GRAPH}/me/messages?$skiptoken=P2`;
    // Une route ne sert qu'une fois (fake-fetch.ts) : une liste neuve par lecture du fil.
    const pages = () => [
      {
        url: `${GRAPH}/me/messages`,
        json: {
          value: [{ id: 'MSG1', receivedDateTime: '2026-11-18T09:00:00Z', from: { emailAddress: { address: 'anne@client.fr' } } }],
          '@odata.nextLink': next,
        },
      },
      { url: next, json: { value: [{ id: 'MSG9', receivedDateTime: '2026-11-19T09:00:00Z', from: { emailAddress: { address: 'anne@client.fr' } } }] } },
    ];
    const prepared = await draft?.prepare(live(pages()).connection, { fil: 'CONV1', texte: 'Bonjour' });
    expect(prepared).toMatchObject({ message: 'MSG9' });
    // Proposé sur MSG1, le fil a reçu MSG9 depuis : la réponse ne part pas.
    await expect(draft?.verify?.(live(pages()).connection, { ...PARAMS, message: 'MSG1' })).rejects.toMatchObject({
      code: 'conflit',
    });
  });

  it('n’annule pas un brouillon que la personne a envoyé', async () => {
    const { connection, calls } = live([{ url: `${GRAPH}/me/messages/D1`, json: { id: 'D1', isDraft: false } }]);
    await expect(draft?.undo?.(connection, PARAMS, { draft: 'D1' })).rejects.toMatchObject({ code: 'conflit' });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });
});

describe('outlookWrite.granted', () => {
  it('n’envoie jamais sans Mail.Send accordé', () => {
    expect(outlookWrite.granted(CONFIG, 'envoyer')).toBe('non');
    expect(outlookWrite.granted(CONFIG, 'creer_brouillon')).toBe('inconnu');
    const scope = 'https://graph.microsoft.com/Mail.ReadWrite offline_access';
    expect(outlookWrite.granted({ ...CONFIG, scope }, 'creer_brouillon')).toBe('oui');
    expect(outlookWrite.granted({ ...CONFIG, scope }, 'envoyer')).toBe('non');
  });
});
```

### 16.7 `oauth.test.ts` : le verrou

```ts
// src/server/connectors/oauth.test.ts (existe), le faux `connections` (:28-29) devient
const saveOAuthTokens = vi.hoisted(() => vi.fn(async () => true));
const takeRenewLock = vi.hoisted(() => vi.fn(async () => true));
const releaseRenewLock = vi.hoisted(() => vi.fn(async () => {}));
const readMyConfig = vi.hoisted(() => vi.fn(async (): Promise<Record<string, unknown> | null> => null));
vi.mock('./connections', () => ({ saveOAuthTokens, takeRenewLock, releaseRenewLock, readMyConfig }));

// … et, dans describe('ensureFreshTokens') :
  beforeEach(() => {
    takeRenewLock.mockResolvedValue(true);
    // Sans autre écrivain, la base porte ce que l'appelant a lu.
    readMyConfig.mockImplementation(async () => oauthConfig());
  });

  it('verrou perdu : attend et rend les jetons que l’autre a enregistrés, sans appeler l’éditeur', async () => {
    takeRenewLock.mockResolvedValueOnce(false);
    readMyConfig
      .mockResolvedValueOnce(oauthConfig()) // pas encore renouvelé
      .mockResolvedValueOnce(oauthConfig({ accessToken: 'acces-autre', refreshToken: 'rafraichir-autre' }));
    const fetchImpl = fakeFetch([]);
    const waits: number[] = [];

    const config = await ensureFreshTokens(ctx, connection(oauthConfig()), connector, {
      ...deps(fetchImpl),
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    expect(config).toMatchObject({ accessToken: 'acces-autre' });
    expect(fetchImpl.calls).toHaveLength(0);
    expect(saveOAuthTokens).not.toHaveBeenCalled();
    expect(waits).toEqual([500, 500]);
  });

  it('verrou perdu dix secondes : TokenRenewalBusyError, rien n’est renouvelé', async () => {
    takeRenewLock.mockResolvedValueOnce(false);
    const fetchImpl = fakeFetch([]);
    await expect(
      ensureFreshTokens(ctx, connection(oauthConfig()), connector, { ...deps(fetchImpl), sleep: async () => {} }),
    ).rejects.toBeInstanceOf(TokenRenewalBusyError);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it('sous le verrou, un jeton déjà changé par un autre est rendu tel quel', async () => {
    readMyConfig.mockResolvedValueOnce(oauthConfig({ accessToken: 'acces-autre' }));
    const fetchImpl = fakeFetch([]);
    const config = await ensureFreshTokens(ctx, connection(oauthConfig()), connector, deps(fetchImpl));
    expect(config).toMatchObject({ accessToken: 'acces-autre' });
    expect(fetchImpl.calls).toHaveLength(0);
    expect(releaseRenewLock).toHaveBeenCalled();
  });

  it('rend le verrou même quand l’éditeur refuse', async () => {
    const fetchImpl = fakeFetch([tokenRoute({ error: 'invalid_grant' }, 400)]);
    await expect(ensureFreshTokens(ctx, connection(oauthConfig()), connector, deps(fetchImpl))).rejects.toBeInstanceOf(
      OAuthRefusedError,
    );
    expect(releaseRenewLock).toHaveBeenCalledWith(ctx, 'c1');
  });
```

`tokenRoute(json, status)` est l'aide du fichier existant (`oauth.test.ts:73`).

### 16.8 `decide.db.test.ts` : le refus pour débit au clic (esquisse)

Sur le modèle de `github-actions.db.test.ts` (`newSetup`, `notDue`, `fakeFetch`, `adminPool`, existants) :

```ts
// src/server/actions/decide.db.test.ts (déplacé), un cas de plus
  it('remet l’action à « proposee » quand GitHub refuse pour débit, sans rien écrire', async () => {
    const { alice, connectionId } = await newSetup();
    const { row } = await proposeAction(alice, {
      connectionId,
      kind: 'github.creer_ticket',
      params: { repo: 'acme/leon', title: 'Un ticket', visibility: 'private' },
      risk: 'moyen',
      audience: 'interne',
      expiresAt: new Date(Date.now() + 3_600_000),
      origin: { kind: 'discussion', discussionId: await discussionOf(alice) },
      provenance: NO_PROVENANCE,
    });
    const fetchImpl = fakeFetch([
      // verify relit la visibilité du dépôt avant d'écrire (13.2).
      { url: REPO, json: { private: true, visibility: 'private' } },
      { method: 'POST', url: `${REPO}/issues`, status: 429, headers: { 'retry-after': '90' } },
    ]);

    const view = await decideAction(alice, row.id, 'confirmer', { fetchImpl, sleep: async () => {} });

    expect(view).toMatchObject({ status: 'proposee', result: { error: 'limite' } });
    expect(fetchImpl.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    // Le créneau de la connexion est repoussé pour tout le monde (reserver_creneau, 0081).
    const { rows } = await adminPool.query('select prochain_le > now() + interval \'80 seconds\' as later from creneaux_ecriture where connection_id = $1', [connectionId]);
    expect(rows[0]?.later).toBe(true);
  });
```

`discussionOf` est une aide à écrire dans le fichier (une discussion d'Alice, par `createDiscussion`, existe).

## 17. Ordre de mise en œuvre

La PR 7 de l'architecture (14.3, « Actions généralisées ») est trop grosse pour une relecture : elle se coupe en cinq, dans cet ordre. Chacune laisse `main` vert ; seule 7c change un peu ce que la discussion fait aujourd'hui, et dit quoi. Un numéro de migration se prend après `git fetch` et `gh pr list` (`CLAUDE.md`).

| PR | Contenu | Dépend de | Migration | Jalon |
|---|---|---|---|---|
| 7a | `ConnectorRateLimitError` (`http.ts`), `failure` de Linear, tests de 16.3 | rien | | 1 |
| 7b | `takeRenewLock`, `releaseRenewLock`, `readMyConfig` (`connections.ts`) ; le verrou et `TokenRenewalBusyError` (`oauth.ts`) ; `open.ts` ; `openGithub` par `openConnection` et fin du `shortcut` (`github-live.ts`) ; `pace.ts` ; `config.scope` gardé par `oauthConfig` ; tests de 16.1 (connexions, `open`, `pace`, `oauth`) | 7a | 0081 (chapitre 01) | 1 |
| 7c | Le déplacement. Changements de comportement voulus, et seulement ceux-là : le public lu et relu (`verify`) sur GitHub, les phrases de refus communes et l'ordre « pas branché » avant « dépôt invalide » (10.3, 13.4), un refus pour débit qui rend la ligne à « proposee » (`limite`). `HTTP_ERRORS` reste celui d'aujourd'hui (un 400 reste `echec`). Fichiers : `spec.ts`, `params.ts`, `registry.ts` (`deciderInput` compris), `store.ts`, `propose.ts` (`prepareAction`, `recordAction`, `actionTools`, `discussionActionTools`), `decide.ts` (`decideAction`, `errorCode`, `verify`), `connectors/github/actions.ts` et `live.ts`, les ré-exports de `discussion/github-live.ts` et `github/connector.ts` (13.2), `Connector.write` et `ConnectorWrite` (`types.ts`) ; `src/lib/actions.ts` (structure, 14 types GitHub, `actionProvider`, `actionVerb`, `ACTION_PENDING_MS`, `limite`, `ActionView` étendue) ; clés de texte à deux niveaux et carte ; `github-actions.ts` et `proposed-actions.ts` supprimés, leurs tests déplacés tels quels ; `registry.test.ts`, `params.test.ts` | 7b, PR 5 de l'architecture (`src/lib/agents.ts`, avec `isRecipientKey` du chapitre 06) | 0080 (chapitre 01, avec `'defaite'` et la carte) | 1 |
| 7d | `hubspot.creer_note`, `hubspot.creer_tache`, `outlook.creer_brouillon` : les deux `actions.ts` avec ces trois specs seulement, `write` dans les deux connecteurs, `scope` dans leurs schémas, trois types de plus dans `ACTION_KINDS` et `ACTION_KEYS`, leurs textes ; tests de 16.5 et 16.6 | 7c | | 1 |
| 7e | `runActions` (le port du moteur) et `proposeFromRun`, `capabilities.ts` et `resolveAction`, `autoExecute`, `resumeAction` (écrits, appelés seulement au-dessus du cran `propose`) ; `propose.db.test.ts` ; `worker.ts` passe `actions: runActions` (chapitre 04, sa PR 7) | 7c ; chapitre 04 (`durable.ts` : `RetryLater`, `StepFailure` ; `run.ts` : `RunActions`, `RunProposal` ; `identity.ts`) ; chapitre 06 (`needsClick`, `policy.ts` : `participantsOf`, `refusedRecipient`, `sanitizeForAction`) ; chapitre 02 (`organizationDomains`) | | 1 |

Le chapitre 14 peut regrouper 7a et 7b. Il ne change pas l'ordre : 7c déplace avant que 7d n'ajoute, pour que la relecture du déplacement ne se mêle pas à du nouveau.

Après le jalon 1, une PR par sujet, chacune déclenchée par un besoin (architecture, 14.3) :

| PR | Contenu | Ce qui la déclenche |
|---|---|---|
| 8a | `undoAction`, la server action `undoActionAction` et le bouton « Annuler » (chapitre 07) | le premier cran au-dessus de `propose` |
| 8b | HubSpot : `creer_contact`, `creer_affaire`, `modifier_fiche` | une fiche de commerce qui les demande (chapitre 08) |
| 8c | Outlook : `classer`, `bloquer_creneau`, `creer_evenement`, `envoyer` (éteint par `granted` tant que `Mail.Send` n'est pas accordé) | l'agent de boîte mail, l'agent d'agenda |
| 8d | Linear : `graphql` exporté avec `once`, les trois specs | une fiche projets ou produit |
| 8e | Jira : `textToAdf`, les trois specs, l'extrait `vendor-specs/jira.json` (section 14) ; `400: 'refus'` dans `HTTP_ERRORS` (un champ obligatoire d'un projet), avec l'assertion de `decide.db.test.ts` (ex-`github-actions.db.test.ts:1081-1090`) qui passe d'`echec` à `refus` | idem |
| 8f | Asana : les trois specs, l'extrait, `tasks:delete` dans `asana/oauth.ts`, `vendor-params.test.ts` | idem |
| 8g | Notion : `authed` exporté, les trois specs | une fiche qui écrit une page |
| 8h | Zendesk : les trois specs | la première fiche support |
| 8i | Gmail : les trois specs | le premier client sur Google (question Q11) |
| 8j | La discussion ouverte à d'autres outils que GitHub (`DISCUSSION_ACTION_KINDS`, `DISCUSSION_SYSTEM`, `toolActivity`) | une demande ; à mesurer : le poids des outils dans chaque réponse |

Chaque PR d'outil ajoute ses types à `ACTION_KINDS` et `ACTION_KEYS`, son `write`, ses textes et ses tests en même temps : `registry.test.ts` refuse un type sans spec, et une spec sans type.

## 18. Écarts avec l'architecture

Aucun nom de l'architecture n'est changé : modules, fonctions, tables, colonnes, types, constantes, types d'action sont les siens. Ce qui suit est ce qui ne pouvait pas être suivi à la lettre, puis ce que j'ai ajouté là où elle ne dit rien.

### 18.1 Écarts

| # | Ce que dit l'architecture | Ce qui heurte, et la preuve | Ce qui est écrit ici, et ma proposition |
|---|---|---|---|
| 1 | 8.3 : `granted(config: Config): 'oui' \| 'non' \| 'inconnu'`, une réponse par connexion. E8 : « `outlook.envoyer` existe dans le code mais reste éteint tant que le droit n'est pas accordé (`write.granted`) » | Une réponse par connexion ne distingue pas le brouillon (`Mail.ReadWrite`, accordé) de l'envoi (`Mail.Send`, jamais demandé : `outlook/oauth.ts:45`). Même chose pour Asana (`stories:write` contre `tasks:write`) et HubSpot (affaires contre contacts) | `granted(config: Config, verb: string)`. Une fonction à un argument reste assignable : rien ne casse. Proposition : corriger la signature en 8.3 |
| 2 | 9.6, point 6 : « Tout texte écrit par un agent finit par une mention courte (« Préparé par Leon pour Claire »), sauf dans un brouillon » | Rien dans `ActionSpec` ne dit quel paramètre est ce texte, ni si l'action est un brouillon | `ActionSpec.mentionKey?: string`. `proposeFromRun` ajoute la mention ; avec une marque tirée de la clé d'idempotence (`markerOf`) seulement si la spec la cherche (`marker`, écart 16) et que le public n'est pas `externe` : un client ne lit pas un code interne. Proposition : ajouter le champ en 8.2 |
| 3 | 8.2 : `ActionResult = { url, undo? }` | Le chapitre 02 (écart E02-2) en a besoin pour `isOwnWrite` : HubSpot n'a pas d'adresse (`hubspot/map.ts:119`), et un commentaire a l'adresse du commentaire, pas de l'objet | `ref?: { item: string; turn?: string }`, rempli par chaque spec dont l'objet revient par la relève, gardé dans `actions.result` par `finishAction`. Proposition : ajouter `ref` en 8.2 |
| 4 | 8.6 : « Pour une étape d'écriture, le moteur appelle `findExisting` avant de réécrire » | Une recherche indexée (HubSpot, Jira) a du retard (`hubspot/cursor.ts:10-13`, `jira/connector.ts:44-46`) : « rien trouvé » n'y prouve pas l'absence, et réécrire ferait un doublon | Contrat précisé : `findExisting` rend `null` seulement quand l'absence est sûre (lecture directe), sinon lève `ActionFailure('incertain')`. Et le moteur ne reprend que les lignes `en-cours` décidées par l'autonomie : une ligne cliquée est peut-être en train de s'écrire dans `web`. Proposition : écrire ces deux phrases en 8.6 |
| 5 | 8.2 : `notion.creer_page`, `notion.commenter` : annulable | Note 07, fiche Notion : « Suppression d'un commentaire via l'API : non trouvée [V] » | `notion.commenter` est `irreversible` (et sans `undo`, ce que le test de contrat accepte). Si la documentation de Notion montre une suppression, il redevient annulable dans sa PR. Proposition : corriger le tableau de 8.2 |
| 6 | 8.2 : Notion `interne`, `externe` « si la page mère est publiée ou partagée à un invité » ; Asana `interne` ; 8.1 : le public est « calculé par la spec sur la cible réelle, jamais deviné : dans le doute, 'externe' » | Le partage d'une page Notion à un invité ne se lit pas par l'API (aucune note n'en montre la lecture) : la condition du tableau ne se calcule pas. Un projet ou une tâche Asana peut avoir des invités extérieurs ; l'API dit `is_guest` d'un membre de l'espace (à vérifier). Linear a des invités (`guest`, à vérifier) | La règle de 8.1 l'emporte sur le tableau : Notion est toujours `externe` ; Asana est `interne` seulement si l'espace de travail n'a aucun invité, lu en entier (`workspaceGuests`), sinon `externe` ; Linear, `interne` seulement si l'équipe n'a aucun invité, lue en entier. Coût : une écriture Notion attend un clic dès qu'un contenu extérieur a été lu, et ne part sans clic qu'au cran « agit seul ». Proposition : corriger les lignes Notion et Asana du tableau de 8.2 |
| 7 | 9.1, point 6 et 9.6, point 6 : l'écriture part de la connexion de la personne et « apparaît au nom de la personne » | Zendesk se branche par un jeton d'API, celui d'un administrateur (`zendesk/catalog.ts`, carte 03, 8.21). Ce qu'il écrit apparaît au nom du propriétaire du jeton, qui peut être un autre que la personne | Écrit tel quel : la connexion reste la sienne, la mention dit pour qui. Proposition : au chapitre 10, l'OAuth de Zendesk (un jeton par agent), ou exiger à la connexion que l'adresse du jeton soit celle de la personne |
| 8 | 8.2 : les 14 types GitHub ; `relancer_execution` est « moyen » (parmi « les autres ») | Une relance « peut exécuter du code et déployer » (`github-actions.ts:757`, avertissement `rerunWarning`) | Gardé moyen, comme fixé. Proposition : le passer à `haut` |
| 9 | 9.4 : « Avant chaque `execute` et chaque `undo`, `reserveWriteSlot(ctx, live)` » | Le moteur et le clic doivent savoir s'il faut attendre ou revenir plus tard | `reserveWriteSlot(ctx, live, deps?)` rend `{ kind: 'go' }` (après une attente sur place de 5 s au plus) ou `{ kind: 'later', waitMs }`. Proposition : écrire ce retour en 9.4 |
| 10 | 8.2 : `notion.commenter` et `zendesk.ajouter_note_interne` sont `bas` ; 8.1 : « `bas` : se défait, ne notifie personne » | Les deux sont irréversibles (écart 5 ; « irréversible côté outil » pour Zendesk) et notifient : les abonnés de la page Notion, l'agent assigné du ticket par les déclencheurs par défaut de Zendesk | `risk: 'moyen'` pour les deux, et un test de contrat : une spec `irreversible` n'est jamais `bas`. Sans effet sur `needsClick`, qui traite `bas` et `moyen` de la même façon (8.1) : c'est l'étiquette montrée et journalisée qui devient juste. Proposition : corriger les deux lignes du tableau de 8.2 |
| 11 | 8.2 : `zendesk.modifier_ticket` `interne` ; Jira `interne`, `externe` sur un projet de service desk ; 8.1 : « dans le doute, 'externe' » ; E11 : le public ne peut que durcir | Les déclencheurs de Zendesk (par défaut : le passage à `solved` ; ceux du client : n'importe quel statut ou étiquette) peuvent écrire au demandeur, et Leon ne les lit pas. Un projet Jira d'un type absent ou inconnu peut avoir un portail | Zendesk : `interne` pour la priorité seule, `externe` dès qu'un statut ou une étiquette change. Jira : `interne` sur `software` et `business` seulement, `externe` sinon (`service_desk`, type absent ou inconnu). Proposition : écrire ces deux règles dans le tableau de 8.2 |
| 12 | 8.5 : « Jamais du texte libre du modèle décideur » ; 9.5, point 1 : le décideur « ne reçoit que les champs typés du lecteur » ; point 4 : « un paramètre de destinataire ne vient jamais du modèle » | Sans règle de plus, les outils du décideur prennent `spec.input` entière : un `texte` de 8 000 caractères, écrit par un modèle dirigé par des champs tirés d'un contenu extérieur, ni compté `freeText` (le chapitre 04 passe `freeText: false`) ni nettoyé (`sanitizeWriterOutput`) | `ActionSpec.textKeys` ; `runActions.describe` rend `deciderInput(spec)`, sans ces clés ni clé de destinataire : le décideur ne les remplit jamais, et `freeText: false` devient vrai par construction. Un type dont une clé cachée est obligatoire (`creer_note`, `envoyer`, `repondre`…) ne se propose pas par un décideur : son texte vient d'une étape `rediger`, par une étape `agir`. Proposition : une règle de plus dans `checkDefinition` (après la 16 du chapitre 06) : un `decider` ne liste aucune action pour laquelle `deciderCanPropose` est faux |
| 13 | 6 : `propose.ts` porte « les outils d'action pour le décideur » | Le chapitre 04 (son 8.2 et son écart E04-11) bâtit les outils du décideur dans `decider.ts`, sur un port `RunActions` que ce chapitre exporte | Tenu tel que le chapitre 04 l'écrit : `runActions` exporté de `propose.ts`, `proposeFromRun(identity, RunProposal)`, `RetryLater` levé. Deux choses que le port ne porte pas, réglées sans le changer : la connexion choisie par `prepare` voyage dans `params` sous la clé réservée `connexion` (`CONNECTION_PARAM`), que `proposeFromRun` retire ; `prepare` accepte en plus `{ allowedRecipients, connectionId }`, que le moteur ne passe pas encore. Proposition au chapitre 04 : passer `allowedRecipients(identity.read, [source])` et la `connection_id` de la source à `prepare` ; d'ici là, le contrôle des destinataires d'entrée tient par les règles 5 et 16 de `checkDefinition` et par `deciderInput` |
| 14 | 9.4 : « Une connexion Pipedream (Gmail, Drive, Slack) coûte un crédit par requête, écriture comprise : les agents n'y font pas de lecture en direct » | Une écriture dans un fil Gmail ne peut pas se préparer sans lire le fil (dernier message, `Message-ID`, destinataires), ni se revérifier sans le relire | Une lecture du fil par `prepare` (le `GET /profile` d'avant est retiré : l'adresse se lit dans le fil), une par `verify`, une écriture : 3 crédits par brouillon ou envoi, 3 ou 4 par classement. Borné par la fiche : 5 propositions par `decider`, 20 éléments par `each`. Proposition : écrire en 9.4 que les écritures Gmail lisent le fil en direct, chiffrées ainsi, et le renvoyer à la question Q12 |
| 15 | 8.2 et 9.2, point 4 : « Un refus pour débit n'est pas une écriture incertaine : rien n'a été écrit » | Vrai pour un `execute` à une écriture. Faux pour `outlook.creer_brouillon` (createReply puis PATCH), `outlook.envoyer`, `outlook.classer` (une boucle de messages) : un 429 à la deuxième requête suit une première écriture réussie | `partialWrite` (section 3.1) : après une première écriture réussie, un refus pour débit devient `ActionFailure('incertain')`. La ligne ne revient jamais à « proposee ». Proposition : ajouter « pour la première écriture d'un `execute` » à la règle de 8.2 et de 9.2 |
| 16 | 8.2 : le bloc `ActionSpec` | Trois besoins sans champ : relire la cible juste avant d'écrire (une proposition d'agent attend sept jours ; l'architecture veut le public « calculé à chaque appel ») ; dire quelles entrées sont du texte libre (écart 12) ; savoir si la mention porte une marque (un code interne ne se montre pas au client) | `verify?(live, params)`, `textKeys?`, `marker?`. `decide.ts` appelle `verify` avant `execute`, au clic comme en autonomie : un public qui a durci (dépôt devenu public, invité arrivé, projet passé en service desk) ou une cible qui a bougé (le fil a un message de plus, le ticket est résolu) donne `conflit`, sans rien écrire. Proposition : ajouter les trois champs au bloc de 8.2 |

### 18.2 Ajouts et précisions

Rien ici ne contredit l'architecture : ce sont des noms qu'elle ne fixe pas.

| Sujet | Ajout | Pourquoi |
|---|---|---|
| Modules | `src/server/actions/params.ts` ; `src/server/connectors/github/live.ts` | Les briques de règles servent à tous les outils ; `live.ts` casse les deux boucles d'imports (`github/connector.ts` ↔ `github/actions.ts`, et celle qui passe par `discussion/github-live.ts`, `open.ts` et le registre des connecteurs) |
| Types et erreurs | `ConnectorWrite` (`types.ts`) ; `ActionFailure`, `ElsewhereError` et `partialWrite` dans `spec.ts` ; `TokenRenewalBusyError` (`oauth.ts`) ; `WriteSlot`, `WRITE_WAIT_INLINE_MS`, `delayWriteSlot` (`pace.ts`) | Un verrou perdu et un refus pour débit sur une première écriture ne sont pas des écritures incertaines : rien n'est parti. Après une première écriture réussie, un refus pour débit en est une (écart 15) |
| `ActionSpec` | `mentionKey`, `marker`, `textKeys`, `verify` (écarts 2, 12, 16) ; `hasMarker` (`params.ts`) | La marque n'est posée que si le public n'est pas `externe` (architecture 9.6, point 6, demande la mention, pas un code interne) ; `findExisting` vérifie qu'elle est dans le texte avant de chercher |
| Base | `takeRenewLock`, `releaseRenewLock`, `readMyConfig` (`connections.ts`) | Le verrou de 8.3, et la relecture des jetons sous le verrou |
| `store.ts` | `readActionRow`, `readActionByKey`, `releaseAction`, `claimUndo`, `finishUndo`, `failUndo`, `countPendingActions`, `NO_PROVENANCE`, `ProposeInput`, `ProposeOrigin`, `Provenance` | `listPendingActions`, `proposeAction`, `claimAction`, `finishAction` sont de l'architecture ; le reste sert le refus pour débit, l'annulation et la pastille |
| `propose.ts` | `prepareAction`, `recordAction`, `actionTools`, `discussionActionTools`, `DISCUSSION_ACTION_KINDS`, `DiscussionToolMode`, `PreparedAction`, `PrepareRequest`, `PrepareResult`, `runActions`, `CONNECTION_PARAM` | Le décideur prépare sans écrire (8.6) : il faut séparer préparer et écrire. `RunActions`, `RunProposal`, `ProposalOutcome` sont les types du chapitre 04 (`run.ts`), importés tels quels |
| `registry.ts` | `deciderInput`, `deciderCanPropose`, `registeredKinds`, `writerOf` | L'entrée des outils du décideur (écart 12), et le test de contrat |
| Destinataires | contrôle sur les entrées à clé de destinataire, avant `prepare` (`refusedRecipient`, chapitre 06) ; plus de contrôle de `spec.recipients(params)` | Ferme l'écart 5 du chapitre 06 : une « réponse à tous » vers une personne en copie qui n'a jamais écrit passe ; les destinataires lus par `prepare` fixent le public, ils ne sont pas recontrôlés. `{ from: 'destinataires' }` vaut les participants seuls (`participantsOf`, port `recipients`) |
| Connexions | `prepareAction` essaie la connexion de la source d'abord, puis toutes les autres ; une cible introuvable se dit par `ElsewhereError` dans toutes les specs | Une personne qui a deux boîtes ou deux portails voyait l'écriture refusée dès que la cible était dans la seconde |
| `decide.ts` | `resumeAction`, `DecideDeps`, `AutoOutcome` | La reprise après une mort pendant une écriture d'autonomie (8.6) |
| `capabilities.ts` | `ACTION_CAPABILITY_NAMES` en tuple, `resolveAction` | `z.enum` dans `definition.ts` (8.5) ; la résolution de 8.2 |
| `src/lib/actions.ts` | `ACTION_ERRORS` gagne `limite` ; `ActionView.undoError` ; `ACTION_ORIGINS` ; `actionWarnings` gagne `sendWarning` | Au clic, un refus pour débit remet la ligne à « proposee » et la carte dit de réessayer (8.2) ; un échec d'annulation se montre (9.6, point 4) |
| Paramètres | `interne` posé par `propose.ts` d'après `organizationDomains` (chapitre 02) pour les trois types qui ont des destinataires | `audience` est pure et ne connaît pas les domaines de l'organisation ; les destinataires, eux, viennent de l'outil (`prepare`), jamais du modèle |
| Actions de discussion | écrites avec l'enjeu et le public réels de la spec, pas avec les défauts de la colonne | La carte montre le vrai public. Rien ne change pour la sécurité : `autoExecute` n'est appelé que par `proposeFromRun` |
| Codes d'erreur | `400` → `refus`, avec la PR 8e (Jira) | Un champ obligatoire d'un projet Jira, une mutation Linear refusée : rien n'est écrit. Aujourd'hui GitHub donne `echec` sur un 400 ; le test `github-actions.db.test.ts:1081-1090` change d'assertion dans la même PR, pas au déplacement |
| HubSpot | lectures sur `/crm/objects/2026-03` (celles de la relève), écritures sur `/crm/v3/objects` (celles de la note 06) ; `lifecyclestage` hors de `modifier_fiche` | Aucune source pour la création sur la version datée ; HubSpot ne ramène pas un cycle de vie en arrière sans l'effacer ([MEM]) |
| Annulation | un `undo` compensable relit l'état et lève `conflit` s'il n'est plus celui que Leon a écrit ; Zendesk défait par `remove_tags` et `additional_tags`, jamais `tags` ; Jira ne supprime pas un ticket déjà commenté | L'annulation n'écrase pas le travail d'un collègue fait depuis (architecture 9.6, point 3 : on garde l'ancienne valeur ; on vérifie aussi qu'on ne réécrit qu'au-dessus de la sienne) |
| Portées | `asana/oauth.ts` gagne `tasks:delete` (nom à vérifier) | L'annulation de `asana.creer_tache`, annulable d'après 8.2 |
| Phrases de refus | trois phrases propres à GitHub deviennent communes (13.4) | Une seule boucle de préparation pour tous les outils |
| Délais | Linear : 60 s par défaut après un refus pour débit | `graphql` ne lit pas les en-têtes de remise à zéro de Linear |

## 19. Ce que je n'ai pas vérifié

- **Aucune page d'éditeur n'a été ouverte.** Tout point d'API vient des notes 06 et 07, elles-mêmes faites de résumés de recherche, ou de la mémoire de leurs auteurs ([MEM], [V]). Les points les plus fragiles, à relire avant chaque PR d'outil : la création HubSpot sur `/crm/v3/objects` avec `associations` dans le corps (note 06, [OFF, par résumé]), et les numéros d'association (`ASSOC`, de mémoire : leur relecture par `GET /crm/v4/associations/{de}/{vers}/labels` bloque la PR 7d), `hs_task_body` ; `Prefer: IdType="ImmutableId"` d'Outlook, le filtre sur `conversationId` et sa pagination par `@odata.nextLink`, le filtre sur `transactionId` ; la réécriture ou non de `Message-ID` par Gmail, l'en-tête `Delivered-To` dans `format: 'metadata'` ; `id` fourni par le client chez Linear, `issue(id:)` avec un identifiant lisible, le champ `guest` ; qu'aucune lecture de Notion ne dise à qui une page est partagée, et la suppression d'un bloc ; `audit.events` et le tri des commentaires de Zendesk ; `issueTypes` et `projectTypeKey` de Jira, la visibilité d'un commentaire sur un projet de service desk, `total` de la liste des commentaires ; `external`, `tasks:delete`, `workspace_memberships` et `is_guest` d'Asana ; `deleteComment` et `removeReviewers` de GitHub, et sa limite secondaire d'écriture ; `lifecyclestage` de HubSpot, qui ne recule pas sans être effacé (de mémoire : la raison de son retrait).
- **Le pas d'écriture de chaque outil** (section 7) est déduit des débits des notes, pas mesuré.
- **Rien n'a été lancé** : ni `pnpm typecheck`, ni les tests, ni Biome. Le code est écrit d'après la lecture du dépôt au commit `500e246` ; des erreurs de type sont probables là où il touche des modules qui n'existent pas encore (`src/lib/agents.ts`, `durable.ts`, `identity.ts`, `src/server/standard/rules.ts`, `policy.ts`), écrits par les chapitres 01, 02, 04 et 06 en parallèle. Je n'ai pas vérifié que leurs signatures sont celles que j'appelle (`needsClick`, `idempotencyKey`, `RunIdentity`, `organizationDomains`, `isInternalAddress`, `allowedRecipients`).
- **zod 4** : que `.refine()` sur un `z.object` garde le type `ZodObject` (ce que demande `ActionSpec<S extends z.ZodObject>` et `toolDefinitions`, `anthropic-llm.ts:271`), et que `.shape` y reste lisible (`deciderInput` le lit, puis bâtit un `z.object` neuf sans le `.refine`) : non vérifié dans `node_modules`, absent. `deciderCanPropose` suppose qu'un champ facultatif accepte `undefined` (`.nullish()`).
- **Drizzle** : `onConflictDoNothing({ target: [actions.tenantId, actions.cleIdempotence] })` sur la contrainte unique de 0080 (`actions_cle_idempotence_key`), et `count()` importé de `drizzle-orm` : non essayés.
- **`app_est_admin()`** appelée par `teamActionAllowed` sous le rôle `leon_app` : je n'ai pas lu son `grant` (elle existe, elle sert aux politiques de 0057 et 0078). La requête `from (select 1) as un left join …`, qui rend toujours une ligne, n'a pas été lancée.
- **Le moteur et une erreur d'outil** : lu dans le dépôt, `executeAgentTool` (`run-tool.ts`) rend toute erreur d'outil au modèle ; un `RetryLater` levé par `prepare` dans un décideur devient donc « l'outil a échoué », sans reprise par le moteur. Non vérifié : que le `runDecider` du chapitre 04 passe bien par `executeAgentTool` (il bâtit des `AgentTool`, ce qui le laisse penser).
- **Ce que déclenchent les écritures** : les déclencheurs de Zendesk (au passage à `solved`, sur une note interne, sur une étiquette) et les notifications des commentaires Notion sont de mémoire ; c'est pourquoi le public et l'enjeu sont pris du côté prudent (écarts 10 et 11).
- **`translation-keys.test.ts`** : je n'ai pas lu comment il trouve les clés employées ; une clé construite (`kinds.${provider}.${verb}`) peut lui échapper ou le faire échouer.
- **Les tests existants que le déplacement touche** : je n'ai lu que les en-têtes de `github-actions.db.test.ts` et `github-actions.test.ts`, pas tous leurs cas. Ceux qui comparent une phrase de refus mot pour mot (13.4) ou l'ordre « dépôt invalide » avant « pas branché » (10.3) sont à adapter dans la PR 7c.
- **`users.name`** lu par `firstNameOf` hors `withTenant` : `resolveTenantContext` lit `"user"` de la même façon (`tenant-context.ts:60-68`), mais je n'ai pas vérifié les droits de `leon_app` sur la colonne `name`.
- **Les chapitres voisins** : relus pour cette version, le port `RunActions` du chapitre 04 (son 8.2, 9.5, 9.6 : tenu tel quel, écart 13) et les destinataires du chapitre 06 (son 6.1 à 6.4 et son écart 5 : suivis). Le chapitre 06 propose aussi (son écart 9) que `capabilities.ts` ne garde que les constantes et que `resolveAction` passe dans `propose.ts` : non repris ici, à trancher à la PR 7e. Non relus : le chapitre 07 (`undoActionAction`, l'écran, les clés anglaises de 15.3) et le chapitre 10 (la liste complète par connecteur). Ces chapitres sont écrits en parallèle : leurs numéros de ligne et leurs noms peuvent avoir bougé depuis.

## 20. Relecture contradictoire

Deux relectures ont attaqué ce chapitre : l'une sur le code (fidélité au dépôt, code recopiable), l'autre sur le fond (contrats avec l'architecture et les chapitres 04 et 06, sûreté des écritures). Chaque objection a été vérifiée dans le dépôt, l'architecture ou les chapitres voisins avant d'être retenue. Rien n'a été changé dans l'architecture : ce qui la touche est en section 18 (écarts 6 et 10 à 16).

| # | Objection | Verdict | Ce qui a changé, ou pourquoi rien |
|---|---|---|---|
| C1 | `params.ts` : U+2028, U+2029 et U+200D en clair dans des littéraux de regex (le fichier ne s'analyse pas) | retenue | Écrits par échappements (`\u2028`, `\u2029`, `\u200D`) dans `BIDI`, `UNSAFE`, `UNSAFE_TEXT`, `oneLine`, `label`, et dans le test du registre (`\u202E`) ; `params.test.ts` vérifie `oneLine('a\u2028b')` faux. Le chapitre ne contient plus aucun caractère invisible |
| C2 | `title` est une fabrique dans `params.ts`, une règle directe dans `RULES` de GitHub | retenue | `GITHUB_RULES` écrite en entier en 13.2 avec `title()`, `name: title()`, `current: title()` ; le commentaire de `title` le dit ; test `title: ''` → `'title'` |
| C3 | Seconde boucle d'imports par `discussion/github-live.ts`, `open.ts`, le registre | retenue | `isBranchName`, `COMMIT_SHA`, `isRepoPath` passent dans `github/live.ts`, ré-exportés par `github-live.ts` ; `github/actions.ts` n'importe plus rien de `discussion/` sauf `line-diff.ts` (sans import) ; listé en 7c, testé |
| C4 | `400 → refus` contredit le test déplacé tel quel et « sans changement de comportement » | retenue | La ligne `400` entre avec la PR 8e (Jira), qui change l'assertion de `:1081-1090` ; 7c ne dit plus « sans changement » et liste ses changements voulus |
| C5 | Un refus pour débit après une première écriture réussie relâche la ligne et fait rejouer | retenue | `partialWrite` (3.1), appliqué à `replyDraft`, `outlook.envoyer`, `outlook.classer` ; règle en 12.0 ; écart 15 ; test « PATCH refusé après createReply → incertain » |
| C6 | `teamActionAllowed` échoue ouvert | retenue | Échoue fermé : une seule lecture à jointures externes, portée illisible traitée comme d'équipe, `actif` exigé ; tests « activation supprimée », « exécution supprimée » |
| C7 | `UNSAFE_TEXT` met des contrôles dans une classe (Biome `noControlCharactersInRegex`) | retenue | Réécrite par propriétés Unicode : `(?![\n\t])\p{Cc}\|\p{Cs}\|[\u2028\u2029]\|(?!\u200D)\p{Cf}` ; vérifiée sur `\n`, `\t`, `\r`, U+0007, U+202E |
| C8 | `references` accepte un saut de ligne (`\s?`) dans un en-tête MIME | retenue | Identifiants extraits, 20 derniers, joints par une espace ; règle `REFERENCES` sans `\s` ; test « `<a@x>\n<b@y>` refusé » |
| C9 | Publics Zendesk et Jira hors du tableau et des écarts | retenue | Tableau 2.3 aligné sur le code ; écart 11 ; Zendesk durci (statut ou étiquette → `externe`, voir F7) |
| C10 | Renvois de lignes décalés ; `src/lib/actions.test.ts` existe | retenue | `github-tool.ts:14`, `hubspot/cursor.ts:10-13` ; « existe, à étendre » |
| F1 | Le décideur reçoit le texte libre de 8 000 caractères (contre 8.5 et 9.5) | retenue | `ActionSpec.textKeys` ; `describe` rend `deciderInput` (sans texte libre ni destinataire) ; un type à texte obligatoire ne se propose que par `rediger` puis `agir` ; règle proposée pour `checkDefinition` (écart 12) ; test de contrat |
| F2 | `RunActions` du chapitre 04 non tenu | retenue | `runActions: RunActions` exporté tel quel ; `proposeFromRun(identity, RunProposal)` ; `RetryLater` levé (débit, jeton qui se renouvelle) ; la connexion voyage sous `connexion` dans `params` ; `RunAction`, `RunActionOutcome`, le mode « décideur » d'`actionTools` supprimés ; écart 13 ; phrase de la section 19 retirée |
| F3 | Débit et `execute` à plusieurs requêtes | retenue en partie | `partialWrite` (voir C5). Écartés : `reserveWriteSlot` avant chaque requête et « une écriture par `execute` » : les requêtes partent l'une après l'autre, les 30 messages par minute d'Exchange comptent des envois (un par `execute`), le quota de Graph est de 10 000 par 10 minutes ; mémoriser le brouillon dans `annulation` : « incertain » interdit déjà tout rejeu |
| F4 | `prepareAction` abandonne à la première connexion ; `TokenRenewalBusyError` non traitée | retenue | Toutes les specs lèvent `ElsewhereError` sur une cible introuvable ; la connexion de la source essayée d'abord, refus après la dernière ; jeton en renouvellement : phrase fixe pour la discussion, `RetryLater(10 000)` pour le moteur ; test deux connexions |
| F5 | Une proposition de sept jours part sans relire l'état ni le public | retenue en partie | `ActionSpec.verify`, appelé avant `execute` : fil sans message de plus (envois et brouillons Outlook, Gmail), ticket ni résolu ni commenté depuis (Zendesk), public qui n'a pas durci (GitHub, Linear, Jira, Asana) ; écart 16. Écartés : `ACTION_PENDING_MS` à 24 h pour `externe` ou `haut` (fixé par 8.2 ; `verify` couvre le risque) ; un `verify` d'événement (la date est sur la carte) |
| F6 | Les `undo` compensables écrasent le travail d'un collègue | retenue | Chaque `undo` compensable relit et lève `conflit` si l'état n'est plus celui écrit (HubSpot, Linear, Jira, Zendesk, Asana) ; Zendesk par `remove_tags` et `additional_tags` ; Outlook ne retire que sa catégorie ; Jira ne supprime pas un ticket commenté ; `lifecyclestage` retiré |
| F7 | Public `interne` pris dans le doute (Notion, Asana, Zendesk) | retenue | Notion toujours `externe` ; Asana `interne` seulement sans invité lu dans l'espace (`workspace_memberships`, ajouté à l'extrait) ; Zendesk `interne` pour la priorité seule ; écarts 6 et 11 |
| F8 | Contrôle des destinataires contraire au chapitre 06 | retenue | `refusedRecipient(entrée, allowedRecipients)` avant `prepare`, plus de contrôle après ; `recipients` du port = `participantsOf` ; test « réponse à tous vers une copie » ; ferme l'écart 5 du chapitre 06 |
| F9 | `teamActionAllowed` échoue ouvert | retenue en partie | Voir C6. Écartée : une colonne `portee` sur `actions` (touche 0080, chapitre 01) ; la lecture fermée suffit |
| F10 | `notion.commenter`, `zendesk.ajouter_note_interne` : `bas` mais irréversibles et notifiants | retenue | `moyen`, test « irréversible jamais bas », écart 10. Inexact dans l'objection : `needsClick` traite `bas` et `moyen` de même, le clic n'en dépend pas |
| F11 | HubSpot : version `2026-03` sans source pour l'écriture, `ASSOC` de mémoire | retenue en partie | Écritures sur `/crm/v3/objects` (note 06), lectures sur la version de la relève ; relire `ASSOC` par l'API des libellés bloque la PR 7d. Gardé : `findExisting` par marque, sans danger (il ne conclut jamais à l'absence ; un opérateur faux donne « incertain », comme son absence) |
| F12 | Gmail lit en direct par Pipedream, contre 9.4 | retenue | Écart 14 avec le compte des crédits ; `GET /profile` retiré (une lecture du fil par `prepare`) ; borne par la fiche (5 par décideur, 20 par `each`). Pas de plafond de plus : celui de la fiche suffit |
| F13 | `lastMessage` : 50 messages sans tri garanti | retenue | Toutes les pages (`@odata.nextLink`, 10 au plus), refus au-delà ; test sur deux pages |
| F14 | La marque `leon…` part chez le client | retenue en partie | Marque seulement pour les specs dont `findExisting` la cherche (`marker`) et jamais quand le public est `externe` ; `findExisting` vérifie sa présence (`hasMarker`) ; `zendesk.repondre` retrouve sa réponse par le texte, « incertain » sinon. Écartée : une mention réglable par organisation (9.6, point 6, la demande pour tout texte d'agent) |
