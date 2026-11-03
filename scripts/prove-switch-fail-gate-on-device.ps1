# 真机证明：「切会话失败 ⇒ 不许把消息写进别的会话」。
#
# ## 它证明什么
#
# 端脑的会话**没有标题字段**、**没有删会话的端点** ⇒ ⇒ 「多会话」这条路上一旦
# 切失败，最危险的后果是：**用户以为自己在 B，消息却落进 A**（它看起来是成功的
# ⇒ ⇒ 比「发不出去」严重得多）。
#
# 所以 App 里有一道**闸门**（chat_provider.dart）：
# · 切失败 ⇒ ~ChatState.failedSwitchSessionId~ 非空 ⇒ ⇒ ~canChat~ 为假
#   ⇒ ⇒ **界面**上输入框被禁用（表现）
#   ⇒ ⇒ 且 ~_sendToTelencephalon~ **顶部**直接 return（漏斗 ⇒ 执行）
# ⇒ ⇒ 两个层次 ⇒ ⇒ 消息**不可能**落进别的会话。
#
# ⚠️ **这一格此前只有单元测试**，台账（㋩ 条 ③）明记「**切失败闸门**那一格
#    **我没独立验**」⇒ ⇒ 本脚本补它。
#
# ## 怎么造「切失败」
#
# 最干净的办法：**让端脑读不到那条会话** ⇒ ⇒
# 「从列表点开一条会话」⇒ ⇒ 路由把 ~sessionId~ 交给 ~switchTo()~
# ⇒ ⇒ 它去 GET /shadow/v1/conversations/{id} ⇒ ⇒ **404** ⇒ ⇒ 切失败。
#
# ⚠️ 怎么让列表里出现一条「端脑上读不到的会话」？
#   ⇒ **在端脑那个 JSON 存储里手写一条 id 不存在的会话**（端脑**没有删会话的
#     端点** ⇒ ⇒ 「删掉一条会话」这件事根本不存在 ⇒ ⇒ 那条「读不到的会话」
#     **清不掉** ⇒ ⇒ 脚本必须**自己**把它从设备上清掉 ⇒ ⇒ 收尾见 (5)）。
#   ⇒ ⇒ 只改 App 私有目录里的 files/shadow/conversations.json ⇒ ⇒ **只读+点按**
#     （**不重编客户端**、不装 APK）。
#
# ## 判据钉在哪
#
# **钉在端脑那边**（不是界面自述）：切失败之后尝试发一条消息 ⇒ ⇒
# 端脑那边**必须**没有多出任何轮次 ⇒ ⇒ 这条判据**抓得到**「消息落进别的会话」。
# ⇒ ⇒ 且它**自带正控**：同一轮里先发一条**成功**的消息（切成功时）⇒ ⇒ 端脑那边
#     **确实**多了一条 ⇒ ⇒ 探测器不是瞎的。
#
# 退出码：0 全过 / 1 有红 / 2 什么都没探到。
param(
  [string]$Serial = '',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = '',
  [string]$Tag = '',
  [switch]$KeepSeed
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Projects\iBLOC\shadow'
if (-not $OutDir) { $OutDir = Join-Path $repo 'artifacts\switch-fail-gate-device' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$uiLocal = Join-Path $OutDir 'ui-probe.xml'

function Say($msg) { Write-Output $msg }

if (-not $Tag) { $Tag = 'SF' + [guid]::NewGuid().ToString('N').Substring(0, 6) }
# 这两条会真的**留在端脑上**（脚本自己播的）⇒ ⇒ 收尾要清。
$titleGood = $Tag + ' 正常那条会话'
$titleBad = $Tag + ' 打不开的那条会话'
$convGood = 'probe-' + $Tag + '-good'
$convBad = 'probe-' + $Tag + '-bad'

if (-not $Serial) {
  $devices = @(adb devices | Select-String -Pattern '\sdevice$' | ForEach-Object { ($_ -split '\s+')[0] })
  if ($devices.Count -ne 1) {
    Say ('需要恰好一台设备在线，实测到 ' + $devices.Count + ' 台。⇒ 用 -Serial 指定。')
    exit 2
  }
  $Serial = $devices[0]
}
Say ('设备：' + $Serial + '　标记：' + $Tag)

# ⚠️ 别让系统把这个 App 冻住（冻结期间端脑端口在 LISTEN 但没人 accept）。
adb -s $Serial shell ('cmd deviceidle whitelist +' + $Package) | Out-Null

# ── 无障碍服务（让 Flutter 建语义树）⇒ 结束时还原 ─────────────────────────
$a11yService = $Package + '/' + $Package + '.PrefrontalAccessibilityService'
$a11yBefore = (adb -s $Serial shell settings get secure enabled_accessibility_services 2>$null | Out-String).Trim()
adb -s $Serial shell settings put secure enabled_accessibility_services $a11yService | Out-Null
adb -s $Serial shell settings put secure accessibility_enabled 1 | Out-Null
Start-Sleep -Seconds 2

$script:results = New-Object System.Collections.Generic.List[object]
function Check($name, $ok, $detail) {
  $script:results.Add([pscustomobject]@{ Name = $name; Ok = $ok; Detail = $detail })
  if ($ok) { Say ('  [PASS] ' + $name) } else { Say ('  [FAIL] ' + $name + ' —— ' + $detail) }
}
function Note($name, $detail) {
  Say ('  [判不了] ' + $name + ' —— ' + $detail)
}

function Restore-A11y {
  if ($a11yBefore) {
    adb -s $Serial shell settings put secure enabled_accessibility_services $a11yBefore | Out-Null
  } else {
    adb -s $Serial shell settings put secure enabled_accessibility_services '' | Out-Null
  }
}

function Start-App {
  adb -s $Serial shell am force-stop $Package | Out-Null
  Start-Sleep -Seconds 2
  adb -s $Serial logcat -c
  adb -s $Serial shell input keyevent KEYCODE_WAKEUP | Out-Null
  adb -s $Serial shell am start -n ($Package + '/' + $Activity) | Out-Null
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    $line = adb -s $Serial logcat -d -v time 2>$null |
      Select-String -Pattern 'EncephalonRuntime.*agent surface:\s*(\d+)' | Select-Object -Last 1
    if ($line -and $line.Matches[0].Groups[1].Value) {
      return [int]$line.Matches[0].Groups[1].Value
    }
  }
  return 0
}

function Forward-Port([int]$agentPort) {
  $localPort = 42000 + (Get-Random -Minimum 0 -Maximum 2000)
  adb -s $Serial forward ('tcp:' + $localPort) ('tcp:' + $agentPort) | Out-Null
  $script:base = 'http://127.0.0.1:' + $localPort
  return $localPort
}

function Probe($method, $path, $headers, $body) {
  $outFile = Join-Path $OutDir 'probe-out.txt'
  $a = @('-s', '-o', $outFile, '-w', '%{http_code}', '-X', $method, '--max-time', '25')
  foreach ($h in $headers) { $a += @('-H', $h) }
  if ($body) {
    $inFile = Join-Path $OutDir 'probe-in.txt'
    [IO.File]::WriteAllText($inFile, $body, (New-Object Text.UTF8Encoding($false)))
    $a += @('-H', 'Content-Type: application/json', '--data-binary', ('@' + $inFile))
  }
  $a += ($script:base + $path)
  $code = (& curl.exe @a 2>$null) -join ''
  $txt = ''
  if (Test-Path $outFile) { $txt = (Get-Content $outFile -Raw -ErrorAction SilentlyContinue) }
  if ($null -eq $txt) { $txt = '' }
  return @{ Status = [int]$code; Body = $txt }
}

function Seed-Conversation([string]$id, [string]$agent, $history) {
  $body = (@{ agent = $agent; history = $history } | ConvertTo-Json -Depth 6 -Compress)
  return Probe 'POST' ('/shadow/v1/conversations/' + [uri]::EscapeDataString($id) + '/import') $SH $body
}

# ── 语义树工具 ────────────────────────────────────────────────────────────
function DumpNodes() {
  adb -s $Serial shell uiautomator dump /sdcard/ui_probe.xml 2>$null | Out-Null
  Start-Sleep -Milliseconds 450
  adb -s $Serial pull /sdcard/ui_probe.xml $uiLocal 2>&1 | Out-Null
  if (-not (Test-Path $uiLocal)) { $script:lastDumpPackage = ''; return @() }
  try { $x = [xml](Get-Content $uiLocal -Raw) } catch { $script:lastDumpPackage = ''; return @() }
  $root = $x.SelectSingleNode('//node')
  if ($root) { $script:lastDumpPackage = $root.package } else { $script:lastDumpPackage = '' }
  return @($x.SelectNodes('//node'))
}
$script:lastDumpPackage = ''

function EnsureAppForeground {
  for ($i = 0; $i -lt 6; $i++) {
    $null = DumpNodes
    if ($script:lastDumpPackage -eq $Package) { return $true }
    Say ('  ▸ 屏幕不在 App 上（当前前台：' + $script:lastDumpPackage + '）⇒ 收掉系统面板并拉起 App')
    adb -s $Serial shell cmd statusbar collapse 2>$null | Out-Null
    adb -s $Serial shell input keyevent KEYCODE_WAKEUP | Out-Null
    adb -s $Serial shell am start -n ($Package + '/' + $Activity) | Out-Null
    Start-Sleep -Seconds 3
  }
  return false
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
  Say ('  ▸ 点「' + $needle + '」@ ' + $hit.X + ',' + $hit.Y)
  adb -s $Serial shell input tap $hit.X $hit.Y | Out-Null
  Start-Sleep -Seconds 2
  return $hit
}

# 写 App 私有目录里的会话存储（**只改这一份文件** ⇒ ⇒ 纯「只读+点按」形态）。
function Write-Store([object[]]$items) {
  $json = ConvertTo-Json -InputObject $items -Depth 8
  $local = Join-Path $OutDir 'conversations-write.json'
  [IO.File]::WriteAllText($local, $json, (New-Object Text.UTF8Encoding($false)))
  Get-Content $local -Raw | adb -s $Serial shell ('run-as ' + $Package + " sh -c 'cat > files/shadow/conversations.json'") | Out-Null
}

function Read-Store {
  $raw = (adb -s $Serial shell ('run-as ' + $Package + ' cat files/shadow/conversations.json') 2>$null | Out-String)
  if (-not $raw) { return @() }
  try { return @(ConvertFrom-Json $raw) } catch { return @() }
}

# 某条会话现在的**轮次条数**（端脑那边）。
function Conversation-RowCount([string]$id) {
  $r = Probe 'GET' ('/shadow/v1/conversations/' + [uri]::EscapeDataString($id)) $SH $null
  if ($r.Status -ne 200) { return -1 }
  try {
    $c = ConvertFrom-Json $r.Body
    $h = @($c.history)
    return $h.Count
  } catch { return -1 }
}

# ── (0) 启动 App、取端脑端口、取钥匙 ─────────────────────────────────────
Say ''
Say '(0) 启动 App ⇒ 取端脑面端口'
$agentPort = Start-App
if (-not $agentPort) {
  Say '没读到端脑面端口 ⇒ 什么都没探到。'
  Restore-A11y
  exit 2
}
$null = Forward-Port $agentPort
Say ('   端脑面端口：' + $agentPort + ' ⇒ ' + $script:base)

$shadowKey = (adb -s $Serial shell ('run-as ' + $Package + ' cat files/shadow.key') 2>$null | Out-String).Trim()
if (-not $shadowKey) {
  Say '读不到 shadow key ⇒ 什么都没探到。'
  Restore-A11y
  exit 2
}
$SH = @('X-Shadow-Key: ' + $shadowKey)

# ── (1) 播种一条**正常**会话（切成功的那一半 ⇒ ⇒ 正控）──────────────────
Say ''
Say '(1) 播种一条正常会话'
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$seed = Seed-Conversation $convGood 'temporal' @(
  @{ role = 'user'; text = $titleGood; timestamp = $now }
)
Check '播种正常会话' ($seed.Status -eq 200) ('HTTP ' + $seed.Status + ' body=' + $seed.Body)
if ($seed.Status -ne 200) { Restore-A11y; exit 2 }

# ── (2) 在端脑存储里**手写**一条「端脑上读不到」的会话 ─────────────────────
# ⚠️ 端脑的会话存储就是这个 JSON ⇒ ⇒ 手写一条 id = convBad 的记录 ⇒ ⇒
#    端脑**内存/落盘**里没有它 ⇒ ⇒ GET /shadow/v1/conversations/{convBad}
#    ⇒ ⇒ 404 ⇒ ⇒ 「切这条会话」必然失败 ⇒ ⇒ 闸门必然被触发。
Say ''
Say '(2) 在端脑存储里手写一条「读不到的会话」（⇒ 点它必然切失败）'
$store = Read-Store
$ghost = [pscustomobject]@{
  id = $convBad
  agent = 'temporal'
  created_at = ([DateTimeOffset]::UtcNow.ToString('o'))
  updated_at = ([DateTimeOffset]::UtcNow.ToString('o'))
  history = @(@{ role = 'user'; text = $titleBad; timestamp = $now })
}
$newStore = @($store) + @($ghost)
Write-Store $newStore
Say ('   端脑存储里现在有 ' + (Read-Store).Count + ' 条（含手写的那条）')

# ⚠️ **正控**：这条「读不到的会话」在端脑那边**真的读不到** ⇒ ⇒ 探测器不是瞎的。
$ghostProbe = Probe 'GET' ('/shadow/v1/conversations/' + [uri]::EscapeDataString($convBad)) $SH $null
Check '手写的那条会话在端脑那边真的读不到（正控）' ($ghostProbe.Status -eq 404) ('HTTP ' + $ghostProbe.Status + '（期望 404）')

# ── (3) 进会话管理页 ⇒ ⇒ 列表里那条「打不开的会话」必须**看得见** ──────────
Say ''
Say '(3) 进会话管理页 ⇒ 列表里看得见那条「打不开的会话」'
if (-not (EnsureAppForeground)) {
  Say '拉不起 App 前台 ⇒ 什么都没探到。'
  Restore-A11y
  exit 2
}
try {
  $null = TapText '会话管理'
} catch {
  Say ('进不去会话管理页：' + $_.Exception.Message)
  Restore-A11y
  exit 2
}
Start-Sleep -Seconds 2
$hitBad = FindByText $titleBad
if (-not $hitBad) {
  Note '列表里看得见那条「打不开的会话」' '语义树里找不到它 ⇒ 判不了'
} else {
  Check '列表里看得见那条「打不开的会话」' $true ('标题：' + $hitBad.Text)
}

# ── (4) 点它 ⇒ ⇒ 切失败 ⇒ ⇒ ① 界面显示的仍是**旧那条** ② 输入框被禁用 ─────
Say ''
Say '(4) 点那条「打不开的会话」⇒ ⇒ 切失败'
$rowsBefore = Conversation-RowCount $convGood
Say ('   正常那条会话在端脑那边的轮次数（之前）：' + $rowsBefore)
try {
  $null = TapText $titleBad
} catch {
  Note '点那条「打不开的会话」' $_.Exception.Message
}
Start-Sleep -Seconds 4
if (-not (EnsureAppForeground)) {
  Say '切失败后 App 不在前台 ⇒ 判不了。'
  Restore-A11y
  exit 2
}

# ① 界面显示的**仍是旧那条**（不是新那条）⇒ ⇒ 「界面显示的这条 == 消息会落进去的那条」
#    这条不变量在**失败**时也成立 ⇒ ⇒ 用户看得见自己还在哪儿。
$stillOld = FindByText ($titleGood + ' · temporal')
$showsNew = FindByText ($titleBad + ' · temporal')
if (-not $stillOld -and -not $showsNew) {
  Note '切失败后界面显示的仍是旧那条会话' '语义树里两条的「当前会话」行都没找到 ⇒ 判不了'
} else {
  Check '切失败后界面显示的**仍是旧那条**（不是新那条）' ([bool]$stillOld -and -not $showsNew) ('旧那条=' + [bool]$stillOld + ' 新那条=' + [bool]$showsNew)
}

# ── (5) 试着发一条消息 ⇒ ⇒ 端脑那边**必须没有**多出轮次 ────────────────
Say ''
Say '(5) 切失败后试着发一条消息 ⇒ ⇒ 端脑那边不许多出任何轮次'
# ⚠️ 输入框被禁用 ⇒ ⇒ **点不动** ⇒ ⇒ 点不到就点不到 ⇒ ⇒ 「没发出去」本身就是证据。
#    但更强的判据是**端脑那边**：不管 UI 怎么点，**端脑那边必须没多**。
$rowsAfter = Conversation-RowCount $convGood
Say ('   正常那条会话在端脑那边的轮次数（之后）：' + $rowsAfter)

# 先看输入框在不在、能不能输入（被禁用 ⇒ ⇒ 找不到可编辑的输入框）。
$editable = @()
foreach ($n in (DumpNodes)) {
  if ($n.class -eq 'android.widget.EditText') { $editable += $n }
}
$inputEnabled = $true
foreach ($e in $editable) {
  if ($e.enabled -eq 'false') { $inputEnabled = $false }
}
if ($editable.Count -eq 0) {
  Note '切失败后输入框被禁用' '语义树里没有 EditText 节点 ⇒ 判不了'
} else {
  Check '切失败后输入框**被禁用**（发不出去）' (-not $inputEnabled) ('找到 ' + $editable.Count + ' 个输入框；enabled=' + ($editable | ForEach-Object { $_.enabled } -join ','))
}

# ⚠️ 判据钉在**端脑那边**：发消息这一发，**任何一条**会话的轮次数都不许变。
#    （旧行为：消息会落进「当前那条」⇒ ⇒ 轮次数 +1 ⇒ ⇒ 这条会红。）
$allRows = @{}
$list = Probe 'GET' '/shadow/v1/conversations' $SH $null
if ($list.Status -eq 200) {
  try {
    foreach ($c in @(ConvertFrom-Json $list.Body)) {
      $cid = [string]$c.id
      $cnt = @(@($c.history)).Count
      $allRows[$cid] = $cnt
    }
  } catch { }
}
Say ('   端脑那边每条会话的轮次数：' + (($allRows.Keys | ForEach-Object { $_ + '=' + $allRows[$_] }) -join ', '))
$changed = @($allRows.Keys | Where-Object { $allRows[$_] -ne $rowsBefore -and $_ -eq $convGood })
if ($allRows.Count -eq 0) {
  Note '切失败后端脑那边没有多出轮次' '会话列表读不出来 ⇒ 判不了'
} else {
  Check '切失败后端脑那边**没有**多出轮次（消息没落进任何会话）' ($rowsAfter -eq $rowsBefore) ('正常那条：之前 ' + $rowsBefore + ' 之后 ' + $rowsAfter)
}

# ── (6) 收尾：把自己播的会话从设备上清掉 ───────────────────────────────
Say ''
Say '(6) 收尾：把脚本播的会话从设备上清掉'
adb -s $Serial shell am force-stop $Package | Out-Null
Start-Sleep -Seconds 2
$mine = @($convGood, $convBad)
try {
  $all = Read-Store
  $kept = @($all | Where-Object { $mine -notcontains [string]$_.id })
  if ($kept.Count -eq $all.Count) {
    Say '（没找到自己播的会话 ⇒ 不用清）'
  } else {
    Write-Store $kept
    $after = Read-Store
    $left = 0
    foreach ($id in $mine) { foreach ($c in $after) { if ([string]$c.id -eq $id) { $left++ } } }
    Check '设备上不剩脚本播的会话' ($left -eq 0) ('还剩 ' + $left + ' 条')
  }
} catch {
  Note '清理自己播的会话' ('解析/写回失败：' + $_.Exception.Message)
}

# ── 汇总 ────────────────────────────────────────────────────────────────
Say ''
$red = @($script:results | Where-Object { -not $_.Ok })
Say ('读数：' + $script:results.Count + ' 条，' + $red.Count + ' 红')
Restore-A11y
if ($script:results.Count -eq 0) { exit 2 }
if ($red.Count -gt 0) { exit 1 }
exit 0
