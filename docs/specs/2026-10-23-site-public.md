# Site public : accueil, cas d'usage, connecteurs, sécurité, tarifs

Ajouté le 23 octobre 2026. Tout ce qu'on voit **avant** de se connecter ; rien ne change une fois connecté.

## Ce qui existe

| Adresse | Contenu |
| --- | --- |
| `/` sans session | La page d'accueil (maquette 1), servie par `src/proxy.ts` à la même adresse. Avec un cookie de session, `/` reste la recherche. |
| `/accueil` | La même page d'accueil, à son adresse propre. |
| `/maquettes`, `/maquettes/1`, `/2`, `/3` | Les trois maquettes de l'accueil, à comparer (non indexées). Une barre flottante passe de l'une à l'autre. |
| `/produit` | Comment ça marche : capter, garder, retrouver, discuter ; ce qui arrive ensuite. |
| `/cas-usage`, `/cas-usage/<équipe>` | Les six équipes : direction, ventes, support, produit et tech, chefs de projet, arrivées. |
| `/connecteurs` | Les 39 outils, filtrables par famille et par nom ; les conversations d'IA ; ce qui est prévu. |
| `/securite` | Ce qui est vrai dans le code, et « Ce qui n'est pas encore là ». |
| `/tarifs` | Les trois formules proposées, et les questions fréquentes. |
| `/connexion`, `/inscription` | Même formulaire qu'avant (`AuthForm`, mêmes actions), avec l'en-tête du site et un panneau à droite. |

L'en-tête (`src/components/site/site-header.tsx`) : Produit, Cas d'usage (méga-menu des équipes), Connecteurs,
Sécurité, Tarifs, le thème, « Se connecter » et « Créer un espace ». Sous 900 px, une feuille du bas.

## Les trois maquettes de l'accueil

Même design « Verre + signal » (jetons, aurore, verre, filet Signal, Manrope et Geist Mono), trois compositions :

1. **Signal** : titre centré, puis une démo animée de la recherche (la requête se tape, le faisceau tourne, les
   sources arrivent, la réponse citée suit). Équipes en onglets, « La source, ou rien. », assistant et MCP.
2. **Constellation** : haut de page en deux colonnes avec le schéma vivant (les outils en orbite autour de Leon),
   puis une mosaïque des fonctions, chacune avec son aperçu.
3. **Récit** : éditorial, « Une journée avec Leon » de 08:45 à 18:10 sur une ligne de temps. Titres en Fraunces
   (la police d'affichage de `brand.md`), et ce que Leon ne fait pas.

## Règles suivies pour les textes

Celles de `docs/etudes/founder-pme-2026-10/brand.md` et `marketing.md` :

- précis, franc, posé ; vouvoiement, phrases courtes, ni point d'exclamation ni émoji ;
- aucun nom d'assistant ni de concurrent, aucun témoignage ni logo client, aucun chiffre non mesuré ;
- rien que le code ne tient pas : pas de RGPD, d'hébergement en Europe, de certification, de « lecture seule » ;
- pas de loupe, de cadenas, d'étincelles ni d'œil en visuel ;
- les exemples (ACME, Julie, Thomas…) sont fictifs et marqués « Exemple fictif ».

## À trancher

- **La maquette de l'accueil** : 1, 2 ou 3 (ou un mélange). Ensuite, supprimer `/maquettes` et les deux autres.
- **Le nom** : « Leon » reste un nom de travail (`brand.md` recommande « Acquis » puis « Témoin »).
- **Les tarifs** : ceux de `pricing.md` (pilote gratuit 30 jours, 25 € HT par utilisateur actif, dédiée sur devis),
  pas encore arrêtés. Aucune facturation n'est codée ; « sans carte bancaire » est vrai aujourd'hui.
- **Le pilote « une équipe de 10 personnes »** suppose les invitations (T26), pas encore livrées.
