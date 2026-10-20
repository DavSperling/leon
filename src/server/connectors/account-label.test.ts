import { describe, expect, it } from 'vitest';
import { ACCOUNT_MAX, accountLabel } from './account-label';

// Audit 4 n° 10 : le bouton et la clé nomment la connexion par la même fonction.
describe('accountLabel', () => {
  it('met le compte sur une ligne et le coupe à ACCOUNT_MAX caractères', () => {
    expect(accountLabel('Marie\nDurand\t(acme)', 'GitHub')).toBe('Marie Durand (acme)');
    expect(Array.from(accountLabel('é'.repeat(300), 'GitHub'))).toHaveLength(ACCOUNT_MAX);
    expect(ACCOUNT_MAX).toBe(120);
  });

  it('rend le nom de l’outil quand le compte est vide', () => {
    expect(accountLabel(' \n ', 'GitHub')).toBe('GitHub');
  });
});
