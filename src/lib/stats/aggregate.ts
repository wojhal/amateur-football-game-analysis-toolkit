import type { MatchEvent, Player, Team, TeamId, VideoRef } from '../types';
import { attackDirOf } from '../types';
import { isOnTarget } from '../geometry/goal';
import { xgForEvent } from './xg';
import { xtForPass } from './xt';

/** Minimum pass length (meters) to count as a long ball. */
export const LONG_BALL_MIN_M = 30;

/** A long ball must also gain at least this much toward the goal (m). */
export const LONG_BALL_MIN_GAIN_M = 10;

/** A pass is progressive when it ends at least this much closer to goal (m). */
export const PROGRESSIVE_MIN_GAIN_M = 2;

/** Pitch/video context needed for direction-aware metrics (progressive passes). */
export interface AggregateContext {
  videos: VideoRef[];
  pitch: { length: number; width: number };
}

export interface Ratio {
  att: number;
  won: number;
}

export interface PlayerStats {
  playerId: string;
  teamId: TeamId;
  passes: Ratio; // att = attempted, won = completed (key passes included)
  /** Key passes (chance-creating passes); also counted in `passes`. */
  keyPasses: number;
  /** Passes whose end point is closer to the opponent's goal than the start. */
  progressivePasses: Ratio;
  /** Passes of at least LONG_BALL_MIN_M meters. */
  longBalls: Ratio;
  /** Failed passes + lost dribbles + manual turnover events. */
  turnovers: number;
  /** Sum of expected goals over this player's shots. */
  xg: number;
  /** Sum of expected threat deltas over this player's completed passes. */
  xt: number;
  shots: { total: number; onTarget: number; goals: number };
  /** Ground duels as the initiating (primary) player only. */
  groundDuels: Ratio;
  /** Take-ons: 'dribble' events as the primary player (attacker). */
  dribbles: Ratio;
  /** Take-ons defended: 'dribble' events as the second player. */
  tackles: Ratio;
  /** Aerial duels, both roles combined. */
  aerials: Ratio;
  interceptions: number;
  clearances: number;
  /** Manual save events + saves derived from on-target saved shots. */
  saves: number;
  /** Shots blocked (derived from blocked shots naming this player). */
  blocks: number;
  /** Failed actions flagged as serious mistakes in the editor. */
  mistakes: number;
  foulsCommitted: number;
  foulsSuffered: number;
  offsides: number;
}

export interface TeamStats extends Omit<PlayerStats, 'playerId'> {
  teamId: TeamId;
}

export interface Aggregate {
  perPlayer: Map<string, PlayerStats>;
  perTeam: Record<TeamId, TeamStats>;
}

function emptyPlayerStats(playerId: string, teamId: TeamId): PlayerStats {
  return {
    playerId,
    teamId,
    passes: { att: 0, won: 0 },
    keyPasses: 0,
    progressivePasses: { att: 0, won: 0 },
    longBalls: { att: 0, won: 0 },
    turnovers: 0,
    xg: 0,
    xt: 0,
    shots: { total: 0, onTarget: 0, goals: 0 },
    groundDuels: { att: 0, won: 0 },
    dribbles: { att: 0, won: 0 },
    tackles: { att: 0, won: 0 },
    aerials: { att: 0, won: 0 },
    interceptions: 0,
    clearances: 0,
    saves: 0,
    blocks: 0,
    mistakes: 0,
    foulsCommitted: 0,
    foulsSuffered: 0,
    offsides: 0,
  };
}

export function shotIsOnTarget(e: MatchEvent): boolean {
  if (e.successful) return true; // a goal is always on target
  if (!e.shotTarget) return false;
  if ('miss' in e.shotTarget || 'blocked' in e.shotTarget) return false;
  return isOnTarget(e.shotTarget.gx, e.shotTarget.gy);
}

