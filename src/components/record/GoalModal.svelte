<script lang="ts">
  import { session } from '../../lib/state/session.svelte';
  import { playerById } from '../../lib/stats/aggregate';
  import GoalMouth from './GoalMouth.svelte';

  const draft = $derived(session.draft);
  const project = $derived(session.project!);
  const keeperName = $derived(
    draft.secondPlayerId ? (playerById(project.teams, draft.secondPlayerId)?.name ?? '') : '',
  );
</script>

<div class="modal-backdrop">
  <div class="modal goal-modal">
    <h2>
      Shot placement
      <span class="dim" style="font-weight: 400">
        — {draft.successful ? 'goal' : 'saved / off target / blocked'}
        {#if keeperName}· keeper: {keeperName}{/if}
      </span>
    </h2>

    <GoalMouth onpick={(target) => session.dispatch({ kind: 'goalTarget', target })} />

    <p class="dim hint">
      Click where the ball went — inside the frame counts as on target, the surrounding
      margin as narrowly off. A save or a block will then ask for the opponent's key.
      <kbd>Esc</kbd> cancels.
    </p>
  </div>
</div>

<style>
  .goal-modal {
    width: min(92vw, 860px);
  }

  .hint {
    margin: 10px 0 0;
    font-size: 12px;
  }
</style>
