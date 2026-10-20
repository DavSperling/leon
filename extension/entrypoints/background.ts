import { browser, defineBackground } from '#imports';
import { getMe, postIngest } from '../lib/api';
import { browserStore as store } from '../lib/browser-store';
import { recordExchange } from '../lib/capture';
import type { Site } from '../lib/exchange';
import { countPending, flushOutbox, forgetOutboxOnTokenChange } from '../lib/outbox';
import {
  type CaptureStatus,
  canCapture,
  hasConsent,
  loadSettings,
  SETTINGS_KEY,
  saveStatus,
} from '../lib/settings';

const FLUSH_ALARM = 'leon-flush';

// Tampon vide : rien à envoyer, on vérifie quand même que le jeton est accepté.
async function probeConnection(token: string): Promise<CaptureStatus['connection']> {
  try {
    const response = await getMe(token);
    if (response.ok) return 'connected';
    return response.status === 401 ? 'unauthorized' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

async function flush(): Promise<void> {
  const settings = await loadSettings(store);
  const { token } = settings;
  // Tout envoi passe ici, après le changement de jeton : rien de l'ancien tampon ne part avec le nouveau.
  await forgetOutboxOnTokenChange(store, token);
  const pending = await countPending(store);
  if (token === null) {
    await saveStatus(store, { connection: 'not_configured', pending });
    return;
  }
  // Pause et sites coupés valent aussi pour ce qui attend déjà en tampon (les tampons ne contiennent que des sites de capture).
  const sent = await flushOutbox(
    store,
    (payload) => postIngest(token, payload),
    (payload) => canCapture(settings, payload.source.kind as Site),
  );
  const connection = sent === 'unknown' ? await probeConnection(token) : sent;
  await saveStatus(store, { connection, pending: await countPending(store) });
}

// Un seul traitement à la fois : le tampon et l'état sont lus puis réécrits.
let queue: Promise<void> = Promise.resolve();
function enqueueTask(task: () => Promise<void>): void {
  queue = queue.then(task).catch((error) => {
    console.error('Leon : échec du service worker', error instanceof Error ? error.name : 'erreur');
  });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    enqueueTask(async () => {
      // À l'installation comme à la mise à jour : sans accord sur le texte actuel, l'écran de consentement s'ouvre.
      if (!hasConsent(await loadSettings(store))) await browser.runtime.openOptionsPage();
    });
  });

  browser.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === FLUSH_ALARM) enqueueTask(flush);
  });

  browser.runtime.onMessage.addListener((message) => {
    enqueueTask(async () => {
      if (await recordExchange(store, message)) await flush();
    });
  });

  // Jeton collé ou changé, reprise après une pause : on n'attend pas la prochaine alarme.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && SETTINGS_KEY in changes) enqueueTask(flush);
  });
});
