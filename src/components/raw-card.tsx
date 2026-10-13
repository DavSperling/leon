import { CopyButton } from '@/components/copy-button';

const TOKEN_BUDGET = 600;

// Estimation grossière : un jeton pour quatre caractères.
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

// Onglet Brut : exactement le texte que `fetch` renvoie à un assistant, rien d'autre.
export function RawCard({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          Exactement ce que reçoit un assistant via fetch.
        </p>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs leading-4 text-muted-foreground tabular-nums">
            ~{estimateTokens(text)} / {TOKEN_BUDGET} tokens
          </span>
          <CopyButton text={text} />
        </div>
      </div>
      <pre className="rounded-md border bg-card p-4 font-mono text-[13px] leading-5 wrap-break-word whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  );
}
