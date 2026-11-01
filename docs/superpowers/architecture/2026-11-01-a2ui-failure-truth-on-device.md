# 真机上「失败态说了真话」—— 端脑回 401 时，App 如实显示真实原因

**日期：** 2026-11-01  
**范围：** 移动端 A2UI（`shadow-mobile`）· 宿主侧证明脚本（`shadow/scripts`）  
**父仓提交：** `883d97d`（脚本）· `cccd646`（修复）

---

## 一句话

端脑那道门把请求挡下来（**401**）时，App 不再永远转圈、也不再说成「未连接到端脑」，
而是**把真实原因显示出来**：「❌ 错误：HTTP 401 Unauthorized」。
这一格从「写好脚本、没在真机上跑过」变成了**实跑通过（6 条机器可判全过）**。

---

## 一、怎么验的（真机，不是单测）

### 1. 宿主侧起一个「有门的端脑」桩

`scripts/a2ui-door-stub.mjs`：

- 无钥匙 / 错钥匙 ⇒ **401 空体**；
- 对钥匙 ⇒ **200 + `text/event-stream`**；
- 行为与 `telencephalon/src/api/shadow_auth.rs` 的 `require_shadow_key` **逐字一致**；
- 日志只记 `hasShadowKey` / `keyMatched` / `status` / `reqId` / `ua` —— **绝不记钥匙**。

### 2. 设备侧制造「401」

内嵌大脑不在跑 ⇒ `agentPort == null` ⇒ A2UI 地址**自动退回外部端脑**
（`shadow-mobile/lib/providers/genui_provider.dart:48-61`）⇒ ⇒ 请求**不带影子锁**
打到宿主那个桩 ⇒ **门回 401**。

> 内嵌端脑与客户端同源同刻 ⇒ 结构上不可能 401 ⇒ ⇒ **401 只能来自外部端脑**。

### 3. 判定：语义树按文字定位 + 前后红像素对照

- 打开 App 自带的无障碍服务（`com.ibloc.shadow/com.ibloc.shadow.PrefrontalAccessibilityService`）
  ⇒ Flutter 建语义树 ⇒ `uiautomator dump` 拿到**带文字 + 坐标**的节点 ⇒ **按文字找元素**，
  不靠像素猜坐标；脚本收尾**还原无障碍设置**。
- 内容区红色像素：**发之前 0 / 274752** ⇒ **发之后 3857 / 274752**（用前后对照，
  不用绝对阈值）。

### 4. 结果（`pwsh -File scripts/prove-a2ui-failure-on-device.ps1 -Serial ee6b4832`，exit 0）

```
OK 内嵌大脑不在跑 ⇒ 退回外部端脑
OK App 的请求打到了外部端脑
OK App 的请求**没带**影子锁
OK 门回了 401
OK 发之前内容区几乎没有红
OK 发之后内容区出现红色
全过
```

截图：`artifacts/a2ui-failure-on-device/03-a2ui-before.png`（横幅「连接中…」+ 内容
「未连接到端脑」）vs `04-a2ui-failure.png`（横幅「**连接错误**」+ 内容
「**❌ 错误：HTTP 401 Unauthorized**」）。

---

## 二、踩过的坑（每条都是真机才知道的）

| 坑 | 症状 | 修法 |
|---|---|---|
| 坐标写成 `[int]'540,1800'` | PowerShell 把逗号去掉再拼接 ⇒ 落到屏幕外 ⇒ **不报错、什么也没发生** | 坐标一律空格分隔，解析时 `-replace ',', ' '` |
| 设置页记住上次滚动位置 | 同一坐标有时点中「嵌入式大脑」、有时点中「设备发现」 | 按**文字**找（语义树） |
| `Shot` 里用 `Say` | 提示语混进函数返回值 ⇒ `Bitmap::FromFile` 炸 | 改 `Write-Host` |
| 软键盘盖住底栏 | 点「我」全打在键盘上；语义树**照样报**底栏坐标 | 只能靠**屏幕**判断；ESCAPE 对搜狗键盘无效 ⇒ 只能用 BACK |
| 桩端口残留 | 上一轮脚本中途死掉 ⇒ 下轮 `EADDRINUSE` | 开桩前先杀占用 `$StubPort` 的进程 |
| Dart 日志不进 logcat | `wireDartLoggingIntoLogPanel` 把 package:logging 接到日志面板 | 判「大脑停了」只能用 Kotlin 侧那行 `Encephalon stopped` |
| `adb reverse` 抢不到端口 | 设备上已被占用的端口劫持不了 | 不能劫持活着的内嵌端脑端口 |

### ⚠️ 一条判据陷阱（差点造出假绿）

