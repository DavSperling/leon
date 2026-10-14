import { type BriefingResponse, BriefingResponseSchema } from '../../../src/capture/api-contract';
import { getBriefing, SERVER_URL } from '../../lib/api';
import { browserStore } from '../../lib/browser-store';
import { loadSettings } from '../../lib/settings';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Élément #${id} absent du panneau`);
  return element as T;
}

const message = byId('message');

async function fetchBriefing(): Promise<BriefingResponse | string> {
  const { token } = await loadSettings(browserStore);
  if (token === null) return 'Collez un jeton dans les options pour voir le briefing.';
  try {
    const response = await getBriefing(token);
    if (response.status === 401) return 'Jeton refusé : collez un nouveau jeton dans les options.';
    if (!response.ok) return `Le serveur a répondu ${response.status}.`;
    return BriefingResponseSchema.parse(await response.json());
  } catch {
    return 'Serveur injoignable ou réponse illisible.';
  }
}

function entryItem(entry: BriefingResponse['entries'][number]): HTMLLIElement {
  const item = document.createElement('li');
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = `${entry.title} · ${entry.typeLabel.toLocaleLowerCase('fr')}`;
  const statement = document.createElement('div');
  statement.textContent = entry.latestStatement;
  item.append(title, statement);
  if (entry.hasConflict) {
    const flag = document.createElement('div');
    flag.className = 'muted';
    flag.textContent = 'Contradiction à vérifier';
    item.append(flag);
  }
  return item;
}

function showBriefing(briefing: BriefingResponse): void {
  message.hidden = briefing.entries.length > 0;
  message.textContent = 'Aucune fiche modifiée ces 7 derniers jours.';
  byId('entries').replaceChildren(...briefing.entries.map(entryItem));

  const copy = byId<HTMLButtonElement>('copy');
  copy.hidden = false;
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(briefing.markdown);
      copy.textContent = 'Copié';
    } catch {
      copy.textContent = 'Copie impossible';
    }
  });

  const link = document.createElement('a');
  link.href = `${SERVER_URL}/a-verifier`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent =
    briefing.reviewCount === 1
      ? '1 élément à vérifier dans Leon →'
      : `${briefing.reviewCount} éléments à vérifier dans Leon →`;
  byId('review').replaceChildren(...(briefing.reviewCount === 0 ? [] : [link]));
}

async function render(): Promise<void> {
  const result = await fetchBriefing();
  if (typeof result === 'string') {
    message.textContent = result;
    return;
  }
  showBriefing(result);
}

void render();
