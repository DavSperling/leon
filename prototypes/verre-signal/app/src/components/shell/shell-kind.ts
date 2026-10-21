import { createContext, useContext } from 'react';

/** Où l'écran est rendu : dans l'ossature (barre latérale, panneau de verre) ou seul (connexion, 404, erreur racine). */
export const ShellContext = createContext<'app' | 'standalone'>('standalone');
export const useShell = () => useContext(ShellContext);
