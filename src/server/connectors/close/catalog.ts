import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const closeCatalog: CatalogEntry = {
  id: 'close',
  fields: [
    {
      name: 'apiKey',
      label: 'Clé d’API',
      kind: 'secret',
      help: 'La clé agit au nom de votre compte Close ; Leon ne fait que lire. Sont lus : les notes, les appels (avec leur transcription), les e-mails, les SMS et les messages WhatsApp des fiches que ce compte peut voir. Une note modifiée après sa création n’est pas relue.',
    },
  ],
  keyHelp: 'Dans Close : Réglages › Développeur › Clés d’API › créez une clé, puis copiez-la.',
  docsUrl: 'https://developer.close.com/api/overview/api-key-authentication',
  triedForReal: false,
  en: {
    fields: {
      apiKey: {
        label: 'API key',
        help: 'The key acts on behalf of your Close account; Leon only reads. It reads the notes, calls (with their transcripts), emails, SMS, and WhatsApp messages of the leads this account can see. A note edited after it was created is not read again.',
      },
    },
    keyHelp: 'In Close: Settings › Developer › API Keys › create a key, then copy it.',
  },
};
