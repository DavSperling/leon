import { ChevronLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Button, GlassCard } from '@/components';
import { getDiscussion } from '@/data';
import { useTitle } from '@/lib';
import { DiscussionList } from './list';
import { Thread } from './thread';

/*
 * Écran Discussions : /discussions (liste) et /discussions/:id (fil). Contrat avec le routeur : export par défaut,
 * sans props ; l'identifiant vient de useParams(). Partout : ?theme=light|dark, ?instant=1 (état final, sans chorégraphie).
 *
 * Paramètres de démonstration
 *   /discussions
 *     ?nouvelle=1             le curseur va dans « Nouvelle discussion » (action ⌘K « Nouvelle discussion »)
 *     ?sansmodele=1           avertissement « Aucun modèle d’IA… », formulaire désactivé
 *     ?vide=1                 « Aucune discussion pour l’instant. »
 *     ?erreur=longue          erreur « Écrivez une question de 4 000 caractères au plus. » (question collée de 4 012 caractères, compteur en rouge ; l’envoi garde l’erreur)
 *     ?erreur=creation        erreur « La discussion n’a pas pu être créée… » ; un nouvel envoi réussit
 *   /discussions/:id          arrivée par « Continuer en discussion » (state { suite: true }) ou nouvelle question : curseur dans la saisie (souris)
 *                             ids : ovh-echeance (attend sa réponse : Leon répond tout de suite), acme-renouvellement
 *                             (complète, question venue de la recherche avec 5 résultats), budget-plafond, sauvegardes,
 *                             sso-marc, retro-42, recrutement, lenteurs-export (« Je ne sais pas »), inconnu → introuvable
 *     ?etat=reflechit|cherche|lit|activite|travaille   réponse figée sur cette activité (lit : sources en cours de lecture)
 *     ?etat=reprise           « Leon termine une réponse commencée plus tôt… »
 *     ?etat=flux              texte figé en plein flux, curseur qui respire
 *     ?notice=indisponible    « Leon n’a pas pu répondre pour le moment. » + Réessayer
 *     ?notice=gardee          « … Votre question est gardée. » + Réessayer
 *     ?notice=saisie          « … Votre question vous attend dans la saisie. » (question remise dans la saisie)
 *     ?notice=occupe          « Leon répond déjà à deux de vos questions… » + Réessayer
 *     ?notice=session         « Votre session a expiré… » + Se reconnecter
 *     ?notice=origine         « Leon est ouvert ici à une autre adresse… » + Ouvrir à cette adresse
 *     ?notice=non-envoyee     « Leon répondait déjà dans cette discussion… » (question remise dans la saisie)
 *     ?notice=attente         « Cette question attend encore sa réponse. » + Demander la réponse
 *     ?notice=sansmodele      (ou ?sansmodele=1) texte sans modèle, saisie désactivée, pas de réponse automatique
 *     ?notice=refus|vide|limite   fins fixes : refus, « Je ne sais pas… », note de limite après une réponse
 *     ?apercu=<n>             aperçu de la source n de la dernière réponse citée (panneau ou feuille)
 *     ?apercu=chargement|introuvable|erreur   états de l'aperçu (sur la source 1) ; un clic sur une source l'ouvre tout de suite
 */
export default function Discussions() {
  const { id } = useParams();
  const discussion = id ? getDiscussion(id) : undefined;
  // Ce qui est là à l'arrivée s'affiche sans entrée : seuls les messages ajoutés ensuite montent (useAppear dans le fil).
  return !id ? <DiscussionList /> : discussion ? <Thread key={id} discussion={discussion} /> : <NotFound />;
}

/** Discussion inconnue (ou d'un autre) : elle n'existe pas pour vous. */
function NotFound() {
  useTitle('Discussion');
  return (
    <div className="max-w-[880px]">
      <nav aria-label="Fil d’Ariane" className="mb-3">
        <Link to="/discussions" className="-ml-2 inline-flex h-8 items-center gap-1 rounded-full pr-3 pl-1.5 text-ui text-muted transition-colors hover:bg-hover hover:text-fg">
          <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.8} />
          Discussions
        </Link>
      </nav>
      {/* la 404 partagée (auth-systeme/not-found) : un titre, un seul bouton */}
      <GlassCard variant="raised" className="mt-6 max-w-[392px] p-6 sm:p-7">
        <h1 className="text-h2 font-semibold tracking-[-0.018em] text-fg">Cette page n’existe pas.</h1>
        <Button asChild variant="secondary" className="mt-6"><Link to="/">Retour à l’accueil</Link></Button>
      </GlassCard>
    </div>
  );
}
