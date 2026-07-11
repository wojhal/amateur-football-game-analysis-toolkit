import type { ActionType, MatchEvent, Point, ShotTarget, TeamId } from '../types';
import { otherTeam } from '../types';
import { ACTION_DEFS } from './action-defs';
import { isOnTarget } from '../geometry/goal';

/**
 * The event draft the user assembles: pick player + action in any order, then
 * a pitch click (LMB = successful, RMB = not) fixes position, time and
 * success, and — depending on the action — the event either commits or waits
 * for a second player key, an end-point click, or the goal modal.
 *
 * Pure reducer: (state, input) -> { state, commit?, error? }. No DOM, no IO.
 */

export type DraftPhase =
  | 'building'
  | 'awaitEnd'
  | 'awaitPassOutcome'
  | 'awaitSecondPlayer'
  | 'awaitGoal'
  | 'awaitShotDefenders'
  | 'awaitShotKeeper';

export interface DraftState {
  phase: DraftPhase;
  teamId?: TeamId;
  playerId?: string;
  action?: ActionType;
  successful?: boolean;
  start?: Point;
  end?: Point;
  /** Set when a shot needs a saver/blocker after the goal modal. */
  shotTarget?: ShotTarget;
  /** Shot freeze frame collected in the defender/keeper stages. */
  defenders?: Point[];
  keeperPoint?: Point;
  videoId?: string;
  videoTime?: number;
  secondPlayerId?: string;
}

export type DraftInput =
  | { kind: 'player'; teamId: TeamId; playerId: string }
  | { kind: 'action'; action: ActionType }
  | { kind: 'pitchClick'; point: Point; successful: boolean; videoId: string; videoTime: number }
  | { kind: 'goalTarget'; target: ShotTarget }
  | { kind: 'passOut' } // "ball went out of bounds" button for a failed pass
  | { kind: 'shotDefenders'; defenders: Point[] } // freeze frame stage 1
  | { kind: 'shotKeeper'; keeper: Point | null } // freeze frame stage 2
  | { kind: 'cancel' };

type ActiveInput = Exclude<DraftInput, { kind: 'cancel' }>;

export type DraftCommit = Omit<MatchEvent, 'id'>;

export interface DraftResult {
  state: DraftState;
  commit?: DraftCommit;
  error?: string;
}

export function emptyDraft(): DraftState {
  return { phase: 'building' };
}

/**
 * State after a commit: player and action stay selected so a run of similar
 * events (e.g. a passing sequence) needs no re-selection. Position, outcome
 * and second player are cleared. Esc (cancel) still clears everything.
 */
function retainedDraft(s: DraftState): DraftState {
  return { phase: 'building', teamId: s.teamId, playerId: s.playerId, action: s.action };
}

function commitOf(s: DraftState): DraftCommit {
  return {
    type: s.action!,
    videoId: s.videoId!,
    videoTime: s.videoTime!,
    teamId: s.teamId!,
    playerId: s.playerId!,
    secondPlayerId: s.secondPlayerId,
    successful: s.successful!,
    start: s.start!,
    shotTarget: s.shotTarget,
    shotContext:
      s.defenders?.length || s.keeperPoint
        ? { defenders: s.defenders ?? [], keeper: s.keeperPoint }
        : undefined,
  };
}

export function reduceDraft(state: DraftState, input: DraftInput): DraftResult {
  if (input.kind === 'cancel') {
    return { state: emptyDraft() };
  }

  switch (state.phase) {
    case 'building':
      return reduceBuilding(state, input);
    case 'awaitEnd':
      return reduceAwaitEnd(state, input);
    case 'awaitPassOutcome':
      return reduceAwaitPassOutcome(state, input);
    case 'awaitSecondPlayer':
      return reduceAwaitSecondPlayer(state, input);
    case 'awaitGoal':
      return reduceAwaitGoal(state, input);
    case 'awaitShotDefenders':
      return reduceAwaitShotDefenders(state, input);
    case 'awaitShotKeeper':
      return reduceAwaitShotKeeper(state, input);
  }
}

