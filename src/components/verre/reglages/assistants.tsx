'use client';

import { useTranslations } from 'next-intl';
import { CodeLine } from '@/components/verre';
import { PATH_TITLE } from './computers';

// Un client par ligne : comment l'ajouter (messages `client<Id>Name` et `client<Id>How`), et la ou les commandes à
// copier quand il s'ajoute en ligne de commande. Les autres (Gemini CLI, Antigravity…) vivent dans la documentation.
const CLIENTS: {
  id: 'ClaudeAi' | 'Chatgpt' | 'ClaudeCode' | 'Codex' | 'Cursor';
  commands?: (address: string) => string[];
}[] = [
  { id: 'ClaudeAi' },
  { id: 'Chatgpt' },
  { id: 'ClaudeCode', commands: (address) => [`claude mcp add --transport http leon ${address}`] },
  {
    id: 'Codex',
    commands: (address) => [`codex mcp add leon --url ${address}`, 'codex mcp login leon'],
  },
  { id: 'Cursor' },
];

/**
 * Le corps du panneau « Connecter un assistant » (la tuile porte l'ancre #assistants) : l'adresse du MCP de Leon à
 * coller dans l'assistant (celle des métadonnées, au caractère près : Claude compare), puis une ligne par client pour
 * dire où la coller. Les assistants branchés sont des cartes du groupe ; leur révocation est dans leur panneau.
 */
export function AssistantSetup({ address }: { address: string }) {
  const t = useTranslations('settings');
  return (
    <div>
      <p className="mb-3 text-ui leading-[1.55] text-fg-2">{t('assistantsLead')}</p>
      <CodeLine code={address} />
      <ul className="mt-2 divide-y divide-line">
        {CLIENTS.map(({ id, commands }) => (
          <li key={id} className="py-4 last:pb-0">
            <h3 className={PATH_TITLE}>{t(`client${id}Name`)}</h3>
            <p className="text-ui leading-[1.55] text-fg-2">{t(`client${id}How`)}</p>
            {commands?.(address).map((command) => (
              <CodeLine key={command} code={command} wrap className="mt-2.5" />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
