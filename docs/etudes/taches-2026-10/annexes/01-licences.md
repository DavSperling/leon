# Annexe 1 : licences vérifiées

Vérifié le 14/10/2026 directement sur chaque dépôt : API GitHub (`api.github.com/repos/<dépôt>` : licence, étoiles, dernier push, archivé), fichiers `LICENSE` et `package.json` bruts, registre npm. Les étoiles et les dates sont celles du 14/10.

Lecture rapide : **MIT, Apache-2.0** = on peut copier le code dans Leon en gardant l'avis de licence. **MPL-2.0, EPL-2.0** = copyleft par fichier : utilisable comme dépendance, mais nos modifications de leurs fichiers doivent être publiées, et on ne copie pas leurs fichiers dans notre code. **AGPL, GPL** = copier le code impose de publier tout Leon. **BSL, licences « source available » ou à conditions** = pas open source, usage commercial restreint.

## Clones de Linear et gestionnaires de tâches

| Projet | Licence | Étoiles · dernier push | Pile | Proche de Linear | Copier dans Leon ? |
|---|---|---|---|---|---|
| **Plane** (makeplane/plane) | AGPL-3.0, tous les paquets aussi (`@plane/ui`, `editor`, `types`…) | 60,8k · 14/10/2026 | React, MobX ; API Django ; Postgres | Le plus proche : tâches, cycles, modules, statuts, kanban, pages | **Non** (inspiration seulement) |
| **Kaneo** (usekaneo/kaneo) | **MIT** | 9,5k · 13/10/2026 | React 19, Hono, Drizzle, Postgres, better-auth, TipTap | Fort : kanban, liste, calendrier, Gantt, sous-tâches, étiquettes | **Oui, notre base** |
| **Circle** (ln-dev7/circle) | **MIT** | 4,6k · 04/09/2026 | Next.js 15, shadcn, Zustand | Apparence de Linear, **interface seule, données factices** | Oui, comme maquette |
| zbugs (rocicorp/mono, `apps/zbugs`) | Apache-2.0 (licence du dépôt) | n/d | React, Fastify, Drizzle, Postgres, moteur Zero | Fort, mais démo | Oui, mais lié au moteur Zero |
| linearlite (electric-sql/electric, `examples/linearlite`) | Apache-2.0 | n/d | React, PGlite, Electric, TipTap | Moyen (démo) | Oui, mais lié à Electric |
| Huly (hcengineering/platform) | EPL-2.0 | 27,9k · 14/10/2026 | Svelte, Node | Fort (plus chat, docs, RH) | Possible en droit, mais Svelte et une plateforme énorme |
| Twenty | AGPL-3.0 + fichiers « Enterprise » ; **`twenty-ui` et SDK en MIT** | 58,3k · 14/10/2026 | React, NestJS, Postgres | Faible (CRM avec tâches) | Seulement `twenty-ui` |
| Vikunja | AGPL-3.0 | 5,7k · 14/10/2026 | Go, Vue | Moyen | Non |
| Leantime | AGPL-3.0 | 11,8k · 13/10/2026 | PHP | Faible | Non |
| OpenProject | GPL-3.0 | 16,4k · 14/10/2026 | Rails, Angular | Moyen (lourd) | Non |
| Taiga (taigaio/taiga-back) | MPL-2.0 | 857 · 28/09/2026 | Django, AngularJS | Moyen | Peu praticable |
| Worklenz | AGPL-3.0 | 3,2k · 14/10/2026 | React, Node, Postgres | Moyen | Non |
| Kan (kanbn/kan) | AGPL-3.0 | 5,8k · 02/10/2026 | TypeScript | Façon Trello | Non |
| Tegon | AGPL-3.0 | 1,9k · **archivé** (juin 2025) | TypeScript | Très proche de Linear | Non (et abandonné) |
| Focalboard | AGPL-3.0 pour le source | 26,5k · 18/05/2026, **« non maintenu »** | Go, React | Trello / Notion | Non |
| Planka | « PLANKA Community / Fair Use License » | 12,6k · 12/10/2026 | React, Sails, Postgres | Façon Trello | **Non** (hébergement commercial payant) |
| Multica | « Apache-2.0 » avec conditions : pas d'intégration dans un produit commercial sans licence payante | 52,8k · 14/10/2026 | Go, Next.js, Postgres | Proche de Linear, centré agents IA | **Non** |
| WeKan | MIT | 21,1k · 14/10/2026 | Meteor, MongoDB | Façon Trello | Permis, mauvaise pile |
| Tasks.md | MIT | 2,2k · 03/2026 | JS, fichiers Markdown | Minimal | Permis, peu utile |

## Clones de Notion

