import { z } from 'zod';

// Seuls les champs lus.

const instant = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
const person = z.object({
  displayName: z.string().nullish(),
  emailAddress: z.string().nullish(),
  me: z.boolean().nullish(),
});

export const AboutSchema = z.object({
  user: z.object({
    displayName: z.string().nullish(),
    emailAddress: z.string().nullish(),
    permissionId: z.string().nullish(),
  }),
});

const FileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  modifiedTime: instant,
  webViewLink: z.string().nullish(),
  lastModifyingUser: person.nullish(),
});
export type DriveFile = z.infer<typeof FileSchema>;

export const FilesPageSchema = z.object({
  files: z.array(FileSchema).nullish(),
  nextPageToken: z.string().nullish(),
});
