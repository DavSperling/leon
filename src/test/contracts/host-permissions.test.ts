import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_URL, hostPermissionsFor } from '../../../extension/lib/permissions';
import { listFiles, readText } from './files';

describe('permissions d’hôte de l’extension', () => {
  it('se limitent au serveur et aux deux sites de capture', () => {
    const permissions = hostPermissionsFor(DEFAULT_SERVER_URL);
    expect([...permissions].sort()).toEqual(
      ['http://localhost:3000/*', 'https://chatgpt.com/*', 'https://claude.ai/*'].sort(),
    );
    expect(permissions).not.toContain('<all_urls>');
  });

  it('des scripts de contenu viennent de CAPTURE_HOSTS', () => {
    const contentScripts = listFiles('extension/entrypoints/*.content.ts');
    expect(contentScripts).toHaveLength(2);
    for (const path of contentScripts) {
      expect(readText(path), path).toContain('matches: [...CAPTURE_HOSTS]');
    }
  });

  it('n’écrivent aucune URL de site en dur dans les points d’entrée', () => {
    for (const path of listFiles('extension/entrypoints/**/*.{ts,html}')) {
      expect(readText(path), path).not.toMatch(/https?:\/\//);
    }
  });
});
