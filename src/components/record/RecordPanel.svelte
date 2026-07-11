<script lang="ts">
  import { attackDirOf, type Point } from '../../lib/types';
  import { session } from '../../lib/state/session.svelte';
  import { videoCtl } from '../../lib/state/videoctl.svelte';
  import { resolveKey } from '../../lib/input/keymap';
  import VideoPlayer from './VideoPlayer.svelte';
  import PitchView from './PitchView.svelte';
  import SquadPanel from './SquadPanel.svelte';
  import ActionPanel from './ActionPanel.svelte';
  import DraftHud from './DraftHud.svelte';
  import GoalModal from './GoalModal.svelte';
  import ShotContextModal from './ShotContextModal.svelte';
  import EventTimeline from './EventTimeline.svelte';
  import EventEditDialog from './EventEditDialog.svelte';
  import StatsView from '../stats/StatsView.svelte';

  const project = $derived(session.project!);

  let helpOpen = $state(false);

  // Show each squad on the side of the pitch its team occupies this period:
  // a team attacking left-to-right defends the left half, so it goes left.
  const currentVideo = $derived(
    project.videos.find((v) => v.id === session.currentVideoId) ?? null,
  );
  const leftTeam = $derived(
    !currentVideo || currentVideo.homeAttack === 'ltr' ? project.teams[0] : project.teams[1],
  );
  const rightTeam = $derived(
    leftTeam.id === 'home' ? project.teams[1] : project.teams[0],
  );

  // The timeline's filter also drives the pitch overlay. 'last' shows the
  // most recently recorded event even if it belongs to another period; the
  // other filters stay scoped to the current video to avoid clutter.
  const pitchEvents = $derived.by(() => {
    const f = session.eventFilter;
    if (f === 'last') {
      const last = session.events[session.events.length - 1];
      return last ? [last] : [];
    }
    return session.events.filter(
      (e) => e.videoId === session.currentVideoId && (f === 'all' || e.teamId === f),
    );
  });

  // The pitch is a bottom drawer over the constant-size video: mostly hidden
  // while playing (a small sliver peeks out), it slides up when paused or
  // when the mouse enters the bottom ~20% of the screen.
  let hoverExpand = $state(false);
  const pitchShown = $derived(videoCtl.paused || hoverExpand);

  function onStageMove(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const frac = (e.clientY - rect.top) / rect.height;
    // Enter from the bottom 20%; once shown, keep it until the cursor is
    // clearly above the risen pitch (hysteresis avoids flicker).
    hoverExpand = pitchShown ? frac > 0.6 : frac > 0.8;
  }

  const draftPoint = $derived(session.draft.start ?? null);
  const draftColor = $derived(
    (session.draft.teamId
      ? project.teams.find((t) => t.id === session.draft.teamId)?.color
      : undefined) ?? '#ffffff',
  );

  function isTypingTarget(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    if (!el) return false;
    return (
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable
    );
  }

  function onKeydown(e: KeyboardEvent) {
    if (session.screen !== 'record') return;
    if (isTypingTarget(e.target)) return;

    if (helpOpen) {
      if (e.code === 'Escape' || (e.code === 'Slash' && e.shiftKey)) helpOpen = false;
      return;
    }
    if (session.view === 'stats') {
      if (e.code === 'Escape') session.view = 'record';
      return;
    }
    if (session.editingEvent) {
      if (e.code === 'Escape') session.editingEvent = null;
      return;
    }
    if (session.eventsBrowserOpen) {
      if (e.code === 'Escape') session.eventsBrowserOpen = false;
      return;
    }

    if (e.code === 'Escape') {
      session.cancelDraft();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      videoCtl.togglePlay();
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      const dir = e.code === 'ArrowLeft' ? -1 : 1;
      if (e.shiftKey) videoCtl.stepSeconds(dir * 5);
      else videoCtl.stepFrames(dir);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) session.redo();
      else session.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
      e.preventDefault();
      session.redo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Slash' && e.shiftKey) {
      helpOpen = true;
      return;
    }

    const target = resolveKey(session.keymap, e);
    if (!target) return;
    e.preventDefault();
    if (target.kind === 'player') {
      session.dispatch({ kind: 'player', teamId: target.teamId, playerId: target.playerId });
    } else {
      session.dispatch({ kind: 'action', action: target.action });
    }
  }

  function onPitchClick(point: Point, successful: boolean) {
    if (!session.currentVideoId || !videoCtl.adapter) {
      session.toast('Load a video first');
      return;
    }
    session.dispatch({
      kind: 'pitchClick',
      point,
      successful,
      videoId: session.currentVideoId,
      videoTime: videoCtl.preciseTime(),
    });
  }

  function openSettings() {
    session.setupReturn = 'record';
    session.screen = 'setup';
  }

  function backToProjects() {
    session.saveProjectMeta();
    session.closeProject();
    session.screen = 'projects';
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if session.view === 'stats'}
  <StatsView />
{:else}
  <div class="layout">
    <header class="row">
      <button onclick={backToProjects} title="Save & back to project list">☰</button>
      <b>{project.name}</b>
      <div class="grow"></div>
      <button onclick={() => session.undo()} disabled={session.undoStack.length === 0} title="Undo (Ctrl+Z)">
        ↩ Undo
      </button>
      <button onclick={() => session.redo()} disabled={session.redoStack.length === 0} title="Redo (Ctrl+Shift+Z)">
        ↪
      </button>
      <button onclick={() => (session.view = 'stats')}>📊 Stats & export</button>
      <button onclick={openSettings} title="Project settings">⚙</button>
      <button onclick={() => (helpOpen = true)} title="Keyboard shortcuts (?)">?</button>
    </header>

    <div class="columns">
      <aside class="cell lt">
        <SquadPanel team={leftTeam} attack={currentVideo ? attackDirOf(currentVideo, leftTeam.id) : null} />
      </aside>

      <div class="cell lb">
        <EventTimeline />
      </div>

      <main class="cell center">
        <div
          class="stage"
          onmousemove={onStageMove}
          onmouseleave={() => (hoverExpand = false)}
          role="presentation"
        >
          <div class="video-area">
            <VideoPlayer />
          </div>
          <div class="pitch-area" class:shown={pitchShown}>
            <PitchView
              length={project.pitch.length}
              width={project.pitch.width}
              events={pitchEvents}
              teams={project.teams}
              highlightId={session.lastEventId}
              interactive
              {onPitchClick}
              {draftPoint}
              {draftColor}
            />
          </div>
        </div>
        <DraftHud />
      </main>

      <aside class="cell rt">
        <SquadPanel team={rightTeam} attack={currentVideo ? attackDirOf(currentVideo, rightTeam.id) : null} />
        <ActionPanel />
      </aside>
    </div>
  </div>
{/if}

