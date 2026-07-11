import { describe, expect, it } from 'vitest';
import { IFAB, pitchMarkings } from '../src/lib/geometry/pitch';

describe('pitchMarkings', () => {
  it.each([
    [105, 68],
    [90, 45],
    [120, 90],
    [100, 64],
  ])('keeps IFAB fixed elements at %dx%d', (length, width) => {
    const m = pitchMarkings(length, width);
    const cy = width / 2;

    // Penalty areas: 16.5 deep, 40.32 wide, centered on the goal.
    expect(m.penaltyAreas[0]).toEqual({ x: 0, y: cy - 20.16, w: 16.5, h: 40.32 });
    expect(m.penaltyAreas[1]).toEqual({ x: length - 16.5, y: cy - 20.16, w: 16.5, h: 40.32 });

    // Goal areas: 5.5 deep, 18.32 wide.
    expect(m.goalAreas[0]).toEqual({ x: 0, y: cy - 9.16, w: 5.5, h: 18.32 });
    expect(m.goalAreas[1]).toEqual({ x: length - 5.5, y: cy - 9.16, w: 5.5, h: 18.32 });

    // Center circle radius and position.
    expect(m.centerCircle).toMatchObject({ cx: length / 2, cy, r: 9.15 });

    // Penalty marks 11 m from each goal line.
    expect(m.penaltyMarks[0].cx).toBe(11);
    expect(m.penaltyMarks[1].cx).toBe(length - 11);

    // Goals: 7.32 m wide, centered.
    expect(m.goals[0].h).toBeCloseTo(IFAB.GOAL_WIDTH);
    expect(m.goals[0].y).toBeCloseTo(cy - 3.66);

    // Four corner arcs, halfway line in the middle.
    expect(m.cornerArcs).toHaveLength(4);
    expect(m.halfwayX).toBe(length / 2);
  });

  it('penalty arc endpoints sit on the box edge and the mark circle', () => {
    const m = pitchMarkings(105, 68);
    // Left arc: 'M 16.5 <y1> A 9.15 9.15 0 0 1 16.5 <y2>'
    const nums = m.penaltyArcs[0].match(/-?\d+(\.\d+)?/g)!.map(Number);
    const [x1, y1] = [nums[0], nums[1]];
    const halfChord = Math.sqrt(9.15 ** 2 - 5.5 ** 2);
    expect(x1).toBe(16.5);
    expect(y1).toBeCloseTo(34 - halfChord, 5);
    // The endpoint lies on the circle around the penalty mark (11, 34).
    const dist = Math.hypot(x1 - 11, y1 - 34);
    expect(dist).toBeCloseTo(9.15, 5);
  });
});
