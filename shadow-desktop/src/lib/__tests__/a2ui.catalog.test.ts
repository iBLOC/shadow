// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AGENT_STATUS_VALUES,
  A2UI_PROTOCOL_VERSION,
  SHADOW_CATALOG_ID,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  shadowCatalog,
} from '../a2uiProtocol';

/**
 * **发布出去**的那份目录契约（父仓 `a2ui/catalogs/v1/catalog.json`）。
 *
 * ⚠️ 它是本仓**发布**出去的那份目录契约（端脑在每个业务组件上写 `catalogId` 指它）
 * ⇒ ⇒ 而两个客户端各自在**代码里**注册了同一份目录
 * （桌面端 `a2uiProtocol.ts`、移动端 `shadow_catalog.dart`）
 * ⇒ ⇒ **三份必须逐字一致**，否则「发布出去的契约」在骗人，
 * 而外部消费者按它渲染 ⇒ ⇒ 端脑发来的一个枚举值被拒 ⇒ ⇒ **界面什么都没有**。
 */
function publishedCatalogPath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, 'a2ui', 'catalogs', 'v1', 'catalog.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('找不到发布目录契约 a2ui/catalogs/v1/catalog.json');
}

interface PublishedComponent {
  properties: Record<string, { const?: string; enum?: string[] }>;
  required: string[];
}

const published = JSON.parse(readFileSync(publishedCatalogPath(), 'utf8')) as {
  catalogId: string;
  protocolVersion: string;
  components: Record<string, PublishedComponent>;
};

/** 端脑真字节里的**每一个组件**。 */
function componentsOfRealBytes(): Record<string, unknown>[] {
  let dir = dirname(fileURLToPath(import.meta.url));
  let fixture = '';
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, 'fixtures', 'a2ui', 'tasks_sse.txt');
    if (existsSync(candidate)) {
      fixture = candidate;
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (!fixture) throw new Error('找不到端脑真字节 fixture');

  const out: Record<string, unknown>[] = [];
  const raw = readFileSync(fixture, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const event = JSON.parse(trimmed.slice('data:'.length).trim()) as Record<string, unknown>;
    const result = event.result as Record<string, unknown> | undefined;
    const status = result?.status as Record<string, unknown> | undefined;
    const message = status?.message as Record<string, unknown> | undefined;
    const parts = message?.parts as Record<string, unknown>[] | undefined;
    if (!parts) continue;
    for (const part of parts) {
      if (part.kind !== 'data') continue;
      const data = part.data as Record<string, unknown> | undefined;
      const create = data?.createSurface as Record<string, unknown> | undefined;
      const components = create?.components as Record<string, unknown>[] | undefined;
      if (!components) continue;
      for (const component of components) out.push(component);
    }
  }
  return out;
}

describe('发布目录契约（a2ui/catalogs/v1/catalog.json）', () => {
  it('catalogId 与桌面端注册的那份逐字一致', () => {
    expect(published.catalogId).toBe(SHADOW_CATALOG_ID);
  });

  it('协议版本与线缆上的一致', () => {
    expect(published.protocolVersion).toBe(A2UI_PROTOCOL_VERSION);
  });

  it('组件集合与桌面端目录一致', () => {
    expect(Object.keys(published.components).sort()).toEqual(
      [...shadowCatalog.components.keys()].sort(),
    );
  });

  it('三个枚举与发布契约逐字一致', () => {
    expect(published.components.TaskCard.properties.status.enum).toEqual([
      ...TASK_STATUS_VALUES,
    ]);
    expect(published.components.TaskCard.properties.priority.enum).toEqual([
      ...TASK_PRIORITY_VALUES,
    ]);
    expect(published.components.AgentStatusIndicator.properties.status.enum).toEqual([
      ...AGENT_STATUS_VALUES,
    ]);
  });

  it('发布契约**接受**端脑真字节里的每一个业务组件', () => {
    const business = componentsOfRealBytes().filter(
      (component) => component.catalogId === SHADOW_CATALOG_ID,
    );
    expect(business.length).toBeGreaterThan(0);

    for (const component of business) {
      const type = String(component.component);
      const schema = published.components[type];
      expect(schema, `发布目录里必须有 ${type}`).toBeDefined();

      // ① 类型自证。
      expect(schema.properties.component?.const).toBe(type);

      // ② 必填都在。
      for (const required of schema.required) {
        expect(
          Object.prototype.hasOwnProperty.call(component, required),
          true,
          `${type} 少了必填字段 ${required}`,
        );
      }

      // ③ 每个取值都在枚举里（枚举少一档 ⇒ 官方 SDK 整条拒收）。
      for (const [key, declared] of Object.entries(schema.properties)) {
        if (!declared.enum) continue;
        if (!Object.prototype.hasOwnProperty.call(component, key)) continue;
        expect(
          declared.enum,
          `${type}.${key} 的取值不在发布枚举里`,
        ).toContain(String(component[key]));
      }
    }
  });
});
