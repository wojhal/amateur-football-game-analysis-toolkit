import type { MatchEvent, Project } from '../types';
import { aggregate, playerById, shotIsOnTarget, type Ratio } from '../stats/aggregate';
import { normalizeEvent } from '../stats/normalize';
import { xgForEvent } from '../stats/xg';
import { xtForPass } from '../stats/xt';
import { matchClock, formatClock, sortedVideos } from '../video/playlist';
import { ACTION_DEFS } from '../recorder/action-defs';

export type Cell = string | number;

export interface Table {
  name: string;
  header: string[];
  rows: Cell[][];
}

const pctNum = (r: Ratio): Cell => (r.att === 0 ? '' : Math.round((r.won / r.att) * 100));

export function playersTable(project: Project, events: MatchEvent[]): Table {
  const agg = aggregate(events, project.teams, { videos: project.videos, pitch: project.pitch });
  const rows: Cell[][] = [];
  for (const team of project.teams) {
    for (const p of team.players) {
      const s = agg.perPlayer.get(p.id);
      if (!s) continue;
      rows.push([
        team.name,
        p.name,
        p.number ?? '',
        s.passes.att, s.passes.won, pctNum(s.passes),
        s.keyPasses,
        s.progressivePasses.att, s.progressivePasses.won,
        s.longBalls.att, s.longBalls.won,
        Math.round(s.xt * 1000) / 1000,
        s.shots.total, s.shots.onTarget, s.shots.goals,
        Math.round(s.xg * 1000) / 1000,
        s.groundDuels.att, s.groundDuels.won, pctNum(s.groundDuels),
        s.dribbles.att, s.dribbles.won, pctNum(s.dribbles),
        s.tackles.att, s.tackles.won, pctNum(s.tackles),
        s.aerials.att, s.aerials.won, pctNum(s.aerials),
        s.interceptions, s.clearances, s.saves, s.blocks, s.turnovers, s.mistakes,
        s.foulsCommitted, s.foulsSuffered, s.offsides,
      ]);
    }
  }
  return {
    name: 'Players',
    header: [
      'Team', 'Player', 'No.',
      'Passes', 'Completed', 'Pass %',
      'Key passes',
      'Progressive passes', 'Progressive completed',
      'Long balls', 'Long balls completed',
      'xT',
      'Shots', 'On target', 'Goals',
      'xG',
      'Ground duels', 'Ground duels won', 'Ground duel %',
      'Dribbles', 'Dribbles won', 'Dribble %',
      'Tackles', 'Tackles won', 'Tackle %',
      'Aerial duels', 'Aerials won', 'Aerial %',
      'Interceptions', 'Clearances', 'Saves', 'Blocks', 'Turnovers', 'Serious mistakes',
      'Fouls committed', 'Fouls suffered', 'Offsides',
    ],
    rows,
  };
}

export function teamsTable(project: Project, events: MatchEvent[]): Table {
  const agg = aggregate(events, project.teams, { videos: project.videos, pitch: project.pitch });
  const rows: Cell[][] = project.teams.map((team) => {
    const s = agg.perTeam[team.id];
    return [
      team.name,
      s.shots.goals,
      s.passes.att, s.passes.won, pctNum(s.passes),
      s.keyPasses,
      s.progressivePasses.att, s.progressivePasses.won,
      s.longBalls.att, s.longBalls.won,
      Math.round(s.xt * 1000) / 1000,
      s.shots.total, s.shots.onTarget,
      Math.round(s.xg * 1000) / 1000,
      s.groundDuels.att, s.groundDuels.won,
      s.dribbles.att, s.dribbles.won,
      s.tackles.att, s.tackles.won,
      s.aerials.att, s.aerials.won,
      s.interceptions, s.clearances, s.saves, s.blocks, s.turnovers, s.mistakes,
      s.foulsCommitted, s.offsides,
    ];
  });
  return {
    name: 'Teams',
    header: [
      'Team', 'Goals',
      'Passes', 'Completed', 'Pass %',
      'Key passes',
      'Progressive passes', 'Progressive completed',
      'Long balls', 'Long balls completed',
      'xT',
      'Shots', 'On target',
      'xG',
      'Ground duels', 'Ground duels won',
      'Dribbles', 'Dribbles won',
      'Tackles', 'Tackles won',
      'Aerial duels', 'Aerials won',
      'Interceptions', 'Clearances', 'Saves', 'Blocks', 'Turnovers', 'Serious mistakes',
      'Fouls', 'Offsides',
    ],
    rows,
  };
}

export function eventsTable(project: Project, events: MatchEvent[]): Table {
  const videos = sortedVideos(project.videos);
  const sorted = [...events].sort((a, b) => {
    const clockA = matchClock(videos, a.videoId, a.videoTime);
    const clockB = matchClock(videos, b.videoId, b.videoTime);
    return clockA - clockB;
  });
  const round = (v: number | undefined): Cell => (v === undefined ? '' : Math.round(v * 100) / 100);
  const round3 = (v: number | null): Cell => (v === null ? '' : Math.round(v * 1000) / 1000);

  const rows: Cell[][] = sorted.map((e) => {
    const video = project.videos.find((v) => v.id === e.videoId);
    const team = project.teams.find((t) => t.id === e.teamId);
    const player = playerById(project.teams, e.playerId);
    const second = e.secondPlayerId ? playerById(project.teams, e.secondPlayerId) : undefined;
    const norm = normalizeEvent(e, project);
    const shot = e.shotTarget;
    return [
      e.id,
      video?.periodLabel ?? '',
      formatClock(matchClock(videos, e.videoId, e.videoTime)),
      Math.round(e.videoTime * 100) / 100,
      ACTION_DEFS[e.type].label,
      team?.name ?? e.teamId,
      player?.name ?? e.playerId,
      second?.name ?? '',
      e.successful ? 1 : 0,
      round(e.start.x), round(e.start.y),
      round(e.end?.x), round(e.end?.y),
      round(norm?.start.x), round(norm?.start.y),
      round(norm?.end?.x), round(norm?.end?.y),
      shot && 'gx' in shot ? round(shot.gx) : '',
      shot && 'gx' in shot ? round(shot.gy) : '',
      shot && 'miss' in shot ? shot.miss : shot && 'blocked' in shot ? 'blocked' : '',
      e.type === 'shot' ? (shotIsOnTarget(e) ? 1 : 0) : '',
      e.type === 'pass' || e.type === 'keyPass' ? (e.passOutcome ?? '') : '',
      round3(xgForEvent(e, project.videos, project.pitch)),
      round3(xtForPass(e, project.videos, project.pitch)),
    ];
  });
  return {
    name: 'Events',
    header: [
      'ID', 'Period', 'Match clock', 'Video time (s)', 'Action', 'Team',
      'Player', 'Second player', 'Successful',
      'X (m)', 'Y (m)', 'End X (m)', 'End Y (m)',
      'Norm X', 'Norm Y', 'Norm end X', 'Norm end Y',
      'Goal X (m)', 'Goal Y (m)', 'Miss', 'On target', 'Pass outcome', 'xG', 'xT',
    ],
    rows,
  };
}
