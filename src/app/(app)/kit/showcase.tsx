'use client';

import { ExternalLink, Trash2, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
  AlertDialog,
  Avatar,
  Badge,
  Button,
  Checkbox,
  CitationChip,
  CodeLine,
  CopyButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Fact,
  Facts,
  Field,
  Flag,
  GlassCard,
  IconButton,
  Input,
  Kbd,
  NoSource,
  Notice,
  OriginalSheet,
  PageHeader,
  Pagination,
  PanelClose,
  PanelDone,
  PanelNote,
  Pill,
  Reading,
  SearchField,
  Section,
  Select,
  SidePanel,
  Skeleton,
  SourceNumber,
  StatusRow,
  Strokes,
  Switch,
  Textarea,
  Thing,
  ThingGrid,
  ToolLogo,
  toast,
} from '@/components/verre/ui';
import { useTheme } from '@/lib/verre/theme';

// Données d'exemple fictives (Kestrel Studio), en anglais comme la maquette : cette page n'est pas traduite.
type Panel = 'facts' | 'person' | 'form' | 'confirm' | 'work' | 'doc' | 'secret' | null;
const FAMILIES = ['All', 'Tools', 'Documents', 'People'];

export function KitShowcase() {
  const { theme, toggle } = useTheme();
  const [family, setFamily] = useState('All');
  const [arrival, setArrival] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState('member');

  const open = (p: Panel) => {
    setAsking(p === 'confirm');
    setBusy(false);
    setDone(false);
    setPanel(p);
  };
  const close = (o: boolean) => {
    if (!o) setPanel(null);
  };
  const work = () => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setDone(true);
    }, 1300);
  };
  const row = (children: ReactNode) => (
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  );

  return (
    <>
      <PageHeader
        title="Kit"
        actions={
          <>
            <Button variant="quiet" onClick={toggle}>
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </Button>
            <Button variant="primary">Add a document</Button>
          </>
        }
      />

      <Section id="cards" title="Cards" count={4} tone={2} actions={<SearchField label="Search" />}>
        <ThingGrid>
          <Thing
            size="card"
            picture={<ToolLogo kind="gmail" />}
            name="Gmail"
            caption="Only you"
            label="Manage Gmail"
            onClick={() => open('facts')}
          />
          <Thing
            size="card"
            picture={<ToolLogo kind="intercom" />}
            name="Intercom"
            caption="Disconnected"
            error
            pill="Reconnect"
            pillInk
            onClick={() => open('form')}
          />
          <Thing
            size="card"
            picture={<Avatar name="Julie Martin" size={36} />}
            name="Julie Martin"
            caption="Account lead"
            onClick={() => open('person')}
          />
          <Thing
            size="card"
            picture={<ToolLogo kind="pdf" />}
            name="Support handbook.pdf"
            caption="Team"
            href="/documents"
          />
        </ThingGrid>
      </Section>

      <Section id="tiles" title="Tiles" count={4} tone={3}>
        <fieldset className="mb-4 flex flex-wrap gap-2">
          <legend className="sr-only">Families</legend>
          {FAMILIES.map((f) => (
            <Pill key={f} aria-pressed={family === f} onClick={() => setFamily(f)}>
              {f}
            </Pill>
          ))}
        </fieldset>
        <ThingGrid>
          <Thing
            picture={<ToolLogo kind="outlook" size={28} />}
            name="Outlook"
            pill="Connect"
            onClick={() => open('work')}
          />
          <Thing
            picture={<ToolLogo kind="excel" size={28} />}
            name="Q1 2027 pricing grid.xlsx"
            caption="Reading…"
            working
          />
          <Thing
            picture={<Avatar name="Karim Benali" size={28} />}
            name="Karim Benali"
            caption="Sales"
            onClick={() => open('person')}
          />
          <Thing name="What did we promise ACME for V2, and by when?" wrap />
        </ThingGrid>
      </Section>

      <Section
        id="writes"
        title="What Leon writes"
        actions={
          <Button size="sm" onClick={() => setArrival((n) => n + 1)}>
            Play the arrival
          </Button>
        }
      >
        <GlassCard className="px-7 py-6">
          {/* la clé rejoue l'arrivée ; seuls les mots qui viennent de la source sont surlignés */}
          <p key={arrival} className={arrival ? 'answer hl-arrive' : 'answer'}>
            At the <span className="hl hl-1">Oct 3 monthly check-in</span>, you committed to
            delivering V2 on <span className="hl hl-1">Nov 15</span>.
            <CitationChip
              n={1}
              label="Source 1: ACME monthly check-in"
              onClick={() => open('doc')}
            />{' '}
            The <span className="hl hl-2">signed quote</span> confirms the date but{' '}
            <span className="hl hl-2">excludes the data migration</span>.
            <CitationChip n={2} label="Source 2: Signed V2 quote" onClick={() => open('doc')} /> The
            migration ticket is <span className="hl hl-3">still open</span>.
            <CitationChip
              n={3}
              label="Source 3: ACME: data migration"
              onClick={() => open('doc')}
            />{' '}
            Nobody has told ACME yet.
            <NoSource />
          </p>
        </GlassCard>
        <ThingGrid cols={3} className="mt-3">
          <Thing
            num={1}
            picture={<ToolLogo kind="granola" size={28} />}
            name="ACME monthly check-in"
            onClick={() => open('doc')}
          />
          <Thing
            num={2}
            picture={<ToolLogo kind="hubspot" size={28} />}
            name="Signed V2 quote"
            caption="Only you"
            onClick={() => open('doc')}
          />
          <Thing
            num={3}
            picture={<ToolLogo kind="linear" size={28} />}
            name="ACME: data migration"
            onClick={() => open('doc')}
          />
        </ThingGrid>
        <GlassCard className="mt-3 px-7 py-6">
          <Reading>Leon is reading…</Reading>
        </GlassCard>
        <GlassCard className="mt-3 px-7 py-6">
          <ul className="divide-y divide-line text-lead">
            <li className="py-2.5">
              ACME expects V2 on Nov 15. <SourceNumber n={1} />
            </li>
            <li className="py-2.5">
              The Nordia redesign review moved to Thursday. <SourceNumber n={4} />
            </li>
          </ul>
        </GlassCard>
      </Section>

      <Section id="panel" title="The side panel">
        {row(
          <>
            <Button onClick={() => open('facts')}>Rows of facts</Button>
            <Button onClick={() => open('person')}>A person</Button>
            <Button onClick={() => open('form')}>A form</Button>
            <Button onClick={() => open('confirm')}>A confirmation</Button>
            <Button onClick={() => open('work')}>Working, then done</Button>
            <Button onClick={() => open('doc')}>A document</Button>
            <Button onClick={() => open('secret')}>A secret, shown once (locked)</Button>
          </>,
        )}
      </Section>

      <Section id="fields" title="Fields">
        <div className="grid max-w-[852px] gap-3 sm:grid-cols-2">
          <GlassCard className="grid content-start gap-3.5 p-7">
            <Field label="Name">
              <Input defaultValue="" />
            </Field>
            <Field label="Work email">
              <Input type="email" placeholder="name@company.com" />
            </Field>
            <Field label="Role">
              <Select
                value={role}
                onValueChange={setRole}
                options={[
                  { value: 'member', label: 'Member' },
                  { value: 'admin', label: 'Admin' },
                  { value: 'owner', label: 'Owner', disabled: true },
                ]}
              />
            </Field>
            <Field label="About you">
              <Textarea placeholder="Your role and current focus" />
            </Field>
            <div>
              <Button
                variant="primary"
                loading={saving}
                loadingLabel="Saving…"
                onClick={() => {
                  setSaving(true);
                  setTimeout(() => setSaving(false), 1300);
                }}
              >
                Save
              </Button>
            </div>
          </GlassCard>
          <GlassCard className="grid content-start gap-3.5 p-7">
            <Field label="Access token" error="Access token is missing.">
              <Input />
            </Field>
            <Field
              label="Your token"
              help="A token grants access to what you can see. It is shown only once."
            >
              <Input readOnly defaultValue="leon_4f9c2e7Kc2" />
            </Field>
            <CodeLine code="curl -fsSL https://leon.example/install | sh" />
            <Checkbox label="Send what I ask from this computer" defaultChecked />
            <Switch label="Stop animations" />
            <div>
              <CopyButton value="leon_4f9c2e7Kc2" size="md" />
            </div>
          </GlassCard>
        </div>
      </Section>

      <Section id="buttons" title="Buttons, pills, initials">
        <div className="grid gap-4">
          {row(
            <>
              <Button variant="primary">Save</Button>
              <Button>Sync now</Button>
              <Button variant="quiet">Not now</Button>
              <Button variant="destructive">Delete connection</Button>
              <Button variant="primary" size="xs">
                Reconnect
              </Button>
              <Button size="xs">Connect</Button>
              <Button size="sm">Add a document</Button>
              <Button variant="link">Connect another account</Button>
              <IconButton icon={X} label="Close" />
              <IconButton icon={Trash2} label="Delete" variant="secondary" />
              <Button icon={ExternalLink}>Open in Gmail</Button>
              <Button disabled>Disabled</Button>
              <Button variant="primary" loading loadingLabel="Connecting…">
                Connect
              </Button>
            </>,
          )}
          {row(
            <>
              <Badge tone="success">Synced 4 min ago</Badge>
              <Badge tone="warning">First sync in progress</Badge>
              <Badge tone="destructive">Disconnected</Badge>
              <Badge>Invited</Badge>
              <Flag tone={1}>1</Flag>
              <Flag tone={2}>8</Flag>
              <Flag tone={3}>34</Flag>
              <Flag tone={4}>2</Flag>
              <Flag tone={3} side="left">
                3
              </Flag>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
              <Strokes />
            </>,
          )}
          {row(
            <>
              <Avatar name="Romain Sauvage" />
              <Avatar name="Julie Martin" />
              <Avatar name="Diane Okafor" />
              <Avatar name="Sophie Laurent" />
              <Avatar name="Karim Benali" size={44} />
              <Avatar name="Leon" size={36} />
              <Avatar name="Romain Sauvage" size={28} />
              <Avatar name="Julie Martin" size={24} />
              <Avatar name="Diane Okafor" size={24} />
            </>,
          )}
          {row(
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Pill chevron>A menu</Pill>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>Settings</DropdownMenuItem>
                  <DropdownMenuItem meta={theme === 'dark' ? 'Dark' : 'Light'} onSelect={toggle}>
                    Theme
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={Trash2} destructive>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => toast('Gmail connection deleted. What Leon saved stays.')}>
                A toast
              </Button>
              <Button onClick={() => toast.error('Couldn’t reach Intercom. Try again.')}>
                A refusal as a toast
              </Button>
              <AlertDialog
                trigger={<Button>A confirmation outside a panel</Button>}
                title="Delete this discussion?"
                description="The discussion and all its messages are deleted for good."
                confirmLabel="Delete"
                cancelLabel="Keep it"
                onConfirm={() => toast('Discussion deleted.')}
              />
            </>,
          )}
          <div className="grid max-w-[640px] gap-2">
            <Notice tone="neutral">Leon was already replying in this discussion.</Notice>
            <Notice tone="success">
              Outlook is connected. The first sync starts within a minute.
            </Notice>
            <Notice tone="warning" action={{ label: 'Reconnect', onClick: () => {} }}>
              Slack will need reconnecting in 3 days.
            </Notice>
            <Notice tone="error">The key was refused by Intercom.</Notice>
          </div>
          <div className="grid max-w-[640px] gap-3">
            <Skeleton className="h-2.5 w-3/4" />
            <Pagination page={2} pages={7} href={(p) => `/kit?page=${p}`} />
          </div>
        </div>
      </Section>

      <Section id="empty" title="Empty state">
        <EmptyState
          title="No documents yet"
          description="Add a file and Leon reads it."
          action={<Button size="sm">Add a document</Button>}
        />
      </Section>

      <SidePanel
        open={panel === 'facts' || panel === 'confirm'}
        onOpenChange={close}
        picture={<ToolLogo kind="gmail" size={44} />}
        title="Gmail"
        confirm={
          asking
            ? {
                title: 'Delete this connection?',
                text: 'Leon stops reading Gmail with julie@kestrel.example. What it already saved stays.',
                yes: 'Delete connection',
                no: 'Keep it',
                busy,
                busyLabel: 'Deleting…',
                onYes: () => {
                  setBusy(true);
                  setTimeout(() => {
                    setPanel(null);
                    toast('Gmail connection deleted. What Leon saved stays.');
                  }, 1300);
                },
                onNo: () => setAsking(false),
              }
            : null
        }
        foot={
          <>
            <Button variant="quiet" className="-ml-4" onClick={() => setAsking(true)}>
              Delete connection
            </Button>
            <PanelClose asChild>
              <Button className="ml-auto">Done</Button>
            </PanelClose>
          </>
        }
      >
        <StatusRow>
          <Badge tone="success">Synced 4 min ago</Badge>
          <Button size="xs">Sync now</Button>
        </StatusRow>
        <Facts>
          <Fact label="Account">julie@kestrel.example</Fact>
          <Fact label="Visible to">
            Only you
            <small>Nobody else in the workspace finds what Leon reads here.</small>
          </Fact>
          <Fact label="Saved">1,284 emails</Fact>
          <Fact label="Leon reads">Your inbox and what you sent, since January 2026.</Fact>
        </Facts>
      </SidePanel>

      <SidePanel
        open={panel === 'person'}
        onOpenChange={close}
        picture={<Avatar name="Karim Benali" size={44} />}
        title="Karim Benali"
        sub="Sales"
      >
        <Facts>
          <Fact label="Address">karim@kestrel.example</Fact>
          <Fact label="Role">Member</Fact>
          <Fact label="Reports to">
            <span className="inline-flex items-center gap-2">
              <Avatar name="Julie Martin" size={24} />
              Julie Martin
            </span>
          </Fact>
        </Facts>
      </SidePanel>

      <SidePanel
        open={panel === 'form'}
        onOpenChange={close}
        picture={<ToolLogo kind="intercom" size={44} />}
        title="Intercom"
        busy={busy}
        foot={
          done ? undefined : (
            <>
              <PanelClose asChild>
                <Button variant="quiet" className="-ml-4">
                  Not now
                </Button>
              </PanelClose>
              <Button
                variant="primary"
                className="ml-auto"
                loading={busy}
                loadingLabel="Reconnecting…"
                onClick={work}
              >
                Reconnect
              </Button>
            </>
          )
        }
        note={done ? undefined : 'Leon only reads. It never writes in Intercom.'}
      >
        {done ? (
          <PanelDone title="Intercom is connected">
            The first sync starts within a minute.
          </PanelDone>
        ) : (
          <>
            <StatusRow>
              <Badge tone="destructive">Disconnected</Badge>
            </StatusRow>
            <form className="grid gap-3.5" onSubmit={(e) => e.preventDefault()}>
              <Field label="Access token" error="Access token is missing.">
                <Input />
              </Field>
              <PanelNote>
                In Intercom: <b>Settings › Developers › Access token</b>.
              </PanelNote>
            </form>
          </>
        )}
      </SidePanel>

      <SidePanel
        open={panel === 'work'}
        onOpenChange={close}
        picture={<ToolLogo kind="outlook" size={44} />}
        title="Outlook"
        busy={busy}
        foot={
          done ? undefined : (
            <Button
              variant="primary"
              className="ml-auto"
              loading={busy}
              loadingLabel="Connecting…"
              onClick={work}
            >
              Continue to Outlook
            </Button>
          )
        }
      >
        {done ? (
          <PanelDone title="Outlook is connected">The first sync starts within a minute.</PanelDone>
        ) : (
          <Facts>
            <Fact label="Leon reads">Your inbox, your calendar, what you sent.</Fact>
            <Fact label="Visible to">Only you</Fact>
          </Facts>
        )}
      </SidePanel>

      <SidePanel
        open={panel === 'doc'}
        onOpenChange={close}
        picture={<ToolLogo kind="granola" size={44} />}
        title="ACME monthly check-in"
        foot={
          <>
            <Button icon={ExternalLink}>Open in Granola</Button>
            <PanelClose asChild>
              <Button className="ml-auto">Done</Button>
            </PanelClose>
          </>
        }
      >
        <OriginalSheet n={1} meta="Granola · Meeting · Oct 3, 2026">
          <p>Julie: So where do we land on the date for V2?</p>
          <p>
            Karim: <mark>We commit to delivering V2 on Nov 15.</mark> That leaves two weeks for
            their acceptance tests.
          </p>
          <p>Julie: Fine. I’ll put it in the quote.</p>
        </OriginalSheet>
        <Facts>
          <Fact label="Visible to">Team</Fact>
        </Facts>
      </SidePanel>

      <SidePanel
        open={panel === 'secret'}
        onOpenChange={close}
        title="Your token"
        locked
        foot={
          <>
            <CopyButton value="leon_4f9c2e7Kc2" size="md" />
            <PanelClose asChild>
              <Button variant="primary" className="ml-auto">
                I copied it
              </Button>
            </PanelClose>
          </>
        }
      >
        <CodeLine code="leon_4f9c2e7Kc2" />
        <PanelNote className="mt-3.5">Copy it now; it won’t be shown again.</PanelNote>
      </SidePanel>
    </>
  );
}
