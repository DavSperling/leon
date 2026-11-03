import { maskSecrets } from './mask-secrets';
import { TURN_TEXT_MAX } from './turn';

const TRUNCATION_MARK = '\n[…tronqué]';

// Retire chaque bloc `<tag>…</tag>` fermé, en un seul passage ; un bloc sans fermeture reste tel quel. Sert aussi aux
// blocs de Leon (strip-leon-blocks.ts).
export function removeBlocks(text: string, tag: string): string {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  let kept = '';
  let position = 0;
  for (;;) {
    const start = text.indexOf(open, position);
    if (start === -1) break;
    const end = text.indexOf(close, start + open.length);
    if (end === -1) break;
    kept += text.slice(position, start);
    position = end + close.length;
  }
  return kept + text.slice(position);
}

// Appliquée sur le poste (CLI, extension) et refaite à la réception : null si rien ne reste à garder.
// Le masquage, linéaire, voit tout le texte avant la coupe : aucun secret coupé ne reste en clair.
// Le caractère nul est retiré : Postgres le refuse dans un text, et un seul ferait rejeter tout l'envoi.
export function prepareTurnText(text: string): string | null {
  const cleaned = maskSecrets(
    removeBlocks(text.replaceAll('\u0000', ''), 'system-reminder'),
  ).trim();
  if (cleaned === '') return null;
  if (cleaned.length <= TURN_TEXT_MAX) return cleaned;
  return cleaned.slice(0, TURN_TEXT_MAX - TRUNCATION_MARK.length) + TRUNCATION_MARK;
}
