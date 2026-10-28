# Supprimer son compte, supprimer l'organisation

28/10/2026. Décisions d'Amos par questionnaire ; ce qui est marqué « (choix de Claude) » est à relire.

## Pourquoi

Aujourd'hui, personne ne peut supprimer son compte Leon, ni l'organisation. C'est un droit (RGPD) et un
prérequis avant d'ouvrir Leon à des clients.

## Le principe (Amos)

Ce qu'un employé produit appartient à la société : messages Slack, code GitHub, documents, conversations avec
les IA, discussions avec Leon. Le RGPD n'oblige pas à l'effacer. Donc :

- **Un membre qui supprime son compte**, c'est la personne qui part, pas son travail. On ne peut plus se
  connecter avec ce compte ni la contacter, et Leon arrête d'aller chercher des données dans ses outils. Tout
  ce qu'elle a produit reste à la société, et son nom reste affiché, suivi de « ancien membre ».
- **Le propriétaire qui supprime l'organisation**, c'est le compte Leon de la société qui disparaît : là, tout
  est effacé.

## Décisions d'Amos

1. **Ses données restent**, avec la même visibilité qu'avant : ce qui était partagé avec l'équipe le reste, ce
   qui était privé le reste aussi (plus visible de personne, mais toujours à la société). Cela vaut pour ses
   conversations IA captées, les documents de ses connecteurs et ses discussions avec Leon.
2. **Son nom reste**, suivi de « ancien membre », traduit dans la langue de celui qui regarde (pas en dur).
3. **Le dernier propriétaire transfère d'abord.** S'il reste d'autres membres, il doit nommer un autre
   propriétaire. S'il est seul, supprimer son compte supprime l'organisation (voir plus bas).
4. **Tout de suite**, sans délai de grâce.
5. **Garde-fous** : le mot de passe Leon, plus le code de l'application si la 2FA est activée ; taper un mot à
   la main pour confirmer ; un e-mail de confirmation après coup.
6. **Supprimer l'organisation entière** est dans ce lot.

## Hors de ce lot

- **L'export des données** (coché dans le premier questionnaire) : un lot à part, juste après (choix de Claude).
- **Lire les discussions d'un ancien membre** côté admin : elles sont gardées, mais aucun écran ne les montre
  encore. Ce serait le même lot que l'export (choix de Claude).
- **Révoquer les accès chez chaque outil** (Google, Slack, GitHub…) : les secrets sont effacés de Leon, ce qui
  coupe l'accès de Leon. Seul Pipedream est prévenu, parce qu'il garde les jetons chez lui (choix de Claude).
- Un admin qui retire un membre, le changement de rôle dans Équipe : pas demandé.

## Ce qui serait un échec, même si ça marche

- Perdre une donnée produite par un membre qui supprime son compte (source, tour, document, discussion).
- Qu'un ancien membre puisse encore se connecter, utiliser un jeton d'API, ou recevoir un lien de
  réinitialisation.
