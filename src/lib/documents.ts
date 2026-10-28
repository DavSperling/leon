// Contrat de l'écran Documents entre le serveur et la page. Le navigateur n'importe rien de `@/server` : le plafond
// de taille (vérifié des deux côtés), les formats lus, ce qu'un dossier laisse de côté et les codes d'erreur que
// l'action renvoie vivent ici ; la page les traduit.

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
// Chaque fichier passe ensuite par l'indexation : un dossier en apporte 200 au plus.
export const FOLDER_MAX_FILES = 200;

// Lus par officeparser : l'extension est aussi son type de fichier.
export const OFFICE_EXTENSIONS = [
  'docx',
  'epub',
  'html',
  'odt',
  'ods',
  'pdf',
  'pptx',
  'rtf',
  'tex',
  'xlsx',
] as const;

// Lus tels quels, comme du texte : les formats simples, puis le code et la configuration d'un dépôt.
export const TEXT_EXTENSIONS = [
  'txt',
  'csv',
  'md',
  'mdx',
  'rst',
  'adoc',
  'log',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'xml',
  'css',
  'scss',
  'less',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'mts',
  'cts',
  'vue',
  'svelte',
  'astro',
  'py',
  'rb',
  'php',
  'go',
  'rs',
  'java',
  'kt',
  'kts',
  'scala',
  'swift',
  'm',
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'cs',
  'fs',
  'dart',
  'lua',
  'r',
  'jl',
  'ex',
  'exs',
  'erl',
  'clj',
  'hs',
  'ml',
  'elm',
  'sql',
  'prisma',
  'graphql',
  'gql',
  'proto',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'tf',
  'hcl',
  'nix',
] as const;

const READABLE: ReadonlySet<string> = new Set<string>([...OFFICE_EXTENSIONS, ...TEXT_EXTENSIONS]);

// Les dossiers qu'un dépôt ne versionne pas (dépendances, sorties de build), comme Claude Code les laisse de côté.
// Tout dossier ou fichier caché (`.git`, `.env`, `.DS_Store`) l'est aussi.
const IGNORED_FOLDERS: ReadonlySet<string> = new Set([
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  '__pycache__',
  'venv',
]);
// Des milliers de lignes générées, sans rien à retrouver ; puis les fichiers de secrets que Git ignore sans qu'ils
// soient cachés (un document est visible de toute l'organisation, et `maskSecrets` ne masque que les formes connues).
const IGNORED_FILES: ReadonlySet<string> = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'composer.lock',
  'poetry.lock',
  'Gemfile.lock',
  'Cargo.lock',
  'credentials.json',
  'secrets.json',
  'secrets.yml',
  'secrets.yaml',
  'local.settings.json',
  'service-account.json',
]);

// `accept` du choix de fichier.
export const DOCUMENT_ACCEPT = [...READABLE].map((extension) => `.${extension}`).join(',');

export function documentExtension(name: string): string {
  const base = name.split('/').at(-1) ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function isReadableName(name: string): boolean {
  return READABLE.has(documentExtension(name));
}

// `path` : le chemin d'un fichier sous le dossier choisi, séparé par des `/`, racine exclue : le dossier que
// l'utilisateur désigne lui-même n'est jamais jugé (un dossier `vendor` ou `build` reste un choix valable).
export function isIgnoredPath(path: string): boolean {
  const segments = path.split('/');
  const file = segments.at(-1) ?? '';
  return (
    IGNORED_FILES.has(file) ||
    segments.some((segment) => segment.startsWith('.') || IGNORED_FOLDERS.has(segment))
  );
}

// Ce qu'un dossier envoie : les fichiers lisibles hors dossiers ignorés et sous le plafond de taille. Les autres
// sont comptés pour que la page dise combien ont été laissés de côté.
export function selectFolderFiles<T extends { path: string; size: number }>(
  files: readonly T[],
): { kept: T[]; skipped: number } {
  const kept = files.filter(
    (file) =>
      !isIgnoredPath(file.path) &&
      isReadableName(file.path) &&
      file.size > 0 &&
      file.size <= DOCUMENT_MAX_BYTES,
  );
  return { kept, skipped: files.length - kept.length };
}

export type DocumentErrorCode =
  | 'missing'
  | 'unreadable'
  | 'empty'
  | 'too_long'
  | 'folder_full'
  | 'failed';
