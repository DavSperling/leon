import { RevokeTokenButton } from '@/components/revoke-token-button';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import type { ApiTokenRow } from '@/server/auth/api-tokens';

export function TokenList({ tokens }: { tokens: ApiTokenRow[] }) {
  const now = new Date();
  return (
    <ul className="overflow-hidden rounded-xl border">
      {tokens.map((token) => (
        <li
          key={token.id}
          className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 border-b px-5 py-2.5 text-[15px] transition-colors last:border-b-0 hover:bg-muted/40"
        >
          <span className="min-w-40 font-medium">{token.name}</span>
          <span className="font-mono text-xs leading-4 text-muted-foreground">
            leon_…{token.hint}
          </span>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            créé le{' '}
            <time dateTime={token.createdAt.toISOString()}>{formatDate(token.createdAt)}</time>
          </span>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {token.lastUsedAt ? (
              <>
                utilisé{' '}
                <time
                  dateTime={token.lastUsedAt.toISOString()}
                  title={formatDateTime(token.lastUsedAt)}
                >
                  {formatRelative(token.lastUsedAt, now)}
                </time>
              </>
            ) : (
              'jamais utilisé'
            )}
          </span>
          <span className="ml-auto">
            <RevokeTokenButton tokenId={token.id} name={token.name} />
          </span>
        </li>
      ))}
    </ul>
  );
}