- Que son adresse e-mail reste lisible quelque part dans Leon.
- Une organisation qui garde des membres sans propriétaire.
- Un compte ou une organisation à moitié supprimé : tout ce qui est en base se fait dans une seule transaction.
- Une suppression possible sans le mot de passe, ou par une route HTTP de Better Auth (`user.deleteUser` et la
  suppression d'organisation de Better Auth restent désactivés).

## Comment

### Supprimer son compte : ce qui se passe

Le compte n'est pas effacé : la ligne `user` reste, vidée et verrouillée (choix de Claude : `sources.owner_user_id`
est en `on delete cascade`, effacer la ligne effacerait ses données ; et `0019` ne montre les passages d'une
source que si son propriétaire est encore membre, donc l'adhésion reste aussi).

Dans une seule transaction :

- **`user`** : `deleted_at` posé (nouvelle colonne), e-mail remplacé par une adresse qui ne mène nulle part et
  ne peut pas servir (`ancien-<id>@leon.invalid`), `emailVerified`, `image`, `about` remis à vide,
  `twoFactorEnabled` à faux. Le **nom reste**. L'adresse d'origine redevient libre : la personne pourra se
  réinscrire plus tard, comme quelqu'un de nouveau.
- **Effacés** : ses comptes Better Auth (le mot de passe), ses sessions (déconnecté partout), sa 2FA, ses jetons
  d'API (révoqués : la CLI et l'extension s'arrêtent), ses liens d'invitation encore valables, ses connexions
  (Leon arrête de relever ses outils ; leurs sources restent, `connection_id` passe à nul comme dans
  `deleteConnection`).
- **Gardés tels quels** : ses sources (conversations IA, documents, messages relevés), leurs tours et passages,
  ses discussions avec Leon, ses points du matin, son adhésion. Un point du matin n'est plus jamais recalculé pour
  un compte supprimé (`refreshBriefing` s'arrête tout de suite), pour ne pas payer d'appel au modèle.
- **Rôle** : s'il était propriétaire ou admin, son rôle passe à `member` ; s'il était le seul propriétaire avec
  d'autres membres actifs, le successeur choisi devient propriétaire, sinon refus.
- **Autre organisation** : s'il est aussi membre d'une autre organisation, refus (choix de Claude : un compte n'a
  qu'une organisation en pratique, et ses connexions là-bas resteraient actives).

Un « membre actif », c'est une adhésion dont l'utilisateur n'a pas de `deleted_at`. Partout où Leon compte ou
liste les membres pour décider (propriétaires restants, seul membre, choix du successeur), il ne compte que les
actifs.

Après la transaction, sans faire échouer la suppression : `forgetPipedreamUser` pour chaque connexion Pipedream
effacée, puis l'e-mail de confirmation à l'adresse d'origine (relevée avant). Les erreurs vont dans `logError`.

### Supprimer l'organisation : ce qui se passe

Réservé au propriétaire, depuis l'onglet Équipe (choix de Claude). Aussi ce qui se passe quand le seul membre
actif supprime son compte.

Dans une seule transaction : la ligne `organization` est supprimée, toute sa mémoire part par `tenant_id … on
delete cascade` (sources, tours, passages, connexions, discussions, points, jetons, liens d'invitation…). Les
comptes des membres (actifs et anciens) qui n'appartenaient qu'à cette organisation sont effacés pour de bon,
ligne `user` comprise (choix de Claude : sans organisation, un compte ne mène à rien ; un compte qui appartient
aussi à une autre organisation reste).

Après la transaction : `forgetPipedreamUser` pour chaque connexion Pipedream de l'organisation, et un e-mail à
chaque membre actif, à son adresse relevée avant (choix de Claude : prévenir tout le monde, pas seulement le
propriétaire).

### Les écrans

**Profil**, en bas après « À propos de vous » : un bloc « Supprimer mon compte », une phrase qui dit ce qui part
et ce qui reste, et un bouton rouge. Il ouvre le `Dialog` du kit (`src/components/verre/ui/dialog.tsx`) :

- ce qui se passe : vous ne pourrez plus vous connecter ; Leon arrête de relever les outils que vous avez
  branchés (un admin devra les rebrancher pour l'équipe) ; ce que vous avez produit reste à l'organisation, sous
  votre nom suivi de « ancien membre » ;
- **s'il est le seul propriétaire avec d'autres membres actifs** : un `Select` « Nouveau propriétaire »
  obligatoire (choix de Claude : il n'existe aucun moyen de changer un rôle aujourd'hui ; nommer le successeur
  dans le dialogue évite un écran de plus) ;
- **s'il est le seul membre actif** : le dialogue dit que l'organisation entière sera supprimée, comme ci-dessous ;
- le mot de passe Leon, le code à 6 chiffres si la 2FA est activée, et le mot à taper ;
- « Supprimer définitivement », actif seulement quand le mot est tapé.

**Équipe**, pour le propriétaire seulement, en bas : un bloc « Supprimer l'organisation », même dialogue, qui dit
que tout est effacé pour tout le monde, avec le nombre de membres et de sources.

Le mot à taper : « SUPPRIMER » en français, « DELETE » en anglais, pour les deux (choix de Claude).

Après la suppression : redirection vers l'écran de connexion, avec « Votre compte a été supprimé » ou
« L'organisation a été supprimée ».

**« Ancien membre »** : là où Leon affiche le nom d'un membre, un ancien membre apparaît comme « {nom} (ancien
membre) » / « {name} (former member) », par une clé de traduction. Les requêtes qui rendent des noms rendent
aussi `former: boolean`. Endroits : la liste de l'onglet Équipe (`members.ts`) et l'auteur d'un document
(`documents/documents.ts`) ; les connexions d'un ancien membre sont effacées, elles n'apparaissent plus. Dans
Équipe, les anciens membres sont listés à part, sans actions. Limite connue : la recherche « de : <nom> » rapproche
un nom d'une adresse (`search/people.ts`) ; pour un ancien membre, l'adresse ne mène plus à ses messages relevés.

### Les actions serveur

`deleteAccountAction(password, code, word, successorId?)` dans `src/app/(app)/reglages/actions.ts`, et
`deleteOrganizationAction(password, code, word)` (propriétaire seulement). Même ordre pour les deux :

1. Limite d'essais : `passwordCheckAllowed()`.
2. Le mot tapé correspond à celui de la langue courante.
3. `auth.api.verifyPassword` (route serveur seulement chez Better Auth).
4. Si `twoFactorEnabled` : `auth.api.verifyTOTP` avec la session. Pour une session déjà ouverte, Better Auth ne
   compte pas les échecs : c'est la limite de l'étape 1 qui protège.
5. Relève ce qu'il faut avant : adresses e-mail, langue, `externalUserId` Pipedream.
6. La transaction.
7. Pipedream et e-mails, sans faire échouer.
8. Les cookies de session sont effacés et la page part vers la connexion.

### La base (migration `0039-suppression-compte.sql`)

- `alter table "user" add column deleted_at timestamptz`, et rien d'autre : `leon_app` peut faire tout le reste
  lui-même (les tables de Better Auth, `api_tokens` et `invitation_links` n'ont pas de RLS ; les jetons se
  révoquent et les liens s'expirent par `update` ; les connexions ont `acl = [organisation]`, donc visibles de
  tout membre ; les cascades de clés étrangères passent outre la RLS).

À appliquer aussi sur Supabase une fois fusionnée, avec l'accord d'Amos.

### L'e-mail

Un module à part, `src/server/email/account-deleted.ts`, qui envoie par Resend comme `sendPasswordReset`
(`auth.ts`, qu'on ne touche pas : la PR #66 de David le modifie), dans la langue de la personne. Deux textes :
« Votre compte Leon a été supprimé » et « L'organisation X a été supprimée par son propriétaire », avec la date.
Pas de « répondez à ce message » (l'expéditeur n'est peut-être pas lu) : « Si vous n'êtes pas à l'origine de
cette suppression, prévenez l'administrateur de votre organisation. » Rien n'est envoyé si Resend n'est pas
configuré.

### Textes

Clés `deleteAccount.*`, `deleteOrganization.*` et `members.former` dans `messages/en.json` et `messages/fr.json`,
mêmes clés dans les deux (test `src/i18n/messages.test.ts`).

## Tests

- **En base** :
  - supprimer son compte : la ligne `user` reste avec `deleted_at`, sans e-mail d'origine ni mot de passe ; plus
    de session, de 2FA, de jeton valable, de lien d'invitation valable, de connexion, de point du matin ; ses
    sources, tours, passages et discussions sont toujours là, et un collègue voit toujours ce qui était partagé ;
  - il ne peut plus se connecter (`signInEmail` échoue) ni demander un lien de réinitialisation ;
  - seul propriétaire avec d'autres membres actifs : refus sans successeur, refus avec un successeur d'une autre
    organisation ou un ancien membre, et avec un bon successeur, celui-ci devient propriétaire ; un ancien membre
    ne compte pas comme membre actif ;
  - seul membre actif : l'organisation et toute sa mémoire disparaissent ;
  - supprimer l'organisation : refus pour un admin ou un membre ; pour le propriétaire, tout disparaît, les
    comptes de ses membres aussi, une autre organisation n'est pas touchée ;
  - personne ne peut supprimer le compte d'un autre en passant par les fonctions.
- **Unitaires** : mauvais mot de passe, mauvais code 2FA, mot mal tapé et limite d'essais ne touchent à rien ;
  Pipedream et l'e-mail qui échouent ne font pas échouer la suppression ; « ancien membre » s'affiche dans les
  deux langues.
- **À l'écran** : sur des comptes d'essai locaux, en français et en anglais, avec et sans 2FA ; un membre qui
  part (son nom « ancien membre » dans Équipe pour les autres) ; le seul propriétaire avec un autre membre ; la
  suppression de l'organisation.

## Laissé au développeur

- La disposition exacte des blocs et des dialogues, dans le style des onglets.
- Les jobs pg-boss déjà en file pour un compte supprimé : vérifier qu'ils s'arrêtent proprement.
