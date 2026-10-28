import { describe, expect, it } from 'vitest';
import { listFiles, readText } from './files';

// « / » mène à l'appli dès qu'un cookie de session existe (src/proxy.ts) : le logo du site public, lui, mène toujours à
// l'accueil public, « /accueil », même connecté. Se connecter passe par « Sign in ».
describe('logo du site public', () => {
  it('mène à /accueil, jamais à « / »', () => {
    for (const file of [
      'src/components/site/site-header.tsx',
      'src/components/site/site-footer.tsx',
    ]) {
      const text = readText(file);
      expect(text, file).toMatch(/<Link[^>]*href="\/accueil"[^>]*>\s*<Brand/);
    }
  });

  it('ne laisse aucun lien vers « / » dans les composants du site', () => {
    const roots = listFiles('src/components/site/**/*.tsx').filter((file) =>
      /href=(?:"\/"|\{"\/"\})/.test(readText(file)),
    );
    expect(roots).toEqual([]);
  });
});
