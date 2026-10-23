// Les trois maquettes de l'accueil, comparées sur /maquettes. L'accueil (« / » sans session, /accueil) sert la
// première tant que l'équipe n'a pas choisi.

export const MAQUETTES = [
  {
    n: '1',
    name: 'Signal',
    pitch: 'La plus proche de l’appli : un titre centré, puis la recherche en démonstration.',
    points: [
      'Démo animée : la requête, le faisceau, les sources, la réponse citée',
      'Les équipes en onglets, avec leurs questions',
      '« La source, ou rien. » comme preuve',
    ],
  },
  {
    n: '2',
    name: 'Constellation',
    pitch:
      'Le schéma vivant : vos outils en orbite autour de Leon, puis les fonctions en mosaïque.',
    points: [
      'Haut de page partagé : le texte, le schéma qui tourne',
      'Mosaïque des fonctions, chacune avec son aperçu',
      'Les équipes en cartes, les 39 outils qui défilent',
    ],
  },
  {
    n: '3',
    name: 'Récit',
    pitch: 'L’éditorial : une journée avec Leon, du point du matin à la passation du soir.',
    points: [
      'Grand titre en Fraunces, avec un surligné',
      'Cinq moments de la journée, sur une ligne de temps',
      'Ce que Leon ne fait pas, écrit noir sur blanc',
    ],
  },
] as const;

export type MaquetteNumber = (typeof MAQUETTES)[number]['n'];
