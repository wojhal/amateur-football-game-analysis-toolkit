import type { ActionType, BindableAction } from '../types';

export type FinishMode = 'none' | 'endPoint' | 'secondPlayer' | 'goalModal';

export interface ActionDef {
  label: string;
  finish: FinishMode;
  /** Whether a second player may/must be attached while finishing. */
  secondPlayer: 'none' | 'optional' | 'required';
  /** Which team the second player must belong to, relative to the primary. */
  secondPlayerTeam: 'same' | 'other';
  /** HUD hints. */
  successHint: string;
  failHint: string;
  /** Success-agnostic: either mouse button records it, no outcome shown. */
  neutralOutcome?: boolean;
}

/**
 * Declarative behavior of each action in the recorder. The primary player is
 * always the attacker; for fouls, the player who was fouled.
 */
export const ACTION_DEFS: Record<ActionType, ActionDef> = {
  pass: {
    label: 'Pass',
    finish: 'endPoint',
    secondPlayer: 'optional', // recipient (success) / interceptor (failure)
    secondPlayerTeam: 'same',
    successHint: 'completed',
    failHint: 'intercepted / out of bounds',
  },
  keyPass: {
    label: 'Key pass',
    finish: 'endPoint',
    secondPlayer: 'optional', // recipient (success) / interceptor (failure)
    secondPlayerTeam: 'same',
    successHint: 'completed',
    failHint: 'intercepted / out of bounds',
  },
  shot: {
    label: 'Shot',
    finish: 'goalModal',
    secondPlayer: 'optional', // keeper / blocker
    secondPlayerTeam: 'other',
    successHint: 'goal',
    failHint: 'saved / off target',
  },
  offside: {
    label: 'Offside',
    finish: 'none',
    secondPlayer: 'none',
    secondPlayerTeam: 'same',
    successHint: 'offside',
    failHint: 'offside',
  },
  groundDuel: {
    label: 'Ground duel',
    finish: 'secondPlayer',
    secondPlayer: 'required', // defender
    secondPlayerTeam: 'other',
    successHint: 'attacker won (dribble)',
    failHint: 'defender won (tackle)',
  },
  aerialDuel: {
    label: 'Aerial duel',
    finish: 'secondPlayer',
    secondPlayer: 'required',
    secondPlayerTeam: 'other',
    successHint: 'first player won',
    failHint: 'first player lost',
  },
  dribble: {
    label: 'Dribble',
    finish: 'secondPlayer',
    secondPlayer: 'required', // the defender taken on
    secondPlayerTeam: 'other',
    successHint: 'beat the defender',
    failHint: 'tackled (turnover)',
  },
  clearance: {
    label: 'Clearance',
    finish: 'none',
    secondPlayer: 'none',
    secondPlayerTeam: 'same',
    successHint: 'cleared',
    failHint: 'failed',
  },
  // Legacy: no longer recordable (interceptions are derived from failed
  // passes). Kept so old events still render before migration.
  interception: {
    label: 'Interception',
    finish: 'none',
    secondPlayer: 'none',
    secondPlayerTeam: 'same',
    successHint: 'intercepted',
    failHint: 'failed',
  },
  save: {
    label: 'Save',
    finish: 'none',
    secondPlayer: 'none',
    secondPlayerTeam: 'other',
    successHint: 'saved',
    failHint: 'not held',
  },
  foul: {
    label: 'Foul',
    finish: 'secondPlayer',
    secondPlayer: 'required', // the player committing the foul
    secondPlayerTeam: 'other',
    successHint: 'foul won',
    failHint: 'foul won',
  },
  turnover: {
    label: 'Turnover',
    finish: 'none',
    secondPlayer: 'none',
    secondPlayerTeam: 'same',
    successHint: 'possession lost',
    failHint: 'possession lost',
    neutralOutcome: true,
  },
};

export const ACTION_ORDER: BindableAction[] = [
  'shot', 'pass', 'keyPass', 'offside', 'groundDuel', 'aerialDuel', 'dribble',
  'clearance', 'save', 'foul', 'turnover',
];
