import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici. Miro ne se branche que par le
// bouton : ni champ ni aide de clé.
export const miroCatalog: CatalogEntry = {
  id: 'miro',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Miro vous demande de choisir l’équipe où installer Leon, puis d’autoriser l’accès à ses tableaux (il permet aussi d’écrire ; Leon ne s’en sert pas encore). Leon lit le texte des notes, des textes, des formes, des cartes, des cadres et des documents de ces tableaux, jamais les images. Pour changer d’équipe, utilisez Reconnecter.',
  docsUrl: 'https://developers.miro.com/docs/getting-started-with-oauth',
  triedForReal: false,
  warning:
    'Les commentaires des tableaux ne sont pas lus : l’API de Miro ne les donne pas. Seuls les tableaux de l’équipe choisie, auxquels votre compte a accès, sont lus.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Miro asks you to choose the team where Leon is installed, then to authorize access to its boards (it also allows writing; Leon doesn’t use it yet). Leon reads the text of sticky notes, text items, shapes, cards, frames, and documents on these boards, never images. To change team, use Reconnect.',
    warning:
      'Board comments are not read: Miro’s API doesn’t provide them. Only the boards of the chosen team that your account has access to are read.',
  },
};
