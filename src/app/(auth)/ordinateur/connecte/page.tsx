import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type Props = { searchParams: Promise<{ refus?: string | string[] }> };

// Là où la CLI renvoie le navigateur une fois le code échangé (ou refusé, avec `?refus=1`). Rien à protéger, rien à
// lire d'autre : seul « refus=1 » vaut refus.
const refused = async ({ searchParams }: Props) => (await searchParams).refus === '1';

export async function generateMetadata(props: Props): Promise<Metadata> {
  const t = await getTranslations('computer.connected');
  return { title: t((await refused(props)) ? 'refusedTitle' : 'title') };
}

export default async function ComputerConnectedPage(props: Props) {
  const t = await getTranslations('computer.connected');
  const no = await refused(props);
  return (
    <div className="fade-in">
      <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">
        {t(no ? 'refusedTitle' : 'title')}
      </h1>
      <p className="mt-3 text-ui text-muted">{t(no ? 'refused' : 'done')}</p>
    </div>
  );
}
