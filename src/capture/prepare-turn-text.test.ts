import { describe, expect, it } from 'vitest';
import { SECRET_MASK } from './mask-secrets';
import { prepareTurnText } from './prepare-turn-text';
import { TURN_TEXT_MAX } from './turn';

describe('prepareTurnText', () => {
  it('retire un bloc system-reminder multiligne', () => {
    const text = 'Avant.\n<system-reminder>\nligne 1\nligne 2\n</system-reminder>\nAprès.';
    expect(prepareTurnText(text)).toBe('Avant.\n\nAprès.');
  });

  it('masque les secrets', () => {
    expect(prepareTurnText('DB_PASSWORD=correct-horse-battery')).toBe(`DB_PASSWORD=${SECRET_MASK}`);
  });

  it('retire les espaces autour', () => {
    expect(prepareTurnText('  \n Bonjour \n ')).toBe('Bonjour');
  });

  it('tronque au-delà de TURN_TEXT_MAX en finissant par le marqueur', () => {
    const result = prepareTurnText('a '.repeat(25_000));
    expect(result).not.toBeNull();
    expect(result?.length).toBeLessThanOrEqual(TURN_TEXT_MAX);
    expect(result?.endsWith('[…tronqué]')).toBe(true);
  });

  it('laisse intact un texte de la longueur maximale', () => {
    const text = 'a'.repeat(TURN_TEXT_MAX);
    expect(prepareTurnText(text)).toBe(text);
  });

  it('renvoie null pour un texte vide ou fait d’espaces', () => {
    expect(prepareTurnText('   \n\t ')).toBeNull();
  });

  it('renvoie null pour un bloc system-reminder seul', () => {
    expect(prepareTurnText('<system-reminder>Rappel</system-reminder>')).toBeNull();
  });

  it('retire le caractère nul, que Postgres refuse', () => {
    expect(prepareTurnText('sortie\u0000 binaire\u0000')).toBe('sortie binaire');
    expect(prepareTurnText('\u0000')).toBeNull();
  });
});

describe('prepareTurnText : entrées énormes', () => {
  it('retire un system-reminder plus long que la borne d’entrée', () => {
    const text = `<system-reminder>${'x'.repeat(50_000)}</system-reminder>Bonjour`;
    expect(prepareTurnText(text)).toBe('Bonjour');
  });

  it('masque tout le texte avant de le tronquer', () => {
    const result = prepareTurnText(`Début\nDB_PASSWORD=${'a'.repeat(100_000)} fin`);
    expect(result).toBe(`Début\nDB_PASSWORD=${SECRET_MASK} fin`);
  });

  it('ne laisse aucun fragment de secret coupé à une limite', () => {
    const alnum = 'aB3dE5gH7jK9mN1pQ2sT4vW6xY8zC0fL'.repeat(2);
    const prefix = `DB_PASSWORD=${'x'.repeat(39_977)} `;
    expect(prepareTurnText(`${prefix}ghp_${alnum.slice(0, 40)}`)).toBe(
      `DB_PASSWORD=${SECRET_MASK} ${SECRET_MASK}`,
    );
  });

  const TWO_MB = 2 * 1024 * 1024;
  // La borne garde contre une expression en temps quadratique (des minutes sur 2 Mo), pas contre quelques
  // millisecondes : 2 s, comme les pièges de mask-secrets, tient sur une machine chargée (la suite tourne en parallèle).
  it.each([
    '<system-reminder>',
    '-----BEGIN PRIVATE KEY-----',
    '-----BEGIN PGP PRIVATE KEY BLOCK-----',
    'postgres://a:',
    'https://a:b',
    'password=',
  ])('traite 2 Mo de « %s » répété en moins de 2 s', (unit) => {
    const text = unit.repeat(Math.ceil(TWO_MB / unit.length)).slice(0, TWO_MB);
    const start = performance.now();
    prepareTurnText(text);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
