import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// WXT prend seul public/icon/<taille>.png pour « icons » (node_modules/wxt/dist/core/utils/manifest.mjs:210-233) ;
// sans default_icon, Chrome et Firefox en tirent aussi l'icône du bouton.
const SIZES = [16, 32, 48, 96, 128];

describe('les icônes de Leon', () => {
  it.each(SIZES)('%i.png est un PNG carré de sa taille, avec un fond transparent', (size) => {
    const png = readFileSync(new URL(`../public/icon/${size}.png`, import.meta.url));
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    // L'en-tête IHDR suit la signature : largeur, hauteur (4 octets chacune), profondeur, type de couleur.
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
    // Type 6 : RGBA, la couche alpha garde le fond transparent.
    expect(png[25]).toBe(6);
  });
});
