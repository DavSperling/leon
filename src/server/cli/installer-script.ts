// Le script d'installation de la CLI (S09 du plan « CLI sans clone »), servi par GET /install et lancé par
// `curl -fsSL <leon>/install | sh` : il pose le Node épinglé et la CLI dans ~/.leon, puis lance `leon setup`.
//
// Le script est servi à n'importe qui et lancé par `sh` : aucune valeur ne doit pouvoir y injecter du shell. Les
// quelques valeurs qui y entrent (l'adresse du serveur, le manifeste K7) sont donc contrôlées une à une, puis écrites
// entre apostrophes (`singleQuote`). Une valeur qui n'a pas la forme attendue arrête la fabrication du script, avec un
// message fixe qui ne la recopie pas.
//
// Le texte du script est en anglais (c'est lui que l'utilisateur lit avant de le lancer, ou dans ses messages) ; il est
// du `sh` POSIX (macOS, dash, ash), tenu dans une seule fonction appelée à la dernière ligne : un téléchargement coupé
// en route est une erreur de syntaxe, il ne lance rien.
import { z } from 'zod';
import { singleQuote } from '@/cli/hook-commands';
import { isAllowedServerUrl } from '@/cli/server-url';

const PLATFORMS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'] as const;
type Platform = (typeof PLATFORMS)[number];
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

// K7 (/cli/version.json), tel que l'écrit vite.cli.config.ts. `version` est un nom de dossier : 12 caractères
// hexadécimaux, mais pas un morceau de `sha256` (le fichier contient sa propre version).
const ManifestSchema = z.object({
  version: z.string().regex(/^[0-9a-f]{12}$/),
  sha256,
  taille: z.number().int().positive(),
  node: z.object({
    version: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/),
    plateformes: z.object({
      'darwin-arm64': sha256,
      'darwin-x64': sha256,
      'linux-x64': sha256,
      'linux-arm64': sha256,
    }),
  }),
});
export type CliManifest = z.infer<typeof ManifestSchema>;

// L'adresse du serveur (BETTER_AUTH_URL), réduite à son origine : https, ou http sur la machine seule (le même
// contrôle que la CLI, `isAllowedServerUrl`), sans compte, chemin, requête ni ancre, et faite de caractères d'hôte.
function serverOrigin(value: string): string {
  const url = URL.canParse(value) ? new URL(value) : null;
  const simple =
    url !== null &&
    isAllowedServerUrl(value) &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '' &&
    url.username === '' &&
    url.password === '' &&
    /^https?:\/\/[a-z0-9.:[\]-]+$/.test(url.origin);
  if (!simple) {
    throw new Error(
      'The installer needs the address of Leon (BETTER_AUTH_URL) to be a plain https address, or http on localhost.',
    );
  }
  return url.origin;
}

// Le manifeste (public/cli/version.json) est faux : la route répond que la CLI n'est pas prête, et non que l'adresse
// du serveur est mal réglée.
export class ManifestError extends Error {
  constructor() {
    super('The CLI manifest (public/cli/version.json) is not valid.');
  }
}

function parseManifest(manifest: unknown): CliManifest {
  const parsed = ManifestSchema.safeParse(manifest);
  if (!parsed.success) throw new ManifestError();
  return parsed.data;
}

// Le nom de la variable du script pour l'empreinte d'une plateforme : NODE_SHA256_DARWIN_ARM64.
const nodeShaVariable = (platform: Platform) =>
  `NODE_SHA256_${platform.toUpperCase().replace('-', '_')}`;

// Le texte du script pour le serveur `url` et le manifeste K7 `manifest`. Il lève une erreur si l'un ou l'autre ne
// passe pas le contrôle.
export function installerScript(url: string, manifest: unknown): string {
  const origin = serverOrigin(url);
  const cli = parseManifest(manifest);
  const values = [
    `LEON_URL=${singleQuote(origin)}`,
    `CLI_VERSION=${singleQuote(cli.version)}`,
    `CLI_SHA256=${singleQuote(cli.sha256)}`,
    `CLI_SIZE=${singleQuote(String(cli.taille))}`,
    `NODE_VERSION=${singleQuote(cli.node.version)}`,
    ...PLATFORMS.map((p) => `${nodeShaVariable(p)}=${singleQuote(cli.node.plateformes[p])}`),
  ].join('\n');
  return SCRIPT.replace('@VALUES@', () => values);
}

