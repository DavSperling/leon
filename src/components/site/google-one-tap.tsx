'use client';

import { useEffect } from 'react';
import { oneTapAction } from '@/app/(auth)/actions';

type GoogleId = {
  initialize(options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    cancel_on_tap_outside?: boolean;
    itp_support?: boolean;
    use_fedcm_for_prompt?: boolean;
  }): void;
  prompt(): void;
  cancel(): void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT = 'https://accounts.google.com/gsi/client';

// Pas sur la reconnexion de la section Mémoire (/connexion?retour=memoire, T55) : One Tap ramène toujours à l'accueil.
export const offersOneTap = (search: string) =>
  new URLSearchParams(search).get('retour') !== 'memoire';

// Le démarrage de la fenêtre, sorti de l'effet pour être testé : `stopped` dit si le composant est parti entre-temps.
export async function startOneTap(clientId: string, stopped: () => boolean) {
  if (!offersOneTap(window.location.search)) return;
  // Une personne déjà connectée à Leon ne se voit rien proposer.
  const session = await fetch('/api/auth/get-session', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (stopped() || session) return;
  const show = () => {
    if (stopped() || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) => void oneTapAction(credential),
      cancel_on_tap_outside: true,
      itp_support: true,
      use_fedcm_for_prompt: true,
    });
    window.google.accounts.id.prompt();
  };
  if (window.google) return show();
  const script = document.createElement('script');
  script.src = SCRIPT;
  script.async = true;
  script.onload = show;
  document.head.append(script);
}

/**
 * La fenêtre « Continuer en tant que… » de Google, en haut à droite du site, pour qui n'a pas de session Leon et a
 * un compte Google ouvert dans le navigateur. Google seul décide de l'afficher (refus récents, navigateur…).
 */
export function GoogleOneTap({ clientId }: { clientId: string }) {
  useEffect(() => {
    let stopped = false;
    void startOneTap(clientId, () => stopped);
    return () => {
      stopped = true;
      window.google?.accounts.id.cancel();
    };
  }, [clientId]);
  return null;
}
