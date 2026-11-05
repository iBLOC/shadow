# YAML 合法性闸（scripts/check-yaml-valid.mjs）

> 2026-11-05 · iBLOC/shadow · 与「状态面治理闸」「偏好撤销通道闸」同一套约定

## 0. 一句话

**CI 的 YAML 也是代码**：workflow 的 YAML 解析不了 ⇒ ⇒ **整个 workflow 起不来**
（GitHub Actions 连 job 都进不去）⇒ ⇒ 所以它得跟源码一样，有东西替它把关。

## 1. 病（真机实测）

2026-11-05，兄弟仓 telencephalon 的 CI 里有一行：

    - name: Cargo check (router-only: the brain must build without candle)

冒号**没加引号**。在 YAML 里，纯量（plain scalar）里出现「冒号 + 空格」是**硬错**：

    mapping values are not allowed here

⇒ ⇒ **整个 workflow 解析失败** ⇒ ⇒ GitHub 连 job 都进不去 ⇒ ⇒ 而那阵子 CI
本来就因账号计费/额度全红 ⇒ ⇒ **没人看见** ⇒ ⇒ 修法只是给那个 step 名加引号。

⚠️ **病根不是「那行写错了」**，是「**CI 的 YAML 从来没有被任何东西解析过**」。
所以落成一道闸，而不是把那一行改对就完事。

### 1.1 「拿 YAML 解析器过一遍」是不够的

同伴当时手工把全 iBLOC 的 25 个 workflow 用 YAML 解析器过了一遍 ⇒ 25/25 合法。
**但那里面藏着一条真缺陷**（见 §4）：PyYAML 对**重复键**是**静默放过**的，
而 GitHub 的解析器**直接报错** ⇒ ⇒ 「解析器说合法」≠「GitHub 能加载」。

⇒ ⇒ 所以这道闸有**两层**：语法层（解析器能管）＋ **形状层**（解析器管不了，
是 GitHub Actions 自己的 schema）。

## 2. 判据

| 编号 | 种类 | 抓什么 |
| --- | --- | --- |
| Y1 | plain-scalar-colon | 纯量里的「冒号 + 空格」（那起真实事故的形状） |
| Y2 | tab-indent | 用 Tab 缩进（YAML 不允许） |
| Y3 | duplicate-key | 同一个映射里同名键重复（GitHub 直接报错） |
| Y4 | unbalanced-expression | 表达式没有闭合 |
| Y5 | unclosed-quote | 引号不闭合 |
| Y6 | no-key-separator | 映射层出现没有「键:」的行 |
| Y7 | unexpected-indent | 缩进比同级多出来一截 |
| Y8 | missing-on | workflow 顶层没有 `on` |
| Y9 | missing-jobs | workflow 顶层没有 `jobs` |
| Y10 | job-missing-runs-on | job 既没有 `runs-on` 也没有 `uses` |
| Y11 | job-missing-steps | job 有 `runs-on` 却没有 `steps` |
| Y12 | step-missing-action | step 既没有 `uses` 也没有 `run` |
| Y13 | step-both-actions | step 同时有 `uses` 和 `run` |

**判据认形状不认关键词**：正文里写一句「已加引号」不算加引号；文件里出现一句
「本 workflow 是合法的」也不算合法。

## 3. 差分交叉验证（扫描器不许自说自话）

仓内闸的约定是「纯 Node、零依赖」⇒ ⇒ CI runner 不保证有 pip / npm 包在位。
所以**扫描器是自己写的保守实现**（scripts/lib/yaml-valid.mjs，只还原
「键 → 值 → 嵌套结构」，不做类型推断、不做锚点/别名解析）。

⇒ ⇒ 但只要环境里**有**真解析器（PyYAML / npm yaml），就把同一批文件**再喂一遍**：

| 扫描器 | 真解析器 | 结论 |
| --- | --- | --- |
| 说坏 | 说坏 | 真坏（红） |
| 说好 | 说好 | 真好（绿） |
| 不一致 | | **扫描器不可信**（红，并说清是哪边） |

⇒ ⇒ 于是有**三种**结论，不是两种。差分不一致时报 `differential-mismatch`。

⚠️ 本机 `python3` 是 Microsoft Store 的**桩**（退出码 9009）⇒ ⇒ 探针必须能
识别「装了但跑不起来」这种状态，不能把它当成有解析器。

## 4. 第一天抓到的真缺陷

全 iBLOC 19 个仓 / 25 个 workflow 扫一遍 ⇒ ⇒ 抓到
`ibloc-hr-agent/.github/workflows/release.yml`：**同一个 step 里两个 `with:`**。

    - name: Upload installers to release
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      with:
        release_id: ${{ needs.create-release.outputs.release_id }}   ← 被下面那个覆盖掉
      uses: softprops/action-gh-release@v2
      with:
        files: |
          ...

