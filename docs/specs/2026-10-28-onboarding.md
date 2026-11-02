# Onboarding : les premières minutes après l'inscription

**Statut :** cadrage validé par Amos le 28/10/2026 (questionnaire et maquettes), à relire par David.

**But :** juste après l'inscription, Leon demande à la personne son service, son poste et son niveau, puis l'aide à brancher ses outils et à inviter ses collaborateurs. L'idée vient de l'onboarding de GitLab : un écran de bienvenue avec des questions à gauche et un aperçu à droite qui suit les réponses. Dès la première minute, Leon s'adapte au poste : il propose les bonnes connexions, donne des exemples de questions dans le Chat et sait pour qui il écrit le point du matin.

**Maquette :** [`2026-10-28-onboarding-maquette.html`](2026-10-28-onboarding-maquette.html), à ouvrir dans un navigateur depuis le dépôt (les logos viennent de `public/logos/`). Elle est cliquable : étapes, langue, liens d'invitation, vue d'un invité et outils déjà branchés.

## Pourquoi

- Aujourd'hui, l'inscription demande le nom, l'e-mail, le mot de passe et le nom de l'entreprise, puis ouvre directement l'appli. Leon ne sait rien du poste de la personne. Le seul indice est le champ libre « À propos de vous » (Réglages › Profil), que lit le point du matin, et peu de gens le remplissent.
- Face à un Chat vide et à une page Connexions de 42 outils, un nouveau venu ne sait pas par où commencer. L'onboarding lui montre quoi brancher et quoi demander, selon son poste.
- Amos veut, plus tard, que **le poste et le niveau décident de ce que chacun voit** dans Leon (voir « Le chantier suivant »). Ce chantier pose les données dont les droits auront besoin : chaque membre a un service, un poste et un niveau, et c'est un administrateur qui les fixe.

## Vocabulaire

- **Service** (en anglais *Department*) : Dev, Sales, Support… Le mot « équipe » est déjà pris deux fois. Réglages › Équipe désigne les membres de l'espace, et « Mon équipe » de la PR #69 désigne les gens qu'on manage.
- **Collaborateurs** (*Teammates*) : les personnes qu'on invite dans l'espace.
- **Rôle dans l'espace** : `owner`, `admin` ou `member` (colonne `member.role`, inchangée). Ne pas confondre avec le poste.

## Décisions d'Amos (28/10/2026)

1. **Moment.** Un écran « Welcome to Leon » juste après l'inscription, avant d'entrer dans l'appli. L'inscription elle-même ne change pas.
2. **Trois étapes courtes** pour qui crée l'espace : *Vous*, *Vos outils*, *Collaborateurs*. Les deux dernières peuvent se passer.
3. **Version courte pour un invité**, en deux étapes : *Vous*, *Vos outils*. **L'invité ne choisit ni son poste ni son niveau.** L'administrateur les fixe en créant le lien d'invitation ; l'invité les voit, verrouillés, sans pouvoir les changer. Si l'administrateur le met stagiaire, il est stagiaire.
4. **Poste en deux temps :** d'abord le service, puis un poste pris dans une liste propre à ce service.
5. **Niveau de séniorité sur une échelle générale de 8 crans**, la même dans toutes les entreprises. Rien ne se règle entreprise par entreprise.
6. **Le créateur de l'espace répond aussi** à trois questions sur l'entreprise et ses attentes : la taille de l'entreprise, les outils utilisés (c'est l'étape 2) et ce qu'il attend de Leon.
7. **Les réponses servent** à proposer les bonnes connexions, à nourrir le point du matin, à donner des exemples de questions dans le Chat et à inviter les collaborateurs.
8. **Service, poste et niveau sont obligatoires** à la création d'un lien d'invitation.
9. **« À propos de vous » pré-rempli, plus tard.** Une fois les outils branchés et les premières données lues, Leon propose un texte « À propos de vous » tiré de ce qu'il a lu. La personne le corrige, le complète et l'enregistre. Ce n'est pas une question de l'onboarding.
10. **Anglais par défaut, et choix de la langue dès le début** de l'onboarding (English / Français).
11. **Libellés :** le bouton qui ajoute une ligne d'invitation s'appelle « Add a teammate » / « Ajouter un collaborateur ». Le champ « service » s'appelle « Department » / « Service ».
12. **Les droits par niveau sont un second chantier**, à faire après celui-ci et avec David.
13. **Un outil d'équipe déjà branché dans l'espace** (GitHub, Linear…) s'affiche « Connected by Amos » à l'étape 2. Il n'est pas coché, et le nouveau venu n'a rien à faire, ce qui évite de synchroniser deux fois le même outil. Un lien discret « Connect my account » lui permet quand même de brancher son propre compte, par exemple pour agir en son nom sur GitHub. Les outils personnels (Gmail, Outlook, Google Drive, Slack) se branchent toujours compte par compte.

