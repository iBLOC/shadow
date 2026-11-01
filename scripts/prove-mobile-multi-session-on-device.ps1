# 真机证明：移动端的「多会话」在真机上真的成立。
#
# 它证明四件事（每件都是**真机上的读数**，不是单元测试里的自述）：
#   1. 同一个叶区上的两条会话，在列表里**长得不一样** —— 标题取「用户自己说的
#      第一句话」，不是叶区名（叶区名挪到副标签了）。
#      ⇒ 旧行为：两条都显示叶区名 ⇒ ⇒ **分不出哪条是哪条**。
#   2. 消息数**不含**端脑存的那条「人设」轮次（它存成第一条 agent 轮次）。
#   3. 点开一条会话 ⇒ 对话页顶部那行「当前会话」显示的**就是那一条**
#      ⇒ ⇒ 切会话真的切了（旧行为：看到的还是当前那条）。
#   4. 从对话页**退回**列表 ⇒ 列表**重新拉过** ⇒ 新建的会话立刻出现、且排在最前。
#      ⇒ ⇒ 这条量的是「列表不会停在旧值」。
#      ⇒ ⇒ 排序判据是「**UI 顺序 == 服务端顺序**」（拿服务端给的顺序当基准，
#         不猜「谁该最前」）⇒ ⇒ 顺带量到服务端自己是不是真按 updated_at 倒序。
#
# ⚠️ 为什么用「导入会话」端点播种：POST /shadow/v1/conversations/{id}/import
#    能**直接写好历史** ⇒ ⇒ 不用调模型 ⇒ ⇒ 脚本快、也不依赖任何云端模型。
#
# ⚠️ 元素怎么找：**按文字**找（不是按像素猜）。Flutter 只有在有无障碍服务
#    连着时才建语义树 ⇒ ⇒ 脚本开头打开 App 自带的无障碍服务，结尾还原。
#    ⚠️ 定位到的坐标要**拆成两个参数**传给 input tap —— 写成 '540,1800'
#    会被 PowerShell 去掉逗号 ⇒ ⇒ 5401800 ⇒ 点到屏幕外 ⇒ **不报错、什么也没发生**。
#
# ⚠️ 收尾：脚本会**把自己播的会话从设备上清掉** —— 端脑**没有删会话的端点**
#    ⇒ ⇒ 只能改 App 私有目录里那个 conversations.json ⇒ ⇒ 停 App 之后重写它。
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
if (-not $OutDir) { $OutDir = Join-Path $repo 'artifacts\mobile-multi-session-device' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$uiLocal = Join-Path $OutDir 'ui-probe.xml'

function Say($msg) { Write-Output $msg }

if (-not $Tag) { $Tag = 'MS' + [guid]::NewGuid().ToString('N').Substring(0, 6) }
$titleA = $Tag + 'A 帮我把主题换成靛蓝'
$titleB = $Tag + 'B 明天几点开会'
$titleC = $Tag + 'C 刚建的那条会话'
$convA = 'probe-' + $Tag + '-a'
$convB = 'probe-' + $Tag + '-b'
$convC = 'probe-' + $Tag + '-c'

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

function Start-App {
  adb -s $Serial shell am force-stop $Package | Out-Null
  Start-Sleep -Seconds 2
  adb -s $Serial logcat -c
  # ⚠️ 屏幕必须醒着：锁屏时 MIUI 会冻结后台进程 ⇒ 端脑端口在但没人 accept。
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
  $localPort = 41000 + (Get-Random -Minimum 0 -Maximum 2000)
  adb -s $Serial forward ('tcp:' + $localPort) ('tcp:' + $agentPort) | Out-Null
  $script:base = 'http://127.0.0.1:' + $localPort
  return $localPort
}

function Probe($method, $path, $headers, $body) {
  $outFile = Join-Path $OutDir 'probe-out.txt'
  $a = @('-s', '-o', $outFile, '-w', '%{http_code}', '-X', $method, '--max-time', '25')
  foreach ($h in $headers) { $a += @('-H', $h) }
  if ($body) {
    # ⚠️ body 必须走文件（--data-binary @file）—— 直接把带引号的 JSON 当
    # 命令行参数传，Windows 的参数转义会把它弄坏 ⇒ 服务端收到残缺 JSON。
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
  return $false
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

# 会话卡片在语义树里是**一个合并节点**：文本 = 「<消息数> <标题> <副标签>」
# ⇒ ⇒ 消息数就是**首段数字**（实测：「2 MS57a254A 帮我把主题换成靛蓝 temporal · 0 分钟前」）。
function FindCountOf([string]$titleText) {
  foreach ($n in (DumpNodes)) {
    $t = (NodeText $n)
    if (-not $t) { continue }
    $t = ($t -replace '\s+', ' ')
    if (-not $t.Contains($titleText)) { continue }
    if ($t -notmatch '^(\d+)\s') { continue }
    return $matches[1]
  }
  return $null
}

# 一次 dump 里把「<标题> → 那张卡片在屏幕上的 Y」全取出来。
#
# ⚠️ 为什么必须**一次 dump**：分三次 dump 拿到的 Y 来自**三个不同时刻的屏幕**
#    ⇒ ⇒ 中间可能滚动过、页面可能变过 ⇒ ⇒ 拿它们比顺序 = 拿不同时刻比顺序。
# ⚠️ 为什么只认「<数字> <标题> …」形状：会话卡片在语义树里是**一个合并节点**
#    （文本 = 消息数 + 标题 + 副标签）⇒ ⇒ 别的节点不会以数字开头。
function FindCardYs([string[]]$titles) {
  $map = @{}
  foreach ($n in (DumpNodes)) {
    $t = NodeText $n
    if (-not $t) { continue }
    $t = ($t -replace '\s+', ' ')
    if ($t -notmatch '^\d+\s') { continue }
    $c = CenterOf $n.bounds
    if (-not $c) { continue }
    foreach ($title in $titles) {
      # ⚠️ 必须先确认**这张卡片真的含这个标题** ⇒ ⇒ 否则每个卡片节点都会把
      #    **自己的 Y 写给所有标题** ⇒ ⇒ 最后三条全拿到同一个 Y ⇒ ⇒ 排序
      #    退化成「原顺序」⇒ ⇒ 报出「A > B > C」这种**假顺序**。
      #    （2026-11-01 真机实测踩到：UI 顺序报成 A>B>C，而语义树里明明是
      #      C(420) > B(657) > A(894) ⇒ ⇒ 那是**判据的错**，不是产品的错。）
      if (-not $t.Contains($title)) { continue }
      if (-not $map.ContainsKey($title) -or $c[1] -lt $map[$title]) { $map[$title] = $c[1] }
    }
  }
  return $map
}
# 纯数字节点（会话卡片左边那个「消息数」圆牌）
function FindNumberNear([string]$titleText) {
  $nodes = DumpNodes
  $title = $null
  foreach ($n in $nodes) {
    $t = NodeText $n
    if ($t -and ($t -replace '\s+', ' ') -eq $titleText) { $title = $n; break }
  }
  if (-not $title) { return $null }
  $tc = CenterOf $title.bounds
  if (-not $tc) { return $null }
  $best = $null
  foreach ($n in $nodes) {
    $t = (NodeText $n)
    if (-not $t) { continue }
    if ($t -notmatch '^\d+$') { continue }
    $c = CenterOf $n.bounds
    if (-not $c) { continue }
    # 消息数在标题**左边**、同一行 ⇒ 取 x 更小、y 相近的那个
    if ($c[0] -ge $tc[0]) { continue }
    $dy = [math]::Abs($c[1] - $tc[1])
    if ($dy -gt 120) { continue }
    $dist = ($tc[0] - $c[0]) + $dy
    if (-not $best -or $dist -lt $best.Dist) {
      $best = [pscustomobject]@{ Value = $t; X = $c[0]; Y = $c[1]; Dist = $dist }
    }
  }
  return $best
}

# ── (0) 启动 App、取端脑端口、取钥匙 ─────────────────────────────────────
Say ''
Say '(0) 启动 App ⇒ 取端脑面端口'
$agentPort = Start-App
if (-not $agentPort) {
  Say '没读到端脑面端口 ⇒ 什么都没探到。'
  if ($a11yBefore) {
    adb -s $Serial shell settings put secure enabled_accessibility_services $a11yBefore | Out-Null
  } else {
    adb -s $Serial shell settings put secure enabled_accessibility_services '' | Out-Null
  }
  exit 2
}
$null = Forward-Port $agentPort
Say ('   端脑面端口：' + $agentPort + ' ⇒ ' + $script:base)

$shadowKey = (adb -s $Serial shell ('run-as ' + $Package + ' cat files/shadow.key') 2>$null | Out-String).Trim()
if (-not $shadowKey) {
  Say '读不到 shadow key ⇒ 什么都没探到。'
  exit 2
}
$SH = @('X-Shadow-Key: ' + $shadowKey)

$list = Probe 'GET' '/shadow/v1/conversations' $SH $null
Check '端脑会话面可读' ($list.Status -eq 200) ('HTTP ' + $list.Status)
if ($list.Status -ne 200) { exit 2 }

# ── (1) 播种两条同叶区、但第一句话不同的会话 ────────────────────────────
Say ''
Say '(1) 播种两条会话（同一个叶区 temporal，第一句话不同）'
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$seedA = Seed-Conversation $convA 'temporal' @(
  @{ role = 'agent'; text = '[system] 你是影'; timestamp = $now },
  @{ role = 'user'; text = $titleA; timestamp = $now },
  @{ role = 'agent'; text = '好，换好了'; timestamp = $now }
)
Check '播种会话 A' ($seedA.Status -eq 200) ('HTTP ' + $seedA.Status + ' body=' + $seedA.Body)
$seedB = Seed-Conversation $convB 'temporal' @(
  @{ role = 'user'; text = $titleB; timestamp = $now }
)
Check '播种会话 B' ($seedB.Status -eq 200) ('HTTP ' + $seedB.Status + ' body=' + $seedB.Body)
if ($seedA.Status -ne 200 -or $seedB.Status -ne 200) { exit 2 }

# ── (2) 进会话管理页 ─────────────────────────────────────────────────────
Say ''
Say '(2) 进会话管理页'
if (-not (EnsureAppForeground)) {
  Say '拉不起 App 前台 ⇒ 什么都没探到。'
  exit 2
}
try {
  $null = TapText '会话管理'
} catch {
  Say ('进不去会话管理页：' + $_.Exception.Message)
  exit 2
}
Start-Sleep -Seconds 2

# ── (3) 两条同叶区会话的标题**不一样**（标题派生在真机上成立）────────────
Say ''
Say '(3) 列表上的标题'
$hitA = FindByText $titleA
$hitB = FindByText $titleB
Check '会话 A 的标题是「用户第一句话」' ([bool]$hitA) ('语义树里找不到「' + $titleA + '」')
Check '会话 B 的标题是「用户第一句话」' ([bool]$hitB) ('语义树里找不到「' + $titleB + '」')
# 旧行为下两条都只显示叶区名 ⇒ ⇒ 这两个标题**一个都不在** ⇒ ⇒ 这两条断言
# 就是「标题派生真的在真机上跑」的直接证据。

# ── (4) 消息数不含「人设那条」───────────────────────────────────────────
Say ''
Say '(4) 消息数（A 有 3 条轮次，其中 1 条是人设 ⇒ 数出来应是 2）'
$count = FindCountOf $titleA
if ($null -eq $count) {
  Note '消息数不含人设那条' '语义树里定位不到那张卡片的首段数字'
} else {
  Check '消息数不含人设那条' ($count -eq '2') ('数出来是 ' + $count + '（旧行为会是 3）')
}

# ── (5) 点开 B ⇒ 对话页顶部「当前会话」显示的就是 B ─────────────────────
Say ''
Say '(5) 点开会话 B ⇒ 对话页那行「当前会话」'
try {
  $null = TapText $titleB
} catch {
  Note '切到会话 B' $_.Exception.Message
}
Start-Sleep -Seconds 3
$header = FindByText ($titleB + ' · temporal')
Check '对话页顶部显示的就是 B（切会话真的切了）' ([bool]$header) ('语义树里找不到「' + $titleB + ' · temporal」')

# ── (6) 退回列表 ⇒ 列表重新拉过 ⇒ 新建的会话立刻出现且排在最前 ──────────
Say ''
Say '(6) 建一条新会话 ⇒ 退回列表 ⇒ 它必须立刻出现（列表不陈旧）'
$seedC = Seed-Conversation $convC 'temporal' @(
  @{ role = 'user'; text = $titleC; timestamp = $now }
)
Check '在端脑上建会话 C' ($seedC.Status -eq 200) ('HTTP ' + $seedC.Status)
try {
  $null = TapText '返回'
} catch {
  Note '退回列表' ('点不到「返回」：' + $_.Exception.Message)
}
Start-Sleep -Seconds 3
$hitC = FindByText $titleC
Check '退回列表后新会话立刻出现（列表不陈旧）' ([bool]$hitC) ('语义树里找不到「' + $titleC + '」⇒ 列表停在旧值')

# ── 排序判据：**不猜**「谁应该最前」⇒ ⇒ 拿**服务端给的顺序**当基准 ────────
# ⚠️ 上一版写的是「最上面那条的文本**以标题开头**」⇒ ⇒ 但会话卡片在语义树里
#    是**一个合并节点**，文本 = 「<消息数> <标题> <副标签>」⇒ ⇒ 锚在标题开头
#    **永远不成立** ⇒ ⇒ 那是**判据自己的错**，不是产品缺陷。
#    （2026-11-01 离线复核上轮留下的 ui-probe.xml：C/B/A 的 Y = 420/657/893
#      ⇒ ⇒ **C 本来就在最前** ⇒ ⇒ 产品是对的 ⇒ ⇒ 那条红是**假红**。）
$map = FindCardYs @($titleA, $titleB, $titleC)
# ⚠️ 必须先**包成数组**再过滤：@($a, $b, $c | Where-Object {...}) 里的管道
#    **只作用最后一个元素** ⇒ ⇒ $a / $b 根本没进过滤。
$present = @(@($titleA, $titleB, $titleC) | Where-Object { $map.ContainsKey($_) })
$uiOrder = @($present | Sort-Object { $map[$_] } | ForEach-Object { $_ })
$labels = @{ $titleA = 'A'; $titleB = 'B'; $titleC = 'C' }
$uiShort = @($uiOrder | ForEach-Object { $labels[$_] })
Say ('   UI 顺序（我们这三条，按屏幕上下）：' + ($uiShort -join ' > '))

$serverOk = $false
$updatedDesc = $true
$prev = [DateTimeOffset]::MaxValue
$serverShort = @()
$list2 = Probe 'GET' '/shadow/v1/conversations' $SH $null
if ($list2.Status -eq 200) {
  try {
    $all = ConvertFrom-Json $list2.Body
    $id2title = @{ $convA = $titleA; $convB = $titleB; $convC = $titleC }
    $mine = @($all | Where-Object { $id2title.ContainsKey([string]$_.id) })
    foreach ($c in $mine) {
      $cid = [string]$c.id
      $ttl = [string]$id2title[$cid]
      $serverShort += $labels[$ttl]
      $u = [DateTimeOffset]::Parse([string]$c.updated_at)
      Say ('   服务端 updated_at：' + $labels[$ttl] + ' = ' + $u.ToString('o'))
      if ($u -gt $prev) { $updatedDesc = $false }
      $prev = $u
    }
    $serverOk = $true
  } catch {
    Note '服务端会话顺序' ('解析列表失败：' + $_.Exception.Message)
  }
} else {
  Note '服务端会话顺序' ('HTTP ' + $list2.Status)
}
Say ('   服务端顺序（我们这三条）：' + ($serverShort -join ' > '))
if ($serverOk) {
  Check '服务端会话列表按 updated_at 倒序' $updatedDesc '服务端这三条的 updated_at 不是倒序'
  Check '列表顺序与服务端一致' (($uiShort -join '|') -eq ($serverShort -join '|')) ('UI=[' + ($uiShort -join ' > ') + '] 服务端=[' + ($serverShort -join ' > ') + ']')
  Check '我们这三条里最新的一条排在最前' ($uiShort.Count -gt 0 -and $uiShort[0] -eq 'C') ('最上面是我们这三条里的 ' + $(if ($uiShort.Count -gt 0) { $uiShort[0] } else { '?' }))
} else {
  Note '列表顺序与服务端一致' '服务端顺序读不出来 ⇒ 判不了'
  Note '我们这三条里最新的一条排在最前' '服务端顺序读不出来 ⇒ 判不了'
}

# ── (7) 收尾：把自己播的会话从设备上清掉 ───────────────────────────────
Say ''
Say '(7) 收尾：把脚本播的三条会话从设备上清掉'
adb -s $Serial shell am force-stop $Package | Out-Null
Start-Sleep -Seconds 2
$storeRel = 'files/shadow/conversations.json'
$raw = (adb -s $Serial shell ('run-as ' + $Package + ' cat ' + $storeRel) 2>$null | Out-String)
$mine = @($convA, $convB, $convC)
try {
  $all = ConvertFrom-Json $raw
  $kept = @($all | Where-Object { $mine -notcontains $_.id })
  if ($kept.Count -eq $all.Count) {
    Say '（没找到自己播的会话 ⇒ 不用清）'
  } else {
    $json = ConvertTo-Json -InputObject $kept -Depth 8
    $local = Join-Path $OutDir 'conversations-clean.json'
    [IO.File]::WriteAllText($local, $json, (New-Object Text.UTF8Encoding($false)))
    Get-Content $local -Raw | adb -s $Serial shell ('run-as ' + $Package + " sh -c 'cat > " + $storeRel + "'") | Out-Null
    $after = (adb -s $Serial shell ('run-as ' + $Package + ' cat ' + $storeRel) 2>$null | Out-String)
    $left = 0
    foreach ($id in $mine) { if ($after.Contains($id)) { $left++ } }
    Check '设备上不剩脚本播的会话' ($left -eq 0) ('还剩 ' + $left + ' 条')
  }
} catch {
  Note '清理自己播的会话' ('解析/写回失败：' + $_.Exception.Message)
}

# ── 汇总 ────────────────────────────────────────────────────────────────
Say ''
$red = @($script:results | Where-Object { -not $_.Ok })
Say ('读数：' + $script:results.Count + ' 条，' + $red.Count + ' 红')
if ($a11yBefore) {
  adb -s $Serial shell settings put secure enabled_accessibility_services $a11yBefore | Out-Null
} else {
  adb -s $Serial shell settings put secure enabled_accessibility_services '' | Out-Null
}
adb -s $Serial shell settings put secure accessibility_enabled 0 | Out-Null
Say '（无障碍设置已还原）'
if ($red.Count -gt 0) {
  Say '⇒ 有红。'
  exit 1
}
Say '⇒ 全绿。'
exit 0
