import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const frontCatalog: CatalogEntry = {
  id: 'front',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’API',
      kind: 'secret',
      help: 'Leon ne fait que lire. Les boîtes personnelles ne sont lues que si le jeton couvre les ressources privées et si leur propriétaire a activé l’accès par API.',
    },
  ],
  keyHelp:
    'Dans Front, un administrateur ouvre Settings › Developers › API tokens › Create API token, active « Access resources », choisit les ressources partagées (toutes les boîtes à lire) et la permission « Read », puis copie le jeton : il ne s’affiche qu’une fois.',
  docsUrl: 'https://dev.frontapp.com/docs/create-and-revoke-api-tokens',
  triedForReal: false,
  warning:
    'Une clause des conditions de Front sur l’entraînement de modèles est ambiguë : à faire confirmer par écrit avant tout client.',
};
