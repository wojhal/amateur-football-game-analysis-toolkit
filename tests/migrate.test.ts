import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '../src/lib/types';
import { migrateInterceptions } from '../src/lib/migrate';
import { makeVideo } from './helpers';

let n = 0;
function ev(partial: Partial<MatchEvent> & Pick<MatchEvent, 'type' | 'teamId' | 'playerId'>): MatchEvent {
  return {
    id: `e${n++}`,
    videoId: 'v1',
    videoTime: 10,
    successful: true,
    start: { x: 50, y: 30 },
    ...partial,
  };
}

describe('migrateInterceptions', () => {
  const videos = [makeVideo('v1', 0, 2760, 0), makeVideo('v2', 1, 2820, 0)];

  it('merges standalone interceptions into the preceding failed passes and removes them', () => {
    const failedPass = ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: false, videoTime: 100 });
    const interception = ev({ type: 'interception', teamId: 'away', playerId: 'away-1', videoTime: 102 });
    const okPass = ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: true, videoTime: 110 });
    // A failed pass with no interception after it: outcome stays unknown.
    const lateFail = ev({ type: 'pass', teamId: 'away', playerId: 'away-0', successful: false, videoTime: 200 });

    const r = migrateInterceptions([failedPass, interception, okPass, lateFail], videos);

    expect(r.removedIds).toEqual([interception.id]);
    expect(r.events.some((e) => e.type === 'interception')).toBe(false);

    const migrated = r.events.find((e) => e.id === failedPass.id)!;
    expect(migrated.passOutcome).toBe('intercepted');
    expect(migrated.secondPlayerId).toBe('away-1');
    expect(r.changed).toEqual([migrated]);

    expect(r.events.find((e) => e.id === okPass.id)!.passOutcome).toBeUndefined();
    expect(r.events.find((e) => e.id === lateFail.id)!.passOutcome).toBeUndefined();
  });

  it('matches across periods by match clock and takes the NEXT interception', () => {
    // Failed pass late in the 1st half; interception early in the 2nd half.
    const failedPass = ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: false, videoId: 'v1', videoTime: 2700 });
    const int2 = ev({ type: 'interception', teamId: 'away', playerId: 'away-0', videoId: 'v2', videoTime: 5 });
    // An earlier interception (before the pass) must NOT be used.
    const int1 = ev({ type: 'interception', teamId: 'away', playerId: 'away-1', videoId: 'v1', videoTime: 50 });

    const r = migrateInterceptions([failedPass, int2, int1], videos);
    const migrated = r.events.find((e) => e.id === failedPass.id)!;
    expect(migrated.secondPlayerId).toBe('away-0');
    expect(r.removedIds).toHaveLength(2);
  });

  it('does not touch passes that already have an outcome', () => {
    const done = ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: false, passOutcome: 'out', videoTime: 10 });
    const int = ev({ type: 'interception', teamId: 'away', playerId: 'away-0', videoTime: 12 });
    const r = migrateInterceptions([done, int], videos);
    expect(r.events.find((e) => e.id === done.id)!.passOutcome).toBe('out');
    expect(r.changed).toHaveLength(0);
    expect(r.removedIds).toEqual([int.id]);
  });

  it('is a no-op on already-migrated data', () => {
    const events = [
      ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: false, passOutcome: 'intercepted', secondPlayerId: 'away-0' }),
      ev({ type: 'shot', teamId: 'home', playerId: 'home-0' }),
    ];
    const r = migrateInterceptions(events, videos);
    expect(r.changed).toHaveLength(0);
    expect(r.removedIds).toHaveLength(0);
    expect(r.events).toHaveLength(2);
  });
});
