import { browser } from '#imports';
import { browserStore } from '../../lib/browser-store';
import { dateLocale, t, translatePage } from '../../lib/i18n';
import { type DroppedCounts, type DropReason, takeDropped } from '../../lib/outbox';
import {
  type CaptureStatus,
  hasConsent,
  loadSettings,
  loadStatus,
  type Settings,
  saveSettings,
} from '../../lib/settings';
import { bindSiteSwitches, showSiteSwitches, siteOf } from '../../lib/site-switches';

type Display = { label: string; tone: 'success' | 'warning' | 'danger' | 'info'; hint?: string };

const CONNECTION_DISPLAYS: Record<CaptureStatus['connection'], Display> = {
  connected: { label: t('● Connecté', '● Connected'), tone: 'success' },
  not_configured: {
    label: t('▲ Non configuré', '▲ Not set up'),
    tone: 'warning',
    hint: t(
      'Acceptez la divulgation et collez un jeton dans les options.',
      'Accept the disclosure and paste a token in the options.',
    ),
  },
  unauthorized: {
    label: t('■ Jeton refusé', '■ Token rejected'),
    tone: 'danger',
    hint: t('Collez un nouveau jeton dans les options.', 'Paste a new token in the options.'),
  },
  unreachable: {
    label: t('■ Serveur injoignable', '■ Server unreachable'),
    tone: 'danger',
    hint: t('Nouvel essai dans 1 min.', 'Trying again in 1 min.'),
  },
  unknown: { label: t('● Vérification…', '● Checking…'), tone: 'info' },
};

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Élément #${id} absent du popup`);
  return element as T;
}

function formatAgo(iso: string | undefined): string {
  if (!iso) return t('jamais', 'never');
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return t("à l'instant", 'just now');
  if (minutes < 60) return t(`il y a ${minutes} min`, `${minutes} min ago`);
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    return t(`il y a ${hours} h`, `${hours} h ago`);
  }
  const days = Math.floor(minutes / (24 * 60));
  return t(`il y a ${days} j`, `${days} d ago`);
}

function displayFor(settings: Settings, status: CaptureStatus): Display {
  if (settings.paused) return { label: t('❚❚ En pause', '❚❚ Paused'), tone: 'info' };
  if (!hasConsent(settings) || settings.token === null) {
    return CONNECTION_DISPLAYS.not_configured;
  }
  return CONNECTION_DISPLAYS[status.connection];
}

function pendingText(count: number): string {
  if (count === 0) return t("Rien en attente d'envoi", 'Nothing waiting to be sent');
  return t(
    `${count} ${count === 1 ? 'échange' : 'échanges'} en attente d'envoi`,
    `${count} ${count === 1 ? 'exchange' : 'exchanges'} waiting to be sent`,
  );
}

// Lu une fois à l'ouverture (puis noté comme vu) : la popup garde le message tant qu'elle est ouverte.
const dropped = takeDropped(browserStore);

const DROP_CAUSES: Record<DropReason, string> = {
  full: t(
    "le tampon d'envoi était plein (serveur injoignable trop longtemps)",
    'the send buffer was full (server unreachable for too long)',
  ),
  refused: t(
    "le serveur n'en a pas voulu (échange trop gros ou illisible)",
    'the server refused it (exchange too large or unreadable)',
  ),
  token: t(
    'en attente quand le jeton a changé (rien ne part vers une autre organisation)',
    'waiting when the token changed (nothing is sent to another organization)',
  ),
};

function droppedText(counts: DroppedCounts): string {
  return Object.entries(counts)
    .map(([reason, count = 0]) => {
      const exchanges = t(
        count === 1 ? '1 échange perdu' : `${count} échanges perdus`,
        count === 1 ? '1 exchange lost' : `${count} exchanges lost`,
      );
      return `${exchanges}${t(' : ', ': ')}${DROP_CAUSES[reason as DropReason]}.`;
    })
    .join(' ');
}

async function render(): Promise<void> {
  const [settings, status, droppedCounts] = await Promise.all([
    loadSettings(browserStore),
    loadStatus(browserStore),
    dropped,
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
    element.title = iso ? new Date(iso).toLocaleString(dateLocale) : '';
  }
  byId('pending').textContent = pendingText(status.pending);
  byId('dropped').textContent = droppedText(droppedCounts);
  byId('dropped').hidden = byId('dropped').textContent === '';
  showSiteSwitches(document, settings);
}

translatePage();
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
