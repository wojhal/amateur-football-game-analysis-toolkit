import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '../src/lib/types';
import { pointInTriangle, shotXg, xgForEvent } from '../src/lib/stats/xg';
import { xtForPass, xtValue, XT_GRID } from '../src/lib/stats/xt';
import { makeVideo } from './helpers';

const pitch = { length: 105, width: 68 };

describe('xG model', () => {
  it('gives plausible values at the penalty spot: 1v1 ~0.33, avg pressure ~0.2, empty net ~0.85', () => {
    const gk = { x: 104, y: 34 }; // keeper on the shot line, central shots
    const spot = { x: 94, y: 34 }; // penalty spot, attacking ltr on 105 m

    // Clean 1v1: keeper set, nobody else between ball and goal.
    const oneVsOne = shotXg({ start: spot, attack: 'ltr', pitch, keeper: gk });
    expect(oneVsOne).toBeGreaterThan(0.25);
    expect(oneVsOne).toBeLessThan(0.45);

    // Keeper + a blocker square on the line ≈ the fitted league average.
    const contested = shotXg({
      start: spot,
      attack: 'ltr',
      pitch,
      keeper: gk,
      defenders: [{ x: 99, y: 34 }],
    });
    expect(contested).toBeGreaterThan(0.1);
    expect(contested).toBeLessThan(0.3);

    // No keeper placed: 1v0 / empty net.
    const emptyNet = shotXg({ start: spot, attack: 'ltr', pitch });
    expect(emptyNet).toBeGreaterThan(0.7);
    expect(emptyNet).toBeLessThan(0.95);

    // 6 m central beats the spot; a 25 m 1v1 stays a low-probability shot.
    const close = shotXg({ start: { x: 99, y: 34 }, attack: 'ltr', pitch, keeper: gk });
    const far = shotXg({ start: { x: 80, y: 34 }, attack: 'ltr', pitch, keeper: gk });
    expect(close).toBeGreaterThan(oneVsOne);
    expect(far).toBeLessThan(0.12);
  });

  it('is symmetric across attack directions', () => {
    const ltr = shotXg({ start: { x: 94, y: 34 }, attack: 'ltr', pitch });
    const rtl = shotXg({ start: { x: 11, y: 34 }, attack: 'rtl', pitch });
    expect(rtl).toBeCloseTo(ltr, 10);
  });

  it('defenders between ball and goal lower xG; far away they do not', () => {
    const base = shotXg({ start: { x: 94, y: 34 }, attack: 'ltr', pitch });
    const blockerIn = shotXg({
      start: { x: 94, y: 34 },
      attack: 'ltr',
      pitch,
      defenders: [{ x: 100, y: 34 }],
    });
    const blockerBehind = shotXg({
      start: { x: 94, y: 34 },
      attack: 'ltr',
      pitch,
      defenders: [{ x: 90, y: 34 }], // behind the shooter
    });
    expect(blockerIn).toBeLessThan(base);
    expect(blockerBehind).toBeCloseTo(base, 10);
  });

  it('defender effect is continuous: right in front counts, fades sideways', () => {
    const at = (defenders: { x: number; y: number }[]) =>
      shotXg({ start: { x: 94, y: 34 }, attack: 'ltr', pitch, defenders });
    const base = shotXg({ start: { x: 94, y: 34 }, attack: 'ltr', pitch });

    const inFront = at([{ x: 95.5, y: 34 }]); // 1.5 m in front, on the line
    const slightlyOff = at([{ x: 95.5, y: 35.5 }]); // 1.5 m to the side
    const wideOff = at([{ x: 95.5, y: 44 }]); // 10 m to the side

    expect(inFront).toBeLessThan(base);
    expect(slightlyOff).toBeGreaterThan(inFront);
    expect(slightlyOff).toBeLessThan(base);
    expect(wideOff).toBeCloseTo(base, 3);

    // Two blockers are worse than one; a packed box saturates at the cap.
    const two = at([{ x: 95.5, y: 34 }, { x: 100, y: 34 }]);
    expect(two).toBeLessThan(inFront);
    const packed = at(Array.from({ length: 8 }, (_, i) => ({ x: 96 + i, y: 34 })));
    const packedMore = at(Array.from({ length: 10 }, (_, i) => ({ x: 95.5 + i, y: 34 })));
    expect(packedMore).toBeCloseTo(packed, 2); // cap reached
  });

  it('keeper coverage is continuous: on the line = normal, absent = empty net', () => {
    const gk = (keeper: { x: number; y: number }) =>
      shotXg({ start: { x: 94, y: 34 }, attack: 'ltr', pitch, keeper });
    const emptyNet = shotXg({ start: { x: 94, y: 34 }, attack: 'ltr', pitch });

    const onLine = gk({ x: 104, y: 34 });
    const off2m = gk({ x: 104, y: 36 });
    expect(emptyNet).toBeGreaterThan(onLine); // no keeper is the best case
    expect(off2m).toBeGreaterThan(onLine);
    expect(off2m).toBeLessThan(emptyNet);

    // Fully off the line ≈ empty net (plus a small rushed-out penalty).
    expect(gk({ x: 104, y: 20 })).toBeGreaterThanOrEqual(emptyNet);
    // Stranded far upfield: goal open even though they're on the shot line.
    expect(gk({ x: 80, y: 34 })).toBeGreaterThan(emptyNet);
  });

  it('pointInTriangle basic checks', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    const c = { x: 0, y: 10 };
    expect(pointInTriangle({ x: 2, y: 2 }, a, b, c)).toBe(true);
    expect(pointInTriangle({ x: 9, y: 9 }, a, b, c)).toBe(false);
  });

  it('xgForEvent uses the event freeze frame and attack direction', () => {
    const videos = [makeVideo('v1', 0, 2700, 0)]; // home attacks ltr
    const e: MatchEvent = {
      id: 'e1',
      type: 'shot',
      videoId: 'v1',
      videoTime: 10,
      teamId: 'home',
      playerId: 'p1',
      successful: false,
      start: { x: 94, y: 34 },
      shotTarget: { gx: 3, gy: 1 },
      shotContext: { defenders: [{ x: 100, y: 34 }] },
    };
    const withFrame = xgForEvent(e, videos, pitch)!;
    const without = xgForEvent({ ...e, shotContext: undefined }, videos, pitch)!;
    expect(withFrame).toBeLessThan(without);
    expect(xgForEvent({ ...e, type: 'pass' }, videos, pitch)).toBeNull();
  });
});

