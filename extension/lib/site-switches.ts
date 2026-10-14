import { z } from 'zod';
import { browserStore } from './browser-store';
import { SITES, type Site } from './exchange';
import { loadSettings, type Settings, saveSettings } from './settings';

const SiteSchema = z.enum(SITES);

// Le site d'un élément `data-site` ou `data-last` du HTML.
export function siteOf(element: HTMLElement): Site {
  return SiteSchema.parse(element.dataset.site ?? element.dataset.last);
}

// Interrupteurs `<input type="checkbox" data-site="claude_ai">` partagés par le popup et les options.
function switchesIn(container: ParentNode): NodeListOf<HTMLInputElement> {
  return container.querySelectorAll<HTMLInputElement>('input[data-site]');
}

export function showSiteSwitches(container: ParentNode, settings: Settings): void {
  for (const input of switchesIn(container)) {
    input.checked = settings.sites[siteOf(input)];
  }
}

export function bindSiteSwitches(
  container: ParentNode,
  onSaved: (settings: Settings) => void,
): void {
  for (const input of switchesIn(container)) {
    input.addEventListener('change', async () => {
      const site = siteOf(input);
      const { sites } = await loadSettings(browserStore);
      onSaved(await saveSettings(browserStore, { sites: { ...sites, [site]: input.checked } }));
    });
  }
}
