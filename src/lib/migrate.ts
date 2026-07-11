import type { MatchEvent, VideoRef } from './types';
import { matchClock } from './video/playlist';

export interface MigrationResult {
  events: MatchEvent[];
  /** Events that were modified and need re-persisting. */
  changed: MatchEvent[];
  /** Ids of events that were removed and need deleting from storage. */
  removedIds: string[];
}

/**
 * Interceptions used to be standalone events; they are now an outcome of a
 * failed pass. For old data: every failed pass without an outcome takes the
 * interceptor from the next (by match clock) standalone interception event,
 * then all standalone interception events are removed. Failed passes with no
 * following interception keep an undefined outcome (unknown, NOT 'out' — we
 * can't tell why they failed).
 */
export function migrateInterceptions(events: MatchEvent[], videos: VideoRef[]): MigrationResult {
  const interceptions = events.filter((e) => e.type === 'interception');
  const clock = (e: MatchEvent) => matchClock(videos, e.videoId, e.videoTime);
  const byClock = [...interceptions].sort((a, b) => clock(a) - clock(b));

  const changed: MatchEvent[] = [];
  const migrated = events
    .filter((e) => e.type !== 'interception')
    .map((e) => {
      if (e.type !== 'pass' || e.successful || e.passOutcome) return e;
      const next = byClock.find((i) => clock(i) >= clock(e));
      if (!next) return e;
      const updated: MatchEvent = {
        ...e,
        passOutcome: 'intercepted',
        secondPlayerId: next.playerId,
      };
      changed.push(updated);
      return updated;
    });

  return {
    events: migrated,
    changed,
    removedIds: interceptions.map((i) => i.id),
  };
}
