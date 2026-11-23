import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';
import { manifestFor } from './lib/manifest';
import { serverUrlFromEnv } from './lib/permissions';

export default defineConfig({
  // Firefox aussi en MV3 : WXT y vise MV2 par défaut.
  manifestVersion: 3,
  // Manifeste en fonction : WXT ne le résout qu'après avoir chargé .env.local,
  // si bien que host_permissions suit la même URL que SERVER_URL. La cible vient de WXT (-b).
  manifest: ({ browser }) =>
    manifestFor({ serverUrl: serverUrlFromEnv(process.env.WXT_PUBLIC_LEON_URL), browser }),
  zip: {
    // Noms fixes : extension/ n'a pas de package.json, WXT prendrait le nom du dossier courant.
    artifactTemplate: 'leon-{{version}}-{{browser}}.zip',
    sourcesTemplate: 'leon-{{version}}-sources.zip',
    // Les sources pour Mozilla partent de la racine du dépôt, car l'extension importe ../src/capture.
    // Sans dotSources, aucun fichier caché (.env*, .git, .output, .wxt) n'y entre ; node_modules et les tests
    // en sont exclus par WXT. La liste nomme des sortes de fichiers, pas des dossiers entiers : une réponse
    // enregistrée (.json, .sse), une note (.md) ou une clé (.pem) posée à côté reste dehors. public/ part en
    // entier : WXT le copie tout dans le paquet (resolve-config.mjs:66), rien de neuf ne part chez Mozilla.
    // shortcut: WXT ramasse ce qui est sur le disque, suivi par Git ou non, donc un .ts, .html ou .css non suivi
    // part encore ; construire les zips envoyés à Mozilla depuis une copie propre (git archive).
    sourcesRoot: fileURLToPath(new URL('..', import.meta.url)),
    includeSources: [
      'extension/{assets,entrypoints,lib}/**/*.{ts,html,css}',
      'extension/public/**',
      'extension/{tsconfig.json,wxt.config.ts,build-firefox.md}',
      'src/capture/*.ts',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ],
    excludeSources: ['**/fixtures/**'],
  },
  // Le code partagé vit dans ../src/capture (décision D1).
  vite: () => ({ server: { fs: { allow: ['..'] } } }),
});
