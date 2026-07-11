import type { ActionType, BindableAction, KeyBind, Project, TeamId } from '../types';

/** Default player key codes, in assignment order (19 slots per team). */
export const DEFAULT_PLAYER_CODES = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
  'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
  'KeyU', 'KeyI', 'KeyO', 'KeyP',
  'KeyJ', 'KeyK', 'KeyL', 'KeyN', 'KeyM',
] as const;

export const DEFAULT_ACTION_BINDINGS: Record<BindableAction, string> = {
  shot: 'KeyQ',
  pass: 'KeyW',
  keyPass: 'KeyS',
  offside: 'KeyE',
  groundDuel: 'KeyR',
  aerialDuel: 'KeyT',
  dribble: 'KeyG',
  clearance: 'KeyA',
  save: 'KeyD',
  foul: 'KeyF',
  turnover: 'KeyZ',
};

export function defaultPlayerBind(teamId: TeamId, index: number): KeyBind | null {
  const code = DEFAULT_PLAYER_CODES[index];
  if (!code) return null;
  return { code, shift: teamId === 'away' };
}

export function bindKey(bind: KeyBind): string {
  return bind.shift ? `S+${bind.code}` : bind.code;
}

/** Human-readable label for a key code, e.g. 'Digit1' -> '1', 'KeyU' -> 'U'. */
export function keyLabel(code: string): string {
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Key')) return code.slice(3);
  return code;
}

export function bindLabel(bind: KeyBind): string {
  return (bind.shift ? '⇧' : '') + keyLabel(bind.code);
}

export type KeyTarget =
  | { kind: 'player'; teamId: TeamId; playerId: string }
  | { kind: 'action'; action: ActionType };

/** Build the lookup map for the recording panel from project config. */
export function buildKeymap(project: Project): Map<string, KeyTarget> {
  const map = new Map<string, KeyTarget>();
  for (const team of project.teams) {
    for (const p of team.players) {
      map.set(bindKey(p.bind), { kind: 'player', teamId: team.id, playerId: p.id });
    }
  }
  for (const [action, code] of Object.entries(project.actionBindings)) {
    if (action === 'interception') continue; // legacy binding in old projects
    map.set(code, { kind: 'action', action: action as ActionType });
  }
  return map;
}

export function resolveKey(
  map: Map<string, KeyTarget>,
  e: { code: string; shiftKey: boolean },
): KeyTarget | undefined {
  return map.get(e.shiftKey ? `S+${e.code}` : e.code);
}

/**
 * Find binding conflicts across both teams' players and the action keys.
 * Returns a map of bind-key -> list of human-readable owners (only entries
 * with more than one owner).
 */
export function findConflicts(project: Project): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  const add = (key: string, owner: string) => {
    const list = owners.get(key) ?? [];
    list.push(owner);
    owners.set(key, list);
  };
  for (const team of project.teams) {
    for (const p of team.players) {
      add(bindKey(p.bind), `${team.name}: ${p.name || '(unnamed)'}`);
    }
  }
  for (const [action, code] of Object.entries(project.actionBindings)) {
    if (action === 'interception') continue; // legacy binding in old projects
    add(code, `action: ${action}`);
  }
  const conflicts = new Map<string, string[]>();
  for (const [key, list] of owners) {
    if (list.length > 1) conflicts.set(key, list);
  }
  return conflicts;
}

/** Keys reserved for transport/system control — not bindable. */
export const RESERVED_CODES = new Set([
  'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Escape', 'Enter', 'Tab', 'Backspace', 'Delete',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock',
]);
