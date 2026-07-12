import { describe, it, expect } from 'vitest';
import { buildChartOption } from '../src/components/chatbi/chartRegistry';

describe('buildChartOption', () => {
  it('line chart produces one series per non-time column', () => {
    const opt = buildChartOption('line',
      ['ts', 'temp', 'humidity'],
      [[1, 18, 60], [2, 19, 58]]);
    const series = (opt as any).series;
    expect(series).toHaveLength(2);
    expect(series[0].name).toBe('temp');
    expect(series[0].data).toEqual([18, 19]);
  });

  it('bar chart axes are categorical x + numeric y', () => {
    const opt = buildChartOption('bar', ['kind', 'value'], [['a', 1], ['b', 2]]);
    expect((opt as any).xAxis.type).toBe('category');
    expect((opt as any).yAxis.type).toBe('value');
  });

  it('kpi gauge uses row 0 column 1 as value', () => {
    const opt = buildChartOption('kpi', ['label', 'value'], [['x', 42]]);
    expect((opt as any).series[0].data[0].value).toBe(42);
  });

  it('pie chart builds name/value pairs', () => {
    const opt = buildChartOption('pie', ['kind', 'count'], [['a', 10], ['b', 20]]);
    const data = (opt as any).series[0].data;
    expect(data).toEqual([
      { name: 'a', value: 10 },
      { name: 'b', value: 20 },
    ]);
  });

  it('scatter chart builds x/y pairs', () => {
    const opt = buildChartOption('scatter', ['x', 'y'], [[1, 2], [3, 4]]);
    expect((opt as any).series[0].data).toEqual([[1, 2], [3, 4]]);
  });

  it('heatmap builds categorical x/y and data triples', () => {
    const opt = buildChartOption('heatmap',
      ['x', 'y', 'v'],
      [['a', 'p', 1], ['a', 'q', 2], ['b', 'p', 3]]);
    const series = (opt as any).series[0].data;
    expect(series).toEqual([
      [0, 0, 1],
      [0, 1, 2],
      [1, 0, 3],
    ]);
  });
});
