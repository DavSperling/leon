import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';

// Le typecheck ne lit que fr.json : une clé oubliée dans en.json, ou un paramètre renommé d'un seul côté,
// afficherait le nom de la clé à l'écran sans aucune erreur. Ces tests comparent les deux fichiers.

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') flat.set(`${prefix}${key}`, value);
    else for (const entry of flatten(value, `${prefix}${key}.`)) flat.set(...entry);
  }
  return flat;
}

// Les paramètres ICU d'un message : `{name}` ou `{count, plural, …}`. Les branches d'un pluriel (`{# outil}`)
// commencent par `#` et n'en sont pas.
const params = (message: string) =>
  [...new Set([...message.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((m) => m[1]))].sort();

// Les balises d'un message riche : `<link>…</link>`. Elles se lisent avec t.rich, une fonction par balise.
const tags = (message: string) =>
  [...new Set([...message.matchAll(/<([A-Za-z_]\w*)>/g)].map((m) => m[1]))].sort();

const FR = flatten(fr);
const EN = flatten(en);

describe('les messages', () => {
  it('ont les mêmes clés en français et en anglais', () => {
    expect([...EN.keys()].sort()).toEqual([...FR.keys()].sort());
  });

  it('ont les mêmes paramètres dans les deux langues', () => {
    for (const [key, message] of FR) {
      expect(params(EN.get(key) ?? ''), key).toEqual(params(message));
      expect(tags(EN.get(key) ?? ''), key).toEqual(tags(message));
    }
  });

  it('se lisent sans erreur dans les deux langues', () => {
    for (const [locale, messages] of [
      ['fr', FR],
      ['en', EN],
    ] as const) {
      const errors: string[] = [];
      const t = createTranslator({
        locale,
        messages: locale === 'en' ? en : fr,
        onError: (error) => errors.push(error.message),
      });
      for (const [key, message] of messages) {
        const values = Object.fromEntries(params(message).map((name) => [name, 2]));
        const chunks = Object.fromEntries(
          tags(message).map((tag) => [tag, (text: unknown) => text]),
        );
        t.rich(key as never, { ...values, ...chunks } as never);
      }

      expect(errors, locale).toEqual([]);
    }
  });
});

// Le MCP distant s'ouvre en collant son adresse dans l'assistant puis en l'autorisant dans Leon, plus par un jeton personnel.
describe('le site public et le MCP distant', () => {
  it.each(['site.home.assistantLead', 'site.connectors.channels.mcp.text'])(
    '%s dit « adresse collée, puis autorisée dans Leon », pas un jeton personnel',
    (key) => {
      expect(FR.get(key), key).not.toMatch(/jeton/i);
      expect(FR.get(key), key).toMatch(/adresse/);
      expect(FR.get(key), key).toMatch(/autoris/);
      expect(EN.get(key), key).not.toMatch(/token/i);
      expect(EN.get(key), key).toMatch(/address/);
      expect(EN.get(key), key).toMatch(/authorize/);
    },
  );
});
