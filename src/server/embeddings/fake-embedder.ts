import { EMBEDDING_DIMS, type Embedder } from './embedder';

// Fournisseur factice des tests (C3) : déterministe, sans réseau, sans clé. Un « sac de mots haché » :
// chaque mot (sans casse ni accents) ajoute +1 ou −1 à une case choisie par son empreinte, puis le vecteur
// est ramené à la norme 1. Deux textes qui partagent des mots ont donc des vecteurs proches ; deux textes
// sans mot commun, des vecteurs presque orthogonaux.

// Empreinte FNV-1a sur 32 bits : rapide, sans dépendance, la même à chaque exécution.
function hash(word: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < word.length; i += 1) {
    h = Math.imul(h ^ word.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

function words(text: string): string[] {
  const found = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  // Un texte sans aucun mot garde un vecteur de norme 1 : un vecteur nul n'a pas de distance cosinus.
  return found?.length ? found : [''];
}

function embedOne(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMS).fill(0);
  for (const word of words(text)) {
    const h = hash(word);
    const index = h % EMBEDDING_DIMS;
    vector[index] = (vector[index] as number) + (h >>> 31 === 0 ? 1 : -1);
  }
  let norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  // Deux mots peuvent tomber dans la même case avec des signes opposés et s'annuler : on retombe alors
  // sur le mot vide, qui donne toujours un vecteur non nul.
  if (norm === 0) {
    vector[hash('') % EMBEDDING_DIMS] = 1;
    norm = 1;
  }
  return vector.map((x) => x / norm);
}

export function createFakeEmbedder(): Embedder {
  return {
    model: 'factice-1024',
    // Le type (document ou requête) ne change rien : une requête retrouve les passages qui disent la même chose.
    async embed(texts) {
      return texts.map(embedOne);
    },
  };
}
