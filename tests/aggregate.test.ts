import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '../src/lib/types';
import { aggregate, type AggregateContext } from '../src/lib/stats/aggregate';
import { makeTeams, makeVideo } from './helpers';

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

describe('aggregate', () => {
  it('ground duels are mirrored between both players; dribbles/tackles come from take-ons', () => {
    const teams = makeTeams();
    const events = [
      // A1 wins a 50/50 against B1, then loses one.
      ev({ type: 'groundDuel', teamId: 'home', playerId: 'home-0', secondPlayerId: 'away-0', successful: true }),
      ev({ type: 'groundDuel', teamId: 'home', playerId: 'home-0', secondPlayerId: 'away-0', successful: false }),
      // A1 beats B1 in an explicit take-on.
      ev({ type: 'dribble', teamId: 'home', playerId: 'home-0', secondPlayerId: 'away-0', successful: true }),
    ];
    const agg = aggregate(events, teams);
    const a1 = agg.perPlayer.get('home-0')!;
    const b1 = agg.perPlayer.get('away-0')!;

    expect(a1.groundDuels).toEqual({ att: 2, won: 1 });
    expect(b1.groundDuels).toEqual({ att: 0, won: 0 }); // defender side is tackles only
    // Ground duels don't feed the attacker's dribbles, but the defending
    // side of each duel counts as a tackle (2 duels + 1 defended take-on).
    expect(a1.dribbles).toEqual({ att: 1, won: 1 });
    expect(a1.tackles).toEqual({ att: 0, won: 0 });
    expect(b1.tackles).toEqual({ att: 3, won: 1 });
    expect(b1.dribbles).toEqual({ att: 0, won: 0 });

    expect(agg.perTeam.home.groundDuels).toEqual({ att: 2, won: 1 });
    expect(agg.perTeam.home.dribbles).toEqual({ att: 1, won: 1 });
    expect(agg.perTeam.away.tackles).toEqual({ att: 3, won: 1 });
  });

  it('credits aerial duels to both players, mirrored', () => {
    const teams = makeTeams();
    const events = [
      ev({ type: 'aerialDuel', teamId: 'home', playerId: 'home-0', secondPlayerId: 'away-1', successful: true }),
      ev({ type: 'aerialDuel', teamId: 'away', playerId: 'away-1', secondPlayerId: 'home-0', successful: true }),
    ];
    const agg = aggregate(events, teams);
    expect(agg.perPlayer.get('home-0')!.aerials).toEqual({ att: 2, won: 1 });
    expect(agg.perPlayer.get('away-1')!.aerials).toEqual({ att: 2, won: 1 });
  });

  it('derives keeper saves from saved on-target shots and counts shot rows', () => {
    const teams = makeTeams();
    const events = [
      // goal
      ev({ type: 'shot', teamId: 'home', playerId: 'home-0', successful: true, shotTarget: { gx: 1, gy: 1 } }),
      // saved on target, keeper tagged
      ev({ type: 'shot', teamId: 'home', playerId: 'home-0', successful: false, secondPlayerId: 'away-0', shotTarget: { gx: 3.5, gy: 2 } }),
      // off target via miss button
      ev({ type: 'shot', teamId: 'home', playerId: 'home-0', successful: false, shotTarget: { miss: 'high' } }),
      // narrowly wide: placed in the margin outside the frame
      ev({ type: 'shot', teamId: 'home', playerId: 'home-0', successful: false, shotTarget: { gx: -0.5, gy: 1 } }),
      // blocked by a defender: off target, blocker credited with a block
      ev({ type: 'shot', teamId: 'home', playerId: 'home-0', successful: false, secondPlayerId: 'away-1', shotTarget: { blocked: true } }),
    ];
    const agg = aggregate(events, teams);
    const a1 = agg.perPlayer.get('home-0')!;
    expect(a1.shots).toEqual({ total: 5, onTarget: 2, goals: 1 });
    expect(agg.perPlayer.get('away-0')!.saves).toBe(1);
    expect(agg.perPlayer.get('away-1')!.blocks).toBe(1);
    expect(agg.perPlayer.get('away-1')!.saves).toBe(0); // a block is not a save
    expect(agg.perTeam.home.shots.goals).toBe(1);
    expect(agg.perTeam.away.blocks).toBe(1);
  });

  it('counts passes, fouls (both directions), offsides and manual saves', () => {
    const teams = makeTeams();
    const events = [
      ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: true, end: { x: 60, y: 30 } }),
      ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: false, end: { x: 70, y: 10 } }),
      ev({ type: 'foul', teamId: 'home', playerId: 'home-1', secondPlayerId: 'away-1', successful: true }),
      ev({ type: 'offside', teamId: 'away', playerId: 'away-0' }),
      ev({ type: 'save', teamId: 'away', playerId: 'away-0', successful: true }),
      ev({ type: 'clearance', teamId: 'home', playerId: 'home-1' }),
      // Interceptions are derived from failed passes tagged with an interceptor.
      ev({ type: 'pass', teamId: 'away', playerId: 'away-1', successful: false, passOutcome: 'intercepted', secondPlayerId: 'home-1', end: { x: 40, y: 30 } }),
      // Out of bounds: no interception credited to anyone.
      ev({ type: 'pass', teamId: 'away', playerId: 'away-1', successful: false, passOutcome: 'out', end: { x: 40, y: 70 } }),
    ];
    const agg = aggregate(events, teams);
    expect(agg.perPlayer.get('home-0')!.passes).toEqual({ att: 2, won: 1 });
    expect(agg.perPlayer.get('home-1')!.foulsSuffered).toBe(1);
    expect(agg.perPlayer.get('away-1')!.foulsCommitted).toBe(1);
    expect(agg.perPlayer.get('away-0')!.offsides).toBe(1);
    expect(agg.perPlayer.get('away-0')!.saves).toBe(1);
    expect(agg.perPlayer.get('home-1')!.interceptions).toBe(1); // from the intercepted pass
    expect(agg.perPlayer.get('home-1')!.clearances).toBe(1);
    expect(agg.perTeam.home.passes).toEqual({ att: 2, won: 1 });
    expect(agg.perTeam.away.passes).toEqual({ att: 2, won: 0 });
    expect(agg.perTeam.home.interceptions).toBe(1);
  });

  it('derives progressive passes and long balls from pass lines', () => {
    const teams = makeTeams();
    // v1: home attacks left-to-right, so home's target goal is at x=105.
    const ctx: AggregateContext = {
      videos: [makeVideo('v1', 0, 2700, 0)],
      pitch: { length: 105, width: 68 },
    };
    const events = [
      // 20 m forward: progressive, not long
      ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: true, start: { x: 50, y: 34 }, end: { x: 70, y: 34 } }),
      // 58 m forward diagonal: progressive AND long, but failed
      ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: false, passOutcome: 'out', start: { x: 10, y: 10 }, end: { x: 60, y: 40 } }),
      // backward pass: neither
      ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: true, start: { x: 50, y: 34 }, end: { x: 30, y: 34 } }),
      // only 1 m closer: below the 2 m progressive threshold
      ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: true, start: { x: 50, y: 34 }, end: { x: 51, y: 34 } }),
      // away team attacks right-to-left in v1: goal at x=0, so a pass toward
      // lower x is progressive for them
      ev({ type: 'pass', teamId: 'away', playerId: 'away-0', successful: true, start: { x: 60, y: 34 }, end: { x: 40, y: 34 } }),
      // 60 m sideways switch: long distance but no gain toward goal — NOT a long ball
      ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: true, start: { x: 50, y: 4 }, end: { x: 50, y: 64 } }),
    ];
    const agg = aggregate(events, teams, ctx);
    const a1 = agg.perPlayer.get('home-0')!;
    expect(a1.progressivePasses).toEqual({ att: 2, won: 1 });
    expect(a1.longBalls).toEqual({ att: 1, won: 0 });
    expect(agg.perPlayer.get('away-0')!.progressivePasses).toEqual({ att: 1, won: 1 });
  });

  it('counts turnovers: failed passes, lost dribbles, manual events — not ground duels', () => {
    const teams = makeTeams();
    const events = [
      ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: false, passOutcome: 'out', end: { x: 60, y: 34 } }),
      ev({ type: 'dribble', teamId: 'home', playerId: 'home-0', successful: false, secondPlayerId: 'away-0' }),
      ev({ type: 'turnover', teamId: 'home', playerId: 'home-0' }),
      // a lost ground duel is NOT a turnover (kept as-is for now)
      ev({ type: 'groundDuel', teamId: 'home', playerId: 'home-0', successful: false, secondPlayerId: 'away-0' }),
      // successful dribble: no turnover
      ev({ type: 'dribble', teamId: 'home', playerId: 'home-0', successful: true, secondPlayerId: 'away-0' }),
    ];
    const agg = aggregate(events, teams);
    const a1 = agg.perPlayer.get('home-0')!;
    expect(a1.turnovers).toBe(3);
    // take-ons feed dribbles/tackles; the ground duel goes to its own column
    // and additionally credits the defender with a tackle
    expect(a1.dribbles).toEqual({ att: 2, won: 1 });
    expect(a1.groundDuels).toEqual({ att: 1, won: 0 });
    expect(agg.perPlayer.get('away-0')!.tackles).toEqual({ att: 3, won: 2 });
    expect(agg.perPlayer.get('away-0')!.groundDuels).toEqual({ att: 0, won: 0 });
    expect(agg.perTeam.home.turnovers).toBe(3);
  });

  it('key passes count separately and in overall passes', () => {
    const teams = makeTeams();
    const events = [
      ev({ type: 'pass', teamId: 'home', playerId: 'home-0', successful: true, end: { x: 60, y: 34 } }),
      ev({ type: 'keyPass', teamId: 'home', playerId: 'home-0', successful: true, end: { x: 90, y: 34 } }),
    ];
    const agg = aggregate(events, teams);
    const a1 = agg.perPlayer.get('home-0')!;
    expect(a1.keyPasses).toBe(1);
    expect(a1.passes).toEqual({ att: 2, won: 2 });
    expect(agg.perTeam.home.keyPasses).toBe(1);
  });

  it('keeps team totals correct when a player was removed from the squad', () => {
    const teams = makeTeams();
    const events = [
      ev({ type: 'pass', teamId: 'home', playerId: 'ghost', successful: true }),
    ];
    const agg = aggregate(events, teams);
    expect(agg.perPlayer.get('ghost')!.passes).toEqual({ att: 1, won: 1 });
  });
});
