<script lang="ts">
  import type { ShotTarget } from '../../lib/types';
  import { GOAL_MODAL, svgToGoal, goalToSvg } from '../../lib/geometry/goal';
  import { IFAB } from '../../lib/geometry/pitch';

  interface Props {
    /** Current placement, shown as a marker / highlighted button. */
    target?: ShotTarget | null;
    onpick: (target: ShotTarget) => void;
  }

  let { target = null, onpick }: Props = $props();

  let svgEl: SVGSVGElement;

  const W = GOAL_MODAL.viewW;
  const H = GOAL_MODAL.viewH;
  const MS = GOAL_MODAL.MARGIN_SIDE;
  const GW = IFAB.GOAL_WIDTH;
  const GH = IFAB.GOAL_HEIGHT;
  const POST = 0.12; // visual post thickness

  function place(e: MouseEvent) {
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const { gx, gy } = svgToGoal(pt.x, pt.y);
    onpick({ gx, gy });
  }

  const marker = $derived(target && 'gx' in target ? goalToSvg(target.gx, target.gy) : null);
  const missOf = $derived(target && 'miss' in target ? target.miss : null);
  const isBlocked = $derived(!!target && 'blocked' in target);
</script>

<button class="higher" class:on={missOf === 'high'} onclick={() => onpick({ miss: 'high' })}>
  ▲ Higher (over everything)
</button>

<div class="goal-row">
  <button class="wider" class:on={missOf === 'wide-left'} onclick={() => onpick({ miss: 'wide-left' })}>
    ◀<br />Wider
  </button>

  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <svg
    bind:this={svgEl}
    viewBox="0 0 {W} {H}"
    onclick={place}
    oncontextmenu={(e) => {
      e.preventDefault();
      place(e);
    }}
    role="button"
    aria-label="Goal mouth — click where the ball went"
    tabindex="-1"
  >
    <!-- sky / background -->
    <rect x="0" y="0" width={W} height={H} fill="#1a2430" />
    <!-- on-target zone -->
    <rect x={MS} y={H - GH} width={GW} height={GH} fill="#223140" />
    <!-- net grid -->
    <g stroke="#3d4f63" stroke-width="0.015">
      {#each Array.from({ length: 14 }, (_, i) => i) as i (i)}
        <line x1={MS + (GW * (i + 1)) / 15} y1={H - GH} x2={MS + (GW * (i + 1)) / 15} y2={H} />
      {/each}
      {#each Array.from({ length: 4 }, (_, i) => i) as i (i)}
        <line x1={MS} y1={H - (GH * (i + 1)) / 5} x2={MS + GW} y2={H - (GH * (i + 1)) / 5} />
      {/each}
    </g>
    <!-- posts + crossbar -->
    <g fill="#e8edf4">
      <rect x={MS - POST} y={H - GH - POST} width={POST} height={GH + POST} />
      <rect x={MS + GW} y={H - GH - POST} width={POST} height={GH + POST} />
      <rect x={MS - POST} y={H - GH - POST} width={GW + 2 * POST} height={POST} />
    </g>
    <!-- ground -->
    <line x1="0" y1={H} x2={W} y2={H} stroke="#4a5a45" stroke-width="0.08" />
    <!-- current placement -->
    {#if marker}
      <circle cx={marker.x} cy={marker.y} r="0.14" fill="#ffd75e" stroke="#0b1420" stroke-width="0.03" />
    {/if}
  </svg>

  <button class="wider" class:on={missOf === 'wide-right'} onclick={() => onpick({ miss: 'wide-right' })}>
    ▶<br />Wider
  </button>
</div>

<button class="blocked" class:on={isBlocked} onclick={() => onpick({ blocked: true })}>
  🛡 Blocked (never reached the goal)
</button>

<style>
  .goal-row {
    display: flex;
    gap: 10px;
    align-items: stretch;
  }

  svg {
    flex: 1;
    cursor: crosshair;
    border-radius: 6px;
  }

  .wider {
    width: 64px;
  }

  .higher {
    width: 100%;
    margin-bottom: 10px;
  }

  .blocked {
    width: 100%;
    margin-top: 10px;
  }

  button.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #0b1420;
    font-weight: 600;
  }
</style>
