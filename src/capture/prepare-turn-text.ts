import { maskSecrets } from './mask-secrets';
import { TURN_TEXT_MAX } from './turn';

const SYSTEM_REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const TRUNCATION_MARK = '\n[…tronqué]';

// Appliquée sur le poste (CLI, extension) et refaite à la réception : null si rien ne reste à garder.
export function prepareTurnText(text: string): string | null {
  const cleaned = maskSecrets(text.replace(SYSTEM_REMINDER, '')).trim();
  if (cleaned === '') return null;
  if (cleaned.length <= TURN_TEXT_MAX) return cleaned;
  return cleaned.slice(0, TURN_TEXT_MAX - TRUNCATION_MARK.length) + TRUNCATION_MARK;
}
