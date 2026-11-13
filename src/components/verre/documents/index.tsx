'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  EmptyState,
  PageHeader,
  SearchField,
  Thing,
  ThingGrid,
  toast,
} from '@/components/verre';
import { cn, nb } from '@/lib/verre';
import { AddPanel, NOTHING_STAGED, type Staged, stage } from './add-panel';
import { readDropped } from './dropped-files';
import {
  DocumentPanel,
  type DocumentRow,
  type FolderGroup,
  FolderPanel,
  PileMark,
  SheetMark,
  toneOfFile,
} from './item-panel';
import './documents.css';
import { type GroupOption, usePartageWords } from './partage';

// Les rectangles de la page : un dossier à la place de ses fichiers, les documents seuls tels quels. Le dossier se
// reconnaît à son identifiant ET à son auteur : un identifiant repris par un autre membre reste à part.
export function groupDocuments(documents: DocumentRow[]): (DocumentRow | FolderGroup)[] {
  const rows: (DocumentRow | FolderGroup)[] = [];
  const folders = new Map<string, FolderGroup>();
  for (const document of documents) {
    if (!document.folderId) {
      rows.push(document);
      continue;
    }
    const key = `${document.ownerUserId}:${document.folderId}`;
    let folder = folders.get(key);
    if (!folder) {
      folder = { key, id: document.folderId, name: document.folderName ?? '', documents: [] };
      folders.set(key, folder);
      rows.push(folder);
    }
    folder.documents.push(document);
  }
  return rows;
}

// Ce que Leon lit, montré sur le bureau vide : une feuille par sorte de fichier (PDF, Office, texte, code).
const READS = ['a.pdf', 'a.docx', 'a.xlsx', 'a.pptx', 'a.md', 'a.ts'];
/** Ce que Leon lit, en éventail : six feuilles tenues comme une main de cartes. Pointé (ou un fichier tenu au-dessus
 *  de la page), l'éventail s'ouvre (documents.css). Un décor : les mots à côté disent le geste. */
function ReadsFan() {
  return (
    <span aria-hidden="true" className="dc-fan">
      {READS.map((name, i) => (
        <span key={name} style={{ ['--i' as string]: i }}>
          <SheetMark title={name} size={88} />
        </span>
      ))}
    </span>
  );
}

// Le nom d'un document sur sa carte : sans l'extension (l'image dit déjà la sorte de fichier).
const baseName = (title: string) => title.replace(/\.[a-z0-9]+$/i, '') || title;
// Au-delà, une recherche s'ajoute à côté du titre.
const SEARCH_FROM = 12;
// Tant qu'un document est en lecture, la liste se relit ; pas plus de trois minutes d'affilée.
const READING_POLL_MS = 4000;
const READING_POLL_MAX_MS = 180_000;

type Open = { doc: string } | { folder: string } | null;

