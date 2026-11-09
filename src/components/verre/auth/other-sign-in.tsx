'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { type AuthFormState, socialSignInAction, ssoSignInAction } from '@/app/(auth)/actions';
import { Button } from '@/components/verre/ui/button';
import { Field, Input } from '@/components/verre/ui/form';

export type SocialProvider = 'google' | 'microsoft';

const LABEL = { google: 'continueGoogle', microsoft: 'continueMicrosoft' } as const;

function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="lg" loading={pending} className="w-full">
      {children}
    </Button>
  );
}

// Les champs cachés que les actions relisent : le lien d'invitation, ou le retour d'un ordinateur ou d'un assistant.
function Hidden({ token, returnTo }: { token?: string; returnTo?: string }) {
  return (
    <>
      {token && <input type="hidden" name="token" value={token} />}
      {returnTo && <input type="hidden" name="retour" value={returnTo} />}
    </>
  );
}

/**
 * « Continuer avec Google / Microsoft » et « SSO d'entreprise », au-dessus du formulaire par mot de passe. Chaque
 * bouton n'apparaît que si le serveur le permet (clés posées, SSO réglé et vérifié par un espace).
 */
export function OtherSignIn({
  providers,
  sso,
  token,
  returnTo,
}: {
  providers: SocialProvider[];
  sso: boolean;
  token?: string;
  returnTo?: string;
}) {
  const t = useTranslations('auth');
  const [ssoOpen, setSsoOpen] = useState(false);
  const [state, ssoAction, ssoPending] = useActionState<AuthFormState, FormData>(
    ssoSignInAction,
    {},
  );
  if (providers.length === 0 && !sso) return null;

  return (
    <div className="mt-6">
      <div className="grid gap-2.5">
        {providers.map((provider) => (
          <form key={provider} action={socialSignInAction}>
            <input type="hidden" name="provider" value={provider} />
            <Hidden token={token} returnTo={returnTo} />
            <Submit>{t(LABEL[provider])}</Submit>
          </form>
        ))}
        {sso &&
          (ssoOpen ? (
            <form noValidate action={ssoAction} className="grid gap-3">
              <Hidden token={token} returnTo={returnTo} />
              <Field
                label={t('ssoEmail')}
                help={t('ssoHelp')}
                error={state.errors?.email ?? state.errors?.form}
              >
                <Input
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  required
                  defaultValue={state.values?.email}
                />
              </Field>
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                loading={ssoPending}
                className="w-full"
              >
                {t('ssoSubmit')}
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => setSsoOpen(true)}
            >
              {t('continueSso')}
            </Button>
          ))}
      </div>
      <p className="mt-6 flex items-center gap-3 text-label text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        {t('orWithEmail')}
      </p>
    </div>
  );
}
