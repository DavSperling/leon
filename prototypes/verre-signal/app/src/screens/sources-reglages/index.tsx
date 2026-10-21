import { PresenceContext } from 'motion/react';
import { useTitle } from '@/lib';
import { Reglages } from './reglages';
import { Sources } from './sources';

/*
 * Écrans Sources (/sources) et Réglages (/reglages). Contrat avec le routeur : export par défaut, prop `page`.
 * Partout : ?theme=light|dark, ?instant=1 (état final, sans chorégraphie).
 *
 * Paramètres de démonstration, Sources
 *   /sources                 page 1 (50 lignes) : canaux (frais, aucune capture, en retard), En cours / Indexée / Erreur / « — »
 *   /sources?page=2          dernière page (21 lignes), « Précédent » seul
 *   /sources?page=3          page vide plus loin : « Cette page est vide. »
 *   /sources?vide=1          aucune conversation captée (page 1 vide, canaux « aucune capture »)
 *   /sources?erreur=1        le premier « Erreur » est déplié (et amené au centre) : « Échec de l’indexation. »
 *
 * Paramètres de démonstration, Réglages
 *   /reglages                trois jetons (utilisé il y a 2 h, il y a 18 h, jamais utilisé)
 *   /reglages?vide=1         « Aucun jeton pour l’instant. »
 *   /reglages?creer=1        fenêtre de création, étape 1 (action ⌘K « Créer un jeton » ; consommé, il rouvre à chaque fois)
 *   /reglages?creer=erreur   étape 1, nom refusé : « Donnez un nom à l’appareil (80 caractères au plus). »
 *   /reglages?creer=envoi    étape 1, envoi en cours : « Envoi… » (tenu)
 *   /reglages?creer=cree     étape 2 : « Jeton créé », le jeton affiché ; « Terminé » l'ajoute en tête de liste
 *   /reglages?revoquer=1     confirmation de révocation du premier jeton ouverte ; « Révoquer » → « Envoi… » → « Jeton révoqué. »
 *   &revocation=absent       la révocation répond « Ce jeton n’existe plus ou est déjà révoqué. » (la ligne part)
 *   &revocation=echec        la révocation répond « Impossible de révoquer. Réessayez. » (la ligne reste)
 *   /reglages#extension      arrive sur une section (#jetons, #claude-code, #extension)
 */
export default function SourcesReglages({ page }: { page: 'sources' | 'reglages' }) {
  useTitle(page === 'sources' ? 'Sources' : 'Réglages');
  // L'ossature monte la première page sous <AnimatePresence initial={false}> : sans cette remise à zéro, sur un
  // chargement direct, aucune entrée de l'écran ne jouerait (ni le fondu de pagination, ni l'étape 2 de la création).
  return <PresenceContext.Provider value={null}>{page === 'sources' ? <Sources /> : <Reglages />}</PresenceContext.Provider>;
}
