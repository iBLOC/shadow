// computer-use 的**投递判定**在前端这一侧的形状。
//
// ⚠️ **为什么要有这一层**（2026-11-09）—— Rust 侧把 `cu_*` 的失败从
// `Err(String)` 换成了 `Err(CuError { code, message, disposition })`
// ⇒ ⇒ Tauri 的 `invoke` **拒绝值**现在是一个对象（不再是字符串）
// ⇒ ⇒ `String(e)` 会变成 "[object Object]" ⇒ ⇒ 必须有一处统一的
// 「怎么把它变成人读的文本」⇒ ⇒ 这就是本文件。

export type CuDelivery = 'not_delivered' | 'delivery_uncertain' | 'delivered_unverified'
export type CuRetry = 'safe' | 'unsafe'

export interface CuDisposition {
  delivery: CuDelivery
  retry: CuRetry
}

export interface CuErrorPayload {
  code: string
  message: string
  disposition: CuDisposition
}

export interface CuOutcome {
  action: string
  disposition: CuDisposition
}

const DELIVERIES: readonly CuDelivery[] = [
  'not_delivered',
  'delivery_uncertain',
  'delivered_unverified',
]

export function isCuErrorPayload(e: unknown): e is CuErrorPayload {
  if (typeof e !== 'object' || e === null) return false
  const p = e as Partial<CuErrorPayload>
  if (typeof p.code !== 'string' || typeof p.message !== 'string') return false
  const d = p.disposition
  if (typeof d !== 'object' || d === null) return false
  return DELIVERIES.includes(d.delivery) && (d.retry === 'safe' || d.retry === 'unsafe')
}

/** 把 invoke 的拒绝值变成人读的一行文本（旧的 `String(e)` 位置全换这里）。 */
export function formatCuError(e: unknown): string {
  if (isCuErrorPayload(e)) return `[${e.code}] ${e.message}`
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return String(e)
}

/**
 * 「上一次到底落地没有」的人话。
 * ⚠️ `not_delivered` ＝ 确定什么都没发生（可以重试）；
 * 其余两个 ＝ 可能已经落地（**重试会重复生效**）。
 */
export function describeDisposition(d: CuDisposition | undefined): string {
  if (!d) return 'unknown'
  switch (d.delivery) {
    case 'not_delivered':
      return 'not_delivered (retry safe)'
    case 'delivery_uncertain':
      return 'delivery_uncertain (retry unsafe)'
    case 'delivered_unverified':
      return 'delivered_unverified (retry unsafe)'
  }
}

/** 能不能**自动**重试：只有 `retry: safe` 才算。 */
export function canAutoRetry(d: CuDisposition | undefined): boolean {
  return d?.retry === 'safe'
}