function reduceBuilding(state: DraftState, input: ActiveInput): DraftResult {
  switch (input.kind) {
    case 'player':
      return { state: { ...state, teamId: input.teamId, playerId: input.playerId } };
    case 'action':
      return { state: { ...state, action: input.action } };
    case 'pitchClick': {
      if (!state.playerId || !state.action) {
        return {
          state,
          error: !state.playerId && !state.action
            ? 'Select a player and an action first'
            : !state.playerId
              ? 'Select a player first'
              : 'Select an action first',
        };
      }
      const filled: DraftState = {
        ...state,
        // Success-agnostic actions record with either mouse button.
        successful: ACTION_DEFS[state.action].neutralOutcome ? true : input.successful,
        start: input.point,
        videoId: input.videoId,
        videoTime: input.videoTime,
      };
      const def = ACTION_DEFS[state.action];
      switch (def.finish) {
        case 'none':
          return { state: retainedDraft(filled), commit: commitOf(filled) };
        case 'endPoint':
          return { state: { ...filled, phase: 'awaitEnd' } };
        case 'secondPlayer':
          return { state: { ...filled, phase: 'awaitSecondPlayer' } };
        case 'goalModal':
          return { state: { ...filled, phase: 'awaitGoal' } };
      }
    }
    case 'goalTarget':
      return { state, error: 'No shot in progress' };
    case 'passOut':
      return { state, error: 'No failed pass in progress' };
    case 'shotDefenders':
    case 'shotKeeper':
      return { state, error: 'No shot in progress' };
  }
}

function secondPlayerCheck(state: DraftState, input: { teamId: TeamId; playerId: string }): string | null {
  const def = ACTION_DEFS[state.action!];
  const wantTeam = def.secondPlayerTeam === 'same' ? state.teamId! : otherTeam(state.teamId!);
  if (input.teamId !== wantTeam) {
    return def.secondPlayerTeam === 'same'
      ? 'Second player must be a teammate'
      : 'Second player must be an opponent';
  }
  if (input.playerId === state.playerId) {
    return 'Second player must be a different player';
  }
  return null;
}

function reduceAwaitEnd(state: DraftState, input: ActiveInput): DraftResult {
  switch (input.kind) {
    case 'player': {
      if (!state.successful) {
        return { state, error: 'Click where the ball was lost first' };
      }
      const err = secondPlayerCheck(state, input);
      if (err) return { state, error: err };
      return { state: { ...state, secondPlayerId: input.playerId } };
    }
    case 'pitchClick': {
      // A failed pass still needs its outcome: interceptor or out of bounds.
      if (!state.successful) {
        return { state: { ...state, end: input.point, phase: 'awaitPassOutcome' } };
      }
      const filled = { ...state };
      const commit = { ...commitOf(filled), end: input.point };
      return { state: retainedDraft(filled), commit };
    }
    case 'action':
      return { state, error: 'Click where the ball ended up (Esc to cancel)' };
    case 'goalTarget':
      return { state, error: 'No shot in progress' };
    case 'passOut':
      return { state, error: 'Click where the ball was lost first' };
    case 'shotDefenders':
    case 'shotKeeper':
      return { state, error: 'No shot in progress' };
  }
}

function reduceAwaitPassOutcome(state: DraftState, input: ActiveInput): DraftResult {
  switch (input.kind) {
    case 'player': {
      // Only an opponent makes sense here — they intercepted the pass.
      if (input.teamId === state.teamId) {
        return {
          state,
          error: 'Press the interceptor’s key (opponent) — or use the “Out of bounds” button',
        };
      }
      const commit: DraftCommit = {
        ...commitOf(state),
        end: state.end,
        secondPlayerId: input.playerId,
        passOutcome: 'intercepted',
      };
      return { state: retainedDraft(state), commit };
    }
    case 'passOut': {
      const commit: DraftCommit = {
        ...commitOf(state),
        end: state.end,
        secondPlayerId: undefined,
        passOutcome: 'out',
      };
      return { state: retainedDraft(state), commit };
    }
    case 'pitchClick':
    case 'action':
    case 'goalTarget':
    case 'shotDefenders':
    case 'shotKeeper':
      return {
        state,
        error: 'Press the interceptor’s key — or use the “Out of bounds” button',
      };
  }
}

function reduceAwaitSecondPlayer(state: DraftState, input: ActiveInput): DraftResult {
  switch (input.kind) {
    case 'player': {
      const err = secondPlayerCheck(state, input);
      if (err) return { state, error: err };
      const commit = commitOf({ ...state, secondPlayerId: input.playerId });
      return { state: retainedDraft(state), commit };
    }
    case 'pitchClick':
    case 'action':
      return { state, error: 'Press the second player’s key (Esc to cancel)' };
    case 'goalTarget':
      return { state, error: 'No shot in progress' };
    case 'passOut':
      return { state, error: 'No failed pass in progress' };
    case 'shotDefenders':
    case 'shotKeeper':
      return { state, error: 'No shot freeze frame in progress' };
  }
}

