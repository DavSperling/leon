import type { SourceKind } from '@/capture/turn';

// Sans import de la base : l'alerte de retard se teste et s'importe côté client sans Postgres.
export type ChannelHealth = { kind: SourceKind; kindLabel: string; lastCaptureAt: Date | null };

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// Canaux déjà utilisés dont la dernière capture date de plus de 24 h ; un canal jamais utilisé n'est pas en retard.
export function staleChannels(channels: ChannelHealth[], now: Date): ChannelHealth[] {
  return channels.filter(
    (channel) =>
      channel.lastCaptureAt !== null &&
      now.getTime() - channel.lastCaptureAt.getTime() > STALE_AFTER_MS,
  );
}
