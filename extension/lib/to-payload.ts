import { maskSecrets } from '../../src/capture/mask-secrets';
import { prepareTurnText } from '../../src/capture/prepare-turn-text';
import type { IngestPayload, Turn } from '../../src/capture/turn';
import type { CapturedExchange } from './exchange';

const TITLE_MAX = 300;

type CapturedMessage = CapturedExchange['user'];

function toTurn(role: Turn['role'], message: CapturedMessage): Turn | null {
  const text = prepareTurnText(message.text);
  if (text === null) return null;
  return {
    external_id: message.messageId,
    role,
    text,
    ts: message.ts,
    capture_mode: 'network',
  };
}

// Le masquage se fait ici, avant la mise en tampon : un secret ne se retrouve jamais dans le stockage.
export function exchangeToPayload(exchange: CapturedExchange): IngestPayload | null {
  const turns = [toTurn('user', exchange.user), toTurn('assistant', exchange.assistant)].filter(
    (turn) => turn !== null,
  );
  if (turns.length === 0) return null;
  const title = maskSecrets(exchange.title ?? '')
    .trim()
    .slice(0, TITLE_MAX);
  return {
    source: {
      kind: exchange.site,
      external_id: exchange.conversationId,
      ...(title === '' ? {} : { title }),
    },
    turns,
  };
}
