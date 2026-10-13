import { describe, expect, it } from 'vitest';
import { verifyQuote } from './quote';

// Les offsets renvoyés désignent toujours le texte d'origine du tour.
const sliceOf = (text: string, quote: string) => {
  const found = verifyQuote(text, quote);
  return found && text.slice(found.start, found.end);
};

describe('verifyQuote', () => {
  it('trouve une citation exacte et donne ses offsets', () => {
    const text = 'Bonjour. ACME paie ses factures à soixante jours. Merci.';

    expect(verifyQuote(text, 'ACME paie ses factures à soixante jours.')).toEqual({
      start: 9,
      end: 49,
    });
  });

  it('ignore les blancs autour de la citation', () => {
    const text = 'Bonjour. ACME paie à soixante jours.';

    expect(sliceOf(text, '  ACME paie à soixante jours. \n')).toBe('ACME paie à soixante jours.');
  });

  it('accepte une apostrophe typographique contre une apostrophe droite', () => {
    const text = "Le client dit qu'il signera lundi prochain.";

    expect(sliceOf(text, 'qu’il signera lundi')).toBe("qu'il signera lundi");
  });

  it('accepte une apostrophe droite contre une apostrophe typographique', () => {
    const text = 'Le client dit qu’il signera lundi prochain.';

    expect(sliceOf(text, "qu'il signera lundi")).toBe('qu’il signera lundi');
  });

  it('accepte des guillemets droits contre des guillemets français', () => {
    const text = 'Marie a écrit : « on signe lundi » hier soir.';

    expect(sliceOf(text, 'écrit : "on signe lundi" hier')).toBe('écrit : « on signe lundi » hier');
  });

  it('accepte des guillemets français contre des guillemets droits', () => {
    const text = 'Marie a écrit : "on signe lundi" hier soir.';

    expect(sliceOf(text, 'écrit : « on signe lundi » hier')).toBe('écrit : "on signe lundi" hier');
  });

  it('accepte des accents décomposés (NFD) contre des accents composés (NFC)', () => {
    const text = 'Le délai de paiement est réglé.'.normalize('NFD');

    expect(sliceOf(text, 'délai de paiement est réglé')).toBe(
      'délai de paiement est réglé'.normalize('NFD'),
    );
  });

  it('accepte des accents composés dans le tour contre une citation décomposée', () => {
    const text = 'Le délai de paiement est réglé.';

    expect(sliceOf(text, 'délai de paiement est réglé'.normalize('NFD'))).toBe(
      'délai de paiement est réglé',
    );
  });

  it('accepte des espaces multiples ou un retour à la ligne contre un espace', () => {
    const text = 'ACME paie   ses factures\nà soixante jours.';

    expect(sliceOf(text, 'ACME paie ses factures à soixante jours.')).toBe(text);
  });

  it('accepte des espaces multiples dans la citation contre un espace dans le tour', () => {
    const text = 'Note : ACME paie ses factures à soixante jours.';

    expect(sliceOf(text, 'ACME  paie ses\nfactures')).toBe('ACME paie ses factures');
  });

  it('refuse une citation de moins de 8 caractères après trim', () => {
    expect(verifyQuote('ACME paie à soixante jours.', '  ACME   ')).toBeNull();
    expect(verifyQuote('ACME paie à soixante jours.', 'ACME pa')).toBeNull();
  });

  it('refuse une citation absente', () => {
    expect(verifyQuote('ACME paie à soixante jours.', 'Orion démarre en novembre.')).toBeNull();
  });

  it('refuse une citation paraphrasée', () => {
    expect(
      verifyQuote(
        'ACME paie ses factures à soixante jours.',
        'ACME règle ses factures à 60 jours.',
      ),
    ).toBeNull();
  });

  it('refuse une citation de plus de 500 caractères, même présente', () => {
    const quote = 'a'.repeat(501);

    expect(verifyQuote(`avant ${quote} après`, quote)).toBeNull();
  });

  it('accepte une citation de 500 caractères', () => {
    const quote = 'a'.repeat(500);

    expect(verifyQuote(`avant ${quote} après`, quote)).toEqual({ start: 6, end: 506 });
  });
});
