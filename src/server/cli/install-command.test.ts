import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { API_TOKEN_PATTERN } from '@/capture/api-contract';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import { claudeCodeInstructions, installCommand, serverAddress } from './install-command';
import { installerScript } from './installer-script';

vi.mock('@/server/env', () => ({ env: { BETTER_AUTH_URL: 'https://leon.example' } }));

// La commande que l'onboarding (S13) et Réglages (S14) donnent à copier : l'adresse du serveur et rien d'autre.
describe('installCommand', () => {
  it('lit BETTER_AUTH_URL par défaut', () => {
    expect(installCommand()).toBe('curl -fsSL https://leon.example/install | sh');
  });

  it('porte l’adresse du serveur et aucun autre paramètre', () => {
    expect(installCommand('https://leon.example')).toBe(
      'curl -fsSL https://leon.example/install | sh',
    );
  });

  it('réduit l’adresse à son origine : sans barre finale, port conservé', () => {
    expect(installCommand('https://leon.example/')).toBe(
      'curl -fsSL https://leon.example/install | sh',
    );
    expect(installCommand('https://leon.example:8443')).toBe(
      'curl -fsSL https://leon.example:8443/install | sh',
    );
  });

  it('accepte http sur la machine seule', () => {
    expect(installCommand('http://localhost:3000')).toBe(
      'curl -fsSL http://localhost:3000/install | sh',
    );
    expect(installCommand('http://127.0.0.1:3000')).toBe(
      'curl -fsSL http://127.0.0.1:3000/install | sh',
    );
  });

  // La règle de serverOrigin (le script d'installation) : une adresse qu'il refuse ne donne rien à copier.
  it('ne donne rien pour une adresse que le script d’installation refuse', () => {
    for (const refused of [
      'http://leon.example',
      'ftp://leon.example',
      'https://leon.example/app',
      'https://leon.example/?a=1',
      'https://leon.example/#x',
      'https://moi:secret@leon.example',
      'http://localhost:3000@evil.example',
      'https://leon.example; rm -rf ~',
      'pas une adresse',
      '',
    ]) {
      expect(installCommand(refused), refused).toBeNull();
    }
  });
});

// « Je demande à Claude » : la consigne que l'onboarding, Réglages et la page /documentation donnent à copier, dans la
// langue de l'interface. Elle porte la commande et le lien vers « Ce qui part », tous deux sur l'adresse du serveur.
const translator = (locale: 'en' | 'fr') =>
  createTranslator({
    locale,
    messages: locale === 'en' ? en : fr,
    namespace: 'claudeCode',
  });

describe('claudeCodeInstructions', () => {
  it.each(['en', 'fr'] as const)(
    'porte la commande et le lien vers « Ce qui part » (%s)',
    (locale) => {
      const text = claudeCodeInstructions(translator(locale), 'https://leon.example');

      expect(text).toContain('curl -fsSL https://leon.example/install | sh');
      expect(text).toContain('https://leon.example/documentation#ce-qui-part');
    },
  );

  it.each(['en', 'fr'] as const)(
    'ne cite aucune autre adresse, aucun jeton, aucun paramètre resté en plan (%s)',
    (locale) => {
      const text = claudeCodeInstructions(translator(locale), 'https://leon.example:8443') ?? '';

      const addresses = text.match(/https?:\/\/[^\s)]+/g) ?? [];
      expect(addresses.toSorted()).toEqual([
        'https://leon.example:8443/documentation#ce-qui-part',
        'https://leon.example:8443/install',
      ]);
      expect(text.split(/\s+/).filter((word) => API_TOKEN_PATTERN.test(word))).toEqual([]);
      expect(text).not.toMatch(/[{}]/);
    },
  );

  // Les consignes de la demande d'Amos, dans les deux langues. Le bouton à cliquer s'appelle comme celui de la page
  // d'autorisation de Leon.
  it.each([
    ['en', en.computer.authorize.allow, 'sandbox', 'explicit agreement', 'as is'],
    ['fr', fr.computer.authorize.allow, 'bac à sable', 'accord explicite', 'tel quel'],
  ] as const)(
    'dit à Claude Code ce qu’il doit faire et demander (%s)',
    (locale, allow, sandbox, agreement, verbatim) => {
      const text = claudeCodeInstructions(translator(locale), 'https://leon.example') ?? '';

      expect(text).toContain('setup --url');
      expect(text).toContain('--yes');
      expect(text).toContain(agreement);
      expect(text).toContain(verbatim);
      expect(text).toContain('127.0.0.1');
      expect(text).toContain(sandbox);
      expect(text).toMatch(new RegExp(`[“«] ?${allow} ?[”»]`));
      // Le clic attend 5 minutes, l'outil de Claude Code coupe à 2 : la consigne le dit et demande un délai plus long.
      expect(text).toContain('5 minutes');
      expect(text).toContain('2 minutes');
      // Les deux premiers obstacles de la sandbox : ~/.leon et nodejs.org (le script y écrit et y télécharge).
      expect(text).toContain('~/.leon');
      expect(text).toContain('nodejs.org');
    },
  );

  // La consigne cite le message que le script d'installation écrit sans terminal, et la fin de la commande qu'il
  // affiche : ce que Claude Code reconnaît dans la sortie du script doit y être, mot pour mot.
  it.each(['en', 'fr'] as const)(
    'cite les mots que le script d’installation écrit sans terminal (%s)',
    (locale) => {
      const script = installerScript('https://leon.example', {
        version: '0123456789ab',
        sha256: 'a'.repeat(64),
        taille: 1000,
        node: {
          version: '24.0.0',
          plateformes: {
            'darwin-arm64': 'b'.repeat(64),
            'darwin-x64': 'c'.repeat(64),
            'linux-x64': 'd'.repeat(64),
            'linux-arm64': 'e'.repeat(64),
          },
        },
      });
      const text = claudeCodeInstructions(translator(locale), 'https://leon.example') ?? '';

      for (const words of ['No terminal is available to ask you questions', 'setup --url']) {
        expect(script, words).toContain(words);
        expect(text, words).toContain(words);
      }
    },
  );

  it('ne donne rien quand le script d’installation refuse l’adresse', () => {
    expect(claudeCodeInstructions(translator('fr'), 'http://leon.example')).toBeNull();
  });
});

describe('serverAddress', () => {
  it('rend l’origine du serveur, ou rien si le script d’installation la refuse', () => {
    expect(serverAddress('https://leon.example/')).toBe('https://leon.example');
    expect(serverAddress('https://leon.example/app')).toBeNull();
  });
});
