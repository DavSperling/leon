'use client';

import { KeyRound, Laptop, MessageSquare } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useId, useState, useTransition } from 'react';
import { createTokenAction, revokeTokenAction } from '@/app/(app)/reglages/actions';
import {
  Button,
  CopyButton,
  Fact,
  Facts,
  Field,
  Input,
  PanelClose,
  PanelNote,
  SidePanel,
  toast,
} from '@/components/verre';
import { formatDate, formatDateTime, formatRelative, nb } from '@/lib/verre';
import type { ApiTokenRow } from '@/server/auth/api-tokens';
import { Glyph } from './reglages';

// Ce que l'écran dessine : ni la révocation ni l'échéance du renouvellement, que la page a déjà jugées.
export type Token = Omit<ApiTokenRow, 'revokedAt' | 'refreshExpiresAt'>;

export const GLYPHS = { ordinateur: Laptop, assistant: MessageSquare, manuel: KeyRound } as const;

// Les mots de la révocation selon la sorte du jeton : le message de succès, et ce que la confirmation annonce.
const REVOKE_WORDS = {
  manuel: ['tokenRevoked', 'revokeDescription'],
  ordinateur: ['computerRevoked', 'computerRevokeDescription'],
  assistant: ['assistantRevoked', 'assistantRevokeDescription'],
} as const;
// Ce que chaque sorte reçoit de Leon : la phrase du panneau.
const NOTES = {
  manuel: 'tokenDescription',
  ordinateur: 'computersDescription',
  assistant: 'assistantsDescription',
} as const;

/** La légende d'une carte : l'hôte d'un assistant (l'indice de son jeton change à chaque renouvellement), l'indice d'un jeton. */
export function captionOf(token: Token, computerLabel: string): string {
  if (token.kind === 'assistant') return token.clientHost ?? '';
  if (token.kind === 'ordinateur') return computerLabel;
  return `leon_…${token.hint}`;
}

/** Ce qu'est une chose connectée : sa création et sa dernière utilisation, et, selon sa sorte, son client ou son indice. */
export function TokenFacts({ token: t }: { token: Token }) {
  const tr = useTranslations('settings');
  const locale = useLocale();
  return (
    <Facts>
      {/* le client, seulement s'il ne redit pas le titre du panneau */}
      {t.kind === 'assistant' && t.clientName && t.clientName !== t.name && (
        <Fact label={tr('kindAssistant')}>{t.clientName}</Fact>
      )}
      {t.kind === 'assistant' && t.clientHost && (
        <Fact label={tr('addressLabel')}>{t.clientHost}</Fact>
      )}
      {t.kind === 'manuel' && (
        <Fact label={tr('kindToken')}>
          <code className="font-mono text-ui">leon_…{t.hint}</code>
        </Fact>
      )}
      <Fact label={t.kind === 'manuel' ? tr('createdLabel') : tr('connectedLabel')}>
        <time dateTime={t.createdAt.toISOString()}>{formatDate(t.createdAt, locale)}</time>
      </Fact>
      <Fact label={tr('lastUsed')}>
        {t.lastUsedAt ? (
          <time dateTime={t.lastUsedAt.toISOString()} title={formatDateTime(t.lastUsedAt, locale)}>
            {formatRelative(t.lastUsedAt, new Date(), locale)}
          </time>
        ) : (
          tr('neverUsedFact')
        )}
      </Fact>
    </Facts>
  );
}

/**
 * Le panneau d'une chose connectée (un ordinateur, un assistant, un jeton) : ce qu'elle est, ce qu'elle reçoit, et
 * « Déconnecter » ou « Révoquer », confirmé sur place. La carte s'en va quand la page se relit.
 */
