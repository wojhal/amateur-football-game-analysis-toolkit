import { describe, expect, it } from 'vitest';
import type { Point } from '../src/lib/types';
import {
  emptyDraft,
  reduceDraft,
  type DraftInput,
  type DraftResult,
  type DraftState,
} from '../src/lib/recorder/draft-machine';

/** Run the shot freeze-frame stages (defenders, then keeper). */
function throughFrame(
  state: DraftState,
  defenders: Point[] = [],
  keeper: Point | null = null,
): DraftResult {
  const d = reduceDraft(state, { kind: 'shotDefenders', defenders });
  expect(d.state.phase).toBe('awaitShotKeeper');
  return reduceDraft(d.state, { kind: 'shotKeeper', keeper });
}

function run(inputs: DraftInput[]): DraftResult {
  let state: DraftState = emptyDraft();
  let last: DraftResult = { state };
  for (const input of inputs) {
    last = reduceDraft(state, input);
    state = last.state;
  }
  return last;
}

const click = (successful: boolean): DraftInput => ({
  kind: 'pitchClick',
  point: { x: 50, y: 30 },
  successful,
  videoId: 'v1',
  videoTime: 123.4,
});

const homePlayer = (id = 'h1'): DraftInput => ({ kind: 'player', teamId: 'home', playerId: id });
const awayPlayer = (id = 'a1'): DraftInput => ({ kind: 'player', teamId: 'away', playerId: id });

