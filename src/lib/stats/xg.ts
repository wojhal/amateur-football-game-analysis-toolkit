import type { AttackDir, MatchEvent, Point, VideoRef } from '../types';
import { attackDirOf } from '../types';
import { IFAB } from '../geometry/pitch';

/**
 * Expected goals (xG).
 *
 * Base model: the fitted logistic regression published in the Soccermatics
 * course (soccermatics.readthedocs.io, "Fitting the xG model"), trained on
 * Wyscout shot data. Features: goal-mouth angle (radians), distance to goal
 * center, distance to goal line (X), distance from the center line (C),
 * X², C², and angle×X.
 *
 * Freeze-frame layer: the frame is AUTHORITATIVE. The base model was fitted
 * on real shots (i.e. with a keeper), so a keeper placed on the shot line
 * reproduces the base value; no keeper placed means an empty net (1v0) and
 * adds a large boost; anything in between scales continuously with how much
 * of the shot line the keeper covers. Defenders each reduce xG in proportion
 * to how squarely they stand between the ball and the goal (full effect on
 * the shot line, Gaussian falloff sideways). The weights are calibrated
 * heuristics, kept in one place below for easy tuning.
 */

// Fitted coefficients (Soccermatics, lesson 2 xG model).
const B0 = 0.5103;
const B_ANGLE = 0.6338;
const B_DIST = -0.2798;
const B_X = 0.1243;
const B_C = -0.03;
const B_X2 = 0.0014;
const B_C2 = 0.0041;
const B_AX = -0.1251;

// Freeze-frame adjustments (log-odds).
// The base fit reflects typical defensive pressure (~one blocker near the
// shot line), so a clean look (no defenders placed) earns a bonus and each
// placed blocker pulls it back: one square blocker ≈ the fitted average.
const CLEAN_LOOK = 0.8; // no defenders between ball and goal (e.g. a 1v1)
const PER_DEFENDER = -0.9; // a defender standing exactly on the shot line
const DEF_SIGMA = 1.5; // m — lateral falloff of a defender's blocking effect
const DEF_TOTAL_CAP = -2.4; // packed box saturates
const KEEPER_ABSENT = 2.5; // empty net (no keeper placed = 1v0)
const GK_SIGMA = 1.2; // m — how quickly keeper coverage degrades sideways
const GK_ADVANCE_FROM = 8; // m from goal center where "rushed out" starts
const GK_ADVANCED = 0.6; // extra log-odds for a keeper stranded far upfield

export interface ShotInput {
  start: Point;
  attack: AttackDir;
  pitch: { length: number; width: number };
  defenders?: Point[];
  keeper?: Point | null;
}

function sign(p1: Point, p2: Point, p3: Point): number {
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

export function pointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Position of P relative to the segment S→G: `t` is the projection along the
 * segment (0 = at S, 1 = at G), `u` the perpendicular distance in meters.
 */
function lineFactors(S: Point, G: Point, P: Point): { t: number; u: number } {
  const dx = G.x - S.x;
  const dy = G.y - S.y;
  const l2 = dx * dx + dy * dy;
  const t = ((P.x - S.x) * dx + (P.y - S.y) * dy) / l2;
  const px = S.x + t * dx;
  const py = S.y + t * dy;
  return { t, u: Math.hypot(P.x - px, P.y - py) };
}

export function shotXg(input: ShotInput): number {
  const { start, attack, pitch } = input;
  const goalX = attack === 'ltr' ? pitch.length : 0;
  const cy = pitch.width / 2;
  const half = IFAB.GOAL_WIDTH / 2;

  const x = Math.max(0.1, Math.abs(goalX - start.x)); // distance to goal line
  const c = Math.abs(start.y - cy); // distance from center line
  const dist = Math.hypot(x, c);

  // Angle subtended by the goal posts as seen from the shot location.
  let angle = Math.atan((IFAB.GOAL_WIDTH * x) / (x * x + c * c - half * half));
  if (angle < 0) angle += Math.PI;

  let lp =
    B0 +
    B_ANGLE * angle +
    B_DIST * dist +
    B_X * x +
    B_C * c +
    B_X2 * x * x +
    B_C2 * c * c +
    B_AX * angle * x;

  const goalCenter: Point = { x: goalX, y: cy };

  // Defenders: each contributes in proportion to how squarely they stand
  // between the ball and the goal, capped so a packed box saturates. With
  // nobody placed the clean-look bonus applies in full (1v1 semantics).
  let defLp = 0;
  for (const d of input.defenders ?? []) {
    const { t, u } = lineFactors(start, goalCenter, d);
    if (t <= 0.02 || t >= 1) continue; // behind the shooter or behind the goal
    defLp += PER_DEFENDER * Math.exp(-(u * u) / (2 * DEF_SIGMA * DEF_SIGMA));
  }
  lp += CLEAN_LOOK + Math.max(DEF_TOTAL_CAP, defLp);

  // Keeper coverage: 1 = perfectly on the shot line (what the base model,
  // fitted on real shots, implicitly assumes), 0 = no keeper between ball
  // and goal. No keeper placed at all = empty net = coverage 0.
  let coverage = 0;
  if (input.keeper) {
    const { t, u } = lineFactors(start, goalCenter, input.keeper);
    const between = t > 0 && t < 1.05;
    coverage = between ? Math.exp(-(u * u) / (2 * GK_SIGMA * GK_SIGMA)) : 0;
    // A keeper stranded far off the goal leaves it open even when on line.
    const offGoal = Math.hypot(input.keeper.x - goalCenter.x, input.keeper.y - goalCenter.y);
    lp += GK_ADVANCED * Math.min(1, Math.max(0, (offGoal - GK_ADVANCE_FROM) / 10));
  }
  lp += KEEPER_ABSENT * (1 - coverage);

  return 1 / (1 + Math.exp(-lp));
}

/** xG for a recorded shot event, or null when it can't be computed. */
export function xgForEvent(
  e: MatchEvent,
  videos: VideoRef[],
  pitch: { length: number; width: number },
): number | null {
  if (e.type !== 'shot') return null;
  const video = videos.find((v) => v.id === e.videoId);
  if (!video) return null;
  return shotXg({
    start: e.start,
    attack: attackDirOf(video, e.teamId),
    pitch,
    defenders: e.shotContext?.defenders,
    keeper: e.shotContext?.keeper ?? null,
  });
}
