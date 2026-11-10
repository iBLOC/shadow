import { describe, expect, it } from 'vitest'
import {
  canAutoRetry,
  describeDisposition,
  formatCuError,
  isCuErrorPayload,
  type CuErrorPayload,
} from '../cuErrors'

const payload: CuErrorPayload = {
  code: 'INPUT_ACTION_FAILED',
  message: 'input action failed (delivery uncertain): boom',
  disposition: { delivery: 'delivery_uncertain', retry: 'unsafe' },
}

describe('cuErrors — computer-use 投递判定的前端形状', () => {
  it('旧版字符串错误仍然原样展示（向后兼容）', () => {
    expect(formatCuError('computer-use is disabled')).toBe('computer-use is disabled')
  })

  it('结构化错误展示成 [CODE] message', () => {
    expect(formatCuError(payload)).toBe(
      `[INPUT_ACTION_FAILED] input action failed (delivery uncertain): boom`,
    )
  })

  it('Error 实例取 message，未知值退回 String()', () => {
    expect(formatCuError(new Error('boom'))).toBe('boom')
    expect(formatCuError(42)).toBe('42')
    expect(formatCuError(null)).toBe('null')
  })

  it('形状不完整的对象**不算** CuError（不许把垃圾读成判定）', () => {
    expect(isCuErrorPayload(payload)).toBe(true)
    expect(isCuErrorPayload({ code: 'X', message: 'y' })).toBe(false)
    expect(isCuErrorPayload({ ...payload, disposition: { delivery: 'nope', retry: 'safe' } })).toBe(
      false,
    )
    expect(isCuErrorPayload({ ...payload, disposition: { delivery: 'not_delivered' } })).toBe(false)
    expect(isCuErrorPayload('string')).toBe(false)
    expect(isCuErrorPayload(null)).toBe(false)
  })

  it('只有 not_delivered 才允许自动重试', () => {
    expect(canAutoRetry({ delivery: 'not_delivered', retry: 'safe' })).toBe(true)
    expect(canAutoRetry({ delivery: 'delivery_uncertain', retry: 'unsafe' })).toBe(false)
    expect(canAutoRetry({ delivery: 'delivered_unverified', retry: 'unsafe' })).toBe(false)
    expect(canAutoRetry(undefined)).toBe(false)
  })

  it('describeDisposition 把三档读成人话', () => {
    expect(describeDisposition({ delivery: 'not_delivered', retry: 'safe' })).toContain('retry safe')
    expect(describeDisposition({ delivery: 'delivery_uncertain', retry: 'unsafe' })).toContain(
      'retry unsafe',
    )
    expect(describeDisposition({ delivery: 'delivered_unverified', retry: 'unsafe' })).toContain(
      'retry unsafe',
    )
    expect(describeDisposition(undefined)).toBe('unknown')
  })
})
