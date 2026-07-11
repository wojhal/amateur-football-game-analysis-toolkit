export type TeamId = 'home' | 'away';

export type ActionType =
  | 'pass'
  | 'keyPass' // a pass creating a clear chance; behaves like a pass
  | 'shot'
  | 'offside'
  | 'groundDuel'
  | 'aerialDuel'
  | 'dribble' // explicit take-on: attacker vs defender, like a ground duel
  | 'clearance'
  | 'interception' // legacy only — no longer recordable; derived from failed passes
  | 'save'
  | 'foul'
  | 'turnover'; // manual possession loss (bad touch etc.)

/** Actions the user can actually select/bind ('interception' is derived). */
export type BindableAction = Exclude<ActionType, 'interception'>;

export interface Point {
  x: number; // meters along pitch length (0 = left goal line as drawn)
  y: number; // meters along pitch width (0 = top touchline as drawn)
}

/** Physical key binding: KeyboardEvent.code plus shift state. */
export interface KeyBind {
  code: string; // e.g. 'Digit1', 'KeyU'
  shift: boolean;
}

export interface Player {
  id: string;
  name: string;
  number: number | null;
  bind: KeyBind;
}

export interface Team {
  id: TeamId;
  name: string;
  color: string;
  players: Player[];
}

export type AttackDir = 'ltr' | 'rtl';

export interface VideoRef {
  id: string;
  /** 'file' when absent (projects saved before YouTube support). */
  sourceType?: 'file' | 'youtube';
  /** The 11-character YouTube video id, when sourceType is 'youtube'. */
  youtubeId?: string;
  /** For files: the on-disk name. For YouTube: a display label/URL. */
  fileName: string;
  fileSize: number;
  order: number;
  periodLabel: string;
  /** Seconds into the file where play starts (kickoff). */
  kickoffOffset: number;
  /** Cached duration in seconds (0 until first load). */
  duration: number;
  /** Which way the home team attacks in this period, as drawn on the pitch. */
  homeAttack: AttackDir;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  pitch: { length: number; width: number };
  videos: VideoRef[];
  teams: [Team, Team];
  /** Action -> key code (actions never use shift). */
  actionBindings: Record<BindableAction, string>;
}

/** Freeze frame captured while recording a shot, used for the xG model. */
export interface ShotContext {
  /** Opposing outfield players at the moment of the shot (pitch coords). */
  defenders: Point[];
  /** The opposing goalkeeper (pitch coords), if placed. */
  keeper?: Point;
}

export type ShotTarget =
  | { gx: number; gy: number } // meters in goal-mouth frame: gx from left post, gy above ground
  | { miss: 'wide-left' | 'wide-right' | 'high' }
  | { blocked: true }; // blocked before reaching the goal — no direction recorded

export interface MatchEvent {
  id: string;
  type: ActionType;
  videoId: string;
  videoTime: number;
  teamId: TeamId;
  playerId: string;
  /** Keeper / fouler / duel opponent / pass recipient. */
  secondPlayerId?: string;
  successful: boolean;
  start: Point;
  end?: Point;
  shotTarget?: ShotTarget;
  shotContext?: ShotContext;
  /**
   * How a failed pass ended: intercepted by `secondPlayerId`, or out of
   * bounds. Absent on successful passes and pre-migration events.
   */
  passOutcome?: 'intercepted' | 'out';
  /** Marked in the editor: this failed action was a serious mistake. */
  seriousMistake?: boolean;
}

/** Pass-like actions share the pass recording flow and pass metrics. */
export function isPassLike(t: ActionType): boolean {
  return t === 'pass' || t === 'keyPass';
}

export function isYouTubeVideo(v: VideoRef): boolean {
  return v.sourceType === 'youtube';
}

export function otherTeam(id: TeamId): TeamId {
  return id === 'home' ? 'away' : 'home';
}

export function attackDirOf(video: VideoRef, teamId: TeamId): AttackDir {
  if (teamId === 'home') return video.homeAttack;
  return video.homeAttack === 'ltr' ? 'rtl' : 'ltr';
}
