/**
 * 生成物的行尾规矩。
 *
 * ## 为什么比对必须忽略行尾
 *
 * 仓里**所有** blob 都是 LF（`git ls-files --eol` → `i/lf`，且没有
 * `.gitattributes`）。但**工作树**里的行尾取决于 checkout：
 *   - Windows 开发机 `core.autocrlf=true` → LF 检出成 CRLF；
 *   - Linux CI（默认 `core.autocrlf=false`）→ 检出就是 LF。
 *
 * 生成器如果按「本机工作树长什么样」硬编码行尾（早先移动端 Dart 产物
 * 写死 `\r\n`，注释还写着「移动端 Dart 源码是 CRLF」），就会得到一个
 * **本地永远绿、CI 永远红**的坑：
 *   - Windows：checkout 是 CRLF，生成 CRLF → 恰好蒙对，--check 通过；
 *   - Linux CI：checkout 是 LF，生成 CRLF → 判漂移，job 直接红。
 *
 * 本地跑多少遍都发现不了 —— 只有 CI 会揭穿它。
 *
 * ## 现在的规矩
 *
 * - 生成物**一律写 LF**：与仓内 blob 一致，任何平台的 checkout 都一样；
 * - 比对时把两边的 CRLF 归一化成 LF 再比 —— 这样 Windows 的 CRLF 工作树
 *   （autocrlf 检出）和 Linux 的 LF 工作树都判「同步」。
 */

/** 生成物统一用 LF 落盘（与仓内 blob 一致）。 */
export const GENERATED_EOL = '\n';

/**
 * 把 CRLF 归一化成 LF，用于**比对**。
 *
 * 只动行尾，不动内容 —— 生成物的语义差异仍然会被判为漂移。
 */
export function normalizeEol(text) {
  if (text === null || text === undefined) return null;
  return text.replace(/\r\n/g, '\n');
}
