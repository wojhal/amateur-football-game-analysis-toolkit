<script lang="ts">
  import type { VideoRef } from '../../lib/types';
  import { session } from '../../lib/state/session.svelte';
  import { videoCtl } from '../../lib/state/videoctl.svelte';
  import { loadYouTubeApi, type YTPlayer } from '../../lib/video/youtube';

  interface Props {
    /** The project's VideoRef (proxy), so duration updates persist. */
    video: VideoRef;
  }

  let { video }: Props = $props();

  let container: HTMLDivElement;
  let ready = $state(false);
  let error = $state('');

  $effect(() => {
    let cancelled = false;
    let player: YTPlayer | null = null;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(container, {
          videoId: video.youtubeId!,
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 0, // our own transport drives the player
            disablekb: 1,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            origin: location.origin,
          },
          events: {
            onReady: () => {
              if (cancelled || !player) return;
              ready = true;
              videoCtl.attachYouTube(player, video.id);
              const d = player.getDuration();
              if (d > 0 && Math.abs(video.duration - d) > 1) {
                video.duration = d;
                session.saveProjectMeta();
              }
              if (videoCtl.pendingSeek !== null) {
                videoCtl.seek(videoCtl.pendingSeek);
                videoCtl.pendingSeek = null;
              }
            },
            onStateChange: () => videoCtl.sync(),
            onError: (e) => {
              error =
                e.data === 101 || e.data === 150
                  ? 'The owner of this video does not allow embedding it outside YouTube.'
                  : e.data === 100
                    ? 'This video is unavailable (removed or private).'
                    : 'YouTube playback error.';
            },
          },
        });
      })
      .catch((err: Error) => {
        if (!cancelled) error = err.message;
      });

    return () => {
      cancelled = true;
      videoCtl.detach(video.id);
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
    };
  });
</script>

<div class="yt">
  <div class="frame" bind:this={container}></div>
  {#if error}
    <div class="notice"><p>⚠ {error}</p></div>
  {:else}
    <!-- Transparent overlay: keeps clicks/keyboard in the app (click = play/pause),
         and stops the iframe from stealing focus away from the keybinds. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="overlay"
      onclick={() => videoCtl.togglePlay()}
      oncontextmenu={(e) => e.preventDefault()}
      role="button"
      aria-label="Toggle playback"
      tabindex="-1"
    >
      {#if !ready}<span class="dim">Loading YouTube player…</span>{/if}
    </div>
  {/if}
</div>

<style>
  .yt {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .frame,
  .yt :global(iframe) {
    width: 100%;
    height: 100%;
    display: block;
    border: 0;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .notice {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 20px;
    background: var(--bg-panel);
  }
</style>
