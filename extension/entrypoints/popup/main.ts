import { browser } from '#imports';
import {
  type Access,
  type ConnectionToShow,
  checkAccess,
  connectionToShow,
  type DropCause,
  dropCauseToShow,
  type SiteNotice,
  siteNoticeToShow,
} from '../../lib/access';
import { SERVER_URL } from '../../lib/api';
import { browserStore } from '../../lib/browser-store';
import { dateLocale, t, translatePage } from '../../lib/i18n';
import { type DroppedCounts, type DropReason, takeDropped } from '../../lib/outbox';
import { loadSettings, loadStatus, saveSettings } from '../../lib/settings';
import { bindSiteSwitches, showSiteSwitches, siteOf } from '../../lib/site-switches';

type Display = { label: string; tone: 'success' | 'warning' | 'danger' | 'info'; hint?: string };

const SERVER_HOST = new URL(SERVER_URL).host;

const CONNECTION_DISPLAYS: Record<ConnectionToShow, Display> = {
  paused: { label: t('❚❚ En pause', '❚❚ Paused'), tone: 'info' },
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
  access_removed: {
    label: t('■ Accès retiré', '■ Access removed'),
    tone: 'danger',
    hint: t(
      `Leon n’a plus accès à ${SERVER_HOST}. Rendez-le dans les réglages de l’extension de votre navigateur : les échanges captés attendent et partiront ensuite.`,
      `Leon no longer has access to ${SERVER_HOST}. Turn it back on in your browser’s extension settings: captured exchanges are kept and will be sent afterwards.`,
    ),
  },
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

function pendingText(count: number): string {
  if (count === 0) return t("Rien en attente d'envoi", 'Nothing waiting to be sent');
  return t(
    `${count} ${count === 1 ? 'échange' : 'échanges'} en attente d'envoi`,
    `${count} ${count === 1 ? 'exchange' : 'exchanges'} waiting to be sent`,
  );
}

// Lu une fois à l'ouverture (puis noté comme vu) : la popup garde le message tant qu'elle est ouverte.
const dropped = takeDropped(browserStore);

// Les accès que la personne a laissés à l'extension, lus une fois à l'ouverture.
const accessAtOpen = checkAccess(SERVER_URL, (permissions) =>
  browser.permissions.contains(permissions),
);

const DROP_CAUSES: Record<DropCause, string> = {
  full: t(
    "le tampon d'envoi était plein (serveur injoignable trop longtemps)",
    'the send buffer was full (server unreachable for too long)',
  ),
  full_access_removed: t(
    "le tampon d'envoi était plein (accès au serveur retiré)",
    'the send buffer was full (server access removed)',
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

// Sous un site : l'accès retiré, ou son dernier échange non capté tant que rien n'a été capté après lui.
const SITE_NOTICE_DISPLAYS: Record<SiteNotice, { text: string; tone: 'error' | 'muted' }> = {
  access_removed: {
    text: t(
      'Leon n’a plus accès à ce site : rien n’y est capté. Rendez-le dans les réglages de l’extension de votre navigateur.',
      'Leon no longer has access to this site: nothing is captured there. Turn it back on in your browser’s extension settings.',
    ),
    tone: 'error',
  },
  format: {
    text: t(
      'Dernier échange non capté : Leon n’a pas su le lire (le site a peut-être changé).',
      'Last exchange not captured: Leon could not read it (the site may have changed).',
    ),
    tone: 'error',
  },
  incomplet: {
    text: t(
      'Dernier échange non capté : la réponse n’était pas terminée.',
      'Last exchange not captured: the reply was not finished.',
    ),
    tone: 'muted',
  },
};

function droppedText(counts: DroppedCounts, access: Access): string {
  return Object.entries(counts)
    .map(([reason, count = 0]) => {
      const exchanges = t(
        count === 1 ? '1 échange perdu' : `${count} échanges perdus`,
        count === 1 ? '1 exchange lost' : `${count} exchanges lost`,
      );
      return `${exchanges}${t(' : ', ': ')}${DROP_CAUSES[dropCauseToShow(reason as DropReason, access)]}.`;
    })
    .join(' ');
}

async function render(): Promise<void> {
  const [settings, status, droppedCounts, access] = await Promise.all([
    loadSettings(browserStore),
    loadStatus(browserStore),
    dropped,
    accessAtOpen,
  ]);
  const display = CONNECTION_DISPLAYS[connectionToShow(settings, status, access)];
  const state = byId('state');
  state.textContent = display.label;
  state.className = `badge ${display.tone}`;
  byId('hint').hidden = display.hint === undefined;
  byId('hint-text').textContent = display.hint ?? '';
  // L'accès se rend dans les réglages du navigateur, pas dans les options de Leon.
  byId('hint-options').hidden = display === CONNECTION_DISPLAYS.access_removed;
  byId('paused-banner').hidden = !settings.paused;
  byId('pause-button').hidden = settings.paused;
  for (const element of document.querySelectorAll<HTMLElement>('[data-last]')) {
    const iso = status.lastCaptureAt[siteOf(element)];
    element.textContent = formatAgo(iso);
    element.title = iso ? new Date(iso).toLocaleString(dateLocale) : '';
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-rejection]')) {
    const notice = siteNoticeToShow(status, siteOf(element), access);
    const display = notice === null ? null : SITE_NOTICE_DISPLAYS[notice];
    element.hidden = display === null;
    element.textContent = display?.text ?? '';
    element.className = display?.tone ?? '';
  }
  byId('pending').textContent = pendingText(status.pending);
  byId('dropped').textContent = droppedText(droppedCounts, access);
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
