'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ToolLogo } from '@/components/verre/ui/chips';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import './auth.css';

/**
 * La feuille du formulaire, posée sur le bureau ; `alt` : l'autre porte (« Pas encore de compte ? »), sur le bureau
 * sous la feuille. `wide` : une décision à lire (autoriser un assistant, un ordinateur), sans la pile à côté.
 */
export function AuthSheet({
  children,
  alt,
  wide,
}: {
  children: ReactNode;
  alt?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn('w-full min-w-0', wide && 'max-w-[560px] justify-self-center')}>
      <div className="rounded-card border border-line bg-sheet p-8 shadow-lift max-[599px]:px-5 max-[599px]:py-6">
        {children}
      </div>
      {alt && <p className="mt-4 pl-8 text-ui text-muted max-[899px]:pl-0">{alt}</p>}
    </div>
  );
}

/** Le titre d'une page hors ossature ; `done` : le trait vert de « fait », tracé une fois sous les mots. */
export function AuthTitle({
  children,
  done,
  id,
  className,
}: {
  children: ReactNode;
  done?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <h1
      id={id}
      tabIndex={done ? -1 : undefined}
      className={cn('text-h1 font-semibold tracking-[-0.02em] text-fg outline-none', className)}
    >
      {done ? <span className="mark is-on">{children}</span> : children}
    </h1>
  );
}

/** Un message de la page (compte supprimé, retour de Google) : une ligne et son point, sans encadré. */
export function AuthNote({
  tone,
  children,
  className,
}: {
  tone: 'ok' | 'error';
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role={tone === 'ok' ? 'status' : 'alert'}
      className={cn(
        'flex gap-2.5 text-ui [overflow-wrap:anywhere]',
        tone === 'ok' ? 'text-fg' : 'font-medium text-destructive',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-[7px] size-1.5 shrink-0 rounded-full',
          tone === 'ok' ? 'bg-ok' : 'bg-destructive',
        )}
      />
      <span className="min-w-0">{typeof children === 'string' ? nb(children) : children}</span>
    </p>
  );
}

/** Le lien d'une ligne : l'encre soulignée du kit. */
export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-sm text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg"
    >
      {children}
    </Link>
  );
}

// La pile ne décore que les pages de porte ; une autorisation se lit seule, sur la feuille.
const WITH_PILE = ['/connexion', '/inscription', '/mot-de-passe-oublie', '/reinitialiser'];

/**
 * À côté du formulaire : le produit en une image. Une question, la réponse de Leon (les seuls mots de la source sous le
 * surligneur, puis son numéro), et dessous la pile d'originaux, la première ouverte au passage cité. Pointer la réponse
 * appuie le passage dans l'original ; pointer une feuille du dessous la sort un peu de la pile. Un exemple inventé (et
 * dit tel), décoratif pour un lecteur d'écran sauf le nom de l'original.
 */
export function AuthPile() {
  const t = useTranslations('auth.pile');
  const path = usePathname();
  if (!WITH_PILE.includes(path) && !path.startsWith('/invitation/')) return null;
  return (
    // Sur un téléphone, la pile passerait sous le formulaire et doublerait la page : elle n'y est pas.
    <aside aria-label={t('label')} className="auth-pile min-w-0 max-[599px]:hidden">
      <div aria-hidden="true" className="auth-talk">
        <p className="ml-auto w-fit max-w-[86%] rounded-card rounded-br-[4px] bg-n-150 px-4 py-2.5 text-ui text-fg">
          {t('question')}
        </p>
        <p className="auth-answer answer hl-arrive mt-4 text-fg">
          {t.rich('answer', { mark: (words) => <span className="hl hl-1">{words}</span> })}
          <span className="cite c1">1</span>
        </p>
      </div>
      <div className="pile">
        <article className="doc c3" data-slot="b2" aria-hidden="true">
          <span className="flag flag--left">3</span>
          <header className="flex items-center gap-2.5">
            <ToolLogo kind="linear" size={20} />
            <p className="auth-pile__title text-title font-semibold">{t('migration')}</p>
          </header>
        </article>
        <article className="doc c2" data-slot="b1" aria-hidden="true">
          <span className="flag flag--left">2</span>
          <header className="flex items-center gap-2.5">
            <ToolLogo kind="hubspot" size={20} />
            <p className="auth-pile__title text-title font-semibold">{t('quote')}</p>
          </header>
        </article>
        <article className="doc c1" data-slot="top" aria-label={t('checkinLabel')}>
          <span className="flag flag--left" aria-hidden="true">
            1
          </span>
          <header className="flex items-center gap-2.5">
            <ToolLogo kind="granola" size={20} />
            <p className="text-title font-semibold">{t('checkin')}</p>
          </header>
          <p className="mt-1 text-label text-muted">{t('checkinMeta')}</p>
          <ol className="mt-3 grid gap-2.5 border-t border-line pt-3.5">
            <li className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
              <span className="pt-px text-label text-muted">14:02</span>
              <div>
                <span className="block text-label font-semibold">{t('who1')}</span>
                <p className="font-serif text-[16px] leading-[1.45]">{t('said1')}</p>
              </div>
            </li>
            <li className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
              <span className="pt-px text-label text-muted">14:31</span>
              <div>
                <span className="block text-label font-semibold">{t('who2')}</span>
                <p className="hl-arrive font-serif text-[16px] leading-[1.45]">
                  {t.rich('said2', { mark: (words) => <mark className="hl hl-1">{words}</mark> })}
                </p>
              </div>
            </li>
          </ol>
        </article>
      </div>
      <p className="mt-5 ml-[18px] text-label text-muted">{t('caption')}</p>
    </aside>
  );
}
