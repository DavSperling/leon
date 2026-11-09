'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
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
  Section,
  Select,
  Textarea,
  toast,
} from '@/components/verre';
import type { SsoSetup } from '@/server/auth/sso';
import { SECTION } from './reglages';

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-label text-muted">{label}</p>
      <CodeLine code={value} wrap />
    </div>
  );
}

// Le fournisseur réglé : ce qu'il faut recopier chez lui, l'enregistrement DNS à poser, puis « Vérifier ».
function SsoStatus({ setup }: { setup: SsoSetup }) {
  const t = useTranslations('settings');
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: boolean }>, done: string, failed: string) =>
    startTransition(async () => {
      const { ok } = await action().catch(() => ({ ok: false }));
      if (ok) toast.success(done);
      else toast.error(failed);
    });

  return (
    <div className="grid gap-5">
      <p className="flex flex-wrap items-center gap-2 text-body text-fg">
        <span className="[overflow-wrap:anywhere]">{setup.domain}</span>
        <Badge tone="neutral">{setup.protocol === 'oidc' ? 'OIDC' : 'SAML'}</Badge>
        <Badge tone={setup.verified ? 'success' : 'warning'}>
          {setup.verified ? t('ssoVerified') : t('ssoPending')}
        </Badge>
      </p>
      <Copyable
        label={setup.protocol === 'oidc' ? t('ssoRedirectUrl') : t('ssoAcsUrl')}
        value={setup.redirectUrl}
      />
      {setup.entityId && <Copyable label={t('ssoEntityId')} value={setup.entityId} />}
      {setup.dns && (
        <>
          <Notice tone="info">{t('ssoDnsIntro')}</Notice>
          <Copyable label={t('ssoDnsName')} value={setup.dns.name} />
          <Copyable label={t('ssoDnsValue')} value={setup.dns.value} />
        </>
      )}
      <div className="flex flex-wrap gap-2.5">
        {!setup.verified && (
          <Button
            variant="primary"
            loading={pending}
            onClick={() => run(verifySsoDomainAction, t('ssoVerifiedToast'), t('ssoNotYet'))}
          >
            {t('ssoVerify')}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t('ssoRemoveConfirm')))
              run(removeSsoAction, t('ssoRemoved'), t('ssoRemoveFailed'));
          }}
        >
          {t('ssoRemove')}
        </Button>
      </div>
    </div>
  );
}

function SsoForm() {
  const t = useTranslations('settings');
  const [state, action, pending] = useActionState<SsoFormState, FormData>(registerSsoAction, {});
  const [protocol, setProtocol] = useState(state.values?.protocol || 'oidc');
  const value = (name: string) => state.values?.[name];

  return (
    <form noValidate action={action} className="grid max-w-md gap-4">
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
              className="font-mono text-[12.5px]"
              defaultValue={value('metadata')}
            />
          </Field>
        </>
      )}
      {state.error && (
        <Notice tone="error" live="alert">
          {state.error}
        </Notice>
      )}
      <Button type="submit" variant="secondary" loading={pending} className="w-fit">
        {pending ? t('sending') : t('ssoSave')}
      </Button>
    </form>
  );
}

/** Section « SSO d'entreprise », pour un propriétaire ou un administrateur : le réglage, ou son état s'il existe. */
export function SsoSection({ setup }: { setup: SsoSetup | null }) {
  const t = useTranslations('settings');
  return (
    <Section id="sso" title={t('ssoTitle')} description={t('ssoDescription')} className={SECTION}>
      {setup ? <SsoStatus setup={setup} /> : <SsoForm />}
    </Section>
  );
}
