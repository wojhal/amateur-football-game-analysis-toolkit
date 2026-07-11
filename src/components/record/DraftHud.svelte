<script lang="ts">
  import { session } from '../../lib/state/session.svelte';
  import { draftHint } from '../../lib/recorder/draft-machine';
  import { ACTION_DEFS } from '../../lib/recorder/action-defs';
  import { playerById } from '../../lib/stats/aggregate';

  const project = $derived(session.project!);
  const draft = $derived(session.draft);

  const playerName = $derived(
    draft.playerId ? (playerById(project.teams, draft.playerId)?.name ?? '?') : null,
  );
  const secondName = $derived(
    draft.secondPlayerId ? (playerById(project.teams, draft.secondPlayerId)?.name ?? '?') : null,
  );
  const teamColor = $derived(
    draft.teamId ? project.teams.find((t) => t.id === draft.teamId)?.color : undefined,
  );
  const empty = $derived(!draft.playerId && !draft.action && draft.phase === 'building');
</script>

<div class="hud" class:error={!!session.draftError}>
  {#if session.draftError}
    <span class="msg">⚠ {session.draftError}</span>
  {:else if empty}
    <span class="dim">{draftHint(draft)}</span>
  {:else}
    <span class="chip">
      {#if playerName}<b style="color: {teamColor}">{playerName}</b>{:else}<i class="dim">player?</i>{/if}
      ·
      {#if draft.action}<b>{ACTION_DEFS[draft.action].label}</b>{:else}<i class="dim">action?</i>{/if}
      {#if draft.successful !== undefined}
        · <b style="color: {draft.successful ? 'var(--good)' : 'var(--bad)'}">
          {draft.successful ? '✓' : '✗'}</b>
      {/if}
      {#if secondName}· <b>{secondName}</b>{/if}
    </span>
    <span class="dim hint">{draftHint(draft)}</span>
    {#if draft.phase === 'awaitPassOutcome'}
      <button class="out" onclick={() => session.dispatch({ kind: 'passOut' })}>
        ⤫ Out of bounds
      </button>
    {/if}
    <button onclick={() => session.cancelDraft()} title="Cancel (Esc)">Esc ✕</button>
  {/if}
</div>

<style>
  .hud {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 34px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-panel);
  }

  .hud.error {
    border-color: var(--bad);
  }

  .msg {
    color: var(--bad);
  }

  .hint {
    flex: 1;
  }

  button {
    padding: 2px 8px;
    font-size: 12px;
  }

  .out {
    border-color: var(--bad);
    color: var(--bad);
    font-weight: 600;
  }

  .out:hover {
    background: var(--bad);
    color: #0b1420;
  }
</style>
