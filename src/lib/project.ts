import type { Player, Project, TeamId, VideoRef } from './types';
import { DEFAULT_ACTION_BINDINGS, defaultPlayerBind } from './input/keymap';
import { youTubeWatchUrl } from './video/youtube';

export function createProject(): Project {
  return {
    id: crypto.randomUUID(),
    name: 'New match',
    createdAt: new Date().toISOString(),
    pitch: { length: 105, width: 68 },
    videos: [],
    teams: [
      { id: 'home', name: 'Home', color: '#4da3ff', players: [] },
      { id: 'away', name: 'Away', color: '#ff5d5d', players: [] },
    ],
    actionBindings: { ...DEFAULT_ACTION_BINDINGS },
  };
}

export function createPlayer(teamId: TeamId, index: number): Player {
  return {
    id: crypto.randomUUID(),
    name: '',
    number: null,
    bind: defaultPlayerBind(teamId, index) ?? { code: 'F24', shift: false },
  };
}

function defaultPeriodLabel(order: number): string {
  return order === 0 ? '1st half' : order === 1 ? '2nd half' : `Part ${order + 1}`;
}

export function createVideoRef(fileName: string, fileSize: number, order: number): VideoRef {
  return {
    id: crypto.randomUUID(),
    sourceType: 'file',
    fileName,
    fileSize,
    order,
    periodLabel: defaultPeriodLabel(order),
    kickoffOffset: 0,
    duration: 0,
    homeAttack: order % 2 === 0 ? 'ltr' : 'rtl',
  };
}

export function createYouTubeVideoRef(youtubeId: string, order: number): VideoRef {
  return {
    id: crypto.randomUUID(),
    sourceType: 'youtube',
    youtubeId,
    fileName: youTubeWatchUrl(youtubeId),
    fileSize: 0,
    order,
    periodLabel: defaultPeriodLabel(order),
    kickoffOffset: 0,
    duration: 0,
    homeAttack: order % 2 === 0 ? 'ltr' : 'rtl',
  };
}

export const isFsAccessSupported = (): boolean =>
  typeof window !== 'undefined' && 'showOpenFilePicker' in window;
