import { FrameRateProbe } from '../video/framerate';
import type { YTPlayer } from '../video/youtube';

/**
 * Reactive transport control for the recording panel, abstracted over the two
 * player backends (local <video> element, YouTube iframe player) so keyboard
 * transport (space/arrows), the seek bar and event timestamping work
 * identically for both.
 */
export interface PlayerAdapter {
  kind: 'file' | 'youtube';
  play(): void;
  pause(): void;
  isPaused(): boolean;
  time(): number;
  duration(): number;
  seek(t: number): void;
  setRate(r: number): void;
}

function fileAdapter(el: HTMLVideoElement): PlayerAdapter {
  return {
    kind: 'file',
    play: () => void el.play(),
    pause: () => el.pause(),
    isPaused: () => el.paused,
    time: () => el.currentTime,
    duration: () => (Number.isFinite(el.duration) ? el.duration || 0 : 0),
    seek: (t) => (el.currentTime = t),
    setRate: (r) => (el.playbackRate = r),
  };
}

const YT_STATE_PLAYING = 1;
const YT_STATE_BUFFERING = 3;

function youtubeAdapter(player: YTPlayer): PlayerAdapter {
  return {
    kind: 'youtube',
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    isPaused: () => {
      const s = player.getPlayerState();
      return s !== YT_STATE_PLAYING && s !== YT_STATE_BUFFERING;
    },
    time: () => player.getCurrentTime() || 0,
    duration: () => player.getDuration() || 0,
    seek: (t) => player.seekTo(t, true),
    setRate: (r) => player.setPlaybackRate(r),
  };
}

/** YouTube gives no frame-rate access; step by a typical 30 fps frame. */
const YT_FRAME = 1 / 30;

class VideoCtl {
  adapter: PlayerAdapter | null = null;
  /** Set only for the file backend (used by the frame-rate probe). */
  el: HTMLVideoElement | null = null;
  videoId = $state<string | null>(null);

  paused = $state(true);
  currentTime = $state(0);
  duration = $state(0);
  rate = $state(1);
  /** Native width/height ratio of the current video (16:9 until known). */
  aspect = $state(16 / 9);

  /** Seek to apply once the (possibly newly switched) video is ready. */
  pendingSeek: number | null = null;

  probe = new FrameRateProbe();

  attachFile(el: HTMLVideoElement, videoId: string): void {
    this.el = el;
    this.adapter = fileAdapter(el);
    this.videoId = videoId;
    el.playbackRate = this.rate;
    if (el.videoWidth > 0 && el.videoHeight > 0) {
      this.aspect = el.videoWidth / el.videoHeight;
    }
    this.sync();
  }

  attachYouTube(player: YTPlayer, videoId: string): void {
    this.el = null;
    this.adapter = youtubeAdapter(player);
    this.videoId = videoId;
    this.aspect = 16 / 9; // the embed player doesn't expose native dimensions
    try {
      this.adapter.setRate(this.rate);
    } catch {
      /* rate not supported */
    }
    this.sync();
  }

  detach(videoId: string): void {
    if (this.videoId === videoId) {
      this.adapter = null;
      this.el = null;
      this.videoId = null;
    }
  }

  sync(): void {
    if (!this.adapter) return;
    this.paused = this.adapter.isPaused();
    this.currentTime = this.adapter.time();
    const d = this.adapter.duration();
    if (d > 0) this.duration = d;
  }

  /** The most precise current time available — used to timestamp events. */
  preciseTime(): number {
    return this.adapter ? this.adapter.time() : this.currentTime;
  }

  togglePlay(): void {
    if (!this.adapter) return;
    if (this.adapter.isPaused()) {
      this.adapter.play();
      if (this.el && this.videoId) this.probe.probe(this.el, this.videoId);
    } else {
      this.adapter.pause();
    }
    this.sync();
  }

  pause(): void {
    this.adapter?.pause();
    this.sync();
  }

  seek(t: number): void {
    if (!this.adapter) return;
    const max = this.adapter.duration() || Infinity;
    this.adapter.seek(Math.min(Math.max(0, t), max));
    this.sync();
  }

  frameDuration(): number {
    if (this.adapter?.kind === 'youtube' || !this.videoId) return YT_FRAME;
    return this.probe.frameDuration(this.videoId);
  }

  stepFrames(n: number): void {
    if (!this.adapter) return;
    this.adapter.pause();
    this.seek(this.adapter.time() + n * this.frameDuration());
  }

  stepSeconds(n: number): void {
    if (!this.adapter) return;
    this.seek(this.adapter.time() + n);
  }

  setRate(r: number): void {
    this.rate = r;
    try {
      this.adapter?.setRate(r);
    } catch {
      /* rate not supported */
    }
  }
}

export const videoCtl = new VideoCtl();
