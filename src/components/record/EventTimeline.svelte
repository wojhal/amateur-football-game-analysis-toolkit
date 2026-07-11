<script lang="ts">
  import type { MatchEvent } from '../../lib/types';
  import { session } from '../../lib/state/session.svelte';
  import { videoCtl } from '../../lib/state/videoctl.svelte';
  import { matchClock, formatClock, sortedVideos } from '../../lib/video/playlist';
  import { ACTION_DEFS, ACTION_ORDER } from '../../lib/recorder/action-defs';
  import { playerById, shotIsOnTarget } from '../../lib/stats/aggregate';
  import { xgForEvent } from '../../lib/stats/xg';
  import { xtForPass } from '../../lib/stats/xt';
  import type { ActionType } from '../../lib/types';

  const project = $derived(session.project!);
  const videos = $derived(sortedVideos(project.videos));

  // Newest first: latest events at the top of the list.
  const sorted = $derived(
    [...session.events].sort(
      (a, b) =>
        matchClock(videos, b.videoId, b.videoTime) - matchClock(videos, a.videoId, a.videoTime),
    ),
  );

  const filter = $derived(session.eventFilter);
  let open = $state(true);

  const shown = $derived.by(() => {
    switch (filter) {
      case 'all':
        return sorted;
      case 'home':
      case 'away':
        return sorted.filter((e) => e.teamId === filter);
      case 'last': {
        // The most recently recorded event, regardless of match clock.
        const last = session.events[session.events.length - 1];
        return last ? [last] : [];
      }
    }
  });

  let list = $state<HTMLDivElement | undefined>();

  // Auto-scroll to the newest event (top of the list).
  $effect(() => {
    void session.lastEventId;
    if (list) list.scrollTop = 0;
  });

  const PREROLL = 1.5;

  function seekTo(e: MatchEvent) {
    session.lastEventId = e.id;
    const t = Math.max(0, e.videoTime - PREROLL);
    if (session.currentVideoId !== e.videoId) {
      videoCtl.pause();
      videoCtl.pendingSeek = t;
      session.currentVideoId = e.videoId;
    } else {
      videoCtl.seek(t);
    }
  }

  function teamColor(e: MatchEvent): string {
    return project.teams.find((t) => t.id === e.teamId)?.color ?? '#fff';
  }

  function label(e: MatchEvent): string {
    const p = playerById(project.teams, e.playerId);
    return p?.name || p?.number?.toString() || '?';
  }

  /** Per-event metric: xG for shots, xT for passes. */
  function infoOf(e: MatchEvent): string {
    if (e.type === 'shot') {
      const v = xgForEvent(e, project.videos, project.pitch);
      return v === null ? '' : `xG ${v.toFixed(2)}`;
    }
    if (e.type === 'pass' || e.type === 'keyPass') {
      const v = xtForPass(e, project.videos, project.pitch);
      return v === null ? '' : `xT ${v >= 0 ? '+' : ''}${v.toFixed(3)}`;
    }
    return '';
  }

  // --- enlarged popup browser ---
  let browserPlayer = $state(''); // player id, '' = all
  let browserType = $state<'' | ActionType>(''); // '' = all

  const browserEvents = $derived(
    sorted.filter(
      (e) =>
        (!browserPlayer || e.playerId === browserPlayer || e.secondPlayerId === browserPlayer) &&
        (!browserType || e.type === browserType),
    ),
  );

  function playerName(id: string | undefined): string {
    if (!id) return '';
    const p = playerById(project.teams, id);
    return p ? (p.number != null ? `${p.number} ` : '') + (p.name || '(unnamed)') : '?';
  }

  function jumpTo(e: MatchEvent) {
    seekTo(e);
    session.eventsBrowserOpen = false;
  }
</script>

