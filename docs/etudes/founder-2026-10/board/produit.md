# Lentille Produit
Score : 4/10 | Vote : FUND IF

## Ce qui est fort

- **Le pivot « brut d'abord » est une décision de craft.** Le premier jet inventait parfois des citations ; l'entreprise a mesuré (7,70 $ par personne et par mois, 95 % pour l'extraction) et inversé l'architecture. C'est la qualité dans les parties que le client ne voit pas : la citation exacte est la promesse, et le produit est construit pour la tenir.
- **Le différenciateur est une expérience, pas une fonctionnalité.** « L'employé n'a pas à penser à enregistrer » : zéro effort au moment de l'usage. Aucun acteur de l'étude de marché ne le fait. La frontière privé/partageable est un vrai choix de design.
- **Une question en une ligne existe déjà :** « Pourquoi on a choisi Postgres pour le billing ? » Si le produit répond avec la citation de la conversation Claude Code où le choix a été fait, la démo tient en trente secondes.

## Ce qui pourrait le tuer (les 3 principaux, le plus dangereux d'abord)

**1. Les cinq premières minutes n'existent pas.** Minute 1 : l'admin consent OAuth pour Google ou Microsoft, puis Notion, Linear, GitHub, HubSpot : cinq ou six écrans, dont certains exigent un administrateur de domaine. Minute 2 : installer une extension, puis un agent local (permissions macOS, antivirus, poste verrouillé). Minute 3 : coller une URL et un jeton dans la configuration MCP de Claude ou ChatGPT, un fichier qu'un commercial n'a jamais ouvert. Minute 4 : première question ; l'index de deux ans d'historique (1,1 million de morceaux pour 30 personnes) n'est pas prêt, la réponse est vide. Minute 5 : onglet fermé. Et chaque employé refait extension, agent et MCP sur son poste. Le temps jusqu'à la première réponse utile et la part d'employés qui finissent l'installation sont les deux chiffres qui comptent ; le dossier n'en a aucun, ni aucun utilisateur.

**2. Quatre briques, huit sources, trois canaux d'installation, deux de lecture.** La phrase de présentation fait soixante mots. Les concurrents à 20 $ font déjà « recherche multi-sources avec citations », les outils de réunion font déjà « qu'est-ce qui s'est dit pendant mon call ». Chaque connecteur ajouté rapproche l'entreprise d'un produit que le client possède déjà et l'éloigne de la seule chose que personne ne fait. À couper : le chat web (le client a un LLM, et c'est la version à 4-11 $) ; HubSpot, Linear et Notion au lancement ; les questions « combien » et « où en est », qui reposent sur la couche la plus fragile ; l'un des deux capteurs. Reste : capter les conversations IA, en remonter les décisions avec leur raison, les servir par MCP. Une chose.

**3. Les coutures sont là où ça casse.**
- *Capteurs → interfaces de ChatGPT et Claude Code.* Elles changent sans prévenir ; la capture s'arrêtera en silence et la mémoire aura un trou dont personne ne connaîtra la date. Aucun signal « ça capte » n'est décrit.
- *Conversation privée → décision partagée.* Un classifieur décidera ce qui remonte et se trompera dans les deux sens : fuite d'un passage privé (un incident suffit à tuer la confiance) ou décision manquée (le produit paraît vide). Ni taux d'erreur ni relecture par l'auteur ne sont annoncés.
- *Leon → LLM du client.* Par MCP, Leon fournit le brut cité et c'est Claude ou ChatGPT qui rédige. L'hallucination du premier jet est déplacée dans un système que l'entreprise ne voit pas. L'écran principal appartient à quelqu'un d'autre ; l'entreprise possède l'arrière-boutique.
- *Droits d'origine → copie indexée.* Quand un droit change à la source, la copie dérive. Et Slack ne peut pas être copié : « toutes les sources » a déjà une exception.
- *Réunions.* « Des appels », sans dire comment ils sont captés : outil tiers (une couture de plus) ou rien.

## Les questions que je poserais aux fondateurs

1. Chrono en main, combien de minutes et d'écrans entre la création du compte et la première réponse citée qu'un commercial juge utile ?
2. Sur votre usage depuis septembre, quelle part des décisions prises dans Claude Code a été remontée, et combien de passages privés proposés par erreur ?
3. Combien de fois la capture s'est-elle arrêtée sans que vous le remarquiez ? Comment l'utilisateur le saura-t-il ?
4. Le produit en quinze mots : laquelle des quatre briques survit ?
5. « Ce que savait Marc avant son départ » : si Marc n'a pas installé l'agent le premier jour, que reste-t-il ?
6. Avez-vous vu un employé non technique configurer un serveur MCP seul ?

## Si FUND IF : les conditions

1. **Une seule chose avant toute vente :** capture des conversations IA, remontée des décisions avec leur raison, lecture par MCP. Pas de chat web, pas de HubSpot, Linear ni Notion, pas de comptages, un seul capteur. Les connecteurs reviennent un par un, sur demande de clients payants.
2. **Première réponse citée en moins de dix minutes**, sur un poste non technique, sans aide des fondateurs, démontrée sur cinq équipes hors réseau.
3. **Signal visible de capture et relecture par l'auteur** avant toute remontée à l'équipe, tant que le taux d'erreur du classifieur n'est pas mesuré.
4. **Posséder la réponse :** mesurer le taux de citations inventées dans Claude et ChatGPT sur un jeu de questions fixé ; pas de lancement si le premier jet aurait été jugé meilleur.
