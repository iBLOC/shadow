import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { desktopClientTools, toOpenAiTools } from '../clientTools'

/**
 * computer-use 客户端工具 —— 「模型让这台设备动鼠标」那条路。
 *
 * ## 为什么钉它
 *
 * 端脑把桌面端声明的 `tools` 交给模型 ⇒ 模型点名 ⇒ 端脑发 `tool_call`
 * ⇒ **这台设备执行** ⇒ 结果回传端脑喂回模型 ⇒ ⇒
 * ⇒ 所以 computer-use 一旦注册进 `desktopClientTools`，**agent 立刻就调得到**
 * ⇒ ⇒ 而「回执带不带投递判定」决定了模型**敢不敢重试** ⇒ ⇒
 * ⇒ 这一层必须钉住。
 *
 * ⚠️ **只暴露语义那四个**（看元素／读文本／按名点击／按名写值）
 * ⇒ ⇒ 坐标点击**故意不暴露**（模型看不到屏幕 ⇒ ⇒ 盲点击）。
 */

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

beforeEach(() => {
  invokeMock.mockReset()
  // ⚠️ `isTauri()` 靠 `window.__TAURI__` ⇒ ⇒ 得把它装上，
  // 否则 `safeInvokeOrThrow` 会直接抛「web build 没有这条命令」。
  vi.stubGlobal('__TAURI__', {})
})

afterEach(() => {
  // ⚠️ 全局替换**必须还原**（不然会漏给同 worker 的后续文件）。
  vi.unstubAllGlobals()
})

const CU_OUTCOME = {
  action: 'click_ui_by_name',
  disposition: { delivery: 'delivered_unverified', retry: 'unsafe' },
}

describe('computer-use 客户端工具 —— 注册表那一面', () => {
  it('四个语义工具都在注册表里', () => {
    for (const name of [
      'cu_list_ui_elements',
      'cu_read_ui_text',
      'cu_click_ui_by_name',
      'cu_set_ui_value',
    ]) {
      expect(desktopClientTools.lookup(name), name).toBeDefined()
    }
  })

  it('**动的**两个要用户点头，**看的**两个不要', () => {
    expect(desktopClientTools.lookup('cu_click_ui_by_name')!.requiresApproval).toBe(true)
    expect(desktopClientTools.lookup('cu_set_ui_value')!.requiresApproval).toBe(true)
    expect(desktopClientTools.lookup('cu_list_ui_elements')!.requiresApproval).toBeUndefined()
    expect(desktopClientTools.lookup('cu_read_ui_text')!.requiresApproval).toBeUndefined()
  })

  it('发给模型的那一份里也有它们（参数表齐全）', () => {
    const tools = toOpenAiTools(desktopClientTools)
    const click = tools.find((t) => t.function.name === 'cu_click_ui_by_name')
    expect(click).toBeDefined()
    expect(click!.function.parameters.required).toEqual(['name'])
    expect(click!.function.parameters.properties.name.type).toBe('string')
  })

  it('坐标点击**故意不暴露** —— 模型看不到屏幕，盲点击比不点更糟', () => {
    expect(desktopClientTools.lookup('cu_mouse_click')).toBeUndefined()
    expect(desktopClientTools.lookup('cu_keyboard_type')).toBeUndefined()
  })
})

