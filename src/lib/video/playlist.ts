import type { VideoRef } from '../types';

/**
 * The match clock concatenates periods: each video contributes
 * (duration - kickoffOffset) seconds of match time, in `order` order.
 */

export function sortedVideos(videos: VideoRef[]): VideoRef[] {
  return [...videos].sort((a, b) => a.order - b.order);
}

/** Match-clock seconds at which each video's play starts. */
export function periodStartClocks(videos: VideoRef[]): Map<string, number> {
  const map = new Map<string, number>();
  let clock = 0;
  for (const v of sortedVideos(videos)) {
    map.set(v.id, clock);
    clock += Math.max(0, v.duration - v.kickoffOffset);
  }
  return map;
}

export function matchClock(videos: VideoRef[], videoId: string, videoTime: number): number {
  const starts = periodStartClocks(videos);
  const video = videos.find((v) => v.id === videoId);
  const start = starts.get(videoId);
  if (!video || start === undefined) return videoTime;
  return start + Math.max(0, videoTime - video.kickoffOffset);
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function formatVideoTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
