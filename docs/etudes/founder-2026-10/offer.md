# L'offre (18/10/2026)

Méthode : la lentille Offres de `board/lenses.md` (un résumé de cadre publié, jamais présenté comme les mots de son auteur). Matière première : `board.md` (conditions C1 à C10), `panel/results.md` (19 achats sur 100, 60 refus pour « confiance »), `competitors.md` (le trou : dater et attribuer chaque fait sur du brut cité, y compris depuis les conversations IA ; la menace : Anthropic et OpenAI), `pricing.md` (25 €), `numbers.json`.

## 1. Ce qu'on vend aujourd'hui, et pourquoi ça ne s'achète pas

`pitch-v1.md` vendait « la mémoire de votre équipe » : sept connecteurs, Gmail en tête, une extension navigateur, une interface, 25 €. Le panel a dit non à 81 %. Les 60 refus pour « confiance » tiennent en une phrase, celle de P002 : *« brancher le Gmail et le Drive de la boîte, plus une extension qui lit ce que mes devs disent à Claude, sur un service tenu par deux personnes sans structure derrière, je ne le ferai pas »*. Le conseil avait dit la même chose (C2, C4, C6). L'offre v1 demandait le maximum d'effort et de confiance avant de montrer la moindre preuve.

## 2. La liste des problèmes de l'acheteur

Dans ses mots, depuis le panel et les avis des concurrents. Avant, pendant, après.

**Avant d'acheter**
1. « Claude, ChatGPT ou Notion le font déjà pour 20 € » (20 acheteurs « déjà équipés », 0 % d'achat).
2. « Confier Gmail et Drive de toute la boîte à deux cofondateurs non immatriculés » (P002, P003, P010, P017, P023…).
3. « Pas de DPA, pas de liste de sous-traitants, où tourne le LLM ? » (P004, P018, P036, P045, P053).
4. « Et si Leon disparaît dans six mois, je fais quoi de ma mémoire ? » (P003, P020, P022, P082, P088).
5. « Ça va halluciner avec assurance sur nos données en français » (P005, P039, P047, P069).
6. « La promesse "chacun ne voit que ce à quoi il a accès", on me l'a déjà faite et ça a fuité » (P008, P009, P063, P072, P092, P095).
7. « Personne de mon réseau ne l'utilise » (10 acheteurs « demande à son réseau », 0 %).
8. « 25 € × 30 = 750 €/mois, pour quel gain mesurable ? » (P021, P026, P019).
9. « Mon équipe vit dans Slack, et Slack n'est pas dans la liste » (P005, P007, P022, P062, P097, P099).
10. « L'extension navigateur ne capte pas Claude Code, qui tourne dans mon terminal » (P009, P048, P055, P073).

**Pendant l'installation et l'essai**
11. « Six consentements OAuth, une extension sur quarante postes : ce n'est pas dix minutes, c'est un projet » (P029, P062, P094 ; lentille Produit).
12. « Mes salariés vont le vivre comme de la surveillance ; et le CSE ? » (P001, P010, P011, P065, P099).
13. « Le jour 1, la mémoire est vide » (lentille Produit, C4).
14. « Comment je sais que ça capte encore ? » (lentille Produit).
15. « Je veux vérifier moi-même, avec des questions dont je connais la réponse » (P042, P051, P056, P069, P079, P089).

**Après**
16. « Ça va me ressortir une vieille décision sans dire qu'elle a changé » (P068, P073 ; avis Glean et Notion dans `competitors.md`).
17. « Qui a dit quoi, c'est peu fiable » (avis concurrents).
18. « Un passage privé remonté par erreur à l'équipe, et c'est fini » (C6).
19. « Je paie des sièges pour des gens qui ne s'en servent pas » (P063 : « le per-seat laisse les deux tiers de l'équipe dehors »).
20. « Anthropic peut ajouter la même chose en une version » (lentille Monopole ; `competitors.md`).

## 3. Les solutions, notées et triées

Valeur pour l'acheteur (1-5) × coût de livraison (1-5, d'après `numbers.json` et le code existant). On garde haute valeur, bas coût.