{#if session.draft.phase === 'awaitGoal'}
  <GoalModal />
{/if}

{#if session.draft.phase === 'awaitShotDefenders' || session.draft.phase === 'awaitShotKeeper'}
  <ShotContextModal />
{/if}

{#if session.editingEvent}
  <EventEditDialog />
{/if}

{#if helpOpen}
  <div class="modal-backdrop" onclick={() => (helpOpen = false)} role="presentation">
    <div class="modal">
      <h2>Keyboard shortcuts</h2>
      <table class="help">
        <tbody>
          <tr><td><kbd>Space</kbd></td><td>Play / pause</td></tr>
          <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Step one frame</td></tr>
          <tr><td><kbd>⇧</kbd>+<kbd>←</kbd>/<kbd>→</kbd></td><td>Jump 5 seconds</td></tr>
          <tr><td><kbd>1</kbd>–<kbd>0</kbd> <kbd>U</kbd>…<kbd>M</kbd></td><td>Select player (team 1)</td></tr>
          <tr><td><kbd>⇧</kbd> + player key</td><td>Select player (team 2)</td></tr>
          <tr><td><kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd>…</td><td>Select action</td></tr>
          <tr><td>LMB on pitch</td><td>Place event — successful</td></tr>
          <tr><td>RMB on pitch</td><td>Place event — unsuccessful</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Cancel current event draft</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>⇧</kbd>+<kbd>Z</kbd></td><td>Undo / redo event</td></tr>
          <tr><td><kbd>?</kbd></td><td>This help</td></tr>
        </tbody>
      </table>
    </div>
  </div>
{/if}

<style>
  .layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 8px;
    gap: 8px;
  }

  header {
    gap: 8px;
  }

  .grow {
    flex: 1;
  }

  .columns {
    flex: 1;
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr) 220px;
    /* Row 1 takes all free space so the lineups get as much room as
       possible; row 2 (events timeline) hugs its content and shrinks to a
       header line when folded. The right column spans both rows: squad on
       top, actions (with the legend inside) pinned at the bottom. */
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas:
      'lt center rt'
      'lb center rt';
    gap: 8px;
    min-height: 0;
  }

  .cell {
    min-height: 0;
    min-width: 0;
  }

  .lt {
    grid-area: lt;
  }

  .lb {
    grid-area: lb;
    display: flex;
    flex-direction: column;
  }

  .rt {
    grid-area: rt;
  }

  .center {
    grid-area: center; /* span both rows — full column height */
  }

  aside {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Squads soak up the free column height; actions sit pinned below, so
     folding them hands the space straight to the lineup. */
  .lt :global(.squad),
  .rt :global(.squad) {
    flex: 1;
  }

  main {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
  }

  /* The video keeps its natural (aspect-ratio) size. The pitch is a
     bottom drawer: ~10% of it peeks out while playing; paused or hovering
     the bottom of the screen slides it up to ~30% of the height, over the
     video. */
  .stage {
    flex: 1;
    min-height: 0;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .video-area {
    flex: 0 1 auto;
    min-height: 0;
  }

  .pitch-area {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 30%;
    z-index: 5;
    transform: translateY(90%);
    transition: transform 0.25s ease;
    border-radius: 6px;
    overflow: hidden;
  }

  .pitch-area.shown {
    transform: translateY(0);
    box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.55);
  }

  .help td {
    padding: 3px 10px;
  }
</style>
