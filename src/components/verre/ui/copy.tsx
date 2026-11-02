'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/verre/cn';
import { Button, type ButtonProps } from './button';
import { toast } from './toast';

/** « Copier » : copie `value`, puis « Copié. » ; si le presse-papiers refuse, invite à copier à la main. */
export function CopyButton({
  value,
  label,
  size = 'sm',
  variant = 'secondary',
  onCopied,
  ...props
}: Omit<ButtonProps, 'onClick' | 'icon'> & {
  value: string;
  label?: string;
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
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      toast.success(t('copied'));
      onCopied?.();
    } catch {
      toast.error(t('copyFailed'));
    }
  };
  return (
    <Button size={size} variant={variant} icon={done ? Check : Copy} onClick={copy} {...props}>
      {label ?? t('copy')}
    </Button>
  );
}

/**
 * Une ligne de code (commande, adresse) en Geist Mono, défilable, avec son bouton Copier. `wrap` : passe à la ligne
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
        'flex min-w-0 gap-2 rounded-field border border-line bg-glass-3 py-1.5 pr-1.5 pl-3.5',
        wrap ? 'items-start' : 'items-center',
        className,
      )}
    >
      <code
        className={cn(
          'min-w-0 flex-1 py-1 text-[12.5px] leading-relaxed text-fg-2',
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
      <CopyButton value={code} />
    </div>
  );
}
