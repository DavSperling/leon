'use client';

import { Folder } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useRef, useState } from 'react';
import { addFileAction } from '@/app/(app)/documents/actions';
import {
  Button,
  Field,
  Notice,
  PanelClose,
  PanelDone,
  Select,
  SidePanel,
} from '@/components/verre';
import {
  DOCUMENT_ACCEPT,
  type DocumentErrorCode,
  FOLDER_MAX_FILES,
  isIgnoredPath,
  selectFolderFiles,
} from '@/lib/documents';
import { nb } from '@/lib/verre';
import { cn } from '@/lib/verre/cn';
import { type PickedFile, type PickedFolder, readPicked } from './dropped-files';
import { FileMark } from './item-panel';
import { type GroupOption, usePartageOptions, usePartageWords } from './partage';

// Ce qui attend d'être envoyé : les dossiers et les fichiers seuls choisis ou déposés, ajoutés les uns aux autres.
export type Staged = { folders: PickedFolder[]; singles: PickedFile[] };
export const NOTHING_STAGED: Staged = { folders: [], singles: [] };
export const stage = (a: Staged, b: Staged): Staged => ({
  folders: [...a.folders, ...b.folders],
  singles: [...a.singles, ...b.singles],
});

type Result = {
  counts: { added: number; partial: number; skipped: number; failed: number };
  errors: DocumentErrorCode[];
};

// Ce que l'envoi fera : par dossier, les fichiers gardés ; les fichiers seuls gardés ; ceux laissés de côté, par raison.
// Les règles sont celles du serveur (selectFolderFiles) : rien de ce qui part n'y serait refusé pour sa taille ou son type.
function planOf(staged: Staged) {
  const folders = staged.folders.map(({ name, files }) => ({ name, ...selectFolderFiles(files) }));
  const alone = selectFolderFiles(staged.singles);
  const kept = new Set(alone.kept);
  const refused = staged.singles.filter((file) => !kept.has(file));
  // l'identifiant d'un dossier se tire à l'envoi : renvoyer le même dossier remplace le précédent (addDocument)
  const uploads = [
    ...folders.flatMap(({ name, kept }, index) =>
      kept.map(({ file, path }) => ({ file, folder: { index, name, path } })),
    ),
    ...alone.kept.map(({ file }) => ({ file, folder: null })),
  ];
  return {
    folders,
    singles: alone.kept,
    // un fichier seul qui contient souvent des secrets, vide, ou illisible (type, taille) : la raison du produit
    ignored: refused.filter((f) => isIgnoredPath(f.path)),
    empty: refused.filter((f) => !isIgnoredPath(f.path) && f.size === 0),
    unreadable: refused.filter((f) => !isIgnoredPath(f.path) && f.size > 0),
    skipped: folders.reduce((sum, { skipped }) => sum + skipped, 0) + refused.length,
    uploads,
  };
}

const quoted = (files: PickedFile[]) => files.map((f) => `“${f.path}”`).join(', ');

/**
 * « Ajouter un document » : qui le verra se choisit AVANT l'envoi (un fichier privé n'est jamais indexé pour l'équipe
 * d'abord). Des fichiers ou un dossier, choisis ici ou déposés n'importe où sur la page, puis envoyés un par un (une
 * requête est limitée à 12 Mo) ; une erreur réseau n'arrête pas les suivants ; la liste se rafraîchit une fois à la fin.
 */
