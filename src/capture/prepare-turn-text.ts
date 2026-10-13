import { maskSecrets } from './mask-secrets';
import { TURN_TEXT_MAX } from './turn';

const REMINDER_OPEN = '<system-reminder>';
const REMINDER_CLOSE = '</system-reminder>';
const TRUNCATION_MARK = '\n[…tronqué]';

// Retire chaque bloc fermé, en un seul passage ; un bloc sans fermeture reste tel quel.
function removeSystemReminders(text: string): string {
  let kept = '';
  let position = 0;
  for (;;) {
    const open = text.indexOf(REMINDER_OPEN, position);
    if (open === -1) break;
    const close = text.indexOf(REMINDER_CLOSE, open + REMINDER_OPEN.length);
    if (close === -1) break;
    kept += text.slice(position, open);
    position = close + REMINDER_CLOSE.length;
  }
  return kept + text.slice(position);
}

// Appliquée sur le poste (CLI, extension) et refaite à la réception : null si rien ne reste à garder.
// Le masquage, linéaire, voit tout le texte avant la coupe : aucun secret coupé ne reste en clair.
export function prepareTurnText(text: string): string | null {
  const cleaned = maskSecrets(removeSystemReminders(text)).trim();
  if (cleaned === '') return null;
  if (cleaned.length <= TURN_TEXT_MAX) return cleaned;
  return cleaned.slice(0, TURN_TEXT_MAX - TRUNCATION_MARK.length) + TRUNCATION_MARK;
}
