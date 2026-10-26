'use client';

import { FileText, Trash2, Upload } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useActionState, useState } from 'react';
import { deleteDocumentAction, uploadDocumentAction } from '@/app/(app)/documents/actions';
import { Button, EmptyState, GlassCard, Notice, PageHeader, Section } from '@/components/verre';
import { DOCUMENT_MAX_BYTES } from '@/lib/documents';
import { formatRelative } from '@/lib/format';
import { nb } from '@/lib/verre';

type DocumentRow = {
  id: string;
  title: string | null;
  createdAt: Date;
  ownerUserId: string;
  ownerName: string;
};

function UploadForm() {
  const t = useTranslations('documents');
  const [state, action, pending] = useActionState(uploadDocumentAction, {
    error: null,
    partial: false,
  });
  // Au-delà de la limite de Next, la requête est refusée avant l'action et la page d'erreur s'affiche :
  // la taille se vérifie avant l'envoi (le serveur la vérifie aussi).
  const [tooBig, setTooBig] = useState(false);
  const checkSize = (event: FormEvent<HTMLFormElement>) => {
    const file = new FormData(event.currentTarget).get('file');
    const refused = file instanceof File && file.size > DOCUMENT_MAX_BYTES;
    setTooBig(refused);
    if (refused) event.preventDefault();
  };
  const error = tooBig ? 'unreadable' : state.error;
  return (
    <GlassCard variant="raised" className="p-5">
      <form action={action} onSubmit={checkSize} className="flex flex-wrap items-end gap-4">
        <label className="grid min-w-0 flex-1 gap-2 text-label font-medium text-fg-2">
          {t('chooseFile')}
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.docx,.xlsx,.pptx,.odt,.ods,.epub,.rtf,.csv,.txt,.md,.html,.tex"
            aria-describedby="formats-documents"
            className="block w-full rounded-field border border-line bg-glass-2 px-3 py-2 text-ui text-fg file:mr-3 file:rounded-full file:border-0 file:bg-glass-3 file:px-3 file:py-1.5 file:text-label file:font-medium file:text-fg"
          />
        </label>
        <Button type="submit" icon={Upload} variant="primary" loading={pending}>
          {t('add')}
        </Button>
      </form>
      <p id="formats-documents" className="mt-3 text-label text-muted">
        {t('formats')}
      </p>
      {error && (
        <Notice tone="error" className="mt-4" live="alert">
          {nb(t(`errors.${error}`))}
        </Notice>
      )}
      {!error && state.partial && (
        <Notice tone="warning" className="mt-4" live="status">
          {nb(t('partial'))}
        </Notice>
      )}
    </GlassCard>
  );
}

function DocumentItem({ document, viewerId }: { document: DocumentRow; viewerId: string }) {
  const t = useTranslations('documents');
  const locale = useLocale();
  const title = document.title || t('untitled');
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-0">
      <FileText aria-hidden="true" className="size-4 shrink-0 text-accent" strokeWidth={1.7} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-fg" title={title}>
          {nb(title)}
        </p>
        <p className="mt-0.5 text-label text-muted">
          {nb(
            t('addedBy', {
              name: document.ownerName,
              when: formatRelative(document.createdAt, new Date(), locale),
            }),
          )}
        </p>
      </div>
      {document.ownerUserId === viewerId && (
        <form action={deleteDocumentAction}>
          <input type="hidden" name="id" value={document.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            icon={Trash2}
            aria-label={t('deleteLabel', { title })}
          >
            {t('delete')}
          </Button>
        </form>
      )}
    </li>
  );
}

export function Documents({ documents, viewerId }: { documents: DocumentRow[]; viewerId: string }) {
  const t = useTranslations('documents');
  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Section title={t('addSection')} className="mt-0">
        <UploadForm />
      </Section>
      <Section title={t('teamSection')} description={t('teamDescription')}>
        {documents.length === 0 ? (
          <EmptyState icon={FileText} title={t('emptyTitle')} description={t('emptyDescription')} />
        ) : (
          <GlassCard className="px-4">
            <ul>
              {documents.map((document) => (
                <DocumentItem key={document.id} document={document} viewerId={viewerId} />
              ))}
            </ul>
          </GlassCard>
        )}
      </Section>
    </div>
  );
}
