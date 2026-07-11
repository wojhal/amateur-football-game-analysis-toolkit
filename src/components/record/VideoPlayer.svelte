<script lang="ts">
  import { session } from '../../lib/state/session.svelte';
  import { videoCtl } from '../../lib/state/videoctl.svelte';
  import { formatVideoTime, formatClock, matchClock, sortedVideos } from '../../lib/video/playlist';
  import { isYouTubeVideo } from '../../lib/types';
  import YouTubePlayer from './YouTubePlayer.svelte';

  const project = $derived(session.project!);
  const videos = $derived(sortedVideos(project.videos));
  const current = $derived(project.videos.find((v) => v.id === session.currentVideoId) ?? null);
  const url = $derived(session.currentVideoId ? session.videoUrls[session.currentVideoId] : undefined);


  let videoEl = $state<HTMLVideoElement | null>(null);

  $effect(() => {
    const el = videoEl;
    const id = session.currentVideoId;
    if (el && id && url) {
      videoCtl.attachFile(el, id);
      return () => videoCtl.detach(id);
    }
  });

  // Smooth seek-bar sync while playing (works for both backends).
  $effect(() => {
    let raf = 0;
    const loop = () => {
      videoCtl.sync();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  function onLoadedMetadata() {
    if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      videoCtl.aspect = videoEl.videoWidth / videoEl.videoHeight;
    }
    videoCtl.sync();
    if (videoCtl.pendingSeek !== null) {
      videoCtl.seek(videoCtl.pendingSeek);
      videoCtl.pendingSeek = null;
    }
  }

  function onPlay() {
    videoCtl.sync();
    if (videoEl && session.currentVideoId) {
      videoCtl.probe.probe(videoEl, session.currentVideoId);
    }
  }

  function switchVideo(id: string) {
    if (session.currentVideoId === id) return;
    videoCtl.pause();
    session.currentVideoId = id;
  }

  // --- seek bar ---
  let seekbar: HTMLDivElement | undefined;
  let dragging = false;

  function seekFromPointer(e: PointerEvent) {
    if (!seekbar || videoCtl.duration <= 0) return;
    const rect = seekbar.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    videoCtl.seek(frac * videoCtl.duration);
  }

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    seekbar?.setPointerCapture(e.pointerId);
    seekFromPointer(e);
  }

  function onPointerMove(e: PointerEvent) {
    if (dragging) seekFromPointer(e);
  }

  function onPointerUp() {
    dragging = false;
  }

  const progress = $derived(videoCtl.duration > 0 ? videoCtl.currentTime / videoCtl.duration : 0);
  const currentEvents = $derived(session.events.filter((e) => e.videoId === session.currentVideoId));

  const clock = $derived(
    current ? formatClock(matchClock(videos, current.id, videoCtl.currentTime)) : '0:00',
  );

  async function locate() {
    if (!current) return;
    const ok = await session.relinkVideo(current.id);
    if (!ok) session.toast('Could not open the video file');
  }
</script>

<div class="player">
  <div class="tabs">
    {#each videos as v (v.id)}
      <button
        class="tab"
        class:active={v.id === session.currentVideoId}
        onclick={() => switchVideo(v.id)}
      >
        {v.periodLabel}
      </button>
    {/each}
  </div>

  <div class="controls row">
    <button onclick={() => videoCtl.togglePlay()} title="Play/pause (Space)">
      {videoCtl.paused ? '▶' : '⏸'}
    </button>
    <button onclick={() => videoCtl.stepFrames(-1)} title="Previous frame (←)">⏴¹</button>
    <button onclick={() => videoCtl.stepFrames(1)} title="Next frame (→)">¹⏵</button>
    <span class="time">
      {formatVideoTime(videoCtl.currentTime)} / {formatVideoTime(videoCtl.duration)}
      <span class="dim">· match {clock}</span>
    </span>
    <div class="grow"></div>
    <button
      class="rate-label"
      onclick={() => videoCtl.setRate(1)}
      title="Playback speed — click to reset to 1×"
    >
      {videoCtl.rate.toFixed(2).replace(/0$/, '')}×
    </button>
    <input
      class="rate"
      type="range"
      min="0.25"
      max="2"
      step="0.05"
      value={videoCtl.rate}
      oninput={(e) => videoCtl.setRate(Number((e.target as HTMLInputElement).value))}
      onpointerup={(e) => (e.target as HTMLInputElement).blur()}
      title="Playback speed"
    />
  </div>

  <div
    class="seekbar"
    bind:this={seekbar}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    role="slider"
    aria-label="Video position"
    aria-valuenow={Math.round(progress * 100)}
    tabindex="-1"
  >
    <div class="fill" style="width: {progress * 100}%"></div>
    {#each currentEvents as e (e.id)}
      {#if videoCtl.duration > 0}
        <div
          class="marker"
          class:hl={e.id === session.lastEventId}
          style="left: {(e.videoTime / videoCtl.duration) * 100}%"
        ></div>
      {/if}
    {/each}
  </div>

  <div class="screen" style="aspect-ratio: {videoCtl.aspect}">
    {#if current && isYouTubeVideo(current)}
      {#key current.id}
        <YouTubePlayer video={current} />
      {/key}
    {:else if url}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={videoEl}
        src={url}
        preload="auto"
        onloadedmetadata={onLoadedMetadata}
        onplay={onPlay}
        onpause={() => videoCtl.sync()}
        onclick={() => videoCtl.togglePlay()}
      ></video>
    {:else}
      <div class="placeholder">
        <p class="dim">{current ? `"${current.fileName}" is not available.` : 'No video selected.'}</p>
        {#if current}
          <button class="primary" onclick={locate}>Locate file…</button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .player {
    display: flex;
    flex-direction: column;
    height: auto;
    max-height: 100%;
    min-height: 0;
  }

  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 4px;
  }

  .tab {
    border-radius: 6px 6px 0 0;
    border-bottom: none;
    padding: 3px 12px;
  }

  .tab.active {
    background: var(--accent);
    color: #0b1420;
    font-weight: 600;
  }

  /* Sized by the video's native aspect ratio at full width — maximum
     resolution, no wasted letterbox. Shrinks (with side bars) only if the
     column is too short to fit it. */
  .screen {
    width: 100%;
    flex: 0 1 auto;
    min-height: 0;
    background: #000;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .placeholder {
    text-align: center;
  }

  .seekbar {
    position: relative;
    height: 14px;
    margin: 6px 0;
    background: var(--bg-raised);
    border-radius: 7px;
    cursor: pointer;
    touch-action: none;
  }

  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--accent);
    border-radius: 7px;
    opacity: 0.65;
    pointer-events: none;
  }

  .marker {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    background: #ffd75e;
    pointer-events: none;
  }

  .marker.hl {
    width: 3px;
    background: #fff;
  }

  .controls {
    gap: 6px;
  }

  .rate-label {
    min-width: 52px;
    padding: 2px 6px;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
  }

  .rate {
    width: 110px;
    accent-color: var(--accent);
  }

  .time {
    font-variant-numeric: tabular-nums;
  }

  .grow {
    flex: 1;
  }
</style>
