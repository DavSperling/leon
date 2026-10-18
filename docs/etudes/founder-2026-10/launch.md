# Le lancement (18/10/2026)

Responsable du lancement. Matière première : `board.md` (C1 à C10, trois expériences), `offer.md` (offre v2, objection n°1 : le cloisonnement par projet), `pricing.md` (A/B 19 € et 29 €), `panel/results.md` et `panel-v2/results.md` (19 % puis 25 % d'achat simulé : une **borne haute**, pas une prévision), `numbers.json` et `cfo.md` (seuil 337 sièges, trésorerie 53 686 €, levier n°1 : raccourcir la rampe), `customer.json`.

`marketing.md`, `brand.md` et `ops.md` n'existaient pas au moment d'écrire. Tout ce qui en dépend est marqué **[H]** (hypothèse à remplacer par leur contenu) : calendrier marketing J−14, CAC maximum, délais fournisseurs, routines.

**État technique réel au 18/10** (`docs/specs/2026-10-13-premier-jet.md`, `main` au 14/10, mémoire des sessions) : TypeScript, Postgres avec RLS par fait, pipeline triage → extraction → rangement (Haiku 5.5, décision D16 du 15/10), import des sessions Claude Code (`src/cli/import-claude-code.ts`), extension navigateur, serveur MCP à jeton personnel, interface de lecture. **Pas encore faits** : l'inversion « brut + étiquetage léger + pgvector » (le code cherche en plein texte, migrations 0001 à 0006 sans embeddings), l'agent local Cursor, le cloisonnement par projet (les principals sont « moi » et « l'équipe », rien entre les deux), la relecture par l'auteur (le tri propose, l'écran « À vérifier » existe en spec, pas le flux complet), le tableau de bord des 20 questions, **les connecteurs GitHub, Linear et Notion** (aucun fichier dans `src/server` sur `main` ; ils sont en cours dans les PR #18 à #20 d'Amos « Connecteurs v1 », ouvertes le 15/10 et non fusionnées au 18/10, ce qui raccourcit le chemin critique si elles passent), l'export et la suppression, le déploiement. La société n'est pas immatriculée, il n'y a pas de DPA, et la base Supabase n'a pas de sauvegarde.

Ce dernier paragraphe est la contrainte principale du plan : l'offre v2 promet plus que le code ne fait, et le calendrier ci-dessous dit dans quel ordre le code rattrape l'offre.

---

## Étape 1. Le test avant de dépenser (lundi 20 octobre → vendredi 14 novembre 2026)

Leon est un abonnement. Le test adapté n'est pas une pré-vente de produit mais une **offre « membre fondateur » payée d'avance** : l'« Équipe fondatrice » de `offer.md` (19 € par siège garanti 12 mois, 20 équipes, jusqu'au 31/01/2027), vendue avant que le produit complet existe, à des gens qui mettent une carte. Les trois expériences du conseil s'y ajoutent : elles répondent à trois questions différentes et aucune ne remplace les autres.

| expérience | question à laquelle elle répond | condition du conseil |
|---|---|---|
| (a) banc d'essai à l'aveugle | le produit est-il **dix fois mieux** que ce que l'acheteur possède déjà ? et l'inversion brut-d'abord tient-elle ? | C5 |
| (b) 12 entretiens | le **problème** existe-t-il chez des gens qu'on ne connaît pas, et paient-ils ? | C1, C7 |
| (c) deux pages d'atterrissage | des inconnus mettent-ils **une carte**, et à quel prix ? | C7 |

### La ligne de succès, écrite avant

> **Au vendredi 14 novembre 2026 à 18 h : 5 pilotes réservés avec carte bancaire (pages A + B), dont au moins 3 hors du réseau proche, et 3 engagements écrits issus des entretiens (lettre d'intention ou prépaiement). Et le banc d'essai n'a pas tué le pivot (connecteurs natifs < 80 %).**

Les trois conditions sont cumulatives. 5 pilotes réservés avec 2 engagements écrits : on continue, mais on le dit. 5 pilotes tous issus du réseau : ça ne compte pas comme preuve.

**Comparaison avec le panel.** Le panel donne 19 % (100 cartes, v1) puis 25 % (20 cartes, v2), et 44 % sur les profils techniques en v2. Ce sont des acheteurs simulés qui ont lu le pitch et devaient répondre ; ce n'est pas un taux de conversion de page. Sur une page d'atterrissage réelle, une réservation payante convertit typiquement **0,5 à 3 % des visiteurs** [H] : avec 300 à 600 visites en 4 semaines (voir le budget), on attend 2 à 15 réservations. La ligne de succès (5) est dans le bas de cette fourchette, volontairement. **Si les vrais acheteurs et le panel se contredisent, les vrais acheteurs priment**, dans les deux sens : 25 % simulés et 0 carte réelle, c'est un non.

**Ce qu'on fait selon le résultat (décidé maintenant, pas le 14 novembre) :**

| résultat au 14/11 | lecture | décision |
|---|---|---|
| ≥ 5 réservations, ≥ 3 engagements, banc d'essai OK | l'offre v2 s'achète | **GO** : l'étape 2 continue sans changement ; les 5 pilotes démarrent le 17/11 |
| 2 à 4 réservations, ou 1 à 2 engagements | le problème est là, l'offre ou le prix coince | **retour à l'offre** : les entretiens disent quelle objection (cloisonnement, agent « mouchard », connecteurs) ; une seule itération de 2 semaines (17/11 → 28/11) sur la page gagnante ; le lancement glisse au 26/01 (voir étape 2) |
| 0 ou 1 réservation avec ≥ 300 visites, 0 engagement écrit sur 12 entretiens | personne ne paie | **PASS** ou retour au conseil : on ne lance pas le compte à rebours juridique (pas d'avocat, pas d'immatriculation) tant que ce n'est pas tranché |
| connecteurs natifs ≥ 80 % au banc d'essai | pas de « dix fois mieux » | **le pivot pur est mort** : Leon n'est pas un produit de recherche ; ce qui reste à vendre, c'est la capture des sessions et les décisions validées ; on retourne au conseil avec les chiffres |
| B (29 €) réserve autant que A (19 €) | la valeur tient | le prix de liste passe à 29 € ; l'offre fondatrice reste à 19 € |

**Ce qui se dépense pendant le test** (plafond 1 200 €, sans la société) : ~500 € de trafic payant, 150 à 300 € pour le tiers qui note le banc d'essai, 0 € pour les entretiens, un devis d'avocat (gratuit) et, en cas de GO le 14/11, le lancement des frais juridiques. **Rien d'irréversible avant le 14 novembre.**

### Calendrier des 4 semaines

| semaine | (a) banc d'essai, David | (b) entretiens, David + Amos | (c) pages, Amos |
|---|---|---|---|
| **S1** 20-24/10 | lun-mar : 30 questions et corrigé écrits, gel des données au 20/10 ; mer-ven : prototype brut + pgvector v0 (branche `david/brut-pgvector`) | liste de 40 noms hors réseau, 12 rendez-vous pris d'ici vendredi ; guide validé ; modèle de lettre d'intention ; tiers évaluateur recruté | pages A et B écrites et en ligne jeudi 23/10 ; parcours de réservation testé ; mesure en place ; préalable Stripe tranché (voir encadré) |
| **S2** 27-31/10 | prototype v0 fini mer 29/10 ; lun-mer : les 3 systèmes répondent aux 30 questions ; jeu-ven : le tiers note à l'aveugle | 4 entretiens (2 chacun) ; notes rédigées le jour même ; première demande d'engagement en fin d'entretien | trafic lancé lun 27/10 (250 €) ; lecture quotidienne visites → clic → carte ; posts des fondateurs |
| **S3** 2-6/11 | résultats dépouillés lun 2/11, note d'une page mardi : rappel, précision, citations inventées, par système | 5 entretiens ; relances des engagements | second budget (250 €) sur la page qui convertit le mieux ; ajustement du texte **seulement** si une objection revient 3 fois |
| **S4** 9-13/11 (mer 11/11 férié) | si l'hybride est validé : spec de l'inversion pour l'étape 2 ; sinon, note pour le conseil | 3 entretiens ; synthèse des 12 jeudi 12/11 ; compte des engagements écrits | arrêt du trafic jeu 12/11 ; comptage final **ven 14/11 à 18 h** |

**Vendredi 14 novembre, 17 h : revue de fin de test**, les deux fondateurs, une heure, décision écrite dans ce dossier (`launch-decision-2026-11-14.md`) selon la table ci-dessus.

### (a) Le banc d'essai à l'aveugle sur 30 questions

**Les données.** Celles de David et Amos : les sessions Claude Code depuis septembre, le dépôt `leon` (PR, commentaires, commits), `docs/`. Gelées au lundi 20/10 (un export daté, le même pour les trois systèmes). Ce sont de vraies données de travail avec de vraies décisions (D6b, D15, D16, choix de Postgres, port 3002, Haiku vs Sonnet…) et de vrais bugs réglés.

**Les 30 questions**, écrites avant toute réponse, chacune avec sa réponse attendue et sa source exacte (id de session, PR, fichier). Chaque fondateur en écrit 15 sur ce qu'**il** sait, pour que le corrigé soit sûr.

| type | nombre | exemple |
|---|:-:|---|
| « pourquoi a-t-on choisi X ? » | 10 | « pourquoi l'extraction est-elle passée de Sonnet à Haiku ? » |
| « comment avait-on réglé cette erreur ? » | 8 | « pg-boss relançait les erreurs LLM : qu'a-t-on fait ? » |
| « qu'est-ce qui a été décidé sur… / état actuel » | 7 | « quel modèle fait le rangement aujourd'hui ? » (la réponse a changé : teste le « remplacé par ») |
| **pièges** : la réponse n'existe nulle part dans les données | 5 | « pourquoi a-t-on écarté Neon ? » (jamais discuté) : la bonne réponse est « je ne sais pas » |

**Les trois systèmes**, dans les mêmes conditions (même question, un seul essai, pas de relance) :

1. **Connecteurs natifs** : Claude (Team ou Pro) avec le connecteur GitHub et les docs en projet, **ou** ChatGPT avec ses connecteurs ; les sessions Claude Code sont fournies comme fichiers dans le projet, puisque c'est ce qu'un acheteur « déjà équipé » pourrait faire au mieux. C'est le bundle à 20 $ du conseil.
2. **Prototype brut + vecteurs** : les tours bruts + étiquetage léger + pgvector (embeddings Voyage, `cfo-sources.md`), servis à Claude Code par MCP. À construire en S1-S2 (v0 : une colonne vector, un index, un outil MCP `search` hybride plein-texte + vecteurs ; pas d'interface). C'est l'inversion de `idea.md`.
3. **Faits actuels** : le pipeline de `main` (extraction Haiku, fiches, citations vérifiées par `quote.ts`), servi par le MCP existant.

**La notation.** Un tiers (un développeur hors du projet, payé 150 à 300 € pour une demi-journée ; pas un ami de l'un des deux) reçoit, pour chaque question, les trois réponses dans un ordre tiré au sort, sans le nom du système, avec le corrigé. Il note par réponse : **correcte** (0/1), **source exacte citée** (0/1 ; la citation doit pointer sur le bon tour, la bonne PR), **citation inventée** (0/1 : une source qui n'existe pas ou ne dit pas ça), **« je ne sais pas » à bon escient** sur les pièges (0/1). David compile : rappel (part des 25 questions à réponse traitées correctement), précision (part des réponses données qui sont correctes), taux de citations inventées, score sur les pièges.

**Critères d'arrêt, écrits avant :**
- **Connecteurs natifs ≥ 80 % de rappel → le pivot pur est mort.** Le bundle à 20 $ fait déjà le travail ; Leon ne peut pas vendre « la réponse avec la source » comme résultat. Reste à vendre ce que les connecteurs ne voient pas : les décisions des sessions, validées par l'auteur, remontées à l'équipe. Retour au conseil.
- **Brut > faits sur le rappel → l'hybride est validé** : le brut devient la source de vérité, l'étiquetage léger reste pour les dates, les entités et le « remplacé par », l'extraction en faits n'est plus le chemin principal. L'étape 2 construit ça.
- **Brut < faits sur le rappel** : l'inversion ne paie pas ; on garde le pipeline de faits et on y ajoute pgvector comme second chemin. L'étape 2 change de spec (moins de travail, pas plus).
- **Citations inventées > 5 % sur le meilleur système** : la promesse « citation exacte ou je ne sais pas » n'est pas tenable en l'état ; on ne lance pas sans un garde-fou (le MCP ne rend que des citations vérifiées).
- Le « dix fois mieux » : on le lit comme l'écart Leon (meilleur système) − connecteurs natifs sur les questions « pourquoi » et « comment réglé ». **Moins de 20 points d'écart : pas dix fois mieux**, et `marketing.md` ne doit pas le prétendre.

Limite dite d'avance : 30 questions sur les données de deux personnes, c'est un signal de direction, pas une mesure publiable. Les pilotes (étape 2) refont la mesure avec leurs 20 questions.

### (b) 12 entretiens de CTO et fondateurs techniques hors du réseau proche

**« Hors du réseau proche »** : pas d'amis, pas d'anciens collègues, pas de cofondateur de quelqu'un qu'on connaît. Le second degré par introduction est accepté (« tu connais un CTO d'une boîte de 10 à 30 devs qui vit dans Cursor ? »), à condition que l'interlocuteur ne nous doive rien.

**Où les trouver** (viser 40 noms pour 12 rendez-vous ; les communautés sont à vérifier, **[H]**) :
- **GitHub** : organisations françaises dont les dépôts publics contiennent un `CLAUDE.md`, un `.cursor/rules` ou `.cursorrules` ; c'est le signal le plus direct « cette équipe vit dans Claude Code ou Cursor ». Recherche de code, puis le CTO sur LinkedIn.
- **Les offres d'emploi** (Welcome to the Jungle, LinkedIn) de boîtes de 10 à 60 personnes qui mentionnent Cursor ou Claude Code dans la stack.
- **Communautés de CTO et de fondateurs** : Tech.Rocks, les Slack d'incubateurs (Station F et programmes régionaux), les Discord de Cursor et de Claude (canaux francophones), les meetups parisiens (Paris.js, meetups IA dev) et lyonnais.
- **LinkedIn au second degré** : 5 demandes d'introduction par fondateur à des contacts de premier degré, vers des gens qu'ils connaissent et que nous ne connaissons pas.
- **Les visiteurs des pages A/B** qui laissent un email sans réserver : ce sont les entretiens les plus précieux (ils ont vu le prix et n'ont pas mis la carte).

Message de prise de contact (3 lignes, pas de pitch) : « Nous construisons un outil pour les équipes dev qui travaillent dans Claude Code ou Cursor. Avant d'écrire une ligne de plus, nous voulons comprendre comment les équipes comme la vôtre retrouvent "pourquoi on a fait ce choix". 25 minutes en visio, pas de démo. »

**Le guide d'entretien, façon Mom Test** : on parle de leur passé et de leur vie, pas de notre idée ; pas de « est-ce que vous achèteriez ». 25 minutes, 8 questions, dans l'ordre, et on se tait après chaque.

1. « Racontez-moi la dernière fois où quelqu'un dans l'équipe a demandé *pourquoi on a fait ce choix* et que personne n'a retrouvé la réponse. Qu'est-ce qui s'est passé ensuite, et combien de temps ça a pris ? »
2. « Combien de vos développeurs passent leur journée dans Claude Code ou Cursor ? Que deviennent ces sessions une fois fermées ? Quelqu'un les relit ? »
3. « Votre dernier arrivé : comment a-t-il appris pourquoi le code est comme il est ? Combien de semaines avant qu'il arrête de vous poser des questions ? »
4. « Qu'avez-vous déjà essayé pour ça : ADR, Notion, Claude Team, Copilot, un canal Slack ? Qu'est-ce qui a tenu six mois, qu'est-ce qui est mort, et pourquoi ? »
5. « La dernière fois qu'on a voulu installer quelque chose sur le poste de chaque dev (un outil de suivi, une extension, un agent), qui a dit non, et à quoi exactement ? »
6. « Qui décide et qui paie un outil à 75 € par mois chez vous ? Pour le dernier outil acheté, combien de temps entre l'essai et la carte bancaire ? »
7. « Qu'est-ce qui vous empêcherait de brancher GitHub et Linear sur un outil tiers de deux personnes ? Qui devrait relire quoi (DPO, avocat, client) ? »
8. « Si demain un outil retrouvait la réponse à vingt questions de ce type sur vos propres données, avec la session ou la PR en source, qu'est-ce que vous feriez cette semaine ? » (La seule question sur le futur, en dernier, et elle amène la demande.)

**La demande d'engagement** (après la question 8, seulement si les questions 1 à 3 ont montré une douleur vécue) : « Nous prenons 20 équipes fondatrices à 19 € par siège garanti 12 mois, avec le test des 20 questions : si moins de 15 réponses justes avec la source au jour 30, rien n'est facturé. Il y a deux façons de réserver : la page avec votre carte (0 € aujourd'hui, le premier mois débité au démarrage du pilote), ou une lettre d'intention d'une page que je vous envoie ce soir. Laquelle ? » **Un « c'est intéressant, recontactez-moi » compte comme un non.**

Lettre d'intention (une page, pas un contrat) : nom de la société, taille de l'équipe dev, outils (Claude Code, Cursor, GitHub, Linear, Notion), nombre de sièges envisagés, prix 19 €/siège, date de démarrage souhaitée, les deux conditions de l'acheteur (ex. « DPA relu », « relecture par l'auteur en place »), signature. Non engageante juridiquement, mais écrite et signée : c'est la preuve que le conseil demande (C7).

**Seuil : 3 engagements écrits sur 12.** Sous 3, on relit les notes avant de conclure : si les 12 décrivent la douleur (questions 1 à 3) mais refusent la demande (questions 5 à 7), c'est l'offre ou la confiance ; si la douleur elle-même n'est pas là, c'est le marché (C1), et c'est plus grave.

Discipline : notes rédigées le jour même dans `interviews/AAAA-MM-JJ-<societe>.md` (pas d'enregistrement sans accord écrit), avec trois champs obligatoires : la douleur dans leurs mots, ce qu'ils ont déjà essayé, la réponse à la demande.

### (c) Deux pages d'atterrissage, A à 19 € et B à 29 €

**Identiques à un chiffre près.** Le texte est `pitch.md` v2 mis en page : le résultat (« pourquoi on a fait ce choix, avec la source, depuis Claude ou Cursor »), les trois objections tuées (pack confiance, relecture par l'auteur, décisions datées), le test des 20 questions, l'offre Équipe fondatrice. **Une seule différence : le prix du siège, 19 € sur A, 29 € sur B**, présenté comme le prix fondateur garanti 12 mois. Répartition 50/50 par tirage au sort côté serveur (un cookie, pour qu'un visiteur revoie toujours la même page). Pas de prix barré, pas de faux compteur ; le compteur « il reste N places sur 20 » est vrai et mis à jour à la main.

**Honnêteté obligatoire sur la page** : « société française en cours d'immatriculation », la liste des sous-traitants prévus, et ce que l'agent capte et ne capte pas (un paragraphe, avant la page complète de l'étape 2). C'est l'objection n°2 de la v2 ; la cacher coûterait plus cher que la dire.

**La réservation de pilote avec carte.** C'est l'action mesurée : un bouton « Réserver un pilote », un formulaire court (email pro, taille de l'équipe dev, Claude Code ou Cursor, GitHub / Linear / Notion), puis Stripe Checkout. **Ce qui est débité** : 0 € le jour de la réservation ; le premier mois (3 sièges minimum, soit 57 € sur A, 87 € sur B) au démarrage du pilote ; remboursé si le test des 20 questions échoue au jour 30. Annulable par un email jusqu'au démarrage.

> **Préalable à trancher lundi 20/10 : qui encaisse avant le Kbis ?** La société n'existe pas ; Stripe n'active pas un compte « en cours de formation ». Trois options, de la plus propre à la moins propre : (1) **empreinte de carte sans débit** (Stripe Checkout en mode `setup`) sur un compte Stripe ouvert au nom de l'un des fondateurs en entrepreneur individuel, s'il en a déjà un ; débit au démarrage du pilote, après Kbis, par la SAS ; (2) la même chose sur une micro-entreprise ouverte en 48 h via le guichet unique pour ce seul usage, fermée après : à faire valider par l'expert-comptable avant ; (3) si ni l'un ni l'autre n'est possible avant le 23/10, la réservation devient une **lettre d'intention signée avec mandat de prélèvement SEPA à activer au démarrage**, et la ligne de succès est lue avec cette réserve (un mandat signé pèse moins qu'une carte). **Ce que la page mesure ne change pas : un inconnu qui s'engage à payer.** Les actes signés « pour le compte de la société en formation » sont repris par la SAS après immatriculation (c'est le mécanisme habituel ; à confirmer par l'avocat dans son devis).

**Le trafic, ~500 €** [H, à recaler avec `marketing.md`] : 250 € en S2 et 250 € en S3, en annonces LinkedIn ciblées (CTO, lead dev, VP engineering, France, entreprises de 11 à 200 personnes ; CPC attendu 5 à 10 €, donc 50 à 100 clics payés en tout) ; le reste du trafic vient des posts des deux fondateurs, des communautés où les entretiens sont sourcés, et des 40 personnes contactées. Attente : **300 à 600 visites** en 4 semaines. Sous 300 visites au 7/11, on ajoute 150 € plutôt que de conclure sur rien.

**Mesure** (Plausible ou l'analytique de l'hébergeur, sans cookie tiers) : visites par variante → clics « Réserver » → formulaire envoyé → carte enregistrée. On lit le taux à chaque étape, par variante, chaque matin, et on ne touche à rien avant 100 visites par variante. Les emails des formulaires non terminés sont relancés une fois, à la main, par David (« qu'est-ce qui vous a arrêté ? ») : c'est l'entretien gratuit.

**Ligne de succès de (c), rappel : 5 réservations avec carte (A + B) en 4 semaines, dont ≥ 3 hors réseau.** Lecture du prix : si B ≥ A en réservations (avec au moins 3 sur B), le prix de liste monte à 29 € ; si B convertit à moins de la moitié de A, 25 € reste le prix de liste et 29 € n'est jamais affiché.

---

## Étape 2. Le compte à rebours jusqu'au lancement public

### La date retenue : lundi 12 janvier 2027, avec une date de repli

**12 janvier 2027** tient, à une condition : **les 5 pilotes démarrent le lundi 17 novembre**. Huit semaines de pilote (C3) à partir du 17/11 finissent le dimanche 11 janvier ; la marge est de zéro jour. Les deux autres chaînes (juridique, produit) ont trois à quatre semaines de marge. Donc :

- **Date cible : lundi 12 janvier 2027.**
- **Date de repli : lundi 26 janvier 2027**, décidée au plus tard à la revue du **lundi 22 décembre** (J−21) si l'une de ces trois choses est vraie : les pilotes ont démarré après le 24 novembre ; le Kbis n'est pas arrivé au 18 décembre ; la relecture par l'auteur n'est pas en production au 5 décembre. Si on glisse, **l'offre fondatrice passe du 31 janvier au 28 février 2027** (sinon il ne reste que cinq jours pour la vendre au public), et `pricing.md` est mis à jour.
- Ce qu'on ne fait pas : lancer le 12 janvier avec six semaines de pilote « parce que la date est prise ». Avec sept semaines (démarrage le 24/11), on lance en le disant ; en dessous, on glisse.

Deux remarques sur le calendrier : les semaines du 21 décembre et du 28 décembre sont mortes pour la vente et pour les pilotes (usage divisé par deux ou trois), et le calendrier marketing « J−14 » [H] tombe le 29 décembre ; **tout le contenu du J−14 est donc produit et programmé avant le 18 décembre**, et le 5 janvier est le vrai J−7 de terrain. Le 1er novembre, le 11 novembre, le 25 décembre et le 1er janvier sont fériés.

### Qui porte quoi (proposition, à échanger entre vous)

- **David** : juridique et argent, banc d'essai, inversion brut + pgvector, connecteur GitHub, tableau de bord des 20 questions, export et suppression, marketing, pilotes (relation).
- **Amos** : agent local Cursor, relecture par l'auteur, cloisonnement par projet, page « ce que l'agent capte », marque et pages, déploiement et sauvegardes, pilotes (installation et support).
- **Les deux** : entretiens (6 chacun), revues du vendredi, soft launch, jour J.

Règle : un propriétaire par tâche, jamais deux ; l'autre relit la PR (CLAUDE.md).

### Les blocs hebdomadaires

Chaque ligne : tâche, propriétaire, échéance. **CC** = sur le chemin critique. Les semaines 1 à 4 recouvrent l'étape 1 ; les tâches de test y sont rappelées en une ligne.

**S1 · 20-24 octobre**
- Étape 1 lancée : questions et corrigé (David, 21/10) ; 12 rendez-vous pris (les deux, 24/10) ; pages A/B en ligne (Amos, 23/10) ; préalable Stripe tranché (David, 20/10).
- Juridique : choisir le nom de la société et son siège, vérifier la disponibilité INPI et le domaine pour « Leon » et « Marcel » (Amos, 23/10) ; brief envoyé à deux avocats pour devis : CGV, DPA, politique de confidentialité, registre, note sur le régime de la capture (suivi d'activité, information des salariés, CSE : C10), reprise des actes de la société en formation (David, 23/10). Choisir l'expert-comptable (David, 24/10).
- Produit : prototype brut + pgvector v0 pour le banc d'essai (David, 29/10, **CC**) ; sauvegardes quotidiennes activées sur Supabase et testées par une restauration (Amos, 24/10 : aucun pilote sur une base sans sauvegarde).
- Argent : rien n'est dépensé au-delà du test.

**S2 · 27-31 octobre**
- Étape 1 : banc d'essai joué et noté (David, 31/10) ; 4 entretiens ; trafic lancé (27/10).
- Marque : **nom tranché** (les deux, 31/10) ; domaine acheté, identifiants (GitHub, LinkedIn, X) réservés (Amos, 31/10). Le nom conditionne les statuts, le DPA, la marque INPI : c'est la première décision irréversible et elle est bon marché.
- Juridique : statuts rédigés (modèle SAS, deux associés, à faire relire par l'expert-comptable), compte de dépôt de capital ouvert auprès d'une banque en ligne qui accepte les sociétés en formation (David, 31/10). **Rien n'est déposé au guichet unique avant la revue du 14/11** : l'immatriculation coûte ~1 000 € et n'a de sens que si le test est GO. Exception : si le test est manifestement bon au 7/11 (≥ 3 réservations), on dépose une semaine plus tôt.
- Produit : spec de l'agent local Cursor (où Cursor range ses conversations, format, fréquence de lecture) (Amos, 31/10).

**S3 · 2-6 novembre**
- Étape 1 : résultats du banc d'essai écrits (David, 3/11) ; 5 entretiens ; second budget sur la page gagnante.
- Produit : agent local Cursor, lecture des sessions et envoi au serveur avec le même contrat `Turn` que l'import Claude Code (Amos, 20/11) ; **signal visible de capture** : horodatage de la dernière capture, visible dans l'interface et dans l'agent, alerte après 24 h sans capture (Amos, 20/11, C6).
- Produit : si l'hybride est validé, spec de l'inversion en production : le brut comme source de vérité, étiquetage léger (date, participants, entités, marqueur décision, « remplacé par »), pgvector, rétro-chargement des sessions existantes (David, 6/11).
- Marketing [H] : première version de `marketing.md` demandée ; liste d'attente ouverte sur la page (email seul, pour ceux qui ne réservent pas) (David, 6/11).

**S4 · 9-13 novembre** (11/11 férié)
- Étape 1 : 3 derniers entretiens, synthèse (12/11) ; **revue de fin de test ven 14/11 17 h** (les deux). Décision écrite.
- Juridique : devis d'avocat accepté et date de livraison fixée pour un premier jet au 27/11 (David, 13/11).
- Produit : inversion brut + pgvector en production, avec le pipeline de faits conservé comme second chemin ou retiré selon le banc d'essai (David, 20/11) ; déploiement de production (hébergeur UE, domaine, HTTPS, journaux, alertes) (Amos, 14/11, **CC** : les pilotes s'installent dessus le 17/11).
- Pilotes : les 5 équipes choisies parmi les réservations et les engagements, **hors réseau**, 5 à 30 développeurs, Claude Code ou Cursor, prêtes à démarrer le 17/11 (David, 14/11, **CC**). Leur CTO reçoit le vendredi : le guide d'installation Solo, la page « ce que l'agent capte » en version courte, le formulaire des 20 questions à écrire **avant** l'installation (sinon la mesure est biaisée).

**S5 · 16-20 novembre**
- Juridique (si GO) : dépôt de capital, annonce légale, **dossier déposé au guichet unique** (David, 18/11, **CC**). Kbis attendu vers le 2/12 [H : 1 à 3 semaines après un dossier complet ; un rejet pour pièce manquante coûte une à deux semaines, et c'est fréquent]. Compte Stripe créé en mode test, parcours Solo → Équipe construit (David, 20/11).
- Produit : agent Cursor et signal de capture livrés (Amos, 20/11) ; inversion livrée (David, 20/11) ; **page « ce que l'agent capte et ne capte pas »** publiée, donnée telle quelle aux développeurs des pilotes et au CSE s'il y en a un (Amos, 20/11 ; relue par l'avocat la semaine suivante).
- **Pilotes, phase 1 « Solo »** (du 17/11 au 30/11) : chaque développeur installe l'agent **de sa propre initiative** (objection n°2 de la v2), mémoire privée à son auteur, lecture par MCP depuis son propre Claude Code ou Cursor. Rétro-chargement de ses sessions existantes (C4). Rien ne remonte à l'équipe pendant la phase 1 : la relecture par l'auteur n'est pas encore là, et C6 interdit de partager sans elle. Mesure dès la première semaine : minutes jusqu'à la première réponse citée, part des devs de l'équipe qui ont installé.
- Pilotes : appel de 30 minutes par équipe chaque semaine, même jour, même heure, jusqu'au 9/1 (David pour la relation, Amos pour les bugs) [H, routine à reprendre dans `ops.md`].

**S6 · 23-27 novembre**
- Produit : **relecture par l'auteur** en production (Amos, 27/11, **CC**) : les décisions proposées par le tri s'affichent à leur auteur, rien ne remonte sans son clic, un lot validable en une fois, une raison obligatoire quand il refuse (c'est la donnée qui mesure le taux d'erreur du classifieur). Connecteur GitHub (PR, revues, issues, commits, par OAuth GitHub App, droits d'origine conservés) (David, 4/12).
- Juridique : **premier jet de l'avocat** : CGV, DPA, politique de confidentialité, note C10 (David, 27/11, **CC** pour les pilotes : P003 et les profils « prudents » ne passent pas à la phase 2 sans DPA à relire). Registre des traitements rédigé par les fondateurs sur le modèle de la CNIL (David, 27/11). Devis d'assurance RC pro et cyber demandés (David, 27/11) [H : 1 semaine, signature après Kbis].
- Marque : page d'accueil publique écrite à partir de la page gagnante du test (Amos, 4/12).

**S7 · 30 novembre - 4 décembre**
- Produit : **cloisonnement par projet** (Amos, 4/12, **CC**) : des espaces par projet avec des membres ; une décision validée remonte aux membres du projet, pas à toute l'organisation ; un développeur choisit le projet à la validation ; le MCP filtre par projet ; migration sur les ACL `uuid[]` existantes (voir `offer.md` §6). Tableau de bord des 20 questions : saisie des questions à l'installation, score mis à jour à chaque réponse marquée juste ou fausse par l'équipe, règle « moins de 15 au jour 30 : rien n'est facturé » visible (David, 11/12).
- **Pilotes, phase 2 « Équipe »** (du 1/12 au 9/1) : partage activé pour les équipes dont le DPA est relu, avec la relecture par l'auteur ; cloisonnement par projet activé au 4/12 pour celles qui ont plusieurs projets. Mesure C3 à partir d'ici : questions par semaine, part de réponses justes avec la citation exacte (sur leurs 20 questions puis sur l'usage réel), taux d'installation de l'agent, part des décisions proposées qui sont validées, et **un cas « la réponse n'existait nulle part ailleurs »** par équipe, écrit dans leurs mots.
- Juridique : Kbis reçu (limite tolérable 18/12) ; compte bancaire définitif ; **Stripe activé** (SIREN, Kbis, IBAN ; 2 à 7 jours [H]) (David, 11/12). Dès l'activation, **les pilotes paient** : 19 € par siège actif à partir du mois de décembre, débités le 15/12, remboursables par la garantie au jour 30. C'est le levier n°1 du CFO : la rampe de `numbers.json` (0 siège en mois 1 et 2) est remplacée par des sièges payants dès le premier mois.

**S8 · 7-11 décembre**
- Juridique : **version finale** des CGV, du DPA et de la politique de confidentialité, avec le SIREN ; page sécurité (chiffrement, sous-traitants et leur localisation, rétention, qui chez Leon peut lire quoi, sauvegardes, procédure d'incident) (David pour le contenu, Amos pour la page, 11/12). **AIPD** : la capture de sessions de salariés relève a priori du suivi d'activité ; une analyse d'impact est rédigée par les fondateurs sur l'outil PIA de la CNIL et relue par l'avocat (David, 18/12) [H : « a priori » ; l'avocat tranche dans sa note C10]. Assurance signée (David, 11/12). Dépôt de marque INPI (Amos, 11/12).
- Produit : tableau de bord des 20 questions livré (David, 11/12) ; connecteur Linear (David, 18/12) ; parcours Solo autonome chronométré sur un poste neuf : **objectif C4, première réponse citée en moins de dix minutes sans aide**, mesuré sur 3 personnes hors projet (Amos, 11/12).
- Revue de mi-parcours (ven 11/12) : état des pilotes à J+24, Kbis, Stripe ; première lecture des chiffres C3.

**S9 · 14-18 décembre**
- **Soft launch, lundi 15 décembre** : l'offre Équipe fondatrice ouverte aux 20 équipes : les 5 pilotes (déjà dedans) + 15 places proposées à la liste d'attente, aux lettres d'intention et aux réservations non pilotes, par email personnel, paiement Stripe en production. Objectif : 12 équipes signées au 9/1, 20 au 31/1. Chaque équipe fondatrice a le même parcours que les pilotes (20 questions, appel d'installation de 30 minutes).
- Produit : **export complet** (archive lisible de toute la mémoire d'un utilisateur et d'une organisation, à tout moment) et **suppression** (compte, organisation, sous 30 jours, avec journal) (David, 18/12) ; gel des fonctionnalités le ven 18/12 à 18 h : jusqu'au 4/1, seulement des corrections.
- Marketing [H] : tout le contenu du J−14 au J−1 écrit, relu et programmé : annonce, post technique « ce que l'agent capte », post « les chiffres de nos pilotes » (avec les chiffres réels, ou pas de post), email à la liste d'attente, messages aux communautés (David, 18/12).
- Marque : page d'accueil et page sécurité en production, sans le bouton public (Amos, 18/12).

**S10 · 21-25 décembre** (25/12 férié)
- **Revue J−21, lundi 22 décembre, 10 h** : go pour le 12/1, ou repli au 26/1, selon les trois critères ci-dessus. Décision écrite.
- Astreinte à tour de rôle sur la production et les pilotes ; pas de livraison ; relecture des documents juridiques finaux par les deux.
- Notion : s'il reste du temps, connecteur Notion (David) ; sinon, il est annoncé « février » au lancement et retiré de la phrase d'accueil. **Ne pas tenir la date avec Notion inachevé.**

**S11 · 28 décembre - 1er janvier** (1/1 férié)
- Astreinte ; collecte des chiffres des pilotes à J+42 ; rédaction du post de lancement avec ces chiffres (David) ; rien d'autre.

**S12 · 4-8 janvier**
- Lun 5/1 : J−7 de terrain [H] : les posts programmés partent selon `marketing.md` ; relance personnelle des 15 places fondatrices.
- Mer 7/1, 14 h : **répétition générale** : le jour J joué en deux heures sur la production (inscription Solo, paiement Équipe avec une vraie carte et remboursement, bascule de la page, les cinq scénarios de panne de l'étape 3 simulés un par un, le message de la page de statut).
- Jeu 8/1 : chiffres finaux des 5 pilotes à 7 semaines et demie (C3), relus par les deux, écrits dans `pilotes-2027-01-08.md` ; c'est ce que le lancement dit, rien de plus.
- **Ven 9/1, 17 h : go / no-go final** (les deux). Critères : production stable 7 jours sans incident de capture ; Stripe en production ; CGV, DPA, politique de confidentialité, page sécurité en ligne ; au moins 4 pilotes sur 5 avec un score ≥ 15/20 ; export et suppression testés ; astreinte du week-end nommée.
- Lun 12/1 : **jour J** (étape 3).

### Le chemin critique, vérifié

Trois chaînes, par marge croissante :

1. **Les pilotes (marge : 0 jour).** Recrutement au 14/11 → démarrage 17/11 → 8 semaines → 11/1 → lancement 12/1. Tout retard de démarrage décale la date, ou raccourcit la preuve C3. C'est **le** chemin critique, et il est tenu par l'étape 1 : la date de lancement est en réalité décidée le 14 novembre.
2. **La relecture par l'auteur (27/11) et le DPA relisible (27/11), puis le cloisonnement par projet (4/12) → phase 2 des pilotes (1/12) → 6 semaines de données d'équipe (marge : une semaine).** C6 interdit de partager sans relecture ; les acheteurs prudents n'ouvrent pas sans DPA ; l'objection n°1 de la v2 exige le cloisonnement. Un glissement d'une semaine ici est absorbé ; deux semaines ramènent la preuve d'équipe à quatre semaines et imposent le repli au 26/1.
3. **L'immatriculation (dépôt 18/11 → Kbis ~2/12, limite 18/12) → Stripe en production (11/12, limite 23/12) → soft launch payant (15/12) et lancement (marge : trois semaines, variance forte).** Elle n'est pas la plus courte mais c'est la moins contrôlable (greffe, rejets de dossier, délais de décembre). Sans Stripe au 12/1, on ne vend pas : la marge de trois semaines est là pour ça.

**Verdict sur l'hypothèse de départ** (« immatriculation + DPA et cloisonnement par projet ») : à moitié juste. Le DPA et le cloisonnement sont bien sur le chemin critique, mais via les pilotes, pas via la date ; l'immatriculation a de la marge mais c'est le risque de variance le plus fort ; **et la pièce la plus critique, qui manquait, est la relecture par l'auteur** (sans elle, pas de partage d'équipe du tout, donc pas de phase 2, donc pas de C3) et **le démarrage des pilotes le 17 novembre**, qui n'a aucune marge.

Deux coupes possibles si ça glisse, par ordre : Notion (annoncé en février), puis Linear (idem). Jamais : la relecture par l'auteur, le signal de capture, l'export, le DPA.

Note pour `cfo.md` : la ligne « CASA Tier 2 pour Google Workspace, 2 000 € » de `numbers.json` n'a pas lieu d'être au lancement, puisque l'offre v2 ne branche ni Gmail ni Drive ; elle sort des dépenses de lancement (−2 000 €) jusqu'au jour où une équipe payante demande Google Workspace. Et la rampe (0 siège en mois 1 et 2) est remplacée par les pilotes payants de décembre : c'est le levier n°1 du CFO, mis en pratique.

---

## Étape 3. Le jour J : lundi 12 janvier 2027, heure par heure

**Les rôles.** David parle en public (posts, communautés, presse s'il y en a) et tient la boîte de support et Stripe. Amos tient la production, l'agent et les réponses techniques. Une seule voix publique ; l'autre ne poste rien sans relecture. Un canal privé entre les deux, ouvert toute la journée, où chaque incident est horodaté.

**L'offre du jour J** : Solo gratuit (une personne, Claude Code ou Cursor + GitHub, mémoire privée) ; Équipe 25 € HT par siège, 3 sièges minimum, sans engagement, le test des 20 questions (moins de 15 au jour 30, rien n'est facturé) ; Équipe fondatrice 19 € garanti 12 mois pour **les places restantes sur 20** (le chiffre vrai du 9/1), jusqu'au 31/01/2027. Pack confiance en ligne : DPA, sous-traitants, export, suppression, page sécurité.

| heure | qui | quoi | canal |
|---|---|---|---|
| 07:00 | Amos | Vérification de la production : capture (dernier horodatage de chaque agent pilote < 12 h), pipeline (file vide ou en cours), base et sauvegarde de la nuit, MCP répond, page de statut verte | interne |
| 07:00 | David | Test Stripe réel (1 siège avec sa propre carte, puis remboursement), boîte de support vide, textes du jour relus une dernière fois | interne |
| 08:00 | les deux | Go / no-go de 15 minutes : rien de rouge depuis vendredi ? Sinon, on décale de 24 h et on prévient les 20 équipes, pas le public | appel |
| 08:30 | Amos | Bascule : page d'accueil publique, tarifs, inscription Solo et paiement Équipe ouverts, page sécurité et documents juridiques liés depuis le pied de page | site |
| 09:00 | David | Email aux 20 équipes fondatrices (« c'est en ligne, merci, voici le lien à partager ») et à la liste d'attente (le texte programmé en S9, avec les chiffres des pilotes du 8/1) | email |
| 09:30 | David | Post de lancement : l'histoire, les chiffres des pilotes, le test des 20 questions, le lien | LinkedIn, X |
| 09:45 | Amos | Post technique : « ce que l'agent capte et ne capte pas », le modèle de droits, la relecture par l'auteur | LinkedIn, blog du site |
| 10:00 | David | Messages dans les communautés où les entretiens ont été sourcés (Tech.Rocks, Slack d'incubateurs, Discord Cursor et Claude, canaux francophones), un message par communauté, écrit pour elle, pas copié-collé [H] | communautés |
| 10:30 | David | Relance personnelle, un par un, des réservations et lettres d'intention qui n'ont pas encore signé (téléphone ou message direct) | direct |
| 12:00 | les deux | Premier point chiffres : visites, inscriptions Solo, équipes payantes, erreurs Stripe, erreurs d'agent, tickets ; décision sur les scénarios de panne s'il y en a | appel 10 min |
| 13:00-18:00 | David | Support : réponse à tout message en moins d'une heure ; questions de prix et de contrat ; Stripe | email, communautés |
| 13:00-18:00 | Amos | Production : erreurs d'installation de l'agent, MCP, premières captures des nouveaux Solo ; corrections immédiates seulement si sans risque, sinon le lendemain | interne, réponses techniques |
| 14:30 | David | Show HN (en anglais, horaire du matin américain) si décidé en S9 [H] ; sinon rien | Hacker News |
| 15:00 | les deux | Second point chiffres ; décision sur le plafond Solo (voir pannes) | appel 10 min |
| 17:00 | les deux | Troisième point ; liste des bugs du lendemain triée | appel 10 min |
| 18:00 | David | Post « jour 1 » avec les vrais chiffres, bons ou mauvais (inscriptions, équipes, et ce qui a cassé) | LinkedIn |
| 18:30 | les deux | Débrief écrit de 20 minutes : ce qui a marché, ce qui a cassé, les trois choses à faire mardi | `jour-j.md` |
| 22:00 | Amos | Dernière vérification de la capture et de la file ; astreinte de nuit | interne |

**Si quelque chose casse** (les cinq scénarios répétés le 7/1 ; chaque fiche dit : qui, en combien de temps, quoi dire) :

1. **Capture en panne** (plus de 20 % des agents sans horodatage depuis 15 minutes, ou une version d'agent qui échoue à l'installation). Amos. Dans les 15 minutes : page de statut « capture suspendue depuis HH:MM », bandeau dans l'interface, retour à la version précédente de l'agent. **Jamais de trou silencieux** : la date et l'heure du trou sont enregistrées et visibles dans la mémoire de chaque utilisateur touché (C6). Pas de correction en production après 16 h ; on vit avec la version précédente jusqu'au lendemain.
2. **Fuite suspectée** (quelqu'un dit voir une décision ou un passage qu'il ne devrait pas voir). Les deux. Dans les 10 minutes : **le partage d'équipe est coupé** par l'interrupteur prévu (tout redevient privé à son auteur), pas de débat. David appelle la personne qui signale ; Amos sort les journaux d'ACL du fait concerné. Si c'est confirmé : équipe touchée prévenue par écrit dans les 2 heures, incident consigné, avocat appelé pour la question des 72 heures (notification CNIL) et des personnes concernées, post-mortem public sous 7 jours. Si c'est infirmé : réponse écrite à la personne avec la preuve, partage réactivé, et on dit publiquement qu'on a coupé pour vérifier. **On ne discute pas en public d'une fuite ; on coupe, on vérifie, on écrit.**
3. **Afflux de Solo gratuits** (plus de 200 inscriptions par heure, ou dépense LLM et embeddings de la journée au-delà de 150 €) [H sur les seuils]. Amos. Rétro-chargement limité aux 30 derniers jours de sessions pour les nouveaux Solo (le reste en file de nuit), étiquetage en Batch, alerte de budget chez chaque fournisseur réglée dès le 9/1, et si ça ne suffit pas, **file d'attente d'inscription Solo** (« vous êtes 312e, vous recevrez votre accès sous 48 h »), jamais de dégradation pour les équipes payantes. Un Solo coûte ~2,4 €/mois (`numbers.json`) : 1 000 Solo le premier jour, c'est 2 400 € par mois ; c'est le coût d'acquisition, pas un accident, mais il se décide à 15 h, pas par surprise.
4. **Stripe en erreur** (paiement refusé pour tous, webhook silencieux, compte restreint). David. Dans les 15 minutes : formulaire de secours « réservez votre équipe sans payer, nous vous facturons sous 48 h » déjà prêt ; vérification de la page de statut Stripe ; factures manuelles depuis le tableau de bord si l'API est en cause ; **jamais de blocage des inscriptions à cause du paiement**. Si le compte est restreint (demande de pièces), c'est la seule tâche de David jusqu'à résolution.
5. **Mauvaise réponse en public** (quelqu'un publie une réponse fausse ou une citation qui n'existe pas). David répond en moins d'une heure, sur le même canal : merci, on regarde, quel était l'identifiant de la question. Amos reproduit. Deux cas : la citation vient de Leon et est fausse (la vérification de `quote.ts` a laissé passer : correction, et on le dit) ; ou le LLM du client a brodé sur du brut correct (le MCP ne rend que des extraits vérifiés : on montre l'extrait, on explique la frontière, et on en fait un paragraphe de la page sécurité). Dans les deux cas, réponse publique le jour même avec le résultat. **On ne supprime pas, on ne discute pas le ton, on montre.**

Et le sixième, pas dans la liste mais le plus probable : **rien ne se passe** (50 visites, 3 Solo, 0 équipe). On ne change rien le jour J ; on tient les 30 jours de l'étape 4 avant de conclure.

---

## Étape 4. Les 30 premiers jours (12 janvier → 11 février 2027)

Les chiffres sont relevés chaque **lundi matin** par David, écrits dans `metrics/2027-SS.md`, relus ensemble à 10 h. Chaque ligne a un niveau qui déclenche un changement, décidé maintenant, pour ne pas le négocier avec soi-même le moment venu.

| chiffre | comment on le mesure | objectif J+30 | niveau qui déclenche un changement | le changement |
|---|---|---|---|---|
| **Sièges actifs payants** (vs seuil 337) | sièges Équipe facturés avec au moins une question ou une capture dans la semaine | ≥ 80 (deux mois d'avance sur la rampe de `numbers.json`) ; J+7 : 40, J+14 : 60 | < 40 à J+30 | la rampe du CFO est fausse dans le mauvais sens : on refait `numbers.json` avec la vraie courbe, et le besoin de trésorerie avec ; décision de fond à J+30 |
| **Solo installés → équipes converties** | Solo dont l'agent a capté au moins une session ; équipes payantes dont le premier membre était un Solo | ≥ 150 Solo ; ≥ 10 % convertis en 30 jours [H] | conversion < 3 % avec ≥ 100 Solo | le Solo plaît mais ne tire pas l'équipe : revoir le moment et le message de l'invitation (« invitez votre équipe » après la première réponse utile), et le minimum de 3 sièges (P014 : « j'en ai besoin de deux ») |
| **Score moyen au test des 20 questions** | au jour 30 de chaque équipe, sur ses propres questions | ≥ 15/20 en moyenne, ≥ 80 % des équipes au-dessus de 15 | moyenne < 13, ou plus de 30 % des équipes sous 15 | **arrêt de l'acquisition payante** ; la garantie coûte plus que 10 % ; on corrige la recherche (brut, rerank, rétro-chargement) avant d'ajouter une seule équipe |
| **Décisions proposées validées par l'auteur** | validées / proposées, par semaine, et le délai médian de validation | ≥ 40 % validées ; délai médian < 48 h [H] | < 15 %, ou délai > 7 jours | la mémoire d'équipe reste vide (objection n°3 de la v2) : validation par lot, rappel hebdomadaire, défaut « partagé au projet » proposé par le tri quand la confiance est haute ; et on lit les raisons de refus pour mesurer le classifieur |
| **Citations inventées** | vérification automatique (`quote.ts`) sur toutes les réponses MCP, plus 20 réponses tirées au sort relues à la main chaque semaine | ≤ 2 % | > 5 % sur une semaine | le MCP ne rend plus que des extraits vérifiés mot à mot ; « je ne sais pas » plus tôt ; note publique sur la page sécurité |
| **Désinstallations de l'agent** | agents sans capture depuis 7 jours après une installation réussie, et désinstallations déclarées (avec la raison, question posée à la désinstallation) | ≤ 10 % des installations à 30 jours | > 25 % | le « mouchard » n'est pas réglé : relire les raisons, revoir la page « ce que l'agent capte », un réglage « pause de capture » visible dans l'agent |
| **CAC réel vs maximum** | (dépenses marketing + temps fondateur de vente valorisé 30 €/h) / nouvelles équipes payantes, par semaine et en cumul | CAC ≤ 1 500 € par équipe [H, à fixer dans `marketing.md` ; à 10 sièges, 20,24 € de contribution, c'est 7,5 mois de remboursement] | > 2 500 € en cumul à J+30 (plus de 12 mois de remboursement, hors C9) | couper le canal payant le plus cher, garder le bouche-à-oreille et les communautés ; refaire le calcul avec l'attrition réelle dès qu'elle existe |
| **Première réponse citée** (C4) | délai médian inscription → première réponse MCP avec citation, sur les Solo | < 10 min | médiane > 20 min, ou moins de 60 % des inscrits y arrivent | l'installation est le problème, pas le produit : on regarde où ils s'arrêtent (étape de l'agent, du MCP, du jeton) et on corrige ça en priorité |
| **Capture** | jours avec un trou de capture par agent | 0 trou silencieux | un trou non signalé | incident, même sans plainte : le signal de capture est la promesse C6 |
| **Attrition** | équipes qui résilient ou invoquent la garantie | trop tôt pour un taux à 30 jours ; on note chaque départ avec sa raison | 2 des 5 pilotes partent après la garantie | ce ne sont pas des clients : retour à l'offre avant d'en chercher d'autres |

### Les revues

**J+7, lundi 19 janvier.** Questions à trancher :
1. La capture a-t-elle tenu sept jours sans trou ? Sinon, rien d'autre ne compte cette semaine.
2. Combien d'équipes payantes, combien de Solo, et quel délai jusqu'à la première réponse ? Les trois chiffres contre les objectifs J+7.
3. Le support tient-il à deux (temps par équipe, nombre de tickets) ? Si une équipe de 10 coûte plus de 2 heures par semaine, le coût de support de `numbers.json` (1,50 €/siège) est faux.
4. Continue-t-on la dépense marketing de la semaine 2, au même niveau ?
5. Quels sont les trois bugs qui coûtent des inscriptions, dans l'ordre ?

**J+14, lundi 26 janvier.** Questions à trancher :
1. **Le prix** : ce que les 14 jours disent du 25 € (abandons sur la page de paiement, demandes de remise, réaction des équipes à 29 € si B avait gagné). Le prix de liste est confirmé ou changé **une fois**, ici, puis plus pendant six mois.
2. **L'offre fondatrice** : combien des 20 places sont prises ? Si moins de 15 au 26/1, on choisit entre fermer à la date (31/1) avec les places prises, ou prolonger au 28/2 ; on ne prolonge pas deux fois.
3. Faut-il plafonner les Solo (coût réel mesuré par Solo sur 14 jours, contre 2,4 € prévus) ?
4. Le taux de validation par l'auteur : est-ce un problème d'interface ou de volonté (lire les raisons de refus) ?
5. Les premières 20 questions : quelles familles de questions ratent (pourquoi, comment réglé, état actuel) ? C'est la liste de travail produit de février.

**J+30, mercredi 11 février.** Questions à trancher :
1. **La trajectoire vers 337 sièges** : avec la courbe réelle de 30 jours, le seuil est-il atteignable au mois 9 (cfo, levier n°1), au mois 11 (plan initial), ou jamais ? Refaire `numbers.json` avec les vrais chiffres (sièges, coût par Solo, support, CAC) et relire le besoin de trésorerie.
2. **Les pilotes** : sur les 5, combien paient encore après la garantie, et combien ont un cas « la réponse n'existait nulle part ailleurs » qu'ils acceptent de signer comme référence (C3, et le bonus « référence par un pair » de `offer.md`) ?
3. **CAC et attrition** (C9) : le CAC cumulé contre 1 500 €, les premiers départs et leurs raisons ; le remboursement sous 12 mois tient-il ?
4. **Le périmètre** : quelle demande revient le plus chez les équipes payantes (Notion, Slack, réunions, Gmail) ? Un connecteur n'entre au plan que s'il est demandé par au moins trois équipes payantes, dans cet ordre.
5. **La décision de fond** : continuer en autofinancement avec cette courbe, chercher un financement avec ces chiffres, ou s'arrêter. Les niveaux : ≥ 80 sièges payants, score ≥ 15, CAC ≤ 1 500 € → on continue tels quels ; 40 à 80 sièges → on continue, mais on retourne au conseil avec le dossier ; < 40 sièges, ou score < 13, ou 2 pilotes partis → on ne dépense pas un mois de plus sans changer l'offre, et c'est le conseil qui tranche.

---

## En une page, pour le mur

- **Ligne de succès du test (14/11)** : 5 pilotes réservés avec carte (dont 3 hors réseau), 3 engagements écrits, et le banc d'essai n'a pas tué le pivot. Les vrais acheteurs priment sur le panel.
- **Lancement** : lundi 12 janvier 2027 ; repli : lundi 26 janvier, décidé le 22 décembre.
- **Chemin critique** : les 5 pilotes doivent démarrer le 17 novembre (zéro marge) ; la relecture par l'auteur, le DPA et le cloisonnement ouvrent leur phase 2 le 1er décembre (une semaine de marge) ; le Kbis puis Stripe ont trois semaines de marge mais la variance la plus forte.
- **Jour J** : une voix publique, cinq fiches de panne, l'interrupteur du partage d'équipe à portée de main, les vrais chiffres à 18 h.
- **30 jours** : neuf chiffres chaque lundi, un niveau de déclenchement par chiffre, trois revues avec leurs questions écrites.

Ce document n'est pas un avis juridique ni comptable : les délais du greffe, de Stripe et de l'assurance sont des hypothèses, et tout ce qui touche à la capture des sessions de salariés, aux CGV, au DPA et à l'AIPD est relu par l'avocat avant d'être affiché.
