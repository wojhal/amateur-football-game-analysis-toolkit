import { describe, expect, it } from 'vitest';
import { GOAL_MODAL, goalToSvg, isOnTarget, svgToGoal } from '../src/lib/geometry/goal';
import { normalizePoint } from '../src/lib/stats/normalize';

describe('goal frame', () => {
  it('svg <-> goal coordinate round trip', () => {
    const { gx, gy } = svgToGoal(GOAL_MODAL.MARGIN_SIDE, GOAL_MODAL.viewH);
    expect(gx).toBeCloseTo(0);
    expect(gy).toBeCloseTo(0); // left post, ground level

    const back = goalToSvg(3.66, 1.22);
    const round = svgToGoal(back.x, back.y);
    expect(round.gx).toBeCloseTo(3.66);
    expect(round.gy).toBeCloseTo(1.22);
  });

  it('on-target boundaries follow the 7.32 x 2.44 frame', () => {
    expect(isOnTarget(0, 0)).toBe(true);
    expect(isOnTarget(7.32, 2.44)).toBe(true);
    expect(isOnTarget(-0.01, 1)).toBe(false);
    expect(isOnTarget(3, 2.5)).toBe(false);
  });
});

describe('coordinate normalization', () => {
  it('flips both axes for right-to-left attack', () => {
    expect(normalizePoint({ x: 10, y: 20 }, 'rtl', 105, 68)).toEqual({ x: 95, y: 48 });
    expect(normalizePoint({ x: 10, y: 20 }, 'ltr', 105, 68)).toEqual({ x: 10, y: 20 });
  });
});
