import type { ProviderId } from '@/capture/turn';

// Ce que Leon lit pour une personne, montré dans le champ d'une nouvelle discussion. Module pur (testé à part).

type Connection = {
  provider: ProviderId;
  status: 'active' | 'paused' | 'error';
  isCreator: boolean;
  /** Qui voit ce que la connexion relève ; nul : le choix de l'outil. */
  partage: string | null;
};

/**
 * Les outils dont cette personne lit le contenu, une fois chacun : ceux qui relèvent (ni en pause, ni en erreur), les
 * siens et ceux que toute l'équipe voit. Sans choix de partage, l'outil décide (`privateByDefault` : une boîte mail
 * reste à qui l'a branchée). Un outil partagé à un groupe n'y est pas : on n'annonce rien de trop.
 */
export function readableProviders(
  connections: Connection[],
  privateByDefault: ReadonlySet<ProviderId>,
): ProviderId[] {
  return [
    ...new Set(
      connections
        .filter(
          (c) =>
            c.status === 'active' &&
            (c.isCreator ||
              c.partage === 'equipe' ||
              (c.partage === null && !privateByDefault.has(c.provider))),
        )
        .map((c) => c.provider),
    ),
  ];
}
