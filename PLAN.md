# Match Analyzer — Architecture & Implementation Plan

A local, fully client-side web app for manual event tagging of amateur football recordings.
No server, no accounts, no data leaving the machine. Videos are read straight from disk;
projects persist in the browser; stats export to CSV / XLSX / JSON.

---

## 1. Platform decision

**Fully static single-page app (SPA), Chromium-based browsers (Chrome / Edge).**

- Can be hosted anywhere static (GitHub Pages) or run locally with `npx serve dist`.
  Either way it is 100% client-side — the "host" only serves the JS bundle.
- Videos are opened via the **File System Access API** (`showOpenFilePicker`). The returned
  `FileSystemFileHandle` is structured-cloneable, so it can be stored in IndexedDB — this is
  what lets the app *remember where the video files are* between sessions without copying them.
- H.264 MP4 plays natively in the `<video>` element — no transcoding pipeline needed.
- Chromium-only is an acceptable constraint for a personal tool (Firefox/Safari lack
  persistent file handles). Detect and show a friendly message on unsupported browsers.

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Svelte 5 + TypeScript + Vite** | Single-screen, keyboard-heavy, state-machine-driven UI; Svelte stores/runes map cleanly onto "current event draft" reactivity with minimal boilerplate. Tiny bundle. |
| Pitch & goal rendering | **SVG** | Resolution-independent, trivial coordinate mapping (one `viewBox` in meters), easy hit-testing, easy to render event dots/arrows on top. |
| Persistence | **IndexedDB** via the `idb` wrapper | Stores project metadata, events, and video file handles. Autosave on every mutation. |
| Exports | hand-rolled CSV, **`exceljs`** for XLSX, `JSON.stringify` for raw dump | exceljs is actively maintained and MIT-licensed. |
| Tests | **Vitest** | Pure-function heavy core (aggregation, geometry, state machine) is very unit-testable. |
| Styling | plain CSS (or Tailwind if preferred) | Single dense screen; a design system is overkill. |

No backend, no Electron/Tauri shell. Everything below runs in the page.

## 3. App flow (screens)

```
Launch ──► Project list (from IndexedDB)
              │  "New project"                       "Open project"
              ▼                                          │
        Setup wizard                                     ▼
        1. Pitch dimensions (length 90–120 m,     Re-link check: request permission
           width 45–90 m; sliders + inputs,       on stored file handles; if a file
           live pitch preview)                    moved, prompt to locate it again
        2. Videos: add 1..n files, order them,    (match by filename + size)
           assign period labels (1st half, 2nd        │
           half, extra…), set per-video kickoff       ▼
           offset, set attack direction per      Recording panel
           period (which team attacks left)
        3. Squads: two teams (name + color),
           players (name, shirt number,
           keybind), action keybinds
              │
              ▼
        Recording panel  ◄────────────────────────────┘
```

Setup remains editable later (a settings drawer in the recording panel) — you *will*
discover a missing substitute mid-tagging.

## 4. Data model

All coordinates are stored **in meters** on a fixed frame: origin at the bottom-left corner
of the pitch as drawn, x along the length, y along the width. Combined with the per-period
attack-direction flag, exports can normalize everything to "team attacks left→right".

