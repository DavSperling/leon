import { browser } from '#imports';
import { browserStore } from '../../lib/browser-store';
import {
  type CaptureStatus,
  loadSettings,
  loadStatus,
  type Settings,
  saveSettings,
} from '../../lib/settings';
import { bindSiteSwitches, showSiteSwitches, siteOf } from '../../lib/site-switches';

type Display = { label: string; tone: 'success' | 'warning' | 'danger' | 'info'; hint?: string };

const CONNECTION_DISPLAYS: Record<CaptureStatus['connection'], Display> = {
  connected: { label: '● Connecté', tone: 'success' },
  not_configured: {
    label: '▲ Non configuré',
    tone: 'warning',
    hint: 'Acceptez la divulgation et collez un jeton dans les options.',
  },
  unauthorized: {
    label: '■ Jeton refusé',
    tone: 'danger',
    hint: 'Collez un nouveau jeton dans les options.',
  },
  unreachable: { label: '■ Serveur injoignable', tone: 'danger', hint: 'Nouvel essai dans 1 min.' },
  unknown: { label: '● Vérification…', tone: 'info' },
};

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Élément #${id} absent du popup`);
  return element as T;
}

function formatAgo(iso: string | undefined): string {
  if (!iso) return 'jamais';
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 24 * 60) return `il y a ${Math.floor(minutes / 60)} h`;
  return `il y a ${Math.floor(minutes / (24 * 60))} j`;
}

function displayFor(settings: Settings, status: CaptureStatus): Display {
  if (settings.paused) return { label: '❚❚ En pause', tone: 'info' };
  if (settings.consentAt === null || settings.token === null) {
    return CONNECTION_DISPLAYS.not_configured;
  }
  return CONNECTION_DISPLAYS[status.connection];
}

function pendingText(count: number): string {
  if (count === 0) return "Rien en attente d'envoi";
  return `${count} ${count === 1 ? 'échange' : 'échanges'} en attente d'envoi`;
}

async function render(): Promise<void> {
  const [settings, status] = await Promise.all([
    loadSettings(browserStore),
    loadStatus(browserStore),
  ]);
  const display = displayFor(settings, status);
  const state = byId('state');
  state.textContent = display.label;
  state.className = `badge ${display.tone}`;
  byId('hint').hidden = display.hint === undefined;
  byId('hint-text').textContent = display.hint ?? '';
  byId('paused-banner').hidden = !settings.paused;
  byId('pause-button').hidden = settings.paused;
  for (const element of document.querySelectorAll<HTMLElement>('[data-last]')) {
    const iso = status.lastCaptureAt[siteOf(element)];
    element.textContent = formatAgo(iso);
    element.title = iso ? new Date(iso).toLocaleString('fr-FR') : '';
  }
  byId('pending').textContent = pendingText(status.pending);
  showSiteSwitches(document, settings);
}

bindSiteSwitches(document, render);

for (const button of document.querySelectorAll('[data-toggle-pause]')) {
  button.addEventListener('click', async () => {
    const { paused } = await loadSettings(browserStore);
    await saveSettings(browserStore, { paused: !paused });
    void render();
  });
}

for (const button of document.querySelectorAll('[data-open-options]')) {
  button.addEventListener('click', () => browser.runtime.openOptionsPage());
}

void render();
