import { describe, expect, it } from 'vitest';
import { formatNumber, formatScore } from './utils';

describe('formatting', () => {
  it('renders missing numbers as an em dash, never zero', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatNumber(Number.NaN)).toBe('—');
    expect(formatNumber(1234)).toBe('1,234');
  });

  it('formats scores by kind', () => {
    expect(formatScore(0.03226, 'rrf')).toBe('0.0323');
    expect(formatScore(0.8421, 'vector')).toBe('0.842');
    expect(formatScore(7.314, 'search')).toBe('7.31');
  });
});
