'use client';

import { ChevronRight, FileText, Folder, FolderOpen, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useActionState,
  useRef,
  useState,
} from 'react';
import {
  addFileAction,
  deleteDocumentAction,
  deleteFolderAction,
  uploadDocumentAction,
} from '@/app/(app)/documents/actions';
import {
  Button,
  EmptyState,
  Field,
  GlassCard,
  Notice,
  PageHeader,
  Section,
  Select,
} from '@/components/verre';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  FOLDER_MAX_FILES,
  selectFolderFiles,
} from '@/lib/documents';
import { formatRelative } from '@/lib/format';
import { nb } from '@/lib/verre';
import { cn } from '@/lib/verre/cn';
import { type PickedFile, type PickedFolder, readDropped, readPicked } from './dropped-files';
import { type GroupOption, ShareSelect, usePartageLabel, usePartageOptions } from './partage';

type DocumentRow = {
  id: string;
  title: string | null;
  createdAt: Date;
  ownerUserId: string;
  ownerName: string;
  folderId: string | null;
  folderName: string | null;
  ownerFormer: boolean;
  partage: string; // 'equipe', 'moi' ou l'id d'un groupe (listDocuments)
};

// Les fichiers d'un même dossier (et d'un même auteur), regroupés sur une ligne de la liste.
type FolderGroup = { key: string; id: string; name: string; documents: DocumentRow[] };

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

function FormatIcon({ title }: { title: string | null }) {
  const logo = LOGOS[title?.split('.').pop()?.toLowerCase() ?? ''];
  if (!logo)
    return (
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center">
        <FileText className="size-4 text-accent" strokeWidth={1.7} />
      </span>
    );
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-chip border border-line bg-[#fff]"
    >
      {/* biome-ignore lint/performance/noImgElement: petit SVG statique, rien à optimiser */}
      <img src={`/logos/${logo}.svg`} alt="" className="size-5" />
    </span>
  );
}

type Report = { tone: 'success' | 'warning' | 'error'; text: string };

