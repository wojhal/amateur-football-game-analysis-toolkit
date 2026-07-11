# ⚽ Tartak Analizato-inator

A local, fully client-side web app for manual event tagging and analysis of amateur
football recordings. No server, no accounts — video files are read straight from disk
and all data stays in your browser. See `PLAN.md` for the architecture.

**Requires Chrome or Edge** (uses the File System Access API to remember where your
video files live between sessions).

## Run it

```sh
npm install
npm run dev        # development server
```

or build a static bundle you can host anywhere (GitHub Pages, a folder, anything):

```sh
npm run build      # output in dist/
npm run preview    # serve the built bundle locally
```

## Workflow

### 1. Set up a project

Pitch size (IFAB-correct markings at any dimensions), match videos — local files and/or
pasted **YouTube links** (one per half is fine, sources can be mixed), each with a
period label, kickoff offset and attack direction — and both squads with key bindings.

### 2. Record events

Build an event in any order, then commit it with a pitch click:

- **player key** — team 1: `1–0 U I O P J K L N M`; team 2: same keys + `Shift`
- **action key** — `Q` shot, `W` pass, `S` key pass, `E` offside, `R` ground duel,
  `T` aerial duel, `G` dribble, `A` clearance, `D` save, `F` foul, `Z` turnover
- **click the pitch** where it happened — **LMB = successful, RMB = unsuccessful**
  (turnovers are outcome-less; either button works)

Then, per action:

- **Passes / key passes** want a second click (where the ball ended up). A *failed*
  pass additionally asks for the interceptor's key (opponent) — or the **⤫ Out of
  bounds** button. Interceptions are derived from this, not recorded separately.
- **Shots** open the goal modal: click the placement (frame = on target, margin =
  narrowly off), or use *Wider*/*Higher*/*Blocked* buttons. Two freeze-frame stages
  follow — click the defenders between ball and goal, then the goalkeeper (skipping the
  keeper counts as an **empty net** for xG). Saves and blocks then ask for the
  responsible opponent's key.
- **Fouls / duels / dribbles** want the second player's key (fouler, opponent,
  defender). Clearances, offsides and turnovers commit immediately.

Transport: `Space` play/pause · `←`/`→` frame step · `Shift+←/→` ±5 s · speed slider
0.25–2× · `Esc` cancel draft · `Ctrl+Z` undo · `?` shortcut help. The video keeps its
native aspect ratio at a constant size; the pitch is a bottom drawer that slides up
over it when paused or when hovering the bottom of the screen. After an event commits,
the player and action stay selected for rapid sequences. Squad panels sit on the side
their team defends in the current period.

Everything autosaves to the browser after every event. The Events panel (right column)
lists newest first, filters by team or last event (also driving the pitch overlay), and
the ⛶ button opens an enlarged browser filterable by player and action with per-event
xG/xT. Any event can be edited (✎): players, outcome, pass ↔ key pass toggle, ground
duel ↔ dribble toggle, serious-mistake flag for failures, pass lines, shot placement,
shot position, and the shot freeze frame.

### 3. Analyze & export

The **Stats** tab shows live zebra-striped per-player and per-team tables, team
shot/pass maps and a per-player event map — shots draw a line to where they landed on
the goal line, goals render as ⚽, and clicking any marker opens a detail card (who,
when, what, xG/xT). Exports: CSV (players / teams / raw events), Excel workbook, and
raw JSON.

**Sharing an analysis**: *Export* on the project list produces a single `.json` file
with the whole project and every event — send it to anyone; they load it via *Import
project*. Local video files must be re-linked on their machine (YouTube clips play
immediately), and importing over an existing copy offers overwrite-or-keep-both.

## Metric definitions

| Metric | Definition |
|---|---|
| Passes | Attempted / completed; includes key passes |
| Key passes | Chance-creating passes (separate count, also in Passes) |
| Progressive | Passes ending ≥ 2 m closer to the opponent's goal |
| Long balls | Passes ≥ 30 m that also gain ≥ 10 m toward goal |
| xT | Expected threat ([Karun Singh's 12×8 grid](https://karun.in/blog/expected-threat.html)): end-zone value − start-zone value of completed passes; negative for backward passes; ball losses carry none |
| Shots / On target / Goals | Goals always count as on target; placements outside the frame are never goals |
| xG | Base: the fitted [Soccermatics logistic model](https://soccermatics.readthedocs.io/) (angle + distance features). The freeze frame is authoritative on top: no keeper placed = empty net; keeper on the shot line = normal keeper; no defenders placed = clean look (1v1); each blocker near the shot line reduces it. Weights are tunable in `src/lib/stats/xg.ts` |
| Ground duels | 50/50 contests as the initiating player only |
| Dribbles / Tackles | Take-ons: attacker gets a dribble, defender a tackle. Tackles also include the defending side of ground duels |
| Aerials | Aerial duels, both players credited (mirrored) |
| Interceptions | Derived from failed passes tagged with an interceptor |
| Saves / Blocks | From saved on-target shots / blocked shots naming the opponent (plus manual save events) |
| Turnovers | Failed passes + lost dribbles + manual turnover events |
| Mistakes | Failures flagged "serious mistake" in the editor |

**YouTube clips**: streamed via the official embedded player — needs internet, the
video owner must allow embedding, and frame stepping is approximate. Local files are
the most precise option.

## Development

```sh
npm test           # vitest unit tests (geometry, recorder state machine, stats, xG/xT)
npm run check      # svelte-check / TypeScript
```

Stack: Svelte 5 + TypeScript + Vite · SVG pitch (drawn in meters, IFAB-correct fixed
elements) · IndexedDB via `idb` · exceljs (lazy-loaded) for XLSX export · YouTube
IFrame API (lazy-loaded) for streamed clips.