```ts
interface Project {
  id: string;                 // uuid
  name: string;
  createdAt: string;          // ISO
  pitch: { length: number; width: number };   // meters
  videos: VideoRef[];
  teams: [Team, Team];
  actionBindings: Record<ActionType, KeyCode>;
  events: MatchEvent[];
}

interface VideoRef {
  id: string;
  handle: FileSystemFileHandle;   // persisted in IndexedDB
  fileName: string; fileSize: number;   // for re-link verification
  order: number;
  periodLabel: string;            // "1st half"
  kickoffOffset: number;          // seconds into the file where play starts
  duration: number;               // cached after first load
  attackDirection: Record<TeamId, 'ltr' | 'rtl'>;  // per this video/period
}

interface Team {
  id: 'home' | 'away';
  name: string;
  color: string;                  // used everywhere: panels, dots, exports
  players: Player[];
}

interface Player {
  id: string;
  name: string;
  number?: number;
  key: KeyCode;                   // e.g. 'Digit1', 'KeyU' — see §5
}

type ActionType =
  | 'pass' | 'shot' | 'offside' | 'groundDuel' | 'aerialDuel'
  | 'clearance' | 'interception' | 'save' | 'foul';

interface MatchEvent {
  id: string;
  type: ActionType;
  videoId: string;
  videoTime: number;              // seconds within that file
  // matchTime is derived: sum of prior periods' effective lengths + (videoTime - kickoffOffset)
  playerId: string;               // primary actor (attacker / fouled player)
  teamId: TeamId;
  secondPlayerId?: string;        // keeper, fouler, duel opponent, pass recipient
  successful: boolean;            // LMB = true, RMB = false
  start: { x: number; y: number };            // meters
  end?: { x: number; y: number };             // pass/clearance destination
  shotTarget?:                                 // only for shots
    | { gx: number; gy: number }              // meters in goal-mouth frame (see §8)
    | { miss: 'wide-left' | 'wide-right' | 'high' };
}
```

Notes:

- **Shot semantics**: LMB + placed inside the goal frame = **goal**. RMB + inside frame =
  **on target, saved/blocked**. RMB + outside frame / "wider" / "higher" buttons = **off
  target**. When a saved shot has a `secondPlayerId`, the aggregation layer automatically
  credits that keeper with a save — no need to double-enter. The manual `save` action stays
  available for situations you'd rather tag from the keeper's perspective; the aggregator
  dedupes nothing (it's the user's choice which style to use), which keeps the logic simple.
- **Duels**: one event covers both players. `successful: true` means the *primary* player
  won; the opponent's aggregate row automatically counts the mirrored loss.

## 5. Keybind system

Work with **`KeyboardEvent.code`** (physical key: `Digit1`, `KeyU`), never `event.key` —
`Shift+1` yields `key: '!'` but `code: 'Digit1'`, which is exactly what we need for the
"same key + SHIFT = other team" rule.

Defaults:

- **Team A players** (up to 19): `Digit1..Digit0`, then `KeyU, KeyI, KeyO, KeyP, KeyJ, KeyK, KeyL, KeyN, KeyM`.
- **Team B players**: identical codes **with `shiftKey === true`**.
- **Actions**: `KeyQ`=shot, `KeyW`=pass, `KeyE`=offside, `KeyR`=ground duel, `KeyT`=aerial
  duel, `KeyA`=clearance, `KeyS`=interception, `KeyD`=save, `KeyF`=foul
  (`KeyG, KeyZ, KeyX, KeyC, KeyV` reserved for future actions).
- **Transport**: `Space` play/pause, `ArrowLeft/Right` ±1 frame, `Shift+Arrow` ±5 s,
  `Escape` cancel current draft, `Ctrl+Z / Ctrl+Shift+Z` undo/redo events.

Implementation: a single window-level `keydown` handler dispatching through a
`Map<string, Binding>` keyed by `` `${shift ? 'S+' : ''}${code}` ``. Suppressed while focus
is in a text input or a modal that owns the keyboard. The setup wizard rebinds by "click the
field, press a key" with live conflict detection (a key can't serve two purposes; Shift+key
conflicts count too).

## 6. Event recording — the core state machine

The heart of the app is an **event draft** the user assembles in any reasonable order,
with the pitch click as the commit gesture. A small always-visible HUD shows the draft
(`⟨ Kowalski · Pass · … ⟩`) so the user always knows what state they're in.

