import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ⚠️ **供应商默认地址有三份副本**（2026-11-15 实测取证）。
 *
 * `src/lib/cloudProviders.ts` / `src/pages/ModelsPage.tsx` /
 * `src/pages/SetupPage.tsx` 各自抄了一份 `DEFAULT_API_BASE`
 * ⇒ ⇒ 三份**必然会漂**：本刀动笔前，后端预设目录（synapse 的 catalog）
 * 已经是官方口径（`api.minimax.io` / `api.minimax.cn`），而这三份
 * 还在 `api.minimax.chat` / `api.minimaxi.com` ⇒ ⇒ **用户加的是老域**。
 *
 * ⇒ ⇒ 这条测试钉的是「三份副本的值一致且是当前口径」——
 * **不是**「文件里出现过这句话」（那是另一道闸的形状）。
 */
const COPIES = [
  'src/lib/cloudProviders.ts',
  'src/pages/ModelsPage.tsx',
  'src/pages/SetupPage.tsx',
];

/** 从一份副本里抠出 MiniMax 族两个 id 的默认地址。 */
function minimaxBases(file: string): Record<string, string | null> {
  const text = readFileSync(resolve(process.cwd(), file), 'utf8');
  const pick = (re: RegExp): string | null => {
    const m = text.match(re);
    return m ? m[1] : null;
  };
  return {
    minimax: pick(/^\s*minimax:\s*'([^']+)'/m),
    'minimax-cn': pick(/^\s*'minimax-cn':\s*'([^']+)'/m),
  };
}

describe('supplier default base urls (MiniMax family)', () => {
  it('every copy points at the current official bases', () => {
    for (const file of COPIES) {
      const bases = minimaxBases(file);
      expect(bases.minimax, file).toBe('https://api.minimax.io/v1');
      expect(bases['minimax-cn'], file).toBe('https://api.minimax.cn/v1');
    }
  });

  it('the three copies agree with each other', () => {
    const [first, ...rest] = COPIES.map((f) => minimaxBases(f));
    for (const other of rest) {
      expect(other).toEqual(first);
    }
  });

  it('no copy still points at a retired MiniMax domain', () => {
    for (const file of COPIES) {
      const text = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(text, file).not.toContain('api.minimax.chat');
      expect(text, file).not.toContain('api.minimaxi.chat');
    }
  });
});
