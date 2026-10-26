'use client';

import { KeyRound, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { revokeTokenAction } from '@/app/(app)/reglages/actions';
import {
  AlertDialog,
  Button,
  Dialog,
  DialogTrigger,
  EmptyState,
  GlassCard,
  Section,
  toast,
} from '@/components/verre';
import {
  cn,
  duration,
  ease,
  formatDate,
  formatDateTime,
  formatRelative,
  springSoft,
  useInstant,
} from '@/lib/verre';
import type { ApiTokenRow } from '@/server/auth/api-tokens';
import { CreateTokenContent } from './create-token';
import { SECTION } from './reglages';

type Token = Omit<ApiTokenRow, 'revokedAt'>;

/** Section « Jetons personnels » : la liste (jetons non révoqués, lus par la page), la création et la révocation. */
export function TokensSection({ tokens }: { tokens: Token[] }) {
  const t = useTranslations('settings');
  const createRef = useRef<HTMLButtonElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [session, setSession] = useState(0);
  // le jeton créé est déjà dans la liste (revalidatePath) : on le cache tant que la fenêtre est ouverte, puis on le voit arriver
  const [created, setCreated] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    // arrivée avec une ancre (/reglages#extension) : l'ossature remet le panneau en haut, on redescend à la section
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1));
    if (target) requestAnimationFrame(() => target.scrollIntoView());
  }, []);

  useEffect(() => {
    if (!fresh) return;
    // le fond du nouveau jeton s'éteint
    const t = setTimeout(() => setFresh(null), 3000);
    return () => clearTimeout(t);
  }, [fresh]);

  const onCreateChange = (open: boolean) => {
    if (open) setSession((s) => s + 1);
    else if (created) {
      setFresh(created);
      setCreated(null);
    }
    setCreateOpen(open);
  };

  // le bouton disparaît avec la ligne : le focus passe à la ligne voisine, ou à « Créer un jeton »
  const focusAfter = (id: string) => {
    const i = tokens.findIndex((x) => x.id === id);
    const neighbour = tokens[i + 1] ?? tokens[i - 1];
    requestAnimationFrame(() =>
      (
        document.querySelector<HTMLElement>(`[data-revoke="${neighbour?.id}"]`) ?? createRef.current
      )?.focus({ preventScroll: true }),
    );
  };

  const shown = tokens.filter((t) => t.hint !== created);

  return (
    <Section
      id="jetons"
      title={t('tokensTitle')}
      description={t('tokenDescription')}
      className={SECTION}
      actions={
        <Dialog open={createOpen} onOpenChange={onCreateChange}>
          <DialogTrigger asChild>
            <Button ref={createRef} variant="primary" icon={Plus}>
              {t('createToken')}
            </Button>
          </DialogTrigger>
          <CreateTokenContent key={session} onCreated={setCreated} />
        </Dialog>
      }
    >
      {shown.length > 0 ? (
        <GlassCard className="p-1.5">
          <ul aria-label={t('yourTokens')} className="grid grid-cols-[minmax(0,1fr)]">
            <AnimatePresence initial={false}>
              {shown.map((t) => (
                <TokenRow
                  key={t.id}
                  token={t}
                  fresh={fresh === t.hint}
                  onGone={() => focusAfter(t.id)}
                />
              ))}
            </AnimatePresence>
          </ul>
        </GlassCard>
      ) : (
        <EmptyState icon={KeyRound} title={t('noTokens')} className="py-8" />
      )}
    </Section>
  );
}

function TokenRow({
  token: t,
  fresh,
  onGone,
}: {
  token: Token;
  fresh: boolean;
  onGone: () => void;
}) {
  const instant = useInstant();
  const tr = useTranslations('settings');
  const locale = useLocale();
  const [revoking, startTransition] = useTransition();

  const revoke = () =>
    startTransition(async () => {
      try {
        const { ok } = await revokeTokenAction(t.id);
        if (ok) toast.success(tr('tokenRevoked'));
        else toast.error(tr('tokenAlreadyRevoked'));
        onGone();
      } catch {
        toast.error(tr('revokeFailed'));
      }
    });

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: duration.exit, ease: ease.in } }}
      transition={{ duration: duration.enter, ease: ease.out, layout: springSoft }}
      // filet entre les lignes, en retrait des bords de la carte
      className="relative [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-3 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line"
    >
      <div
        className={cn(
          'relative flex min-h-[60px] items-center gap-4 rounded-field px-3 py-2.5 transition-opacity duration-300',
          revoking && 'opacity-60',
        )}
      >
        {fresh && (
          // nouveau jeton : un fond d'accent qui s'éteint
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-field bg-accent-soft"
            initial={{ opacity: 1 }}
            animate={instant ? undefined : { opacity: 0 }}
            transition={{ delay: 1.6, duration: 1.2, ease: ease.inOut }}
          />
        )}
        <div className="relative min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="min-w-0 text-body font-medium [overflow-wrap:anywhere] text-fg">
              {t.name}
            </span>
            <code className="font-mono text-[12px] tracking-normal text-muted">leon_…{t.hint}</code>
          </p>
          {/* les morceaux ne se coupent pas en leur milieu (« 12 oct. / 2026 ») : la ligne passe à la ligne entre eux */}
          <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-label text-muted [&>span]:whitespace-nowrap">
            <span>
              {tr('createdOn')}{' '}
              <time dateTime={t.createdAt.toISOString()}>{formatDate(t.createdAt, locale)}</time>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t.lastUsedAt ? (
                <>
                  {tr('used')}{' '}
                  {/* relatif à l'heure du rendu : serveur et navigateur peuvent différer d'une minute */}
                  <time
                    dateTime={t.lastUsedAt.toISOString()}
                    title={formatDateTime(t.lastUsedAt, locale)}
                    suppressHydrationWarning
                  >
                    {formatRelative(t.lastUsedAt, new Date(), locale)}
                  </time>
                </>
              ) : (
                tr('neverUsed')
              )}
            </span>
          </p>
        </div>
        <AlertDialog
          trigger={
            <Button
              size="sm"
              variant="secondary"
              data-revoke={t.id}
              loading={revoking}
              className="relative"
            >
              {revoking ? tr('sending') : tr('revoke')}
            </Button>
          }
          title={tr('revokeNamed', { name: t.name })}
          description={tr('revokeDescription')}
          confirmLabel={tr('revoke')}
          onConfirm={revoke}
        />
      </div>
    </motion.li>
  );
}
