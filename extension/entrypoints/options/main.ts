import { API_TOKEN_PATTERN, ViewerProfileSchema } from '../../../src/capture/api-contract';
import { getMe, SERVER_URL } from '../../lib/api';
import { browserStore } from '../../lib/browser-store';
import { t, translatePage } from '../../lib/i18n';
import { CONSENT_VERSION, hasConsent, loadSettings, saveSettings } from '../../lib/settings';
import { bindSiteSwitches, showSiteSwitches } from '../../lib/site-switches';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Élément #${id} absent de la page`);
  return element as T;
}

const tokenInput = byId<HTMLInputElement>('token');
const message = byId('token-message');

function say(text: string, tone: 'ok' | 'error' | 'muted'): void {
  message.textContent = text;
  message.className = tone;
}

async function render(): Promise<void> {
  const settings = await loadSettings(browserStore);
  const consented = hasConsent(settings);
  byId('consent').hidden = consented;
  // Un accord donné sur un texte plus ancien : on dit pourquoi l'écran revient.
  byId('consent-changed').hidden = consented || settings.consentAt === null;
  byId('settings').hidden = !consented;
  byId('server-url').textContent = SERVER_URL;
  tokenInput.value = settings.token ?? '';
  showSiteSwitches(document, settings);
}

async function describeConnection(token: string): Promise<{ text: string; ok: boolean }> {
  try {
    const response = await getMe(token);
    if (response.status === 401) {
      return {
        text: t('Jeton refusé par le serveur.', 'Token rejected by the server.'),
        ok: false,
      };
    }
    if (!response.ok)
      return {
        text: t(
          `Réponse inattendue du serveur (${response.status}).`,
          `Unexpected server response (${response.status}).`,
        ),
        ok: false,
      };
    const profile = ViewerProfileSchema.parse(await response.json());
    return {
      text: t(
        `Connecté en tant que ${profile.userName} (${profile.organizationName})`,
        `Connected as ${profile.userName} (${profile.organizationName})`,
      ),
      ok: true,
    };
  } catch {
    return {
      text: t(
        'Serveur injoignable ou réponse illisible.',
        'Server unreachable or unreadable response.',
      ),
      ok: false,
    };
  }
}

byId('accept').addEventListener('click', async () => {
  await saveSettings(browserStore, {
    consentAt: new Date().toISOString(),
    consentVersion: CONSENT_VERSION,
  });
  await render();
});

byId('refuse').addEventListener('click', () => {
  byId('refused').hidden = false;
});

byId('show-token').addEventListener('click', (event) => {
  const hidden = tokenInput.type === 'password';
  tokenInput.type = hidden ? 'text' : 'password';
  (event.currentTarget as HTMLButtonElement).textContent = hidden
    ? t('Masquer', 'Hide')
    : t('Voir', 'Show');
});

// Le jeton du champ, contrôlé par le motif ; null (avec un message) s'il est invalide.
function tokenFromField(): string | null {
  const token = tokenInput.value.trim();
  if (token !== '' && !API_TOKEN_PATTERN.test(token)) {
    say(
      t(
        "Ce jeton n'a pas le bon format (leon_ suivi de 43 caractères).",
        "This token isn't in the right format (leon_ followed by 43 characters).",
      ),
      'error',
    );
    return null;
  }
  return token;
}

byId('token-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const token = tokenFromField();
  if (token === null) return;
  await saveSettings(browserStore, { token: token === '' ? null : token });
  say(
    token === '' ? t('Jeton retiré.', 'Token removed.') : t('Jeton enregistré.', 'Token saved.'),
    'ok',
  );
});

byId('test-connection').addEventListener('click', async () => {
  const token = tokenFromField();
  if (token === null) return;
  if (token === '') {
    say(t("Collez d'abord un jeton.", 'Paste a token first.'), 'error');
    return;
  }
  say(t('Test en cours…', 'Testing…'), 'muted');
  const result = await describeConnection(token);
  say(result.text, result.ok ? 'ok' : 'error');
});

translatePage();
bindSiteSwitches(document, () => {});
void render();