| Projet | Licence | Étoiles · dernier push | Pile | Réutilisable ? |
|---|---|---|---|---|
| AppFlowy | AGPL-3.0 (AppFlowy-Web aussi) | 77,3k · 08/10/2026 | Flutter, Rust | Non |
| AFFiNE | MIT, sauf `packages/backend` et `packages/common/native` (licence Enterprise payante en production) | 73,5k · 12/10/2026 | TS, React, NestJS | Client oui (MIT), serveur non |
| BlockSuite | Dépôt en MPL-2.0 ; le paquet npm `@blocksuite/affine` se déclare MIT | 6,1k · 13/10/2026 (dernière version npm : 01/07/2025) | TS, composants web Lit (pas React) | Ambigu et pas React : écarté |
| Anytype | Any Source Available License 1.0 | 8,9k · 13/10/2026 | TS, Go | Non |
| Docmost | AGPL-3.0 + dossiers `ee/` sous licence Enterprise | 22,0k · 14/10/2026 | TS, TipTap, NestJS, Postgres | Non |
| Outline | BSL 1.1 (interdit l'usage comme service documentaire commercial ; Apache-2.0 le 12/10/2030) | 40,9k · 14/10/2026 | TS, React, ProseMirror | Non |
| Logseq | AGPL-3.0 | 45,2k · 14/10/2026 | ClojureScript | Non |
| SiYuan | AGPL-3.0 | 46,8k · 14/10/2026 | TS, Go | Non |
| Notesnook | GPL-3.0 | 14,8k · 14/10/2026 | TS, React | Non |

## Briques

| Brique | Licence | Version · téléchargements npm par semaine | Remarque |
|---|---|---|---|
| **TipTap** (cœur, `pm`, collaboration) | MIT | 3.32.0 · 22,6 M | Les extensions et modèles « Pro » sont payants : ne pas les prendre |
| **Plate** (`platejs`) | MIT | 53.3.15 · 518k | Alternative à TipTap pensée pour shadcn |
| **Lexical** | MIT | 0.52.0 · 6,0 M | Plus bas niveau |
| BlockNote (cœur, react, shadcn) | MPL-2.0 | 0.56.0 · 800k | Utilisable en dépendance ; les paquets **`xl-*`** (colonnes, IA, exports) sont **GPL-3.0** ou payants |
| Novel | Apache-2.0 | 1.0.2 · 79k | Plus de version depuis janvier 2025 |
| Yoopta-Editor | MIT | 6.0.5 · 39k | Maintenance moyenne |
| **dnd-kit** | MIT | core 6.3.1 · 28,7 M ; `@dnd-kit/react` 0.5.0 · 1,8 M | Le cœur ne sort plus de version depuis 12/2024, le travail est dans `@dnd-kit/react` |
| pragmatic-drag-and-drop (Atlassian) | Apache-2.0 | 4.0.0 · 1,7 M | Actif |
| @hello-pangea/dnd | Apache-2.0 | 18.0.1 · 3,4 M | Dernière version 02/2025 |
| Kibo UI Kanban, Dice UI Kanban | MIT | composants shadcn à copier | Reposent sur dnd-kit |
| **TanStack Table** | MIT | 9.3.1 · 24,1 M | Base de la table de données shadcn |
| AG Grid | `community` MIT, `enterprise` commercial | 36.2.0 · 3,6 M | Ne jamais tirer `ag-grid-enterprise` |
| Yjs, Hocuspocus | MIT | 13.6.33 · 10,3 M ; 4.7.1 · 918k | Pour la co-édition, hors V1 |
| Liveblocks | SDK Apache-2.0, service payant | 3.24.3 · 411k | Service propriétaire |

## Non vérifié

- Les détails de fonctions et d'API pris dans la documentation ou de mémoire, sans essai : cycles et palette de Plane, qualité des API de Vikunja, Leantime, OpenProject, Taiga et Worklenz, fonctions payantes de Plane.
- zbugs n'a pas de champ licence dans son `package.json` : Apache-2.0 déduit de la licence du dépôt.
- Les conditions de « Plate Plus » et du modèle Notion de TipTap, le dépôt de Liveblocks, `mattermost-plugin-boards` (limite de débit de l'API GitHub).

Sources principales : API GitHub et fichiers `LICENSE` bruts de chaque dépôt ; registre npm ; [licence TipTap Pro](https://tiptap.dev/docs/pro-license) ; [documentation de l'API Plane](https://developers.plane.so/api-reference/introduction) ; [ossalt, alternatives à Linear 2026](https://ossalt.com/guides/best-open-source-alternatives-to-linear-2026) ; [openalternative.co](https://openalternative.co/tags/linear-alternative).
