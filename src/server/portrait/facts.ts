import { ownText } from './own-text';

// Les faits d'une personne d'après ses mails envoyés, calculés sans modèle : à qui elle écrit, quand, comment. Une
// fonction pure, un objet sérialisable en JSON. Chaque chiffre porte le nombre de mails sur lequel il repose, et ce
// qui ne se calcule pas vaut null : rien n'est deviné.

export type SentMail = {
  sentAt: Date;
  to: string[];
  cc: string[];
  // Le texte entier du mail, citations et signature comprises.
  text: string;
  // Si ce mail répond à un mail reçu (celui qui le précède dans le fil) : la date de ce mail reçu.
  repliesToAt: Date | null;
};

type Side = 'interne' | 'externe';
type Register = 'tutoiement' | 'vouvoiement';
// « autre » : une autre langue. « inconnue » : un texte trop court pour le dire.
type Lang = 'fr' | 'en' | 'autre' | 'inconnue';
type Formule = { formule: string; mails: number };

type Interlocuteur = {
  adresse: string;
  // Mails où l'adresse est en « à », et mails où elle n'est qu'en copie.
  a: number;
  copie: number;
  dernier: string;
  type: Side | null;
  // Le registre qui l'emporte, et les mails comptés pour chacun (en français, à elle seule, sans copie).
  registre: Register | null;
  tutoiement: number;
  vouvoiement: number;
};

type Style = {
  mails: number;
  // `mails` : ceux où elle a écrit quelque chose (un transfert sans un mot n'a pas de longueur).
  mots: { mediane: number | null; mails: number };
  appels: Formule[];
  politesses: Formule[];
  // Les parts, de 0 à 1, parmi les `mails` où un registre se lit.
  registre: { tutoiement: number | null; vouvoiement: number | null; mails: number };
};

export type PortraitFacts = {
  // Les mails qu'elle a écrits. `automatiques` : ceux écartés parce qu'un outil les envoie de son compte.
  mails: number;
  automatiques: number;
  periode: { debut: string; fin: string } | null;
  mailsParSemaine: number | null;
  langues: Record<Lang, number>;
  interlocuteurs: Interlocuteur[];
  // `tous` : tous ses mails. Sans les domaines de la société, lui seul est rempli.
  style: Record<Side | 'tous', Style>;
  // Entre un mail reçu et la réponse qui le suit dans le fil, selon le type des destinataires de la réponse.
  delaiReponse: Record<Side | 'tous', { medianeMinutes: number | null; reponses: number }>;
  // Mails envoyés par heure (0 à 23) et par jour (lundi d'abord), dans le fuseau demandé.
  heures: number[];
  jours: number[];
  signature: { texte: string; mails: number } | null;
};

const INTERLOCUTEURS_MAX = 30;
const FORMULES_MAX = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const setOf = (words: string) => new Set(words.split(' '));

// Les messageries grand public : jamais le domaine d'une société.
const PUBLIC_DOMAINS = setOf(
  'gmail.com googlemail.com outlook.com outlook.fr hotmail.com hotmail.fr live.com live.fr msn.com yahoo.com ' +
    'yahoo.fr ymail.com icloud.com me.com mac.com orange.fr wanadoo.fr free.fr sfr.fr neuf.fr bbox.fr laposte.net ' +
    'aol.com gmx.com gmx.fr proton.me protonmail.com',
);

const domainOf = (address: string) => address.slice(address.lastIndexOf('@') + 1).toLowerCase();
const unique = (addresses: string[]) => [...new Set(addresses.map((one) => one.toLowerCase()))];

// Les domaines d'une société d'après les adresses de ses membres.
export function companyDomains(addresses: string[]): string[] {
  const domains = addresses.filter((address) => address.includes('@')).map(domainOf);
  return [...new Set(domains)].filter((domain) => !PUBLIC_DOMAINS.has(domain)).sort();
}

// Les mots les plus courants de chaque langue, sans ceux que d'autres langues partagent (« de », « la », « que », « in »)
// ni ceux qu'un mail en français emprunte (« hello », « best »). Une élision compte : « j », « qu », « c ».
// shortcut: les marques du tutoiement y sont (« Tu viens ? » n'a pas d'autre mot courant), alors que l'espagnol et
// l'italien disent aussi « tu » : un mail qui tutoie dans ces langues peut passer pour du français, à resserrer si de
// vraies fiches le montrent. « te » reste dehors : le néerlandais et l'espagnol l'emploient à chaque phrase.
const FRENCH = setOf(
  'à au aux avec bien bonjour c ce cette cordialement d dans demain des du est et fait j je l les merci moi n ' +
    'nous notre oui pas peux plus pour qu qui sont suis sur ta tes toi ton très tu une vos votre vous ça',
);
const ENGLISH = setOf(
  'and are be can do for from have i if is it know let my not of our please regards thank thanks that the this ' +
    'to was we will with would you your',
);

