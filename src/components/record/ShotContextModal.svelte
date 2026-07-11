<script lang="ts">
  import type { Point } from '../../lib/types';
  import { otherTeam } from '../../lib/types';
  import { session } from '../../lib/state/session.svelte';

  import PitchView from './PitchView.svelte';

  const project = $derived(session.project!);
  const draft = $derived(session.draft);
  const stage = $derived(draft.phase); // awaitShotDefenders | awaitShotKeeper

  const shooterColor = $derived(
    project.teams.find((t) => t.id === draft.teamId)?.color ?? '#fff',
  );
  const defenderColor = $derived(
    project.teams.find((t) => t.id === otherTeam(draft.teamId ?? 'home'))?.color ?? '#ff5d5d',
  );

  // Local freeze-frame state, lives for the duration of one shot.
  let defenders = $state<Point[]>([]);
  let keeper = $state<Point | null>(null);

  function onPitchClick(point: Point, add: boolean) {
    if (stage === 'awaitShotDefenders') {
      if (add) {
        defenders.push(point);
      } else {
        // RMB: remove the defender closest to the click (within 4 m).
        let best = -1;
        let bestD = 4;
        defenders.forEach((d, i) => {
          const dist = Math.hypot(d.x - point.x, d.y - point.y);
          if (dist < bestD) {
            bestD = dist;
            best = i;
          }
        });
        if (best >= 0) defenders.splice(best, 1);
      }
    } else {
      keeper = point; // any button just (re)places the keeper
    }
  }

  const markers = $derived([
    ...defenders.map((point) => ({ point, color: defenderColor })),
    ...(keeper ? [{ point: keeper, color: '#ffd75e' }] : []),
  ]);

  function next() {
    session.dispatch({ kind: 'shotDefenders', defenders: $state.snapshot(defenders) as Point[] });
  }

  function skipDefenders() {
    defenders = [];
    session.dispatch({ kind: 'shotDefenders', defenders: [] });
  }

  function done() {
    session.dispatch({ kind: 'shotKeeper', keeper: keeper ? ($state.snapshot(keeper) as Point) : null });
  }
</script>

<div class="modal-backdrop">
  <div class="modal frame-modal">
    <h2>
      {stage === 'awaitShotDefenders' ? 'Freeze frame 1/2 — defenders' : 'Freeze frame 2/2 — goalkeeper'}
      <span class="dim" style="font-weight: 400">— used for the shot's xG</span>
    </h2>
    <p class="dim hint">
      {#if stage === 'awaitShotDefenders'}
        Click where the opposing outfield players were between the ball and the goal
        (LMB adds, RMB removes) — the keeper comes next.
      {:else}
        Click where the goalkeeper was (click again to correct). Skipping counts
        as an <b>empty net</b> for the shot's xG.
      {/if}
    </p>

    <div class="pitch">
      <PitchView
        length={project.pitch.length}
        width={project.pitch.width}
        teams={project.teams}
        interactive
        {onPitchClick}
        draftPoint={draft.start ?? null}
        draftColor={shooterColor}
        extraPoints={markers}
      />
    </div>

    {#if session.draftError}
      <p class="err">⚠ {session.draftError}</p>
    {/if}

    <div class="row buttons">
      <span class="dim">
        {stage === 'awaitShotDefenders'
          ? `${defenders.length} defender${defenders.length === 1 ? '' : 's'} placed`
          : keeper
            ? 'Keeper placed'
            : 'No keeper placed'}
      </span>
      <div class="grow"></div>
      {#if stage === 'awaitShotDefenders'}
        <button onclick={skipDefenders}>Skip</button>
        <button class="primary" onclick={next}>Next: goalkeeper →</button>
      {:else}
        <button onclick={done}>{keeper ? 'Done' : 'Skip (empty net)'}</button>
        {#if keeper}
          <button onclick={() => (keeper = null)}>Clear</button>
          <button class="primary" onclick={done}>Done ✓</button>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .frame-modal {
    width: min(94vw, 860px);
  }

  .pitch {
    height: min(52vh, 420px);
  }

  .hint {
    margin: 0 0 8px;
    font-size: 12px;
  }

  .err {
    color: var(--bad);
    margin: 6px 0 0;
  }

  .buttons {
    margin-top: 10px;
  }

  .grow {
    flex: 1;
  }
</style>
