import { createContext, useContext } from 'react';

// Ouvrir la palette ⌘K depuis n'importe où dans l'ossature (barre latérale, barre mobile, écrans).
export const PaletteContext = createContext<{ openPalette: () => void }>({ openPalette: () => {} });
export const usePalette = () => useContext(PaletteContext);