| problème | solution | valeur | coût | gardé ? |
|---|---|:-:|:-:|:-:|
| 2, 11, 12 | **Pas de Gmail, pas de Drive, pas d'extension par défaut.** Le produit démarre sur Claude Code/Cursor + GitHub + Linear/Notion. Chaque connecteur s'ajoute connecteur par connecteur, quand l'acheteur le décide. | 5 | 1 (c'est du retrait) | oui, c'est le cœur |
| 10 | **Un agent local qui lit les sessions Claude Code et Cursor dans le terminal**, pas une extension navigateur. L'import Claude Code existe déjà (`src/cli/import-claude-code.ts`). | 5 | 2 | oui |
| 1, 20 | **Lecture par MCP depuis Claude, Cursor ou ChatGPT.** Leon ne remplace pas l'assistant, il l'alimente. Le serveur MCP existe. | 4 | 1 | oui |
| 5, 15, 8 | **Le test des 20 questions.** À l'installation, l'équipe écrit 20 questions dont elle connaît la réponse. Un tableau de bord montre le score. Moins de 15 bonnes réponses avec la bonne source au jour 30 : rien n'est facturé. | 5 | 2 (un formulaire, un compteur, un coût modélisé à 0,20 €/siège) | oui, c'est la garantie |
| 3, 4 | **Pack confiance** : DPA signable, liste des sous-traitants (quel LLM, hébergé où), export complet à tout moment (pas seulement à la résiliation), suppression sous 30 jours, page sécurité. | 5 | 2 (2 500 € d'avocat déjà dans `startup`) | oui, bonus n°1 |
| 18, 12 | **Relecture par l'auteur** : rien ne remonte à l'équipe sans un clic de la personne qui a eu la conversation. Signal visible de capture. | 5 | 2 (un écran de validation ; `triage.ts` propose déjà) | oui, bonus n°2 |
| 16 | **Chaque décision est datée, et « remplacée par » quand elle change.** Le modèle bi-temporel existe (`0003-memoire.sql`). | 4 | 2 | oui, bonus n°3 |
| 5, 17 | **« Je ne sais pas » plutôt qu'inventer**, et la citation exacte vérifiée (`quote.ts`). | 5 | 1 | oui, dans la promesse |
| 13 | **Rétro-chargement de l'historique** GitHub, Linear, Notion et des sessions existantes dès la première heure. | 4 | 2 (0,40 €/siège amorti) | oui |
| 19 | **Solo gratuit pour une personne**, puis 3 sièges minimum. On ne paie que les sièges actifs. | 4 | 2 (0,60 €/siège) | oui |
| 7 | **Référence par un pair** : trois équipes pilotes nommées et joignables. | 5 | 3 (il faut les gagner) | pas encore livrable, c'est le but de `launch.md` |
| 9 | **Slack en recherche fédérée** (API officielle Real-time Search, rien n'est copié). | 4 | 4 | plus tard, pas dans la promesse |
| 11 | Chat web Leon | 2 | 3 | retiré (lentille Produit) |
| 1 | HubSpot, Gmail, Drive, Meet | 3 | 4 | plus tard, à la demande d'équipes payantes |
| 2 | Immatriculation de la société | 5 | 1 | condition préalable, pas un argument |

## 4. L'offre empilée

**Le nom : « Leon, la mémoire des décisions de votre équipe dev »**, et l'offre de lancement **« Équipe fondatrice »**.

**Le cœur**, décrit par le résultat : *« Pourquoi on a fait ce choix, et comment on avait réglé ce bug : la réponse, avec la source, depuis l'outil IA que vous utilisez déjà. »* Capture des sessions Claude Code et Cursor par un agent local, GitHub, Linear, Notion, lecture par MCP.

**Les bonus**, chacun tue une objection :
1. **Pack confiance** (objections 3 et 4) : DPA, sous-traitants, export à tout moment, suppression sous 30 jours.
2. **Relecture par l'auteur** (objections 12 et 18) : rien ne remonte sans un clic.
3. **Décisions datées et remplacées** (objection 16).

**La garantie** : le test des 20 questions. Moins de 15 sur 20 au jour 30, rien n'est facturé. Coût modélisé dans `numbers.json` : 10 % des équipes non facturées le premier mois, soit 0,20 € par siège et par mois. La contribution reste à 20,24 € (81 %).

**Urgence et rareté, vraies** : 20 équipes fondatrices à 19 € garanti 12 mois, jusqu'au 31 janvier 2027. Deux fondateurs ne peuvent pas accompagner davantage de pilotes avec le test des 20 questions.

**Ce qui est retiré** : le chat web, Gmail, Drive, HubSpot et Meet au lancement, l'extension navigateur comme capteur principal, les questions « combien » dans la promesse.

## 5. L'équation de valeur, avant et après

| | v1 | v2 | ce qui bouge |
|---|:-:|:-:|---|
| Résultat rêvé | 7 | 7 | inchangé : « pourquoi on a fait ce choix » parle déjà |
| Probabilité perçue d'y arriver | 2 | 6 | le test des 20 questions, « je ne sais pas » plutôt qu'inventer, la citation vérifiée, le pack confiance |
| Temps jusqu'au résultat | 3 | 6 | rétro-chargement, pas de Gmail à faire valider, Solo gratuit en dix minutes |
| Effort et sacrifice | 2 | 7 | pas d'extension sur chaque poste, connecteur par connecteur, relecture par l'auteur, MCP dans l'outil existant |

Le score monte surtout sur l'effort et la probabilité, les deux lignes où la lentille Offres voit mourir la plupart des offres. Le résultat rêvé ne bouge pas : il était déjà bon.

**Le test « à 50 € » (C7)** : à 50 €, l'offre v2 reste-t-elle le choix évident pour une équipe de dix développeurs qui vivent dans Claude Code ? Le panel place le seuil « trop cher » à 60-80 € chez les acheteurs. À 50 €, elle reste achetable pour eux, mais plus « évidente » : le choix évident s'arrête vers 35 €. C'est la marque d'une offre qui n'est pas encore un commodity, sans être encore irrésistible.

## 6. Le re-test sur le panel

Mêmes 20 premières cartes que le panel de 100 (P001 à P020, graine 7), avec `pitch.md` v2. Résultat dans `panel-v2/results.md`.

**Résultat : 5 achats sur 20 en v2, contre 5 sur 20 pour les mêmes acheteurs en v1. Le taux global ne bouge pas ; la composition change complètement.**

| | v1 (« mémoire de l'équipe », 7 connecteurs) | v2 (« décisions de l'équipe dev ») |
|---|:-:|:-:|
| Profils techniques (CTO, fondateur très IA), 9 cartes | 1 achat (P011) | **4 achats** (P002, P003, P011, P017) |
| Profils commerciaux et agences, 11 cartes | 4 achats (P009, P013, P016, P020) | 1 achat (P009) |

Trois acheteurs basculent de non à oui, tous techniques : une CTO « power user » (P002), une fondatrice « prudente RGPD » (P003, c'est la première conversion de ce comportement, à 0 % sur 100 en v1) et un CTO « surchargé » (P017, idem). Trois basculent de oui à non, tous commerciaux ou agences : *« le produit parle à une équipe de développement ; moi je suis côté commercial »* (P013), *« rien ne capte les réunions ni les mails, donc les engagements clients, qui sont ma vraie fuite, resteraient dehors »* (P016).

**Ce que le re-test confirme** : le recentrage sur les équipes dev (condition C1 du conseil) fait passer le taux d'achat de ce segment de 11 % à 44 % sur 20 cartes, et il convertit pour la première fois des profils prudents. Il perd les agences et les commerciaux, ce qui est le prix d'un marché choisi.

**Les objections qui restent, dans l'ordre** :
1. **« Qui voit quoi une fois la décision remontée ? »** (9 acheteurs sur 20 : P007, P008, P013, P014, P017, P018, P019). La v2 répond à la confidentialité individuelle (« privée à son auteur ») mais pas au cloisonnement **par projet ou par équipe**. C'est l'objection n°1 de la v2 et elle est bon marché à traiter : des espaces par projet avec des membres, ce que les ACL par tableau `uuid[]` du code permettent déjà. **À ajouter à l'offre avant tout lancement.**
2. **« Un agent sur chaque poste, mes devs vont y voir un mouchard »** (P001, P010, P011, P012, P015). La relecture par l'auteur ne suffit pas à l'écrit : il faut une page « ce que l'agent capte et ne capte pas », et un déploiement **à l'initiative de chaque développeur** (le Solo gratuit), pas imposé par le CTO.
3. **« Si personne ne clique, la mémoire reste vide »** (P004, P006) : la relecture par l'auteur a un coût d'adoption. À mesurer sur les pilotes (part des décisions proposées qui sont validées).
4. Pour les non-dev : les emails, les réunions et Slack. Ce sont les connecteurs à venir, à la demande d'équipes payantes, pas une raison de ré-élargir l'offre maintenant.

Les prix ne bougent pas : les acheteurs v2 répondent 5 / 12 / 40 / 70, comme en v1.

Limite habituelle : acheteurs simulés, 20 cartes. Le signal porte sur la direction (dev oui, non-dev non) et sur les objections, pas sur le taux.

## Règles respectées

- Chaque promesse est livrable : l'agent local et l'import Claude Code, le serveur MCP, la vérification des citations, le modèle bi-temporel et le tri existent dans le code ; le DPA et la page sécurité sont budgétés.
- Pas de faux avis, pas de fausse rareté : la limite de 20 équipes vient de la capacité de support des fondateurs.
- Les garanties et les mentions sur les données doivent être relues par un avocat (droit de la consommation, RGPD). Ce document n'est pas un avis juridique.
