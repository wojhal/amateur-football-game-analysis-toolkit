/**
 * Browsers expose no "step one frame" API, so we measure the real frame rate
 * with requestVideoFrameCallback: consecutive mediaTime deltas during
 * playback. The median of a dozen samples is a solid estimate for the
 * constant-frame-rate footage phones and cameras produce.
 */

const SAMPLES_NEEDED = 12;
const DEFAULT_FRAME = 1 / 30;

export class FrameRateProbe {
  /** videoId -> seconds per frame */
  private measured = new Map<string, number>();
  private deltas: number[] = [];
  private lastMediaTime = -1;
  private activeVideoId: string | null = null;
  private cancelHandle: number | null = null;

  frameDuration(videoId: string): number {
    return this.measured.get(videoId) ?? DEFAULT_FRAME;
  }

  /** Begin (or resume) probing the given element; safe to call repeatedly. */
  probe(el: HTMLVideoElement, videoId: string): void {
    if (this.measured.has(videoId)) return;
    if (!('requestVideoFrameCallback' in el)) return;
    if (this.activeVideoId !== videoId) {
      this.deltas = [];
      this.lastMediaTime = -1;
      this.activeVideoId = videoId;
      if (this.cancelHandle !== null) {
        el.cancelVideoFrameCallback(this.cancelHandle);
        this.cancelHandle = null;
      }
    }
    if (this.cancelHandle !== null) return; // already running

    const tick = (_now: number, meta: VideoFrameCallbackMetadata) => {
      this.cancelHandle = null;
      if (this.activeVideoId !== videoId || this.measured.has(videoId)) return;
      if (this.lastMediaTime >= 0) {
        const d = meta.mediaTime - this.lastMediaTime;
        if (d > 0.001 && d < 0.5) this.deltas.push(d);
      }
      this.lastMediaTime = meta.mediaTime;
      if (this.deltas.length >= SAMPLES_NEEDED) {
        const sorted = [...this.deltas].sort((a, b) => a - b);
        this.measured.set(videoId, sorted[Math.floor(sorted.length / 2)]);
        return;
      }
      this.cancelHandle = el.requestVideoFrameCallback(tick);
    };
    this.cancelHandle = el.requestVideoFrameCallback(tick);
  }
}