```
IDLE
  player key   → draft.player = P            (stays open, can be replaced)
  action key   → draft.action = A            (ditto)
  pitch click  → needs player+action, else shake the HUD as feedback

DRAFT COMPLETE ENOUGH + pitch click (LMB=successful / RMB=unsuccessful)
  → draft.start = click position, draft.successful set,
    timestamp = video.currentTime captured NOW
  → consult ACTION_DEFS[draft.action] for what finishes the event:
```

Declarative per-action definitions keep this from becoming an if-jungle:

```ts
const ACTION_DEFS: Record<ActionType, {
  finish: 'none' | 'endPoint' | 'secondPlayer' | 'goalModal';
  secondPlayer?: 'optional' | 'required';     // when finish isn't already secondPlayer
  secondPlayerTeam?: 'same' | 'other' | 'any';
}> = {
  clearance:    { finish: 'none' },
  offside:      { finish: 'none' },                                   // point event (see §14)
  interception: { finish: 'none', secondPlayer: 'optional' },         // see §14
  pass:         { finish: 'endPoint', secondPlayer: 'optional', secondPlayerTeam: 'same' },
  shot:         { finish: 'goalModal', secondPlayer: 'optional', secondPlayerTeam: 'other' },
  save:         { finish: 'none', secondPlayer: 'optional', secondPlayerTeam: 'other' },
  foul:         { finish: 'secondPlayer', secondPlayerTeam: 'other' },// draft.player = fouled
  groundDuel:   { finish: 'secondPlayer', secondPlayerTeam: 'other' },
  aerialDuel:   { finish: 'secondPlayer', secondPlayerTeam: 'other' },
};
```

Finishing states:

- **`endPoint`** (pass): the next pitch click sets `end` and commits. If a player key is
  pressed before that click, it becomes `secondPlayerId` (recipient).
- **`secondPlayer`** (foul, duels): the next *valid* player key (validated against
  `secondPlayerTeam`) commits the event at the already-clicked position.
- **`goalModal`** (shot): the goal-mouth modal opens (§8); clicking in it (or the
  wider/higher buttons) commits.
- **`none`**: committed immediately on the pitch click.

On commit: push to `project.events`, push inverse onto the undo stack, autosave, flash the
new marker on the pitch and timeline, reset to IDLE. `Escape` cancels any in-flight draft.

The whole machine is a pure reducer (`(draftState, input) → draftState | committedEvent`),
which makes it directly unit-testable without any DOM.

## 7. Video engine

- Each `VideoRef` resolves to a `File` → `URL.createObjectURL` → single `<video>` element.
  A period switcher (tabs above the player) swaps the source; the **global match timeline**
  concatenates periods using `kickoffOffset` and cached durations, so an event's displayed
  match clock is `periodStartClock + (videoTime - kickoffOffset)`.
- **Space** toggles play/pause. The pause timestamp is what event drafts capture.
- **Frame stepping**: browsers expose no universal "step one frame" API. Use
  `requestVideoFrameCallback` (Chromium) to *measure* the real frame rate from consecutive
  `mediaTime` deltas during the first seconds of playback, then step by `±1/fps` while
  paused. Fallback default: 1/30 s. This is accurate in practice for constant-frame-rate
  phone/camera footage.
- **Scrubbing**: custom controls bar under the video (native controls off) — a seek bar you
  can click and drag exactly like a normal player, current time / duration, playback-rate
  selector (0.5× / 1× / 1.5× / 2× — reviewers love 2×), and the period tabs. Event markers
  are drawn on the seek bar; clicking one seeks to it.

## 8. Pitch & goal geometry (IFAB)

One module, `geometry/pitch.ts`, produces the marking set for a `length × width` pitch.
Fixed IFAB dimensions regardless of pitch size:

| Element | Size |
|---|---|
| Penalty area | 16.5 m deep × 40.32 m wide (16.5 m from each post; posts 7.32 m apart) |
| Goal area | 5.5 m deep × 18.32 m wide |
| Penalty mark | 11 m from goal line |
| Penalty arc | r = 9.15 m from the mark, outside the box only |
| Center circle | r = 9.15 m |
| Corner arcs | r = 1 m |
| Goal mouth | 7.32 m wide × 2.44 m high |

