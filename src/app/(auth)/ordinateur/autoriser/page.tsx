import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/verre/ui/button';
import { Notice } from '@/components/verre/ui/feedback';
import { nb } from '@/lib/verre/nb';
import { authorizeQuery, parseAuthorizeParams } from '@/server/auth/computer-authorize';
import { getSession, getUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { authorizeComputerAction } from './actions';

// L'adresse porte l'etat et l'empreinte : elle ne part dans aucun en-tête Referer et la page n'est pas indexée.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('computer.authorize');
  return { title: t('title'), referrer: 'no-referrer', robots: { index: false, follow: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Là où `leon login` envoie le navigateur (K3 du plan « CLI sans clone »). Paramètres invalides : la page le dit,
// sans formulaire. Sans session : la connexion, d'où la personne revient ici avec les mêmes trois paramètres (le
// chemin est rebâti à partir des valeurs validées, jamais tiré de l'adresse). Jamais requireUserContext() : un
// compte sans espace va à l'onboarding, pas à la connexion.
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
