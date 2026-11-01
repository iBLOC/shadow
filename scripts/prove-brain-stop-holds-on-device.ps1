# 真机证明：**用户点了「停止大脑」⇒ 大脑不该自己又起来**。
#
# ## 这条脚本补的是什么洞
#
# 早先的真机实测（2026-11-01 上午）量到：用户点了「停止大脑」，**约 20 秒后**
# 大脑**自己又起来了**（两轮时间戳一致：12:48:53 stopped ⇒ 12:49:13 started
# = 20.5s / 13:08:13 ⇒ 13:08:34 = 21.5s）⇒ ⇒ 那时**机制没有完全锁定**。
#
# ⇒ 客户端这一侧后来加了两道守卫（`_startWithRetry` 顶部一道 + native start
#   返回之后一道 ⇒ 守卫住在 `encephalon_mobile_provider.dart`）⇒ ⇒ 本脚本
#   **在真机上量那道守卫到底赢没赢**。
#
# ## 三段读数（每段都有**正控**）
#
# 1. **停得下来**：点「停止大脑」⇒ ⇒ logcat 出现 `Encephalon stopped`。
# 2. **别自己回来**：等 **35 秒**（> 当时实测的 ~21 秒复活窗口）⇒ ⇒ logcat
#    **没有**新的 `Encephalon started` ⇒ ⇒ 「喊停」赢了。
# 3. **正控（判据有分辨力 ＋ 顺手把设备复原）**：点「启动大脑」⇒ ⇒ logcat
#    **出现新的** `Encephalon started` ⇒ ⇒ 说明第 2 条的「没有新 start」是**真读数**
#    （探测器看得见 start），而不是探测器瞎了；⇒ ⇒ 同时把设备**复原**成
#    「大脑在跑、没喊停过」的原样。
#
# ## 为什么用 Kotlin 侧那行日志
#
# 端脑自己的 `_log.info`（package:logging）**不进 logcat** ⇒ ⇒ 守卫判据只能用
# Kotlin 侧那行：`✅ Encephalon started on port …` / `Encephalon stopped, result: …`
#（`EncephalonRuntime.kt:326-329` / `:352`）⇒ ⇒ **不靠猜**。
#
# 退出码：0 全过 / 1 有红 / 2 什么都没探到。
param(
  [string]$Serial = '',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = '',
  # ⚠️ 必须**大于**当时实测的复活窗口（~21 秒）⇒ ⇒ 默认 35 秒。
  [int]$WaitSeconds = 35
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Projects\iBLOC\shadow'
if (-not $OutDir) { $OutDir = Join-Path $repo 'artifacts\brain-stop-holds-device' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$uiLocal = Join-Path $OutDir 'ui-probe.xml'

function Say($msg) { Write-Output $msg }

$script:results = New-Object System.Collections.Generic.List[object]
function Check($name, $ok, $detail) {
  $script:results.Add([pscustomobject]@{ Name = $name; Ok = $ok; Detail = $detail })
  if ($ok) { Say ('  [PASS] ' + $name) } else { Say ('  [FAIL] ' + $name + ' —— ' + $detail) }
}
function Note($name, $detail) { Say ('  [判不了] ' + $name + ' —— ' + $detail) }

if (-not $Serial) {
  $devices = @(adb devices | Select-String -Pattern '\sdevice$' | ForEach-Object { ($_ -split '\s+')[0] })
  if ($devices.Count -ne 1) {
    Say ('需要恰好一台设备在线，实测到 ' + $devices.Count + ' 台。⇒ 用 -Serial 指定。')
    exit 2
  }
  $Serial = $devices[0]
}
Say ('设备：' + $Serial + '　等待窗口：' + $WaitSeconds + ' 秒')

# ── 无障碍服务（让 Flutter 建语义树）⇒ 结束时还原 ─────────────────────────
$a11yService = $Package + '/' + $Package + '.PrefrontalAccessibilityService'
$a11yBefore = (adb -s $Serial shell settings get secure enabled_accessibility_services 2>$null | Out-String).Trim()
adb -s $Serial shell settings put secure enabled_accessibility_services $a11yService | Out-Null
adb -s $Serial shell settings put secure accessibility_enabled 1 | Out-Null
Start-Sleep -Seconds 2
function Restore-A11y {
  if ($a11yBefore) {
    adb -s $Serial shell settings put secure enabled_accessibility_services $a11yBefore | Out-Null
  } else {
    adb -s $Serial shell settings put secure enabled_accessibility_services '' | Out-Null
  }
}

# ── 语义树工具（按文字定位，不猜像素）──────────────────────────────────────
function DumpNodes {
  adb -s $Serial shell uiautomator dump /sdcard/ui_probe.xml 2>$null | Out-Null
  Start-Sleep -Milliseconds 450
  adb -s $Serial pull /sdcard/ui_probe.xml $uiLocal 2>&1 | Out-Null
  if (-not (Test-Path $uiLocal)) { return @() }
  try { $x = [xml](Get-Content $uiLocal -Raw) } catch { return @() }
  return @($x.SelectNodes('//node'))
}
function NodeText($n) {
  $t = $n.text
  if (-not $t) { $t = $n.'content-desc' }
  if ($null -eq $t) { return '' }
  return ($t -replace '\s+', ' ').Trim()
}
function CenterOf($bounds) {
  if ($bounds -match '\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]') {
    $x1 = [int]$matches[1]; $y1 = [int]$matches[2]; $x2 = [int]$matches[3]; $y2 = [int]$matches[4]
    return @([int](($x1 + $x2) / 2), [int](($y1 + $y2) / 2))
  }
  return $null
}
function FindByText([string]$needle, [bool]$exact = $false) {
  $fallback = $null
  foreach ($n in (DumpNodes)) {
    $t = NodeText $n
    if (-not $t) { continue }
    if ($exact) {
      if ($t -ne $needle) { continue }
    } else {
      if (-not $t.Contains($needle)) { continue }
    }
    $c = CenterOf $n.bounds
    if (-not $c) { continue }
    $item = [pscustomobject]@{ Text = $t; X = $c[0]; Y = $c[1]; Clickable = $n.clickable }
    if ($n.clickable -eq 'true') { return $item }
    if (-not $fallback) { $fallback = $item }
  }
  return $fallback
}
function FindWithScroll([string]$needle, [int]$scrolls = 5) {
  $hit = FindByText $needle
  if ($hit) { return $hit }
  for ($i = 0; $i -lt $scrolls; $i++) {
    adb -s $Serial shell input swipe 540 1800 540 900 300 | Out-Null
    Start-Sleep -Milliseconds 800
    $hit = FindByText $needle
    if ($hit) { return $hit }
  }
  return $null
}
function TapNode($hit) {
  Say ('  ▸ 点「' + $hit.Text + '」@ ' + $hit.X + ',' + $hit.Y)
  adb -s $Serial shell input tap $hit.X $hit.Y | Out-Null
  Start-Sleep -Seconds 2
}

# ── logcat 计数（守卫判据用 Kotlin 侧那行）──────────────────────────────────
function CountLog([string]$pattern) {
  $lines = adb -s $Serial logcat -d -v time 2>$null | Select-String -Pattern $pattern
  return @($lines).Count
}
function WaitLog([string]$pattern, [int]$fromCount, [int]$seconds) {
  for ($i = 0; $i -lt $seconds; $i++) {
    Start-Sleep -Seconds 1
    $c = CountLog $pattern
    if ($c -gt $fromCount) { return $c }
  }
  return -1
}

Say ''
Say '(0) 启动 App ⇒ 等大脑起来（记录 logcat 里 start 的基线）'
adb -s $Serial shell am force-stop $Package | Out-Null
Start-Sleep -Seconds 2
adb -s $Serial logcat -c
adb -s $Serial shell input keyevent KEYCODE_WAKEUP | Out-Null
adb -s $Serial shell am start -n ($Package + '/' + $Activity) | Out-Null
$startPattern = 'Encephalon started on port'
$stopPattern = 'Encephalon stopped'
$starts = WaitLog $startPattern 0 90
if ($starts -lt 0) {
  Say '没等到大脑启动 ⇒ 什么都没探到。'
  Restore-A11y
  exit 2
}
Say ('   大脑已启动（logcat start 计数 = ' + $starts + '）')

Say ''
Say '(1) 进「嵌入式大脑」页 ⇒ 点「停止大脑」'
# ⚠️ **不要按精确匹配找「我」** —— 底部导航的标签在语义树里是**合并节点**：
#    「我 第 4 个标签，共 4 个」⇒ ⇒ 精确匹配**永远落空**。
#    ⇒ ⇒ 改走**顶栏那个「设置」按钮**（tooltip = `设置`，独立节点 ⇒ 好点）。
$entryBtn = FindByText '设置' $true
if (-not $entryBtn) {
  # 兜底：底部导航那个合并节点（「我 第 4 个标签…」）。
  $entryBtn = FindByText '我 第'
}
if (-not $entryBtn) {
  Note '进嵌入式大脑页' '找不到「设置」入口 ⇒ 判不了'
  Restore-A11y
  exit 2
}
TapNode $entryBtn
$entry = FindWithScroll '嵌入式大脑'
if (-not $entry) {
  Note '进嵌入式大脑页' '设置页里找不到「嵌入式大脑」⇒ 判不了'
  Restore-A11y
  exit 2
}
TapNode $entry
$stopBtn = FindWithScroll '停止大脑'
if (-not $stopBtn) {
  Note '点「停止大脑」' '大脑页里找不到「停止大脑」按钮 ⇒ 判不了'
  Restore-A11y
  exit 2
}
TapNode $stopBtn
$stops = WaitLog $stopPattern 0 30
Check '点「停止大脑」⇒ 大脑停了' ($stops -gt 0) ('logcat 里没有 `Encephalon stopped`')

Say ''
Say ('(2) 等 ' + $WaitSeconds + ' 秒 ⇒ 大脑**不许**自己又起来')
$startsBefore = CountLog $startPattern
for ($i = 0; $i -lt $WaitSeconds; $i++) {
  Start-Sleep -Seconds 1
}
$startsAfter = CountLog $startPattern
Check ('等 ' + $WaitSeconds + ' 秒后大脑没自己起来（喊停赢了）') ($startsAfter -eq $startsBefore) ('start 计数从 ' + $startsBefore + ' 变成 ' + $startsAfter + ' ⇒ 它又起来了')

Say ''
Say '(3) 正控：点「启动大脑」⇒ 探测器**看得见** start ⇒ 且把设备复原'
$startBtn = FindWithScroll '启动大脑'
if (-not $startBtn) {
  Note '正控：点「启动大脑」' '页面上找不到「启动大脑」按钮 ⇒ 判不了（探测器没被证伪）'
} else {
  TapNode $startBtn
  $restarted = WaitLog $startPattern $startsAfter 90
  Check '正控：点「启动大脑」⇒ logcat 出现新的 start' ($restarted -gt 0) ('logcat 里没有新的 `Encephalon started` ⇒ 探测器可能瞎了 ⇒ 第 (2) 条的读数不算数')
}

Say ''
Say '(4) 收尾：撤掉无障碍设置'
Restore-A11y

$failed = @($script:results | Where-Object { -not $_.Ok })
Say ''
Say ('读数：' + $script:results.Count + ' 条，' + $failed.Count + ' 红')
if ($failed.Count -gt 0) {
  Say '⇒ 有红。'
  exit 1
}
Say '⇒ 「用户喊停」在真机上赢了：大脑停得下来、也不自己回来。'
exit 0