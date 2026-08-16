import ReactECharts from 'echarts-for-react';
import { buildChartOption } from './chartRegistry';
import type { VizType } from './types';

export interface ChartCardProps {
  vizType: VizType;
  columns: string[];
  rows: unknown[][];
  title?: string;
  className?: string;
}

export function ChartCard({ vizType, columns, rows, title, className }: ChartCardProps) {
  const option = buildChartOption(vizType, columns, rows);
  return (
    <div className={`rounded-lg border border-border bg-card p-3 ${className ?? ''}`}>
      {title && <h4 className="mb-2 text-sm font-medium text-foreground">{title}</h4>}
      <ReactECharts option={option} style={{ height: 280 }} />
    </div>
  );
}
