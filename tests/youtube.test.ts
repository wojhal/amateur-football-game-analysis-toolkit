import { describe, expect, it } from 'vitest';
import { parseYouTubeId } from '../src/lib/video/youtube';

describe('parseYouTubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=120s', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=45', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ?feature=share', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['  https://youtu.be/dQw4w9WgXcQ  ', 'dQw4w9WgXcQ'],
  ])('extracts the id from %s', (input, expected) => {
    expect(parseYouTubeId(input)).toBe(expected);
  });

  it.each([
    ['https://example.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=tooShort'],
    ['https://www.youtube.com/'],
    ['not a url at all'],
    ['https://vimeo.com/12345'],
    [''],
  ])('rejects %s', (input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });
});
