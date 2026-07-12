import { describe, it, expect } from 'vitest';
import { isChatBiPayload } from '../src/lib/chatbi/guards';

describe('isChatBiPayload', () => {
  it('accepts a valid payload', () => {
    expect(isChatBiPayload({
      columns: ['ts', 'v'],
      rows: [[1, 2]],
      viz_type: 'line',
      sql_executed: 'select 1',
      row_count: 1,
      took_ms: 5,
    })).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(isChatBiPayload({ columns: [], rows: [], viz_type: 'line' })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isChatBiPayload(null)).toBe(false);
    expect(isChatBiPayload(42)).toBe(false);
  });

  it('rejects non-array columns', () => {
    expect(isChatBiPayload({
      columns: 'bad',
      rows: [],
      viz_type: 'line',
      row_count: 0,
      sql_executed: '',
    })).toBe(false);
  });
});
