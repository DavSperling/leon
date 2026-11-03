import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

// La CLI de Leon en un seul fichier (S06 du plan « CLI sans clone »), pour le Node épinglé de src/cli/runtime.json :
// `pnpm build:cli` écrit public/cli/leon-<version>.mjs et public/cli/version.json (K7), que le serveur sert tels
// quels. `pnpm build` la lance avant `next build`, donc à chaque déploiement. `--outDir <dossier>` change la sortie
// (le test de contrat construit dans un dossier temporaire).
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUTPUT_NAME = 'leon.mjs';

// La version est le début de l'empreinte du fichier, mais le fichier la contient (`leon --version`). La construction
// y écrit donc ce repère (`define`), calcule l'empreinte du fichier ainsi, puis remplace le repère par les 12
// premiers caractères de cette empreinte. Le manifeste donne l'empreinte et la taille du fichier final, celles que
// vérifient le script d'installation et les mises à jour. Même code, même version.
const VERSION_MARK = 'leon-cli-version-mark';

const sha256 = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');

function cliFile(): Plugin {
  const runtime = JSON.parse(
    readFileSync(new URL('./src/cli/runtime.json', import.meta.url), 'utf8'),
  );
  return {
    name: 'leon-cli-file',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunk = bundle[OUTPUT_NAME];
      // Un second fichier (découpage) ne serait ni dans le manifeste ni servi : la CLI doit tenir en un seul.
      if (Object.keys(bundle).length !== 1 || chunk?.type !== 'chunk') {
        return this.error(`The CLI must be a single file (${OUTPUT_NAME}).`);
      }
      if (!chunk.code.includes(VERSION_MARK)) {
        return this.error(
          'The version mark is missing from the CLI: leon --version would be wrong.',
        );
      }
      const version = sha256(chunk.code).slice(0, 12);
      const file = Buffer.from(chunk.code.replaceAll(VERSION_MARK, version));
      const manifest = {
        version,
        sha256: sha256(file),
        taille: file.length,
        node: { version: runtime.version, plateformes: runtime.plateformes },
      };
      delete bundle[OUTPUT_NAME];
      this.emitFile({ type: 'asset', fileName: `leon-${version}.mjs`, source: file });
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  root: ROOT,
  plugins: [cliFile()],
  publicDir: false, // sinon Vite copierait public/ dans public/cli
  define: { __LEON_CLI_VERSION__: JSON.stringify(VERSION_MARK) },
  ssr: { noExternal: true, target: 'node' }, // tout est inclus : le fichier tourne seul, sans node_modules
  build: {
    ssr: 'src/cli/leon.ts',
    outDir: 'public/cli',
    target: 'node24',
    minify: false, // un fichier lisible dans les traces d'erreur ; 265 Ko (zod en pèse la moitié), loin du plafond de 1 Mo
    rolldownOptions: {
      output: { format: 'es', entryFileNames: OUTPUT_NAME, codeSplitting: false },
    },
  },
});
