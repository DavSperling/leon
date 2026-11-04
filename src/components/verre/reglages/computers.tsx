'use client';

import { ArrowUpRight, Laptop } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button, CodeLine, CopyButton, EmptyState, GlassCard, Section } from '@/components/verre';
import { SECTION } from './reglages';
import { type Token, TokenRow } from './tokens';

const PATH_TITLE = 'mb-1 text-ui font-semibold text-fg';

/**
 * Section « Ordinateurs connectés » (ancre #ordinateurs, visée par « Ce qui part » dans l'onboarding) : deux chemins à
 * égalité pour connecter un ordinateur, « Je demande à Claude » (la consigne `instructions`, `claudeCodeInstructions`)
 * d'abord, puis la commande d'installation (`installCommand`, null si l'adresse du serveur est refusée : rien de faux à
 * copier) ; le lien vers la documentation ; et les ordinateurs que `leon login` a connectés, avec leur révocation. La
 * page leur donne leur nom sans le préfixe « Ordinateur : ».
 */
export function ComputersSection({
  computers,
  command,
  instructions,
}: {
  computers: Token[];
  command: string | null;
  instructions: string | null;
}) {
  const t = useTranslations('settings');
  const claude = useTranslations('claudeCode');
  const common = useTranslations('common');

  // la ligne disparaît avec son bouton : le focus passe à la ligne voisine, ou au premier bouton de la section
  const focusAfter = (id: string) => {
    const i = computers.findIndex((x) => x.id === id);
    const neighbour = computers[i + 1] ?? computers[i - 1];
    requestAnimationFrame(() =>
      (
        document.querySelector<HTMLElement>(`[data-revoke="${neighbour?.id}"]`) ??
        document.querySelector<HTMLElement>('#ordinateurs button')
      )?.focus({ preventScroll: true }),
    );
  };

  return (
    <Section
      id="ordinateurs"
      title={t('computersTitle')}
      description={t('computersDescription')}
      className={SECTION}
    >
      {command && (
        <div className="mb-6 grid gap-5">
          {instructions !== null && (
            <div>
              <h3 className={PATH_TITLE}>{claude('withClaude')}</h3>
              <p className="mb-2.5 text-body text-fg-2">{claude('withClaudeLead')}</p>
              <CopyButton
                value={instructions}
                label={claude('ask')}
                copiedMessage={claude('copied')}
              />
            </div>
          )}
          <div>
            <h3 className={PATH_TITLE}>{claude('inTerminal')}</h3>
            <p className="mb-2.5 text-body text-fg-2">{t('computersLead')}</p>
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
      )}
      {computers.length > 0 ? (
        <GlassCard className="p-1.5">
          <ul aria-label={t('yourComputers')} className="grid grid-cols-[minmax(0,1fr)]">
            <AnimatePresence initial={false}>
              {computers.map((c) => (
                <TokenRow key={c.id} token={c} computer onGone={() => focusAfter(c.id)} />
              ))}
            </AnimatePresence>
          </ul>
        </GlassCard>
      ) : (
        <EmptyState icon={Laptop} title={t('noComputers')} className="py-8" />
      )}
    </Section>
  );
}
