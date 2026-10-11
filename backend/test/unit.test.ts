import { describe, expect, it } from 'vitest';
import { redactUri } from '../src/config.js';
import { contentHash } from '../src/services/embeddings.js';
import { usefulnessScore } from '../src/lib/serialize.js';

describe('unit helpers', () => {
  it('redacts credentials from a MongoDB URI', () => {
    expect(redactUri('mongodb+srv://alice:s3cret@cluster0.abc.mongodb.net/?retryWrites=true')).toBe(
      'mongodb+srv://***:***@cluster0.abc.mongodb.net/?retryWrites=true',
    );
  });

  it('content hash changes only when embedded text changes', () => {
    const h = contentHash('t', 'c', ['a']);
    expect(contentHash('t', 'c', ['a'])).toBe(h);
    expect(contentHash('t', 'c2', ['a'])).not.toBe(h);
    expect(contentHash('t', 'c', ['a', 'b'])).not.toBe(h);
  });

  it('usefulness is Laplace-smoothed', () => {
    expect(usefulnessScore({ helpful: 0, notHelpful: 0 })).toBe(0.5);
    expect(usefulnessScore({ helpful: 3, notHelpful: 1 })).toBeCloseTo(4 / 6);
  });
});
