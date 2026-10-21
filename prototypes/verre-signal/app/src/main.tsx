import './styles/tokens.css';
import './lib/instant'; // mode instantané posé avant le premier rendu
import { type ComponentType, StrictMode, use } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell, StandaloneShell } from '@/components/shell';
import { TooltipProvider } from '@/components/ui';

/**
 * Écran chargé à la demande. Contrairement à React.lazy, un écran déjà préchargé s'affiche tout de suite, sans repasser
 * par Suspense (React 19 retient sinon le squelette ~300 ms) : la transition de page joue sur l'écran, pas sur un squelette.
 */
function screen<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let Loaded: ComponentType<P> | undefined;
  let pending: Promise<void> | undefined;
  const preload = () => {
    pending ??= load().then((m) => {
      Loaded = m.default;
      Object.assign(pending!, { status: 'fulfilled', value: undefined }); // React lit ce statut : use() rend la main sans suspendre
    });
    return pending;
  };
  const Screen = (props: P) => {
    use(preload()); // à chaque rendu : un use() conditionnel déclenche une erreur de React
    return Loaded ? <Loaded {...props} /> : null;
  };
  return Object.assign(Screen, { preload });
}

// Chaque écran a son paquet ; son dossier src/screens/<écran>/ appartient à son agent.
const Recherche = screen(() => import('@/screens/recherche'));
const Discussions = screen(() => import('@/screens/discussions'));
const Connexions = screen(() => import('@/screens/connexions'));
const Reglages = screen(() => import('@/screens/reglages'));
const AuthSysteme = screen(() => import('@/screens/auth-systeme'));
const DesignSystem = screen(() => import('@/ds'));

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <StandaloneShell><AuthSysteme page="erreur" /></StandaloneShell>,
    children: [
      {
        // une erreur d'écran s'affiche dans le panneau, l'ossature reste
        errorElement: <AuthSysteme page="erreur" />,
        children: [
          { index: true, element: <Recherche /> },
          { path: 'discussions', element: <Discussions /> },
          { path: 'discussions/:id', element: <Discussions /> },
          { path: 'reglages', element: <Reglages /> },
          { path: 'connexions', element: <Connexions /> },
          { path: '_ds', element: <DesignSystem /> },
        ],
      },
    ],
  },
  {
    element: <StandaloneShell />,
    children: [
      { path: 'connexion', element: <AuthSysteme page="connexion" /> },
      { path: 'inscription', element: <AuthSysteme page="inscription" /> },
      { path: '*', element: <AuthSysteme page="404" /> },
    ],
  },
]);

// Les autres écrans se préchargent pendant un temps mort (un échec se montre à la visite : page d'erreur, « Réessayer » recharge).
const warm = () => [Recherche, Discussions, Connexions, Reglages, AuthSysteme, DesignSystem].forEach((s) => s.preload().catch(() => {}));
if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2500 });
else setTimeout(warm, 1200);

// /?etat=plantage casse un écran exprès (démonstration de la page d'erreur) : cette erreur-là n'encombre pas la console.
const report = (error: unknown) => new URLSearchParams(location.search).get('etat') !== 'plantage' && console.error(error);

createRoot(document.getElementById('root')!, { onCaughtError: report }).render(
  <StrictMode>
    <TooltipProvider delayDuration={300} skipDelayDuration={150}>
      <RouterProvider router={router} onError={report} />
    </TooltipProvider>
  </StrictMode>,
);
