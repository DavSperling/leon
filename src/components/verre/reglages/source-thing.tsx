'use client';

import { useTranslations } from 'next-intl';
import type { SourceKind } from '@/capture/turn';
import { Thing, ToolLogo } from '@/components/verre';
import { SOURCE_KIND_LABELS } from '@/lib/labels';
import type { FicheSource } from '@/server/portrait/screen';

// Une source : son outil et son titre. Avec son lien, elle mène à son outil, comme l'activité d'une personne dans
// l'écran Équipe ; sans lien, elle se montre sans s'ouvrir. Sert à « Ma fiche » et à la demande de Leon sur l'Accueil.
export function SourceThing({ source }: { source: FicheSource }) {
  const t = useTranslations('fiche');
  const props = {
    picture: <ToolLogo kind={source.kind} size={28} />,
    name: source.title?.trim() || t('untitled'),
    caption: SOURCE_KIND_LABELS[source.kind as SourceKind] ?? source.kind,
    className: 'w-full',
  };
  return source.url ? (
    <Thing {...props} href={source.url} target="_blank" rel="noopener noreferrer" />
  ) : (
    <Thing {...props} chevron={false} disabled />
  );
}
