import { describe, expect, it, vi } from 'vitest';
import { installCommand } from './install-command';

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