describe('draft machine', () => {
  it('commits a clearance immediately on pitch click', () => {
    const r = run([homePlayer(), { kind: 'action', action: 'clearance' }, click(true)]);
    expect(r.commit).toMatchObject({
      type: 'clearance',
      playerId: 'h1',
      teamId: 'home',
      successful: true,
      start: { x: 50, y: 30 },
      videoId: 'v1',
      videoTime: 123.4,
    });
    expect(r.state.phase).toBe('building');
  });

  it('keeps player and action selected after a commit, but clears the rest', () => {
    const first = run([homePlayer(), { kind: 'action', action: 'clearance' }, click(true)]);
    expect(first.commit).toBeTruthy();
    expect(first.state).toEqual({
      phase: 'building',
      teamId: 'home',
      playerId: 'h1',
      action: 'clearance',
    });

    // The retained selection is immediately usable for the next event.
    const second = reduceDraft(first.state, click(false));
    expect(second.commit).toMatchObject({ type: 'clearance', playerId: 'h1', successful: false });

    // Multi-phase commits retain too, without leaking the second player.
    const foul = run([homePlayer(), { kind: 'action', action: 'foul' }, click(true)]);
    const done = reduceDraft(foul.state, awayPlayer('a9'));
    expect(done.commit?.secondPlayerId).toBe('a9');
    expect(done.state).toEqual({
      phase: 'building',
      teamId: 'home',
      playerId: 'h1',
      action: 'foul',
    });
  });

  it('commits an offside as a single-player point event', () => {
    const r = run([{ kind: 'action', action: 'offside' }, homePlayer(), click(true)]);
    expect(r.commit?.type).toBe('offside');
    expect(r.commit?.secondPlayerId).toBeUndefined();
  });

  it('rejects a pitch click before player and action are chosen', () => {
    const r = run([click(true)]);
    expect(r.commit).toBeUndefined();
    expect(r.error).toMatch(/player and an action/i);
  });

  it('failed pass: end click, then the interceptor (opponent key) finishes it', () => {
    const mid = run([homePlayer(), { kind: 'action', action: 'pass' }, click(false)]);
    expect(mid.state.phase).toBe('awaitEnd');
    expect(mid.commit).toBeUndefined();

    const afterEnd = reduceDraft(mid.state, {
      kind: 'pitchClick',
      point: { x: 70, y: 40 },
      successful: true, // ignored for the end click
      videoId: 'v1',
      videoTime: 125,
    });
    expect(afterEnd.commit).toBeUndefined();
    expect(afterEnd.state.phase).toBe('awaitPassOutcome');

    const done = reduceDraft(afterEnd.state, awayPlayer('a5'));
    expect(done.commit).toMatchObject({
      type: 'pass',
      successful: false,
      start: { x: 50, y: 30 },
      end: { x: 70, y: 40 },
      videoTime: 123.4, // timestamp from the START click
      passOutcome: 'intercepted',
      secondPlayerId: 'a5',
    });
  });

  it('failed pass: the out-of-bounds button marks it out; teammate keys are rejected', () => {
    const mid = run([homePlayer(), { kind: 'action', action: 'pass' }, click(false)]);
    const afterEnd = reduceDraft(mid.state, {
      kind: 'pitchClick',
      point: { x: 70, y: 40 },
      successful: false,
      videoId: 'v1',
      videoTime: 125,
    });

    // Noise (a pitch click) is rejected while waiting for the outcome.
    const noise = reduceDraft(afterEnd.state, click(true));
    expect(noise.error).toMatch(/interceptor/i);

    // A teammate is not a valid interceptor — hint instead of committing.
    const teammate = reduceDraft(afterEnd.state, homePlayer('h2'));
    expect(teammate.commit).toBeUndefined();
    expect(teammate.error).toMatch(/out of bounds/i);

    const done = reduceDraft(afterEnd.state, { kind: 'passOut' });
    expect(done.commit).toMatchObject({ type: 'pass', successful: false, passOutcome: 'out' });
    expect(done.commit?.secondPlayerId).toBeUndefined();
  });

  it('dribble: behaves like a ground duel (defender key commits)', () => {
    const mid = run([homePlayer(), { kind: 'action', action: 'dribble' }, click(true)]);
    expect(mid.state.phase).toBe('awaitSecondPlayer');
    const done = reduceDraft(mid.state, awayPlayer('d1'));
    expect(done.commit).toMatchObject({ type: 'dribble', successful: true, secondPlayerId: 'd1' });
  });

  it('turnover: one-player point event, commits on the pitch click', () => {
    const r = run([homePlayer(), { kind: 'action', action: 'turnover' }, click(true)]);
    expect(r.commit).toMatchObject({ type: 'turnover', playerId: 'h1' });
    expect(r.commit?.secondPlayerId).toBeUndefined();
  });

  it('passOut outside a failed pass is rejected', () => {
    const r = run([homePlayer(), { kind: 'action', action: 'shot' }, { kind: 'passOut' }]);
    expect(r.commit).toBeUndefined();
    expect(r.error).toMatch(/no failed pass/i);
  });

  it('pass: accepts a same-team recipient, rejects an opponent', () => {
    const mid = run([homePlayer(), { kind: 'action', action: 'pass' }, click(true)]);

    const bad = reduceDraft(mid.state, awayPlayer());
    expect(bad.error).toMatch(/teammate/i);
    expect(bad.state.secondPlayerId).toBeUndefined();

    const good = reduceDraft(mid.state, homePlayer('h2'));
    expect(good.state.secondPlayerId).toBe('h2');
    const done = reduceDraft(good.state, {
      kind: 'pitchClick',
      point: { x: 60, y: 20 },
      successful: true,
      videoId: 'v1',
      videoTime: 124,
    });
    expect(done.commit?.secondPlayerId).toBe('h2');
  });

  it('foul: primary is the fouled player, second key is the opponent who fouled', () => {
    const mid = run([homePlayer(), { kind: 'action', action: 'foul' }, click(true)]);
    expect(mid.state.phase).toBe('awaitSecondPlayer');

    const sameTeam = reduceDraft(mid.state, homePlayer('h2'));
    expect(sameTeam.error).toMatch(/opponent/i);
    expect(sameTeam.commit).toBeUndefined();

    const done = reduceDraft(mid.state, awayPlayer('a9'));
    expect(done.commit).toMatchObject({ type: 'foul', playerId: 'h1', secondPlayerId: 'a9' });
  });

  it('ground duel: requires the opposing player to commit', () => {
    const mid = run([awayPlayer(), { kind: 'action', action: 'groundDuel' }, click(false)]);
    const noise = reduceDraft(mid.state, { kind: 'action', action: 'pass' });
    expect(noise.error).toBeTruthy();
    expect(noise.state.phase).toBe('awaitSecondPlayer');

    const done = reduceDraft(mid.state, homePlayer());
    expect(done.commit).toMatchObject({
      type: 'groundDuel',
      teamId: 'away',
      successful: false,
      secondPlayerId: 'h1',
    });
  });

  it('shot: goal modal, then freeze-frame stages, storing defenders and keeper', () => {
    const mid = run([homePlayer(), { kind: 'action', action: 'shot' }, click(false)]);
    expect(mid.state.phase).toBe('awaitGoal');

    const withKeeper = reduceDraft(mid.state, awayPlayer('gk'));
    expect(withKeeper.state.secondPlayerId).toBe('gk');

    const placed = reduceDraft(withKeeper.state, {
      kind: 'goalTarget',
      target: { gx: 6.5, gy: 1.2 },
    });
    expect(placed.commit).toBeUndefined();
    expect(placed.state.phase).toBe('awaitShotDefenders');

    const done = throughFrame(placed.state, [{ x: 100, y: 34 }], { x: 104, y: 34 });
    // Keeper was tagged in the modal, so the save needs no extra key.
    expect(done.commit).toMatchObject({
      type: 'shot',
      successful: false,
      secondPlayerId: 'gk',
      shotTarget: { gx: 6.5, gy: 1.2 },
      shotContext: { defenders: [{ x: 100, y: 34 }], keeper: { x: 104, y: 34 } },
    });
  });

  it('shot: miss buttons commit after the freeze frame, nobody to credit', () => {
    const mid = run([homePlayer(), { kind: 'action', action: 'shot' }, click(false)]);
    const placed = reduceDraft(mid.state, { kind: 'goalTarget', target: { miss: 'high' } });
    expect(placed.state.phase).toBe('awaitShotDefenders');
    const done = throughFrame(placed.state);
    expect(done.commit?.shotTarget).toEqual({ miss: 'high' });
    expect(done.commit?.shotContext).toBeUndefined(); // empty frame stored as nothing
  });

  it('shot: an on-target save requires the saver’s key after the freeze frame', () => {
    const mid = run([homePlayer(), { kind: 'action', action: 'shot' }, click(false)]);
    const placed = reduceDraft(mid.state, { kind: 'goalTarget', target: { gx: 3.5, gy: 1.0 } });
    const framed = throughFrame(placed.state);
    expect(framed.commit).toBeUndefined();
    expect(framed.state.phase).toBe('awaitSecondPlayer');

    const sameTeam = reduceDraft(framed.state, homePlayer('h2'));
    expect(sameTeam.error).toMatch(/opponent/i);

    const done = reduceDraft(framed.state, awayPlayer('gk'));
    expect(done.commit).toMatchObject({
      type: 'shot',
      successful: false,
      secondPlayerId: 'gk',
      shotTarget: { gx: 3.5, gy: 1.0 },
    });
  });

  it('shot: LMB placed above the bar is forced unsuccessful (not a goal, off target)', () => {
    const mid = run([homePlayer(), { kind: 'action', action: 'shot' }, click(true)]);
    const placed = reduceDraft(mid.state, { kind: 'goalTarget', target: { gx: 3.5, gy: 3.0 } });
    const done = throughFrame(placed.state);
    expect(done.commit).toMatchObject({ type: 'shot', successful: false });
    expect(done.commit?.secondPlayerId).toBeUndefined(); // nobody to credit
  });

  it('shot: off-target placement (margin) commits without a saver', () => {
    const mid = run([homePlayer(), { kind: 'action', action: 'shot' }, click(false)]);
    const placed = reduceDraft(mid.state, { kind: 'goalTarget', target: { gx: -0.5, gy: 1.0 } });
    const done = throughFrame(placed.state);
    expect(done.commit).toBeTruthy();
    expect(done.commit?.secondPlayerId).toBeUndefined();
  });

  it('shot: blocked requires the blocker and is never a goal', () => {
    // LMB (successful) then Blocked: the block wins — successful is forced off.
    const mid = run([homePlayer(), { kind: 'action', action: 'shot' }, click(true)]);
    const placed = reduceDraft(mid.state, { kind: 'goalTarget', target: { blocked: true } });
    const framed = throughFrame(placed.state, [{ x: 95, y: 34 }]);
    expect(framed.commit).toBeUndefined();
    expect(framed.state.phase).toBe('awaitSecondPlayer');

    const done = reduceDraft(framed.state, awayPlayer('def'));
    expect(done.commit).toMatchObject({
      type: 'shot',
      successful: false,
      secondPlayerId: 'def',
      shotTarget: { blocked: true },
      shotContext: { defenders: [{ x: 95, y: 34 }] },
    });
  });

  it('shot: stray inputs during the freeze frame are rejected', () => {
    const mid = run([homePlayer(), { kind: 'action', action: 'shot' }, click(true)]);
    const placed = reduceDraft(mid.state, { kind: 'goalTarget', target: { gx: 3, gy: 1 } });
    const noise = reduceDraft(placed.state, homePlayer('h2'));
    expect(noise.error).toMatch(/defenders/i);
    expect(noise.state.phase).toBe('awaitShotDefenders');
  });

  it('replacing player/action while building, and cancel from any phase', () => {
    const built = run([
      homePlayer('h1'),
      homePlayer('h2'), // replaces
      { kind: 'action', action: 'pass' },
      { kind: 'action', action: 'shot' }, // replaces
    ]);
    expect(built.state.playerId).toBe('h2');
    expect(built.state.action).toBe('shot');

    const mid = reduceDraft(built.state, click(true));
    expect(mid.state.phase).toBe('awaitGoal');
    const cancelled = reduceDraft(mid.state, { kind: 'cancel' });
    expect(cancelled.state).toEqual(emptyDraft());
  });

  it('second player must not be the same player', () => {
    const mid = run([homePlayer('h1'), { kind: 'action', action: 'pass' }, click(true)]);
    const dup = reduceDraft(mid.state, homePlayer('h1'));
    expect(dup.error).toMatch(/different player/i);
  });
});