// La langue qui a le plus de mots courants dans le texte, s'ils font au moins un mot sur dix. Sinon « autre », ou
// « inconnue » sous dix mots : « Ok » ou « Ci-joint le contrat signé. » ne disent pas une langue étrangère.
function languageOf(text: string): Lang {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const french = words.filter((word) => FRENCH.has(word)).length;
  const english = words.filter((word) => ENGLISH.has(word)).length;
  if (french === english || Math.max(french, english) * 10 < words.length)
    return words.length < 10 ? 'inconnue' : 'autre';
  return french > english ? 'fr' : 'en';
}

// Les marques, en mots entiers : « côte » ne tutoie pas, un « rendez-vous » ne vouvoie pas.
const TU = /(?<![\p{L}\p{N}])(?:(?:tu|te|toi|ton|ta|tes)(?![\p{L}\p{N}])|t['’])/iu;
const VOUS = /(?<![\p{L}\p{N}]|rendez-)(?:vous|votre|vos)(?![\p{L}\p{N}])/iu;

// Le registre d'un texte en français ; null sans marque, ou avec les deux.
function registerOf(text: string): Register | null {
  const tu = TU.test(text);
  if (tu === VOUS.test(text)) return null;
  return tu ? 'tutoiement' : 'vouvoiement';
}

// Les formules reconnues. Une formule d'appel ouvre la première ligne : ce qui la suit (le prénom) n'est pas gardé.
// Une formule de politesse est une ligne entière de la fin du mail.
// shortcut: une formule hors de ces listes n'est pas comptée, à compléter quand de vraies fiches en montrent d'autres.
const GREETINGS = [
  'bonjour à toutes et à tous',
  'bonjour à tous',
  'bonjour à toutes',
  'bonjour madame',
  'bonjour monsieur',
  'madame, monsieur',
  'bonjour',
  'bonsoir',
  'salut',
  'coucou',
  'hello',
  'hi',
  'hey',
  'dear',
  'cher',
  'chère',
  'chers',
  'madame',
  'monsieur',
  'good morning',
].sort((a, b) => b.length - a.length); // la plus longue d'abord : « bonjour à tous » avant « bonjour »
const GREETING = new RegExp(`^(?:${GREETINGS.join('|')})(?!\\p{L})`, 'iu');
const CLOSINGS = new Set([
  'cordialement',
  'bien cordialement',
  'très cordialement',
  'bien à vous',
  'bien à toi',
  'bonne journée',
  'belle journée',
  'bonne fin de journée',
  'bonne soirée',
  'bonne semaine',
  'bon week-end',
  'à bientôt',
  'à très vite',
  'à demain',
  'à plus',
  'bises',
  'amicalement',
  'amitiés',
  'salutations',
  'sincères salutations',
  'merci',
  'merci beaucoup',
  "merci d'avance",
  'merci par avance',
  'best',
  'best regards',
  'kind regards',
  'regards',
  'thanks',
  'many thanks',
  'thank you',
  'cheers',
  'sincerely',
]);
// Les dernières lignes où se cherche la formule de politesse : sous elle, il reste parfois un prénom.
const CLOSING_LINES = 3;

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function greetingOf(line: string | undefined): string | null {
  const found = GREETING.exec(line ?? '')?.[0];
  return found ? capitalized(found.toLowerCase()) : null;
}

function closingOf(line: string | undefined): string | null {
  const formula = (line ?? '')
    .toLowerCase()
    .replaceAll('’', "'")
    .replace(/[\s,.!]+$/, '');
  return CLOSINGS.has(formula) ? capitalized(formula) : null;
}

const linesOf = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

// Les valeurs les plus fréquentes et leur nombre, la plus fréquente d'abord.
function mostFrequent(values: string[], max: number): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);
}

// Une signature sans séparateur : le bloc de fin que plus de la moitié des mails portent à l'identique, dans
// ENDING_MIN_MAILS mails au moins, sur ENDING_MAX_LINES lignes au plus. Il s'arrête sous une formule de politesse
// connue, qui reste du texte. Un bloc plus long n'est jamais plus partagé qu'un plus court : la recherche s'arrête au
// premier qui ne l'est plus assez.
// shortcut: une fin que la personne répète sans que ce soit sa signature (une phrase type, une formule hors de la liste)
// est prise pour elle, à resserrer si de vraies fiches le montrent.
const ENDING_MIN_MAILS = 5;
const ENDING_MAX_LINES = 8;

