import { defineContentScript } from '#imports';
import { CAPTURE_MESSAGE_SOURCE } from '../lib/exchange';
import { installFetchInterceptor } from '../lib/intercept';
import { chatgptParser } from '../lib/parsers/chatgpt';
import { claudeAiParser } from '../lib/parsers/claude-ai';
import { CAPTURE_HOSTS } from '../lib/permissions';

// Monde MAIN, avant les scripts du site : observe les réponses de complétion, n'écrit jamais dans la page.
export default defineContentScript({
  matches: [...CAPTURE_HOSTS],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installFetchInterceptor(window, [claudeAiParser, chatgptParser], (exchange) =>
      window.postMessage({ source: CAPTURE_MESSAGE_SOURCE, exchange }, window.location.origin),
    );
  },
});
