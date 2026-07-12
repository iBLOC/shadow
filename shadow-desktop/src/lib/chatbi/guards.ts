import type { VizType } from '../../components/chatbi';

export interface ChatBiPayload {
  columns: string[];
  rows: unknown[][];
  viz_type: VizType;
  sql_executed: string;
  row_count: number;
  took_ms: number;
}

export function isChatBiPayload(v: unknown): v is ChatBiPayload {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.columns) &&
    Array.isArray(o.rows) &&
    typeof o.viz_type === 'string' &&
    typeof o.row_count === 'number' &&
    typeof o.sql_executed === 'string'
  );
}
