'use client';

import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useState, useTransition } from 'react';
import {
  registerSsoAction,
  removeSsoAction,
  type SsoFormState,
  verifySsoDomainAction,
} from '@/app/(app)/reglages/actions';
import {
  Badge,
  Button,
  CodeLine,
  Field,
  Input,
  Notice,
  PanelClose,
  PanelNote,
  Select,
  SidePanel,
  StatusRow,
  Textarea,
  toast,
} from '@/components/verre';
import { nb } from '@/lib/verre/nb';
import type { SsoSetup } from '@/server/auth/sso';
import { Glyph } from './reglages';

/** L'état de la ligne « SSO d'entreprise » : pas configuré, domaine à vérifier, activé. */
export function ssoState(setup: SsoSetup | null): 'off' | 'pending' | 'on' {
  if (!setup) return 'off';
  return setup.verified ? 'on' : 'pending';
}

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-label text-muted">{label}</p>
      <CodeLine code={value} wrap />
    </div>
  );
}

function SsoForm({
  formId,
  state,
  action,
}: {
  formId: string;
  state: SsoFormState;
  action: (data: FormData) => void;
}) {
  const t = useTranslations('settings');
  const [protocol, setProtocol] = useState(state.values?.protocol || 'oidc');
  const value = (name: string) => state.values?.[name];

  return (
    <form id={formId} noValidate action={action} className="grid gap-3.5">
      <PanelNote>{nb(t('ssoDescription'))}</PanelNote>
      {state.error && (
        <Notice tone="error" live="alert">
          {nb(state.error)}
        </Notice>
      )}
      <input type="hidden" name="protocol" value={protocol} />
      <Field label={t('ssoProtocol')}>
        <Select
          value={protocol}
          onValueChange={setProtocol}
          options={[
            { value: 'oidc', label: t('ssoOidc') },
            { value: 'saml', label: t('ssoSaml') },
          ]}
        />
      </Field>
      <Field label={t('ssoDomain')} help={t('ssoDomainHelp')}>
        <Input
          name="domain"
          autoComplete="off"
          spellCheck={false}
          placeholder="acme.com"
          defaultValue={value('domain')}
        />
      </Field>
      {protocol === 'oidc' ? (
        <>
          <Field label={t('ssoIssuer')} help={t('ssoIssuerHelp')}>
            <Input
              name="issuer"
              type="url"
              spellCheck={false}
              placeholder="https://acme.okta.com"
              defaultValue={value('issuer')}
            />
          </Field>
          <Field label={t('ssoClientId')}>
            <Input name="clientId" spellCheck={false} defaultValue={value('clientId')} />
          </Field>
          <Field label={t('ssoClientSecret')}>
            <Input name="clientSecret" type="password" autoComplete="off" spellCheck={false} />
          </Field>
        </>
      ) : (
        <>
          <Field label={t('ssoEntryPoint')} help={t('ssoEntryPointHelp')}>
            <Input
              name="entryPoint"
              type="url"
              spellCheck={false}
              defaultValue={value('entryPoint')}
            />
          </Field>
          <Field label={t('ssoMetadata')} help={t('ssoMetadataHelp')}>
            <Textarea
              name="metadata"
              rows={5}
              spellCheck={false}
              className="font-mono text-label"
              defaultValue={value('metadata')}
            />
          </Field>
        </>
      )}
    </form>
  );
}

function SsoStatus({ setup }: { setup: SsoSetup }) {
  const t = useTranslations('settings');
  return (
    <div className="grid gap-4">
      <StatusRow>
        <span className="flex min-w-0 items-center gap-2">
          <Badge tone={setup.verified ? 'success' : 'warning'}>
            {setup.verified ? t('ssoVerified') : t('ssoPending')}
          </Badge>
          <span className="truncate text-ui">
            {setup.domain} · {setup.protocol === 'oidc' ? 'OIDC' : 'SAML'}
          </span>
        </span>
      </StatusRow>
      <Copyable
        label={setup.protocol === 'oidc' ? t('ssoRedirectUrl') : t('ssoAcsUrl')}
        value={setup.redirectUrl}
      />
      {setup.entityId && <Copyable label={t('ssoEntityId')} value={setup.entityId} />}
      {setup.dns && (
        <>
          <PanelNote>{nb(t('ssoDnsIntro'))}</PanelNote>
          <Copyable label={t('ssoDnsName')} value={setup.dns.name} />
          <Copyable label={t('ssoDnsValue')} value={setup.dns.value} />
        </>
      )}
    </div>
  );
}

/**
 * Le panneau « SSO d'entreprise », pour un propriétaire ou un administrateur : le réglage (OIDC ou SAML), puis, quand
 * la page relit un réglage, ce qu'il faut recopier chez le fournisseur, l'enregistrement DNS et « Vérifier le
 * domaine ». Le formulaire passe à l'état de lui-même : la vue suit `setup`, que la page relit après chaque action.
 */
export function SsoPanel({
  setup,
  open,
  onOpenChange,
}: {
  setup: SsoSetup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('settings');
  const formId = useId();
  const [asking, setAsking] = useState(false);
  const [notYet, setNotYet] = useState(false);
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState('');
  const [state, action, saving] = useActionState<SsoFormState, FormData>(registerSsoAction, {});

  const verify = () => {
    setNotYet(false);
    setRunning('verify');
    startTransition(async () => {
      const { ok } = await verifySsoDomainAction().catch(() => ({ ok: false }));
      if (ok) toast.success(t('ssoVerifiedToast'));
      else setNotYet(true);
    });
  };
  const remove = () => {
    setRunning('remove');
    startTransition(async () => {
      const { ok } = await removeSsoAction().catch(() => ({ ok: false }));
      setAsking(false);
      if (ok) {
        toast.success(t('ssoRemoved'));
        onOpenChange(false);
      } else toast.error(t('ssoRemoveFailed'));
    });
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      picture={<Glyph icon={Building2} size={44} />}
      title={t('ssoTitle')}
      busy={pending || saving}
      confirm={
        asking
          ? {
              title: t('ssoRemoveTitle'),
              text: t('ssoRemoveText'),
              yes: t('ssoRemove'),
              no: t('keep'),
              busy: pending,
              busyLabel: t('removing'),
              onYes: remove,
              onNo: () => setAsking(false),
            }
          : null
      }
      foot={
        setup ? (
          <>
            <Button variant="quiet" className="-ml-4" onClick={() => setAsking(true)}>
              {t('ssoRemove')}
            </Button>
            {!setup.verified && (
              <Button
                className="ml-auto"
                loading={pending && running === 'verify'}
                loadingLabel={t('verifying')}
                onClick={verify}
              >
                {t('ssoVerify')}
              </Button>
            )}
            <PanelClose asChild>
              <Button
                variant={setup.verified ? 'secondary' : 'quiet'}
                className={setup.verified ? 'ml-auto' : undefined}
              >
                {t('done')}
              </Button>
            </PanelClose>
          </>
        ) : (
          <>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              loading={saving}
              loadingLabel={t('saving')}
            >
              {t('ssoSave')}
            </Button>
            <PanelClose asChild>
              <Button variant="quiet">{t('cancel')}</Button>
            </PanelClose>
          </>
        )
      }
    >
      {setup ? (
        <>
          <SsoStatus setup={setup} />
          {notYet && !setup.verified && (
            <Notice tone="warning" live="alert" className="mt-4">
              {nb(t('ssoNotYet'))}
            </Notice>
          )}
        </>
      ) : (
        <SsoForm formId={formId} state={state} action={action} />
      )}
    </SidePanel>
  );
}
