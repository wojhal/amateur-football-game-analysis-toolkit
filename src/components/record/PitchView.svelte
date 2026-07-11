<script lang="ts">
  import type { MatchEvent, Point, Team } from '../../lib/types';
  import { pitchMarkings } from '../../lib/geometry/pitch';
  import { shotIsOnTarget } from '../../lib/stats/aggregate';
  import type { EventDetails } from '../../lib/describe';

  interface Props {
    length: number;
    width: number;
    events?: MatchEvent[];
    teams?: [Team, Team];
    highlightId?: string | null;
    interactive?: boolean;
    onPitchClick?: (point: Point, successful: boolean) => void;
    /** Start point of the event currently being recorded (shown immediately). */
    draftPoint?: Point | null;
    draftColor?: string;
    /** Extra markers (e.g. shot freeze frame: defenders, keeper). */
    extraPoints?: { point: Point; color: string }[];
    /**
     * When set (and the pitch is not interactive), clicking a marker opens a
     * small detail popup with this content.
     */
    details?: (e: MatchEvent) => EventDetails;
  }

  let {
    length,
    width,
    events = [],
    teams,
    highlightId = null,
    interactive = false,
    onPitchClick,
    draftPoint = null,
    draftColor = '#ffffff',
    extraPoints = [],
    details,
  }: Props = $props();

  const m = $derived(pitchMarkings(length, width));
  const PAD = 3;

  let svgEl: SVGSVGElement;
  let wrapEl: HTMLDivElement;

  const clickableMarkers = $derived(!!details && !interactive);

  /** Marker detail popup: the event plus its pixel position in the wrapper. */
  let selected = $state<{ e: MatchEvent; x: number; y: number } | null>(null);

  function onMarkerClick(evt: MouseEvent, e: MatchEvent) {
    if (!clickableMarkers) return;
    evt.stopPropagation();
    const rect = wrapEl.getBoundingClientRect();
    // Clamp so the (estimated) popup stays inside the pitch area.
    const x = Math.max(4, Math.min(evt.clientX - rect.left + 10, rect.width - 250));
    const y = Math.max(4, Math.min(evt.clientY - rect.top + 10, rect.height - 150));
    selected = { e, x, y };
  }

  function toPitchPoint(e: MouseEvent): Point | null {
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return {
      x: Math.min(length, Math.max(0, pt.x)),
      y: Math.min(width, Math.max(0, pt.y)),
    };
  }

  function handleClick(e: MouseEvent) {
    if (!interactive) {
      selected = null; // clicking empty pitch dismisses the popup
      return;
    }
    if (!onPitchClick) return;
    const p = toPitchPoint(e);
    if (p) onPitchClick(p, true);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (!interactive || !onPitchClick) return;
    const p = toPitchPoint(e);
    if (p) onPitchClick(p, false);
  }

  function teamColor(teamId: string): string {
    return teams?.find((t) => t.id === teamId)?.color ?? '#ffffff';
  }
</script>

<div class="pitch-wrap" bind:this={wrapEl}>
<svg
  bind:this={svgEl}
  viewBox="{-PAD} {-PAD} {length + 2 * PAD} {width + 2 * PAD}"
  preserveAspectRatio="xMidYMid meet"
  class:interactive
  onclick={handleClick}
  oncontextmenu={handleContextMenu}
  role={interactive ? 'button' : 'img'}
  aria-label="Football pitch"
