import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici. Miro ne se branche que par le
// bouton : ni champ ni aide de clé.
export const miroCatalog: CatalogEntry = {
  id: 'miro',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Miro vous demande de choisir l’équipe où installer Leon, puis d’autoriser la lecture de ses tableaux. Leon lit le texte des notes, des textes, des formes, des cartes, des cadres et des documents de ces tableaux, jamais les images. Pour changer d’équipe, utilisez Reconnecter.',
  docsUrl: 'https://developers.miro.com/docs/getting-started-with-oauth',
  triedForReal: false,
  warning:
    'Les commentaires des tableaux ne sont pas lus : l’API de Miro ne les donne pas. Seuls les tableaux de l’équipe choisie, auxquels votre compte a accès, sont lus.',
};
