# Site public : accueil, cas d'usage, connecteurs, sécurité, tarifs

Ajouté le 23 octobre 2026. Tout ce qu'on voit **avant** de se connecter ; rien ne change une fois connecté.

## Ce qui existe

| Adresse | Contenu |
| --- | --- |
| `/` sans session | La page d'accueil (« Signal »), servie par `src/proxy.ts` à la même adresse. Avec un cookie de session, `/` reste la recherche. |
| `/accueil` | La même page d'accueil, à son adresse propre. |
| `/produit` | Comment ça marche : capter, garder, retrouver, discuter ; ce qui arrive ensuite. |
| `/cas-usage`, `/cas-usage/<équipe>` | Les six équipes : direction, ventes, support, produit et tech, chefs de projet, arrivées. |
| `/connecteurs` | Les 39 outils, filtrables par famille et par nom ; les conversations d'IA ; ce qui est prévu. |
| `/securite` | Ce qui est vrai dans le code, et « Ce qui n'est pas encore là ». |
| `/tarifs` | Les trois formules proposées, et les questions fréquentes. |
| `/connexion`, `/inscription` | Même formulaire qu'avant (`AuthForm`, mêmes actions), avec l'en-tête du site et un panneau à droite. |

L'en-tête (`src/components/site/site-header.tsx`) : Produit, Cas d'usage (méga-menu des équipes), Connecteurs,
Sécurité, Tarifs, le thème, « Se connecter » et « Créer un espace ». Sous 900 px, une feuille du bas.

## L'accueil : « Signal »

Choisie le 24 octobre 2026 parmi trois maquettes (Signal, Constellation, Récit) ; les deux autres et `/maquettes`
ont été supprimées. Titre centré, puis une démo animée de la recherche (la requête se tape, le faisceau tourne, les
sources arrivent, la réponse citée suit). Équipes en onglets, « La source, ou rien. », assistant et MCP.

## Effets 3D et animations

Dans `src/components/site/fx/`, sans nouvelle dépendance :

- `Tilt` : la carte s'incline vers le pointeur, avec un reflet ; un enfant `.fx-pop` sort du plan.
- `ParticleField` : une nappe de points vue en perspective, soulevée par des ondes (Canvas 2D, couleurs du thème).
- `LogoSphere` : les 39 logos sur une sphère qui tourne seule et se lance à la souris ou au doigt.
- `Layers3D` : le brut, l'index et les droits, trois couches de verre éclatées (CSS 3D).
- `SplitWords` : un titre dont chaque mot bascule en 3D (CSS seul, visible sans JavaScript).
- Classes de `fx.css` : `fx-untilt` (panneau qui se redresse au défilement), `fx-ring` (bordure lumineuse qui tourne
  au défilement, sans travail au repos), `fx-breathe`.

Mouvement réduit : état final, rien ne tourne. Les animations en JavaScript s'arrêtent hors de l'écran et onglet caché.
Seuls `transform`, `opacity` et `filter` bougent ; les visuels 3D sont décoratifs (`aria-hidden`), le texte voisin dit la même chose.

## Règles suivies pour les textes

Celles de `docs/etudes/founder-pme-2026-10/brand.md` et `marketing.md` :

- précis, franc, posé ; vouvoiement, phrases courtes, ni point d'exclamation ni émoji ;
- aucun nom d'assistant ni de concurrent, aucun témoignage ni logo client, aucun chiffre non mesuré ;
- rien que le code ne tient pas : pas de RGPD, d'hébergement en Europe, de certification, de « lecture seule » ;
- pas de loupe, de cadenas, d'étincelles ni d'œil en visuel ;
- les exemples (ACME, Julie, Thomas…) sont fictifs et marqués « Exemple fictif ».

## À trancher

- **Le nom** : « Leon » reste un nom de travail (`brand.md` recommande « Acquis » puis « Témoin »).
- **Les tarifs** : ceux de `pricing.md` (pilote gratuit 30 jours, 25 € HT par utilisateur actif, dédiée sur devis),
  pas encore arrêtés. Aucune facturation n'est codée ; « sans carte bancaire » est vrai aujourd'hui.
- **Le pilote « une équipe de 10 personnes »** suppose les invitations (T26), pas encore livrées.
