import { describe, expect, it } from 'vitest';
import { DOCUMENT_MAX_BYTES, FOLDER_MAX_FILES } from '@/lib/documents';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import { readText } from './files';

// Les plafonds de l'écran Documents vivent dans src/lib/documents.ts, mais les messages (« 10 Mo », « 200 fichiers »)
// et la limite de requête de Next (next.config.ts) en recopient la valeur à la main : sans ce test, en changer un
// laisserait la page promettre ce que le serveur refuse, ou Next refuser un fichier avant l'action.

const mega = DOCUMENT_MAX_BYTES / 1024 / 1024;
const number = (value: number) => new RegExp(`\\b${value}\\b`);

describe('plafonds des documents', () => {
  it('sont ceux que disent les messages, en français et en anglais', () => {
    for (const { documents } of [fr, en]) {
      for (const text of [
        documents.formats,
        documents.noReadableFiles,
        documents.errors.unreadable,
      ]) {
        expect(text).toMatch(number(mega));
      }
      // la ligne des formats ne dit que la taille ; le plafond d'un dossier se dit dans son refus
      expect(documents.errors.folder_full).toMatch(number(FOLDER_MAX_FILES));
    }
  });

  it('tiennent dans la limite de requête de Next, qui laisse la place de l’enveloppe', () => {
    const limit = /bodySizeLimit:\s*'(\d+)mb'/.exec(readText('next.config.ts'))?.[1];

    expect(Number(limit) * 1024 * 1024).toBeGreaterThanOrEqual(DOCUMENT_MAX_BYTES + 64 * 1024);
  });
});