describe('xT', () => {
  it('grid is 8x12 and rises toward the goal', () => {
    expect(XT_GRID).toHaveLength(8);
    expect(XT_GRID[0]).toHaveLength(12);
    expect(xtValue({ x: 100, y: 34 }, pitch.length, pitch.width)).toBeGreaterThan(
      xtValue({ x: 10, y: 34 }, pitch.length, pitch.width),
    );
  });

  it('forward passes gain xT, backward passes lose it (negative)', () => {
    const videos = [makeVideo('v1', 0, 2700, 0)];
    const base: MatchEvent = {
      id: 'p',
      type: 'pass',
      videoId: 'v1',
      videoTime: 5,
      teamId: 'home',
      playerId: 'p1',
      successful: true,
      start: { x: 50, y: 34 },
      end: { x: 90, y: 34 },
    };
    const forward = xtForPass(base, videos, pitch)!;
    const backward = xtForPass(
      { ...base, start: { x: 90, y: 34 }, end: { x: 50, y: 34 } },
      videos,
      pitch,
    )!;
    expect(forward).toBeGreaterThan(0);
    expect(backward).toBeLessThan(0);
    expect(backward).toBeCloseTo(-forward, 10);
  });

  it('failed passes carry no xT', () => {
    const videos = [makeVideo('v1', 0, 2700, 0)]; // home attacks ltr
    const e: MatchEvent = {
      id: 'p3',
      type: 'pass',
      videoId: 'v1',
      videoTime: 5,
      teamId: 'home',
      playerId: 'p1',
      successful: false,
      passOutcome: 'intercepted',
      secondPlayerId: 'a1',
      start: { x: 50, y: 34 },
      end: { x: 60, y: 34 },
    };
    // Ball losses carry no xT — neither intercepted nor out of bounds.
    expect(xtForPass(e, videos, pitch)).toBeNull();
    expect(xtForPass({ ...e, passOutcome: 'out', secondPlayerId: undefined }, videos, pitch)).toBeNull();
  });

  it('normalizes by attack direction and skips incomplete passes', () => {
    const videos = [makeVideo('v1', 0, 2700, 0)]; // away attacks rtl in v1
    const awayForward: MatchEvent = {
      id: 'p2',
      type: 'pass',
      videoId: 'v1',
      videoTime: 5,
      teamId: 'away',
      playerId: 'a1',
      successful: true,
      start: { x: 55, y: 34 },
      end: { x: 15, y: 34 },
    };
    expect(xtForPass(awayForward, videos, pitch)!).toBeGreaterThan(0);
    expect(xtForPass({ ...awayForward, successful: false }, videos, pitch)).toBeNull();
  });
});