Décidé avec la session « Authentification rapide multi-fournisseurs » (branche `claude/fast-auth-providers-82f1ca`, validé par Amos d'après elle) :

14. **L'adresse de l'onboarding est `/bienvenue`.** Une personne qui se connecte par Google, Microsoft ou GitHub sans avoir d'espace y arrive déjà connectée, sans organisation et sans mot de passe. L'étape 1 lui demande alors le nom de l'entreprise et crée l'organisation, dont elle devient propriétaire. On ne lui redemande ni son nom ni son e-mail.
15. **Invitation et connexion Google, c'est l'autre session qui le gère.** Sur `/invitation/<token>`, le bouton « Rejoindre » appelle `joinWithInvitation`. La personne ne passe par `/bienvenue` pour créer une organisation que si elle abandonne avant de rejoindre.

## Objectifs

- Chaque membre d'un espace a un service, un poste et un niveau.
- Un nouveau venu sait en moins d'une minute quoi brancher et quoi demander.
- Le point du matin sait pour qui il écrit dès le premier jour.
- Les liens d'invitation portent le service, le poste et le niveau de la personne invitée.

## Hors périmètre

- **Les droits d'accès par niveau ou par ligne hiérarchique.** Aucun droit de lecture ne change ici : ni les ACL, ni les politiques RLS sur les sources, les tours et les passages.
- **Le choix du manager de chaque membre.** C'est la PR #69 de David (organigramme), encore ouverte. Une fois fusionnée, on pourra ajouter le manager au formulaire d'invitation.
- **L'envoi d'e-mails d'invitation.** Leon n'envoie pas d'e-mails : comme aujourd'hui, l'administrateur envoie le lien lui-même.
- **Inviter quelqu'un comme administrateur** depuis l'onboarding. Un lien fait toujours entrer un membre.

## Ce qui serait un échec, même si ça marche

- Un invité qui peut changer son poste ou son niveau, par l'interface ou par une action serveur appelée à la main.
- Un texte en dur, ou un écran qui mélange l'anglais et le français.
- Un onboarding qui bloque tant qu'on n'a pas branché un outil ou invité quelqu'un.
- Un « À propos de vous » pré-rempli avec des données que la personne ne pourrait pas ouvrir elle-même.
- Une boucle de redirections entre `/bienvenue`, `/connexion` et l'appli.
- Une personne qui crée un deuxième espace par erreur alors qu'elle en a déjà un.
- Chaque nouveau membre qui resynchronise GitHub, Linear ou Jira parce que l'onboarding l'y a poussé.

## Le parcours

### Qui voit quoi, et quand

| Personne | Étapes | Particularité |
| --- | --- | --- |
| Crée un espace avec le formulaire d'inscription | Vous, Vos outils, Collaborateurs | L'organisation existe déjà. |
| Arrive par Google, Microsoft ou GitHub sans espace | Vous, Vos outils, Collaborateurs | Champ « Company name » à l'étape 1. L'organisation est créée quand l'étape 1 est validée. |
| Rejoint par un lien d'invitation | Vous, Vos outils | Service, poste et niveau affichés verrouillés. |

**La règle de redirection :** l'appli renvoie sur `/bienvenue` toute personne connectée qui n'a pas validé l'étape 1, quel que soit son chemin d'arrivée. Une fois l'étape 1 validée, on ne force plus rien : les étapes 2 et 3 peuvent se passer et ne reviennent pas.

### Étape 1 « About you » / « Vous »

- **Langue** en tête (English | Français). Le choix s'applique tout de suite à l'écran. Il s'enregistre comme celui de Réglages (cookie `leon-locale`, voir `setLocaleAction`).
- **Créateur :**
  - le nom de l'entreprise, seulement s'il arrive par Google, Microsoft ou GitHub sans espace ;
  - le service, puis le poste ;
  - le niveau ;
  - la taille de l'entreprise ;
  - ce qu'il attend de Leon (plusieurs choix possibles).
- **Invité :** une carte verrouillée montre son service, son poste et son niveau, avec « Set by an Acme admin. Something wrong? Ask them to change it. ». Il dit seulement ce qu'il attend de Leon.
- **Aperçu à droite,** qui suit les réponses : la fiche de la personne (initiale, nom, poste, niveau, service, rôle dans l'espace), les outils que Leon proposera de brancher et deux exemples de questions pour le Chat.

### Étape 2 « Your tools » / « Vos outils »

- Les outils, regroupés par famille, avec les familles et les logos de la page Connexions. Ceux conseillés pour le service portent l'étiquette « Recommended » et sont déjà cochés, sauf ceux déjà branchés dans l'espace.
- À droite, la liste « To connect » reprend les outils cochés, chacun avec un bouton « Connect ». Ce bouton lance **le même flux que la page Connexions** : OAuth, clé collée ou Pipedream selon l'outil. Une fois l'outil branché, la personne revient sur `/bienvenue`, à l'étape 2, et l'outil apparaît comme « Connected ».
- **Outil d'équipe déjà branché dans l'espace :** il est affiché « Connected by <nom> » et n'est pas coché. Il apparaît dans une carte « Already connected for your workspace », avec un bouton secondaire « Connect my account » et la note « Optional. To act under your own name, for example on GitHub. ».
- **Outils personnels** (Gmail, Outlook, Google Drive, Slack) : jamais « déjà branchés » pour quelqu'un d'autre. Chacun branche le sien.
- Un lien « I'll connect them later » permet de passer l'étape.

### Étape 3 « Invite your teammates » / « Collaborateurs »

- Pour le créateur seulement. Un lien par personne, et pour chaque ligne :
  - « Name », pour s'y retrouver entre les liens ;
  - le service, le poste et le niveau, **obligatoires** ;
  - « Create link », qui affiche le lien, un bouton « Copy » et la mention « Send it yourself. It works once and expires in 7 days. ».
- « Add a teammate » ajoute une ligne. À droite, un petit organigramme montre le créateur et chaque invité, avec « Draft » ou « Link created ».
- Le même formulaire remplace l'actuel « Invite a member » dans Réglages › Équipe.
- Un lien « I'll invite people later » permet de passer l'étape.

### Fin

« You're in », puis le bouton « Open Chat ».

### Plus tard : « About you » pré-rempli

- Quand Leon a lu assez de données venues des connexions de la personne, il lui propose un texte « About you » écrit à partir de **ses propres sources uniquement**, sous ses droits. Le texte apparaît une seule fois, en carte en haut du Chat. Ensuite, il reste modifiable dans Réglages › Profil, comme aujourd'hui.
- « Save » passe par `saveAbout` (`src/server/briefing/about.ts`), qui garde la limite de 500 caractères ; « Not now » ferme la carte.
- La maquette donne un exemple de texte.

## Les listes (proposées par Claude, à relire par Amos)

Ce sont des listes fixes, communes à toutes les entreprises. Chaque entrée a un identifiant stable et des libellés traduits dans `messages/en.json` et `messages/fr.json`. **Mon choix :** chaque service a aussi un poste « Other » / « Autre », sans texte libre, pour les intitulés absents de la liste.

**Niveaux (8, décidé) :**

| | Anglais | Français |
| --- | --- | --- |
| 1 | Intern | Stagiaire |
| 2 | Apprentice | Alternant |
| 3 | Junior | Junior |
| 4 | Mid-level | Confirmé |
| 5 | Senior | Senior |
| 6 | Lead | Lead |
| 7 | Head of / Director | Head of / directeur |
| 8 | C-level / Founder | C-level / fondateur |

**Services et postes :**

| Service (en / fr) | Postes (en) |
| --- | --- |
| Engineering / Dev | Backend engineer, Frontend engineer, Full-stack engineer, Mobile engineer, DevOps / SRE, QA engineer, Engineering manager, CTO |
| Product / Produit | Product manager, Product owner, Head of Product, CPO |
| Design / Design | Product designer, UX researcher, Art director |
| Data / Data | Data analyst, Data engineer, Data scientist |
| Sales / Sales | SDR / BDR, Account executive, Account manager, Sales ops, VP Sales |
| Marketing / Marketing | Growth marketer, Content marketer, Product marketing manager, Communications, CMO |
| Support & Customer Success / Support et succès client | Support agent, Customer success manager, Onboarding / Implementation, Head of Support |
| Operations & Finance / Ops et finance | Office manager, Accountant, Financial controller, CFO, COO |
| People / RH | Recruiter, HR generalist, Head of People |
| Legal / Juridique | Legal counsel, General counsel |
| Leadership / Direction générale | CEO / Founder, Managing director, Partner |

Les libellés français des postes sont dans la maquette.

**Outils conseillés par service :**

| Service | Outils |
| --- | --- |
| Engineering | GitHub, GitLab, Linear, Sentry, Jira, Notion, Slack |
| Product | Linear, Notion, Jira, Productboard, Miro, Fathom, Slack |
| Design | Miro, Notion, Linear, Google Drive, Slack |
| Data | GitHub, Notion, Google Drive, Jira, Slack |
| Sales | HubSpot, Pipedrive, Gmail, Gong, Fathom, Google Drive, Slack |
| Marketing | HubSpot, Notion, Google Drive, Asana, Gmail, Slack |
| Support | Intercom, Zendesk, Front, Linear, Gmail, Slack |
| Operations & Finance | Google Drive, Gmail, Notion, Airtable, Slack |
| People | Google Drive, Gmail, Notion, Slack |
| Legal | Google Drive, Outlook, Gmail, Notion |
| Leadership | Gmail, Slack, Google Drive, HubSpot, Fathom, Notion, Linear |

**Exemples de questions :** deux par service, en anglais et en français, donnés dans la maquette. Ce sont des textes fixes, pas générés par le modèle.

**Taille de l'entreprise :** 1–10, 11–50, 51–200, 201+.

**Attentes :** Find information fast, Prepare for meetings, Get a morning briefing, Keep track of my team, Onboard new hires, Answer customers faster.

## Ce que deviennent les réponses

- **Connexions :** le service donne les outils conseillés de l'étape 2. **Mon choix :** la page Connexions les met aussi en tête, sous « Recommended for your role », avec la même règle pour les outils déjà branchés.
- **Chat :** sur un Chat vide, deux exemples de questions selon le service. Un clic remplit le champ de saisie, sans envoyer.
- **Point du matin :** le service, le poste et le niveau s'ajoutent à ce qu'il lit (`buildBriefingPrompt`, à côté de `<a-propos>`), balisés comme le reste. **Mon choix :** comme pour « À propos de vous », un changement de poste ou de niveau marque les points comme périmés (voir `saveAbout`).
- **Invitations :** le service, le poste et le niveau voyagent avec le lien. Ils sont recopiés sur le membre quand il rejoint, dans la même transaction que `joinWithInvitation`.
- **Taille et attentes :** gardées, sans autre usage pour l'instant. **Mon choix :** les attentes peuvent décider de l'ordre des exemples de questions ; rien d'autre ne les lit.

## Données

Le bâtisseur choisit les noms et la forme. Les contraintes :

- **Le service, le poste et le niveau appartiennent à l'appartenance** (`member`), pas à l'utilisateur : ce sont des faits sur la personne dans cette entreprise. `member.role` existe déjà (`owner`, `admin`, `member`), le poste a donc besoin d'une autre colonne.
- **Le lien d'invitation** (`invitation_links`) porte les mêmes trois valeurs et le nom saisi. Le serveur refuse un lien sans service, sans poste ou sans niveau, et refuse un poste qui n'appartient pas au service choisi.
- **On stocke des identifiants**, jamais des libellés. Un identifiant inconnu, parce que la liste a changé, ne doit rien casser : on l'affiche comme « Other » / « Autre ».
- **La taille** appartient à l'organisation, **les attentes** à l'appartenance. On garde aussi la date de validation de l'étape 1 : c'est elle que lit la règle de redirection.
- **Qui écrit quoi :**
  - le créateur fixe son service, son poste et son niveau à l'étape 1 ;
  - un propriétaire ou un administrateur fixe ceux de n'importe quel membre dans Réglages › Équipe ;
  - un membre ne modifie jamais les siens.
- **Mon choix pour faire respecter cette règle :** une condition dans la requête SQL d'écriture, sur le modèle d'`isAdminRole` et d'`usable()` dans `src/server/auth/members.ts`. Pas de déclencheur sur `member`, la table de Better Auth sans RLS. Deux exceptions :
  - l'étape 1 du créateur, qui n'écrit que sa propre ligne, et seulement tant que l'étape 1 n'est pas validée ;
  - la recopie faite par `joinWithInvitation`.

  Des tests en base montrent qu'un membre ne peut changer ni les valeurs d'un autre, ni les siennes, même en appelant l'action serveur à la main.
- **Migration :** `main` en est à 0039 au 28/10 au soir. La #69 de David ajoute aussi une 0036, ce qui fait déjà conflit avec `main`. On prend le numéro libre au moment de fusionner (0043 au 2/11), et on vérifie `rls-coverage.db.test.ts`.

## Comptes existants (mon choix)

- **Propriétaires existants :** ils voient l'étape 1 une fois, à leur prochaine connexion, puisqu'ils fixent leur propre poste. Pas d'étapes 2 et 3.
- **Membres et administrateurs existants :** ils voient l'étape 1 dans sa version d'invité. Si personne n'a encore fixé leur poste, la carte dit « Not set yet. An admin will set it. ». Ils ne sont pas bloqués.
- Les comptes de démo locaux suivent la même règle.

## Coordination

- **Session « Authentification rapide multi-fournisseurs »** (`claude/fast-auth-providers-82f1ca`) :
  - elle crée `ONBOARDING_PATH = '/bienvenue'` dans `src/server/auth/session.ts` ;
  - `requireUserContext()` y renverra une session sans organisation, ce qui n'est pas encore sur sa branche au 28/10 ;
  - `/bienvenue` ne doit donc pas appeler `requireUserContext()` : elle lit `getSession()` ;
  - pour une personne sans organisation, l'étape 1 crée l'organisation pour `session.user.id`, comme `createUserWithOrganization` mais sans créer l'utilisateur ;
  - la première des deux branches qui arrive sur `main` crée la constante, et l'autre la reprend.
- **PR #69 de David :** elle touche Réglages › Équipe (`members.tsx`, `members.ts`), comme le lot 2. On fusionne l'une, puis on rebase l'autre. Elle ajoute des tables (`reporting_lines`, `manager_follows`) mais aucune colonne de poste : pas de conflit de données.

## Lots proposés

Un sujet par PR, dans cet ordre :

1. **Données, `/bienvenue` et étape 1.**
   - Les colonnes et la migration.
   - La règle de redirection et le choix de la langue.
   - L'étape 1 du créateur, avec la création d'organisation pour une arrivée par Google.
   - Les comptes existants.
   - Toutes les listes, dans `messages`.
2. **Invitations.**
   - Le lien porte le service, le poste et le niveau, dans Réglages › Équipe et à l'étape 3.
   - La vue de l'invité.
   - La modification par un administrateur dans Réglages › Équipe.
3. **Étape 2.**
   - Les outils conseillés et la règle des outils déjà branchés.
   - « Connect my account ».
   - Le retour sur `/bienvenue` après un branchement.
4. **Chat et point du matin.**
   - Les exemples de questions sur le Chat vide.
   - Le poste et le niveau dans le point du matin.
   - Les outils conseillés en tête de Connexions.
5. **« About you » pré-rempli.**
   - La génération à partir des sources de la personne.
   - La carte en haut du Chat.

## Ce qui reste au bâtisseur

- Les noms des tables, des colonnes, des composants et des routes, sauf `/bienvenue`.
- La mise en page exacte, dans le style Verre + signal et dans l'esprit de la maquette : deux colonnes au-dessus de 1024 px, une seule en dessous.
- Le moment exact où il y a « assez de données » pour proposer « About you », et le prompt qui l'écrit. Une seule contrainte : on lit sous les droits de la personne, et on ne propose le texte qu'une fois.
- Comment revenir sur `/bienvenue` après un branchement OAuth. Une piste : une adresse de retour autorisée dans le cookie `oauth-cookie`, limitée à `/bienvenue` et `/connexions`.
- Comment reconnaître un outil « déjà branché dans l'espace » : par exemple, une connexion de l'organisation pour ce fournisseur, créée par quelqu'un d'autre et partagée avec l'équipe.

## Le chantier suivant : les droits par niveau (pas ici)

Ce qu'Amos a dit, à reprendre avec David :

- **Ce qu'on voit des autres :** on voit les données des gens de sa ligne, c'est-à-dire ceux qu'on manage, directement ou non. Rien de ceux de même niveau, rien de ceux au-dessus. Le lien de manager vient de la #69.
- **Les documents sensibles :** un stagiaire ne lit pas les documents du conseil d'administration. Le niveau sert à protéger ces documents.

Restent à trancher à ce moment-là :

- **Ce qu'un manager voit d'un membre de son équipe.** Seulement ce qui est déjà partagé (tickets, PR, réunions, documents partagés), comme dans la #69 ? Ou aussi le privé (mails, Drive, messages privés, conversations avec l'IA) ? Le privé pose une question juridique (secret des correspondances, CNIL), et la #69 a posé l'inverse.
- **Comment Leon sait qu'un document est réservé à la direction.** Il peut suivre les droits de l'outil d'origine, laisser un administrateur marquer un dossier, ou classer les documents lui-même.
