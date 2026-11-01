# 真机证明：**失败态说真话** —— 端脑回 401 时，App 必须显示**真实原因**（HTTP 401），
# 而不是永远转圈、或把失败说成「未连接到端脑」。
#
# ## 这条脚本补的是什么洞
#
# 到 2026-11-01 之前，移动端 A2UI 的「空 / 失败」三态只有 **widget / service 级**证据
#（test/widget/a2ui_answer_states_test.dart：真起一个本地 HTTP 服务回放 401 / 连不上），
# 而**真机那一截是空的**。
#
# ## 触发链（为什么非得先停掉内嵌大脑）
#
# * 内嵌端脑那把钥匙，宿主是**同一份**同时递给「端脑」与「客户端」的
#   （MainActivity.kt:771）⇒ **结构上不可能**对自家 App 回 401。
# * 所以 401 只能来自**外部**端脑：停掉内嵌大脑 ⇒ agentPort 变 null
#   ⇒ A2UI 地址**退回外部端脑**（设备默认 http://127.0.0.1:60080）
#   ⇒ 而客户端此时**没有影子锁**（releaseAgentSurface 把 apiKey 清成 null）
#   ⇒ ⇒ 请求不带钥匙 ⇒ 门回 **401 + 空体**（与端脑 require_shadow_key 一致）。
#
# ## ⚠️ **和大脑赛跑**（实测踩到的）
#
# 用户点了「停止大脑」之后，**约 20 秒后大脑自己又起来了**（logcat 实测：
# 12:48:53.394 Encephalon stopped ⇒ 12:49:13.960 Encephalon started）。
# ⇒ 一旦大脑回来，A2UI 地址又指回内嵌端脑 ⇒ 请求变成 200 ⇒ **验不到失败态**。
# ⇒ 所以脚本的顺序是：**先把话打好 → 再停大脑 → 立刻发**。
#
# ## ⚠️ 元素怎么找：不是按像素猜，是**按文字**找
#
# 踩过的坑（都真跑过）：
# ① 坐标写成 '540,1800' ⇒ PowerShell 的 [int]'540,1800' 会**把逗号去掉再拼起来**
#    ⇒ 变成 5401800 ⇒ `adb input tap` 落到屏幕外 ⇒ **不报错、什么也没发生**。
# ② 设置页会**记住上次的滚动位置** ⇒ 同一个坐标有时点中「嵌入式大脑」
#    有时点中「设备发现」⇒ **纯坐标脚本不可靠**。
# ⇒ 所以：**打开 App 自带的无障碍服务**（Flutter 只有在有 a11y 服务连着时
#    才建语义树）⇒ `uiautomator dump` 就能拿到**带文字 + 带坐标**的节点
#    ⇒ 「找那一行」变成**按文字找**。脚本结束会把无障碍设置**还原**。
param(
  [string]$Serial = '',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = '',
  [int]$StubPort = 41234,
  [string]$Message = 'hello',
  [switch]$SkipUi,
  [switch]$SkipStopBrain
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Projects\iBLOC\shadow'
if (-not $OutDir) { $OutDir = Join-Path $repo 'artifacts\a2ui-failure-on-device' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$uiLocal = Join-Path $OutDir 'ui-probe.xml'

function Say($msg) { Write-Output $msg }

function Shot([string]$name) {
  $remote = '/sdcard/' + $name + '.png'
  adb -s $Serial shell screencap -p $remote | Out-Null
  Start-Sleep -Milliseconds 300
  $local = Join-Path $OutDir ($name + '.png')
  adb -s $Serial pull $remote $local 2>&1 | Out-Null
  Write-Host ('截图：' + $local)
  return $local
}

function DumpNodes() {
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
  return $t
}

function CenterOf($bounds) {
  if ($bounds -match '\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]') {
    $x1 = [int]$matches[1]; $y1 = [int]$matches[2]; $x2 = [int]$matches[3]; $y2 = [int]$matches[4]
    return @([int](($x1 + $x2) / 2), [int](($y1 + $y2) / 2))
  }
  return $null
}

function FindByText([string]$needle) {
  $fallback = $null
  foreach ($n in (DumpNodes)) {
    $t = NodeText $n
    if (-not $t -or -not $t.Contains($needle)) { continue }
    $c = CenterOf $n.bounds
    if (-not $c) { continue }
    $item = [pscustomobject]@{ Text = ($t -replace '\s+', ' '); X = $c[0]; Y = $c[1]; Clickable = $n.clickable }
    if ($n.clickable -eq 'true') { return $item }
    if (-not $fallback) { $fallback = $item }
  }
  return $fallback
}

function TapText([string]$needle) {
  $hit = FindByText $needle
  if (-not $hit) { throw ('语义树里找不到「' + $needle + '」') }
  Write-Host ('  ▸ 点「' + $needle + '」@ ' + $hit.X + ',' + $hit.Y)
  adb -s $Serial shell input tap $hit.X $hit.Y | Out-Null
  Start-Sleep -Seconds 2
  return $hit
}

function TapTextByScrolling([string]$needle, [int]$maxTries = 12) {
  for ($i = 0; $i -lt $maxTries; $i++) {
    $hit = FindByText $needle
    if ($hit -and $hit.Clickable -eq 'true') {
      Write-Host ('  ▸ 点「' + $needle + '」@ ' + $hit.X + ',' + $hit.Y + '（滚了 ' + $i + ' 次）')
      adb -s $Serial shell input tap $hit.X $hit.Y | Out-Null
      Start-Sleep -Seconds 3
      return $hit
    }
    adb -s $Serial shell input swipe 540 1700 540 1000 800 | Out-Null
    Start-Sleep -Milliseconds 900
  }
  throw ('滚到底也没找到「' + $needle + '」')
}

# 打开「组件」（Agent2UI）页：它在**对话页**顶栏，语义标签就叫 Agent2UI。
# ⚠️ 「嵌入式大脑」页是压在对话分支上的另一条路由 ⇒ 找之前先退回去。
function OpenA2uiPage() {
  for ($i = 0; $i -lt 6; $i++) {
    $hit = FindByText 'Agent2UI'
    if ($hit -and $hit.Clickable -eq 'true') {
      Write-Host ('  ▸ 点「Agent2UI」@ ' + $hit.X + ',' + $hit.Y)
      adb -s $Serial shell input tap $hit.X $hit.Y | Out-Null
      Start-Sleep -Seconds 3
      return $true
    }
    adb -s $Serial shell input keyevent KEYCODE_BACK | Out-Null
    Start-Sleep -Seconds 2
    $focus = (adb -s $Serial shell dumpsys window 2>$null | Select-String -Pattern 'mCurrentFocus' | Select-Object -First 1)
    if (-not $focus -or $focus.Line -notmatch 'com\.ibloc\.shadow') {
      adb -s $Serial shell am start -n ($Package + '/' + $Activity) | Out-Null
      Start-Sleep -Seconds 4
    }
  }
  return $false
}

# 收软键盘：Android 上 **BACK 会先被 IME 吃掉**（不会退路由）。
# ⚠️ ESCAPE(111) 对某些输入法**无效**（实测搜狗键盘就没收）⇒ 只能用 BACK。
# 判据：输入框回到屏幕底部（y > 1900）⇒ 键盘已收。
function CloseKeyboard() {
  for ($i = 0; $i -lt 4; $i++) {
    $et = FindEditBox
    if (-not $et) { return $true }
    $c = CenterOf $et.bounds
    if ($c[1] -gt 1900) { return $true }
    adb -s $Serial shell input keyevent 4 | Out-Null
    Start-Sleep -Seconds 1
  }
  return $false
}

function FindEditBox() {
  foreach ($n in (DumpNodes)) { if ($n.class -eq 'android.widget.EditText') { return $n } }
  return $null
}

# 输入框右侧那个**没有文字**的按钮 = 发送键。
function FindSendButton() {
  $nodes = DumpNodes
  $et = $null
  foreach ($n in $nodes) { if ($n.class -eq 'android.widget.EditText') { $et = $n; break } }
  if (-not $et) { return $null }
  $e = CenterOf $et.bounds
  $best = $null; $bestDx = 99999
  foreach ($n in $nodes) {
    if ($n.class -ne 'android.widget.Button') { continue }
    $c = CenterOf $n.bounds
    if (-not $c) { continue }
    if ([Math]::Abs($c[1] - $e[1]) -gt 80) { continue }
    $dx = $c[0] - $e[0]
    if ($dx -gt 0 -and $dx -lt $bestDx) { $bestDx = $dx; $best = [pscustomobject]@{ X = $c[0]; Y = $c[1] } }
  }
  return $best
}

function TypeMessage([string]$msg) {
  $et = FindEditBox
  if (-not $et) { throw '页面上找不到输入框' }
  $c = CenterOf $et.bounds
  Write-Host ('  ▸ 点输入框 @ ' + $c[0] + ',' + $c[1])
  adb -s $Serial shell input tap $c[0] $c[1] | Out-Null
  Start-Sleep -Seconds 2
  adb -s $Serial shell input text $msg | Out-Null
  Start-Sleep -Seconds 2
}

function CountRed([string]$path) {
  Add-Type -AssemblyName System.Drawing
  $bmp = [System.Drawing.Bitmap]::FromFile($path)
  try {
    $x0 = [int]($bmp.Width * 0.10); $x1 = [int]($bmp.Width * 0.90)
    $y0 = [int]($bmp.Height * 0.25); $y1 = [int]($bmp.Height * 0.78)
    $red = 0; $total = 0
    for ($y = $y0; $y -lt $y1; $y += 2) {
      for ($x = $x0; $x -lt $x1; $x += 2) {
        $c = $bmp.GetPixel($x, $y)
        $total++
        if ($c.R -ge 230 -and ($c.R - $c.G) -ge 35 -and ($c.R - $c.B) -ge 35) { $red++ }
      }
    }
    return [pscustomobject]@{ Red = $red; Total = $total }
  } finally { $bmp.Dispose() }
}

# ── 0. 选设备 ─────────────────────────────────────────────────────
if (-not $Serial) {
  $devices = @(adb devices | Select-String -Pattern '\sdevice$' | ForEach-Object { ($_ -split '\s+')[0] })
  if ($devices.Count -ne 1) { throw ('需要恰好一台设备在线，实测到 ' + $devices.Count + ' 台。用 -Serial 指定。') }
  $Serial = $devices[0]
}
Say ('设备：' + $Serial)

# ── 0.1 打开无障碍服务（让 Flutter 建语义树）⇒ 结束时还原 ────────
$a11yService = $Package + '/' + $Package + '.PrefrontalAccessibilityService'
$a11yBefore = (adb -s $Serial shell settings get secure enabled_accessibility_services 2>$null | Out-String).Trim()
adb -s $Serial shell settings put secure enabled_accessibility_services $a11yService | Out-Null
adb -s $Serial shell settings put secure accessibility_enabled 1 | Out-Null
Start-Sleep -Seconds 2

# ── 1. 读影子锁（**只进 HTTP 头，绝不打印**）────────────────────
$shadowKey = (adb -s $Serial shell ('run-as ' + $Package + ' cat files/shadow.key') 2>$null | Out-String).Trim()
if (-not $shadowKey) { throw ('读不到 files/shadow.key —— ' + $Package + ' 是 debuggable 的吗？') }
Say ('影子锁已取到（长度 ' + $shadowKey.Length + '，**不打印**）')

# ── 2. 起宿主端的「有门的端脑」桩 ─────────────────────────────────
$stubLog = Join-Path $OutDir 'stub-requests.jsonl'
$stubOut = Join-Path $OutDir 'stub-stdout.log'
$stubErr = Join-Path $OutDir 'stub-stderr.log'
if (Test-Path $stubLog) { Remove-Item $stubLog -Force }
$holders = @(Get-NetTCPConnection -LocalPort $StubPort -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($h in $holders) { if ($h -and $h -ne $PID) { try { Stop-Process -Id $h -Force -ErrorAction SilentlyContinue } catch { } } }
if ($holders.Count -gt 0) { Start-Sleep -Milliseconds 500 }
$env:A2UI_STUB_KEY = $shadowKey
$stub = Start-Process -FilePath 'node.exe' -ArgumentList @((Join-Path $repo 'scripts\a2ui-door-stub.mjs'), '--port', "$StubPort", '--log', $stubLog) -PassThru -NoNewWindow -RedirectStandardOutput $stubOut -RedirectStandardError $stubErr
$env:A2UI_STUB_KEY = $null
Say ('桩已拉起（pid ' + $stub.Id + '，端口 ' + $StubPort + '）')

$stubReady = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 300
  if ((Test-Path $stubOut) -and ((Get-Content $stubOut -Raw -ErrorAction SilentlyContinue) -match 'listening')) { $stubReady = $true; break }
}
if (-not $stubReady) { Say ('桩没起来：' + (Get-Content $stubErr -Raw -ErrorAction SilentlyContinue)); throw '桩没起来' }

# ── 3. 把设备上的 127.0.0.1:60080 通到宿主 ──────────────────────
adb -s $Serial reverse 'tcp:60080' ('tcp:' + $StubPort) | Out-Null
Say ('隧道：设备 127.0.0.1:60080 ⇒ 宿主 127.0.0.1:' + $StubPort)

# ── 4. 起 App，等内嵌大脑起来（端口每次随机）────────────────────
adb -s $Serial shell am force-stop $Package | Out-Null
Start-Sleep -Seconds 2
adb -s $Serial logcat -c
adb -s $Serial shell am start -n ($Package + '/' + $Activity) | Out-Null

$agentPort = $null
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  $line = adb -s $Serial logcat -d -v time 2>$null | Select-String -Pattern 'EncephalonRuntime.*agent surface:\s*(\d+)' | Select-Object -Last 1
  if ($line -and $line.Matches[0].Groups[1].Value) { $agentPort = [int]$line.Matches[0].Groups[1].Value; break }
}
if (-not $agentPort) {
  # ⚠️ **没起来也是一种合法前提**：agentPort 为 null ⇒ A2UI 地址**自动退回外部端脑**
  #    ⇒ 请求不带钥匙地打到 60080 ⇒ 门回 401 ⇒ **这正是要验的那条路**。
  Say '⚠️ 内嵌大脑没起来（端脑面端口读不到）⇒ agentPort 为 null ⇒ A2UI 会退回外部端脑（继续）'
} else {
  Say ('端脑面端口：' + $agentPort + '（内嵌大脑在跑）')
}

# ── 5. 先把 A2UI 页打开 + 把话打好（**这时不发**）───────────────
if (-not $SkipUi) {
  Say '打开「组件」页并把话打好（大脑还在跑 ⇒ 这时发会打到内嵌端脑 ⇒ 不发）'
  if (-not (OpenA2uiPage)) { throw '进不去 Agent2UI 页' }
  TypeMessage $Message
  Shot '01-typed' | Out-Null
}

# ── 6. 停掉内嵌大脑 ─────────────────────────────────────────────
$brainStopped = $false
if (-not $SkipStopBrain -and $agentPort) {
  Say '停掉内嵌大脑：设置 → 连接 → 嵌入式大脑 → 停止大脑'
  # ⚠️ **先收软键盘**：它会盖住底部导航 ⇒ 点「我」会打在键盘上 ⇒ 什么都没发生
  #    （实测踩过：表现为「切不过去、滚半天也找不到那一行」）。
  #    ⚠️ 语义树里底栏**照样报坐标**（键盘盖着它）⇒ 只能靠**屏幕**判断。
  if (-not (CloseKeyboard)) { Say '⚠️ 键盘没收起来' }
  TapText '第 4 个标签' | Out-Null
  Start-Sleep -Seconds 1
  # 确认真的在设置页（特征行「外观」），不在就再来一次。
  $onSettings = $false
  for ($i = 0; $i -lt 4; $i++) {
    if (FindByText '外观') { $onSettings = $true; break }
    CloseKeyboard | Out-Null
    TapText '第 4 个标签' | Out-Null
    Start-Sleep -Seconds 2
  }
  if (-not $onSettings) { throw '切不到设置页' }
  TapTextByScrolling '嵌入式大脑' | Out-Null
  try { TapText '停止大脑' | Out-Null } catch { Say ('⚠️ 找不到「停止大脑」按钮：' + $_.Exception.Message) }
  Start-Sleep -Seconds 3
  Shot '02-brain-stopped' | Out-Null
  # ⚠️ 判据取 **Kotlin 侧**那行（'Encephalon stopped'）：
  #    Dart 侧那句 '嵌入式大脑已停止' 走 package:logging ⇒ **不进 logcat**。
  $stopLine = (adb -s $Serial logcat -d 2>$null | Select-String -Pattern 'Encephalon stopped' | Select-Object -Last 1)
  if ($stopLine) { $brainStopped = $true; Say ('大脑已停：' + $stopLine.Line) }
  else { Say '⚠️ logcat 里没看到 Encephalon stopped ⇒ 大脑可能还在跑' }
}

# ── 7. 立刻回到 A2UI 页 ⇒ 发送（地址已退回外部端脑 ⇒ 401）──────
$redBefore = -1; $redAfter = -1
if (-not $SkipUi) {
  Say '回「组件」页并发送（**要快**：大脑约 20 秒后自己回来）'
  if (-not (OpenA2uiPage)) { throw '回不去 Agent2UI 页' }
  $before = Shot '03-a2ui-before'
  $rb = CountRed $before
  $redBefore = $rb.Red
  Say ('发之前，内容区红色像素：' + $redBefore + ' / ' + $rb.Total)
  TypeMessage $Message
  $send = FindSendButton
  if (-not $send) { throw '找不到发送键' }
  Write-Host ('  ▸ 点发送 @ ' + $send.X + ',' + $send.Y)
  adb -s $Serial shell input tap $send.X $send.Y | Out-Null
  Start-Sleep -Seconds 4
  $after = Shot '04-a2ui-failure'
  $ra = CountRed $after
  $redAfter = $ra.Red
  Say ('发之后，内容区红色像素：' + $redAfter + ' / ' + $ra.Total)
}

# ── 8. 桩日志：App 真的走这条路了吗（**归属**）──────────────────
# ⚠️ 探针的 reqId 是 'probe'，App 的 reqId 是 uuid ⇒ **必须分开**
#    ⇒ 否则「App 的请求没带钥匙」这条判据会被探针自己顶替（假绿）。
$appHit = $false; $appHitWithoutKey = $false; $appStatus = 0; $appHits = 0
if (Test-Path $stubLog) {
  foreach ($line in (Get-Content $stubLog -ErrorAction SilentlyContinue)) {
    if (-not $line.Trim()) { continue }
    try { $rec = $line | ConvertFrom-Json } catch { continue }
    if ($rec.url -like '/a2a*' -and $rec.reqId -ne 'probe') {
      $appHit = $true
      $appHits++
      $appStatus = $rec.status
      if (-not $rec.hasShadowKey) { $appHitWithoutKey = $true }
    }
  }
}
Say ('桩收到 /a2a：App 的请求 ' + $appHit + '（' + $appHits + ' 条，状态 ' + $appStatus + '）；其中**不带钥匙**的：' + $appHitWithoutKey)

# ── 9. 判据（机器可判）─────────────────────────────────────────
$brainAbsent = (-not $agentPort)
$checks = [ordered]@{
  '内嵌大脑不在跑 ⇒ 退回外部端脑' = ($brainStopped -or $brainAbsent)
  'App 的请求打到了外部端脑'    = $appHit
  'App 的请求**没带**影子锁'    = $appHitWithoutKey
  '门回了 401'                = ($appStatus -eq 401)
  '发之前内容区几乎没有红'      = ($redBefore -ge 0 -and $redBefore -lt 100)
  '发之后内容区出现红色'        = ($redAfter -ge ($redBefore + 200))
}
$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
foreach ($c in $checks.GetEnumerator()) {
  Say ('  ' + $(if ($c.Value) { 'OK ' } else { 'XX ' }) + $c.Key)
}
if ($failed.Count -gt 0) { Say ('没过：' + $failed.Count + ' 条') } else { Say '全过' }

# ── 10. 收尾：撤隧道、停桩、还原无障碍设置 ───────────────────────
adb -s $Serial reverse --remove 'tcp:60080' 2>$null | Out-Null
try { Stop-Process -Id $stub.Id -Force -ErrorAction SilentlyContinue } catch { }
if ($a11yBefore) {
  adb -s $Serial shell settings put secure enabled_accessibility_services $a11yBefore | Out-Null
} else {
  adb -s $Serial shell settings put secure enabled_accessibility_services '' | Out-Null
}
Say '（无障碍设置已还原）'

if ($failed.Count -gt 0) { exit 1 }
Say ''
Say '=> 真机上，失败态说了真话。'
exit 0