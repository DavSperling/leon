// Leon « Papier » v2 : extra fictional data for the app screens (Kestrel Studio, seen by Julie Martin).
// Everything here is invented and stays consistent with ../shared/demo-data.js (same people, dates and tools).
// Load it after demo-data.js. Nothing in the pages needs it to be visible: the HTML carries the same values.
window.LEON_APP = {
  me: { key: 'julie', name: 'Julie Martin', email: 'julie@kestrel.example', title: 'Account lead', role: 'Admin' },
  workspace: { name: 'Kestrel Studio', domain: 'kestrel.example', people: 38, plan: 'Pilot · open beta, no billing yet' },
  profile: { language: 'English', timezone: 'New York (GMT-5)', briefingTime: '08:45' },

  // Home: today's one fact (the first line of "What changed" in the briefing) and the three suggested questions.
  fact: 'Sophie moved the ACME data migration to Dec 2.',
  suggestions: [
    { label: 'What did we promise ACME for V2?', href: 'app-search.html?s=commitment' },
    { label: 'Is this PDF export bug already known?', href: 'app-search.html?s=bug' },
    { label: 'What price did we give Verlant in 2024?', href: 'app-search.html?s=unknown' }, // the "no source" state
  ],

  // Home: the source of each line of LEON_DEMO.briefing, in reading order (line n cites source n), with the record's own
  // words (« passage »; ** ** around what to mark).
  briefingSources: [
    { n: 1, tool: 'gmail', toolLabel: 'Gmail', kind: 'Email', title: 'Re: V2 timeline', author: 'Julie Martin', date: 'Nov 9', visibility: 'private',
      passage: '“Thanks, Dana. **V2 ships on Nov 15 as planned**, and the migration follows on Dec 2.”' },
    { n: 2, tool: 'notion', toolLabel: 'Notion', kind: 'Page', title: 'Nordia: redesign mockups', author: 'Julie Martin', date: 'Nov 9', visibility: 'team',
      passage: 'Comment by Julie Martin: “**Export view and mobile layout look right now.** Ready to show Lena.”' },
    { n: 3, tool: 'linear', toolLabel: 'Linear', kind: 'Ticket', title: 'ACME: data migration', author: 'Sophie Laurent', date: 'Oct 27', visibility: 'team',
      passage: 'Migration **moved to Dec 2**.' },
    { n: 4, tool: 'intercom', toolLabel: 'Intercom', kind: 'Conversation', title: 'Empty PDF export', author: 'Support', date: 'Nov 8', visibility: 'team',
      passage: '“Our November invoice also **exports as a blank PDF**.”' },
    { n: 5, tool: 'granola', toolLabel: 'Granola', kind: 'Meeting', title: 'Verlant: quote review', author: 'Thomas Girard', date: 'Oct 10', visibility: 'team',
      passage: '“I’ll **send you the revised quote** by the end of next week.”' },
  ],

  // Documents: files people uploaded. « type » is the logo file name in ../shared/logos/. « state: reading » = just added.
  documents: [
    { name: 'Verlant phase 2 proposal.pdf', type: 'pdf', size: '640 KB', addedBy: 'Julie Martin', date: 'Today, 08:31', visibility: 'private', state: 'reading' },
    { name: 'My notes: ACME renewal.pdf', type: 'pdf', size: '212 KB', addedBy: 'Julie Martin', date: 'Nov 5', visibility: 'private', state: 'read' },
    { name: 'Q1 2027 pricing grid.xlsx', type: 'excel', size: '88 KB', addedBy: 'Karim Benali', date: 'Oct 29', visibility: 'team', state: 'read' },
    { name: 'V2 statement of work.docx', type: 'word', size: '156 KB', addedBy: 'Sophie Laurent', date: 'Oct 8', visibility: 'team', state: 'read' },
    { name: 'ACME master services agreement.pdf', type: 'pdf', size: '1.2 MB', addedBy: 'Julie Martin', date: 'Oct 2', visibility: 'team', state: 'read' },
    { name: 'Nordia redesign kickoff.pptx', type: 'powerpoint', size: '4.8 MB', addedBy: 'Thomas Girard', date: 'Sep 24', visibility: 'team', state: 'read' },
    { name: 'Support handbook.pdf', type: 'pdf', size: '930 KB', addedBy: 'Maya Chen', date: 'Aug 31', visibility: 'team', state: 'read' },
  ],

  // Team: the 38 members (the nine the demo names first, then the 29 others). Roles as in the product: Owner, Admin,
  // Member; one Owner, three Admins. « manager » is a name of this list, '' for nobody. « status »: active | invited | left.
  members: [
    { name: 'Rachel Stein', email: 'rachel@kestrel.example', title: 'CEO', role: 'Owner', manager: '', status: 'active', statusLabel: 'Active' },
    { name: 'Julie Martin', email: 'julie@kestrel.example', title: 'Account lead', role: 'Admin', manager: 'Rachel Stein', status: 'active', statusLabel: 'Active', you: true },
    { name: 'Daniel Okafor', email: 'daniel@kestrel.example', title: 'Head of engineering', role: 'Admin', manager: 'Rachel Stein', status: 'active', statusLabel: 'Active' },
    { name: 'Sophie Laurent', email: 'sophie@kestrel.example', title: 'Project manager', role: 'Member', manager: 'Rachel Stein', status: 'active', statusLabel: 'Active' },
    { name: 'Karim Benali', email: 'karim@kestrel.example', title: 'Sales', role: 'Member', manager: 'Julie Martin', status: 'active', statusLabel: 'Active' },
    { name: 'Maya Chen', email: 'maya@kestrel.example', title: 'Support', role: 'Member', manager: 'Sophie Laurent', status: 'active', statusLabel: 'Active' },
    { name: 'Noa Levi', email: 'noa@kestrel.example', title: 'Engineer', role: 'Member', manager: 'Daniel Okafor', status: 'active', statusLabel: 'Active' },
    { name: 'Priya Nair', email: 'priya@kestrel.example', title: 'Designer', role: 'Member', manager: 'Sophie Laurent', status: 'invited', statusLabel: 'Invited Nov 6' },
    { name: 'Thomas Girard', email: 'thomas@kestrel.example', title: 'Engineer', role: 'Member', manager: 'Daniel Okafor', status: 'left', statusLabel: 'Left Oct 17' },
    { name: 'Hannah Weiss', email: 'hannah@kestrel.example', title: 'Head of operations', role: 'Admin', manager: 'Rachel Stein', status: 'active', statusLabel: 'Active' },
    { name: 'Clara Jensen', email: 'clara@kestrel.example', title: 'Head of design', role: 'Member', manager: 'Rachel Stein', status: 'active', statusLabel: 'Active' },
    { name: 'Zoe Marchetti', email: 'zoe@kestrel.example', title: 'Marketing lead', role: 'Member', manager: 'Rachel Stein', status: 'active', statusLabel: 'Active' },
    { name: 'Elena Petrova', email: 'elena@kestrel.example', title: 'Engineering manager', role: 'Member', manager: 'Daniel Okafor', status: 'active', statusLabel: 'Active' },
    { name: 'Omar Haddad', email: 'omar@kestrel.example', title: 'DevOps engineer', role: 'Member', manager: 'Daniel Okafor', status: 'active', statusLabel: 'Active' },
    { name: 'Farah Aziz', email: 'farah@kestrel.example', title: 'Data analyst', role: 'Member', manager: 'Daniel Okafor', status: 'active', statusLabel: 'Active' },
    { name: 'Ben Castell', email: 'ben@kestrel.example', title: 'Engineer', role: 'Member', manager: 'Daniel Okafor', status: 'active', statusLabel: 'Active' },
    { name: 'Marcus Hill', email: 'marcus@kestrel.example', title: 'Engineer', role: 'Member', manager: 'Elena Petrova', status: 'active', statusLabel: 'Active' },
    { name: 'Yael Cohen', email: 'yael@kestrel.example', title: 'Engineer', role: 'Member', manager: 'Elena Petrova', status: 'active', statusLabel: 'Active' },
    { name: 'Tomás Rivera', email: 'tomas@kestrel.example', title: 'Engineer', role: 'Member', manager: 'Elena Petrova', status: 'active', statusLabel: 'Active' },
    { name: 'Aisha Rahman', email: 'aisha@kestrel.example', title: 'Engineer', role: 'Member', manager: 'Elena Petrova', status: 'active', statusLabel: 'Active' },
    { name: 'Lin Zhao', email: 'lin@kestrel.example', title: 'QA engineer', role: 'Member', manager: 'Elena Petrova', status: 'active', statusLabel: 'Active' },
    { name: 'Hugo Navarro', email: 'hugo@kestrel.example', title: 'Engineer', role: 'Member', manager: 'Elena Petrova', status: 'invited', statusLabel: 'Invited Nov 9' },
    { name: 'Jonas Meyer', email: 'jonas@kestrel.example', title: 'Designer', role: 'Member', manager: 'Clara Jensen', status: 'active', statusLabel: 'Active' },
    { name: 'Amara Diallo', email: 'amara@kestrel.example', title: 'Designer', role: 'Member', manager: 'Clara Jensen', status: 'active', statusLabel: 'Active' },
    { name: 'Sam Whitaker', email: 'sam@kestrel.example', title: 'UX researcher', role: 'Member', manager: 'Clara Jensen', status: 'active', statusLabel: 'Active' },
    { name: 'Oren Shapiro', email: 'oren@kestrel.example', title: 'Project manager', role: 'Member', manager: 'Sophie Laurent', status: 'active', statusLabel: 'Active' },
    { name: 'Grace Kim', email: 'grace@kestrel.example', title: 'Project manager', role: 'Member', manager: 'Sophie Laurent', status: 'active', statusLabel: 'Active' },
    { name: 'Leo Fontaine', email: 'leo@kestrel.example', title: 'Project coordinator', role: 'Member', manager: 'Sophie Laurent', status: 'active', statusLabel: 'Active' },
    { name: 'Ibrahim Sesay', email: 'ibrahim@kestrel.example', title: 'Support', role: 'Member', manager: 'Sophie Laurent', status: 'active', statusLabel: 'Active' },
    { name: 'Ruth Avraham', email: 'ruth@kestrel.example', title: 'Support', role: 'Member', manager: 'Sophie Laurent', status: 'active', statusLabel: 'Active' },
    { name: 'Nina Alvarez', email: 'nina@kestrel.example', title: 'Account manager', role: 'Member', manager: 'Julie Martin', status: 'active', statusLabel: 'Active' },
    { name: 'Peter Lindqvist', email: 'peter@kestrel.example', title: 'Account manager', role: 'Member', manager: 'Julie Martin', status: 'active', statusLabel: 'Active' },
    { name: 'Tal Mizrahi', email: 'tal@kestrel.example', title: 'Sales', role: 'Member', manager: 'Julie Martin', status: 'active', statusLabel: 'Active' },
    { name: 'Chloe Ward', email: 'chloe@kestrel.example', title: 'Sales', role: 'Member', manager: 'Julie Martin', status: 'active', statusLabel: 'Active' },
    { name: 'Victor Park', email: 'victor@kestrel.example', title: 'Finance', role: 'Member', manager: 'Hannah Weiss', status: 'active', statusLabel: 'Active' },
    { name: 'Mei Tanaka', email: 'mei@kestrel.example', title: 'People and office', role: 'Member', manager: 'Hannah Weiss', status: 'active', statusLabel: 'Active' },
    { name: 'Carlos Mendes', email: 'carlos@kestrel.example', title: 'IT', role: 'Member', manager: 'Hannah Weiss', status: 'active', statusLabel: 'Active' },
    { name: 'Eitan Bar', email: 'eitan@kestrel.example', title: 'Content writer', role: 'Member', manager: 'Zoe Marchetti', status: 'active', statusLabel: 'Active' },
  ],
  inviteLink: 'https://leonmemory.com/join/kestrel-studio/4f9c2e',
  visibilityRule: 'Everyone here can search what a connection’s owner shares with the team. Private connections, uploads marked “Only you” and conversations with AI assistants stay with their owner.',

  // Settings › Assistants and coding tools: Julie's computers, the install command, her personal token.
  computers: [
    { name: 'Julie’s MacBook Air', os: 'macOS', tools: ['Claude Code'], connected: 'Oct 12', lastSession: 'Yesterday, 17:40', sessions: 9 },
    { name: 'Mac mini, home office', os: 'macOS', tools: ['Codex', 'Cursor'], connected: 'Oct 20', lastSession: 'Nov 4', sessions: 3 },
  ],
  codingTools: ['Claude Code', 'Codex', 'Cursor', 'Antigravity'], // compatibility facts; logos exist for claude-code and cursor only
  install: 'curl -fsSL https://leonmemory.com/install | sh',
  installNote: 'One command. It asks which tools to connect and shows what is sent before anything leaves your computer.',
  tokens: [
    { name: 'Assistant on my laptop', shown: 'leon_…7Kc2', created: 'Oct 12', lastUsed: 'Today, 08:12' },
  ],
  // Connections › Add a tool: what Leon reads from each of the 42 connectors (the words of connectors.html).
  reads: {
    gmail: 'Email threads. Promotions, Social, drafts and spam are left out.',
    outlook: 'Inbox, sent items and calendar. Your Microsoft admin approves Leon once for the company.',
    slack: 'The channels you are a member of. Never your direct messages.',
    drive: 'Google documents, presentations and spreadsheets, PDF, Word, Excel, PowerPoint and text files.',
    granola: 'Meeting notes, with their transcript and summary.',
    fathom: 'Meetings the key’s owner recorded or was shared: transcript and summary.',
    fireflies: 'Transcribed meetings the key’s owner has access to.',
    tldv: 'Meetings the key’s owner attended, with their transcript.',
    circleback: 'Meetings of the key’s owner, not those only shared with them.',
    claap: 'The workspace’s recordings, meetings and captures, with their transcript.',
    leexi: 'Calls, with what each speaker said.',
    gong: 'Calls, with their participants and transcript.',
    notion: 'Pages, block by block, and their comments.',
    jira: 'Issues and their comments.',
    confluence: 'Pages and their footer comments.',
    asana: 'Tasks, with their description and comments.',
    clickup: 'Tasks, closed ones included, and their comments.',
    trello: 'Cards on your open boards, with their comments.',
    monday: 'Boards, items and updates, limited to the boards you see.',
    shortcut: 'Stories and their comments.',
    plane: 'Work items and their comments. Archived items and drafts are skipped.',
    airtable: 'Records, with their text and comments.',
    basecamp: 'Messages, documents and comments.',
    miro: 'The text on your boards: sticky notes, shapes, cards, frames and documents. Never images.',
    productboard: 'Notes. Archived notes are skipped.',
    github: 'Issues and pull requests, with comments and reviews, in the team repositories an admin chose.',
    gitlab: 'Issues and merge requests of the 20 most active projects you are a member of.',
    linear: 'Issues and their comments.',
    sentry: 'Issues. Neither stack traces nor event data.',
    hubspot: 'Notes, calls, meetings and emails, with the company, deal or contact they are linked to.',
    attio: 'Notes and comment threads.',
    folk: 'Public notes on contacts and companies. Private notes are not read.',
    pipedrive: 'The notes and activities your account sees.',
    close: 'Notes, calls with their transcripts, emails, SMS and WhatsApp messages of your leads.',
    intercom: 'Conversations, with their messages and internal notes.',
    zendesk: 'Tickets and their comments, internal notes included.',
    freshdesk: 'Tickets, with their replies and internal notes.',
    helpscout: 'Conversations.',
    front: 'Conversations, with their messages and comments. Personal inboxes only if their owner allows it.',
    plain: 'Threads and their messages.',
    crisp: 'The website’s conversations, with their messages and internal notes.',
    missive: 'Team conversations, with their messages and comments. Not your personal email.',
  },

  // Connections › Add a tool: how each of the 42 tools connects, copied from the real catalogue (src/server/connectors).
  // « how »: 'oauth' = one click, then the tool's own sign-in page (the connector has a button); 'key' = a key to paste (the
  // connector has none). « private »: what Leon reads from it stays with whoever connects it (privateRaw) unless they
  // share it; false = visible to the team by default. For a key: « fields » are the product's own (kind: secret | text |
  // select) and « where » says where the key is found. « keyToo »: the product also accepts a pasted key (not shown here).
  connect: {
    gmail: { how: 'oauth', private: true },
    outlook: { how: 'oauth', private: true },
    slack: { how: 'oauth', private: true },
    drive: { how: 'oauth', private: true },
    granola: { how: 'key', private: false, fields: [{ label: 'API key', kind: 'secret', placeholder: 'grn_…' }],
      where: 'In the Granola app: Settings › Connectors › API keys › Create new key, with “Personal notes” and “Public notes” access.' },
    fathom: { how: 'key', private: false, fields: [{ label: 'API key', kind: 'secret' }],
      where: 'In Fathom: User Settings › API Access, then generate a key.' },
    fireflies: { how: 'key', private: false, fields: [{ label: 'API key', kind: 'secret' }],
      where: 'At fireflies.ai: Integrations › Fireflies API, then copy the API key.' },
    tldv: { how: 'key', private: false, fields: [{ label: 'API key', kind: 'secret' }],
      where: 'In tl;dv: Personal settings › API keys (tldv.io/app/settings/personal-settings/api-keys).' },
    circleback: { how: 'key', private: false, fields: [{ label: 'API key', kind: 'secret', placeholder: 'cb_…' }],
      where: 'In Circleback: Settings › API keys, then create a key (it starts with cb_ and is shown only once).' },
    claap: { how: 'key', private: false, fields: [{ label: 'API key', kind: 'secret', placeholder: 'cla_…' }],
      where: 'In Claap, with an admin account: workspace name › Settings › API & Webhooks › API, then Create API key (the key is shown only once).' },
    leexi: { how: 'key', private: false, fields: [{ label: 'Key ID', kind: 'secret' }, { label: 'Key secret', kind: 'secret' }],
      where: 'In Leexi: Settings › Advanced › API keys, “Add” button (admin account required), with the “Read calls” permission.' },
    gong: { how: 'key', private: false, fields: [{ label: 'API subdomain', kind: 'text', placeholder: 'us-12345' }, { label: 'Access key', kind: 'secret' }, { label: 'Access key secret', kind: 'secret' }],
      where: 'In Gong: Admin center › Settings › Ecosystem › API, then “Get API Key”; only a technical administrator can create it, and the secret is shown only once.' },
    notion: { how: 'oauth', private: false, keyToo: true },
    jira: { how: 'oauth', private: false, keyToo: true },
    confluence: { how: 'oauth', private: false, keyToo: true },
    asana: { how: 'oauth', private: false, keyToo: true },
    clickup: { how: 'oauth', private: false, keyToo: true },
    trello: { how: 'key', private: false, fields: [{ label: 'API key', kind: 'text', placeholder: 'Your Power-Up’s key' }, { label: 'Token', kind: 'secret' }],
      where: 'At trello.com/apps/admin: create a Power-Up, generate its API key (authentication tab), then get a read-only token with the link shown under the “Token” field.' },
    monday: { how: 'oauth', private: false, keyToo: true },
    shortcut: { how: 'key', private: false, fields: [{ label: 'API token', kind: 'secret' }],
      where: 'In Shortcut: Settings › Your Account › API Tokens, give the token a name, then click Generate Token. The token belongs to your account and to this workspace.' },
    plane: { how: 'key', private: false, fields: [{ label: 'API key', kind: 'secret', placeholder: 'plane_api_…' }, { label: 'Workspace', kind: 'text', placeholder: 'my-team' }],
      where: 'In Plane: your profile › Profile settings › Personal access tokens › Add personal access token (give it a title and, if you like, an expiration date).' },
    airtable: { how: 'oauth', private: false, keyToo: true },
    basecamp: { how: 'oauth', private: false },
    miro: { how: 'oauth', private: false },
    productboard: { how: 'oauth', private: false },
    github: { how: 'oauth', private: false, keyToo: true },
    gitlab: { how: 'oauth', private: false, keyToo: true },
    linear: { how: 'oauth', private: false, keyToo: true },
    sentry: { how: 'key', private: false, fields: [{ label: 'Internal integration token', kind: 'secret' }, { label: 'Organization', kind: 'text', placeholder: 'acme' }, { label: 'Data region', kind: 'select', options: ['United States (sentry.io)', 'Europe (de.sentry.io)'] }],
      where: 'In Sentry: Settings › Developer Settings › New Internal Integration, with Read access on Issue & Event; the token is shown when the integration is created and doesn’t expire.' },
    hubspot: { how: 'oauth', private: false, keyToo: true },
    attio: { how: 'oauth', private: false, keyToo: true },
    folk: { how: 'key', private: false, fields: [{ label: 'API key', kind: 'secret' }],
      where: 'In folk: workspace settings › API › create an API key, then copy it.' },
    pipedrive: { how: 'key', private: false, fields: [{ label: 'Pipedrive company', kind: 'text', placeholder: 'acme' }, { label: 'Personal API token', kind: 'secret' }],
      where: 'In Pipedrive: your name at the top right › Company settings › Personal preferences › API.' },
    close: { how: 'key', private: false, fields: [{ label: 'API key', kind: 'secret' }],
      where: 'In Close: Settings › Developer › API Keys › create a key, then copy it.' },
    intercom: { how: 'key', private: false, fields: [{ label: 'Access token', kind: 'secret' }, { label: 'Workspace region', kind: 'select', options: ['United States (api.intercom.io)', 'Europe (api.eu.intercom.io)', 'Australia (api.au.intercom.io)'] }],
      where: 'In Intercom: Developer Hub › Your apps › New app (installed in your workspace), then the app’s Authentication page shows the access token to copy.' },
    zendesk: { how: 'key', private: false, fields: [{ label: 'Zendesk subdomain', kind: 'text', placeholder: 'acme' }, { label: 'Admin email', kind: 'text', placeholder: 'first.last@company.com' }, { label: 'Zendesk API token', kind: 'secret' }],
      where: 'In Zendesk Admin Center: Apps and integrations › APIs › Zendesk API › Add API token (token access must be enabled).' },
    freshdesk: { how: 'key', private: false, fields: [{ label: 'Freshdesk domain', kind: 'text', placeholder: 'acme' }, { label: 'API key', kind: 'secret' }],
      where: 'In Freshdesk: your profile picture at the top right › Profile settings, then “View API Key” (you have to solve a captcha).' },
    helpscout: { how: 'oauth', private: false, keyToo: true },
    front: { how: 'key', private: false, fields: [{ label: 'API token', kind: 'secret' }],
      where: 'In Front, an admin opens Settings › Developers › API tokens › Create API token, enables “Access resources”, chooses the shared resources (all the inboxes to read) and the “Read” permission, then copies the token: it is shown only once.' },
    plain: { how: 'key', private: false, fields: [{ label: 'API key', kind: 'secret', placeholder: 'plainApiKey_…' }],
      where: 'In Plain: Settings › Machine users, create a machine user, then add an API key to it with permissions to read threads (thread:read), their messages (timeline:read), and customers (customer:read).' },
    crisp: { how: 'key', private: false, fields: [{ label: 'Website ID', kind: 'text', placeholder: '5d3f2a10-7b44-4c1e-9a30-0b1e6c2d4f01' }, { label: 'Token identifier', kind: 'secret' }, { label: 'Token key', kind: 'secret' }],
      where: 'In Crisp: Settings › Workspace Settings › Advanced configuration › API Token › Generate Token (workspace owner only).' },
    missive: { how: 'key', private: false, fields: [{ label: 'Personal API token', kind: 'secret' }],
      where: 'In Missive: Preferences › API tab › “Create a new token”.' },
  },

  // Chat, Home, the answer: the three discussions the shared data only names (LEON_DEMO.discussions), in the shape of a
  // scenario. A source comes from a connected tool or an uploaded document (« upload: true »: it opens in Documents).
  answers: [
    {
      id: 'verlant', query: 'Who owns the Verlant account now?',
      segments: [
        { text: 'Karim Benali. Thomas’s handover notes pass the Verlant account to him from Oct 20', cites: [1] },
        { text: 'Karim confirmed it in the CRM on Nov 5, and the revised quote promised on Oct 10 is still to send', cites: [2] },
      ],
      sources: [
        {
          n: 1, tool: 'notion', toolLabel: 'Notion', kind: 'Page', title: 'Handover: Thomas’s accounts',
          author: 'Thomas Girard', date: 'Oct 17', visibility: 'team',
          passage: 'Verlant goes to **Karim Benali** from Oct 20.',
          original: {
            type: 'page', meta: 'Team wiki · Handovers · Last edited Oct 17, 2026',
            body: ['Contacts, access and open items, account by account.', 'Nordia: redesign in progress. Verlant: revised quote not sent.', 'Verlant goes to **Karim Benali** from Oct 20. Ines Roche is the contact.'],
          },
        },
        {
          n: 2, tool: 'hubspot', toolLabel: 'HubSpot', kind: 'Note', title: 'Verlant: phase 2',
          author: 'Karim Benali', date: 'Nov 5', visibility: 'team',
          passage: 'Account taken over from Thomas. **Revised quote still to send.**',
          original: {
            type: 'note', meta: 'Deal: Verlant · Phase 2 · Note by Karim Benali · Nov 5, 2026',
            body: ['Account taken over from Thomas on Oct 20.', '**Revised quote still to send.** Ines Roche asked for it again on Nov 4.'],
          },
        },
      ],
    },
    {
      id: 'nordia', query: 'Summary of the Nordia redesign feedback',
      segments: [
        { text: 'Nordia approved the dashboard mockups on Oct 9', cites: [1] },
        { text: 'At the Nov 2 review, Lena Brandt asked for two changes: fewer options in the export view and larger text on phones', cites: [2] },
        { text: 'Sophie told the team the next day that the layout itself stays', cites: [3] },
      ],
      sources: [
        {
          n: 1, tool: 'linear', toolLabel: 'Linear', kind: 'Ticket', title: 'Nordia: dashboard redesign',
          author: 'Thomas Girard', date: 'Oct 14', visibility: 'team',
          passage: 'Due Nov 28. **Mockups approved by the client on Oct 9.**',
          original: {
            type: 'task', meta: 'Project: Nordia · Assigned to Thomas Girard · In progress',
            body: ['Due Nov 28. **Mockups approved by the client on Oct 9.**', 'Remaining: the export view and the mobile layout.'],
          },
        },
        {
          n: 2, tool: 'granola', toolLabel: 'Granola', kind: 'Meeting', title: 'Nordia: redesign review',
          author: 'Julie Martin', date: 'Nov 2', visibility: 'team',
          passage: '“The **export view has too many options**, and the **text is too small on a phone**.”',
          original: {
            type: 'meeting', meta: 'Nov 2, 2026 · 35 min · Julie Martin, Sophie Laurent, Lena Brandt (Nordia)',
            lines: [
              { who: 'Sophie Laurent', at: '08:20', text: 'Here is the dashboard, built from the mockups you approved.' },
              { who: 'Lena Brandt (Nordia)', at: '09:05', text: 'The **export view has too many options**, and the **text is too small on a phone**.', hit: true },
              { who: 'Julie Martin', at: '09:40', text: 'Noted. We keep the layout and fix those two points.' },
            ],
          },
        },
        {
          n: 3, tool: 'slack', toolLabel: 'Slack', kind: 'Message', title: '#nordia',
          author: 'Sophie Laurent', date: 'Nov 3', visibility: 'private',
          passage: '“Feedback is in. **The layout stays.** We simplify the export view and enlarge the text on mobile.”',
          original: {
            type: 'conversation', meta: '#nordia · Nov 3, 2026 · 2 replies',
            lines: [
              { who: 'Sophie Laurent', at: '09:41', text: 'Feedback is in. **The layout stays.** We simplify the export view and enlarge the text on mobile.', hit: true },
              { who: 'Noa Levi', at: '09:48', text: 'I’ll take the export view.' },
              { who: 'Julie Martin', at: '09:52', text: 'Thanks. I’ll tell Lena it ships with the Nov 28 delivery.' },
            ],
          },
        },
      ],
    },
    {
      id: 'pricing', query: 'What did we decide about the Q1 pricing?',
      segments: [
        { text: 'List prices go up 4% on Jan 1, 2027', cites: [1] },
        { text: 'Clients under contract keep their current rates until they renew', cites: [2] },
        { text: 'Every quote sent from Dec 1 uses the new grid', cites: [2] },
      ],
      sources: [
        {
          n: 1, upload: true, tool: 'excel', toolLabel: 'Documents', kind: 'Spreadsheet', title: 'Q1 2027 pricing grid.xlsx',
          author: 'Karim Benali', date: 'Oct 29', visibility: 'team',
          passage: 'Day rate, list: **+4% from Jan 1, 2027**.',
          original: {
            type: 'page', meta: 'Added by Karim Benali · Sheet “Rates 2027”',
            body: ['Day rate, list: **+4% from Jan 1, 2027**.', 'Maintenance and hosting: unchanged.'],
          },
        },
        {
          n: 2, tool: 'granola', toolLabel: 'Granola', kind: 'Meeting', title: 'Q1 pricing review',
          author: 'Julie Martin', date: 'Oct 28', visibility: 'team',
          passage: '“**Clients under contract keep today’s rates until they renew.** **Every quote from Dec 1 uses the new grid.**”',
          original: {
            type: 'meeting', meta: 'Oct 28, 2026 · 31 min · Rachel Stein, Karim Benali, Julie Martin',
            lines: [
              { who: 'Karim Benali', at: '12:10', text: 'Four percent on list prices from January. The grid is ready.' },
              { who: 'Rachel Stein', at: '13:02', text: '**Clients under contract keep today’s rates until they renew.** **Every quote from Dec 1 uses the new grid.**', hit: true },
              { who: 'Julie Martin', at: '13:30', text: 'I’ll tell ACME and Nordia before the end of November.' },
            ],
          },
        },
      ],
    },
  ],
  // What Leon says when nothing on record answers a question typed freely: no source, so no stroke and no number.
  // The caller puts the typed words in « query ».
  noAnswer: {
    id: 'none', unknown: true, query: '',
    segments: [{ text: 'I don’t know. Nothing on record that you can open answers this question', cites: [] }],
    sources: [],
  },

  tokenNote: 'A token grants access to what you can see. It is shown only once.',
};