export function AddPanel({
  open,
  onOpenChange,
  groups,
  staged,
  onStage,
  sending,
  onSending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupOption[];
  staged: Staged;
  onStage: (next: Staged) => void;
  sending: boolean;
  onSending: (sending: boolean) => void;
}) {
  const t = useTranslations('documents');
  const router = useRouter();
  const options = usePartageOptions(groups);
  const words = usePartageWords(groups);
  const [partage, setPartage] = useState('equipe');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const plan = planOf(staged);
  const tooMany = plan.uploads.length > FOLDER_MAX_FILES;
  const noneReadable = plan.uploads.length === 0 && staged.folders.length > 0;

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = ''; // pour pouvoir choisir deux fois le même dossier
    setResult(null);
    onStage(stage(staged, readPicked(files)));
  };

  async function send() {
    if (sending || tooMany || plan.uploads.length === 0) return;
    const { uploads } = plan;
    const ids = plan.folders.map(() => crypto.randomUUID());
    const counts = { added: 0, partial: 0, skipped: plan.skipped, failed: 0 };
    const errors = new Set<DocumentErrorCode>();
    onSending(true);
    setFailed(false);
    setProgress({ done: 0, total: uploads.length });
    try {
      for (const [index, { file, folder }] of uploads.entries()) {
        const body = new FormData();
        body.set('file', file);
        body.set('partage', partage);
        if (folder) {
          body.set('folderId', ids[folder.index] as string);
          body.set('folderName', folder.name);
          body.set('path', folder.path);
        }
        // Une erreur réseau n'arrête pas les fichiers suivants.
        const state = await addFileAction(body).catch(() => null);
        if (!state || state.error) {
          counts.failed += 1;
          errors.add(state?.error ?? 'failed');
        } else if (state.partial) counts.partial += 1;
        else counts.added += 1;
        setProgress({ done: index + 1, total: uploads.length });
      }
      setResult({ counts, errors: [...errors] });
      onStage(NOTHING_STAGED);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      onSending(false);
    }
  }

  const close = (next: boolean) => {
    if (sending) return;
    onOpenChange(next);
    if (!next) {
      onStage(NOTHING_STAGED);
      setResult(null);
      setFailed(false);
      setPartage('equipe');
    }
  };

  const report = result
    ? (['added', 'partial', 'skipped', 'failed'] as const)
        .filter((key) => result.counts[key] > 0)
        .map((key) => t(`report.${key}`, { count: result.counts[key] }))
        .join(' · ')
    : '';
  const any = plan.folders.length + plan.singles.length > 0;
  const refusedCount = plan.ignored.length + plan.empty.length + plan.unreadable.length;

  return (
    <SidePanel
      open={open}
      onOpenChange={close}
      title={t('add')}
      locked={sending}
      busy={sending}
      foot={
        result ? undefined : (
          <>
            <Button
              variant="primary"
              disabled={!any || tooMany || plan.uploads.length === 0}
              loading={sending}
              loadingLabel={t('sending', progress)}
              onClick={() => void send()}
            >
              {plan.uploads.length > 0 ? t('addCount', { count: plan.uploads.length }) : t('add')}
            </Button>
            {!sending && (
              <PanelClose asChild>
                <Button variant="quiet">{t('cancel')}</Button>
              </PanelClose>
            )}
          </>
        )
      }
    >
      {result ? (
        <div className="grid gap-3">
          <PanelDone title={nb(report || t('report.added', { count: 0 }))}>
            {words.says(partage, result.counts.added + result.counts.partial)}
          </PanelDone>
          {result.counts.partial > 0 && <Notice tone="warning">{t('partial')}</Notice>}
          {result.errors.map((code) => (
            <Notice key={code} tone="error" live="alert">
              {t(`errors.${code}`)}
            </Notice>
          ))}
        </div>
      ) : (
        <div className="grid gap-5">
          <Field label={t('shareWith')} help={words.says(partage, plan.uploads.length || 1)}>
            <Select
              value={partage}
              onValueChange={setPartage}
              disabled={sending}
              options={options}
              className="max-w-[280px]"
            />
          </Field>

          <div className="grid gap-3">
            <div className="grid justify-items-start gap-3 rounded-card border border-dashed border-line-strong px-5 py-5">
              <p className="text-ui font-medium text-fg">{t('dropZone')}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={sending}
                  aria-describedby="formats-documents"
                  onClick={() => filesInput.current?.click()}
                >
                  {t('chooseFiles')}
                </Button>
                <Button
                  size="sm"
                  disabled={sending}
                  aria-describedby="formats-documents"
                  onClick={() => folderInput.current?.click()}
                >
                  {t('chooseFolder')}
                </Button>
              </div>
            </div>
            <p id="formats-documents" className="text-label leading-[1.5] text-muted">
              {nb(t('formats'))}
            </p>
            <input
              ref={filesInput}
              type="file"
              multiple
              hidden
              accept={DOCUMENT_ACCEPT}
              onChange={pick}
            />
            {/* `webkitdirectory` n'existe pas dans les types de React : posé par un objet d'attributs. */}
            <input
              ref={folderInput}
              type="file"
              multiple
              hidden
              onChange={pick}
              {...{ webkitdirectory: '' }}
            />
          </div>

          {any && (
            <ul className="grid border-t border-line" aria-label={t('files')}>
              {plan.folders.map((folder, i) => (
                <StagedRow
                  // biome-ignore lint/suspicious/noArrayIndexKey: deux dossiers du même nom peuvent être déposés
                  key={`${folder.name}-${i}`}
                  folder
                  name={folder.name}
                  caption={[
                    t('folderFiles', { count: folder.kept.length }),
                    folder.skipped > 0 && t('report.skipped', { count: folder.skipped }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
              {plan.singles.map((file, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: deux fichiers du même nom peuvent venir de deux dossiers
                <StagedRow key={`${file.path}-${i}`} name={file.path} />
              ))}
            </ul>
          )}

          {(tooMany || noneReadable || refusedCount > 0 || failed) && (
            <div className="grid gap-2" role="alert">
              {tooMany && (
                <Notice tone="error">
                  {t('tooManyFiles', { count: plan.uploads.length, max: FOLDER_MAX_FILES })}
                </Notice>
              )}
              {noneReadable && <Notice tone="error">{t('noReadableFiles')}</Notice>}
              {(
                [
                  ['unreadable', plan.unreadable],
                  ['empty', plan.empty],
                  ['ignored', plan.ignored],
                ] as const
              )
                .filter(([, files]) => files.length > 0)
                .map(([code, files]) => (
                  <Notice key={code} tone="error">
                    {nb(
                      `${t('leftOut', { count: files.length, names: quoted(files) })} ${t(`errors.${code}`)}`,
                    )}
                  </Notice>
                ))}
              {failed && <Notice tone="error">{t('errors.failed')}</Notice>}
            </div>
          )}
        </div>
      )}
    </SidePanel>
  );
}

function StagedRow({
  name,
  caption,
  folder,
}: {
  name: string;
  caption?: string;
  folder?: boolean;
}) {
  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-line py-2">
      {folder ? (
        <Folder aria-hidden="true" className="size-5 shrink-0 text-fg-2" strokeWidth={1.5} />
      ) : (
        <FileMark title={name} size={20} />
      )}
      <span className={cn('min-w-0 flex-1 truncate text-ui text-fg')} title={name}>
        {nb(name)}
      </span>
      {caption && <span className="shrink-0 text-label text-muted">{caption}</span>}
    </li>
  );
}
