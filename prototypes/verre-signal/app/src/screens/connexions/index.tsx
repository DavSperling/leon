/*
 * Écran Connexions (/connexions). Contrat avec le routeur : export par défaut, sans props.
 *
 * Paramètres de démonstration (combinables avec ?theme=light|dark et ?instant=1) :
 *   ?retour=<code>&outil=<id>   message du retour de l'éditeur (OAuth) ; codes :
 *        ok            « GitHub est branché. La première synchronisation démarre dans la minute. » (succès ; l'outil s'ajoute s'il n'était pas branché)
 *        annule        « Connexion à GitHub annulée. »
 *        expire        « Le lien a expiré, recommencez. »
 *        refuse        « GitHub a refusé l’autorisation. »
 *        indisponible  « GitHub ne répond pas, réessayez dans un moment. »
 *        champs        « Vérifiez les champs saisis. »
 *        admin         « L’administrateur Microsoft… » + lien d'accord (outil=outlook)
 *        admin_accorde « Accord donné : cliquez de nouveau sur Se connecter avec Outlook. » (succès)
 *        autre_compte  « Reconnectez GitHub avec le même compte et le même site, ou ajoutez une autre connexion. »
 *      (sans outil connu : « L’outil… » / « l’outil… » ; ok sans outil ne dit rien)
 *   ?sanscle=1                  serveur sans LEON_CONNECTORS_KEY : encadré d'avertissement, branchements et remplacements désactivés
 *   ?sansoauth=1                applis OAuth non configurées : clé seule ; Basecamp et Outlook : « L’appli … n’est pas encore configurée… »,
 *                               connexions OAuth : « … n’est plus configurée sur ce serveur : impossible de reconnecter. »
 *   ?filtre=<texte>             filtre du catalogue, tenu à jour pendant la saisie (?filtre=xyzzy : « Aucun outil ne correspond. »)
 *   ?outil=<id>                 ouvre la fenêtre de l'outil (sans ?retour) :
 *        github (clé, Julie) · linear / outlook (OAuth ; Outlook : avertissement + accord admin) · notion (2 connexions ; &ajout=1 : « Déjà branché par Alice et Bob. »)
 *        granola (premier passage en attente) · hubspot (en pause) · intercom (en erreur) · jira (arrêtée, créateur parti)
 *        asana, attio… (non branché : bouton OAuth + « ou coller une clé ») · circleback, sentry (clé seule) · basecamp (OAuth seul)
 *     avec :  &cle=1        « ou coller une clé » déplié
 *             &ajout=1      formulaire « Brancher une autre connexion » ouvert (outil déjà branché)
 *             &essai=attente|ok|refus|champs   état du test de clé : « Test en cours… » ; ok : la nouvelle connexion dans la fenêtre,
 *                           formulaire refermé (avec &remplacer=1 : « Connecté : … ») ; « Clé refusée par … » ; « Vérifiez les champs : … »
 *             &remplacer=1  formulaire « Remplacer la clé » ouvert sur la première connexion par clé (avec &essai=… : son test)
 *             &supprimer=1  confirmation « Supprimer « … » ? » ouverte
 * Interactions : une clé qui contient « faux » est refusée ; un champ secret vide renvoie « Vérifiez les champs : … ».
 * « Se connecter avec … » / « Reconnecter » simulent l'aller-retour et reviennent sur ?retour=ok&outil=… (sans nouvelle entrée
 * d'historique) ; toute connexion branchée apparaît dans la liste et dans la fenêtre (état local, perdu au rechargement).
 * Une clé testée avec succès : toast « … est branché. », le formulaire se replie et le focus va sur la nouvelle connexion.
 * L'outil passe de « À brancher » à « Vos outils branchés » (et l'inverse quand on supprime sa dernière connexion) ; quand
 * la fenêtre se ferme, le focus va sur son nouveau bouton et un anneau bat une fois autour de sa ligne.
 */
import './connexions.css';
import { ArrowUpRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Notice, PageHeader } from '@/components';
import { CONNECTIONS, type Connection, type ProviderId } from '@/data';
import { isInstant, nb, rise, scrollToTop, useTitle } from '@/lib';
import { Catalogue } from './catalogue';
import { ADMIN_CONSENT_URL, isProviderId, newConnection, returnNotice } from './model';
import { type DialogDemo, type Essai, type Ops, ToolDialog } from './tool-dialog';