// The app's corrections to the shared demo data. The home page does not load this file, so it keeps the shared values.
// tools/build-app.mjs loads it too: the HTML pasted in the pages carries the same corrections.
(function (d) {
  if (!d || d.appPatched) return;
  d.appPatched = true;
  const sc = (id) => d.scenarios.find((s) => s.id === id);
  const from = (s, tool, toolLabel, kind) => Object.assign(s, { tool, toolLabel }, kind ? { kind } : {});
  // A source can only come from a tool Kestrel Studio has connected (see d.connections)
  from(d.permissions.views[0].sources[0], 'gmail', 'Gmail');
  from(sc('departure').sources[0], 'linear', 'Linear', 'Ticket');
  from(sc('departure').sources[1], 'granola', 'Granola');
  from(sc('unknown').sources[0], 'hubspot', 'HubSpot');
  // One ticket, one history: ACM-214 was last changed on Oct 27, when the migration moved
  const ticket = sc('commitment').sources[2];
  ticket.date = 'Oct 27, 2026';
  ticket.original.body.push('Oct 27: migration moved to Dec 2.');
  // Leon speaks to the person signed in
  sc('commitment').segments[0].text = 'At the Oct 3 monthly check-in, you committed to delivering V2 on Nov 15';
  // A date of this year is written without the year (inside an original, the document keeps its own words)
  [...d.scenarios, ...d.permissions.views].forEach((a) => a.sources.forEach((s) => { s.date = s.date.replace(', 2026', ''); }));
  // The discussion Chat opens on is the latest one
  const [v2, date, ...rest] = d.discussions;
  const ids = ['date', 'commitment', 'verlant', 'nordia', 'pricing']; // each discussion's answer: LeonApp.answer(id), app-chat.html?d=<id>
  d.discussions = [{ ...date, date: 'Today' }, { ...v2, date: 'Yesterday' }, ...rest].map((x, i) => ({ ...x, id: ids[i] }));
})(window.LEON_DEMO);
