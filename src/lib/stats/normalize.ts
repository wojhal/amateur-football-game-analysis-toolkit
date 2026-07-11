import type { MatchEvent, Point, Project } from '../types';
import { attackDirOf } from '../types';

/**
 * Normalize a point so the acting team always attacks left-to-right,
 * regardless of which side they defended in that period.
 */
export function normalizePoint(p: Point, dir: 'ltr' | 'rtl', length: number, width: number): Point {
  if (dir === 'ltr') return { x: p.x, y: p.y };
  return { x: length - p.x, y: width - p.y };
}

export interface NormalizedCoords {
  start: Point;
  end?: Point;
}

export function normalizeEvent(e: MatchEvent, project: Project): NormalizedCoords | null {
  const video = project.videos.find((v) => v.id === e.videoId);
  if (!video) return null;
  const dir = attackDirOf(video, e.teamId);
  const { length, width } = project.pitch;
  return {
    start: normalizePoint(e.start, dir, length, width),
    end: e.end ? normalizePoint(e.end, dir, length, width) : undefined,
  };
}
