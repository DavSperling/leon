import { browser, defineContentScript } from '#imports';
import { forwardCaptureMessage } from '../lib/bridge';
import { browserStore } from '../lib/browser-store';
import { relayIfAllowed } from '../lib/capture';
import { CAPTURE_HOSTS } from '../lib/permissions';

// Monde isolé : relaie au service worker les échanges postés par le script du monde MAIN.
export default defineContentScript({
  matches: [...CAPTURE_HOSTS],
  runAt: 'document_start',
  main() {
    window.addEventListener('message', (event) => {
      forwardCaptureMessage(
        event,
        { source: window, origin: window.location.origin },
        (message) => {
          void relayIfAllowed(browserStore, message, (m) => browser.runtime.sendMessage(m));
        },
      );
    });
  },
});
