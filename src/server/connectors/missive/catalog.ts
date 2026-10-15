import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const missiveCatalog: CatalogEntry = {
  id: 'missive',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’API personnel',
      kind: 'secret',
      help: 'Leon lit les conversations, les messages et les commentaires que votre compte voit. Missive limite le débit à une requête par seconde en continu : un premier passage sur beaucoup de conversations prend plusieurs minutes.',
    },
  ],
  keyHelp: 'Dans Missive : Préférences › onglet API › « Créer un nouveau jeton ».',
  docsUrl: 'https://missiveapp.com/docs/developers/rest-api',
  triedForReal: false,
  warning:
    'Forfait Productive requis : Missive ne permet de créer un jeton d’API qu’aux organisations qui l’ont.',
};