export function TokenPanel({
  token: t,
  open,
  onOpenChange,
}: {
  token: Token;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tr = useTranslations('settings');
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();
  const [revokedKey, descriptionKey] = REVOKE_WORDS[t.kind];
  const computer = t.kind !== 'manuel';

  const revoke = () =>
    startTransition(async () => {
      try {
        const { ok } = await revokeTokenAction(t.id);
        if (ok) toast.success(tr(revokedKey));
        else toast.error(tr('tokenAlreadyRevoked'));
        onOpenChange(false);
      } catch {
        toast.error(tr('revokeFailed'));
      }
      setAsking(false);
    });

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) setAsking(false);
        onOpenChange(next);
      }}
      picture={<Glyph icon={GLYPHS[t.kind]} size={44} />}
      title={t.name}
      confirm={
        asking
          ? {
              title: tr(computer ? 'disconnectNamed' : 'revokeNamed', { name: t.name }),
              text: tr(descriptionKey),
              yes: tr(computer ? 'disconnect' : 'revoke'),
              no: tr('keep'),
              busy: pending,
              busyLabel: tr(computer ? 'disconnecting' : 'revoking'),
              onYes: revoke,
              onNo: () => setAsking(false),
            }
          : null
      }
      foot={
        <>
          <Button variant="quiet" className="-ml-4" onClick={() => setAsking(true)}>
            {tr(computer ? 'disconnect' : 'revoke')}
          </Button>
          <PanelClose asChild>
            <Button className="ml-auto">{tr('done')}</Button>
          </PanelClose>
        </>
      }
    >
      <TokenFacts token={t} />
      <PanelNote className="mt-4">{nb(tr(NOTES[t.kind]))}</PanelNote>
    </SidePanel>
  );
}

type CreateState = { name: string; error?: string; token?: string };

/**
 * Créer un jeton, en deux étapes dans le panneau : son nom, puis le jeton, montré une fois. L'étape 2 est verrouillée
 * (ni Échap, ni un clic dehors) : seul « Terminé » ferme, le jeton ne se perd pas par accident. Montez-le avec une
 * `key` neuve à chaque ouverture : le jeton en clair disparaît avec lui.
 */
export function CreateTokenPanel({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (hint: string) => void;
}) {
  const t = useTranslations('settings');
  const id = useId();
  const [state, formAction, pending] = useActionState(
    async (_: CreateState, data: FormData): Promise<CreateState> => {
      const name = String(data.get('name') ?? '');
      const result = await createTokenAction(name);
      if ('error' in result) return { name, error: result.error };
      onCreated(result.hint);
      return { name, token: result.token };
    },
    { name: '' },
  );
  const secret = state.token;

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      picture={<Glyph icon={KeyRound} size={44} />}
      title={secret ? t('tokenCreated') : t('createToken')}
      sub={secret ? t('pasteToken') : undefined}
      // verrouillé aussi pendant la création : le secret ne se montre qu'une fois
      locked={Boolean(secret) || pending}
      busy={pending}
      foot={
        secret ? (
          <>
            <CopyButton value={secret} size="md" />
            <PanelClose asChild>
              <Button variant="primary" className="ml-auto">
                {t('done')}
              </Button>
            </PanelClose>
          </>
        ) : (
          <>
            <Button
              type="submit"
              form={`${id}-form`}
              variant="primary"
              loading={pending}
              loadingLabel={t('creating')}
            >
              {t('createTokenSubmit')}
            </Button>
            <PanelClose asChild>
              <Button variant="quiet">{t('cancel')}</Button>
            </PanelClose>
          </>
        )
      }
    >
      {secret ? (
        <div className="grid gap-2">
          <code className="block rounded-field border border-line-strong bg-glass-3 px-3.5 py-3 font-mono text-ui leading-[1.6] break-all text-fg select-all">
            {secret}
          </code>
          <p role="status" className="text-label font-medium text-warning">
            {t('copyToken')}
          </p>
        </div>
      ) : (
        <form id={`${id}-form`} noValidate action={formAction} className="grid gap-4">
          <Field label={t('deviceName')} error={state.error}>
            <Input name="name" autoComplete="off" defaultValue={state.name} maxLength={80} />
          </Field>
          <PanelNote>{nb(t('tokenDescription'))}</PanelNote>
        </form>
      )}
    </SidePanel>
  );
}
