import type { EChartsOption } from 'echarts-for-react';
import type { VizType } from './types';

export function buildChartOption(
  vizType: VizType,
  columns: string[],
  rows: unknown[][],
): EChartsOption {
  switch (vizType) {
    case 'kpi': {
      const v = Number(rows[0]?.[1] ?? 0);
      return {
        series: [{
          type: 'gauge',
          data: [{ value: v }],
          detail: { formatter: `{value}` },
        }],
      };
    }
    case 'line': {
      const ts = rows.map(r => r[0]);
      const series = columns.slice(1).map((name, i) => ({
        name,
        type: 'line' as const,
        data: rows.map(r => r[i + 1]),
      }));
      return {
        xAxis: { type: 'time', data: ts },
        yAxis: { type: 'value' },
        series,
      };
    }
    case 'bar': {
      const cats = rows.map(r => r[0]);
      return {
        xAxis: { type: 'category', data: cats },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: rows.map(r => Number(r[1])) }],
      };
    }
    case 'pie': {
      return {
        series: [{
          type: 'pie',
          data: rows.map(([name, value]) => ({ name: String(name), value: Number(value) })),
        }],
      };
    }
    case 'scatter': {
      const data = rows.map(r => [r[0], r[1]]);
      return {
        xAxis: {},
        yAxis: {},
        series: [{ type: 'scatter', data }],
      };
    }
    case 'heatmap': {
      const xCats = Array.from(new Set(rows.map(r => String(r[0]))));
      const yCats = Array.from(new Set(rows.map(r => String(r[1]))));
      const data = rows.map(([x, y, v]) => [
        xCats.indexOf(String(x)),
        yCats.indexOf(String(y)),
        Number(v),
      ]);
      return {
        xAxis: { type: 'category', data: xCats },
        yAxis: { type: 'category', data: yCats },
        visualMap: { min: 0, max: Math.max(...data.map(d => d[2]), 1), calculable: true },
        series: [{ type: 'heatmap', data }],
      };
    }
    case 'table':
    default:
      return {
        xAxis: { type: 'category', data: rows.map((_, i) => String(i)) },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: rows.map(() => 0) }],
      };
  }
}
