import type { Metadata } from 'next';
import { A, Contact, LegalPage, type LegalSection, List } from '@/components/site/pages/legal';

// Les conditions d'utilisation, publiques (pied du site ; lien exigé par Google pour l'appli OAuth). Le prix suit la
// page Tarifs : pilote gratuit, facturation pas encore en place.

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The rules for using Leon.',
};

const SECTIONS: LegalSection[] = [
  {
    id: 'agreement',
    title: 'Agreement',
    body: (
      <>
        <p>
          These terms apply when you use Leon: the leonmemory.com website and app, Leon’s
          command-line tool and its browser extension. In these terms, “Leon”, “we” and “us” mean
          the team that runs Leon. By creating an account or using Leon, you accept these terms and
          our <A href="/privacy">Privacy Policy</A>.
        </p>
        <p>
          If you use Leon for an organization, you confirm that you are allowed to accept these
          terms on its behalf.
        </p>
      </>
    ),
  },
  {
    id: 'service',
    title: 'The service',
    body: (
      <p>
        Leon connects to your team’s tools so you can search them, ask questions and get answers
        that cite their sources. Leon is in early access: features change often, and some may be
        limited, paused or removed. We work to keep Leon available, but we do not promise that it
        will always be available or free of errors.
      </p>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts and workspaces',
    body: (
      <p>
        Give accurate information and keep your sign-in safe: you are responsible for what happens
        under your account. The owners and admins of a workspace choose its members, its connections
        and who sees what, and they can remove members.
      </p>
    ),
  },
  {
    id: 'your-content',
    title: 'Your content',
    body: (
      <p>
        You keep all rights to the content you bring into Leon. You allow us to host, copy, process
        and display it only to provide and secure Leon for you and your organization, as described
        in our <A href="/privacy">Privacy Policy</A>. When you connect a tool, you confirm that you
        have the right to give Leon access to it. Your organization is responsible for telling its
        members what it connects to Leon.
      </p>
    ),
  },
  {
    id: 'connected-tools',
    title: 'Connected tools',
    body: (
      <p>
        Your use of the tools you connect, such as Google, Slack or GitHub, stays subject to their
        own terms. Leon reaches them only with the permissions you grant, and you can disconnect
        them at any time.
      </p>
    ),
  },
  {
    id: 'ai-answers',
    title: 'AI-generated answers',
    body: (
      <p>
        Leon’s answers, summaries and suggestions are written by AI models. They can be incomplete
        or wrong: check the cited sources before you rely on them, especially for important
        decisions.
      </p>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>Do not use Leon to:</p>
        <List>
          <li>break the law, or infringe other people’s rights or privacy;</li>
          <li>
            reach data or accounts you are not allowed to see, or get around Leon’s security or
            limits;
          </li>
          <li>disrupt, overload or attack Leon, or copy, resell or reverse-engineer it;</li>
          <li>send spam or harmful content.</li>
        </List>
        <p>We may suspend an account that breaks these rules.</p>
      </>
    ),
  },
  {
    id: 'price',
    title: 'Price',
    body: (
      <p>
        Leon is free during the pilot, and billing is not in place yet. Before a paid plan applies
        to you, we will tell you its price, and you will not be charged unless you agree.
      </p>
    ),
  },
  {
    id: 'ending',
    title: 'Ending your use',
    body: (
      <p>
        You can stop using Leon and delete your account at any time from your settings. We may
        suspend or close an account that breaks these terms or puts Leon or its users at risk; when
        we can, we warn you first. Our <A href="/privacy">Privacy Policy</A> explains what happens
        to your data.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Disclaimer and liability',
    body: (
      <p>
        Leon is provided “as is” and “as available”. To the extent the law allows, we disclaim all
        warranties, and we are not liable for indirect or consequential damages, or for lost data,
        profits or business. Our total liability is limited to the greater of the amount you paid
        for Leon in the 12 months before the claim and 100 US dollars. Nothing in these terms limits
        a liability that the law does not allow us to limit.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        We may update these terms. We post the new version here with a new date and, for important
        changes, tell you before they apply. If you keep using Leon after a change applies, you
        accept the new terms.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p>
        Questions about these terms: <Contact />.
      </p>
    ),
  },
];

export default function Page() {
  return (
    <LegalPage
      title="Terms of Service"
      lead="The rules for using Leon. Last updated November 26, 2026."
      sections={SECTIONS}
    />
  );
}