function UploadForm({ groups }: { groups: GroupOption[] }) {
  const t = useTranslations('documents');
  const partageOptions = usePartageOptions(groups);
  // Le partage vaut pour tout l'envoi : le formulaire le poste, les fichiers d'un dossier le portent un par un.
  const [partage, setPartage] = useState('equipe');
  const router = useRouter();
  const [state, action, pending] = useActionState(uploadDocumentAction, {
    error: null,
    partial: false,
  });
  // Au-delà de la limite de Next, la requête est refusée avant l'action et la page d'erreur s'affiche :
  // la taille se vérifie avant l'envoi (le serveur la vérifie aussi).
  const [tooBig, setTooBig] = useState(false);
  // Un dossier ou des fichiers glissés partent un par un (une requête est limitée à 12 Mo) : `progress` en dit l'avancée.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [dragging, setDragging] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const sending = progress !== null;
  const checkSize = (event: FormEvent<HTMLFormElement>) => {
    const file = new FormData(event.currentTarget).get('file');
    const refused = file instanceof File && file.size > DOCUMENT_MAX_BYTES;
    setReport(null);
    setTooBig(refused);
    if (refused) event.preventDefault();
  };

  async function send(picking: Promise<{ folders: PickedFolder[]; singles: PickedFile[] }>) {
    setReport(null);
    setProgress({ done: 0, total: 0 });
    try {
      const { folders, singles } = await picking;
      const chosen = folders.map(({ name, files }) => ({
        id: crypto.randomUUID(),
        name,
        ...selectFolderFiles(files),
      }));
      const alone = selectFolderFiles(singles);
      // Le chemin part sans sa racine : le serveur ajoute le nom du dossier au titre.
      const uploads = [
        ...chosen.flatMap(({ id, name, kept }) =>
          kept.map(({ file, path }) => ({ file, folder: { id, name, path } })),
        ),
        ...alone.kept.map(({ file }) => ({ file, folder: null })),
      ];
      // Le plafond vaut pour tout l'envoi : dossiers et fichiers seuls ensemble.
      const refusal =
        uploads.length > FOLDER_MAX_FILES
          ? t('tooManyFiles', { count: uploads.length, max: FOLDER_MAX_FILES })
          : uploads.length === 0 && t('noReadableFiles');
      if (refusal) {
        setReport({ tone: 'error', text: refusal });
        return;
      }

      const total = uploads.length;
      const counts = {
        added: 0,
        partial: 0,
        skipped: alone.skipped + chosen.reduce((sum, { skipped }) => sum + skipped, 0),
        failed: 0,
      };
      setProgress({ done: 0, total });
      for (const [index, { file, folder }] of uploads.entries()) {
        const body = new FormData();
        body.set('file', file);
        body.set('partage', partage);
        if (folder) {
          body.set('folderId', folder.id);
          body.set('folderName', folder.name);
          body.set('path', folder.path);
        }
        // Une erreur réseau n'arrête pas les fichiers suivants.
        const result = await addFileAction(body).catch(() => null);
        if (!result || result.error) counts.failed += 1;
        else if (result.partial) counts.partial += 1;
        else counts.added += 1;
        setProgress({ done: index + 1, total });
      }
      const text = (['added', 'partial', 'skipped', 'failed'] as const)
        .filter((key) => counts[key] > 0)
        .map((key) => t(`report.${key}`, { count: counts[key] }))
        .join(' · ');
      setReport({ tone: counts.failed > 0 ? 'warning' : 'success', text });
      router.refresh();
    } catch {
      setReport({ tone: 'error', text: t('errors.failed') });
    } finally {
      setProgress(null);
    }
  }

  const pickFolder = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = ''; // pour pouvoir choisir deux fois le même dossier
    void send(Promise.resolve(readPicked(files)));
  };

  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (sending) return;
    // Les éléments déposés ne sont valides que pendant l'événement : leurs entrées se prennent tout de suite. Sans
    // entrée, le fichier lui-même.
    const entries = [...event.dataTransfer.items].flatMap((item) =>
      item.kind === 'file' ? (item.webkitGetAsEntry() ?? item.getAsFile() ?? []) : [],
    );
    void send(readDropped(entries));
  };

  const error = tooBig ? 'unreadable' : state.error;
  const idle = !sending && !report && !pending;
  return (
    <GlassCard
      variant="raised"
      className={cn('p-5 transition-colors', dragging && 'border-accent bg-accent-soft')}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault(); // sinon le navigateur ouvre le fichier déposé
        setDragging(!sending);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={drop}
    >
      <form action={action} onSubmit={checkSize} className="flex flex-wrap items-end gap-4">
        <label className="grid min-w-0 flex-1 gap-2 text-label font-medium text-fg-2">
          {t('chooseFile')}
          <input
            type="file"
            name="file"
            required
            accept={DOCUMENT_ACCEPT}
            aria-describedby="formats-documents"
            className="block w-full rounded-field border border-line bg-glass-2 px-3 py-2 text-ui text-fg file:mr-3 file:rounded-full file:border-0 file:bg-glass-3 file:px-3 file:py-1.5 file:text-label file:font-medium file:text-fg"
          />
        </label>
        <Field label={t('shareWith')} className="w-44">
          <Select
            name="partage"
            value={partage}
            onValueChange={setPartage}
            disabled={sending || pending}
            options={partageOptions}
          />
        </Field>
        <Button type="submit" icon={Upload} variant="primary" loading={pending} disabled={sending}>
          {t('add')}
        </Button>
        <Button
          icon={FolderOpen}
          disabled={sending || pending}
          aria-describedby="formats-documents"
          onClick={() => folderInput.current?.click()}
        >
          {t('chooseFolder')}
        </Button>
        {/* `webkitdirectory` n'existe pas dans les types de React : posé par un objet d'attributs. */}
        <input
          ref={folderInput}
          type="file"
          multiple
          hidden
          onChange={pickFolder}
          {...{ webkitdirectory: '' }}
        />
      </form>
      <p id="formats-documents" className="mt-3 text-label text-muted">
        {t('formats')}
      </p>
      <p className="mt-1 text-label text-muted">{t('dropHint')}</p>
      {progress && progress.total > 0 && (
        <Notice tone="info" className="mt-4" live="status">
          {t('sending', progress)}
        </Notice>
      )}
      {report && (
        <Notice
          tone={report.tone}
          className="mt-4"
          live={report.tone === 'error' ? 'alert' : 'status'}
        >
          {nb(report.text)}
        </Notice>
      )}
      {idle && error && (
        <Notice tone="error" className="mt-4" live="alert">
          {nb(t(`errors.${error}`))}
        </Notice>
      )}
      {idle && !error && state.partial && (
        <Notice tone="warning" className="mt-4" live="status">
          {nb(t('partial'))}
        </Notice>
      )}
    </GlassCard>
  );
}

// `path` : le chemin du fichier dans son dossier ; l'auteur est alors celui du dossier.
function DocumentItem({
  document,
  viewerId,
  admin,
  groups,
  path,
}: {
  document: DocumentRow;
  viewerId: string;
  admin: boolean;
  groups: GroupOption[];
  path?: string;
}) {
  const t = useTranslations('documents');
  const tSettings = useTranslations('settings');
  const locale = useLocale();
  const partageLabel = usePartageLabel(groups);
  const owner = document.ownerUserId === viewerId;
  const full = document.title || t('untitled');
  const title = path ?? full;
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-0">
      <FormatIcon title={document.title} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-fg" title={title}>
          {nb(title)}
        </p>
        {!path && (
          <p className="mt-0.5 text-label text-muted">
            {nb(
              t('addedBy', {
                name: document.ownerFormer
                  ? tSettings('formerMember', { name: document.ownerName })
                  : document.ownerName,
                when: formatRelative(document.createdAt, new Date(), locale),
              }),
            )}
            {!owner && ` · ${partageLabel(document.partage)}`}
          </p>
        )}
      </div>
      {owner && !path && (
        <ShareSelect
          target={{ id: document.id }}
          value={document.partage}
          groups={groups}
          label={t('shareLabel', { title: full })}
        />
      )}
      {(owner || (admin && document.ownerFormer)) && (
        <form action={deleteDocumentAction}>
          <input type="hidden" name="id" value={document.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            icon={Trash2}
            aria-label={t('deleteLabel', { title: full })}
          >
            {t('delete')}
          </Button>
        </form>
      )}
    </li>
  );
}

