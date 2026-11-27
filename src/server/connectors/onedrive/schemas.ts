import { z } from 'zod';

// Seuls les champs lus. Graph rend les dates en UTC, avec un Z.

const instant = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
const nextLink = { '@odata.nextLink': z.string().nullish() };

export const MeSchema = z.object({
  id: z.string().nullish(),
  displayName: z.string().nullish(),
  mail: z.string().nullish(),
  userPrincipalName: z.string().nullish(),
});

export const MyDriveSchema = z.object({ id: z.string() });

export const SitesPageSchema = z.object({
  value: z.array(
    z.object({ id: z.string(), displayName: z.string().nullish(), name: z.string().nullish() }),
  ),
  ...nextLink,
});

export const DrivesPageSchema = z.object({
  value: z.array(z.object({ id: z.string(), driveType: z.string().nullish() })),
  ...nextLink,
});

// Un élément supprimé n'a ni nom ni date (OneDrive for Business les omet) : seulement `id` et `deleted`.
const ItemSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  deleted: z.object({}).nullish(),
  file: z.object({}).nullish(),
  size: z.number().nullish(),
  webUrl: z.string().nullish(),
  lastModifiedDateTime: instant.nullish(),
  lastModifiedBy: z
    .object({
      user: z.object({ displayName: z.string().nullish(), email: z.string().nullish() }).nullish(),
    })
    .nullish(),
});
export type DriveItem = z.infer<typeof ItemSchema>;

// Une page porte l'une ou l'autre adresse : sans elles, la suite serait perdue.
export const DeltaPageSchema = z
  .object({ value: z.array(ItemSchema), ...nextLink, '@odata.deltaLink': z.string().nullish() })
  .refine((page) => Boolean(page['@odata.nextLink'] || page['@odata.deltaLink']));

export const DownloadSchema = z.object({ '@microsoft.graph.downloadUrl': z.string().nullish() });
