'use client';

import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { type AuthFormState, socialSignInAction, ssoSignInAction } from '@/app/(auth)/actions';
import { Button } from '@/components/verre/ui/button';
import { Field, Input } from '@/components/verre/ui/form';

export type SocialProvider = 'google' | 'microsoft';

const LABEL = { google: 'continueGoogle', microsoft: 'continueMicrosoft' } as const;
const DOOR = 'h-10 w-full gap-2.5 max-shell:h-11';

// Les marques officielles, en couleur dans les deux thèmes (la feuille du bouton les porte).
const MARK: Record<SocialProvider, ReactNode> = {
  google: (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  ),
  microsoft: (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-[18px]">
      <path fill="#F25022" d="M0 0h8.5v8.5H0z" />
      <path fill="#7FBA00" d="M9.5 0H18v8.5H9.5z" />
      <path fill="#00A4EF" d="M0 9.5h8.5V18H0z" />
      <path fill="#FFB900" d="M9.5 9.5H18V18H9.5z" />
    </svg>
  ),
};

function Submit({ children, pendingLabel }: { children: ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel={pendingLabel} className={DOOR}>
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
 * bouton n'apparaît que si le serveur le permet (clés posées, SSO réglé et vérifié par un espace). Le SSO se déplie
 * à sa place ; Échap le replie.
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
  const opener = useRef<HTMLButtonElement>(null);
  const [state, ssoAction, ssoPending] = useActionState<AuthFormState, FormData>(
    ssoSignInAction,
    {},
  );
  if (providers.length === 0 && !sso) return null;

  const close = () => {
    setSsoOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  };

  return (
    <div>
      <div className="grid gap-2">
        {providers.map((provider) => (
          <form key={provider} action={socialSignInAction}>
            <input type="hidden" name="provider" value={provider} />
            <Hidden token={token} returnTo={returnTo} />
            <Submit pendingLabel={t('sending')}>
              {MARK[provider]}
              {t(LABEL[provider])}
            </Submit>
          </form>
        ))}
        {sso &&
          (ssoOpen ? (
            <form
              noValidate
              action={ssoAction}
              aria-label={t('continueSso')}
              onKeyDown={(event) => {
                if (event.key === 'Escape') close();
              }}
              className="grid gap-2 rounded-item bg-n-50 p-3"
            >
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
                loading={ssoPending}
                loadingLabel={t('sending')}
                className={DOOR}
              >
                {t('ssoSubmit')}
              </Button>
            </form>
          ) : (
            <Button ref={opener} className={DOOR} onClick={() => setSsoOpen(true)}>
              <Building2 aria-hidden="true" strokeWidth={1.6} className="size-[18px]! text-icon" />
              {t('continueSso')}
            </Button>
          ))}
      </div>
      <p className="mt-5 mb-4 flex items-center gap-3 text-label text-muted after:h-px after:flex-1 after:bg-line">
        {t('orWithEmail')}
      </p>
    </div>
  );
}
