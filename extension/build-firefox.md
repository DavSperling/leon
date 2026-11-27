# Building the Leon extension for Firefox

This archive holds the sources of the Leon extension (`extension/`), the four files it imports from the shared folder `src/capture/` (`api-contract.ts`, `turn.ts`, `mask-secrets.ts` and `prepare-turn-text.ts`), and the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `tsconfig.json`. The extension is built with WXT and Vite, both open source and installed by pnpm.

## Requirements

- Node.js 24 or later (`engines` in `package.json`): https://nodejs.org/
- pnpm 11.0.8 (`packageManager` in `package.json`): `npm install --global pnpm@11.0.8`, see https://pnpm.io/installation
- Our build machine differs from your default environment: macOS 26 on arm64, Node 26.5.0, pnpm 11.0.8.

No `.env` file and no other environment variable is needed.

## Build

From the root of this archive:

```sh
pnpm install --frozen-lockfile
pnpm ext:zip:firefox
```

`pnpm ext:zip:firefox` runs exactly:

```sh
WXT_PUBLIC_LEON_URL=https://leonmemory.com wxt zip extension -b firefox
```

## Output

- `extension/.output/firefox-mv3/`: the unpacked extension, to compare with the submitted package.
- `extension/.output/leon-<version>-firefox.zip`: the submitted package.
- `extension/.output/leon-<version>-sources.zip`: this archive, written again by the same command.
