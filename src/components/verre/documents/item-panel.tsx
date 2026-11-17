'use client';

import { FileCode, FileJson, FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import {
  deleteDocumentAction,
  deleteFolderAction,
  readDocumentAction,
  shareDocumentAction,
} from '@/app/(app)/documents/actions';
import {
  Avatar,
  Badge,
  Button,
  Fact,
  Facts,
  Notice,
  OriginalSheet,
  PanelClose,
  SidePanel,
  StatusRow,
  ToolLogo,
} from '@/components/verre';
import { documentExtension, TEXT_EXTENSIONS } from '@/lib/documents';
import { formatDateTime } from '@/lib/format';
import { nb } from '@/lib/verre';
import { type GroupOption, ShareSelect, usePartageWords } from './partage';

export type DocumentRow = {
  id: string;
  title: string | null;
  createdAt: Date;
  ownerUserId: string;
  ownerName: string;
  folderId: string | null;
  folderName: string | null;
  ownerFormer: boolean;
  partage: string; // 'equipe', 'moi' ou l'id d'un groupe (listDocuments)
  reading: boolean; // son run d'indexation n'est pas fini (listDocuments)
};

// Les fichiers d'un même dossier et d'un même auteur, du plus récent au plus ancien : une seule tuile.
export type FolderGroup = { key: string; id: string; name: string; documents: DocumentRow[] };

// Le logo du format, d'après l'extension du titre (le nom du fichier envoyé) ; les autres formats gardent l'icône.
const LOGOS: Record<string, string> = {
  pdf: 'pdf',
  docx: 'word',
  rtf: 'word',
  xlsx: 'excel',
  csv: 'excel',
  pptx: 'powerpoint',
  odt: 'writer',
  ods: 'calc',
};
// La couleur du trait sous un nom pointé, par sorte de fichier (celle de la maquette).
const TONES: Record<string, 1 | 2 | 3 | 4> = {
  pdf: 1,
  excel: 2,
  calc: 2,
  word: 3,
  writer: 3,
  powerpoint: 4,
};

export const logoOf = (title: string | null) => LOGOS[documentExtension(title ?? '')];

// Sans logo : du texte (et Markdown), du JSON, ou du code et de la configuration (le reste de TEXT_EXTENSIONS).
const PROSE: ReadonlySet<string> = new Set(['txt', 'md', 'mdx', 'rst', 'adoc', 'log']);
const CODE: ReadonlySet<string> = new Set<string>(TEXT_EXTENSIONS);
export const iconOf = (title: string | null) => {
  const ext = documentExtension(title ?? '');
  if (ext === 'json' || ext === 'jsonc') return FileJson;
  return CODE.has(ext) && !PROSE.has(ext) ? FileCode : FileText;
};
export const toneOfFile = (title: string | null) => TONES[logoOf(title) ?? ''] ?? 3;

export function FileMark({ title, size }: { title: string | null; size: 28 | 44 | 20 }) {
  const logo = logoOf(title);
  if (logo) return <ToolLogo kind={logo} size={size} />;
  const Icon = iconOf(title);
  return (
    <Icon
      aria-hidden="true"
      className="shrink-0 text-fg-2"
      strokeWidth={size > 28 ? 1.3 : 1.5}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * La miniature d'une feuille : ce qu'est un document sur le bureau. Une ligne de titre, un passage sous le surligneur
 * (la couleur de sa sorte de fichier), le logo du format sur le coin quand il en a un ; du code s'écrit en retraits.
 * `slot` : la place vide, en pointillé, où se pose la prochaine feuille.
 */
export function SheetMark({
  title,
  size,
  slot,
}: {
  title: string | null;
  size: 36 | 44 | 88;
  slot?: boolean;
}) {
  const logo = slot ? undefined : logoOf(title);
  const ext = documentExtension(title ?? '');
  const code = !logo && CODE.has(ext) && !PROSE.has(ext);
  return (
    <span
      aria-hidden="true"
      className="dc-sheet"
      style={{
        width: (size * 30) / 36,
        height: size,
        ['--hl' as string]: `var(--m${toneOfFile(title)})`,
      }}
    >
      <svg viewBox="0 0 30 36" aria-hidden="true">
        <rect className="dc-sheet__paper" x=".5" y=".5" width="29" height="35" rx="3.5" />
        {slot ? (
          <path className="dc-slot__plus" d="M15 13v10M10 18h10" fill="none" />
        ) : code ? (
          <>
            <rect className="dc-sheet__head" x="5" y="6.5" width="9" height="2.5" rx="1.25" />
            <rect className="dc-sheet__hl" x="7.5" y="11.5" width="17" height="6" rx="1.5" />
            <rect className="dc-sheet__line" x="9" y="13.5" width="13" height="2" rx="1" />
            <rect className="dc-sheet__line" x="9" y="20.5" width="11" height="2" rx="1" />
            <rect className="dc-sheet__line" x="9" y="25" width="7" height="2" rx="1" />
            <rect className="dc-sheet__line" x="5" y="29.5" width="4" height="2" rx="1" />
          </>
        ) : (
          <>
            <rect className="dc-sheet__head" x="5" y="6.5" width="11" height="2.5" rx="1.25" />
            <rect className="dc-sheet__hl" x="4" y="12.5" width="18" height="6" rx="1.5" />
            <rect className="dc-sheet__line" x="5.5" y="14.5" width="15" height="2" rx="1" />
            <rect className="dc-sheet__line" x="5" y="21.5" width="20" height="2" rx="1" />
            <rect className="dc-sheet__line" x="5" y="26.5" width="13" height="2" rx="1" />
          </>
        )}
      </svg>
      {logo && <ToolLogo kind={logo} size={size > 44 ? 28 : size > 36 ? 20 : 16} />}
    </span>
  );
}

/** Un dossier : la pile. Trois feuilles, celle du dessus marquée ; pointée, la pile s'ouvre (documents.css). */
export function PileMark({ size }: { size: 36 | 44 }) {
  return (
    <span
      aria-hidden="true"
      className="dc-sheet"
      // la boîte d'une feuille (30 × 36) : le nom s'aligne sur celui des fichiers ; l'éventail en déborde de 3 px
      style={{ width: (size * 30) / 36, height: size, ['--hl' as string]: 'var(--m4)' }}
    >
      <svg viewBox="3 0 30 36" aria-hidden="true">
        <rect
          className="dc-sheet__paper dc-sheet__back dc-sheet__back--l"
          x="7.5"
          y="4.5"
          width="21"
          height="27"
          rx="3"
        />
        <rect
          className="dc-sheet__paper dc-sheet__back dc-sheet__back--r"
          x="7.5"
          y="4.5"
          width="21"
          height="27"
          rx="3"
        />
        <rect className="dc-sheet__paper" x="7.5" y="4.5" width="21" height="27" rx="3" />
        <rect className="dc-sheet__head" x="11" y="9.5" width="8" height="2.5" rx="1.25" />
        <rect className="dc-sheet__hl" x="10.5" y="15" width="13" height="5.5" rx="1.5" />
        <rect className="dc-sheet__line" x="11.5" y="16.75" width="11" height="2" rx="1" />
        <rect className="dc-sheet__line" x="11" y="23.5" width="14" height="2" rx="1" />
      </svg>
    </span>
  );
}

// Le dernier segment d'un chemin : le nom du fichier d'un dossier.
const fileName = (title: string) => title.split('/').at(-1) || title;

function Author({ document, viewerId }: { document: DocumentRow; viewerId: string }) {
  const t = useTranslations('documents');
  const tSettings = useTranslations('settings');
  const mine = document.ownerUserId === viewerId;
  return (
    <span className="flex items-center gap-2.5">
      <Avatar name={document.ownerName} size={24} />
      {mine
        ? t('you')
        : document.ownerFormer
          ? tSettings('formerMember', { name: document.ownerName })
          : nb(document.ownerName)}
    </span>
  );
}

/**
 * Un document : qui l'a ajouté, quand, qui le voit (l'auteur le change), « Ouvrir » (le texte que Leon a lu, le
 * fichier d'origine n'étant pas gardé), « Supprimer » confirmé sur place. Supprimer : l'auteur, ou un administrateur
 * pour le document d'un ancien membre (la base le revérifie, 0042).
 */
export function DocumentPanel({
  document,
  folder,
  viewerId,
  admin,
  groups,
  onClose,
  onOpenFolder,
  onDeleted,
}: {
  document: DocumentRow;
  folder: FolderGroup | null;
  viewerId: string;
  admin: boolean;
  groups: GroupOption[];
  onClose: () => void;
  onOpenFolder: (key: string) => void;
  onDeleted: (title: string) => void;
}) {
  const t = useTranslations('documents');
  const common = useTranslations('common');
  const locale = useLocale();
  const words = usePartageWords(groups);
  const [asking, setAsking] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [opening, startOpen] = useTransition();
  const [text, setText] = useState<{ text: string; cut: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mine = document.ownerUserId === viewerId;
  const canDelete = mine || (admin && document.ownerFormer);
  const full = document.title || t('untitled');
  const title = folder ? fileName(full) : full;
  const sub = folder ? full.slice(folder.name.length + 1, -title.length - 1) : '';

  const remove = () =>
    startDelete(async () => {
      const body = new FormData();
      body.set('id', document.id);
      const { ok } = await deleteDocumentAction(body).catch(() => ({ ok: false }));
      setAsking(false);
      if (ok) onDeleted(title);
      else setError(t('deleteFailed'));
    });

  const open = () =>
    startOpen(async () => {
      setError(null);
      const read = await readDocumentAction(document.id).catch(() => null);
      if (read) setText(read);
      else setError(t('readFailed'));
    });

  return (
    <SidePanel
      open
      onOpenChange={(next) => !next && onClose()}
      picture={<SheetMark title={document.title} size={44} />}
      title={title}
      confirm={
        asking
          ? {
              title: t('deleteConfirm', { title }),
              text: t('deleteConfirmText', { who: document.partage }),
              yes: t('delete'),
              no: t('keep'),
              busy: deleting,
              busyLabel: t('deleting'),
              onYes: remove,
              onNo: () => setAsking(false),
            }
          : null
      }
      foot={
        text ? (
          <>
            <Button variant="quiet" className="-ml-4" onClick={() => setText(null)}>
              {t('back')}
            </Button>
            <PanelClose asChild>
              <Button className="ml-auto">{common('done')}</Button>
            </PanelClose>
          </>
        ) : (
          <>
            {canDelete && (
              <Button variant="quiet" className="-ml-4" onClick={() => setAsking(true)}>
                {t('delete')}
              </Button>
            )}
            <Button
              className="ml-auto"
              loading={opening}
              loadingLabel={t('reading')}
              onClick={open}
            >
              {t('open')}
            </Button>
          </>
        )
      }
    >
      {error && (
        <Notice tone="error" live="alert" className="mb-4">
          {error}
        </Notice>
      )}
      {text ? (
        <>
          <OriginalSheet
            meta={`${mine ? t('you') : document.ownerName} · ${formatDateTime(document.createdAt, locale)}`}
          >
            {text.text
              .split(/\n{2,}/)
              .filter((part) => part.trim())
              .map((part, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: des paragraphes figés, lus une fois
                <p key={i} className="whitespace-pre-wrap">
                  {part}
                </p>
              ))}
          </OriginalSheet>
          {text.cut && <p className="mt-3 text-label text-muted">{t('textCut')}</p>}
        </>
      ) : (
        <>
          {document.reading && (
            <StatusRow>
              <Badge tone="warning" sweeping>
                {t('reading')}
              </Badge>
              <span className="text-label text-muted">{t('searchableOnceRead')}</span>
            </StatusRow>
          )}
          <Facts>
            <Fact label={t('addedByLabel')}>
              <Author document={document} viewerId={viewerId} />
            </Fact>
            <Fact label={t('addedOn')}>{formatDateTime(document.createdAt, locale)}</Fact>
            {folder && (
              <Fact label={t('folder')}>
                <button
                  type="button"
                  className="text-left text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
                  onClick={() => onOpenFolder(folder.key)}
                >
                  {nb(folder.name)}
                </button>
                {sub && <small>{nb(sub)}</small>}
              </Fact>
            )}
            <Fact label={t('shareWith')}>
              {/* un fichier d'un dossier se partage avec son dossier, d'un bloc : depuis le panneau du dossier */}
              {mine && !folder ? (
                <ShareSelect
                  share={(partage) => shareDocumentAction({ id: document.id }, partage)}
                  value={document.partage}
                  groups={groups}
                  label={t('shareLabel', { title: full })}
                />
              ) : (
                words.caption(document.partage)
              )}
              <small>{words.says(document.partage, 1)}</small>
            </Fact>
          </Facts>
        </>
      )}
    </SidePanel>
  );
}

/**
 * Un dossier : qui l'a envoyé, quand (son fichier le plus récent), qui le voit (l'auteur le change d'un bloc, pour
 * chaque fichier), ses fichiers (chacun ouvre son propre panneau : c'est là qu'un administrateur retire, un par un,
 * ceux d'un ancien membre), « Supprimer le dossier » pour l'auteur seul.
 */
export function FolderPanel({
  folder,
  viewerId,
  groups,
  onClose,
  onOpenDocument,
  onDeleted,
}: {
  folder: FolderGroup;
  viewerId: string;
  groups: GroupOption[];
  onClose: () => void;
  onOpenDocument: (id: string) => void;
  onDeleted: (name: string) => void;
}) {
  const t = useTranslations('documents');
  const common = useTranslations('common');
  const locale = useLocale();
  const words = usePartageWords(groups);
  const [asking, setAsking] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [latest] = folder.documents;
  if (!latest) return null;
  const mine = latest.ownerUserId === viewerId;
  const prefix = `${folder.name}/`;
  const files = folder.documents
    .map((document) => {
      const title = document.title || t('untitled');
      return { document, path: title.startsWith(prefix) ? title.slice(prefix.length) : title };
    })
    .sort((a, b) => a.path.localeCompare(b.path, locale));

  const remove = () =>
    startDelete(async () => {
      const body = new FormData();
      body.set('id', folder.id);
      const { ok } = await deleteFolderAction(body).catch(() => ({ ok: false }));
      setAsking(false);
      if (ok) onDeleted(folder.name);
      else setError(t('deleteFailed'));
    });

  return (
    <SidePanel
      open
      onOpenChange={(next) => !next && onClose()}
      picture={<PileMark size={44} />}
      title={folder.name}
      confirm={
        asking
          ? {
              title: t('deleteConfirm', { title: folder.name }),
              text: t('deleteFolderConfirmText', { who: latest.partage }),
              yes: t('deleteFolder'),
              no: t('keep'),
              busy: deleting,
              busyLabel: t('deleting'),
              onYes: remove,
              onNo: () => setAsking(false),
            }
          : null
      }
      foot={
        mine ? (
          <>
            <Button variant="quiet" className="-ml-4" onClick={() => setAsking(true)}>
              {t('deleteFolder')}
            </Button>
            <PanelClose asChild>
              <Button className="ml-auto">{common('done')}</Button>
            </PanelClose>
          </>
        ) : undefined
      }
    >
      {error && (
        <Notice tone="error" live="alert" className="mb-4">
          {error}
        </Notice>
      )}
      {folder.documents.some((d) => d.reading) && (
        <StatusRow>
          <Badge tone="warning" sweeping>
            {t('reading')}
          </Badge>
          <span className="text-label text-muted">{t('searchableOnceRead')}</span>
        </StatusRow>
      )}
      <Facts>
        <Fact label={t('addedByLabel')}>
          <Author document={latest} viewerId={viewerId} />
        </Fact>
        <Fact label={t('addedOn')}>{formatDateTime(latest.createdAt, locale)}</Fact>
        <Fact label={t('shareWith')}>
          {mine ? (
            <ShareSelect
              share={(partage) => shareDocumentAction({ folderId: folder.id }, partage)}
              value={latest.partage}
              groups={groups}
              label={t('shareFolderLabel', { name: folder.name })}
            />
          ) : (
            words.caption(latest.partage)
          )}
          <small>
            {mine ? t('sayFolder') : words.says(latest.partage, folder.documents.length)}
          </small>
        </Fact>
      </Facts>
      <h3 className="mt-6 mb-2 text-label font-medium text-muted">
        {t('files')} · {files.length}
      </h3>
      <ul className="grid">
        {files.map(({ document, path }) => (
          <li key={document.id}>
            <button
              type="button"
              onClick={() => onOpenDocument(document.id)}
              className="-mx-2 flex min-h-10 w-[calc(100%+16px)] items-center gap-3 rounded-item px-2 py-1.5 text-left transition-colors duration-150 hover:bg-hover active:bg-n-150 max-shell:min-h-11"
            >
              <FileMark title={document.title} size={20} />
              <span className="min-w-0 flex-1 truncate text-ui text-fg" title={path}>
                {nb(path)}
              </span>
              {document.reading && (
                <span className="shrink-0 text-label text-muted">{t('reading')}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </SidePanel>
  );
}
