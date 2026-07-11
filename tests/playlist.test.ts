import { describe, expect, it } from 'vitest';
import { formatClock, matchClock, periodStartClocks } from '../src/lib/video/playlist';
import { makeVideo } from './helpers';

describe('playlist / match clock', () => {
  // v1: 46 min file, kickoff at 1:00 -> 45 min of play
  // v2: 47 min file, kickoff at 0:30
  const videos = [makeVideo('v1', 0, 2760, 60), makeVideo('v2', 1, 2820, 30)];

  it('computes period start clocks from prior periods', () => {
    const starts = periodStartClocks(videos);
    expect(starts.get('v1')).toBe(0);
    expect(starts.get('v2')).toBe(2700); // 2760 - 60
  });

  it('maps video time to match time, clamping pre-kickoff to period start', () => {
    expect(matchClock(videos, 'v1', 60)).toBe(0);
    expect(matchClock(videos, 'v1', 120)).toBe(60);
    expect(matchClock(videos, 'v1', 10)).toBe(0); // before kickoff
    expect(matchClock(videos, 'v2', 30)).toBe(2700);
    expect(matchClock(videos, 'v2', 90)).toBe(2760);
  });

  it('respects the order field, not array order', () => {
    const shuffled = [videos[1], videos[0]];
    expect(periodStartClocks(shuffled).get('v2')).toBe(2700);
  });

  it('formats clocks as m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(2765)).toBe('46:05');
  });
});
