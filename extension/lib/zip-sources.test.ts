import { matchesGlob } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../wxt.config';

// WXT ramasse ce qui est sur le disque, que Git le suive ou non (node_modules/wxt/dist/core/zip.mjs:70-75).
const included = (file: string) =>
  (config.zip?.includeSources ?? []).some((glob) => matchesGlob(file, glob));

describe('le zip des sources pour Mozilla', () => {
  it('prend les fichiers qui servent à reconstruire l’extension', () => {
    for (const file of [
      'extension/assets/leon.css',
      'extension/entrypoints/background.ts',
      'extension/entrypoints/options/index.html',
      'extension/lib/parsers/chatgpt.ts',
      'extension/tsconfig.json',
      'extension/wxt.config.ts',
      'extension/build-firefox.md',
      'src/capture/turn.ts',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ]) {
      expect(included(file), file).toBe(true);
    }
  });

  it('laisse dehors un fichier oublié à côté du code (réponse enregistrée, note, clé, paquet)', () => {
    for (const file of [
      'extension/lib/parsers/reponse-capturee.json',
      'extension/lib/parsers/reponse-capturee.sse',
      'extension/notes/a-faire.md',
      'extension/cle-faux.pem',
      'extension/web-ext-artifacts/leon-0.9.0.xpi',
      'extension/web-ext-config.mjs',
      'extension/stats.html',
      'src/capture/conversation-dump.json',
      'src/capture/brouillons/conversation-exportee.ts',
    ]) {
      expect(included(file), file).toBe(false);
    }
  });
});