describe('computer-use 客户端工具 —— 执行那一面', () => {
  it('按名点击 ⇒ 调 cu_click_ui_by_name，回执带投递判定', async () => {
    invokeMock.mockResolvedValue(CU_OUTCOME)
    const tool = desktopClientTools.lookup('cu_click_ui_by_name')!
    const result = (await tool.execute({ name: 'Save' }, {})) as {
      report: string
      disposition: { delivery: string }
    }
    expect(invokeMock).toHaveBeenCalledWith('cu_click_ui_by_name', { name: 'Save' })
    expect(result.disposition.delivery).toBe('delivered_unverified')
    // ⚠️ **回给模型的那一句**必须说清「落地没有」⇒ ⇒ 模型才敢决定要不要重试。
    expect(result.report).toContain('delivered_unverified')
    expect(result.report).toContain('retry unsafe')
  })

  it('失败时**把投递判定带出去**（不许只剩一句错误文本）', async () => {
    invokeMock.mockRejectedValue({
      code: 'COMPUTER_USE_DISABLED',
      message: 'computer-use is disabled',
      disposition: { delivery: 'not_delivered', retry: 'safe' },
    })
    const tool = desktopClientTools.lookup('cu_click_ui_by_name')!
    await expect(tool.execute({ name: 'Save' }, {})).rejects.toThrow(/COMPUTER_USE_DISABLED/)
    await expect(tool.execute({ name: 'Save' }, {})).rejects.toThrow(/retry safe/)
  })

  it('环境级失败（不是 CuError）⇒ ⇒ **不许**说「没落地」', async () => {
    invokeMock.mockRejectedValue(new Error('boom'))
    const tool = desktopClientTools.lookup('cu_click_ui_by_name')!
    await expect(tool.execute({ name: 'Save' }, {})).rejects.toThrow(/delivery unknown/)
  })

  it('列元素 ⇒ 回执里带得上元素名（模型要靠它决定点哪个）', async () => {
    invokeMock.mockResolvedValue([
      {
        name: 'Save',
        automation_id: 'btnSave',
        control_type: 'Button',
        class_name: 'Button',
        x: 10,
        y: 20,
        width: 80,
        height: 30,
      },
    ])
    const tool = desktopClientTools.lookup('cu_list_ui_elements')!
    const result = (await tool.execute({}, {})) as { report: string }
    expect(invokeMock).toHaveBeenCalledWith('cu_list_ui_elements', {})
    expect(result.report).toContain('Save')
    expect(result.report).toContain('Button')
  })

  it('缺必填参数 ⇒ ⇒ **明确失败**，而且**不许**去调命令', async () => {
    const tool = desktopClientTools.lookup('cu_click_ui_by_name')!
    await expect(tool.execute({}, {})).rejects.toThrow(/"name" is required/)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('set_ui_value 的 value 允许空串（清空输入框是合法动作）', async () => {
    invokeMock.mockResolvedValue({
      action: 'set_ui_value',
      disposition: { delivery: 'delivered_unverified', retry: 'unsafe' },
    })
    const tool = desktopClientTools.lookup('cu_set_ui_value')!
    await tool.execute({ name: 'Name', value: '' }, {})
    expect(invokeMock).toHaveBeenCalledWith('cu_set_ui_value', { name: 'Name', value: '' })
  })
})

/**
 * ref 那一族（UIA 树快照 → 按 ref 动作）—— agent-desktop 那一套的最小版。
 *
 * ⚠️ **为什么值得钉**：模型拿到 ref 才**知道点的是哪个元素**；
 * 「按名字找第一个」在两个同名控件面前是**猜** ⇒ ⇒ 撞名就点错。
 */
describe('computer-use ref 家族 —— 快照与按 ref 动作', () => {
  const SNAPSHOT = {
    snapshot_id: 's0000002f',
    complete: true,
    truncated_by: null,
    scope: 'focused-window',
    nodes: [
      {
        ref_id: '@s0000002f:e7',
        role: 'Button',
        name: 'Save',
        automation_id: 'btnSave',
        x: 10,
        y: 20,
        width: 80,
        height: 30,
        depth: 2,
        actions: ['Click'],
        addressable: true,
      },
    ],
  }

  it('三个 ref 工具都在注册表里，动的两个要点头', () => {
    expect(desktopClientTools.lookup('cu_snapshot_ui_tree')).toBeDefined()
    expect(desktopClientTools.lookup('cu_click_ui_by_ref')).toBeDefined()
    expect(desktopClientTools.lookup('cu_set_ui_value_by_ref')).toBeDefined()
    expect(desktopClientTools.lookup('cu_click_ui_by_ref')!.requiresApproval).toBe(true)
    expect(desktopClientTools.lookup('cu_set_ui_value_by_ref')!.requiresApproval).toBe(true)
    expect(desktopClientTools.lookup('cu_snapshot_ui_tree')!.requiresApproval).toBeUndefined()
  })

  it('快照回执里**带得上 ref**（那是动作的地址）', async () => {
    invokeMock.mockResolvedValue(SNAPSHOT)
    const tool = desktopClientTools.lookup('cu_snapshot_ui_tree')!
    const result = (await tool.execute({}, {})) as { report: string; snapshot_id: string }
    expect(invokeMock).toHaveBeenCalledWith('cu_snapshot_ui_tree', {})
    expect(result.snapshot_id).toBe('s0000002f')
    expect(result.report).toContain('@s0000002f:e7')
    expect(result.report).toContain('Save')
    expect(result.report).toContain('Click')
  })

  it('给了 depth 就带上 depth', async () => {
    invokeMock.mockResolvedValue(SNAPSHOT)
    const tool = desktopClientTools.lookup('cu_snapshot_ui_tree')!
    await tool.execute({ depth: 3 }, {})
    expect(invokeMock).toHaveBeenCalledWith('cu_snapshot_ui_tree', { depth: 3 })
  })

  it('按 ref 点击 ⇒ 命令名与参数名都要对（target 是单词名）', async () => {
    invokeMock.mockResolvedValue({
      action: 'click_ui_by_ref',
      disposition: { delivery: 'delivered_unverified', retry: 'unsafe' },
    })
    const tool = desktopClientTools.lookup('cu_click_ui_by_ref')!
    const result = (await tool.execute({ target: '@s0000002f:e7' }, {})) as { report: string }
    expect(invokeMock).toHaveBeenCalledWith('cu_click_ui_by_ref', { target: '@s0000002f:e7' })
    expect(result.report).toContain('@s0000002f:e7')
  })

  it('stale ref ⇒ ⇒ 把判定带出去（可安全重试：换一次快照）', async () => {
    invokeMock.mockRejectedValue({
      code: 'STALE_REF',
      message: 'stale ref: @s0000002f:e7 no longer matches a live element',
      disposition: { delivery: 'not_delivered', retry: 'safe' },
    })
    const tool = desktopClientTools.lookup('cu_click_ui_by_ref')!
    await expect(tool.execute({ target: '@s0000002f:e7' }, {})).rejects.toThrow(/STALE_REF/)
    await expect(tool.execute({ target: '@s0000002f:e7' }, {})).rejects.toThrow(/retry safe/)
  })

  it('缺 ref ⇒ ⇒ 明确失败，且**不许**去调命令', async () => {
    const tool = desktopClientTools.lookup('cu_click_ui_by_ref')!
    await expect(tool.execute({}, {})).rejects.toThrow(/"target" is required/)
    expect(invokeMock).not.toHaveBeenCalled()
  })
})

/**
 * 「捕获时唯一性证明」那一格（台账 U+3501 条）——
 * 匿名元素 ＋ 树上不唯一的孪生 ＋ 不完整的快照 ⇒ ⇒ 那批 ref 一律不许动作。
 *
 * ⚠️ **为什么钉在**前端这一面**：模型只看得见**回执文本** ⇒ ⇒
 * 「哪些 ref 不能用」必须在回执里**看得见** ⇒ ⇒ 不然模型会去用一个
 * 根本不该动的 ref ⇒ ⇒ 命令拒它 ⇒ ⇒ 模型白跑一趟。
 */
describe('computer-use ref 家族 —— 捕获时唯一性证明', () => {
  const PROOF_SNAPSHOT = {
    snapshot_id: 's00000031',
    complete: true,
    truncated_by: null,
    scope: 'focused-window',
    nodes: [
      {
        ref_id: '@s00000031:e0',
        role: 'Button',
        name: 'Save',
        automation_id: 'btnSave',
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        depth: 1,
        actions: ['Click'],
        addressable: true,
      },
      {
        // 匿名元素（既没名字也没 id）⇒ ⇒ 不可寻址。
        ref_id: '@s00000031:e1',
        role: 'Pane',
        name: '',
        automation_id: '',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        depth: 2,
        actions: [],
        addressable: false,
      },
      {
        // 孪生（同角色同名同 id，与 e1 之外另一个 Save 撞了）⇒ ⇒ 不可寻址。
        ref_id: '@s00000031:e2',
        role: 'Button',
        name: 'Save',
        automation_id: '',
        x: 5,
        y: 6,
        width: 7,
        height: 8,
        depth: 2,
        actions: ['Click'],
        addressable: false,
      },
    ],
  }

  it('回执里**标出不可寻址的 ref**（紧挨着 ref，模型才看得见）', async () => {
    invokeMock.mockResolvedValue(PROOF_SNAPSHOT)
    const tool = desktopClientTools.lookup('cu_snapshot_ui_tree')!
    const result = (await tool.execute({}, {})) as { report: string }
    expect(result.report).toContain('@s00000031:e1 ⚠不可寻址')
    expect(result.report).toContain('@s00000031:e2 ⚠不可寻址')
    // 可寻址的那个**不许**带标记。
    expect(result.report).not.toContain('@s00000031:e0 ⚠不可寻址')
  })

  it('**开发者 id 要列出来** —— 模型得看得见它才分得清同名的那两个', async () => {
    invokeMock.mockResolvedValue(PROOF_SNAPSHOT)
    const tool = desktopClientTools.lookup('cu_snapshot_ui_tree')!
    const result = (await tool.execute({}, {})) as { report: string }
    expect(result.report).toContain('#btnSave')
  })

  it('**缺 addressable 字段 ⇒ ⇒ 当成不可寻址**（fail-closed）', async () => {
    invokeMock.mockResolvedValue({
      ...PROOF_SNAPSHOT,
      nodes: [
        {
          ref_id: '@s00000031:e9',
          role: 'Button',
          name: 'Save',
          automation_id: '',
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          depth: 1,
          actions: ['Click'],
        },
      ],
    })
    const tool = desktopClientTools.lookup('cu_snapshot_ui_tree')!
    const result = (await tool.execute({}, {})) as { report: string }
    expect(result.report).toContain('@s00000031:e9 ⚠不可寻址')
  })

  it('快照不完整 ⇒ ⇒ **说清那批 ref 不能用**（不只是「被截了」）', async () => {
    invokeMock.mockResolvedValue({
      ...PROOF_SNAPSHOT,
      complete: false,
      truncated_by: 'depth cap 8 reached',
    })
    const tool = desktopClientTools.lookup('cu_snapshot_ui_tree')!
    const result = (await tool.execute({}, {})) as { report: string }
    expect(result.report).toContain('truncated: depth cap 8 reached')
    expect(result.report).toContain('refs from this snapshot cannot be used')
  })

  it('**作用域要说出来** —— 模型得知道它看的是哪棵树', async () => {
    invokeMock.mockResolvedValue(PROOF_SNAPSHOT)
    const tool = desktopClientTools.lookup('cu_snapshot_ui_tree')!
    const result = (await tool.execute({}, {})) as { report: string }
    expect(result.report).toContain('scope=focused-window')
  })

  it('工具说明里**写着**那两条拒绝规则（模型不看代码，只看说明）', () => {
    const snap = desktopClientTools.lookup('cu_snapshot_ui_tree')!
    expect(snap.description).toContain('not addressable')
    expect(snap.description).toContain('incomplete')
    const click = desktopClientTools.lookup('cu_click_ui_by_ref')!
    expect(click.description).toContain('not addressable')
  })

  it('拒绝时把错误码带出去（可安全重试：换一张完整快照里的可寻址 ref）', async () => {
    invokeMock.mockRejectedValue({
      code: 'NOT_ADDRESSABLE',
      message:
        'element is not addressable: @s00000031:e1 is not addressable (Pane "" — anonymous or not unique in its snapshot)',
      disposition: { delivery: 'not_delivered', retry: 'safe' },
    })
    const tool = desktopClientTools.lookup('cu_click_ui_by_ref')!
    await expect(tool.execute({ target: '@s00000031:e1' }, {})).rejects.toThrow(/NOT_ADDRESSABLE/)
    await expect(tool.execute({ target: '@s00000031:e1' }, {})).rejects.toThrow(/retry safe/)
  })
})
