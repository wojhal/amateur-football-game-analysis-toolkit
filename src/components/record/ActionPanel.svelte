<script lang="ts">
  import { session } from '../../lib/state/session.svelte';
  import { ACTION_DEFS, ACTION_ORDER } from '../../lib/recorder/action-defs';
  import { keyLabel } from '../../lib/input/keymap';

  const project = $derived(session.project!);
  let open = $state(true);
  let legendOpen = $state(false);
</script>

<div class="panel">
  <button class="fold" onclick={() => (open = !open)}>
    <span class="arrow">{open ? '▾' : '▸'}</span> Actions
    {#if !open && session.draft.action}
      <span class="dim">— {ACTION_DEFS[session.draft.action].label}</span>
    {/if}
  </button>
  {#if open}
    <div class="actions">
      {#each ACTION_ORDER as action (action)}
      <button
        class="action"
        class:active={session.draft.action === action}
        onclick={() => session.dispatch({ kind: 'action', action })}
      >
          <kbd>{keyLabel(project.actionBindings[action])}</kbd>
          <span>{ACTION_DEFS[action].label}</span>
        </button>
      {/each}
    </div>
    <button class="fold sub" onclick={() => (legendOpen = !legendOpen)}>
      <span class="arrow">{legendOpen ? '▾' : '▸'}</span> Legend
    </button>
    {#if legendOpen}
      <div class="legend">
        <p><span class="lmb">LMB</span> on pitch = successful</p>
        <p><span class="rmb">RMB</span> on pitch = unsuccessful</p>
        <p class="dim"><kbd>Esc</kbd> cancels the current event</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .panel {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-panel);
    padding: 8px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .fold {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    padding: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .fold:hover {
    color: var(--accent);
  }

  .arrow {
    display: inline-block;
    width: 1em;
    color: var(--text-dim);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow-y: auto;
    margin-top: 6px;
  }

  .fold.sub {
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-dim);
  }

  .fold.sub:hover {
    color: var(--text);
  }

  .legend {
    font-size: 12px;
    padding-left: 1em;
  }

  .legend p {
    margin: 2px 0;
  }

  .lmb {
    color: var(--good);
    font-weight: 600;
  }

  .rmb {
    color: var(--bad);
    font-weight: 600;
  }

  .action {
    display: flex;
    align-items: center;
    gap: 7px;
    text-align: left;
    padding: 4px 7px;
    background: transparent;
    border-color: transparent;
  }

  .action:hover {
    border-color: var(--accent);
  }

  .action.active {
    background: var(--accent);
    color: #0b1420;
    font-weight: 600;
  }

  .action.active kbd {
    color: var(--text);
  }
</style>
