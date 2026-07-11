import { IFAB } from './pitch';

/**
 * Goal-mouth frame for the shot-placement modal. Coordinates stored on events:
 * gx = meters from the left post (0..7.32 is inside the frame),
 * gy = meters above the ground (0..2.44 is under the bar).
 * The modal shows a margin around the frame; placements in the margin are
 * "narrowly off target". Bigger misses use the wide/high buttons.
 */
export const GOAL_MODAL = {
  MARGIN_SIDE: 1.8,
  MARGIN_TOP: 1.4,
  /** Total drawable area in meters. */
  viewW: IFAB.GOAL_WIDTH + 2 * 1.8,
  viewH: IFAB.GOAL_HEIGHT + 1.4,
} as const;

/** Convert a point in the modal's SVG frame (origin top-left, y down) to goal coords. */
export function svgToGoal(svgX: number, svgY: number): { gx: number; gy: number } {
  return {
    gx: svgX - GOAL_MODAL.MARGIN_SIDE,
    gy: GOAL_MODAL.viewH - svgY,
  };
}

/** Convert goal coords back to the modal's SVG frame. */
export function goalToSvg(gx: number, gy: number): { x: number; y: number } {
  return {
    x: gx + GOAL_MODAL.MARGIN_SIDE,
    y: GOAL_MODAL.viewH - gy,
  };
}

export function isOnTarget(gx: number, gy: number): boolean {
  return gx >= 0 && gx <= IFAB.GOAL_WIDTH && gy >= 0 && gy <= IFAB.GOAL_HEIGHT;
}
