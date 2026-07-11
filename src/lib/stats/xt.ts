import type { MatchEvent, Point, VideoRef } from '../types';
import { attackDirOf, isPassLike } from '../types';
import { normalizePoint } from './normalize';

/**
 * Expected threat (xT), after Karun Singh (karun.in/blog/expected-threat.html).
 * A pass's xT is the zone value at its end minus the zone value at its start
 * — negative for passes that move the ball into less threatening positions.
 *
 * The grid below is Karun Singh's published 12×8 grid
 * (karun.in/blog/data/open_xt_12x8_v1.json), trained on open event data.
 * Rows are y-bands (top to bottom), columns are x-bands attacking
 * left-to-right; coordinates are normalized to attack direction before
 * lookup.
 */
export const XT_GRID: number[][] = [
  [0.00638303, 0.00779616, 0.00844854, 0.00977659, 0.01126267, 0.01248344, 0.01473596, 0.0174506, 0.02122129, 0.02756312, 0.03485072, 0.0379259],
  [0.00750072, 0.00878589, 0.00942382, 0.0105949, 0.01214719, 0.0138454, 0.01611813, 0.01870347, 0.02401521, 0.02953272, 0.04066992, 0.04647721],
  [0.0088799, 0.00977745, 0.01001304, 0.01110462, 0.01269174, 0.01429128, 0.01685596, 0.01935132, 0.0241224, 0.02855202, 0.05491138, 0.06442595],
  [0.00941056, 0.01082722, 0.01016549, 0.01132376, 0.01262646, 0.01484598, 0.01689528, 0.0199707, 0.02385149, 0.03511326, 0.10805102, 0.25745362],
  [0.00941056, 0.01082722, 0.01016549, 0.01132376, 0.01262646, 0.01484598, 0.01689528, 0.0199707, 0.02385149, 0.03511326, 0.10805102, 0.25745362],
  [0.0088799, 0.00977745, 0.01001304, 0.01110462, 0.01269174, 0.01429128, 0.01685596, 0.01935132, 0.0241224, 0.02855202, 0.05491138, 0.06442595],
  [0.00750072, 0.00878589, 0.00942382, 0.0105949, 0.01214719, 0.0138454, 0.01611813, 0.01870347, 0.02401521, 0.02953272, 0.04066992, 0.04647721],
  [0.00638303, 0.00779616, 0.00844854, 0.00977659, 0.01126267, 0.01248344, 0.01473596, 0.0174506, 0.02122129, 0.02756312, 0.03485072, 0.0379259],
];

const COLS = 12;
const ROWS = 8;

/** Zone value for a point already normalized to attack left-to-right. */
export function xtValue(p: Point, length: number, width: number): number {
  const col = Math.min(COLS - 1, Math.max(0, Math.floor((p.x / length) * COLS)));
  const row = Math.min(ROWS - 1, Math.max(0, Math.floor((p.y / width) * ROWS)));
  return XT_GRID[row][col];
}

/**
 * xT for a pass, or null when it can't be computed.
 *
 * - Completed pass: end zone value minus start zone value (negative for
 *   backward passes).
 * - Failed passes (intercepted or out of bounds): no xT.
 */
export function xtForPass(
  e: MatchEvent,
  videos: VideoRef[],
  pitch: { length: number; width: number },
): number | null {
  if (!isPassLike(e.type) || !e.successful || !e.end) return null;
  const video = videos.find((v) => v.id === e.videoId);
  if (!video) return null;
  const dir = attackDirOf(video, e.teamId);
  const start = normalizePoint(e.start, dir, pitch.length, pitch.width);
  const end = normalizePoint(e.end, dir, pitch.length, pitch.width);
  return xtValue(end, pitch.length, pitch.width) - xtValue(start, pitch.length, pitch.width);
}