The SVG uses `viewBox="0 0 {length} {width}"` — **all drawing and hit-testing happen in
meters**, so a click handler is just `svgPoint(evt)` → `{x, y}` done. Event overlays (dots
for point events, arrows for passes/clearances, colored by team, most recent highlighted)
render as an SVG layer on the same element. `contextmenu` is prevented on the pitch so RMB
is usable.

**Goal modal** (shots): an SVG of the goal mouth face-on, 7.32 × 2.44 m, drawn with a
margin of ~1.5 m on each side and ~1.2 m above (placements in the margin = narrowly off
target). Flanking UI: `⟵ WIDER` button on the far left, `WIDER ⟶` on the far right, and a
`HIGHER` button across the top, for balls that miss by more than the margin. Clicks store
`{gx, gy}` in goal-mouth meters (origin at left post, ground level); the buttons store the
`miss` enum instead.

## 9. Persistence

IndexedDB, three stores:

- `projects` — full `Project` objects **minus events** (metadata is small, saved on any settings change).
- `events` — keyed by `[projectId, eventId]`, appended/updated individually (an autosave is
  one tiny write, not a re-serialization of thousands of events).
- `handles` — `FileSystemFileHandle`s per video.

On project open: `handle.queryPermission({mode:'read'})` → if not granted,
`requestPermission` (needs one user gesture — the "Open project" click qualifies). If the
file is gone/moved: a re-link dialog listing each missing video with a "Locate…" picker,
verifying `fileName + fileSize` and warning on mismatch.

Additionally, **Export project / Import project** as a single `.json` file (everything
except the videos) — the backup story and the "move to another PC" story in one feature.

## 10. Aggregation & export

A pure module `stats/aggregate.ts`: `(events, teams) → { perPlayer, perTeam }`. Computed
on demand (a few thousand events is nothing). Per-player row:

- Passes: attempted / completed / % ; shots: total / on target / goals; **ground duels
  split by role**: the primary player (attacker) is credited with a *dribble*
  attempted/won, the `secondPlayer` (defender) with a *tackle* attempted/won — one event
  feeds both rows, mirrored; aerial duels: contested / won for both players;
  interceptions, clearances, saves (manual + derived from saved shots against the keeper),
  fouls committed / suffered, offsides.

Per-team = sum of its players + derived rates. A **Stats tab** in the app shows both tables
live, plus simple pitch visualizations for free (shot map and pass map are just the
existing SVG overlay filtered).

Exports (all client-side file downloads):

- **CSV** — three files: `players.csv`, `teams.csv`, `events.csv` (raw log: match clock,
  period, type, players, success, x/y in meters *and* normalized attack-direction x/y).
- **XLSX** — one workbook via exceljs: sheets *Teams*, *Players*, *Events*, with header
  styling and team colors.
- **JSON** — the raw project dump (same file as Export project).

## 11. Recording panel layout

```
┌──────────┬────────────────────────────────────────────┬──────────┐
│ TEAM A   │  [1st half] [2nd half]          ⚙ settings │  TEAM B  │
│ (color)  │ ┌────────────────────────────────────────┐ │ (color)  │
│ 1 Nowak  │ │                                        │ │ ⇧1 Vega  │
│ 2 Kowal  │ │              VIDEO                     │ │ ⇧2 Ruiz  │
│ u Bąk    │ │                                        │ │ ⇧u Sosa  │
│ i Lis    │ └────────────────────────────────────────┘ │ ⇧i Cruz  │
│ …        │  ▶ ──────●────────────── 37:12 / 45:30 2×  │  …       │
│          │ ┌────────────────────────────────────────┐ │          │
│ selected │ │             PITCH (SVG)                │ │ ACTIONS  │
│ player   │ │        with event overlay              │ │ q shot   │
│ highlit  │ └────────────────────────────────────────┘ │ w pass   │
│          │  HUD: ⟨ 7 Kowal · Pass · click end… ⟩ [Esc]│ e offs…  │
├──────────┴────────────────────────────────────────────┴──────────┤
│ TIMELINE: chronological event list (chips: 37:02 ⚽ Kowal → edit/✕)│
└───────────────────────────────────────────────────────────────────┘
```

