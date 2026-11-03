'use client';

import { Laptop } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { CodeLine, EmptyState, GlassCard, Section } from '@/components/verre';
import { SECTION } from './reglages';
import { type Token, TokenRow } from './tokens';

/**
 * Section « Ordinateurs connectés » (ancre #ordinateurs, visée par « Ce qui part » dans l'onboarding) : la commande
 * d'installation (`installCommand`, null si l'adresse du serveur est refusée : rien de faux à copier) et les ordinateurs
 * que `leon login` a connectés, avec leur révocation. La page leur donne leur nom sans le préfixe « Ordinateur : ».
 */
export function ComputersSection({
  computers,
  command,
}: {
  computers: Token[];
  command: string | null;
}) {
  const t = useTranslations('settings');

  // la ligne disparaît avec son bouton : le focus passe à la ligne voisine, ou au bouton Copier de la section
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
        <>
          <p className="mb-2.5 text-body text-fg-2">{t('computersLead')}</p>
          <CodeLine code={command} wrap className="mb-6" />
        </>
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
