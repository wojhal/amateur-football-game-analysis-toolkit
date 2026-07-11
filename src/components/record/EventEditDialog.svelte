<script lang="ts">
  import type { MatchEvent, Point, ShotTarget } from '../../lib/types';
  import { isPassLike, otherTeam } from '../../lib/types';
  import { isOnTarget } from '../../lib/geometry/goal';
  import { session } from '../../lib/state/session.svelte';
  import { ACTION_DEFS } from '../../lib/recorder/action-defs';
  import GoalMouth from './GoalMouth.svelte';
  import PitchView from './PitchView.svelte';

  const project = $derived(session.project!);
  const ev = $derived(session.editingEvent!);

  let playerId = $state('');
  let secondPlayerId = $state('');
  let successful = $state(true);
  let isKeyPass = $state(false);
  let isDribble = $state(false);
  let seriousMistake = $state(false);
  let shotTarget = $state<ShotTarget | null>(null);
  let passStart = $state<Point | null>(null);
  let passEnd = $state<Point | null>(null);
  let movePoint = $state<'start' | 'end'>('end');
  let defenders = $state<Point[]>([]);
  let keeper = $state<Point | null>(null);
  let shotPos = $state<Point | null>(null);
  let frameMode = $state<'defenders' | 'keeper' | 'shot'>('defenders');

  $effect(() => {
    playerId = ev.playerId;
    secondPlayerId = ev.secondPlayerId ?? '';
    successful = ev.successful;
    isKeyPass = ev.type === 'keyPass';
    isDribble = ev.type === 'dribble';
    seriousMistake = !!ev.seriousMistake;
    shotTarget = ev.shotTarget ?? null;
    passStart = ev.start ? { ...ev.start } : null;
    passEnd = ev.end ? { ...ev.end } : null;
    movePoint = 'end';
    defenders = (ev.shotContext?.defenders ?? []).map((d) => ({ ...d }));
    keeper = ev.shotContext?.keeper ? { ...ev.shotContext.keeper } : null;
    shotPos = ev.type === 'shot' ? { ...ev.start } : null;
    frameMode = 'defenders';
  });

  function pickTarget(t: ShotTarget) {
    shotTarget = t;
    // Blocked or off-target placements can't be goals.
    if ('blocked' in t || 'miss' in t || !isOnTarget(t.gx, t.gy)) successful = false;
  }

  const isPass = $derived(isPassLike(ev.type));
  const canBeMistake = $derived(
    (isPassLike(ev.type) ||
      ev.type === 'groundDuel' ||
      ev.type === 'aerialDuel' ||
      ev.type === 'dribble') &&
      !successful,
  );

  function onLineClick(point: Point) {
    if (movePoint === 'start') passStart = point;
    else passEnd = point;
  }

  // --- shot freeze frame editing ---
  const defenderColor = $derived(
    project.teams.find((t) => t.id === otherTeam(ev.teamId))?.color ?? '#ff5d5d',
  );
  const shooterColor = $derived(
    project.teams.find((t) => t.id === ev.teamId)?.color ?? '#fff',
  );

  const frameMarkers = $derived([
    ...defenders.map((point) => ({ point, color: defenderColor })),
    ...(keeper ? [{ point: keeper, color: '#ffd75e' }] : []),
  ]);

  function onFrameClick(point: Point, add: boolean) {
    if (frameMode === 'shot') {
      shotPos = point; // any button moves the shot
      return;
    }
    if (frameMode === 'keeper') {
      keeper = add ? point : null; // RMB clears the keeper
      return;
    }
    if (add) {
      defenders.push(point);
    } else {
      let best = -1;
      let bestD = 4; // RMB removes the defender within 4 m of the click
      defenders.forEach((d, i) => {
        const dist = Math.hypot(d.x - point.x, d.y - point.y);
        if (dist < bestD) {
          bestD = dist;
          best = i;
        }
      });
      if (best >= 0) defenders.splice(best, 1);
    }
  }

  /** Preview event with the edited line, drawn on the mini pitch. */
  const linePreview = $derived.by(() => {
    if (!isPass || !passStart) return [];
    const snap = $state.snapshot(ev) as MatchEvent;
    return [{ ...snap, start: passStart, end: passEnd ?? undefined, successful }];
  });

  const primaryTeam = $derived(project.teams.find((t) => t.id === ev.teamId)!);
  const def = $derived(ACTION_DEFS[ev.type]);
  const failedPass = $derived(isPassLike(ev.type) && !successful);
  // Failed passes pair with the interceptor (opponent); everything else
  // follows the action definition.
  const secondTeamId = $derived(
    failedPass || def.secondPlayerTeam === 'other' ? otherTeam(ev.teamId) : ev.teamId,
  );
  const secondTeam = $derived(project.teams.find((t) => t.id === secondTeamId)!);

  function save() {
    const before = $state.snapshot(ev) as MatchEvent;
    const after: MatchEvent = {
      ...before,
      playerId,
      secondPlayerId: secondPlayerId || undefined,
      successful,
    };
    if (after.type === 'groundDuel' || after.type === 'dribble') {
      after.type = isDribble ? 'dribble' : 'groundDuel';
    }
    if (isPassLike(after.type)) {
      after.type = isKeyPass ? 'keyPass' : 'pass';
      if (after.successful) delete after.passOutcome;
      else after.passOutcome = after.secondPlayerId ? 'intercepted' : 'out';
    }
    if (after.type === 'shot' && shotTarget) {
      after.shotTarget = $state.snapshot(shotTarget) as ShotTarget;
      if ('blocked' in after.shotTarget) after.successful = false;
    }
    if (after.type === 'shot') {
      after.shotContext =
        defenders.length > 0 || keeper
          ? {
              defenders: $state.snapshot(defenders) as Point[],
              keeper: keeper ? ($state.snapshot(keeper) as Point) : undefined,
            }
          : undefined;
      if (shotPos) after.start = $state.snapshot(shotPos) as Point;
    }
    if (isPassLike(after.type)) {
      if (passStart) after.start = $state.snapshot(passStart) as Point;
      if (passEnd) after.end = $state.snapshot(passEnd) as Point;
    }
    if (seriousMistake && !after.successful) after.seriousMistake = true;
    else delete after.seriousMistake;
    session.updateEvent(ev, after);
    session.editingEvent = null;
  }

  function remove() {
    session.deleteEvent(ev);
  }