export function Documents({
  documents,
  viewerId,
  admin,
  groups,
}: {
  documents: DocumentRow[];
  viewerId: string;
  admin: boolean;
  groups: GroupOption[];
}) {
  const t = useTranslations('documents');
  const router = useRouter();
  const params = useSearchParams();
  const words = usePartageWords(groups);
  const rows = groupDocuments(documents);
  const folders = rows.filter((row): row is FolderGroup => 'documents' in row);
  const [open, setOpen] = useState<Open>(null);
  const [adding, setAdding] = useState(false);
  const [staged, setStaged] = useState<Staged>(NOTHING_STAGED);
  const [sending, setSending] = useState(false);
  const [holding, setHolding] = useState(false);
  const [q, setQ] = useState('');
  const pill = useRef<HTMLButtonElement>(null);

  // ?document=<id> (la palette, une source) ouvre son panneau : un document, ou un dossier par son identifiant. Une
  // fois par lien : la liste qui se relit ne le rouvre pas.
  const wanted = params.get('document');
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!wanted || handled.current === wanted) return;
    handled.current = wanted;
    const doc = documents.find((d) => d.id === wanted);
    const folder = doc
      ? undefined
      : documents.find((d) => d.folderId === wanted && d.folderId !== null);
    if (doc) setOpen({ doc: doc.id });
    else if (folder) setOpen({ folder: `${folder.ownerUserId}:${folder.folderId}` });
  }, [wanted, documents]);

  const close = () => {
    setOpen(null);
    if (wanted) {
      handled.current = null;
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  // Un document en lecture : la page se relit jusqu'à ce que Leon l'ait lu (borné).
  const anyReading = documents.some((d) => d.reading);
  useEffect(() => {
    if (!anyReading) return;
    const start = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - start > READING_POLL_MAX_MS) clearInterval(timer);
      else router.refresh();
    }, READING_POLL_MS);
    return () => clearInterval(timer);
  }, [anyReading, router]);

  // Un fichier ou un dossier déposé n'importe où sur la page : il attend dans « Ajouter un document », où l'on choisit
  // qui le verra avant de l'envoyer. Ses entrées se prennent pendant l'événement (elles ne valent qu'alors).
  useEffect(() => {
    const held = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes('Files'));
    const over = (e: DragEvent) => {
      if (!held(e)) return;
      e.preventDefault(); // sinon le navigateur ouvre le fichier déposé
      if (e.dataTransfer) e.dataTransfer.dropEffect = sending ? 'none' : 'copy';
      if (!sending) setHolding(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setHolding(false);
    };
    const drop = (e: DragEvent) => {
      if (!held(e) || !e.dataTransfer) return;
      e.preventDefault();
      setHolding(false);
      if (sending) return;
      const entries = [...e.dataTransfer.items].flatMap((item) =>
        item.kind === 'file' ? (item.webkitGetAsEntry() ?? item.getAsFile() ?? []) : [],
      );
      void readDropped(entries).then((dropped) => {
        setStaged((current) => stage(current, dropped));
        setOpen(null);
        setAdding(true);
      });
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [sending]);

  const needle = q.trim().toLocaleLowerCase();
  const shown = needle
    ? rows.filter((row) =>
        'documents' in row
          ? row.name.toLocaleLowerCase().includes(needle) ||
            row.documents.some((d) => d.title?.toLocaleLowerCase().includes(needle))
          : (row.title ?? '').toLocaleLowerCase().includes(needle),
      )
    : rows;

  // Ce qui est ouvert se relit dans la liste du moment : parti (supprimé ailleurs), son panneau se ferme.
  const openDoc = open && 'doc' in open ? documents.find((d) => d.id === open.doc) : undefined;
  const openFolder =
    open && 'folder' in open ? folders.find((f) => f.key === open.folder) : undefined;
  const folderOfDoc = openDoc?.folderId
    ? (folders.find((f) => f.key === `${openDoc.ownerUserId}:${openDoc.folderId}`) ?? null)
    : null;
  const search = (phone: boolean) => (
    <SearchField
      label={t('search')}
      value={q}
      slash={!phone}
      onChange={(e) => setQ(e.target.value)}
      className={phone ? 'mb-4 sm:hidden' : 'max-sm:hidden'}
    />
  );

  const deleted = (name: string) => {
    close();
    toast(t('deleted', { title: name }));
    pill.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <>
            {rows.length > SEARCH_FROM && search(false)}
            <Button ref={pill} variant="primary" onClick={() => setAdding(true)}>
              {t('add')}
            </Button>
          </>
        }
      />

      {rows.length > SEARCH_FROM && search(true)}
      {rows.length === 0 ? (
        <div className={cn('dc-empty', holding && 'is-holding')}>
          <ReadsFan />
          <div className="grid gap-1">
            <h2 className="text-title font-semibold text-fg">{nb(t('emptyTitle'))}</h2>
            <p className="text-body text-muted">
              {nb(holding ? t('dropHere') : t('emptyDescription'))}
            </p>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <EmptyState title={t('noMatch', { q: q.trim() })} />
      ) : (
        <div className={cn('dc-desk', holding && 'is-holding')}>
          <ThingGrid cols={3}>
            {shown.map((row) =>
              'documents' in row ? (
                <Thing
                  key={row.key}
                  size="card"
                  className="dc-pile"
                  picture={<PileMark size={36} />}
                  name={nb(row.name)}
                  caption={
                    row.documents.some((d) => d.reading)
                      ? t('reading')
                      : words.caption(row.documents[0]?.partage ?? 'equipe')
                  }
                  working={row.documents.some((d) => d.reading)}
                  hl={4}
                  onClick={() => setOpen({ folder: row.key })}
                />
              ) : (
                <Thing
                  key={row.id}
                  size="card"
                  picture={<SheetMark title={row.title} size={36} />}
                  name={nb(baseName(row.title || t('untitled')))}
                  caption={row.reading ? t('reading') : words.caption(row.partage)}
                  working={row.reading}
                  hl={toneOfFile(row.title)}
                  onClick={() => setOpen({ doc: row.id })}
                />
              ),
            )}
            {/* la place de la prochaine feuille : l'image de l'écran (ce que Leon lit, en éventail), elle apprend le
                geste et répond quand on tient un fichier ; étroite, elle redevient une case du bureau */}
            {!needle && (
              <button key="slot" type="button" className="dc-place" onClick={() => setAdding(true)}>
                <ReadsFan />
                <SheetMark title={null} size={36} slot />
                <span className="dc-place__name">{holding ? t('dropHere') : t('dropZone')}</span>
              </button>
            )}
          </ThingGrid>
        </div>
      )}

      {openDoc && (
        <DocumentPanel
          key={openDoc.id}
          document={openDoc}
          folder={folderOfDoc}
          viewerId={viewerId}
          admin={admin}
          groups={groups}
          onClose={close}
          onOpenFolder={(key) => setOpen({ folder: key })}
          onDeleted={deleted}
        />
      )}
      {openFolder && (
        <FolderPanel
          key={openFolder.key}
          folder={openFolder}
          viewerId={viewerId}
          groups={groups}
          onClose={close}
          onOpenDocument={(id) => setOpen({ doc: id })}
          onDeleted={deleted}
        />
      )}
      <AddPanel
        open={adding}
        onOpenChange={setAdding}
        groups={groups}
        staged={staged}
        onStage={setStaged}
        sending={sending}
        onSending={setSending}
      />

      {holding && <div aria-hidden="true" className="dc-frame" />}
    </>
  );
}
