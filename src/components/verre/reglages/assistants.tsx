'use client';

import { Plug } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { CodeLine, EmptyState, GlassCard, Section } from '@/components/verre';
import { SECTION } from './reglages';
import { type Token, TokenRow } from './tokens';

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
 * Section « Assistants connectés » (ancre #assistants) : l'adresse du MCP de Leon à coller dans l'assistant (elle doit
 * être celle des métadonnées, au caractère près : Claude compare), une ligne par client pour dire où la coller, puis
 * les assistants que l'utilisateur a branchés (jetons `assistant`, lus par la page), avec leur révocation.
 */
export function AssistantsSection({
  address,
  assistants,
}: {
  address: string;
  assistants: Token[];
}) {
  const t = useTranslations('settings');

  // la ligne disparaît avec son bouton : le focus passe à la ligne voisine, ou au premier bouton de la section
  const focusAfter = (id: string) => {
    const i = assistants.findIndex((x) => x.id === id);
    const neighbour = assistants[i + 1] ?? assistants[i - 1];
    requestAnimationFrame(() =>
      (
        document.querySelector<HTMLElement>(`[data-revoke="${neighbour?.id}"]`) ??
        document.querySelector<HTMLElement>('#assistants button')
      )?.focus({ preventScroll: true }),
    );
  };

  return (
    <Section
      id="assistants"
      title={t('assistantsTitle')}
      description={t('assistantsDescription')}
      className={SECTION}
    >
      <p className="mb-2.5 text-body text-fg-2">{t('assistantsLead')}</p>
      <CodeLine code={address} />
      <ul className="mt-6 mb-8 grid gap-5">
        {CLIENTS.map(({ id, commands }) => (
          <li key={id}>
            <h3 className="mb-1 text-ui font-semibold text-fg">{t(`client${id}Name`)}</h3>
            <p className="text-body text-fg-2">{t(`client${id}How`)}</p>
            {commands?.(address).map((command) => (
              <CodeLine key={command} code={command} wrap className="mt-2.5" />
            ))}
          </li>
        ))}
      </ul>
      {assistants.length > 0 ? (
        <GlassCard className="p-1.5">
          <ul aria-label={t('yourAssistants')} className="grid grid-cols-[minmax(0,1fr)]">
            <AnimatePresence initial={false}>
              {assistants.map((a) => (
                <TokenRow key={a.id} token={a} onGone={() => focusAfter(a.id)} />
              ))}
            </AnimatePresence>
          </ul>
        </GlassCard>
      ) : (
        <EmptyState icon={Plug} title={t('noAssistants')} className="py-8" />
      )}
    </Section>
  );
}