- Squad panels double as a mouse fallback (click = same as pressing the key) and highlight
  the currently drafted player(s). Action panel likewise — every keyboard interaction has a
  click equivalent, per the requirements.
- Timeline rows: click seeks the video, ✎ opens an edit dialog (fix player/success/position),
  ✕ deletes (undoable).

## 12. Project structure

```
src/
  lib/
    db/            idb schema, project/event repositories, file-handle relinking
    geometry/      pitch.ts (IFAB markings), goal.ts, coord mapping + normalization
    input/         keymap.ts (code+shift resolution), bindings store, conflict checks
    recorder/      draft-machine.ts (pure reducer), action-defs.ts, undo.ts
    stats/         aggregate.ts, derive.ts (saves-from-shots, duel mirroring)
    export/        csv.ts, xlsx.ts, json.ts
    video/         playlist.ts (multi-period clock), framerate.ts, player controls
  components/
    setup/         PitchForm, VideoList, SquadEditor, BindingEditor
    record/        VideoPlayer, PitchView, GoalModal, SquadPanel, ActionPanel,
                   DraftHud, EventTimeline
    stats/         StatsTables, ShotMap, PassMap
  routes/ or App.svelte with a simple screen switcher (no router needed)
tests/             draft-machine, aggregate, geometry, keymap
```

## 13. Implementation milestones

1. **Skeleton + geometry** — Vite/Svelte scaffold; pitch SVG from dimensions with meter
   coordinate mapping; unit tests for markings. *(Visible result: parametric pitch.)*
2. **Video engine** — file picking, playback, custom controls, space/arrows, frame-rate
   probe, multi-period playlist and match clock.
3. **Setup wizard + persistence** — project CRUD in IndexedDB, squads, keybind editor with
   conflicts, handle storage + re-link flow.
4. **Recorder** — draft state machine, ACTION_DEFS, pitch click capture (LMB/RMB), goal
   modal, HUD, undo/redo, autosave, event overlay + timeline. *(The app is usable here.)*
5. **Stats + exports** — aggregation module, stats tab, CSV/XLSX/JSON export, shot/pass maps.
6. **Polish** — edit-event dialog, playback-rate, empty states, keyboard-shortcut cheat
   sheet overlay (`?`), unsupported-browser message.

Each milestone is shippable and testable on real footage; 4 is the moment to dogfood a
half of a real match and adjust the UX before building 5–6.

## 14. Assumptions & open questions

1. **Interception / offside second phase** — *resolved*: offside is a single-player point
   event (confirmed by the user); interception likewise commits immediately on the pitch
   click. Both are one-line changes in `ACTION_DEFS` if this should ever change.
2. **Saves** — auto-credited to the keeper tagged as `secondPlayer` on a saved shot; the
   manual `save` action also exists. Pick one style per project to avoid double counting
   (the plan notes this in the UI as a hint).
3. **Side switching** — attack direction is set per period in setup so exported coordinates
   can be normalized; confirm this matches how you want shot/pass maps oriented.
4. **Pass success semantics** — RMB pass = misplaced; the end click then means "where the
   ball was lost". Recipient (`secondPlayer`) is optional and only offered for successful passes.
5. **Substitutions are not modeled** — all players who appear at any point are in the squad
   list; minutes-played is out of scope (would need sub-on/sub-off events — easy to add
   later as two more action types thanks to `ACTION_DEFS`).