<div class="timeline">
  <div class="head">
    <button class="fold" onclick={() => (open = !open)}>
      <span class="arrow">{open ? '▾' : '▸'}</span>
      Events <span class="dim">({shown.length}{filter === 'all' ? '' : ` of ${sorted.length}`})</span>
    </button>
    <button
      class="enlarge"
      title="Open enlarged event browser"
      onclick={() => (session.eventsBrowserOpen = true)}
    >
      ⛶
    </button>
  </div>
  {#if open}
  <div class="filters">
    <button class="seg" class:on={filter === 'all'} onclick={() => (session.eventFilter = 'all')}>All</button>
    <button
      class="seg"
      class:on={filter === 'home'}
      style="--seg: {project.teams[0].color}"
      title={project.teams[0].name}
      onclick={() => (session.eventFilter = 'home')}
    >
      {project.teams[0].name}
    </button>
    <button
      class="seg"
      class:on={filter === 'away'}
      style="--seg: {project.teams[1].color}"
      title={project.teams[1].name}
      onclick={() => (session.eventFilter = 'away')}
    >
      {project.teams[1].name}
    </button>
    <button class="seg" class:on={filter === 'last'} onclick={() => (session.eventFilter = 'last')}>Last</button>
  </div>
  <div class="list" bind:this={list}>
    {#if shown.length === 0}
      <span class="dim empty">
        {sorted.length === 0 ? 'Recorded events appear here.' : 'No events match this filter.'}
      </span>
    {/if}
    {#each shown as e (e.id)}
      <div class="chip" class:hl={e.id === session.lastEventId} style="--team: {teamColor(e)}">
        <button class="body" onclick={() => seekTo(e)} title="Jump to this moment">
          <span class="clock">{formatClock(matchClock(videos, e.videoId, e.videoTime))}</span>
          <span class="what">
            {#if !ACTION_DEFS[e.type].neutralOutcome}
              <span style="color: {e.successful ? 'var(--good)' : 'var(--bad)'}">
                {e.successful ? '✓' : '✗'}
              </span>
            {/if}
            {ACTION_DEFS[e.type].label}
          </span>
          <span class="who dim">{label(e)}</span>
        </button>
        <button class="mini" title="Edit" onclick={() => (session.editingEvent = e)}>✎</button>
        <button class="mini danger" title="Delete" onclick={() => session.deleteEvent(e)}>✕</button>
      </div>
    {/each}
  </div>
  {/if}
</div>

{#if session.eventsBrowserOpen}
  <div class="modal-backdrop">
    <div class="modal browser">
      <div class="row browser-head">
        <h2 style="margin: 0">Events <span class="dim">({browserEvents.length} of {sorted.length})</span></h2>
        <div class="grow"></div>
        <label for="eb-player">Player</label>
        <select id="eb-player" bind:value={browserPlayer}>
          <option value="">All players</option>
          {#each project.teams as team (team.id)}
            <optgroup label={team.name}>
              {#each team.players as p (p.id)}
                <option value={p.id}>{playerName(p.id)}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
        <label for="eb-type">Action</label>
        <select id="eb-type" bind:value={browserType}>
          <option value="">All actions</option>
          {#each ACTION_ORDER as action (action)}
            <option value={action}>{ACTION_DEFS[action].label}</option>
          {/each}
        </select>
        <button onclick={() => (session.eventsBrowserOpen = false)}>✕ Close</button>
      </div>

      <div class="browser-list">
        <table>
          <thead>
            <tr>
              <th>Clock</th><th>Period</th><th>Action</th><th></th>
              <th>Player</th><th>Second player</th><th>Detail</th><th>Info</th><th></th>
            </tr>
          </thead>
          <tbody>
            {#each browserEvents as e (e.id)}
              {@const shot = e.shotTarget}
              <tr style="--team: {teamColor(e)}">
                <td class="clock">{formatClock(matchClock(videos, e.videoId, e.videoTime))}</td>
                <td class="dim">{project.videos.find((v) => v.id === e.videoId)?.periodLabel ?? ''}</td>
                <td><span class="teambar"></span>{ACTION_DEFS[e.type].label}</td>
                <td style="color: {e.successful ? 'var(--good)' : 'var(--bad)'}">
                  {ACTION_DEFS[e.type].neutralOutcome ? '' : e.successful ? '✓' : '✗'}
                </td>
                <td>{playerName(e.playerId)}</td>
                <td class="dim">{playerName(e.secondPlayerId)}</td>
                <td class="dim">
                  {#if e.type === 'pass' && e.passOutcome}
                    {e.passOutcome === 'out' ? 'out of bounds' : 'intercepted'}
                  {:else if shot}
                    {'miss' in shot
                      ? shot.miss
                      : 'blocked' in shot
                        ? 'blocked'
                        : e.successful
                          ? 'goal'
                          : shotIsOnTarget(e)
                            ? 'on target'
                            : 'off target'}
                  {/if}
                </td>
                <td class="dim metric-cell">{infoOf(e)}</td>
                <td class="actions">
                  <button class="mini" title="Jump to this moment" onclick={() => jumpTo(e)}>▶</button>
                  <button class="mini" title="Edit" onclick={() => (session.editingEvent = e)}>✎</button>
                  <button class="mini danger" title="Delete" onclick={() => session.deleteEvent(e)}>✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if browserEvents.length === 0}
          <p class="dim" style="padding: 12px">No events match these filters.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-panel);
    padding: 8px;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 6px;
  }

  .enlarge {
    border: none;
    background: none;
    padding: 0 4px;
    font-size: 13px;
    color: var(--text-dim);
  }

  .enlarge:hover {
    color: var(--text);
  }

  .fold {
    display: block;
    flex: 1;
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

  .filters {
    display: flex;
    gap: 3px;
    margin-bottom: 6px;
  }

  .seg {
    --seg: var(--accent);
    flex: 1;
    min-width: 0;
    padding: 2px 4px;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seg.on {
    background: var(--seg);
    border-color: var(--seg);
    color: #0b1420;
    font-weight: 600;
  }

  .list {
    flex: 1;
    min-height: 0;
    max-height: 36vh;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
  }

  .empty {
    font-size: 12px;
  }

  .chip {
    display: flex;
    align-items: center;
    border: 1px solid var(--border);
    border-left: 3px solid var(--team);
    border-radius: 6px;
    background: var(--bg-raised);
    flex: 0 0 auto;
  }

  .chip.hl {
    border-color: var(--team);
  }

  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
    border: none;
    background: none;
    padding: 3px 7px;
    line-height: 1.3;
    text-align: left;
  }

  .clock {
    font-size: 11px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
    flex: 0 0 auto;
  }

  .what {
    font-size: 12px;
    font-weight: 600;
    flex: 0 0 auto;
  }

  .who {
    font-size: 11px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .metric-cell {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .mini {
    border: none;
    background: none;
    padding: 0 5px;
    font-size: 11px;
    opacity: 0.6;
  }

  .mini:hover {
    opacity: 1;
  }

  /* --- enlarged popup --- */
  .browser {
    width: min(94vw, 980px);
    display: flex;
    flex-direction: column;
    max-height: 88vh;
  }

  .browser-head {
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .grow {
    flex: 1;
  }

  .browser-list {
    overflow-y: auto;
    min-height: 0;
  }

  .browser-list td {
    font-size: 13px;
  }

  .teambar {
    display: inline-block;
    width: 3px;
    height: 0.9em;
    background: var(--team);
    border-radius: 2px;
    margin-right: 6px;
    vertical-align: -1px;
  }

  .clock {
    font-variant-numeric: tabular-nums;
  }

  .actions {
    white-space: nowrap;
  }
</style>
