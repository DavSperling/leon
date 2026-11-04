import type { NextRequest } from 'next/server';
import { createTranslator } from 'next-intl';
import { documentationMarkdown } from '@/components/site/pages/documentation-markdown';
import { LOCALE_COOKIE, loadMessages, localeOf, locales } from '@/i18n/request';
import {
  claudeCodeInstructions,
  installCommand,
  serverAddress,
} from '@/server/cli/install-command';

// GET /documentation.md : la page Documentation en Markdown pur, pour un agent (la page l'annonce par un
// <link rel="alternate"> et son mode « Pour un agent » le montre). Public, sans session ni base, aucun cookie posé : elle
// ne porte que l'adresse du serveur, comme la page. La langue suit la règle du site : ?lang=fr|en, sinon le cookie
// leon-locale, sinon l'anglais. Réponse jamais gardée en cache : elle dépend de la requête.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const asked = request.nextUrl.searchParams.get('lang');
  const locale =
    locales.find((one) => one === asked) ?? localeOf(request.cookies.get(LOCALE_COOKIE)?.value);
  const messages = await loadMessages(locale);
  const markdown = documentationMarkdown({
    locale,
    messages,
    command: installCommand(),
    address: serverAddress(),
    instructions: claudeCodeInstructions(
      createTranslator({ locale, messages, namespace: 'claudeCode' }),
    ),
  });
  return new Response(markdown, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
