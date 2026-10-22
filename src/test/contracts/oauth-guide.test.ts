import { describe, expect, it } from 'vitest';
import { PROVIDER_LABELS } from '@/lib/providers';
import { redirectUri } from '@/server/connectors/oauth';
import { OAUTH_APP_KEYS, type OAuthAppKey } from '@/server/connectors/oauth-env';
import { CONNECTORS } from '@/server/connectors/registry';
import type { OAuthSpec } from '@/server/connectors/types';
import { pathExists, productionSources, readText } from './files';

// Le guide des applis OAuth recopie ce que le code déclare : l'adresse de retour de chaque appli, ses
// variables d'environnement, les droits que Leon demande. Sans cette garde, un droit ajouté dans une
// description `oauth` ou une adresse changée laisse le guide faux, et l'appli créée d'après lui échoue
// chez l'éditeur. Les consignes propres à chaque console (où cliquer) ne sont pas vérifiables ici.

const GUIDE = 'docs/guides/applis-oauth.md';
const VERIFICATION = 'docs/guides/connecteurs-verification.md';

type App = { labels: string[]; specs: OAuthSpec[] };

// Les outils à bouton, regroupés par appli : Jira et Confluence partagent `ATLASSIAN`.
function appsFromCode(): Map<OAuthAppKey, App> {
  const apps = new Map<OAuthAppKey, App>();
  for (const [id, connector] of Object.entries(CONNECTORS)) {
    const spec = connector?.oauth;
    if (!spec) continue;
    const app = apps.get(spec.appKey) ?? { labels: [], specs: [] };
    app.labels.push(PROVIDER_LABELS[id as keyof typeof PROVIDER_LABELS]);
    app.specs.push(spec);
    apps.set(spec.appKey, app);
  }
  return apps;
}

// Une section par appli : chaque titre « ### » du guide, jusqu'au titre suivant (de niveau 2 ou 3).
function appSections(): string[] {
  return readText(GUIDE)
    .split(/\n(?=#{2,3} )/)
    .filter((section) => section.startsWith('### '));
}

const sectionOf = (key: OAuthAppKey): string | undefined =>
  appSections().find((section) => section.includes(`LEON_OAUTH_${key}_ID`));

describe('guide des applis OAuth', () => {
  it('existe', () => {
    expect(pathExists(GUIDE)).toBe(true);
  });

  it('couvre chacun des éditeurs de OAUTH_APP_KEYS, une section chacun', () => {
    const apps = appsFromCode();

    expect([...apps.keys()].sort()).toEqual([...OAUTH_APP_KEYS].sort());
    expect(appSections()).toHaveLength(OAUTH_APP_KEYS.length);
    for (const key of OAUTH_APP_KEYS) {
      expect(appSections().filter((s) => s.includes(`LEON_OAUTH_${key}_ID`))).toHaveLength(1);
    }
  });

  describe.each([...appsFromCode()])('%s', (key, app) => {
    const section = (): string => sectionOf(key) ?? '';

    it('porte le nom de chacun de ses outils dans son titre', () => {
      const title = section().split('\n')[0] ?? '';
      for (const label of app.labels) expect(title).toContain(label);
    });

    it('donne les deux variables, l’adresse de retour exacte et un lien (console ou documentation)', () => {
      expect(section()).toContain(`LEON_OAUTH_${key}_SECRET`);
      expect(section()).toContain(redirectUri(app.specs[0] as OAuthSpec));
      expect(section()).toMatch(/https:\/\/\S+/);
    });

    it('ne cite l’adresse de retour d’aucune autre appli', () => {
      const cited = [...section().matchAll(/connexions\/oauth\/([a-z]+)\/retour/g)].map(
        (m) => m[1],
      );
      expect(cited.length).toBeGreaterThan(0);
      expect(cited.every((name) => name === key.toLowerCase())).toBe(true);
    });

    it('liste chaque droit que le code demande', () => {
      const scopes = new Set(app.specs.flatMap((spec) => spec.scopes));
      for (const scope of scopes) expect(section()).toContain(scope);
    });
  });
});

describe('README : Brancher par bouton', () => {
  const readme = readText('README.md');
  const start = readme.indexOf('\n## Brancher par bouton\n');
  const rest = readme.slice(start + 1);
  const section = rest.indexOf('\n## ', 1) === -1 ? rest : rest.slice(0, rest.indexOf('\n## ', 1));

  it('existe, renvoie au guide et dit où vont l’identifiant et le secret', () => {
    expect(start).toBeGreaterThan(-1);
    expect(section).toContain(`(${GUIDE})`);
    expect(section).toContain('LEON_OAUTH_');
    expect(section).toContain('.env.local');
  });

  it('ne dit plus que les outils se branchent « sans OAuth »', () => {
    expect(readme).not.toContain('sans OAuth');
  });
});

describe('guide de vérification : brancher par bouton', () => {
  // Les boutons et messages que le guide demande de cliquer ou de lire existent dans l'interface.
  it.each([
    'Se connecter avec',
    'ou coller une clé',
    'Reconnecter',
    'Le lien a expiré, recommencez.',
    'annulée.',
    'est branché. La première synchronisation démarre dans la minute.',
    'a été retirée.',
    'n’est pas encore configurée sur ce serveur.',
  ])('cite « %s », qui existe dans le code', (label) => {
    expect(readText(VERIFICATION)).toContain(label);
    const sources = productionSources('src/**/*.{ts,tsx}');
    expect(sources.some(({ text }) => text.includes(label))).toBe(true);
  });

  it('renvoie au guide des applis', () => {
    expect(readText(VERIFICATION)).toContain('applis-oauth.md');
  });
});
