#!/usr/bin/env node
/**
 * **死环境变量闸 —— 扫描范围**（**数据**，不是判据）。
 * ============================================================================
 *
 * ## 它为什么住在 lib 层
 *
 * 工作树面闸（scripts/check-dead-env-vars.mjs）与提交树面闸
 * （scripts/check-dead-env-vars-commit-tree.mjs）**必须扫同一批文件**
 * ⇒ ⇒ 否则「两个面的读数不同」可能只是**范围不同**，而不是**内容不同**
 * ⇒ ⇒ 那时「两个面的读数可以放在一起比」这句话就是假的。
 *
 * 通用形态：**同一族判据/数据只保留一处实现，第二处会漂**。
 *
 * ⚠️ 排除清单里**必须**包含两把闸**自己**的文件与登记簿：
 *    它们**必然**含有闸要认的那些形状（文档里的示例、变量名清单）
 *    ⇒ ⇒ 自己扫自己 ⇒ ⇒ 会把自己的**文档**判成「设了没人读」⇒ ⇒ 白报。
 */

/** 扫描时要跳过的目录名（任意一层命中即跳过）。 */
export const EXCLUDE_DIRS = [
  'node_modules', '.git', 'target', 'dist', 'build', 'out',
  'docs', 'playwright-report', 'test-results', 'reports', 'runs-task7-traj',
];

/** 扫描时要跳过的文件（相对仓根的路径，逐字匹配）。 */
export const EXCLUDE_FILES = [
  'pnpm-lock.yaml', 'package-lock.json', 'pubspec.lock', '.metadata',
  // ⚠️ 闸**自己**的文件 —— 它们**必然**含有它要认的那些形状
  //    （闸的文档里会给出「设置端长什么样」的示例；闸自己的代码里也有夹具）
  //    ⇒ ⇒ 自己扫自己 ⇒ ⇒ 会把自己的**文档**判成「设了没人读的环境变量」⇒ ⇒ 白报。
  //    ⇒ ⇒ 与残留闸同一套做法（它也排除自己的文件：闸当然知道那个词）。
  //    ⚠️ 通用形态：**尺子不许量到尺子自己的注释** ⇒ ⇒ 否则它会把自己的
  //    说明文字读成被测物 ⇒ ⇒ 报一个**假红** ⇒ ⇒ 而假红会让人去改正确的东西。
  'scripts/check-dead-env-vars.mjs',
  'scripts/lib/dead-env-vars.mjs',
  'scripts/check-dead-env-vars-commit-tree.mjs',
  // ⚠️ 本文件自己 —— 它是**范围清单**，一旦被扫，它下面的**示例文本**
  //    就会被判据读成真实的设置端 ⇒ ⇒ ⇒ 本文件也必须排除自己。
  'scripts/lib/dead-env-vars-scope.mjs',
  // ⚠️ 登记簿本身（一份**变量名清单**）⇒ ⇒ 也不是代码 ⇒ ⇒ 两把闸都不扫它。
  'scripts/lib/dead-env-vars-allowed.mjs',
];