// Le dossier d'un ancien membre ne se supprime pas d'un coup : un administrateur retire ses fichiers un par un.
function FolderItem({
  folder,
  viewerId,
  admin,
  groups,
}: {
  folder: FolderGroup;
  viewerId: string;
  admin: boolean;
  groups: GroupOption[];
}) {
  const t = useTranslations('documents');
  const locale = useLocale();
  const partageLabel = usePartageLabel(groups);
  // La liste va du plus récent au plus ancien : le premier fichier dit l'auteur et la date du dossier.
  const [latest] = folder.documents;
  const prefix = `${folder.name}/`;
  const files = folder.documents
    .map((document) => {
      const title = document.title || t('untitled');
      return { document, path: title.startsWith(prefix) ? title.slice(prefix.length) : title };
    })
    .sort((a, b) => a.path.localeCompare(b.path, locale));
  const owner = latest?.ownerUserId === viewerId;
  // « Supprimer le dossier » est posé sur la ligne, hors du `<summary>` : la liste dépliée garde toute la largeur
  // (sur un téléphone, à côté du bouton, les chemins n'auraient plus de place).
  return (
    <li className="relative border-b border-line py-3 last:border-0">
      <details className="group min-w-0">
        <summary
          className={cn(
            'flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden',
            owner && 'pr-12 sm:pr-48',
          )}
        >
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center">
            <Folder className="size-4 text-accent" strokeWidth={1.7} />
          </span>
          <span className="block min-w-0 flex-1">
            <span className="block truncate text-ui font-medium text-fg" title={folder.name}>
              {nb(folder.name)}
            </span>
            <span className="mt-0.5 block text-label text-muted">
              {nb(
                `${t('folderFiles', { count: files.length })} · ${t('addedBy', {
                  name: latest?.ownerName ?? '',
                  when: latest ? formatRelative(latest.createdAt, new Date(), locale) : '',
                })} · ${partageLabel(latest?.partage ?? 'equipe')}`,
              )}
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90"
          />
        </summary>
        {/* Le dossier se partage d'un bloc : ses fichiers suivent tous le même choix. */}
        {owner && latest && (
          <div className="mt-3 ml-4 flex flex-wrap items-center gap-3 sm:ml-11">
            <span className="text-label font-medium text-fg-2">{t('shareWith')}</span>
            <ShareSelect
              target={{ folderId: folder.id }}
              value={latest.partage}
              groups={groups}
              label={t('shareFolderLabel', { name: folder.name })}
            />
          </div>
        )}
        <ul className="mt-1 ml-4 sm:ml-11">
          {files.map(({ document, path }) => (
            <DocumentItem
              key={document.id}
              document={document}
              viewerId={viewerId}
              admin={admin}
              groups={groups}
              path={path}
            />
          ))}
        </ul>
      </details>
      {owner && (
        <form action={deleteFolderAction} className="absolute top-4 right-0">
          <input type="hidden" name="id" value={folder.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            icon={Trash2}
            aria-label={t('deleteFolderLabel', { name: folder.name })}
          >
            {/* Sur un téléphone, l'icône seule : le libellé reste dans aria-label. */}
            <span className="max-sm:sr-only">{t('deleteFolder')}</span>
          </Button>
        </form>
      )}
    </li>
  );
}

// Les lignes de la liste : un dossier à la place de son premier fichier, les documents seuls tels quels. Le dossier
// se reconnaît à son identifiant ET à son auteur : un identifiant repris par un autre membre reste à part.
function groupDocuments(documents: DocumentRow[]): (DocumentRow | FolderGroup)[] {
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
  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Section title={t('addSection')} className="mt-0">
        <UploadForm groups={groups} />
      </Section>
      <Section title={t('teamSection')} description={t('teamDescription')}>
        {documents.length === 0 ? (
          <EmptyState icon={FileText} title={t('emptyTitle')} description={t('emptyDescription')} />
        ) : (
          <GlassCard className="px-4">
            <ul>
              {groupDocuments(documents).map((row) =>
                'documents' in row ? (
                  <FolderItem
                    key={row.key}
                    folder={row}
                    viewerId={viewerId}
                    admin={admin}
                    groups={groups}
                  />
                ) : (
                  <DocumentItem
                    key={row.id}
                    document={row}
                    viewerId={viewerId}
                    admin={admin}
                    groups={groups}
                  />
                ),
              )}
            </ul>
          </GlassCard>
        )}
      </Section>
    </div>
  );
}
