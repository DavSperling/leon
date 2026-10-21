# Prototype « Verre + signal »

Essai de design pour toute l'interface de Leon, fait le 21 octobre 2026. **Ce n'est pas le code de l'appli** : c'est une maquette autonome, avec des données fictives, pour juger une direction visuelle sur de vrais écrans. Elle ne se branche ni sur le serveur, ni sur la base, ni sur l'IA.

## La lancer

```bash
cd prototypes/verre-signal/app
npm install
npx vite --port 5180
```

Puis ouvrir http://127.0.0.1:5180. Le prototype a son propre `package.json` (npm, hors de l'espace pnpm de Leon) ; `biome` ignore le dossier `prototypes/`.

## Ce qu'on y voit

- Tous les écrans : Recherche (réponse citée, filtres, aperçu), Discussions (liste et fil), Connexions (outils branchés et à brancher, schéma), Sources, Réglages (jetons), connexion et inscription, 404 et page d'erreur.
- Thème sombre et clair (menu du compte), barre latérale repliable en icônes (bouton en haut, touche `[` ou ⌘K), palette ⌘K, version mobile.
- `/_ds` : tous les composants et leurs états.
- Chaque écran liste en tête de son `index.tsx` les paramètres d'adresse qui montrent ses états (erreurs, vides, chargements…).

## Comment on y est arrivé

1. `planche/` : trois directions comparées sur l'écran Recherche (`v1.html` : Signal, Terminal, Verre), puis deux mélanges (`signal-verre.html`, `verre-signal.html`). Choix : **Verre + signal, violet atténué**.
2. `docs/spec.md` : les décisions (identité, pile, architecture, règles de qualité) ; `docs/inventaire-leon.md` : l'inventaire des écrans et des textes de l'appli réelle, repris à l'identique.
3. Consigne ajoutée en cours de route : rien d'« overkill ». Un point focal par écran, un seul bouton principal par vue, animation seulement pour un retour ou un changement d'état, aucune attente artificielle.

## Pile

Vite, React 19, TypeScript, Tailwind 4, `motion`, `radix-ui`, `lucide-react`, `react-router`. Même famille que l'appli : les jetons (`app/src/styles/tokens.css`) et les composants (`app/src/components/`) peuvent servir de point de départ si on adopte la direction.