function reduceAwaitGoal(state: DraftState, input: ActiveInput): DraftResult {
  switch (input.kind) {
    case 'player': {
      const err = secondPlayerCheck(state, input);
      if (err) return { state, error: err };
      return { state: { ...state, secondPlayerId: input.playerId } };
    }
    case 'goalTarget': {
      const target = input.target;
      // Blocked or placed outside the goal frame (margin/miss buttons):
      // never a goal, whatever button started the shot.
      const offTarget =
        'miss' in target || ('gx' in target && !isOnTarget(target.gx, target.gy));
      const successful = 'blocked' in target || offTarget ? false : state.successful!;
      // Next: freeze frame — defenders, then keeper — for the xG model.
      return {
        state: { ...state, successful, shotTarget: target, phase: 'awaitShotDefenders' },
      };
    }
    case 'pitchClick':
    case 'action':
      return { state, error: 'Place the shot in the goal modal (Esc to cancel)' };
    case 'passOut':
      return { state, error: 'No failed pass in progress' };
    case 'shotDefenders':
    case 'shotKeeper':
      return { state, error: 'Place the shot in the goal modal first' };
  }
}

function reduceAwaitShotDefenders(state: DraftState, input: ActiveInput): DraftResult {
  switch (input.kind) {
    case 'shotDefenders':
      return { state: { ...state, defenders: input.defenders, phase: 'awaitShotKeeper' } };
    case 'player':
    case 'action':
    case 'pitchClick':
    case 'goalTarget':
    case 'passOut':
    case 'shotKeeper':
      return { state, error: 'Place the defenders (or skip) first' };
  }
}

function reduceAwaitShotKeeper(state: DraftState, input: ActiveInput): DraftResult {
  switch (input.kind) {
    case 'shotKeeper': {
      const done: DraftState = { ...state, keeperPoint: input.keeper ?? undefined };
      const target = done.shotTarget!;
      const blocked = 'blocked' in target;
      const savedOnTarget =
        !done.successful && 'gx' in target && isOnTarget(target.gx, target.gy);
      // Saves and blocks must name the opponent responsible (unless the
      // keeper was already tagged while the goal modal was open).
      if ((blocked || savedOnTarget) && !done.secondPlayerId) {
        return { state: { ...done, phase: 'awaitSecondPlayer' } };
      }
      return { state: retainedDraft(done), commit: commitOf(done) };
    }
    case 'player':
    case 'action':
    case 'pitchClick':
    case 'goalTarget':
    case 'passOut':
    case 'shotDefenders':
      return { state, error: 'Place the goalkeeper (or skip) first' };
  }
}

/** Human-readable hint for the HUD, given the current draft. */
export function draftHint(state: DraftState): string {
  switch (state.phase) {
    case 'building': {
      if (!state.playerId && !state.action) return 'Press a player key and an action key';
      if (!state.playerId) return 'Press a player key';
      if (!state.action) return 'Press an action key';
      return 'Click the pitch: LMB = successful, RMB = unsuccessful';
    }
    case 'awaitEnd':
      return state.successful
        ? 'Click where the ball ended up (optional: press recipient’s key first)'
        : 'Click where the ball was lost';
    case 'awaitPassOutcome':
      return 'Press the interceptor’s key (opponent) — or mark the ball out of bounds';
    case 'awaitSecondPlayer':
      if (state.action === 'shot') {
        return state.shotTarget && 'blocked' in state.shotTarget
          ? 'Press the key of the player who blocked the shot'
          : 'Press the key of the player who saved the shot';
      }
      return ACTION_DEFS[state.action!].label === 'Foul'
        ? 'Press the key of the player who committed the foul'
        : 'Press the opponent’s key';
    case 'awaitGoal':
      return 'Place the ball in the goal (optional: press keeper’s key first)';
    case 'awaitShotDefenders':
      return 'Freeze frame: click where the defenders were (or skip)';
    case 'awaitShotKeeper':
      return 'Freeze frame: click where the goalkeeper was (or skip)';
  }
}
