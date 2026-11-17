'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button, CodeLine, CopyButton } from '@/components/verre';

export const PATH_TITLE = 'mb-1 text-lead font-semibold text-fg';

/**
 * Le corps du panneau « Connecter un ordinateur » (la tuile porte l'ancre #ordinateurs, visée par « Ce qui part » dans
 * l'onboarding et par Connexions) : deux chemins à égalité, « Je demande à Claude » (la consigne `instructions`,
 * `claudeCodeInstructions`) d'abord, puis la commande d'installation (`installCommand`, null si l'adresse du serveur est
 * refusée : rien de faux à copier, et la tuile ne se montre pas) ; puis le lien vers la documentation.
 */
export function ComputerSetup({
  command,
  instructions,
}: {
  command: string | null;
  instructions: string | null;
}) {
  const t = useTranslations('settings');
  const claude = useTranslations('claudeCode');
  const common = useTranslations('common');
  if (!command) return null;
  return (
    <div className="grid gap-6">
      {instructions !== null && (
        <div>
          <h3 className={PATH_TITLE}>{claude('withClaude')}</h3>
          <p className="mb-3 text-ui leading-[1.55] text-fg-2">{claude('withClaudeLead')}</p>
          <CopyButton value={instructions} label={claude('ask')} copiedMessage={claude('copied')} />
        </div>
      )}
      <div>
        <h3 className={PATH_TITLE}>{claude('inTerminal')}</h3>
        <p className="mb-3 text-ui leading-[1.55] text-fg-2">{t('computersLead')}</p>
        <CodeLine code={command} wrap />
      </div>
      <Button asChild variant="link" size="sm" className="justify-self-start">
        <Link href="/documentation" target="_blank">
          {claude('docs')}
          <ArrowUpRight aria-hidden="true" strokeWidth={1.8} />
          <span className="sr-only">{common('newTab')}</span>
        </Link>
      </Button>
    </div>
  );
}
