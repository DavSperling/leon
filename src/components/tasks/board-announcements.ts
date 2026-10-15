import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from '@dnd-kit/core';
import { type Columns, columnOf } from './board-move';

export const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    "Pour déplacer une carte, appuyez sur la barre d'espace ou sur Entrée. Déplacez-la avec les flèches, puis appuyez sur la barre d'espace ou sur Entrée pour la déposer, ou sur Échap pour annuler.",
};

type Names = {
  card: (id: string) => string; // l'identifiant de la tâche : « LEO-12 »
  column: (key: string) => string;
};

// Ce que les lecteurs d'écran entendent pendant un déplacement au clavier.
export function boardAnnouncements(columns: Columns, names: Names): Announcements {
  const card = (id: UniqueIdentifier) => `Carte ${names.card(String(id))}`;
  const inColumn = (id: UniqueIdentifier) => {
    const key = columnOf(columns, String(id));
    return key === undefined ? '' : ` dans la colonne « ${names.column(key)} »`;
  };
  return {
    onDragStart: ({ active }) => `${card(active.id)} saisie${inColumn(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${card(active.id)}${inColumn(over.id)}.` : `${card(active.id)} hors d'une colonne.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${card(active.id)} déposée${inColumn(over.id)}.`
        : `${card(active.id)} remise à sa place.`,
    onDragCancel: ({ active }) => `Déplacement annulé. ${card(active.id)} remise à sa place.`,
  };
}