function repeatedEnding(mails: string[][]): string[] {
  let ending: string[] = [];
  for (let size = 1; size <= ENDING_MAX_LINES; size++) {
    const blocks = mails
      .filter((lines) => lines.length >= size && closingOf(lines.at(-size)) === null)
      .map((lines) => lines.slice(-size).join('\n'));
    const [block, count = 0] = mostFrequent(blocks, 1)[0] ?? [];
    if (!block || count < ENDING_MIN_MAILS || count * 2 <= mails.length) break;
    ending = block.split('\n');
  }
  return ending;
}

function median(values: number[]): number | null {
  const sorted = values.toSorted((a, b) => a - b);
  // Les deux valeurs du milieu : la même quand le nombre est impair.
  const low = sorted[(sorted.length - 1) >> 1];
  const high = sorted[sorted.length >> 1];
  return low === undefined || high === undefined ? null : (low + high) / 2;
}

const share = (part: number, whole: number) =>
  whole === 0 ? null : Math.round((part / whole) * 100) / 100;

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Un envoi automatique part du compte de la personne sans qu'elle l'ait écrit (la notification d'un outil, une fiche
// transférée par une automatisation) : les mêmes lignes « Libellé : valeur », aux mêmes destinataires, AUTO_MIN_MAILS
// fois ou plus. Vu sur une vraie boîte : sept mails « envoyés » sur dix étaient de ceux-là.
// shortcut: seul ce gabarit à libellés est reconnu, pas une notification en phrases, à étendre si de vraies fiches
// en montrent.
const AUTO_MIN_MAILS = 5;
const AUTO_MIN_LABELS = 3;
function templateOf(mail: SentMail): string | null {
  const labels = linesOf(mail.text).flatMap((line) => /^([^:]{1,40}):\s*\S/.exec(line)?.[1] ?? []);
  return labels.length < AUTO_MIN_LABELS
    ? null
    : [...unique([...mail.to, ...mail.cc]).sort(), ...labels].join('\n');
}

// `domains` : les domaines de la société (companyDomains). Sans eux, personne n'est dit interne ni externe.
// `timeZone` : le fuseau des heures et des jours d'envoi, « Europe/Paris ».
export function computeFacts(
  sent: SentMail[],
  options: { domains: string[]; timeZone: string },
): PortraitFacts {
  const templates = sent.map(templateOf);
  const sameTemplate = new Map<string, number>();
  for (const one of templates) if (one) sameTemplate.set(one, (sameTemplate.get(one) ?? 0) + 1);
  const mails = sent.filter(
    (_, index) => (sameTemplate.get(templates[index] ?? '') ?? 0) < AUTO_MIN_MAILS,
  );
  const company = new Set(
    options.domains.map((one) => one.toLowerCase()).filter((one) => !PUBLIC_DOMAINS.has(one)),
  );
  const sideOf = (addresses: string[]): Side | null =>
    company.size === 0 || addresses.length === 0
      ? null
      : addresses.every((address) => company.has(domainOf(address)))
        ? 'interne'
        : 'externe';
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: options.timeZone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  });

  const own = mails.map((mail) => ownText(mail.text));
  const lined = own.map(({ text }) => linesOf(text));
  const ending = repeatedEnding(lined);
  // Une ligne que plusieurs mails répètent au caractère près n'a pas été tapée pour ce destinataire : la mention
  // légale d'une seconde signature dit « vous » à tout le monde. Le registre ne s'y lit pas, sauf dans une formule de
  // politesse (« Bien à toi »).
  // shortcut: une courte phrase tapée à l'identique dans ENDING_MIN_MAILS mails (« Merci à toi ») perd sa marque, à
  // resserrer si de vraies fiches le montrent.
  const repeats = new Map<string, number>();
  for (const lines of lined)
    for (const line of new Set(lines)) repeats.set(line, (repeats.get(line) ?? 0) + 1);
  const typed = (line: string) =>
    (repeats.get(line) ?? 0) < ENDING_MIN_MAILS || closingOf(line) !== null;
  const read = mails.map((mail, index) => {
    const all = lined[index] ?? [];
    const signed = ending.length > 0 && all.slice(-ending.length).join('\n') === ending.join('\n');
    const lines = signed ? all.slice(0, -ending.length) : all;
    const text = lines.join('\n');
    // Chaque adresse une fois par mail : en « à » si elle y est, sinon en copie.
    const to = unique(mail.to);
    const cc = unique(mail.cc).filter((address) => !to.includes(address));
    const lang = languageOf(text);
    return {
      mail,
      to,
      cc,
      lang,
      // Un mail que lit une personne de l'extérieur, même en copie, est écrit pour l'extérieur.
      side: sideOf([...to, ...cc]),
      // Un signe de ponctuation isolé (« ? », « : », un guillemet) n'est pas un mot.
      words: text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length,
      greeting: greetingOf(lines[0]),
      closing: lines.slice(-CLOSING_LINES).reverse().map(closingOf).find(Boolean) ?? null,
      // Un « vous » adressé à plusieurs personnes peut être un pluriel : le registre ne se lit qu'à une seule.
      register:
        lang === 'fr' && to.length === 1 && cc.length === 0
          ? registerOf(lines.filter(typed).join('\n'))
          : null,
      signature: own[index]?.signature ?? (signed ? ending.join('\n') : null),
    };
  });

  const people = new Map<string, Omit<Interlocuteur, 'adresse' | 'type' | 'registre'>>();
  const heures = new Array<number>(24).fill(0);
  const jours = new Array<number>(7).fill(0);
  const langues: Record<Lang, number> = { fr: 0, en: 0, autre: 0, inconnue: 0 };
  for (const { mail, to, cc, lang, register } of read) {
    const at = mail.sentAt.toISOString(); // l'ordre alphabétique de ces dates est celui du temps
    for (const address of [...to, ...cc]) {
      const person = people.get(address) ?? {
        a: 0,
        copie: 0,
        dernier: at,
        tutoiement: 0,
        vouvoiement: 0,
      };
      person[to.includes(address) ? 'a' : 'copie'] += 1;
      if (at > person.dernier) person.dernier = at;
      if (register) person[register] += 1; // un registre ne se lit que pour un destinataire seul
      people.set(address, person);
    }
    const parts = Object.fromEntries(
      clock.formatToParts(mail.sentAt).map((p) => [p.type, p.value]),
    );
    const hour = Number(parts.hour);
    const day = WEEK_DAYS.indexOf(parts.weekday ?? '');
    heures[hour] = (heures[hour] ?? 0) + 1;
    jours[day] = (jours[day] ?? 0) + 1;
    langues[lang] += 1;
  }

  const formulas = (values: (string | null)[]): Formule[] =>
    mostFrequent(
      values.filter((value) => value !== null),
      FORMULES_MAX,
    ).map(([formule, count]) => ({ formule, mails: count }));
  const styleOf = (side: Side | null): Style => {
    const ofSide = read.filter((one) => side === null || one.side === side);
    const words = ofSide.map((one) => one.words).filter((count) => count > 0);
    const registers = ofSide.flatMap((one) => one.register ?? []);
    const tu = registers.filter((register) => register === 'tutoiement').length;
    return {
      mails: ofSide.length,
      mots: { mediane: median(words), mails: words.length },
      appels: formulas(ofSide.map((one) => one.greeting)),
      politesses: formulas(ofSide.map((one) => one.closing)),
      registre: {
        tutoiement: share(tu, registers.length),
        vouvoiement: share(registers.length - tu, registers.length),
        mails: registers.length,
      },
    };
  };
  const delayOf = (side: Side | null) => {
    const minutes = read.flatMap(({ mail, side: mailSide }) =>
      (side === null || mailSide === side) && mail.repliesToAt && mail.repliesToAt < mail.sentAt
        ? [(mail.sentAt.getTime() - mail.repliesToAt.getTime()) / 60_000]
        : [],
    );
    const middle = median(minutes);
    return {
      medianeMinutes: middle === null ? null : Math.round(middle),
      reponses: minutes.length,
    };
  };

  const times = mails.map((mail) => mail.sentAt.getTime()).sort((a, b) => a - b);
  const first = times[0];
  const last = times.at(-1);
  const [signature] = mostFrequent(
    read.flatMap((one) => one.signature ?? []),
    1,
  );
  return {
    mails: mails.length,
    automatiques: sent.length - mails.length,
    periode:
      first === undefined || last === undefined
        ? null
        : { debut: new Date(first).toISOString(), fin: new Date(last).toISOString() },
    // Sur moins d'une semaine, un rythme par semaine serait une extrapolation.
    mailsParSemaine:
      first === undefined || last === undefined || last - first < WEEK_MS
        ? null
        : Math.round((mails.length / ((last - first) / WEEK_MS)) * 10) / 10,
    langues,
    interlocuteurs: [...people]
      .filter(([, person]) => person.a > 0)
      .map(([adresse, person]) => ({
        adresse,
        ...person,
        type: sideOf([adresse]),
        registre:
          person.tutoiement === person.vouvoiement
            ? null
            : person.tutoiement > person.vouvoiement
              ? ('tutoiement' as const)
              : ('vouvoiement' as const),
      }))
      .sort(
        (x, y) =>
          y.a - x.a || y.dernier.localeCompare(x.dernier) || x.adresse.localeCompare(y.adresse),
      )
      .slice(0, INTERLOCUTEURS_MAX),
    style: { tous: styleOf(null), interne: styleOf('interne'), externe: styleOf('externe') },
    delaiReponse: { tous: delayOf(null), interne: delayOf('interne'), externe: delayOf('externe') },
    heures,
    jours,
    signature: signature ? { texte: signature[0], mails: signature[1] } : null,
  };
}