const SCRIPT = `#!/bin/sh
# Leon installer, served by Leon itself: curl -fsSL <your Leon address>/install | sh
# It puts Node and the Leon command line in ~/.leon, then runs "leon setup". It writes nothing outside ~/.leon
# (no PATH change, no shell profile). Every download is checked against the SHA-256 written below.
set -eu

@VALUES@

NODE_DIST='https://nodejs.org/dist'

say() { printf '%s\\n' "$*"; }
fail() { printf 'leon install: %s\\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "'$1' is required but was not found on this computer."; }

# Which Node archive fits this computer. Anything else stops here, before anything is written.
detect_platform() {
  os=$(uname -s)
  arch=$(uname -m)
  case "$os" in
    Darwin)
      # A terminal that runs under Rosetta says x86_64 on an Apple silicon Mac: the native Node is the one to take.
      if [ "$arch" = x86_64 ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then arch=arm64; fi
      case "$arch" in
        arm64) platform=darwin-arm64; node_sha=$NODE_SHA256_DARWIN_ARM64 ;;
        x86_64) platform=darwin-x64; node_sha=$NODE_SHA256_DARWIN_X64 ;;
        *) fail "this computer ($os $arch) is not supported yet. Leon supports macOS and Linux, on x64 and arm64." ;;
      esac
      ;;
    Linux)
      case "$arch" in
        x86_64) platform=linux-x64; node_sha=$NODE_SHA256_LINUX_X64 ;;
        aarch64|arm64) platform=linux-arm64; node_sha=$NODE_SHA256_LINUX_ARM64 ;;
        *) fail "this computer ($os $arch) is not supported yet. Leon supports macOS and Linux, on x64 and arm64." ;;
      esac
      if uses_musl; then
        fail "this Linux uses musl (Alpine, for example), and the official Node builds do not start on it. Leon needs a Linux with glibc (Debian, Ubuntu, Fedora...)."
      fi
      ;;
    *) fail "this computer ($os $arch) is not supported yet. Leon supports macOS and Linux, on x64 and arm64." ;;
  esac
}

# ldd names its libc (on Alpine, on its error output); without a verdict from ldd, a musl loader on the disk decides.
uses_musl() {
  ldd_says=$(ldd --version 2>&1 || true)
  case "$ldd_says" in
    *[Mm]usl*) return 0 ;;
    *GLIBC*|*"GNU libc"*|*"GNU C Library"*) return 1 ;;
  esac
  for loader in /lib/ld-musl-* /usr/lib/ld-musl-*; do
    if [ -e "$loader" ]; then return 0; fi
  done
  return 1
}

# The SHA-256 of a file: sha256sum (Linux), or shasum (macOS).
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  else
    shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}

# download <what> <address> <file> <host to allow if the network blocks it>
download() {
  say "Downloading $1..."
  curl -fsSL --connect-timeout 20 "$2" -o "$3" \\
    || fail "could not download $1 from $2. Check your network, and that $4 is allowed through any proxy or firewall."
}

# Replaces the symbolic link $2 by a link to $1 in one step: a new link, then a rename over the old one.
# The rename must not follow the old link into its directory: mv -T (GNU, busybox) or mv -h (macOS, BSD).
switch_link() {
  ln -s "$1" "$2.new.$$"
  if mv -f -T "$2.new.$$" "$2" 2>/dev/null; then return 0; fi
  if mv -f -h "$2.new.$$" "$2" 2>/dev/null; then return 0; fi
  rm -f "$2.new.$$"
  fail "could not switch $2 to $1."
}

work=
home_created=
cleanup() {
  status=$?
  trap - EXIT
  if [ -n "$work" ]; then rm -rf "$work"; fi
  # A failed first install leaves no ~/.leon behind: rmdir only removes what is empty.
  if [ "$status" -ne 0 ] && [ -n "$home_created" ]; then
    rmdir "$leon/runtime" "$leon/cli" "$leon" 2>/dev/null || true
  fi
  exit "$status"
}

main() {
  detect_platform
  need curl
  need tar
  # GNU tar unpacks .tar.xz by running xz; failing here is better than after a download of several megabytes.
  if [ "$os" = Linux ]; then need xz; fi
  need mktemp
  if ! command -v sha256sum >/dev/null 2>&1; then need shasum; fi

  home=\${HOME:-}
  if [ -z "$home" ] || [ ! -d "$home" ]; then fail "HOME is not set to an existing folder."; fi
  leon="$home/.leon"
  node_name="node-v$NODE_VERSION"
  node_dir="$leon/runtime/$node_name"
  cli_dir="$leon/cli/$CLI_VERSION"

  trap cleanup EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  # Everything below is private to the user. The caller's umask comes back before setup runs.
  old_umask=$(umask)
  umask 077
  if [ ! -e "$leon" ]; then home_created=1; fi
  mkdir -p "$leon" || fail "could not create $leon."
  chmod 700 "$leon"
  # The downloads are checked here, next to their final place (so that a rename is one step), and moved only when
  # everything has been checked.
  work=$(mktemp -d "$leon/.install.XXXXXX") || fail "could not create a work folder in $leon."

  # The Leon command line: its size and SHA-256 come from the manifest this script was written with.
  mkdir "$work/cli"
  download "the Leon command line" "$LEON_URL/cli/leon-$CLI_VERSION.mjs" "$work/cli/leon.mjs" "$LEON_URL"
  size=$(wc -c < "$work/cli/leon.mjs" | tr -d ' ')
  if [ "$size" != "$CLI_SIZE" ]; then
    fail "the Leon command line has the wrong size ($size bytes, expected $CLI_SIZE). Nothing was installed."
  fi
  if [ "$(sha256_of "$work/cli/leon.mjs")" != "$CLI_SHA256" ]; then
    fail "the Leon command line does not match its SHA-256. Nothing was installed."
  fi
  chmod 644 "$work/cli/leon.mjs"

  # Node, only if it is not already there and working.
  have_node=
  if [ -x "$node_dir/node" ] && [ "$("$node_dir/node" --version 2>/dev/null || true)" = "v$NODE_VERSION" ]; then
    have_node=1
  else
    archive="$node_name-$platform.tar.xz"
    download "Node v$NODE_VERSION (this can take a minute)" "$NODE_DIST/v$NODE_VERSION/$archive" "$work/$archive" "nodejs.org"
    if [ "$(sha256_of "$work/$archive")" != "$node_sha" ]; then
      fail "the Node download does not match its SHA-256. Nothing was installed."
    fi
    # Only bin/node is taken from the archive.
    mkdir "$work/$node_name"
    tar -xJf "$work/$archive" -C "$work/$node_name" --strip-components=2 "$node_name-$platform/bin/node" \\
      || fail "could not unpack Node (is 'xz' installed?). Nothing was installed."
    chmod 755 "$work/$node_name/node"
    if [ "$("$work/$node_name/node" --version 2>/dev/null || true)" != "v$NODE_VERSION" ]; then
      fail "the Node that was downloaded does not start on this computer. Nothing was installed."
    fi
    rm -f "$work/$archive"
  fi

  # Everything is checked: put it in place. Each step is a rename, and the links change in one step.
  mkdir -p "$leon/runtime" "$leon/cli"
  if [ -z "$have_node" ]; then
    rm -rf "$node_dir"
    mv "$work/$node_name" "$node_dir"
  fi
  switch_link "$node_name" "$leon/runtime/actuel"
  if [ -f "$cli_dir/leon.mjs" ] && [ "$(sha256_of "$cli_dir/leon.mjs")" = "$CLI_SHA256" ]; then
    :
  else
    rm -rf "$cli_dir"
    mv "$work/cli" "$cli_dir"
  fi
  switch_link "$CLI_VERSION" "$leon/cli/actuelle"

  umask "$old_umask"
  say "Leon is installed in $leon."

  # The setup asks questions: it needs a terminal. With "curl | sh" the standard input is this script, so it reads
  # the answers from /dev/tty.
  run_setup="'$leon/runtime/actuel/node' '$leon/cli/actuelle/leon.mjs' setup --url '$LEON_URL'"
  if (: < /dev/tty) 2>/dev/null; then
    "$leon/runtime/actuel/node" "$leon/cli/actuelle/leon.mjs" setup --url "$LEON_URL" < /dev/tty \\
      || fail "the setup did not finish. To resume it, run: $run_setup"
  else
    say "No terminal is available to ask you questions. To finish, open a terminal and run:"
    say "  $run_setup"
  fi
}

main "$@"
`;