判据里要区分「**App 发的请求**」与「**我的探针**」—— 否则探针顶替掉 App 的请求，
「App 没带影子锁」会**绿成假** ⇒ ⇒ 桩因此记 `reqId` + `ua`
（App 的是 uuid；探针的是 `reqId:"probe"` + `curl/7.80.0`）。

---

## 三、两条真机新发现（含一处订正）

### ① 「内嵌大脑起不来」不是新病 ⇒ 是**陈旧产物**

设备上 `nativeStart` 一直回 **-1**（13:13 起反复复现；本轮 13:29 复测仍是 -1）。
**真凶已在端脑仓定位并修好**：`C:\Projects\iBLOC\encephalon` 的
`Cargo.toml` 的 `mobile` feature **不开**本 crate 的 `hippocampus`（那份**零调用方**
的「死代码」在 Android 上会去连不可写的 `./data/lance` ⇒ `panic` ⇒ JNI 边界 abort），
**只开** `telencephalon/hippocampus`，并由宿主显式给 `hippocampus_data_dir` +
30 秒连接超时（`src/mobile/mod.rs`）。

⚠️ **那份修复还没入库**（`Cargo.toml` / `src/mobile/mod.rs` 仍在工作树里）⇒ ⇒
⇒ 设备上那份 `.so`（并行会话 12:10 装的构建）**早于**它 ⇒ ⇒ ⇒
**本轮这条 `-1` 风暴是预期的陈旧读数，不是新缺陷** ⇒ ⇒ 要验它必须
**重编 `.so` + 重打 APK + 装机**。

### ② 「用户点了『停止大脑』，约 20 秒后大脑自己又起来了」

真机实测两轮，时间戳一致：

- `12:48:53.394 Encephalon stopped, result: 0` ⇒ `12:49:13.960 ✅ Encephalon started on port 42687`（**20.5s**）
- `13:08:13.384 Encephalon stopped` ⇒ `13:08:34.916 ✅ Encephalon started on port 39685`（**21.5s**）

⚠️ **机制没有完全锁定**：logcat 缓冲在那之前已经滚掉，**PID 连续性读不到** ⇒ ⇒
⇒ 「是同一进程里的启动流程把脑拉回来了」还是「进程被 panic 杀掉后被系统重启、
`main.dart` 又 `ensureStarted()`」**分不开** ⇒ ⇒ **别把它当成已证根因**。

⇒ ⇒ 但**客户端这一侧有一条独立可证的缺陷**（不需要设备就能证）：
「用户主动停过大脑」这个标记**只有就绪门在守**，自动启动那条路**自己不守** ⇒ ⇒
⇒ 两个入口、两套语义 ⇒ ⇒ 用户刚停掉的大脑会被偷偷拉回来。

---

## 四、修的东西：「用户喊停」必须赢

`shadow-mobile/lib/services/encephalon/encephalon_mobile_provider.dart`：

| 守卫 | 位置 | 挡的是 |
|---|---|---|
| 「用户停过 ⇒ 这一轮别开始」 | `_startWithRetry` **顶部** | 自动启动入口 + 重试链 |
| 「启动途中喊停 ⇒ 关掉刚起来的脑」 | native `start` **返回之后** | 界面说「已停止」而大脑在跑 |

⚠️ **只留两处**：第一版还在 `ensureStarted` 入口与退避前各加了一道 ⇒ ⇒
**反向验证时发现那两道观测不到**（重试链顶部已经拦住了）⇒ ⇒ 留着就是两条
**恒绿的分支** ⇒ ⇒ 删掉 ⇒ ⇒ **「一条规则、一处实现」**。

### 证据 + 反向验证

- provider 单测 **14 ⇒ 18 passed**（新增 4 条）；
- 全量 **441 ⇒ 445 passed / 0 failed**；
- `flutter analyze`（两个文件）**零 issue**；
- ⚠️ 反向验证：拆掉「重试链顶部」⇒ **恰好 2 红**；拆掉「启动途中喊停」⇒ **恰好 1 红**；
  其余纹丝不动 ⇒ ⇒ 断言钉在真东西上、不是恒绿。

---

## 五、还欠的

- ⚠️ **真机复验「停脑即停」** —— 要重编 `.so` + 重打 APK（设备那份是陈旧的）；
- ⚠️ **移动端没有「外部端脑 shadow key」设置入口** —— **正是 401 能发生的入口缺口**；
- ⚠️ **端脑 `get_logs` 的 HOME 病**（`system_status.rs:61-67` 在 Android 上退化成 `./.local/...`）；
- ⚠️ **「空 surface」在手机上判不了**（端脑还没显式声明状态）；
- ⚠️ **设备是共享的** —— 别的会话同时在驱动 ⇒ 截图会拍到别的页面 ⇒ 每步须重新起 App + 截图核对。