</script>

<div class="modal-backdrop">
  <div class="modal">
    <h2>Edit event — {def.label}</h2>

    <div class="grid">
      <label for="ee-player">Player ({primaryTeam.name})</label>
      <select id="ee-player" bind:value={playerId}>
        {#each primaryTeam.players as p (p.id)}
          <option value={p.id}>{p.number != null ? `${p.number} ` : ''}{p.name || '(unnamed)'}</option>
        {/each}
      </select>

      {#if def.secondPlayer !== 'none'}
        <label for="ee-second">
          {failedPass ? 'Intercepted by' : 'Second player'} ({secondTeam.name})
        </label>
        <select id="ee-second" bind:value={secondPlayerId}>
          <option value="">{failedPass ? '(none — ball out of bounds)' : '(none)'}</option>
          {#each secondTeam.players as p (p.id)}
            <option value={p.id}>{p.number != null ? `${p.number} ` : ''}{p.name || '(unnamed)'}</option>
          {/each}
        </select>
      {/if}

      {#if ev.type === 'groundDuel' || ev.type === 'dribble'}
        <label for="ee-dribble">Dribble</label>
        <label class="check" for="ee-dribble">
          <input id="ee-dribble" type="checkbox" bind:checked={isDribble} />
          deliberate take-on (unticked = ground duel)
        </label>
      {/if}

      {#if isPass}
        <label for="ee-keypass">Key pass</label>
        <label class="check" for="ee-keypass">
          <input id="ee-keypass" type="checkbox" bind:checked={isKeyPass} />
          chance-creating pass
        </label>
      {/if}

      {#if !def.neutralOutcome}
        <label for="ee-success">Outcome</label>
        <select id="ee-success" bind:value={successful}>
          <option value={true}>✓ Successful ({def.successHint})</option>
          <option value={false}>✗ Unsuccessful ({def.failHint})</option>
        </select>
      {/if}

      {#if canBeMistake}
        <label for="ee-mistake">Serious mistake</label>
        <label class="check" for="ee-mistake">
          <input id="ee-mistake" type="checkbox" bind:checked={seriousMistake} />
          flag this failure as a serious mistake
        </label>
      {/if}
    </div>

    {#if ev.type === 'shot'}
      <div class="goal-edit">
        <p class="dim" style="margin: 12px 0 6px">
          Shot placement — click to change where the ball went:
        </p>
        <GoalMouth target={shotTarget} onpick={pickTarget} />
      </div>

      <div class="frame-edit">
        <div class="row" style="margin: 12px 0 6px">
          <span class="dim">Freeze frame (xG) — place the</span>
          <button
            class="seg"
            class:on={frameMode === 'defenders'}
            onclick={() => (frameMode = 'defenders')}
          >
            defenders ({defenders.length})
          </button>
          <button class="seg" class:on={frameMode === 'keeper'} onclick={() => (frameMode = 'keeper')}>
            keeper {keeper ? '●' : '○'}
          </button>
          <button class="seg" class:on={frameMode === 'shot'} onclick={() => (frameMode = 'shot')}>
            shot position
          </button>
          <span class="dim">LMB places, RMB removes</span>
        </div>
        <div class="line-pitch">
          <PitchView
            length={project.pitch.length}
            width={project.pitch.width}
            teams={project.teams}
            interactive
            onPitchClick={onFrameClick}
            draftPoint={shotPos ?? ev.start}
            draftColor={shooterColor}
            extraPoints={frameMarkers}
          />
        </div>
      </div>
    {/if}

    {#if isPass}
      <div class="line-edit">
        <div class="row" style="margin: 12px 0 6px">
          <span class="dim">Pass line — click the pitch to move the</span>
          <button class="seg" class:on={movePoint === 'start'} onclick={() => (movePoint = 'start')}>
            start
          </button>
          <button class="seg" class:on={movePoint === 'end'} onclick={() => (movePoint = 'end')}>
            end
          </button>
        </div>
        <div class="line-pitch">
          <PitchView
            length={project.pitch.length}
            width={project.pitch.width}
            events={linePreview}
            teams={project.teams}
            highlightId={ev.id}
            interactive
            onPitchClick={onLineClick}
          />
        </div>
      </div>
    {/if}

    <div class="row buttons">
      <button class="danger" onclick={remove}>Delete event</button>
      <div class="grow"></div>
      <button onclick={() => (session.editingEvent = null)}>Cancel</button>
      <button class="primary" onclick={save}>Save</button>
    </div>
  </div>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px 14px;
    align-items: center;
    min-width: 380px;
  }

  .buttons {
    margin-top: 16px;
  }

  .line-pitch {
    height: 260px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text);
  }

  .seg {
    padding: 2px 10px;
    font-size: 12px;
  }

  .seg.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #0b1420;
    font-weight: 600;
  }

  .grow {
    flex: 1;
  }
</style>
