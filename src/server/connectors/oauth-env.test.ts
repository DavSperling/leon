import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAUTH_APP_KEYS, oauthClient, warnIncompleteOAuthPairs } from './oauth-env';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('oauthClient', () => {
  it("rend l'identifiant et le secret d'une paire complète", () => {
    vi.stubEnv('LEON_OAUTH_GITHUB_ID', 'id-github');
    vi.stubEnv('LEON_OAUTH_GITHUB_SECRET', 'secret-github');

    expect(oauthClient('GITHUB')).toEqual({ id: 'id-github', secret: 'secret-github' });
  });

  it('ignore une paire incomplète', () => {
    vi.stubEnv('LEON_OAUTH_LINEAR_ID', 'id-linear');
    vi.stubEnv('LEON_OAUTH_LINEAR_SECRET', '');
    vi.stubEnv('LEON_OAUTH_NOTION_SECRET', 'secret-notion');

    expect(oauthClient('LINEAR')).toBeNull();
    expect(oauthClient('NOTION')).toBeNull();
  });

  it('traite une chaîne vide comme une variable absente', () => {
    vi.stubEnv('LEON_OAUTH_ASANA_ID', '');
    vi.stubEnv('LEON_OAUTH_ASANA_SECRET', '');

    expect(oauthClient('ASANA')).toBeNull();
  });

  it('rend null pour une appli sans variables', () => {
    expect(oauthClient('MIRO')).toBeNull();
  });

  it('lit les variables à chaque appel', () => {
    expect(oauthClient('ATTIO')).toBeNull();
    vi.stubEnv('LEON_OAUTH_ATTIO_ID', 'a');
    vi.stubEnv('LEON_OAUTH_ATTIO_SECRET', 'b');
    expect(oauthClient('ATTIO')).toEqual({ id: 'a', secret: 'b' });
  });

  it('connaît les 16 applis', () => {
    expect(OAUTH_APP_KEYS).toHaveLength(16);
  });
});

describe('warnIncompleteOAuthPairs', () => {
  it('avertit une fois par paire incomplète, en nommant la variable manquante sans aucune valeur', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('LEON_OAUTH_GITLAB_ID', 'valeur-secrete-1');
    vi.stubEnv('LEON_OAUTH_HUBSPOT_SECRET', 'valeur-secrete-2');
    vi.stubEnv('LEON_OAUTH_MONDAY_ID', 'ok-id');
    vi.stubEnv('LEON_OAUTH_MONDAY_SECRET', 'ok-secret');

    warnIncompleteOAuthPairs();

    expect(warn).toHaveBeenCalledTimes(2);
    const messages = warn.mock.calls.map((args) => args.join(' '));
    expect(messages.some((m) => m.includes('LEON_OAUTH_GITLAB_SECRET'))).toBe(true);
    expect(messages.some((m) => m.includes('LEON_OAUTH_HUBSPOT_ID'))).toBe(true);
    expect(messages.join('\n')).not.toMatch(/valeur-secrete|ok-id|ok-secret/);
  });

  it("n'avertit pas quand aucune paire n'est commencée", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnIncompleteOAuthPairs();

    expect(warn).not.toHaveBeenCalled();
  });
});
