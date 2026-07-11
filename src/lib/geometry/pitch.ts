/**
 * IFAB pitch geometry. All values in meters. The pitch frame matches the SVG
 * frame: origin top-left, x along the length (rightward), y along the width
 * (downward). Fixed elements keep their IFAB size regardless of pitch size.
 */

export const IFAB = {
  PENALTY_AREA_DEPTH: 16.5,
  PENALTY_AREA_WIDTH: 40.32, // 16.5 * 2 + 7.32
  GOAL_AREA_DEPTH: 5.5,
  GOAL_AREA_WIDTH: 18.32, // 5.5 * 2 + 7.32
  PENALTY_MARK_DIST: 11,
  CIRCLE_R: 9.15,
  CORNER_R: 1,
  GOAL_WIDTH: 7.32,
  GOAL_HEIGHT: 2.44,
  MIN_LENGTH: 90,
  MAX_LENGTH: 120,
  MIN_WIDTH: 45,
  MAX_WIDTH: 90,
} as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export interface PitchMarkings {
  length: number;
  width: number;
  outline: Rect;
  halfwayX: number;
  centerCircle: Circle;
  centerMark: Circle;
  penaltyAreas: [Rect, Rect]; // left, right
  goalAreas: [Rect, Rect];
  penaltyMarks: [Circle, Circle];
  /** SVG path strings for the penalty arcs (the D outside the box). */
  penaltyArcs: [string, string];
  /** SVG path strings for the four corner arcs. */
  cornerArcs: string[];
  /** Goal mouths drawn just outside the goal line. */
  goals: [Rect, Rect];
}

export function pitchMarkings(length: number, width: number): PitchMarkings {
  const cy = width / 2;
  const {
    PENALTY_AREA_DEPTH: pd,
    PENALTY_AREA_WIDTH: pw,
    GOAL_AREA_DEPTH: gd,
    GOAL_AREA_WIDTH: gw,
    PENALTY_MARK_DIST: pm,
    CIRCLE_R: r,
    CORNER_R: cr,
    GOAL_WIDTH: goalW,
  } = IFAB;

  // Penalty arc: part of the circle centered on the penalty mark that lies
  // outside the penalty area. Chord at x = pd (left side):
  const dx = pd - pm; // 5.5
  const halfChord = Math.sqrt(r * r - dx * dx);

  const leftArc = `M ${pd} ${cy - halfChord} A ${r} ${r} 0 0 1 ${pd} ${cy + halfChord}`;
  const rightArc = `M ${length - pd} ${cy - halfChord} A ${r} ${r} 0 0 0 ${length - pd} ${cy + halfChord}`;

  const goalDepth = 1.2; // purely visual depth of the goal box behind the line

  return {
    length,
    width,
    outline: { x: 0, y: 0, w: length, h: width },
    halfwayX: length / 2,
    centerCircle: { cx: length / 2, cy, r },
    centerMark: { cx: length / 2, cy, r: 0.2 },
    penaltyAreas: [
      { x: 0, y: cy - pw / 2, w: pd, h: pw },
      { x: length - pd, y: cy - pw / 2, w: pd, h: pw },
    ],
    goalAreas: [
      { x: 0, y: cy - gw / 2, w: gd, h: gw },
      { x: length - gd, y: cy - gw / 2, w: gd, h: gw },
    ],
    penaltyMarks: [
      { cx: pm, cy, r: 0.2 },
      { cx: length - pm, cy, r: 0.2 },
    ],
    penaltyArcs: [leftArc, rightArc],
    cornerArcs: [
      `M ${cr} 0 A ${cr} ${cr} 0 0 1 0 ${cr}`,
      `M ${length} ${cr} A ${cr} ${cr} 0 0 1 ${length - cr} 0`,
      `M ${length - cr} ${width} A ${cr} ${cr} 0 0 1 ${length} ${width - cr}`,
      `M 0 ${width - cr} A ${cr} ${cr} 0 0 1 ${cr} ${width}`,
    ],
    goals: [
      { x: -goalDepth, y: cy - goalW / 2, w: goalDepth, h: goalW },
      { x: length, y: cy - goalW / 2, w: goalDepth, h: goalW },
    ],
  };
}

export function clampPitchLength(v: number): number {
  return Math.min(IFAB.MAX_LENGTH, Math.max(IFAB.MIN_LENGTH, v));
}

export function clampPitchWidth(v: number): number {
  return Math.min(IFAB.MAX_WIDTH, Math.max(IFAB.MIN_WIDTH, v));
}