>
  <!-- grass -->
  <rect
    x={-PAD}
    y={-PAD}
    width={length + 2 * PAD}
    height={width + 2 * PAD}
    fill="var(--pitch)"
    rx="1"
  />

  <g stroke="var(--pitch-line)" stroke-width="0.25" fill="none">
    <rect x={m.outline.x} y={m.outline.y} width={m.outline.w} height={m.outline.h} />
    <line x1={m.halfwayX} y1="0" x2={m.halfwayX} y2={width} />
    <circle cx={m.centerCircle.cx} cy={m.centerCircle.cy} r={m.centerCircle.r} />
    {#each m.penaltyAreas as r (r.x)}
      <rect x={r.x} y={r.y} width={r.w} height={r.h} />
    {/each}
    {#each m.goalAreas as r (r.x)}
      <rect x={r.x} y={r.y} width={r.w} height={r.h} />
    {/each}
    {#each m.penaltyArcs as d (d)}
      <path {d} />
    {/each}
    {#each m.cornerArcs as d (d)}
      <path {d} />
    {/each}
    {#each m.goals as r (r.x)}
      <rect x={r.x} y={r.y} width={r.w} height={r.h} stroke-width="0.35" />
    {/each}
  </g>

  <g fill="var(--pitch-line)">
    <circle cx={m.centerMark.cx} cy={m.centerMark.cy} r={m.centerMark.r} />
    {#each m.penaltyMarks as c (c.cx)}
      <circle cx={c.cx} cy={c.cy} r={c.r} />
    {/each}
  </g>

  <!-- event markers -->
  <g>
    {#each events as e (e.id)}
      {@const hl = e.id === highlightId}
      {@const color = teamColor(e.teamId)}
      {@const goal = e.type === 'shot' && e.successful}
      {@const failedMark = !e.successful && !(e.type === 'shot' && shotIsOnTarget(e))}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <g
        opacity={hl ? 1 : 0.55}
        class:clickable={clickableMarkers}
        onclick={(evt) => onMarkerClick(evt, e)}
      >
        <!-- generous invisible hit area so clicking a marker is easy -->
        <circle cx={e.start.x} cy={e.start.y} r="2" fill="transparent" />
        {#if e.end}
          <line
            x1={e.start.x}
            y1={e.start.y}
            x2={e.end.x}
            y2={e.end.y}
            stroke={color}
            stroke-width={hl ? 0.5 : 0.3}
            stroke-dasharray={e.successful ? 'none' : '1 0.7'}
          />
          <circle cx={e.end.x} cy={e.end.y} r="0.5" fill={color} />
        {/if}
        {#if goal}
          <text
            x={e.start.x}
            y={e.start.y}
            text-anchor="middle"
            dominant-baseline="central"
            font-size={hl ? 3.2 : 2.6}
          >⚽</text>
        {:else}
          <circle
            cx={e.start.x}
            cy={e.start.y}
            r={hl ? 1.1 : 0.8}
            fill={color}
            stroke={hl ? '#fff' : failedMark ? 'var(--bad)' : 'none'}
            stroke-width={hl ? 0.3 : 0.25}
          />
        {/if}
      </g>
    {/each}
  </g>

  <!-- extra markers (freeze frame) -->
  {#each extraPoints as ep, i (i)}
    <circle
      cx={ep.point.x}
      cy={ep.point.y}
      r="0.9"
      fill={ep.color}
      stroke="#0b1420"
      stroke-width="0.2"
    />
  {/each}

  <!-- in-progress event: start point placed, waiting for the finishing input -->
  {#if draftPoint}
    <g class="draft">
      <circle class="ring" cx={draftPoint.x} cy={draftPoint.y} r="1.8" fill="none" stroke={draftColor} stroke-width="0.25" />
      <circle cx={draftPoint.x} cy={draftPoint.y} r="0.9" fill={draftColor} stroke="#fff" stroke-width="0.25" />
    </g>
  {/if}
</svg>

{#if selected && details}
  {@const d = details(selected.e)}
  <div
    class="event-popup"
    style="left: {selected.x}px; top: {selected.y}px; --team-accent: {teamColor(selected.e.teamId)}"
  >
    <div class="popup-head">
      <b>{d.title}</b>
      <button class="popup-x" title="Close" onclick={() => (selected = null)}>✕</button>
    </div>
    {#if d.outcome}
      <p style="color: {d.outcome.good ? 'var(--good)' : 'var(--bad)'}">{d.outcome.text}</p>
    {/if}
    {#each d.lines as line (line)}
      <p>{line}</p>
    {/each}
  </div>
{/if}
</div>

<style>
  .pitch-wrap {
    position: relative;
    width: 100%;
    height: 100%;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  svg.interactive {
    cursor: crosshair;
  }

  g.clickable {
    cursor: pointer;
  }

  .event-popup {
    position: absolute;
    z-index: 20;
    min-width: 170px;
    max-width: 240px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--team-accent, var(--accent));
    border-radius: 8px;
    padding: 8px 10px;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.55);
    font-size: 12px;
  }

  .event-popup p {
    margin: 2px 0;
  }

  .popup-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 4px;
  }

  .popup-x {
    border: none;
    background: none;
    padding: 0 2px;
    font-size: 11px;
    color: var(--text-dim);
  }

  .popup-x:hover {
    color: var(--text);
  }

  .draft .ring {
    animation: draft-pulse 1s ease-in-out infinite;
  }

  @keyframes draft-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.25;
    }
  }
</style>
