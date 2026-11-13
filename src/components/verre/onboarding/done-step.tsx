'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/verre/ui/button';
import { nb } from '@/lib/verre/nb';
import { Converge } from './converge';

/**
 * L'écran de fin de l'onboarding : une feuille au centre optique de la fenêtre. En tête, sur une bande de bureau, ce
 * que Leon lit déjà : chaque outil branché, un trait jusqu'à son point (l'idée de la carte de la mémoire, à l'encre),
 * tracé une fois. Puis le titre, surligné en vert quand les traits sont arrivés, et « Open Chat ». Sans outil branché,
 * le logo se trace seul, la phrase dit vrai (rien n'est lu) et un second bouton mène à Connexions.
 */
export function DoneStep({ reading = [] }: { reading?: { id: string; label: string }[] }) {
  const t = useTranslations('onboarding.done');
  const empty = reading.length === 0;
  return (
    <div className="mx-auto mt-[max(3vh,calc(50dvh-320px))] w-full max-w-[560px] overflow-hidden rounded-card border border-line bg-sheet shadow-lift">
      <div className="grid place-items-center border-b border-line bg-desk px-8 py-8 max-[599px]:px-5 max-[599px]:py-6">
        <Converge items={reading.map((tool) => ({ id: tool.id, on: true }))} drawn />
      </div>
      <div className="grid justify-items-start gap-4 p-8 max-[599px]:px-5 max-[599px]:py-6">
        <h1 className="text-h1 font-semibold tracking-[-0.02em] text-fg">
          <span className="mark is-on before:[animation-delay:640ms]">{t('title')}</span>
        </h1>
        <p className="text-title text-pretty text-muted">{nb(t(empty ? 'leadEmpty' : 'lead'))}</p>
        {!empty && (
          <ul aria-label={t('sources')} className="sr-only">
            {reading.map((tool) => (
              <li key={tool.id}>{tool.label}</li>
            ))}
          </ul>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button asChild variant="primary" className="h-10">
            <Link href="/discussions">{t('openChat')}</Link>
          </Button>
          {empty && (
            <Button asChild variant="quiet">
              <Link href="/connexions">{t('connect')}</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
