import { describe, expect, it } from 'vitest';
import {
  buildKeymap,
  defaultPlayerBind,
  findConflicts,
  resolveKey,
  bindLabel,
} from '../src/lib/input/keymap';
import { makeProject } from './helpers';

describe('keymap', () => {
  it('assigns default keys: digits then right-hand letters, shift for away team', () => {
    expect(defaultPlayerBind('home', 0)).toEqual({ code: 'Digit1', shift: false });
    expect(defaultPlayerBind('home', 9)).toEqual({ code: 'Digit0', shift: false });
    expect(defaultPlayerBind('home', 10)).toEqual({ code: 'KeyU', shift: false });
    expect(defaultPlayerBind('home', 18)).toEqual({ code: 'KeyM', shift: false });
    expect(defaultPlayerBind('away', 0)).toEqual({ code: 'Digit1', shift: true });
    expect(defaultPlayerBind('home', 19)).toBeNull();
  });

  it('resolves physical keys with and without shift to the right team', () => {
    const project = makeProject();
    const map = buildKeymap(project);

    expect(resolveKey(map, { code: 'Digit1', shiftKey: false })).toEqual({
      kind: 'player',
      teamId: 'home',
      playerId: 'home-0',
    });
    // Shift+1 produces key '!' but code 'Digit1' — must hit the away player.
    expect(resolveKey(map, { code: 'Digit1', shiftKey: true })).toEqual({
      kind: 'player',
      teamId: 'away',
      playerId: 'away-0',
    });
    expect(resolveKey(map, { code: 'KeyQ', shiftKey: false })).toEqual({
      kind: 'action',
      action: 'shot',
    });
    expect(resolveKey(map, { code: 'KeyB', shiftKey: false })).toBeUndefined();
  });

  it('detects conflicts between players and action keys', () => {
    const project = makeProject();
    expect(findConflicts(project).size).toBe(0);

    // Bind a home player to the shot action key.
    project.teams[0].players[0].bind = { code: 'KeyQ', shift: false };
    const conflicts = findConflicts(project);
    expect(conflicts.size).toBe(1);
    expect([...conflicts.values()][0]).toHaveLength(2);
  });

  it('renders human labels', () => {
    expect(bindLabel({ code: 'Digit1', shift: false })).toBe('1');
    expect(bindLabel({ code: 'KeyU', shift: true })).toBe('⇧U');
  });
});
