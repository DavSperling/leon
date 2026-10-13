import { API_TOKEN_PATTERN, ViewerProfileSchema } from '../../../src/capture/api-contract';
import { getMe, SERVER_URL } from '../../lib/api';
import { browserStore } from '../../lib/browser-store';
import { loadSettings, saveSettings } from '../../lib/settings';
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
  const consented = settings.consentAt !== null;
  byId('consent').hidden = consented;
  byId('settings').hidden = !consented;
  byId('server-url').textContent = SERVER_URL;
  tokenInput.value = settings.token ?? '';
  showSiteSwitches(document, settings);
}

async function describeConnection(token: string): Promise<{ text: string; ok: boolean }> {
  try {
    const response = await getMe(token);
    if (response.status === 401) return { text: 'Jeton refusé par le serveur.', ok: false };
    if (!response.ok)
      return { text: `Réponse inattendue du serveur (${response.status}).`, ok: false };
    const profile = ViewerProfileSchema.parse(await response.json());
    return {
      text: `Connecté en tant que ${profile.userName} (${profile.organizationName})`,
      ok: true,
    };
  } catch {
    return { text: 'Serveur injoignable ou réponse illisible.', ok: false };
  }
}

byId('accept').addEventListener('click', async () => {
  await saveSettings(browserStore, { consentAt: new Date().toISOString() });
  await render();
});

byId('refuse').addEventListener('click', () => {
  byId('refused').hidden = false;
});

byId('show-token').addEventListener('click', (event) => {
  const hidden = tokenInput.type === 'password';
  tokenInput.type = hidden ? 'text' : 'password';
  (event.currentTarget as HTMLButtonElement).textContent = hidden ? 'Masquer' : 'Voir';
});

// Le jeton du champ, contrôlé par le motif ; null (avec un message) s'il est invalide.
function tokenFromField(): string | null {
  const token = tokenInput.value.trim();
  if (token !== '' && !API_TOKEN_PATTERN.test(token)) {
    say("Ce jeton n'a pas le bon format (leon_ suivi de 43 caractères).", 'error');
    return null;
  }
  return token;
}

byId('token-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const token = tokenFromField();
  if (token === null) return;
  await saveSettings(browserStore, { token: token === '' ? null : token });
  say(token === '' ? 'Jeton retiré.' : 'Jeton enregistré.', 'ok');
});

byId('test-connection').addEventListener('click', async () => {
  const token = tokenFromField();
  if (token === null) return;
  if (token === '') {
    say("Collez d'abord un jeton.", 'error');
    return;
  }
  say('Test en cours…', 'muted');
  const result = await describeConnection(token);
  say(result.text, result.ok ? 'ok' : 'error');
});

bindSiteSwitches(document, () => {});
void render();
