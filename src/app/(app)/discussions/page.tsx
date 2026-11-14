import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { askSuggestions } from '@/components/discussion/ask-suggestions';
import { NewDiscussionForm } from '@/components/discussion/new-discussion-form';
import { readableProviders } from '@/components/discussion/reads';
import { Notice, PageHeader, Section } from '@/components/verre';
import { AskTiles } from '@/components/verre/discussions/ask-tiles';
import { DiscussionTiles } from '@/components/verre/discussions/list';
import { nb } from '@/lib/verre/nb';
import { readOnboardingMember } from '@/server/auth/onboarding';
import { requireUserContext } from '@/server/auth/session';
import { listCatalog } from '@/server/connectors/catalog';
import { listConnections } from '@/server/connectors/connections';
import { listDiscussions } from '@/server/discussion/discussions';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await (await getTranslations('discussions'))('newTitle') };
}

// Une nouvelle discussion : la question « Comment Leon peut-il vous aider ? » en titre, le grand champ dessous, trois questions à essayer, puis toutes les discussions de
// la personne, la plus récente d'abord (elles ne sont visibles que d'elle : la base le garantit).
export default async function DiscussionsPage() {
  const t = await getTranslations('discussions');
  const ctx = await requireUserContext();
  const [discussions, member, connections] = await Promise.all([
    listDiscussions(ctx),
    readOnboardingMember(ctx),
    listConnections(ctx),
  ]);
  // Ce que Leon lit pour cette personne, montré dans le champ (reads.ts) : six logos au plus.
  const privateByDefault = new Set(
    listCatalog()
      .filter((item) => item.privateRaw)
      .map((item) => item.id),
  );
  const reads = readableProviders(connections, privateByDefault).slice(0, 6);
  const modelAvailable = getLlm(env) !== null;
  const questions = modelAvailable ? await askSuggestions(member) : [];

  return (
    // La même colonne que le fil d'une discussion : la question part d'ici et sa réponse arrive au même endroit. Le champ
    // est le centre calme de la page, un peu au-dessus du milieu de la fenêtre.
    <div className="mx-auto w-full max-w-[736px] pt-[clamp(8px,11vh,96px)] max-shell:pt-2">
      <PageHeader title={nb(t('newQuestion'))} />
      <div className="mt-6 grid gap-3">
        <NewDiscussionForm disabled={!modelAvailable} reads={reads} />
        {!modelAvailable && (
          <Notice tone="warning" live="status">
            {t('modelUnavailable')}
          </Notice>
        )}
      </div>

      {questions.length > 0 && (
        // des questions à essayer, au service du champ : une étiquette discrète, pas un titre de section
        <section aria-labelledby="essayer" className="mt-7">
          <h2 id="essayer" className="mb-2.5 text-label font-medium text-muted">
            {t('examplesLabel')}
          </h2>
          <AskTiles questions={questions} stacked />
        </section>
      )}

      {discussions.length > 0 && (
        <Section id="vos-discussions" title={t('yourDiscussions')} className="mt-12">
          <DiscussionTiles rows={discussions.map((d) => ({ id: d.id, title: d.title }))} />
        </Section>
      )}
    </div>
  );
}
