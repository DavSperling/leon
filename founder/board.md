# Conseil d'administration : synthèse du président

13 octobre 2026 · David (avec Claude, méthode « founder-board » du pack [founder-skill](https://github.com/Jakeschincariol/founder-skill)) · à relire par Amos

Trois membres, chacun lisant l'idée à travers une seule lentille publiée : [Offres](board/offers.md), [Monopole](board/monopoly.md), [Produit](board/product.md). Le brief qu'ils ont reçu, sans accès à nos conversations, est dans [`board/brief.md`](board/brief.md) ; l'idée en une page dans [`idea.md`](idea.md). Les lentilles résument des cadres publiés ; les membres ne parlent pas au nom de leurs auteurs.

## Le vote

**2 FUND IF, 1 PASS. Score moyen : 3,7 / 10.**

| Lentille | Score | Vote | En une phrase |
|---|---|---|---|
| Offres | 4 | FUND IF | Le marché a de l'argent et le délai avant la première valeur est court, mais l'offre demande l'effort maximal à l'acheteur (agent et extension sur chaque poste, lecture des mails et chats des salariés, cadre juridique non étudié) sans aucune preuve, et vend une catégorie qu'aucune PME n'a jamais achetée. |
| Monopole | 3 | PASS | Aucun des quatre avantages durables ; la capture sans MCP est copiable en six mois par Sentra ou rendue inutile par un export admin d'OpenAI ou Anthropic ; les fondateurs refusent explicitement le seul petit marché avec un acheteur nommé et un budget prouvé. |
| Produit | 4 | FUND IF | La « seule chose » est déjà nommée (la démo lundi/mardi), mais la v1 l'entoure de huit coutures, et la règle d'ACL par défaut rend la mémoire personnelle, pas d'équipe, ce qui contredit le pitch. |

Le PASS de la lentille Monopole passerait à FUND IF aux mêmes conditions que les deux autres, en plus dures : un seul segment pendant douze mois, trois clients payants avant toute extension.

## Les risques soulevés par plus d'un membre

1. **Le périmètre « mémoire unifiée complète, tout secteur » est le point d'attaque des trois lentilles.** Monopole : c'est un marché large et flou, face à Sentra, Qontext et surtout Notion, Google Workspace et Microsoft 365 déjà installés. Offres : c'est une catégorie que personne n'achète ; l'offre doit être un résultat nommé dans les mots du client. Produit : la mémoire complète est la vision, le produit est la seule couture qui marche brillamment chez le premier client. Les trois convergent sur le même segment : la rénovation énergétique et « l'historique client depuis mon Claude ». Les trois notent que la position ferme des fondateurs (le produit est la mémoire complète, les cas sectoriels ne sont que des portes d'entrée) est exactement ce que chaque lentille déconseille. **Le conseil ne demande pas d'abandonner la vision ; il demande que le produit vendu pendant douze mois soit la porte d'entrée, pas la maison.**

2. **La capture par poste (agent local + extension) est à la fois le différenciateur et le maillon le plus fragile.** Offres : c'est l'effort maximal demandé à celui qui en a le moins besoin, puisque le premier acheteur identifié veut CRM + Gmail, pas la capture des LLM. Monopole : elle est « à la portée d'une personne seule », donc copiable, et elle dépend d'interfaces qui changent. Produit : chaque changement d'interface fait un trou dans la mémoire, et une mémoire trouée perd la confiance plus vite qu'une mémoire vide. Question commune : **que reste-t-il le jour où OpenAI ou Anthropic livrent un export admin des conversations, ou bloquent l'extension ?**

3. **Aucune preuve, nulle part.** Pas de client, pas de pilote, pas de produit, pas d'avis public chez aucun concurrent. Offres : à 25 € sans preuve ni garantie, Leon se compare à « déjà inclus dans Workspace », pas à Glean. Monopole : le réseau des fondateurs fait cinq noms, pas cent clients, et à 375 € par mois par client la vente directe ne passe pas à l'échelle. Les deux demandent qu'**au moins un pilote paie**, ce qui rejoint la conclusion de l'étude concurrentielle et tranche le désaccord gratuit/payant en faveur d'Amos.

4. **Le consentement des salariés n'est pas un point juridique « non su », c'est le premier écran du produit.** Offres : le dirigeant doit l'imposer à son équipe et porter le risque. Produit : le premier sentiment de l'employé est la surveillance, et cet écran n'est pas conçu. Monopole : quelle part de la mémoire disparaît si un salarié refuse ?

5. **Rust** : deux lentilles sur trois (Monopole, Produit) relèvent que personne dans l'équipe ne le lit.

Un désaccord à garder : la lentille Offres voit dans le délai court avant la première valeur (installation en une journée, deux ans d'historique importés pour ~109 $, briefing dès la première session) le meilleur point du dossier ; la lentille Produit voit des cinq premières minutes vides ou hostiles. Les deux ont raison sur des moments différents : la valeur arrive vite **si** l'installation est faite par nous et si l'import d'historique précède la première session.

## Les conditions, fusionnées

Une liste à cocher pour la suite du pack. Entre parenthèses, l'étape qui la teste.

**Marché et preuve**
- [ ] Choisir un seul segment, la rénovation énergétique (PAC, photovoltaïque), et un seul résultat nommé, « l'historique d'un client depuis mon Claude », comme **produit vendu** pendant douze mois, pas comme porte d'entrée. (Monopole, Offres, Produit)
- [ ] Dix entretiens de dirigeants de PME pour écrire la douleur dans leurs mots avant de fixer l'offre. (/founder-consumer)
- [ ] Un pilote paie, même peu, avant que le MVP soit déclaré fini. Trois clients payants dans le segment avant toute extension. (Offres, Monopole ; /founder-pricing, /founder-cfo)
- [ ] Nommer un canal au-delà du réseau des fondateurs et mesurer le coût d'acquisition. (Monopole ; /founder-cfo, /founder-marketing)
- [ ] Taille du marché français des équipes de 5 à 100 personnes prêtes à payer. (/founder-competitors, /founder-pricing)

**Offre**
- [ ] Effort acheteur à zéro pour le premier pilote : nous installons, nous fournissons le kit de consentement et le modèle juridique, nous commençons par les connecteurs serveur (CRM + Gmail). (Offres)
- [ ] Une garantie écrite, liée à une mesure d'usage, dans la première proposition commerciale. Esquisse de la lentille Offres : « pas facturé tant que l'équipe n'a pas obtenu N réponses qu'elle aurait dû redemander à un collègue ». (/founder-offer)
- [ ] Rareté réelle : cinq pilotes maximum d'ici fin 2026, installés par les fondateurs. (Offres)

**Produit**
- [ ] La démo lundi/mardi tourne chez les fondateurs avant tout pilote, avec le délai mesuré entre installation et premier fait restitué. (Produit)
- [ ] La v1 est une seule chose. Produit propose « capture LLM + briefing injecté » ; Offres et Monopole proposent « CRM + Gmail + historique client ». **Le conseil n'est pas d'accord sur laquelle**, et c'est au segment choisi de trancher : si le premier client est en rénovation énergétique, c'est CRM + Gmail ; la capture par poste attend d'être prouvée stable trois mois. (Offres, Produit)
- [ ] Le briefing et l'écran de consentement sont conçus, pas bruts. « SaaS brut » vaut pour le tableau de bord. (Produit)
- [ ] L'ACL par défaut permet la mémoire d'équipe sur les faits non sensibles ; sinon le produit n'est pas celui du pitch. À réconcilier avec la règle n°1 de l'architecture v1 (intersection des droits des preuves, auteur par défaut). (Produit)
- [ ] Pas de Rust tant que personne dans l'équipe ne le lit. (Produit, Monopole)
- [ ] Prouver que la capture tient six mois sans intervention chez un client réel avant d'en faire l'argument de vente. (Monopole)
- [ ] Mesurer la part de faits captés qui sont faux : un seul faux « il paie encore » détruit la confiance. (Produit ; /founder-consumer)

**Juridique**
- [ ] Consentement des salariés et droit du travail sur la lecture des mails et des conversations LLM, étudiés avant le premier pilote, et conçus comme un écran du produit. (Offres, Produit, Monopole)

## La version la plus forte de ce business, vue par le conseil

Elle n'est pas celle qui a été présentée, et il faut le dire franchement. Le conseil voit une entreprise qui vend pendant un an, aux PME de la rénovation énergétique, un seul résultat : « demandez à votre Claude l'historique de n'importe quel client, et il répond juste ». Elle s'installe en une journée par les fondateurs, lit le CRM et Gmail côté serveur, importe deux ans d'historique avant la première session, et se fait payer dès le premier pilote avec une garantie sur un nombre de réponses utiles. La capture des conversations LLM, le vrai secret, se construit en parallèle chez les fondateurs eux-mêmes et chez le pilote le plus engagé, jusqu'à ce qu'elle tienne six mois sans casser ; elle devient alors l'argument qui fait passer du premier résultat à la mémoire complète. La mémoire unifiée reste la destination ; la différence avec le plan actuel est que le produit vendu est le premier résultat, pas la destination, et que ce qui est copiable (l'extension) n'est pas ce qui est vendu en premier.

Ce que le conseil ne dit pas : que la vision est fausse. Les trois lentilles reconnaissent le secret (les LLM n'écrivent pas en mémoire, personne ne capte leurs conversations), le timing (tous les concurrents partent en 2026, Glean arrive fin 2027) et des marges qui ne sont pas le problème. Le désaccord porte sur l'ordre et le périmètre, pas sur la direction.

## Prochaine étape

Le pack continue avec `/founder-competitors` (déjà largement couvert par l'étude du 12 octobre) ou, plus utile ici, `/founder-consumer` : mettre l'idée devant 100 acheteurs simulés, des dirigeants de PME de 5 à 100 personnes, et en particulier des dirigeants en rénovation énergétique, pour tester la première condition du conseil avant de la discuter entre nous.