export function aggregate(
  events: MatchEvent[],
  teams: [Team, Team],
  ctx?: AggregateContext,
): Aggregate {
  const perPlayer = new Map<string, PlayerStats>();
  const playerTeam = new Map<string, TeamId>();
  for (const team of teams) {
    for (const p of team.players) {
      perPlayer.set(p.id, emptyPlayerStats(p.id, team.id));
      playerTeam.set(p.id, team.id);
    }
  }

  const get = (playerId: string | undefined): PlayerStats | null => {
    if (!playerId) return null;
    let s = perPlayer.get(playerId);
    if (!s) {
      // Player was deleted from the squad but events remain: keep counting
      // under an orphan row so team totals stay correct.
      s = emptyPlayerStats(playerId, playerTeam.get(playerId) ?? 'home');
      perPlayer.set(playerId, s);
    }
    return s;
  };

  for (const e of events) {
    const primary = get(e.playerId);
    const second = get(e.secondPlayerId);
    if (!primary) continue;

    if (e.seriousMistake && !e.successful) primary.mistakes++;

    switch (e.type) {
      case 'pass':
      case 'keyPass': {
        if (e.type === 'keyPass') primary.keyPasses++;
        primary.passes.att++;
        if (e.successful) primary.passes.won++;
        // Interceptions are derived: a failed pass intercepted by an opponent
        // credits that opponent.
        else if (e.passOutcome === 'intercepted' && second) second.interceptions++;
        if (!e.successful) primary.turnovers++;
        if (e.end) {
          const video = ctx?.videos.find((v) => v.id === e.videoId);
          if (ctx && video) {
            const dir = attackDirOf(video, e.teamId);
            const gx = dir === 'ltr' ? ctx.pitch.length : 0;
            const gy = ctx.pitch.width / 2;
            // How much closer to the opponent's goal the pass ends.
            const gain =
              Math.hypot(gx - e.start.x, gy - e.start.y) -
              Math.hypot(gx - e.end.x, gy - e.end.y);
            if (gain >= PROGRESSIVE_MIN_GAIN_M) {
              primary.progressivePasses.att++;
              if (e.successful) primary.progressivePasses.won++;
            }
            // Long ball: at least LONG_BALL_MIN_M long AND meaningfully
            // toward goal (LONG_BALL_MIN_GAIN_M).
            const len = Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y);
            if (len >= LONG_BALL_MIN_M && gain >= LONG_BALL_MIN_GAIN_M) {
              primary.longBalls.att++;
              if (e.successful) primary.longBalls.won++;
            }
          }
          if (ctx) {
            const xt = xtForPass(e, ctx.videos, ctx.pitch);
            if (xt !== null) primary.xt += xt;
          }
        }
        break;
      }
      case 'shot': {
        primary.shots.total++;
        const onTarget = shotIsOnTarget(e);
        if (onTarget) primary.shots.onTarget++;
        if (e.successful) primary.shots.goals++;
        // A saved on-target shot with a tagged keeper credits that keeper.
        if (!e.successful && onTarget && second) second.saves++;
        // A blocked shot credits the tagged blocker.
        if (e.shotTarget && 'blocked' in e.shotTarget && second) second.blocks++;
        if (ctx) {
          const xg = xgForEvent(e, ctx.videos, ctx.pitch);
          if (xg !== null) primary.xg += xg;
        }
        break;
      }
      case 'groundDuel':
        // Only the initiating (primary) player gets a ground duel; the
        // defender's side counts as a tackle attempt/win instead.
        primary.groundDuels.att++;
        if (e.successful) primary.groundDuels.won++;
        if (second) {
          second.tackles.att++;
          if (!e.successful) second.tackles.won++;
        }
        break;
      case 'dribble':
        // Deliberate take-on: attacker gets a dribble, defender a tackle;
        // a lost take-on is a turnover.
        primary.dribbles.att++;
        if (e.successful) primary.dribbles.won++;
        if (second) {
          second.tackles.att++;
          if (!e.successful) second.tackles.won++;
        }
        if (!e.successful) primary.turnovers++;
        break;
      case 'turnover':
        primary.turnovers++;
        break;
      case 'aerialDuel':
        primary.aerials.att++;
        if (e.successful) primary.aerials.won++;
        if (second) {
          second.aerials.att++;
          if (!e.successful) second.aerials.won++;
        }
        break;
      case 'interception':
        // Legacy events (pre-migration only).
        if (e.successful) primary.interceptions++;
        break;
      case 'clearance':
        if (e.successful) primary.clearances++;
        break;
      case 'save':
        if (e.successful) primary.saves++;
        break;
      case 'foul':
        // Primary = the player who was fouled.
        primary.foulsSuffered++;
        if (second) second.foulsCommitted++;
        break;
      case 'offside':
        primary.offsides++;
        break;
    }
  }

  const perTeam: Record<TeamId, TeamStats> = {
    home: sumTeam('home', perPlayer),
    away: sumTeam('away', perPlayer),
  };

  return { perPlayer, perTeam };
}

function addRatio(a: Ratio, b: Ratio): void {
  a.att += b.att;
  a.won += b.won;
}

function sumTeam(teamId: TeamId, perPlayer: Map<string, PlayerStats>): TeamStats {
  const t: TeamStats = { ...emptyPlayerStats('', teamId) };
  delete (t as Partial<PlayerStats>).playerId;
  for (const s of perPlayer.values()) {
    if (s.teamId !== teamId) continue;
    addRatio(t.passes, s.passes);
    t.keyPasses += s.keyPasses;
    addRatio(t.progressivePasses, s.progressivePasses);
    addRatio(t.longBalls, s.longBalls);
    t.turnovers += s.turnovers;
    t.xg += s.xg;
    t.xt += s.xt;
    t.shots.total += s.shots.total;
    t.shots.onTarget += s.shots.onTarget;
    t.shots.goals += s.shots.goals;
    addRatio(t.groundDuels, s.groundDuels);
    addRatio(t.dribbles, s.dribbles);
    addRatio(t.tackles, s.tackles);
    addRatio(t.aerials, s.aerials);
    t.interceptions += s.interceptions;
    t.clearances += s.clearances;
    t.saves += s.saves;
    t.blocks += s.blocks;
    t.mistakes += s.mistakes;
    t.foulsCommitted += s.foulsCommitted;
    t.foulsSuffered += s.foulsSuffered;
    t.offsides += s.offsides;
  }
  return t;
}

export function pct(r: Ratio): string {
  if (r.att === 0) return '–';
  return `${Math.round((r.won / r.att) * 100)}%`;
}

export function playerById(teams: [Team, Team], id: string): Player | undefined {
  for (const t of teams) {
    const p = t.players.find((p) => p.id === id);
    if (p) return p;
  }
  return undefined;
}
