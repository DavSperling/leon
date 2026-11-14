import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Children, type ReactNode } from 'react';
import { AuthSheet, AuthTitle } from '@/components/verre/auth/frame';
import { Button } from '@/components/verre/ui/button';
import { nb } from '@/lib/verre/nb';
import { authorizeQuery, parseAuthorizeParams } from '@/server/auth/computer-authorize';
import { notesRefusedAt } from '@/server/auth/members';
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
// Seule exception (T65, C16) : `noter` part décochée quand le réglage `noter` du compte est daté (un refus déjà donné).
export default async function AuthorizeComputerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations('computer.authorize');
  const params = parseAuthorizeParams(await searchParams);
  if (!params) {
    return (
      <AuthSheet wide>
        <AuthTitle>{t('invalidTitle')}</AuthTitle>
        <p className="mt-3 text-title leading-[1.5] text-pretty text-fg">{nb(t('invalidText'))}</p>
      </AuthSheet>
    );
  }

  if (!(await getSession())) redirect(`/connexion?${authorizeQuery(params)}`);
  const ctx = await getUserContext();
  if (!ctx) redirect('/bienvenue');
  const { organizationName } = await getViewerProfile(ctx);
  const notesRefused = params.usages?.includes('noter') && (await notesRefusedAt(ctx)) !== null;
  const code = (chunks: ReactNode) => (
    <code className="font-mono text-label text-fg">{chunks}</code>
  );

  return (
    // Une décision de sécurité : la question, les cases et leur texte se lisent ici, au moment de choisir.
    <AuthSheet wide>
      <AuthTitle>{t('title')}</AuthTitle>
      <p className="mt-3 text-title leading-[1.5] text-pretty [overflow-wrap:anywhere] text-fg">
        {nb(t('question', { space: organizationName }))}
      </p>
      <form action={authorizeComputerAction} className="mt-6 grid gap-2">
        <input type="hidden" name="port" value={params.port} />
        <input type="hidden" name="etat" value={params.etat} />
        <input type="hidden" name="empreinte" value={params.empreinte} />
        {params.usages && (
          <fieldset className="mb-4 grid gap-2">
            <legend className="mb-1 text-ui font-semibold text-fg">{nb(t('usages.title'))}</legend>
            <p className="text-label text-pretty text-muted">{nb(t('usages.hint'))}</p>
            <input type="hidden" name="usages" value={params.usages.join(',')} />
            {params.usages.map((usage) => (
              <div
                key={usage}
                className="mt-1 flex items-start gap-3 rounded-item border border-line p-4"
              >
                <input
                  id={`usage-${usage}`}
                  type="checkbox"
                  name="usage"
                  value={usage}
                  defaultChecked={!(usage === 'noter' && notesRefused)}
                  aria-describedby={`usage-${usage}-texte`}
                  className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[var(--ink)]"
                />
                <div className="min-w-0">
                  <label
                    htmlFor={`usage-${usage}`}
                    className="cursor-pointer text-ui font-medium text-fg"
                  >
                    {nb(t(`usages.${usage}.title`))}
                  </label>
                  <ul
                    id={`usage-${usage}-texte`}
                    className="mt-2 grid list-disc gap-1.5 pl-4 text-label leading-[1.5] [overflow-wrap:anywhere] text-muted"
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
        <p className="mb-2 text-ui font-medium text-pretty text-fg">{nb(t('warning'))}</p>
        <Button
          type="submit"
          name="decision"
          value="allow"
          variant="primary"
          className="h-10 w-full max-shell:h-11"
        >
          {t('allow')}
        </Button>
        <Button type="submit" name="decision" value="cancel" className="h-10 w-full max-shell:h-11">
          {t('cancel')}
        </Button>
      </form>
    </AuthSheet>
  );
}