⇒ ⇒ YAML 语义下**后者覆盖前者** ⇒ ⇒ `release_id` 被**静默丢弃** ⇒ ⇒
softprops/action-gh-release 拿不到 release_id ⇒ ⇒ 而且 **GitHub 的解析器直接
拒绝这个 workflow** ⇒ ⇒ 整个 release 流水线加载不了。

⚠️ 那个仓是**纯本地仓、没有 origin** ⇒ ⇒ 它的 CI 从来没在 GitHub 上跑过 ⇒ ⇒
这个缺陷一直潜伏着。已修（两个 `with:` 合并成一个），复扫 25 个 workflow 全绿。

## 5. 闸自己的第一版也假红过一次

第一版把「表达式不配对」算成「开标记的个数 ≠ 闭标记的个数」⇒ ⇒ 于是
**docker metadata-action 的 `enable={{is_default_branch}}`**（**不是** GitHub 表达式）
被算成多出来的闭标记 ⇒ ⇒ hengjian/docker.yml 假红。

修法：**只有「美元 + 双花括号」才算 GitHub 表达式的开标记** ⇒ ⇒ 别的模板语法
里的双花括号不算 ⇒ ⇒ 而且**多出来的闭标记不算错，只有没闭合才算错**。

⚠️ 这与「认形状不认关键词」同源：**判据的形状要够严，严到只认自己那一种**。

## 6. 用法

    node scripts/check-yaml-valid.mjs                   # 扫本仓的 workflow
    node scripts/check-yaml-valid.mjs --self-test       # 判据自检（21 条，含真实事故夹具）
    node scripts/check-yaml-valid.mjs --drill           # 副本上「绿 → 红 → 绿」演练
    node scripts/check-yaml-valid.mjs --audit           # 现状清单
    node scripts/check-yaml-valid.mjs --json            # 机器可读
    node scripts/check-yaml-valid.mjs --root=<dir>      # 追加扫描根（可重复）
    node scripts/check-yaml-valid.mjs --file=<path>     # 直接扫一个文件（演练用）
    node scripts/check-yaml-valid.mjs --parser=none      # 不做真解析器交叉验证
    node scripts/check-yaml-valid.mjs --strict-parser    # 没有真解析器 ⇒ 退出码 2

退出码：**0 绿 / 1 红 / 2 判不了**（判不了 ≠ 没问题）。

文件发现走 `git ls-files`（含**未跟踪但未忽略**的 ⇒ ⇒ 新写的坏文件不会被漏掉），
并且按 **git-common-dir** 去重（worktree 与主仓是同一个仓 ⇒ ⇒ 不去重会把
分母翻倍 ⇒ ⇒ 「量异常之前先量总数」的前提）。

## 7. CI 接线

- 新增 job **yaml-validity**（ubuntu-latest、无需 secret）：
  装 PyYAML（允许失败，装不上就只跑扫描器）→ 自检 → 主检查。
- **cortex-residue-stack**（跨仓 job）里加一步 **`--root=.`**：
  那个 job 正好把所有兄弟仓检出到工作区子目录 ⇒ ⇒ 顺手把它们的 workflow 也过一遍。

## 8. 分级读数（2026-11-05 实测）

| 级别 | 手段 | 读数 |
| --- | --- | --- |
| 编译级 | `node --check` 两个文件 | EXIT=0 |
| 承载级 | `--self-test` | **21/21** |
| 承载级 | `--drill`（副本绿→红→绿；真文件 SHA256 前后一致） | **4/4** |
| 真机级 | 本仓 3 个 workflow | 零违规 |
| 真机级++ | 全 iBLOC 19 仓 / 25 个 workflow（带 PyYAML 差分） | 零违规，两边结论一致 |
| 真机级+++ | 兄弟仓真文件上的潜伏缺陷 | 逮出并修掉一条 |

## 9. 边界（明确不管的）

- **不判语义**：表达式里的逻辑对不对、action 的入参对不对、step 的顺序合理吗。
- **不判跨设备 / 跨仓的副本**：只扫本地仓里的 workflow 文件。
- **CI 上那三个没有 origin 的仓不覆盖**：ibloc-hr-agent / ibloc-hr-tools /
  telencephalon-verify ⇒ ⇒ 只能靠本机定期扫。
- **真解析器不是必需的**：CI 上装不上 PyYAML 就只跑扫描器（不做差分）⇒ ⇒
  那时结论弱一档，输出里会写明。
