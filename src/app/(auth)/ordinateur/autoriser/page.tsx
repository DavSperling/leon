import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Children, type ReactNode } from 'react';
import { Button } from '@/components/verre/ui/button';
import { Notice } from '@/components/verre/ui/feedback';
import { nb } from '@/lib/verre/nb';
import { authorizeQuery, parseAuthorizeParams } from '@/server/auth/computer-authorize';
import { getSession, getUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { authorizeComputerAction } from './actions';

// L'adresse porte l'etat et l'empreinte : elle ne part dans aucun en-tête Referer vers un autre site et la page n'est pas
// indexée. « same-origin » et non « no-referrer » : un formulaire natif (avant l'hydratation, ou sans JavaScript) partirait
// avec « Origin: null », que Next refuse.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('computer.authorize');
  return { title: t('title'), referrer: 'same-origin', robots: { index: false, follow: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Les lignes du texte de chaque case, celles du terminal (LECTURE_LINES, RAPPEL_LINES, testés mot pour mot).
const USAGE_LINES = ['p1', 'p2', 'p3'] as const;

// Là où `leon login` envoie le navigateur (K3 du plan « CLI sans clone »). Paramètres invalides : la page le dit,
// sans formulaire. Sans session : la connexion, d'où la personne revient ici avec les mêmes paramètres (le chemin est
// rebâti à partir des valeurs validées, jamais tiré de l'adresse). Jamais requireUserContext() : un compte sans espace
// va à l'onboarding, pas à la connexion.
// Les cases que `leon setup` demande (`usages`, T64) : natives et cochées par défaut, pour partir avant l'hydratation ou
// sans JavaScript ; une case qui ne partirait pas deviendrait un refus gardé. Sans le paramètre, aucune case.
export default async function AuthorizeComputerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations('computer.authorize');
  const params = parseAuthorizeParams(await searchParams);
  if (!params) {
    return (
      <div className="fade-in">
        <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{t('invalidTitle')}</h1>
        <p className="mt-3 text-ui text-muted">{nb(t('invalidText'))}</p>
      </div>
    );
  }

  if (!(await getSession())) redirect(`/connexion?${authorizeQuery(params)}`);
  const ctx = await getUserContext();
  if (!ctx) redirect('/bienvenue');
  const { organizationName } = await getViewerProfile(ctx);
  const code = (chunks: ReactNode) => (
    <code className="font-mono text-[0.9em] text-fg">{chunks}</code>
  );

  return (
    <div className="fade-in">
      <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{t('title')}</h1>
      <p className="mt-3 text-ui [overflow-wrap:anywhere] text-muted">
        {nb(t('question', { space: organizationName }))}
      </p>
      <Notice tone="warning" className="mt-6">
        {t('warning')}
      </Notice>
      <form action={authorizeComputerAction} className="mt-6 grid gap-3">
        <input type="hidden" name="port" value={params.port} />
        <input type="hidden" name="etat" value={params.etat} />
        <input type="hidden" name="empreinte" value={params.empreinte} />
        {params.usages && (
          <fieldset className="grid gap-3">
            <legend className="text-ui font-semibold text-fg">{nb(t('usages.title'))}</legend>
            <p className="text-meta text-muted">{nb(t('usages.hint'))}</p>
            <input type="hidden" name="usages" value={params.usages.join(',')} />
            {params.usages.map((usage) => (
              <div
                key={usage}
                className="flex items-start gap-3 rounded-card border border-line bg-glass-2 p-3"
              >
                <input
                  id={`usage-${usage}`}
                  type="checkbox"
                  name="usage"
                  value={usage}
                  defaultChecked
                  aria-describedby={`usage-${usage}-texte`}
                  className="mt-1 size-4 shrink-0 accent-accent"
                />
                <div className="min-w-0">
                  <label htmlFor={`usage-${usage}`} className="text-ui font-medium text-fg">
                    {nb(t(`usages.${usage}.title`))}
                  </label>
                  <ul
                    id={`usage-${usage}-texte`}
                    className="mt-1 grid list-disc gap-1 pl-4 text-meta [overflow-wrap:anywhere] text-muted"
                  >
                    {USAGE_LINES.map((line) => (
                      <li key={line}>
                        {Children.map(t.rich(`usages.${usage}.${line}`, { code }), (node) =>
                          typeof node === 'string' ? nb(node) : node,
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </fieldset>
        )}
        <Button
          type="submit"
          name="decision"
          value="allow"
          variant="primary"
          size="lg"
          className="w-full"
        >
          {t('allow')}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="cancel"
          variant="secondary"
          size="lg"
          className="w-full"
        >
          {t('cancel')}
        </Button>
      </form>
    </div>
  );
}
