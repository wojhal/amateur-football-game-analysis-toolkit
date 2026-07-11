<script lang="ts">
  import type { Team } from '../../lib/types';
  import { session } from '../../lib/state/session.svelte';
  import { bindLabel } from '../../lib/input/keymap';

  interface Props {
    team: Team;
    /** Attack direction in the current period, as drawn on the pitch. */
    attack?: 'ltr' | 'rtl' | null;
  }

  let { team, attack = null }: Props = $props();

  function isPrimary(id: string): boolean {
    return session.draft.playerId === id && session.draft.teamId === team.id;
  }

  function isSecond(id: string): boolean {
    return session.draft.secondPlayerId === id;
  }
</script>

<div class="squad" style="--team: {team.color}">
  <h3>
    {team.name}
    {#if attack}
      <span class="dir" title="Attacking {attack === 'ltr' ? 'right' : 'left'} this period">
        {attack === 'ltr' ? '→' : '←'}
      </span>
    {/if}
  </h3>
  <div class="players">
    {#each team.players as p (p.id)}
      <button
        class="player"
        class:primary={isPrimary(p.id)}
        class:second={isSecond(p.id)}
        onclick={() => session.dispatch({ kind: 'player', teamId: team.id, playerId: p.id })}
      >
        <kbd>{bindLabel(p.bind)}</kbd>
        <span class="pname">
          {#if p.number != null}<span class="num">{p.number}</span>{/if}
          {p.name || '(unnamed)'}
        </span>
      </button>
    {/each}
  </div>
</div>

<style>
  .squad {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--border);
    border-top: 3px solid var(--team);
    border-radius: 8px;
    background: var(--bg-panel);
    padding: 8px;
  }

  h3 {
    color: var(--team);
    margin-bottom: 6px;
    font-size: 14px;
  }

  .dir {
    color: var(--text-dim);
    font-weight: 400;
  }

  .players {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .player {
    display: flex;
    align-items: center;
    gap: 7px;
    text-align: left;
    padding: 4px 7px;
    background: transparent;
    border-color: transparent;
    width: 100%;
  }

  .player:hover {
    border-color: var(--team);
  }

  .player.primary {
    background: var(--team);
    color: #0b1420;
    font-weight: 600;
  }

  .player.primary kbd {
    color: var(--text);
  }

  .player.second {
    outline: 1.5px dashed var(--team);
  }

  .pname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .num {
    opacity: 0.7;
    margin-right: 3px;
  }
</style>
