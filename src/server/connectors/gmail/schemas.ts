import { z } from 'zod';

// Seuls les champs lus. `internalDate` : millisecondes depuis 1970, en texte.

export const ProfileSchema = z.object({ emailAddress: z.string().min(1) });

export const ListSchema = z.object({
  messages: z.array(z.object({ id: z.string(), threadId: z.string() })).nullish(),
  nextPageToken: z.string().nullish(),
});

export type GmailPart = {
  mimeType?: string | null | undefined;
  filename?: string | null | undefined;
  headers?: Array<{ name: string; value: string }> | null | undefined;
  body?: { data?: string | null | undefined } | null | undefined;
  parts?: GmailPart[] | null | undefined;
};

const PartSchema: z.ZodType<GmailPart> = z.lazy(() =>
  z.object({
    mimeType: z.string().nullish(),
    filename: z.string().nullish(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })).nullish(),
    body: z.object({ data: z.string().nullish() }).nullish(),
    parts: z.array(PartSchema).nullish(),
  }),
);

export const MessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).nullish(),
  internalDate: z.string().regex(/^\d{1,15}$/),
  payload: PartSchema.nullish(),
});
export type GmailMessage = z.infer<typeof MessageSchema>;
