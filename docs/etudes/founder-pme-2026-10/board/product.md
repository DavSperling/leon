# Grille Produit
Note : 4/10 | Vote : FUND IF

## Ce qui est solide
- **La phrase existe.** « La mémoire de l'entreprise, qui répond en citant la source exacte, et qui dit quand elle ne sait pas. » Ça tient en une ligne, et la promesse « s'il ne sait pas, il le dit » répond au premier reproche fait à Glean (résultats parfois faux).
- **Le bon geste est déjà identifié.** Ce que les clients de Glean apprécient, c'est la recherche unifiée qui respecte les droits et l'onboarding, presque jamais les agents. Le brief en tire la bonne conséquence : des recettes prêtes à l'emploi plutôt qu'un éditeur d'agents.
- **La confiance traitée comme une partie du produit.** Droits de l'outil d'origine, exclusions, droits les plus restrictifs sur tout ce qui est dérivé : c'est du soin sur une partie que le client ne voit pas, et c'est précisément là que le précédent panel avait refusé (sur-partage Drive).
- **La citation est un détail de qualité visible.** Chaque réponse montre d'où elle vient : le client peut juger la qualité lui-même.

## Ce qui le tuerait (les 3 premiers, le plus dangereux d'abord)
1. **Trop de choses à la fois.** Six équipes servies (sales, support, dev, RH, marketing, direction), huit familles d'outils, six briques produit, trois modes d'hébergement (SaaS, instance dédiée, cloud du client), une option de capture ChatGPT/Claude, l'accès MCP. À deux fondateurs, chaque brique sera faite à moitié. La grille Produit demande quoi couper ; le brief ne coupe rien.
2. **Les cinq premières minutes risquent d'être vides.** On promet « 15 minutes sans équipe IT », mais après les connecteurs il faut ingérer l'historique avant de pouvoir répondre. Si la première question tombe sur un index à moitié rempli, ou sur Slack que Leon ne peut pas stocker (interdit depuis mai 2025, recherche en temps réel seulement), la promesse « mémoire » casse dès le premier contact. Durée réelle d'ingestion pour une société de 50 personnes : inconnue.
3. **Les coutures entre systèmes.** Chaque connecteur est un point où l'expérience peut casser : permissions qui divergent de l'outil source, Slack traité autrement que le reste, réponses différentes selon qu'on passe par l'application Leon ou par ChatGPT/Claude via MCP. Dans ce dernier cas, Leon ne maîtrise ni l'interface ni la façon dont le LLM du client utilise (ou non) la citation : l'expérience n'est plus possédée de bout en bout.

## Les questions que je poserais au fondateur
- Si vous ne gardiez qu'une équipe et une seule recette, laquelle, et pourquoi celle-là ? (Le panel d'acheteurs peut le départager.)
- Décrivez la première question qu'un dirigeant pose à Leon le jour de l'installation, et ce qu'il voit à l'écran. Combien de temps avant une bonne réponse ?
- Que se passe-t-il quand la réponse est fausse ou incomplète ? Le client le voit-il, peut-il le signaler ?
- Où vit l'expérience principale : l'application Leon ou le LLM du client ? On ne peut pas soigner les deux à deux personnes.
- Pourquoi l'option de capture des conversations ChatGPT/Claude est-elle dans la première version ? Qu'apporte-t-elle au premier client qu'il n'aurait pas sans elle ?
- Sur la cible « 10 à 200 personnes », l'expérience d'une société de 12 personnes et celle d'une de 180 sont-elles vraiment la même ?

## Si FUND IF : les conditions
1. **Couper jusqu'à une seule chose.** Une équipe, deux ou trois outils, une recette phare, un seul mode d'hébergement (le SaaS UE). Le reste attend que cette chose-là soit excellente. Le choix de l'équipe se tranche avec le panel d'acheteurs.
2. **Écrire les cinq premières minutes avant le code.** Un scénario d'installation chez un client type, mesuré sur le premier jet existant : temps d'ingestion réel, première réponse utile, ce qui s'affiche tant que l'index n'est pas prêt.
3. **Choisir où l'expérience est possédée.** Soit l'application Leon est le produit et le MCP un bonus, soit l'inverse ; et vérifier que la citation et le « je ne sais pas » survivent dans le canal choisi.
4. **Régler le cas Slack dans le produit, pas dans une note.** Montrer à l'utilisateur ce que Leon garde et ce qu'il va chercher à la volée, sans que la différence de qualité soit une surprise.
5. **Chiffres ouverts** à fournir par les étapes suivantes : temps d'ingestion et taux de bonnes réponses citées sur un vrai jeu de données (test produit), poids réel du coût de service selon le canal (CFO), et ce que font déjà Dust et Dropbox Dash sur la même recette phare (concurrents).
