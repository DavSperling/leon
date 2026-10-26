'use client';

import { FileText, Trash2, Upload } from 'lucide-react';
import { useActionState } from 'react';
import { deleteDocumentAction, uploadDocumentAction } from '@/app/(app)/documents/actions';
import { Button, EmptyState, GlassCard, Notice, PageHeader, Section } from '@/components/verre';
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
  const [state, action, pending] = useActionState(uploadDocumentAction, { error: null });
  return (
    <GlassCard variant="raised" className="p-5">
      <form action={action} className="flex flex-wrap items-end gap-4">
        <label className="grid min-w-0 flex-1 gap-2 text-label font-medium text-fg-2">
          Choisir un document
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
          Ajouter le document
        </Button>
      </form>
      <p id="formats-documents" className="mt-3 text-label text-muted">
        PDF, Word, Excel, PowerPoint, OpenDocument, CSV, texte ou Markdown · 10 Mo maximum.
      </p>
      {state.error && (
        <Notice tone="error" className="mt-4" live="alert">
          {nb(state.error)}
        </Notice>
      )}
    </GlassCard>
  );
}

function DocumentItem({ document, viewerId }: { document: DocumentRow; viewerId: string }) {
  const title = document.title || 'Document sans titre';
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-0">
      <FileText aria-hidden="true" className="size-4 shrink-0 text-accent" strokeWidth={1.7} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-fg" title={title}>
          {nb(title)}
        </p>
        <p className="mt-0.5 text-label text-muted">
          Ajouté par {nb(document.ownerName)} · {nb(formatRelative(document.createdAt, new Date()))}
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
            aria-label={`Supprimer ${title}`}
          >
            Supprimer
          </Button>
        </form>
      )}
    </li>
  );
}

export function Documents({ documents, viewerId }: { documents: DocumentRow[]; viewerId: string }) {
  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        title="Documents"
        subtitle="Ajoutez des fichiers pour que l’équipe puisse les retrouver dans la recherche et les discussions."
      />
      <Section title="Ajouter un document" className="mt-0">
        <UploadForm />
      </Section>
      <Section
        title="Documents de l’équipe"
        description="Le texte extrait est indexé dans la mémoire de Leon."
      >
        {documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucun document pour l’instant."
            description="Ajoutez un fichier ci-dessus pour le rendre consultable par l’équipe."
          />
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
