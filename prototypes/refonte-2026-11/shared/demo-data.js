// Données de démonstration communes aux deux maquettes (version A et version B).
// Tout est fictif : les sociétés, les personnes, les dates. Chaque écran qui les montre porte « Fictional example ».
// Les mots entre ** ** sont le passage que Leon a trouvé : à surligner dans l'original.
// Les deux versions lisent le même fichier : on compare le design, pas le contenu.
window.LEON_DEMO = {
  today: 'Tuesday, November 10, 2026',
  workspace: { name: 'Kestrel Studio', people: 38 },

  // Qui pose la question (la démo des droits change de personne).
  people: {
    julie: { name: 'Julie Martin', role: 'Account lead', initials: 'JM' },
    karim: { name: 'Karim Benali', role: 'Sales', initials: 'KB' },
    sophie: { name: 'Sophie Laurent', role: 'Project manager', initials: 'SL' },
    thomas: { name: 'Thomas Girard', role: 'Engineer (left Oct 17)', initials: 'TG' },
    maya: { name: 'Maya Chen', role: 'Support', initials: 'MC' },
  },

  // Les quatre questions de la démo principale. « segments » : chaque morceau de la réponse et ses renvois.
  scenarios: [
    {
      id: 'commitment',
      label: 'A client commitment',
      askedBy: 'julie',
      query: 'What did we promise ACME for V2?',
      segments: [
        { text: 'At the Oct 3 monthly check-in, Julie committed to delivering V2 on Nov 15', cites: [1] },
        { text: 'The signed quote confirms the date but excludes the data migration', cites: [2] },
        { text: 'The migration ticket is still open', cites: [3] },
      ],
      sources: [
        {
          n: 1, tool: 'granola', toolLabel: 'Granola', kind: 'Meeting', title: 'ACME monthly check-in',
          author: 'Julie Martin', date: 'Oct 3, 2026', visibility: 'team',
          passage: '“We can **commit to November 15** for V2, history migration excluded.”',
          original: {
            type: 'meeting', meta: 'Oct 3, 2026 · 42 min · Julie Martin, Karim Benali, Dana Whitfield (ACME)',
            lines: [
              { who: 'Dana Whitfield (ACME)', at: '14:02', text: 'Our board meets on the 20th. We need V2 live before that.' },
              { who: 'Julie Martin', at: '14:31', text: 'We can **commit to November 15** for V2, history migration excluded.', hit: true },
              { who: 'Dana Whitfield (ACME)', at: '15:10', text: 'Fine for the date. Send me a number for the migration.' },
              { who: 'Karim Benali', at: '15:26', text: 'I’ll quote the migration separately this week.' },
            ],
          },
        },
        {
          n: 2, tool: 'hubspot', toolLabel: 'HubSpot', kind: 'Note', title: 'Signed V2 quote',
          author: 'Karim Benali', date: 'Oct 7, 2026', visibility: 'team',
          passage: 'Delivery on **11/15/2026**. The **data migration** is quoted separately.',
          original: {
            type: 'note', meta: 'Deal: ACME · V2 build · Note by Karim Benali · Oct 7, 2026',
            body: [
              'Quote Q-2291 signed by Dana Whitfield this morning.',
              'Delivery on **11/15/2026**. The **data migration** is quoted separately (Q-2294, not signed yet).',
              'Next step: kickoff with Sophie on Oct 9.',
            ],
          },
        },
        {
          n: 3, tool: 'linear', toolLabel: 'Linear', kind: 'Ticket', title: 'ACME: data migration',
          author: 'Sophie Laurent', date: 'Oct 21, 2026', visibility: 'team',
          passage: 'Blocked on the client’s **export file**. Status: Todo.',
          original: {
            type: 'ticket', meta: 'ACM-214 · Todo · High · Assigned to Sophie Laurent',
            body: [
              'Import the 2019–2025 order history into V2.',
              'Blocked on the client’s **export file**. Dana to send it by Oct 28.',
            ],
          },
        },
      ],
    },
    {
      id: 'bug',
      label: 'A known bug',
      askedBy: 'maya',
      query: 'Is this PDF export bug already known?',
      segments: [
        { text: 'Yes. Three customers have reported it since Monday', cites: [1] },
        { text: 'Engineering reproduced it on invoices longer than 50 lines', cites: [2] },
        { text: 'The fix is in review', cites: [3] },
      ],
      sources: [
        {
          n: 1, tool: 'intercom', toolLabel: 'Intercom', kind: 'Conversation', title: 'Empty PDF export',
          author: 'Support', date: 'Oct 20, 2026', visibility: 'team',
          passage: 'The customer gets a **blank PDF** when exporting the October invoice.',
          original: {
            type: 'conversation', meta: 'Nordia · Lena Brandt · Oct 20, 2026 · Open',
            lines: [
              { who: 'Lena Brandt (Nordia)', at: '09:12', text: 'When I export the October invoice I get a **blank PDF**.', hit: true },
              { who: 'Maya Chen', at: '09:15', text: 'Thanks, Lena. How many lines does that invoice have?' },
              { who: 'Lena Brandt (Nordia)', at: '09:16', text: 'About eighty.' },
            ],
          },
        },
        {
          n: 2, tool: 'linear', toolLabel: 'Linear', kind: 'Ticket', title: 'PDF export: blank page past 50 lines',
          author: 'Thomas Girard', date: 'Oct 21, 2026', visibility: 'team',
          passage: 'Reproduced: **past 50 lines**, rendering stops without an error.',
          original: {
            type: 'ticket', meta: 'EXP-482 · In review · Urgent · Assigned to Thomas Girard',
            body: [
              'Reproduced: **past 50 lines**, rendering stops without an error.',
              'Three customers affected so far: Nordia, Verlant, ACME.',
            ],
          },
        },
        {
          n: 3, tool: 'github', toolLabel: 'GitHub', kind: 'Pull request', title: 'fix(export): paginate PDF rendering',
          author: 'Thomas Girard', date: 'Oct 22, 2026', visibility: 'team',
          passage: 'Renders **page by page** instead of in one pass. Review requested.',
          original: {
            type: 'pr', meta: 'kestrel/app · #482 · Review requested · 4 files changed',
            body: [
              'Renders **page by page** instead of in one pass.',
              'Adds a test with a 120-line invoice.',
            ],
          },
        },
      ],
    },
    {
      id: 'departure',
      label: 'A departure',
      askedBy: 'sophie',
      query: 'What was Thomas working on before he left?',
      segments: [
        { text: 'Thomas left two open items: the Nordia dashboard redesign, due at the end of November', cites: [1] },
        { text: 'and a revised quote for Verlant, promised for last week', cites: [2] },
        { text: 'His handover notes are in Notion', cites: [3] },
      ],
      sources: [
        {
          n: 1, tool: 'asana', toolLabel: 'Asana', kind: 'Task', title: 'Nordia: dashboard redesign',
          author: 'Thomas Girard', date: 'Oct 14, 2026', visibility: 'team',
          passage: 'Due **Nov 28**. Mockups approved by the client on Oct 9.',
          original: {
            type: 'task', meta: 'Project: Nordia · Assigned to Thomas Girard · In progress',
            body: ['Due **Nov 28**. Mockups approved by the client on Oct 9.', 'Remaining: the export view and the mobile layout.'],
          },
        },
        {
          n: 2, tool: 'fireflies', toolLabel: 'Fireflies', kind: 'Meeting', title: 'Verlant: quote review',
          author: 'Thomas Girard', date: 'Oct 10, 2026', visibility: 'team',
          passage: '“I’ll **send you the revised quote** by the end of next week.”',
          original: {
            type: 'meeting', meta: 'Oct 10, 2026 · 28 min · Thomas Girard, Karim Benali, Ines Roche (Verlant)',
            lines: [
              { who: 'Ines Roche (Verlant)', at: '21:40', text: 'The second phase is too expensive as quoted.' },
              { who: 'Thomas Girard', at: '22:05', text: 'I’ll **send you the revised quote** by the end of next week.', hit: true },
            ],
          },
        },
        {
          n: 3, tool: 'notion', toolLabel: 'Notion', kind: 'Page', title: 'Handover: Thomas’s accounts',
          author: 'Thomas Girard', date: 'Oct 17, 2026', visibility: 'team',
          passage: 'Contacts, access and **open items**, account by account.',
          original: {
            type: 'page', meta: 'Team wiki · Handovers · Last edited Oct 17, 2026',
            body: ['Contacts, access and **open items**, account by account.', 'Nordia: redesign in progress. Verlant: revised quote not sent.'],
          },
        },
      ],
    },
    {
      id: 'unknown',
      label: 'No source',
      askedBy: 'karim',
      unknown: true,
      query: 'What price did we give Verlant in 2024?',
      segments: [
        { text: 'I don’t know. No source on record mentions a price agreed with Verlant in 2024', cites: [] },
        { text: 'The earliest quote on record dates from March 2025', cites: [1] },
      ],
      sources: [
        {
          n: 1, tool: 'pipedrive', toolLabel: 'Pipedrive', kind: 'Note', title: 'Verlant: first quote',
          author: 'Karim Benali', date: 'Mar 12, 2025', visibility: 'team',
          passage: 'First quote sent at **list price**, no discount.',
          original: {
            type: 'note', meta: 'Deal: Verlant · Phase 1 · Note by Karim Benali · Mar 12, 2025',
            body: ['First quote sent at **list price**, no discount.'],
          },
        },
      ],
    },
  ],

  // La démo des droits : la même question, posée par deux personnes. Le mail de Julie reste à Julie.
  permissions: {
    query: 'Did ACME accept the new migration date?',
    views: [
      {
        askedBy: 'julie',
        segments: [
          { text: 'Yes. Dana Whitfield accepted December 2 by email on Oct 27', cites: [1] },
          { text: 'The ticket was updated the same day', cites: [2] },
        ],
        sources: [
          {
            n: 1, tool: 'outlook', toolLabel: 'Outlook', kind: 'Email', title: 'Re: V2 timeline',
            author: 'Dana Whitfield', date: 'Oct 27, 2026', visibility: 'private',
            passage: '“**December 2 works for us**, as long as V2 itself ships on the 15th.”',
            original: {
              type: 'email', meta: 'From Dana Whitfield (ACME) · To Julie Martin · Oct 27, 2026, 16:48',
              body: ['Hi Julie,', '**December 2 works for us**, as long as V2 itself ships on the 15th.', 'Dana'],
            },
          },
          {
            n: 2, tool: 'linear', toolLabel: 'Linear', kind: 'Ticket', title: 'ACME: data migration',
            author: 'Sophie Laurent', date: 'Oct 27, 2026', visibility: 'team',
            passage: 'Migration **moved to Dec 2**.',
            original: { type: 'ticket', meta: 'ACM-214 · Todo · High · Assigned to Sophie Laurent', body: ['Migration **moved to Dec 2**.'] },
          },
        ],
      },
      {
        askedBy: 'sophie',
        segments: [
          { text: 'The ticket says the migration moved to December 2', cites: [1] },
          { text: 'Nothing you can access records ACME’s agreement', cites: [] },
        ],
        sources: [
          {
            n: 1, tool: 'linear', toolLabel: 'Linear', kind: 'Ticket', title: 'ACME: data migration',
            author: 'Sophie Laurent', date: 'Oct 27, 2026', visibility: 'team',
            passage: 'Migration **moved to Dec 2**.',
            original: { type: 'ticket', meta: 'ACM-214 · Todo · High · Assigned to Sophie Laurent', body: ['Migration **moved to Dec 2**.'] },
          },
        ],
      },
    ],
  },

  // Le point du matin de Julie (dans l'appli et, en petit, sur le site).
  briefing: {
    time: '08:45',
    sections: [
      { title: 'What you did', items: ['Replied to ACME about the V2 timeline.', 'Reviewed the Nordia redesign mockups.'] },
      { title: 'What changed', items: ['Sophie moved the ACME data migration to Dec 2.', 'Two new support conversations mention the PDF export bug.'] },
      { title: 'Still open', items: ['The revised Verlant quote, promised on Oct 10.'] },
    ],
  },

  // L'appli : les discussions récentes de Julie.
  discussions: [
    { title: 'What did we promise ACME for V2?', date: 'Today' },
    { title: 'Did ACME accept the new migration date?', date: 'Yesterday' },
    { title: 'Who owns the Verlant account now?', date: 'Nov 6' },
    { title: 'Summary of the Nordia redesign feedback', date: 'Nov 4' },
    { title: 'What did we decide about the Q1 pricing?', date: 'Oct 30' },
  ],

  // L'appli : les outils branchés chez Kestrel Studio. « private » : visible seulement de la personne qui l'a branché.
  connections: [
    { tool: 'gmail', label: 'Gmail', account: 'julie@kestrel.example', scope: 'private', state: 'ok', synced: '4 min ago', items: 1842 },
    { tool: 'slack', label: 'Slack', account: 'Kestrel Studio', scope: 'private', state: 'ok', synced: '4 min ago', items: 9310 },
    { tool: 'notion', label: 'Notion', account: 'Team wiki', scope: 'team', state: 'ok', synced: '11 min ago', items: 624 },
    { tool: 'linear', label: 'Linear', account: 'Kestrel', scope: 'team', state: 'ok', synced: '11 min ago', items: 2207 },
    { tool: 'github', label: 'GitHub', account: 'kestrel/app, kestrel/site', scope: 'team', state: 'ok', synced: '2 min ago', items: 3981 },
    { tool: 'hubspot', label: 'HubSpot', account: 'Sales pipeline', scope: 'team', state: 'ok', synced: '9 min ago', items: 512 },
    { tool: 'granola', label: 'Granola', account: 'Julie Martin', scope: 'team', state: 'ok', synced: '14 min ago', items: 96 },
    { tool: 'intercom', label: 'Intercom', account: 'Support inbox', scope: 'team', state: 'error', synced: '2 days ago', items: 1470, note: 'The key was revoked. Reconnect to resume.' },
  ],

  // Pour les développeurs : ce que l'agent de code reçoit au démarrage d'une session (fictif, au format réel).
  agentContext: {
    repo: 'github.com/kestrel/app',
    person: { name: 'Noa Levi', role: 'Engineer', initials: 'NL' },
    tools: ['Claude Code', 'Codex', 'Cursor', 'Antigravity'],
    sessions: [
      { when: 'Nov 9, 21:02', tool: 'Claude Code', branch: 'fix/export-pagination', what: 'PR #482 updated' },
      { when: 'Nov 9, 16:07', tool: 'Codex', branch: 'fix/export-pagination', what: 'bug reproduced' },
      { when: 'Nov 6, 11:40', tool: 'Cursor', branch: 'nordia/dashboard', what: 'mobile layout left' },
    ],
    briefing: {
      items: [
        { text: 'Answered the review on PR #482.', cites: [1] },
        { text: 'Two new support conversations mention the export bug.', cites: [2] },
        { text: 'ACME data migration moved to Dec 2.', cites: [3] },
      ],
      sources: [
        { n: 1, tool: 'claude-code', toolLabel: 'Claude Code', title: 'PDF export pagination', date: 'Nov 9' },
        { n: 2, tool: 'intercom', toolLabel: 'Intercom', title: 'Empty PDF export', date: 'Nov 9' },
        { n: 3, tool: 'linear', toolLabel: 'Linear', title: 'ACME: data migration', date: 'Oct 27' },
      ],
    },
  },

  // Le catalogue : 42 connecteurs, par famille (les fichiers sont dans ../shared/logos/<tool>.svg).
  catalogue: [
    { family: 'Email, chat and files', tools: [['gmail', 'Gmail'], ['outlook', 'Outlook'], ['slack', 'Slack'], ['drive', 'Google Drive']] },
    { family: 'Meetings', tools: [['granola', 'Granola'], ['fathom', 'Fathom'], ['fireflies', 'Fireflies'], ['tldv', 'tl;dv'], ['circleback', 'Circleback'], ['claap', 'Claap'], ['leexi', 'Leexi'], ['gong', 'Gong']] },
    { family: 'Projects and docs', tools: [['notion', 'Notion'], ['jira', 'Jira'], ['confluence', 'Confluence'], ['asana', 'Asana'], ['clickup', 'ClickUp'], ['trello', 'Trello'], ['monday', 'monday.com'], ['shortcut', 'Shortcut'], ['plane', 'Plane'], ['airtable', 'Airtable'], ['basecamp', 'Basecamp'], ['miro', 'Miro'], ['productboard', 'Productboard']] },
    { family: 'Engineering', tools: [['github', 'GitHub'], ['gitlab', 'GitLab'], ['linear', 'Linear'], ['sentry', 'Sentry']] },
    { family: 'CRM', tools: [['hubspot', 'HubSpot'], ['attio', 'Attio'], ['folk', 'folk'], ['pipedrive', 'Pipedrive'], ['close', 'Close']] },
    { family: 'Support', tools: [['intercom', 'Intercom'], ['zendesk', 'Zendesk'], ['freshdesk', 'Freshdesk'], ['helpscout', 'Help Scout'], ['front', 'Front'], ['plain', 'Plain'], ['crisp', 'Crisp'], ['missive', 'Missive']] },
  ],
};
