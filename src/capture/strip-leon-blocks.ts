import { removeBlocks } from './prepare-turn-text';

// Un bloc injecté par Leon n'est jamais recapté (T06 du plan mémoire des sessions) : ni le bloc de démarrage
// (`<contexte-leon>`), ni le point du matin qui le suit, ni le rappel du premier prompt (`<rappel-leon>`, T36).
// Recapté, il reviendrait dans le bloc suivant et s'y recopierait de session en session. Le serveur échappe tout ce
// qu'il met dans un bloc : la première balise fermante est donc la vraie fin.
//
// Seulement pour les sessions de code, qui reçoivent ces blocs : appelée par les lecteurs de leurs fichiers et à la
// réception de leurs tours (ingest-turns.ts), jamais dans prepareTurnText, qui sert aussi aux connecteurs (un ticket
// qui cite le bloc garde son texte).
const LEON_BLOCK_TAGS = ['contexte-leon', 'point-du-matin', 'rappel-leon'] as const;

// Le point du matin commence par un en-tête fixe, hors de sa balise (renderBriefing et renderEmptyBriefing,
// briefing-prompt.ts) : le titre, la ligne de garde, « Prepared by Leon… », puis la garde du bloc ou, quand rien n'a
// bougé, la ligne « Nothing new… » sans bloc. Il ne porte que la clé du projet et la date, une ligne chacune. Le test
// le prend dans le vrai rendu : un en-tête changé côté serveur le fait échouer.
const BRIEFING_HEADER =
  /^# Morning briefing · .*\n> Data captured from conversations: .*\nPrepared by Leon on .*(?:\n> The point-du-matin block reports .*|\n\nNothing new on this project .*)?$/gm;
// Les deux messages fixes du serveur quand aucun point n'est prêt (BRIEFING_PENDING_MARKDOWN et
// BRIEFING_NO_MODEL_MARKDOWN, briefings.ts), chacun sur sa ligne : le cas de la première session sur un projet.
const BRIEFING_NOT_READY =
  /^(?:No briefing for this project yet: it will be ready at your next session\.|The morning briefing is not prepared: no model is configured on this server\.)$/gm;

export function stripLeonBlocks(text: string): string {
  return LEON_BLOCK_TAGS.reduce((kept, tag) => removeBlocks(kept, tag), text)
    .replace(BRIEFING_HEADER, '')
    .replace(BRIEFING_NOT_READY, '');
}
