import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthSheet, AuthTitle } from '@/components/verre/auth/frame';

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
    // Rien à faire ici (l'onglet se ferme) : le titre, sous le trait vert quand c'est fait, et la phrase.
    <AuthSheet wide>
      <AuthTitle done={!no}>{t(no ? 'refusedTitle' : 'title')}</AuthTitle>
      <p className="mt-3 text-title leading-[1.5] text-pretty text-fg">
        {t(no ? 'refused' : 'done')}
      </p>
    </AuthSheet>
  );
}
