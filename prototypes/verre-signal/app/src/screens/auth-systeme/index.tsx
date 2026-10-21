/**
 * Pages hors ossature et pages système : connexion, inscription, 404, erreur.
 * Contrat avec le routeur : export par défaut, prop `page`.
 *   connexion, inscription, 404 : dans StandaloneShell (aurore + <main>), centrées ici.
 *   erreur : errorElement ; dans le panneau pour une erreur d'écran, seule sur l'aurore si l'ossature a échoué.
 *
 * Paramètres de démonstration (en plus de ?theme=light|dark et ?instant=1) :
 *   /connexion?etat=erreurs               envoi avec une adresse invalide et sans mot de passe : les deux erreurs de saisie
 *   /connexion?etat=incorrect             réponse du serveur « E-mail ou mot de passe incorrect. »
 *   /connexion?etat=bloque                « Trop de tentatives. Réessayez dans quelques minutes. »
 *   /connexion?etat=envoi                 envoi en cours (« Envoi… »)
 *   /connexion?etat=voir                  mot de passe affiché (bouton « Masquer »)
 *   /inscription?etat=erreurs             les quatre erreurs de saisie (nom, e-mail, mot de passe, entreprise)
 *   /inscription?etat=pris                « Cette adresse e-mail est déjà utilisée. » sous le champ
 *   /inscription?etat=echec               « Impossible de créer le compte. Réessayez. »
 *   /inscription?etat=connexion-echouee   « Compte créé, mais la connexion a échoué. Connectez-vous. » (+ lien « Se connecter »)
 *   /inscription?etat=bloque              « Trop de tentatives… »
 *   /inscription?etat=envoi               envoi en cours
 *   /importe-quel-chemin                  404 : « Cette page n’existe pas. », « Retour à l’accueil »
 *   /importe-quel-chemin?etat=plantage    page d'erreur seule sur l'aurore (comme quand l'ossature elle-même échoue)
 *   /?etat=plantage                       page d'erreur dans le panneau (l'écran Recherche lève une erreur)
 * Serveur simulé, en tapant : erreur@acme.fr → identifiants refusés (connexion), « Impossible de créer le compte » (inscription) ;
 *   bloque@acme.fr → trop de tentatives ; pris@acme.fr → adresse déjà utilisée (inscription) ;
 *   echec@acme.fr → compte créé mais connexion échouée (inscription) ; toute autre adresse valide → l'accueil (/).
 * Sans ?etat, le premier champ reçoit le focus à l'arrivée.
 */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { Brand, GlassCard } from '@/components';
import { rise, useTitle } from '@/lib';
import { type AuthPage, AuthForm } from './auth-form';
import { ErrorPage } from './error-page';
import { NotFound } from './not-found';
import { ThemeToggle } from './theme-toggle';

type Page = AuthPage | '404' | 'erreur';
const TITLES: Record<Page, string> = { connexion: 'Se connecter', inscription: 'Créer un espace', '404': 'Page introuvable', erreur: 'Erreur' };

export default function AuthSysteme({ page }: { page: Page }) {
  const [params] = useSearchParams();
  const etat = params.get('etat');
  const crash = page === '404' && etat === 'plantage';
  useTitle(TITLES[crash ? 'erreur' : page]);
  // en quittant (ex. erreur → un écran sans titre), on ne laisse pas « Erreur · Leon » dans l'onglet
  useEffect(() => () => void (document.title = 'Leon'), []);
  if (page === 'erreur' || crash) return <ErrorPage standalone={crash || undefined} />;
  return (
    <>
      {page === '404' ? <NotFound /> : <AuthScreen page={page} etat={etat} />}
      <ThemeToggle />
    </>
  );
}

/** Connexion et inscription : le formulaire seul, centré. La mise en page survit au passage de l'une à l'autre (même élément pour le routeur). */
function AuthScreen({ page, etat }: { page: AuthPage; etat: string | null }) {
  const shown = useRef<AuthPage | null>(null);
  return (
    // Ancré en haut, pas centré : une erreur ou le passage à l'inscription allonge la carte vers le bas, rien au-dessus ne bouge.
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] px-4 pt-[max(56px,calc(50dvh-310px))] pb-12">
      <motion.div className="mx-auto w-full max-w-[392px]" variants={rise} initial="initial" animate="animate">
        {/* Brand a 6 px de marge interne : le logo s'aligne ainsi sur le bord de la carte */}
        <div className="-mx-1.5"><Brand withVersion={false} /></div>
        <GlassCard variant="raised" className="mt-5 p-6 shadow-panel backdrop-blur-[30px] sm:p-7">
          <AnimatePresence mode="wait" initial={false}>
            <AuthForm key={page} page={page} etat={etat} shown={shown} />
          </AnimatePresence>
        </GlassCard>
      </motion.div>
    </div>
  );
}
