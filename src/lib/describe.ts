import type { MatchEvent, Project } from './types';
import { isPassLike } from './types';
import { ACTION_DEFS } from './recorder/action-defs';
import { playerById, shotIsOnTarget } from './stats/aggregate';
import { formatClock, matchClock } from './video/playlist';
import { xgForEvent } from './stats/xg';
import { xtForPass } from './stats/xt';

/** Structured event details for the marker popup. */
export interface EventDetails {
  title: string;
  outcome?: { text: string; good: boolean };
  lines: string[];
}

export function eventDetails(e: MatchEvent, project: Project): EventDetails {
  const def = ACTION_DEFS[e.type];
  const video = project.videos.find((v) => v.id === e.videoId);
  const clock = formatClock(matchClock(project.videos, e.videoId, e.videoTime));
  const team = project.teams.find((t) => t.id === e.teamId);
  const player = playerById(project.teams, e.playerId);
  const second = e.secondPlayerId ? playerById(project.teams, e.secondPlayerId) : undefined;

  const lines: string[] = [
    `⏱ ${clock}${video ? ` · ${video.periodLabel}` : ''}`,
    `${team?.name ?? '?'}: ${player?.name || '(unnamed)'}${
      second ? ` → ${second.name || '(unnamed)'}` : ''
    }`,
  ];

  const outcome = def.neutralOutcome
    ? undefined
    : e.successful
      ? { text: `✓ ${def.successHint}`, good: true }
      : { text: `✗ ${def.failHint}`, good: false };

  if (e.type === 'shot') {
    const t = e.shotTarget;
    if (t) {
      const placement =
        'miss' in t
          ? `missed ${t.miss.replace('-', ' ')}`
          : 'blocked' in t
            ? 'blocked'
            : e.successful
              ? 'goal'
              : shotIsOnTarget(e)
                ? 'on target'
                : 'off target';
      lines.push(`🎯 ${placement}`);
    }
    const xg = xgForEvent(e, project.videos, project.pitch);
    if (xg !== null) lines.push(`xG ${xg.toFixed(2)}`);
  }

  if (isPassLike(e.type)) {
    if (!e.successful && e.passOutcome) {
      lines.push(e.passOutcome === 'out' ? '⤫ ball out of bounds' : '⤞ intercepted');
    }
    const xt = xtForPass(e, project.videos, project.pitch);
    if (xt !== null) lines.push(`xT ${xt >= 0 ? '+' : ''}${xt.toFixed(3)}`);
  }

  if (e.seriousMistake) lines.push('⚠ serious mistake');

  return { title: def.label, outcome, lines };
}
