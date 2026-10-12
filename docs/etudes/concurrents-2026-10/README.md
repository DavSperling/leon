# Étude concurrentielle v1 : Glean, Qontext, Sentra, memory.store

12 octobre 2026 · David (avec Claude) · à relire par Amos

Annexes : un rapport sourcé par concurrent dans [`annexes/`](annexes/). Complète l'onglet Concurrents de l'[étude de coûts](../couts-2026-10/README.md) et son [annexe 5](../couts-2026-10/annexes/05-concurrents.md).

## La question

Quatre produits ressemblent à Leon : Glean, Qontext, Sentra et memory.store. On voulait savoir ce que chacun règle vraiment, comment il capte et restitue la donnée, qui paie, et où Leon peut se placer. Quatre agents ont fouillé en parallèle les pages officielles, les docs, la presse, les avis et les forums, avec la même grille de dix questions.

## La réponse courte

1. **Le marché existe, et il est jeune.** Glean prouve que des entreprises paient des dizaines de milliers de dollars par an pour un contexte unifié (300 M$ d'ARR). Les trois autres ont levé 8 M$ cumulés en 2026 sur la thèse « mémoire partagée humains + agents » et n'ont **aucun avis utilisateur public**. Qontext a sorti sa 1.0 le 6 octobre. Tout le monde part en même temps.
2. **Personne ne capte les conversations LLM des employés.** Les quatre listent Claude, ChatGPT et Cursor comme destinations de lecture, jamais comme sources. Chez les quatre, un fait énoncé dans un chat n'entre en mémoire que si le LLM pense à appeler l'outil d'écriture. C'est le vide le plus net du tableau, et c'est le cœur de Leon.
3. **Le segment PME française est vide.** Glean refuse de fait les moins de 100 sièges. Qontext vend par démo à partir de 500 €/mois à des équipes IA. Sentra affiche 2-20 sièges mais vise l'enterprise. memory.store est à 150 $ par siège pour des startups de San Francisco. Aucun n'a de présence en France.
4. **L'argument UE ne suffit pas seul.** Qontext est à Francfort avec ISO 27001. Glean ouvre un bureau en France. L'hébergement UE est nécessaire, pas différenciant.
5. **La preuve de paiement en PME reste à faire.** Les clients payants connus sont des grands comptes (Glean, Lenskart chez Sentra). Sentra offre son plan Team au lancement, memory.store n'a pas de client nommé. Le premier à faire payer une PME aura un vrai signal.

## Tableau comparatif

| | Glean | Qontext | Sentra | memory.store | Leon |
|---|---|---|---|---|---|
| Base | Palo Alto, 2019 | Berlin, 2025 | San Francisco, 2025 | San Francisco, 2025 | France |
| Financement | Valo 7,2 Md$, ARR 300 M$ | 2,7 M$ pré-seed | 5 M$ seed (a16z) | YC, ~500 k$ | – |
| Cible | 100+ sièges, grands comptes | Mid-market « AI-native » | 2-20 self-service, vise l'enterprise | Startups tech | PME 10-50 |
| Prix | 30-50 k$/an minimum, non public | 500 à 2 000 €/mois en crédits | 16 $/siège, gratuit au lancement | 150 $/siège | ~25 €/siège |
| Ingestion SaaS proactive | Oui, 275 connecteurs | Oui, 10, synchro quotidienne | Oui, 6 sur le plan Team | Oui, 5 | Oui |
| Gmail | Oui | **Non** | Oui | Oui | Oui |
| Capture des conversations LLM | **Non** | **Non** | **Non** | **Non** | **Oui** |
| Écriture en mémoire par le LLM | Appel d'outil explicite | Appel d'outil | Appel d'outil | Appel d'outil | Pas nécessaire |
| Droits hérités des sources | Oui | **Non, réglés à la main** | Oui, filtrés à la requête | Opaque | Prévu, par fiche |
| Mémoire partagée d'équipe | **Non, personnelle** | Oui | Oui | Oui | Oui |
| Hébergement UE | Sur demande, plus cher | **Oui, Francfort, ISO 27001** | Non, US, OpenAI en sous-traitant | Non, US | Oui par défaut |
| Avis utilisateurs | G2 4,7/5, critiques sur l'exactitude | Aucun | Aucun | Aucun | – |

## Ce que chacun règle vraiment, et qui paie

### Glean

> « Je suis responsable IT ou Knowledge d'une boîte de 2 000 personnes. Mes employés perdent des heures à chercher une info éparpillée entre Confluence, Slack, Drive et Salesforce, et posent cent fois les mêmes questions. Je veux un moteur de recherche unique qui respecte les droits de chacun, et maintenant un assistant qui répond à leur place. »

- **Le problème réglé** : retrouver ce qui existe déjà dans l'entreprise. C'est de la recherche, pas de la mémoire.
- **Qui paie** : oui, massivement. 300 M$ d'ARR, 700+ clients, contrats médians à 99 k$/an sur Vendr. Le client type a 200 à 20 000 salariés et un service IT.

### Qontext

> « Je suis responsable IA ou CTO d'une scale-up. On construit des agents (support, ventes, n8n) et chacun redécouvre le contexte métier à zéro. Je veux une source de vérité versionnée, en Markdown, que tous nos agents lisent et que mon équipe valide par revue. »

- **Le problème réglé** : donner le même contexte à tous les agents qu'une entreprise construit. C'est de l'infra pour développeurs d'agents.
- **Qui paie** : probablement quelques-uns, pas prouvé. Témoignages Cognigy, make.com et Flink, aucun nombre de clients, la 1.0 date du 6 octobre. Les angels sont des fondateurs de l'écosystème automation, pas des clients.

### Sentra

> « Je suis dirigeant ou chief of staff d'une boîte en forte croissance. Les décisions se prennent dans des réunions et des threads Slack que personne ne relit, les engagements se perdent, et chaque nouvel arrivant repart de zéro. Je veux que ce qui a été dit et décidé soit capturé automatiquement, horodaté, et que moi et mes agents puissions l'interroger. »

- **Le problème réglé** : la mémoire organisationnelle des décisions et des engagements, avec leur histoire dans le temps. C'est le plus proche de Leon.
- **Qui paie** : oui en enterprise, pas encore en PME. Lenskart (20 000 salariés) en production, un PoC payant avec une filiale de SoftBank, une douzaine de design partners. Le plan Team à 16 $ est gratuit au lancement : des petites équipes qui paient, ce n'est pas encore prouvé. Le CEO dit lui-même que l'argent est chez les grands comptes.

### memory.store

> « Je suis fondateur d'une startup de 5 à 15 personnes, tout le monde travaille avec Claude Code et Cursor toute la journée. Ce que je décide dans Slack, mes agents ne le savent pas, et ce que mon agent apprend, mes collègues ne le voient pas. Je veux un cerveau commun pour l'équipe et ses agents, qui se tient à jour. »

- **Le problème réglé** : partager un contexte entre coéquipiers et leurs agents de code. Produit de niche pour startups tech.
- **Qui paie** : non prouvé. Aucun client nommé, aucun avis, en bêta en février 2026, classé « Tier C » par YC Tier List faute de démo et de clients. 150 $ par siège est un prix testé, pas validé.

### La user story de Leon

Elle n'est pas celle de Sentra. Le dirigeant en rénovation énergétique rencontré par Amos ne veut pas une « mémoire organisationnelle », il veut :

> « Demander à mon Claude l'historique de ce client (ce qu'on lui a posé, à quel prix, s'il paie encore) sans fouiller mon CRM et mes mails. »

C'est un problème plus petit, plus concret, et ce profil de client a déjà payé 20 000 € par mois pour la solution précédente de David. C'est ça qu'il faut vendre, pas le concept de mémoire.

## Positionnement proposé

**Leon : la mémoire d'entreprise qui se remplit toute seule, pour les PME.**

Trois piliers, dans cet ordre :

1. **« Elle se remplit toute seule. »** La capture des conversations LLM sans dépendre du modèle est le seul vrai vide technique du tableau. C'est la démo qui fait la différence : demander un truc sur un client à ChatGPT lundi, le retrouver dans Claude mardi, sans rien avoir fait.
2. **« Clé en main pour un dirigeant de PME. »** 25 € par siège, tout inclus dès le premier siège (droits fins, audit, API), installé en une journée, pas en trois mois. Glean et Qontext ne veulent pas servir ce marché.
3. **« Française, hébergée en Europe, en français. »** Nécessaire pour la santé, les experts-comptables, les avocats. À dire, sans en faire le pitch principal.

## Points de vigilance

- **Sentra est le concurrent le plus dangereux.** Même thèse d'ingestion proactive, même tranche de prix, un cas client sérieux et un discours très abouti sur les faits contradictoires et leur versionnage dans le temps (« write-time resolution », faits marqués « superseded » plutôt qu'effacés). Leon doit avoir une réponse crédible à « que se passe-t-il quand une fiche contredit l'ancienne », et ne pas se contenter d'une arborescence de fichiers.
- **Le vrai concurrent d'une PME, c'est Notion, Google Workspace et Microsoft 365**, déjà installés. Le pitch ne doit pas être « mieux que Glean » mais « ce que votre Google Workspace ne fait pas ».
- **Deux idées d'UX à égaler**, vues chez memory.store : des « Briefs » qui se mettent à jour quand de nouvelles mémoires arrivent, et un « checkin » automatique en début de session.
- **Glean itère vite** (mémoire « activity-based » le 8 octobre 2026) et arrive en France par des partenaires d'ici fin 2027. Un « Glean Business » self-serve changerait la donne.

## Ce que ça implique pour les pilotes

- **Au moins un pilote doit payer**, même peu. C'est le signal que personne n'a encore sur le segment PME.
- **La démo de capture** (une info dite à ChatGPT, retrouvée dans Claude) doit être prête avant le premier appel de découverte : c'est l'argument que les quatre concurrents ne peuvent pas tenir.
- **Commencer par la rénovation énergétique**, avec le use case « historique client », plutôt que par une boîte tech dont le besoin ressemble à celui de memory.store.

## Méthode et limites

Quatre agents Claude ont travaillé en parallèle, un par concurrent, avec la même grille de dix questions (produit, capture, restitution, droits, cible, prix, hébergement, traction, faiblesses, implications). Chaque fait est marqué dans les annexes comme vérifié sur une page officielle, issu d'un tiers ou déduit. Les chiffres de traction des jeunes sociétés sont auto-déclarés ou viennent d'annuaires. Aucun des quatre produits n'a été testé en main : c'est la prochaine étape utile, au moins pour Sentra (plan Team gratuit) et Qontext (plan Explore gratuit).
