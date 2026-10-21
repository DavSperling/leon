# Leon, prototype « Verre + signal » : spec

Prototype jetable, jamais poussé sur GitHub. But : montrer toute l'appli Leon refaite dans la direction choisie par David le 21 octobre 2026, avec des données fictives.

## Décisions prises

- Direction **Verre + touches de Signal, violet atténué**. La référence visuelle exacte est `planche/verre-signal.html` : jetons de couleur, rayons, lueurs, faisceau, palette ⌘K. En cas de doute, la planche fait foi.
- Thème sombre par défaut, thème clair aussi soigné. Bascule dans le menu du compte et dans ⌘K, mémorisée (`localStorage` `leon-theme`), forçable par `?theme=light|dark`.
- Animations riches mais utiles. Tout respecte `prefers-reduced-motion` : on affiche l'état final, sans animation infinie.
- Pile : Vite, React 19, TypeScript, Tailwind 4 (`@tailwindcss/vite`), `motion` (motion/react), `radix-ui` pour les primitives accessibles (Dialog, AlertDialog, DropdownMenu, Popover, Tooltip, Collapsible, Select), `lucide-react` pour les icônes, `react-router` pour les routes. Pas d'autre dépendance.
- Textes en français, repris de `docs/inventaire-leon.md` (copie exacte de l'appli actuelle) et du code réel (`src/` du dépôt Leon, lecture seule). Espaces fines insécables avant `; : ? ! %` et à l'intérieur des « » via `nb()`.

## Identité visuelle (résumé de la planche)

- **Fond** : aurore qui dérive lentement. En sombre : bleu nuit désaturé (~#24376e), sarcelle profonde (~#0d5f5c), ardoise (~#2d3a52). En clair : bleu très pâle, sarcelle pâle, gris froid. Jamais de violet saturé.
- **Surfaces** : verre gris froid translucide (backdrop-filter), panneau principal arrondi (~24-26 px), cartes ~16-18 px, pastilles entièrement rondes. Traits fins nets de 1 px.
- **Accent** : indigo qui tire vers le bleu, chroma réduite (sombre ~#aabff2, clair ~#3b5aae). Puces, surlignages, anneaux de focus en dérivent à faible alpha.
- **Typo** : Manrope pour le texte, Geist Mono pour toutes les métadonnées (compteurs, heures, [n], raccourcis, ms, statuts).
- **Touches Signal** : liseré dégradé en haut des cartes importantes, faisceau conique autour de la barre de recherche quand Leon travaille (l'aurore s'intensifie aussi), lueur qui suit le pointeur sur les cartes, indicateur de navigation qui glisse, lignes de liste nettes dans les menus et la palette.

## Architecture

```
app/
  index.html                 polices Google (Manrope, Geist Mono)
  src/main.tsx               routeur
  src/styles/                jetons (CSS variables par thème) + @theme Tailwind
  src/lib/                   thème, format (dates fr, nb()), flux simulé, utilitaires, mode instantané
  src/data/                  toutes les données fictives
  src/components/ui/         primitives du système (boutons, pastilles, cartes de verre, dialogues…)
  src/components/shell/      ossature : aurore, barre latérale, panneau, barre mobile, palette ⌘K
  src/screens/<écran>/       un dossier par écran, propriété exclusive de son agent
```

Routes : `/` Recherche, `/discussions`, `/discussions/:id`, `/sources`, `/connexions`, `/reglages`, `/connexion`, `/inscription`, `/_ds` (vitrine du système de design), `*` 404. Les pages d'authentification sont hors de l'ossature.

Paramètres de démonstration (pour les captures déterministes et pour montrer les états) : `?theme=`, `?instant=1` (état final immédiat, sans chorégraphie), et des paramètres d'état propres à chaque écran, documentés en tête de leur fichier.

## Écrans

1. **Recherche** : accueil (exemples, syntaxe), barre, filtres (Outil, Type, Période, Personne), réponse de Leon (tous ses états), résultats avec passages surlignés, aperçu, pagination.
2. **Discussions** : liste et nouvelle question, fil avec réponse en flux, sources citées, aperçu, notices, zone de saisie.
3. **Connexions** : schéma vivant des outils branchés, catalogue par famille, fenêtre de branchement (bouton OAuth, clé collée, gestion, suppression).
4. **Sources et Réglages** : canaux de capture, tableau d'indexation ; jetons personnels, branchement de Claude Code, extension.
5. **Connexion, inscription et pages système** : 404, erreur, chargement.

## Règles de qualité

- Contraste du texte ≥ 4,5:1 dans les deux thèmes, mesuré sur le vrai fond (pire cas de l'aurore derrière le verre).
- Focus visible partout, navigation clavier complète, rôles ARIA justes (Radix les fournit).
- Pas de défilement horizontal à 390 px ; barre latérale masquée sous 860 px (barre mobile à la place).
- On anime seulement `transform`, `opacity` et `filter` ; le flou d'arrière-plan reste sur peu de surfaces.
- Les transitions de page sont courtes (entrée ~260 ms, sortie plus rapide).
