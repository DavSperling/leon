import type { Metadata } from 'next';
import { A, Contact, LegalPage, type LegalSection, List } from '@/components/site/pages/legal';

// La politique de confidentialité, publique (pied du site ; lien exigé par Google pour l'appli OAuth). Chaque phrase
// décrit le code en production : relire cette page quand on change un fournisseur, un droit ou une durée de garde.

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Leon collects, uses and protects your data, including the data you connect from Google and Microsoft.',
};

const SECTIONS: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          Leon is a shared memory for teams. It connects to the tools your team already uses so you
          can search them, ask questions and get answers that cite their sources. In this policy,
          “Leon”, “we” and “us” mean the team that runs Leon at leonmemory.com. You can reach us at{' '}
          <Contact />.
        </p>
        <p>
          When your organization uses Leon, it decides which tools to connect and who joins its
          workspace. For the content of that workspace, your organization is the controller and Leon
          processes it on its behalf. For your account and for our website, Leon is the controller.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'What we collect',
    body: (
      <List>
        <li>
          <strong>Account information.</strong> Your name and email address, your organization, your
          role and your place in its organization chart. If you sign in with Google or Microsoft, we
          receive the basic profile they share (name, email address, picture). If you use a
          password, we keep only a hash of it.
        </li>
        <li>
          <strong>Content from the tools you connect.</strong> When you or your organization connect
          a tool, such as Gmail, Google Drive, Slack, GitHub, Notion or Linear, Leon imports what
          that connection can read (messages, files, pages, tickets, comments) with their details
          (authors, recipients, dates, links), so it can be searched. Leon also keeps the
          credentials each connection needs, encrypted.
        </li>
        <li>
          <strong>What you do in Leon.</strong> Your questions, your chats with Leon, the notes you
          save and your settings.
        </li>
        <li>
          <strong>Optional capture tools.</strong> If you install Leon’s command-line tool or
          browser extension and agree to it, they send Leon the AI conversations and coding sessions
          you choose to share. Secrets such as passwords and keys are masked before anything is
          sent.
        </li>
        <li>
          <strong>Technical data.</strong> The IP address, browser and time of each request in our
          server logs, and error reports when something breaks.
        </li>
      </List>
    ),
  },
  {
    id: 'google',
    title: 'Data from Google',
    body: (
      <>
        <p>
          If you connect a Google account, Leon asks Google for full access, and only to the
          services you connect. It asks for these permissions now so that you will not need to
          approve again when Leon starts acting for you:
        </p>
        <List>
          <li>
            <strong>Gmail:</strong> read, compose, send and permanently delete email, and change
            basic settings such as filters, signature and vacation reply. Leon does not ask to
            manage forwarding or who can access your mailbox. Today, Leon reads your email messages
            and their details, such as sender, recipients, subject and date, and skips your drafts.
            If you turn on a Leon agent, it also writes reply drafts in your mailbox, sends one only
            when you click Send, moves an email to your Gmail trash only when you click Delete, and
            otherwise deletes only drafts it wrote.
          </li>
          <li>
            <strong>Google Drive:</strong> see, create, edit, share and delete your files. Today,
            Leon only reads the files you can open, with their content and details, such as name,
            owner and dates.
          </li>
          <li>
            <strong>Google Calendar:</strong> read-only access to your events and their details,
            such as title, time, attendees and description.
          </li>
        </List>
        <p>
          Apart from these agent actions, Leon does not send, change or delete anything in your
          Google account. We will update this policy before it does.
        </p>
        <p>
          Leon uses this data only to provide its features to you: make it searchable, answer your
          questions with citations, and write your summaries and morning briefing. It is private to
          you in Leon: your colleagues do not see it in search results or in answers. On the Leon
          website, the managers above you in your organization chart can also read it, as described
          on our <A href="/security">Security page</A>.
        </p>
        <p>
          We do not sell Google user data and do not use it for advertising. We do not use it to
          develop, improve or train generalized AI or machine learning models, and we use AI
          providers only under terms or settings that do not let them train on it. No one at Leon
          reads it unless you ask us to (for example for support), security requires it (such as
          investigating abuse), the law requires it, or it has been aggregated and anonymized for
          internal operations. We share it only with the service providers listed below, and only to
          provide Leon’s features.
        </p>
        <p>
          Leon’s use and transfer to any other app of information received from Google APIs will
          adhere to the{' '}
          <A href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </A>
          , including the Limited Use requirements.
        </p>
        <p>
          You can disconnect Google at any time in Leon, or remove Leon’s access from your{' '}
          <A href="https://myaccount.google.com/permissions">Google Account</A>. “How long we keep
          data” below explains what happens to content already imported.
        </p>
      </>
    ),
  },
  {
    id: 'microsoft',
    title: 'Data from Microsoft',
    body: (
      <>
        <p>
          If you connect Outlook, Leon asks Microsoft for full access to your mail and calendar. It
          asks for these permissions now so that you will not need to approve again when Leon starts
          acting for you: read, write, send and delete email, read and change your calendar, and
          read your mailbox settings, such as time zone and working hours. Leon does not ask to
          change your mailbox settings or rules, so it cannot forward your email. With a work or
          school account, your organization’s Microsoft administrator approves Leon once for the
          whole organization.
        </p>
        <p>
          Today, Leon imports the email in your inbox and sent items, with details such as sender,
          recipients, subject and date, and your calendar events, except those marked personal,
          private or confidential. It does not send, change or delete anything in your Microsoft
          account. We will update this policy before it does.
        </p>
        <p>
          Leon uses this data in the same way and within the same limits as data from Google,
          described above: only to provide its features to you, private to you in Leon, never sold,
          never used for advertising or to train AI models.
        </p>
        <p>
          You can disconnect Outlook at any time in Leon. With a personal account, you can also
          remove Leon’s access from your{' '}
          <A href="https://account.live.com/consent/Manage">Microsoft account</A>; with a work or
          school account, your Microsoft administrator can remove it for the whole organization.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use data',
    body: (
      <>
        <List>
          <li>
            To provide Leon: import and index your tools, search them, answer your questions with
            citations, and write summaries and your morning briefing.
          </li>
          <li>
            To keep Leon secure: sign-in, access rules, abuse prevention, rate limits and error
            monitoring.
          </li>
          <li>To write to you about the service: invitations, account and security emails.</li>
          <li>To help you when you contact us.</li>
        </List>
        <p>
          We do not sell your data, we do not show ads, and we do not use your content to train AI
          models.
        </p>
        <p>
          If you are in the European Union or the United Kingdom, we rely on these legal bases: the
          contract with you or your organization, to provide Leon; our legitimate interest in
          keeping Leon secure and working; your consent, for the optional capture tools; and our
          legal obligations.
        </p>
      </>
    ),
  },
  {
    id: 'ai',
    title: 'AI processing',
    body: (
      <p>
        To answer a question or write a summary, Leon sends your question and the relevant passages
        to an AI model. To make content searchable, it sends passages to a search model that turns
        them into numbers. These models are run by Anthropic (Claude) and, through OpenRouter, by
        other providers, including Voyage AI for search. They receive the data to return a result;
        some keep it for a short time for abuse monitoring, as their terms allow. We use them only
        under terms or settings that do not let them train on your content.
      </p>
    ),
  },
  {
    id: 'sharing',
    title: 'Who receives data',
    body: (
      <>
        <p>
          Inside your organization, Leon applies the access rules described on our{' '}
          <A href="/security">Security page</A>: what a shared connection brings in is visible to
          the team, while your email, Google Drive and Slack are visible only to you and, on the
          Leon website, to the managers above you.
        </p>
        <p>These service providers process data for us, only to run Leon:</p>
        <List>
          <li>Amazon Web Services: database hosting, in Frankfurt, Germany.</li>
          <li>Railway: application hosting.</li>
          <li>Anthropic: AI models.</li>
          <li>OpenRouter: access to other AI and search models, including Voyage AI.</li>
          <li>
            Pipedream: connection to some tools, such as Gmail, Google Drive and Slack, when they
            are connected through it.
          </li>
          <li>Resend: email delivery.</li>
          <li>Sentry: error monitoring, with sensitive fields removed before reports are sent.</li>
          <li>Cloudflare: domain name service for leonmemory.com.</li>
          <li>Google and Microsoft: sign-in, if you choose them.</li>
        </List>
        <p>
          We may also disclose data when the law requires it, or to protect the rights and safety of
          our users. If Leon’s operations move to another entity, for example in a reorganization or
          an acquisition, your data would move with them and stay protected by this policy.
        </p>
      </>
    ),
  },
  {
    id: 'location',
    title: 'Where data is stored',
    body: (
      <p>
        Our database is hosted in the European Union, in Frankfurt, Germany. Some of our providers,
        such as Anthropic and OpenRouter, process data in the United States. When data leaves the
        European Economic Area, the United Kingdom or Switzerland, we rely on the safeguards our
        providers offer, such as the European Commission’s standard contractual clauses.
      </p>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep data',
    body: (
      <List>
        <li>
          Your account information stays as long as your account exists. When you delete your
          account, we erase your name and email address at once.
        </li>
        <li>
          Content brought into a workspace belongs to the organization: it stays in the workspace
          after you leave. When the last member leaves, the workspace and everything in it are
          deleted.
        </li>
        <li>
          Disconnecting a tool stops new imports. What was already imported stays until it is
          deleted. Write to <Contact /> and we will delete the content imported from your own
          accounts, such as your Gmail, Google Drive or Outlook, within 30 days.
        </li>
        <li>
          Database backups are kept for 7 days, so deleted data can remain in a backup for up to 7
          days.
        </li>
        <li>
          Server logs and error reports are kept for a limited time, usually less than 90 days.
        </li>
      </List>
    ),
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: (
      <>
        <p>
          Depending on where you live, you may have the right to access, correct, export or delete
          your personal data, to object to or restrict some uses of it, and to withdraw your consent
          at any time. To use these rights, write to <Contact />. We answer within 30 days. When the
          data belongs to your organization’s workspace, we may need to involve your organization.
        </p>
        <p>
          In the European Union or the United Kingdom, you can also complain to your data protection
          authority. If you live in California, we do not sell or share your personal information as
          the CCPA defines it, and we will not treat you differently for using your rights.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <p>
        Data travels encrypted (HTTPS). Our database is encrypted at rest, and the credentials of
        your connections are encrypted again with a separate key (AES-256-GCM). Each organization’s
        data is kept apart in the database, and Leon checks the permissions of the person asking
        before it shows anything. No system is perfectly secure: if a breach affects your data, we
        will tell you and the authorities as the law requires.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <p>
        Leon uses only the cookies it needs to work: some keep you signed in, one remembers your
        language, a short-lived one protects the step where you connect a tool, and one remembers
        the tools you picked while setting up your account. We do not use advertising or analytics
        cookies. Our website may show Google’s sign-in prompt, which loads from Google; Google’s
        privacy policy applies to it.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        Leon is a service for businesses. It is not meant for anyone under 16, and we do not
        knowingly collect their data.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        When we change this policy, we post the new version here and update its date. If a change
        matters, we tell you by email or in Leon before it applies.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p>
        Questions or requests about your data: <Contact />.
      </p>
    ),
  },
];

export default function Page() {
  return (
    <LegalPage
      title="Privacy Policy"
      lead="How Leon collects, uses and protects your data, including the data you connect from Google and Microsoft. Last updated November 27, 2026."
      sections={SECTIONS}
    />
  );
}
