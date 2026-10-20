// Ce que la page d'accueil montre avant toute recherche : des recherches à essayer et l'aide des filtres. Les
// filtres qu'elles écrivent sont ceux que `parseQuery` lit : search-filters.test.ts vérifie que chacun est reconnu,
// pour qu'un renommage d'outil ou de type ne laisse pas un exemple qui ne filtre plus rien.

// Des recherches qui montrent la syntaxe des filtres sans supposer un nom ni un outil branché.
export const EXAMPLES = [
  { q: 'outil:github type:ticket', hint: 'Les tickets GitHub, les plus récents d’abord' },
  { q: 'type:réunion depuis:7j', hint: 'Les réunions de la semaine' },
  { q: '"renouvellement du contrat"', hint: 'Les mots exacts d’une phrase' },
  { q: 'budget depuis:3m', hint: 'Un sujet, sur les trois derniers mois' },
] as const;

export const SYNTAX = [
  { code: 'de:julie', text: 'ce qu’une personne a écrit (son nom ou son e-mail)' },
  { code: 'outil:github', text: 'un seul outil' },
  {
    code: 'type:réunion',
    text: 'une sorte de source : ticket, page, mail, fichier, conversation…',
  },
  { code: 'depuis:7j', text: 'les 7 derniers jours (j), semaines (s) ou mois (m)' },
  { code: 'avant:2026-10-01', text: 'avant une date' },
  { code: '"phrase exacte"', text: 'les mots tels quels, dans cet ordre' },
] as const;