const DIALOG_KEYS = ['outil', 'cle', 'ajout', 'essai', 'remplacer', 'supprimer'];
const ESSAIS: Essai[] = ['attente', 'ok', 'refus', 'champs'];

/** État de départ, lu une fois dans l'adresse : les connexions d'Acme, plus celle qu'un retour ou un essai réussi vient d'ajouter. */
function initialState(params: URLSearchParams): { conns: Connection[]; open: ProviderId | null; demo: DialogDemo } {
  const conns = [...CONNECTIONS];
  const outil = params.get('outil');
  const retour = params.get('retour');
  if (retour === 'ok' && isProviderId(outil) && !conns.some((c) => c.provider === outil)) conns.push(newConnection(outil, 'oauth'));
  if (retour || !isProviderId(outil)) return { conns, open: null, demo: {} };
  const essai = ESSAIS.find((e) => e === params.get('essai'));
  const demo: DialogDemo = { cle: params.get('cle') === '1', ajout: params.get('ajout') === '1', essai, remplacer: params.get('remplacer') === '1', supprimer: params.get('supprimer') === '1' };
  if (essai === 'ok') {
    const target = conns.find((c) => c.provider === outil && c.via === 'key') ?? conns.find((c) => c.provider === outil);
    if (demo.remplacer && target) conns.splice(conns.indexOf(target), 1, { ...target, secretHint: 'k3yA', ...(target.status === 'error' ? { status: 'active' as const, lastError: undefined } : {}) });
    else conns.push(newConnection(outil, 'key', 'demo-k3yA'));
  }
  return { conns, open: outil, demo };
}

