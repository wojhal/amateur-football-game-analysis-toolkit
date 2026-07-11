import type { Player, Project, Team, TeamId, VideoRef } from '../src/lib/types';
import { DEFAULT_ACTION_BINDINGS, defaultPlayerBind } from '../src/lib/input/keymap';

export function makePlayer(teamId: TeamId, index: number, name: string): Player {
  return {
    id: `${teamId}-${index}`,
    name,
    number: index + 1,
    bind: defaultPlayerBind(teamId, index)!,
  };
}

export function makeTeams(): [Team, Team] {
  return [
    {
      id: 'home',
      name: 'Home',
      color: '#4da3ff',
      players: [makePlayer('home', 0, 'A1'), makePlayer('home', 1, 'A2')],
    },
    {
      id: 'away',
      name: 'Away',
      color: '#ff5d5d',
      players: [makePlayer('away', 0, 'B1'), makePlayer('away', 1, 'B2')],
    },
  ];
}

export function makeVideo(id: string, order: number, duration: number, kickoffOffset = 0): VideoRef {
  return {
    id,
    fileName: `${id}.mp4`,
    fileSize: 1000,
    order,
    periodLabel: `P${order + 1}`,
    kickoffOffset,
    duration,
    homeAttack: order % 2 === 0 ? 'ltr' : 'rtl',
  };
}

export function makeProject(): Project {
  return {
    id: 'proj',
    name: 'Test match',
    createdAt: '2026-07-10T00:00:00.000Z',
    pitch: { length: 105, width: 68 },
    videos: [makeVideo('v1', 0, 2760, 60), makeVideo('v2', 1, 2820, 30)],
    teams: makeTeams(),
    actionBindings: { ...DEFAULT_ACTION_BINDINGS },
  };
}
