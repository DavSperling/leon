'use client';

import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { Avatar, Button } from '@/components/verre';
import type { SsoSetup } from '@/server/auth/sso';
import type { DepotEquipe } from '@/server/connectors/github/depots-equipe';
import { depotsMissing, RepositoriesPanel } from './depots-equipe';
import { ManagersSwitch } from './managers';
import { Glyph, Row, RowState, Rows, RowsHead } from './reglages';
import { SsoPanel, ssoState } from './sso';

type Panel = 'sso' | 'depots';

/**
 * Le groupe Espace de travail : l'organisation et son ou ses propriétaires, pour tous ; pour un propriétaire ou un
 * administrateur (`admin`), le SSO d'entreprise, les managers et les dépôts d'équipe. Les membres, les groupes et
 * l'organigramme vivent dans l'écran Équipe. La suppression de l'organisation (propriétaire seul) suit la feuille.
 */
export function WorkspaceSettings({
  organizationName,
  owners,
  admin,
  sso,
  managersSeeAll,
  depots,
  children,
}: {
  organizationName: string;
  owners: { name: string; image?: string | null }[];
  admin: boolean;
  sso: SsoSetup | null;
  managersSeeAll: boolean;
  depots: { depots: DepotEquipe[]; githubBranche: boolean };
  children?: ReactNode;
}) {
  const t = useTranslations('settings');
  const [open, setOpen] = useState<Panel | null>(null);
  // une clé neuve à chaque ouverture : un formulaire à moitié rempli ne survit pas à la fermeture
  const [session, setSession] = useState(0);
  const show = (panel: Panel) => {
    setSession((n) => n + 1);
    setOpen(panel);
  };
  const onOpenChange = (next: boolean) => !next && setOpen(null);
  const state = ssoState(sso);
  const checked = depots.depots.filter((d) => d.coche).map((d) => d.depot);

  return (
    <>
      <Rows>
        <RowsHead
          // pas de carré d'encre à une lettre : le fondateur n'en veut pas (retour 7)
          picture={<Glyph icon={Building2} size={44} />}
          name={organizationName}
        />
        <Row label={t('owner')}>
          <span className="flex flex-wrap gap-x-5 gap-y-2">
            {owners.map((owner) => (
              <span key={owner.name} className="inline-flex items-center gap-2.5 text-lead">
                <Avatar name={owner.name} src={owner.image ?? undefined} size={24} />
                {owner.name}
              </span>
            ))}
          </span>
        </Row>
        {admin && (
          <>
            <Row
              id="sso"
              label={t('ssoTitle')}
              action={
                <Button
                  size="sm"
                  onClick={() => show('sso')}
                  aria-label={`${state === 'off' ? t('setUp') : t('manage')} · ${t('ssoTitle')}`}
                >
                  {state === 'off' ? t('setUp') : t('manage')}
                </Button>
              }
            >
              <RowState>
                {state === 'off' ? t('ssoOff') : state === 'on' ? t('ssoOn') : t('ssoPending')}
              </RowState>
            </Row>
            <Row id="managers" label={t('managersTitle')} top>
              <div className="pt-2.5 max-sm:pt-0">
                <ManagersSwitch on={managersSeeAll} />
              </div>
            </Row>
            <Row
              id="depots-equipe"
              label={t('depotsTitle')}
              action={
                <Button
                  size="sm"
                  onClick={() => show('depots')}
                  aria-label={`${t('manage')} · ${t('depotsTitle')}`}
                >
                  {t('manage')}
                </Button>
              }
            >
              <span className="block truncate">
                {checked.length > 0 ? (
                  <span className="text-ui text-fg">{checked.join(', ')}</span>
                ) : (
                  <RowState wrong={depotsMissing(depots)}>{t('depotsNoneSelected')}</RowState>
                )}
              </span>
            </Row>
          </>
        )}
      </Rows>
      {children}
      {admin && (
        <>
          <SsoPanel
            key={`s${session}`}
            setup={sso}
            open={open === 'sso'}
            onOpenChange={onOpenChange}
          />
          <RepositoriesPanel
            key={`d${session}`}
            {...depots}
            open={open === 'depots'}
            onOpenChange={onOpenChange}
          />
        </>
      )}
    </>
  );
}