function ReturnNotice({ code, tool }: { code: string | null; tool: string | null }) {
  const notice = returnNotice(code, tool);
  return (
    <AnimatePresence mode="wait">
      {notice && (
        <motion.div key={`${code}-${tool}`} variants={rise} initial="initial" animate="animate" exit="exit" className="mb-6">
          <Notice tone={notice.tone} live={notice.tone === 'success' ? 'status' : 'alert'}>
            {nb(notice.text)}
            {notice.admin && (
              <>
                {' '}
                <a href={ADMIN_CONSENT_URL} target="_blank" rel="noreferrer" className="font-medium text-fg underline decoration-destructive-line underline-offset-4 hover:decoration-destructive">
                  Lien d’accord pour l’administrateur<ArrowUpRight aria-hidden="true" strokeWidth={1.8} className="ml-0.5 inline size-3.5 align-[-2px]" /><span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
                </a>
              </>
            )}
          </Notice>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Connexions() {
  useTitle('Connexions');
  const [params, setParams] = useSearchParams();
  const [init] = useState(() => initialState(params));
  const [conns, setConns] = useState(init.conns);
  const [openId, setOpenId] = useState<ProviderId | null>(init.open);
  const [shownId, setShownId] = useState<ProviderId | null>(init.open);
  const [session, setSession] = useState(0);
  const [demo, setDemo] = useState(init.demo);
  const [fresh, setFresh] = useState<string | null>(null);
  // branché par clé, la fenêtre reste ouverte : l'anneau de la ligne attend qu'elle se ferme pour être vu
  const freshOnClose = useRef<string | null>(null);
  const [filter, setFilterState] = useState(() => params.get('filtre') ?? '');
  // le filtre suit l'adresse (?filtre=), sans empiler l'historique
  const setFilter = (q: string) => {
    setFilterState(q);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (q.trim()) next.set('filtre', q);
      else next.delete('filtre');
      return next;
    }, { replace: true });
  };
  // l'élément qui a ouvert la fenêtre ; s'il a disparu (l'outil a changé de zone), le focus va au nouveau bouton de l'outil
  const opener = useRef<HTMLElement | null>(null);
  const viaOAuth = useRef(false);
  const canConnect = params.get('sanscle') !== '1';
  const oauthReady = params.get('sansoauth') !== '1';

  // l'outil tout juste branché : un anneau bat une fois autour de sa ligne
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 1600);
    return () => clearTimeout(t);
  }, [fresh]);

  const open = useCallback((id: ProviderId) => {
    const a = document.activeElement;
    opener.current = a instanceof HTMLElement && a !== document.body ? a : null;
    viaOAuth.current = false;
    setDemo({});
    setSession((s) => s + 1);
    setShownId(id);
    setOpenId(id);
  }, []);

  const onCloseAutoFocus = (e: Event) => {
    // retour d'éditeur : la page repart du haut, comme après une vraie redirection
    if (viaOAuth.current || !opener.current || opener.current.isConnected) return;
    e.preventDefault();
    const id = shownId;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-outil="${id}"]`) ?? document.querySelector<HTMLElement>('input[aria-label="Filtrer les outils"]');
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: 'center', behavior: isInstant() ? 'auto' : 'smooth' });
    });
  };

  const onOpenChange = (o: boolean) => {
    if (o) return;
    setOpenId(null);
    if (freshOnClose.current) (setFresh(freshOnClose.current), (freshOnClose.current = null));
    // l'adresse ne rouvre pas la fenêtre au rechargement (sauf l'outil d'un message de retour)
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      DIALOG_KEYS.filter((k) => k !== 'outil' || !prev.has('retour')).forEach((k) => next.delete(k));
      return next;
    }, { replace: true });
  };

  const ops = useMemo<Ops>(() => ({
    addKey: (provider, secret) => {
      const c = newConnection(provider, 'key', secret);
      setConns((cs) => [...cs, c]);
      freshOnClose.current = provider;
      return c.id;
    },
    update: (id, patch) => setConns((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    remove: (id) => setConns((cs) => cs.filter((c) => c.id !== id)),
    oauth: (provider, reconnectId) => {
      viaOAuth.current = true;
      setConns((cs) => reconnectId
        ? cs.map((c) => (c.id === reconnectId ? { ...c, secretHint: newConnection(provider, 'oauth').secretHint, ...(c.status === 'error' ? { status: 'active' as const, lastError: undefined } : {}) } : c))
        : [...cs, newConnection(provider, 'oauth')]);
      setFresh(provider);
      setOpenId(null);
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        DIALOG_KEYS.forEach((k) => next.delete(k));
        next.set('retour', 'ok');
        next.set('outil', provider);
        return next;
      }, { replace: true }); // un vrai retour d'éditeur remplace l'entrée : Retour ne ramène pas sur une adresse périmée
      scrollToTop();
    },
  }), [setParams]);

  // AnimatePresence propre à l'écran : au premier chargement, celle de l'ossature (initial={false}) bloquerait
  // l'entrée de tout composant motion monté ensuite (lignes du catalogue, fenêtre).
  return (
    <AnimatePresence>
      <div key="connexions">
      <PageHeader title="Connexions" subtitle="Ce que Leon lit dans vos outils est visible de toute l’équipe, sauf le texte des boîtes mail, qui reste privé comme une conversation." />
      <ReturnNotice code={params.get('retour')} tool={params.get('outil')} />
      {!canConnect && (
        <Notice tone="warning" className="mb-6">
          {nb('Les connecteurs ne sont pas configurés sur ce serveur : il manque la variable LEON_CONNECTORS_KEY, qui chiffre les clés des outils. Générez-la avec')}{' '}
          <code className="rounded-[5px] whitespace-nowrap bg-warning-soft px-1 py-px font-mono text-[12.5px] text-fg shadow-[inset_0_0_0_1px_var(--warning-line)]">openssl rand -base64 32</code>
          {', ajoutez-la à l’environnement (voir .env.example), puis redémarrez Leon.'}
        </Notice>
      )}
      <Catalogue conns={conns} onOpen={open} filter={filter} onFilter={setFilter} fresh={fresh} />
      <ToolDialog provider={shownId} open={openId !== null} onOpenChange={onOpenChange} onCloseAutoFocus={onCloseAutoFocus} conns={conns} canConnect={canConnect} oauthReady={oauthReady} ops={ops} demo={demo} session={session} />
      </div>
    </AnimatePresence>
  );
}
