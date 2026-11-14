// Le moment de la journée du bonjour de l'Accueil : le matin jusqu'à midi, l'après-midi jusqu'à 18 h, le soir ensuite
// (et la nuit). Module pur : le serveur s'en sert pour son premier rendu, le navigateur à l'heure de la personne.
export type DayPart = 'morning' | 'afternoon' | 'evening';

export const dayPart = (hour: number): DayPart =>
  hour < 5 || hour >= 18 ? 'evening' : hour < 12 ? 'morning' : 'afternoon';
