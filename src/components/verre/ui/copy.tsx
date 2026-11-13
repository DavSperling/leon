'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/verre/cn';
import { Button, type ButtonProps } from './button';
import { toast } from './toast';

/**
 * « Copier » : copie `value`, puis le dit sur place (« Copié », 1,6 s), sans notification ; `copiedMessage` en ajoute une
 * quand il faut dire où coller. Si le presse-papiers refuse, invite à copier à la main.
 */
export function CopyButton({
  value,
  label,
  copiedMessage,
  size = 'sm',
  variant = 'secondary',
  onCopied,
  ...props
}: Omit<ButtonProps, 'onClick' | 'icon'> & {
  value: string;
  label?: string;
  /** Le message de confirmation, quand « Copié. » ne dit pas assez (où coller ce qui vient d'être copié). */
  copiedMessage?: string;
  /** Appelé une fois la copie faite. */
  onCopied?: () => void;
}) {
  const t = useTranslations('common');
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      if (copiedMessage) toast.success(copiedMessage);
      ok = true;
    } catch {
      toast.error(t('copyFailed'));
    }
    // Hors du try : un rappel qui échoue ne doit pas faire croire que la copie a échoué.
    if (ok) onCopied?.();
  };
  return (
    <Button size={size} variant={variant} onClick={copy} {...props}>
      {/* le libellé change sur place ; ce statut, vide au repos, l'annonce */}
      <span role="status" className="sr-only">
        {done ? t('copiedShort') : null}
      </span>
      {done ? t('copiedShort') : (label ?? t('copy'))}
    </Button>
  );
}

/**
 * Une ligne de vrai code (commande, adresse) en Geist Mono, défilable, avec son bouton Copier. `wrap` : passe à la ligne
 * (longue commande : rien de caché à 390 px), une option « --header » ne se coupant jamais après ses tirets.
 */
export function CodeLine({
  code,
  wrap,
  className,
}: {
  code: string;
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 gap-2 rounded-item border border-line bg-glass-3 py-1.5 pr-1.5 pl-3',
        wrap ? 'items-start' : 'items-center',
        className,
      )}
    >
      <code
        className={cn(
          'min-w-0 flex-1 py-1 font-mono text-[13px] leading-relaxed text-fg',
          wrap
            ? 'whitespace-pre-wrap [overflow-wrap:anywhere]'
            : 'overflow-x-auto whitespace-nowrap [scrollbar-width:none]',
        )}
      >
        {wrap
          ? code.split(/(--\S+)/).map((w, i) =>
              i % 2 ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'une commande figée
                <span key={i} className="whitespace-nowrap">
                  {w}
                </span>
              ) : (
                w
              ),
            )
          : code}
      </code>
      <CopyButton value={code} size="xs" className="max-shell:h-8" />
    </div>
  );
}
