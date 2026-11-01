# 真机证明：**切会话失败 ⇒ 消息不许落进另一条会话**（用户能感知的那一层）。
#
# ## 这条脚本补的是什么洞
#
# ㋠ 条（2026-11-01）治的病：「切会话失败」会**静默把消息写进**另一条**会话**
# ⇒ ⇒ 用户以为自己在 B、消息却落进 A ⇒ ⇒ **失败长得像成功**。
# ⇒ ⇒ 修法是**两层**：
#   ① **UI 层**：canChat 变假 ⇒ ⇒ 输入框与发送键**禁用** ⇒ ⇒ 用户**根本发不出去**；
#   ② **provider 兜底**：_sendToTelencephalon 顶部守卫 ⇒ ⇒ 一条都不写。
# ⇒ ⇒ ② 是 Dart 层、**已有单测钉住** ⇒ ⇒ 真机上**能验的是 ①** ⇒ ⇒ 本脚本量 ①，
#    并在**服务端那边**查**终局**（一条都没落）。
#
# ## 失败怎么注入（真机上没有别的办法）
#
# ① 「列表刷新失败 ⇒ 列表被**错误页**顶掉」⇒ ⇒ 把端脑停掉之后用户就**点不到**
#    那条会话了 ⇒ ⇒ 注入不进去；
# ② 端脑**没有删会话的端点**、会话存储是**内存里的**（load_from_db 只在开机时
#    跑一次）⇒ ⇒ 没法造出「列表里有、而服务端取不到」；
# ③ 手机**没有 root** ⇒ ⇒ 不能用 iptables 打断请求。
#
# ⇒ 所以端脑那一侧由一台**宿主端替身**（scripts/switch-failure-stub.mjs）扮演：
#    App 切到「外部端脑」形态（配置里写地址 + 用户喊停 ⇒ 不自动起内嵌大脑）
#    ⇒ ⇒ 客户端指着 `127.0.0.1:<port>` ⇒ ⇒ adb reverse 把它接到宿主那台替身
#    ⇒ ⇒ 替身给列表、给 A、**给 B 回 404**。
#    ⇒ ⇒ 那个 404 的**响应体是从真端脑抓的原样**（真端脑对不存在会话的响应）
#    ⇒ ⇒ 客户端看到的与「服务端真的找不到这条会话」**一模一样**。
#
# ⚠️ **为什么不能用「真端脑 + 代理转发」**：真端脑在手机上**跑在 App 进程里**
#    ⇒ ⇒ App 一旦切到「外部端脑」形态，内嵌大脑就**不启动** ⇒ ⇒ 真端脑不在跑
#    ⇒ ⇒ 代理转发给一个**死端口** ⇒ ⇒ 列表拉不到（2026-11-01 真机实测踩到）。
#
# ⇒ ⇒ 被验的是**客户端这一侧**：路由 → **真实 HTTP client** → **真 404**
#    ⇒ ⇒ 闸门 ⇒ ⇒ **真实控件树** ⇒ ⇒ 真机屏幕；
#    端脑那一侧由端脑自己的用例表覆盖。
#
# ## 读数（每段都有**正控**）
#
# 1. 列表读得到（替身给的会话面）。
# 2. **正控**：切到 A **成功** ⇒ ⇒ 输入框 enabled=true、当前会话 = A
#    ⇒ ⇒ 证明「输入框禁用」这个信号**有分辨力**。
# 3. 切到 B **失败** ⇒ ⇒ 界面出现「**错误：…404…**」⇒ ⇒ 不是装作切成功。
# 4. 切失败后「当前会话」**仍是 A** ⇒ ⇒ 用户看得见自己还在哪儿。
# 5. 切失败后输入框 enabled=false ⇒ ⇒ 用户**发不出去**。
# 6. 切失败后**发送键 enabled=false 且 clickable=false** ⇒ ⇒ 用户**按不动发送**
#    （输入框与发送键两个节点**都**翻成 disabled ⇒ ⇒ 两个独立的可观测）。
# 7. **终局**：服务端那边**一条写请求都没有** ⇒ ⇒ 一条消息都没落。
#    ＋ **正控**：放开注入 ⇒ ⇒ 切到 B 成功 ⇒ ⇒ 真发一条 ⇒ ⇒ 替身**记录到** POST
#    ⇒ ⇒ 证明「没落」那条读数**不是探测器瞎了**。
#
# ## 收尾：把设备复原
#
# 替身会话只在宿主上 ⇒ ⇒ 设备上**不留数据**；
# 但代理期间写进 app_flutter/app_config.json 的「外部端脑地址」要**原样还原**
# ⇒ ⇒ 否则下一台脚本会撞上一个「指着 127.0.0.1:4599x 的端脑」。
#
# 退出码：0 全过 / 1 有红 / 2 什么都没探到。
param(
  [string]$Serial = '',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Projects\iBLOC\shadow'
if (-not $OutDir) { $OutDir = Join-Path $repo 'artifacts\switch-failure-device' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$uiLocal = Join-Path $OutDir 'ui-probe.xml'
$stubLog = Join-Path $OutDir 'stub-requests.jsonl'
$stubCfg = Join-Path $OutDir 'stub-config.json'
$cfgLocal = Join-Path $OutDir 'app_config.new.json'
$cfgBackup = Join-Path $OutDir 'app_config.backup.json'

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
Say ('设备：' + $Serial)

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
  adb -s $Serial shell settings put secure accessibility_enabled 0 | Out-Null
}

# ── 语义树工具 ────────────────────────────────────────────────────────────
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
    $item = [pscustomobject]@{ Text = $t; X = $c[0]; Y = $c[1]; Clickable = $n.clickable; Class = $n.class }
    if ($n.clickable -eq 'true') { return $item }
    if (-not $fallback) { $fallback = $item }
  }
  return $fallback
}
function TapNode($hit) {
  if (-not $hit) { throw '没有可点的节点' }
  Say ('  ▸ 点「' + $hit.Text + '」@ ' + $hit.X + ',' + $hit.Y)
  adb -s $Serial shell input tap $hit.X $hit.Y | Out-Null
  Start-Sleep -Seconds 2
}
function GetChatInput {
  $best = $null
  foreach ($n in (DumpNodes)) {
    if (([string]$n.class) -notlike '*EditText*') { continue }
    $c = CenterOf $n.bounds
    if (-not $c) { continue }
    if (-not $best -or $c[1] -gt $best.Y) {
      $best = [pscustomobject]@{ Y = $c[1]; X = $c[0]; Enabled = $n.enabled; Text = $n.text }
    }
  }
  return $best
}
# 输入框那个节点：输入行上**最宽**的那块（x∈[250,900]、y∈[1900,2160]、宽>300）。
#
# ⚠️ **为什么不能只找 android.widget.EditText**：**禁用态的输入框在无障碍树里
#    不再是 EditText**（真机实测：切失败后那里只剩一个 enabled=false 的
#    android.view.View）⇒ ⇒ 只认 EditText ⇒ ⇒ 判据会把「输入框被禁用」
#    读成「输入框不见了」⇒ ⇒ **判不了** ⇒ ⇒ 改按**位置**找 ⇒ ⇒
#    同一个位置，启用态 enabled=true、禁用态 enabled=false ⇒ ⇒ 有分辨力。
function GetInputNode {
  foreach ($n in (DumpNodes)) {
    $b = [string]$n.bounds
    if ($b -match '\[(\d+),(\d+)\]\[(\d+),(\d+)\]') {
      $x1 = [int]$matches[1]; $y1 = [int]$matches[2]; $x2 = [int]$matches[3]; $y2 = [int]$matches[4]
      $w = $x2 - $x1; $h = $y2 - $y1
      if ($y1 -lt 1900 -or $y1 -gt 2160) { continue }
      if ($x1 -lt 250 -or $x2 -gt 900) { continue }
      if ($w -lt 300 -or $h -lt 60) { continue }
      return [pscustomobject]@{ Class = [string]$n.class; Enabled = [string]$n.enabled; Text = [string]$n.text; X = [int](($x1 + $x2) / 2); Y = [int](($y1 + $y2) / 2) }
    }
  }
  return $null
}
# 发送键：输入行**最右边**那个 Button（x>900、y>1900）⇒ ⇒ 没有文字（IconButton）。
function GetSendNode {
  $best = $null
  foreach ($n in (DumpNodes)) {
    if (([string]$n.class) -notlike '*Button*') { continue }
    $b = [string]$n.bounds
    if ($b -match '\[(\d+),(\d+)\]\[(\d+),(\d+)\]') {
      $x1 = [int]$matches[1]; $y1 = [int]$matches[2]; $x2 = [int]$matches[3]; $y2 = [int]$matches[4]
      if ($x1 -lt 900 -or $y1 -lt 1900) { continue }
      $best = [pscustomobject]@{ Class = [string]$n.class; Enabled = [string]$n.enabled; Clickable = [string]$n.clickable; X = [int](($x1 + $x2) / 2); Y = [int](($y1 + $y2) / 2) }
    }
  }
  return $best
}
# 发送键：IconButton.filled 没有文字 ⇒ ⇒ 语义树里是**空 desc** 的 Button
# ⇒ ⇒ 按「输入框右边、同一行」定位 ⇒ ⇒ 不猜像素。
function FindSendButton {
  $input = GetChatInput
  if (-not $input) { return $null }
  $best = $null
  foreach ($n in (DumpNodes)) {
    if ($n.class -ne 'android.widget.Button') { continue }
    $c = CenterOf $n.bounds
    if (-not $c) { continue }
    if ($c[0] -le $input.X) { continue }
    if ([math]::Abs($c[1] - $input.Y) -gt 120) { continue }
    if (-not $best -or $c[0] -gt $best.X) {
      $best = [pscustomobject]@{ X = $c[0]; Y = $c[1]; Enabled = $n.enabled; Clickable = $n.clickable }
    }
  }
  return $best
}
function AllText {
  $s = ''
  foreach ($n in (DumpNodes)) {
    $t = NodeText $n
    if ($t) { $s += $t + ' ' }
  }
  return $s
}

# ── HTTP 探针（直连设备上的真端脑，经 adb forward）─────────────────────────
function Probe($method, $path, $headers, $body) {
  $outFile = Join-Path $OutDir 'probe-out.txt'
  $a = @('-s', '-o', $outFile, '-w', '%{http_code}', '-X', $method, '--max-time', '25')
  foreach ($h in $headers) {
    if ($h -notmatch '^[A-Za-z0-9-]+:\s*\S+$') {
      throw ('请求头拼错了（多半是逗号比 + 结合更紧）：' + $h)
    }
    $a += @('-H', $h)
  }
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

# ── 替身记账 ──────────────────────────────────────────────────────────────
function Get-StubLog {
  $out = @()
  if (-not (Test-Path $stubLog)) { return $out }
  foreach ($line in @(Get-Content $stubLog -ErrorAction SilentlyContinue)) {
    if (-not $line.Trim()) { continue }
    try { $out += ($line | ConvertFrom-Json) } catch { }
  }
  return $out
}
function Get-StubWrites {
  $out = @()
  foreach ($e in (Get-StubLog)) {
    if ($e.method -eq 'POST' -and ([string]$e.path) -like '*/messages*') { $out += $e }
  }
  return $out
}

# ── 设备 / App ────────────────────────────────────────────────────────────
function Start-App([int]$waitSeconds = 90) {
  adb -s $Serial shell am force-stop $Package | Out-Null
  Start-Sleep -Seconds 2
  adb -s $Serial logcat -c
  adb -s $Serial shell input keyevent KEYCODE_WAKEUP | Out-Null
  adb -s $Serial shell am start -n ($Package + '/' + $Activity) | Out-Null
  for ($i = 0; $i -lt $waitSeconds; $i++) {
    Start-Sleep -Seconds 1
    $line = adb -s $Serial logcat -d -v time 2>$null |
      Select-String -Pattern 'EncephalonRuntime.*agent surface:\s*(\d+)' | Select-Object -Last 1
    if ($line -and $line.Matches[0].Groups[1].Value) {
      return [int]$line.Matches[0].Groups[1].Value
    }
  }
  return 0
}
function EnsureAppForeground {
  for ($i = 0; $i -lt 6; $i++) {
    $null = DumpNodes
    $focus = adb -s $Serial shell dumpsys window 2>$null | Select-String -Pattern 'mCurrentFocus' | Select-Object -Last 1
    if ($focus -and ([string]$focus).Contains($Package)) { return $true }
    adb -s $Serial shell cmd statusbar collapse 2>$null | Out-Null
    adb -s $Serial shell input keyevent KEYCODE_WAKEUP | Out-Null
    adb -s $Serial shell am start -n ($Package + '/' + $Activity) | Out-Null
    Start-Sleep -Seconds 3
  }
  return $false
}

$script:stubProc = $null
$script:convA = 'stub-sf-a-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
$script:convB = 'stub-sf-b-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
$titleA = '切失败用A 第一句话'
$titleB = '切失败用B 第二句话'
$devPort = 0
$script:convJsonA = ''
$script:convJsonB = ''
$script:notFoundBody = ''

function Write-StubConfig([string[]]$failIds) {
  $failJson = '['
  for ($i = 0; $i -lt $failIds.Count; $i++) {
    if ($i -gt 0) { $failJson += ',' }
    $failJson += '"' + $failIds[$i] + '"'
  }
  $failJson += ']'
  $json = '{"conversations":[' + $script:convJsonA + ',' + $script:convJsonB + '],"failIds":' + $failJson + ',"notFoundBody":' + (ConvertTo-Json $script:notFoundBody) + '}'
  [IO.File]::WriteAllText($stubCfg, $json, (New-Object Text.UTF8Encoding($false)))
}

try {
  # ── (0) 先在**真端脑**上抓两样东西：404 的形状 + 会话视图的形状 ────────
  Say ''
  Say '(0) 启动 App ⇒ 从**真端脑**抓 404 形状与会话视图形状'
  adb -s $Serial shell ('cmd deviceidle whitelist +' + $Package) | Out-Null
  $agentPort = Start-App
  if (-not $agentPort) {
    Say '没读到端脑面端口 ⇒ 什么都没探到。'
    exit 2
  }
  $localPort = 41500 + (Get-Random -Minimum 0 -Maximum 500)
  adb -s $Serial forward ('tcp:' + $localPort) ('tcp:' + $agentPort) | Out-Null
  $script:base = 'http://127.0.0.1:' + $localPort
  Say ('   端脑面端口：' + $agentPort + ' ⇒ 宿主 ' + $script:base)

  $shadowKey = (adb -s $Serial shell ('run-as ' + $Package + ' cat files/shadow.key') 2>$null | Out-String).Trim()
  if (-not $shadowKey) {
    Say '读不到 shadow key ⇒ 什么都没探到。'
    exit 2
  }
  $SH = @('X-Shadow-Key: ' + $shadowKey)

  $list = Probe 'GET' '/shadow/v1/conversations' $SH $null
  Check '端脑会话面可读' ($list.Status -eq 200) ('HTTP ' + $list.Status)
  if ($list.Status -ne 200) { exit 2 }

  $bogus = Probe 'GET' '/shadow/v1/conversations/no-such-conversation-xyz' $SH $null
  Say ('   真端脑的 404 形状：HTTP ' + $bogus.Status + ' body=' + $bogus.Body)
  if ($bogus.Status -ne 404 -or -not $bogus.Body) {
    Say '拿不到真端脑的 404 形状 ⇒ 注入会用假形状 ⇒ 什么都不探到。'
    exit 2
  }
  $script:notFoundBody = $bogus.Body

  # 真端脑的一条真会话视图 ⇒ ⇒ 拿它当替身那条会话的**模板**（形状逐字对齐）。
  $template = $null
  $arr = @()
  try { $arr = @(ConvertFrom-Json $list.Body) } catch { }
  if ($arr.Count -gt 0) {
    $probeId = [string]$arr[0].id
    $one = Probe 'GET' ('/shadow/v1/conversations/' + [uri]::EscapeDataString($probeId)) $SH $null
    if ($one.Status -eq 200) {
      try {
        $tpl = $one.Body | ConvertFrom-Json
        $template = [ordered]@{
          id = [string]$tpl.id
          agent = [string]$tpl.agent
          created_at = [string]$tpl.created_at
          updated_at = [string]$tpl.updated_at
          history = @($tpl.history)
        }
        Say ('   真端脑的会话视图模板：id=' + $template.id + ' agent=' + $template.agent + ' created_at=' + $template.created_at)
      } catch { }
    }
  }
  if (-not $template) {
    Say '拿不到真端脑的会话视图模板 ⇒ 什么都不探到。'
    exit 2
  }

  $isoA = [DateTimeOffset]::UtcNow.ToString('o')
  $isoB = [DateTimeOffset]::UtcNow.AddMinutes(1).ToString('o')
  $script:convJsonA = '{"id":"' + $script:convA + '","agent":"temporal","created_at":"' + $isoA + '","updated_at":"' + $isoA + '","history":[{"role":"user","text":"' + $titleA + '","at":"' + $isoA + '"}]}'
  $script:convJsonB = '{"id":"' + $script:convB + '","agent":"temporal","created_at":"' + $isoB + '","updated_at":"' + $isoB + '","history":[{"role":"user","text":"' + $titleB + '","at":"' + $isoB + '"}]}'

  # ── (1) 把 App 切到「外部端脑」形态 ⇒ 客户端指向宿主那台替身 ────────────
  Say ''
  Say '(1) 把 App 切到「外部端脑」形态（配置里写地址 + 用户喊停 ⇒ 不自动起内嵌大脑）'
  $origRaw = (adb -s $Serial shell ('run-as ' + $Package + ' cat app_flutter/app_config.json') 2>$null | Out-String).Trim()
  if (-not $origRaw) {
    Say '读不到 app_config.json ⇒ 什么都没探到。'
    exit 2
  }
  [IO.File]::WriteAllText($cfgBackup, $origRaw, (New-Object Text.UTF8Encoding($false)))
  $origObj = $origRaw | ConvertFrom-Json
  $devPort = 45990 + (Get-Random -Minimum 0 -Maximum 9)
  $hostPort = $devPort + 1
  $newObj = [ordered]@{}
  $newObj['accentColor'] = $origObj.accentColor
  $newObj['telencephalonBaseUrl'] = 'http://127.0.0.1:' + $devPort
  $newObj['brainStoppedByUser'] = $true
  $newJson = ($newObj | ConvertTo-Json -Compress)
  [IO.File]::WriteAllText($cfgLocal, $newJson, (New-Object Text.UTF8Encoding($false)))
  Get-Content $cfgLocal -Raw | adb -s $Serial shell ('run-as ' + $Package + " sh -c 'cat > app_flutter/app_config.json'") | Out-Null
  $backRaw = (adb -s $Serial shell ('run-as ' + $Package + ' cat app_flutter/app_config.json') 2>$null | Out-String).Trim()
  Check '配置写成「外部端脑地址 + 喊停」' ($backRaw.Contains('telencephalonBaseUrl') -and $backRaw.Contains('brainStoppedByUser')) ('写回的是：' + $backRaw)

  Write-StubConfig @($script:convB)
  if (Test-Path $stubLog) { Remove-Item $stubLog -Force }
  $stubArgs = @((Join-Path $repo 'scripts\switch-failure-stub.mjs'), '--port', $hostPort, '--log', $stubLog, '--config', $stubCfg)
  $script:stubProc = Start-Process -FilePath 'node' -PassThru -WindowStyle Hidden -ArgumentList $stubArgs -RedirectStandardOutput (Join-Path $OutDir 'stub.out.txt') -RedirectStandardError (Join-Path $OutDir 'stub.err.txt')
  $stubUp = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    $code = (& curl.exe -s -o NUL -w '%{http_code}' -m 3 ('http://127.0.0.1:' + $hostPort + '/.well-known/agent.json') 2>$null) -join ''
    if ($code -and $code -ne '000') { $stubUp = $true; break }
  }
  if (-not $stubUp) {
    Say '替身没起来 ⇒ 什么都没探到。'
    exit 2
  }
  Say ('   替身已起：宿主 ' + $hostPort + ' ⇒ 设备 ' + $devPort)
  adb -s $Serial reverse ('tcp:' + $devPort) ('tcp:' + $hostPort) | Out-Null
  $rev = adb -s $Serial reverse --list 2>$null | Out-String
  Check '设备上的那个口接到宿主替身' ($rev.Contains('tcp:' + $devPort)) ('adb reverse --list：' + $rev.Trim())

  # 重启 App ⇒ 它读新配置 ⇒ 内嵌大脑**不**起来（用户喊停）⇒ ⇒ 客户端指着替身。
  $null = Start-App 8
  Start-Sleep -Seconds 5

  # ── (2) 列表读得到 ────────────────────────────────────────────────────
  Say ''
  Say '(2) 会话管理列表读得到'
  if (-not (EnsureAppForeground)) {
    Say '拉不起 App 前台 ⇒ 什么都没探到。'
    exit 2
  }
  $entry = FindByText '会话管理'
  if (-not $entry) {
    Say '找不到「会话管理」入口 ⇒ 什么都没探到。'
    exit 2
  }
  TapNode $entry
  Start-Sleep -Seconds 3
  $hitA = FindByText $titleA
  $hitB = FindByText $titleB
  Check '列表上有会话 A' ([bool]$hitA) ('语义树里找不到「' + $titleA + '」')
  Check '列表上有会话 B' ([bool]$hitB) ('语义树里找不到「' + $titleB + '」')

  # ── (3) 正控：切到 A **成功** ⇒ 输入框 enabled=true ─────────────────────
  Say ''
  Say '(3) 正控：切到 A（成功）⇒ 当前会话 = A、输入框 enabled=true'
  if ($hitA) {
    TapNode $hitA
    Start-Sleep -Seconds 3
    $headerA = FindByText ($titleA + ' · temporal')
    Check '切到 A ⇒ 当前会话行就是 A' ([bool]$headerA) ('语义树里找不到「' + $titleA + ' · temporal」')
    $inputA = GetInputNode
    if (-not $inputA) {
      Note '切到 A ⇒ 输入框 enabled=true' '语义树里定位不到输入行那一块'
    } else {
      Check '切到 A ⇒ 输入框 enabled=true（正控：禁用信号有分辨力）' ($inputA.Enabled -eq 'true') ('enabled=' + $inputA.Enabled + ' class=' + $inputA.Class)
    }
    $sendA = GetSendNode
    if (-not $sendA) {
      Note '切到 A ⇒ 发送键 enabled=true' '语义树里定位不到发送键'
    } else {
      Check '切到 A ⇒ 发送键 enabled=true（正控：禁用信号有分辨力）' ($sendA.Enabled -eq 'true') ('enabled=' + $sendA.Enabled + ' clickable=' + $sendA.Clickable)
    }
  } else {
    Note '切到 A ⇒ 输入框 enabled=true' '列表上没有 A ⇒ 判不了'
  }

  # ── (4) 切到 B ⇒ 注入的 404 ⇒ 失败 ─────────────────────────────────────
  Say ''
  Say '(4) 切到 B ⇒ 注入的 404 ⇒ 切失败'
  try { TapNode (FindByText '返回') } catch { Say ('退回列表失败：' + $_.Exception.Message) }
  Start-Sleep -Seconds 3
  $hitB2 = FindByText $titleB
  if (-not $hitB2) {
    Note '切到 B' '列表上找不到 B ⇒ 判不了'
  } else {
    TapNode $hitB2
    Start-Sleep -Seconds 4
    $failNodes = DumpNodes
    Copy-Item $uiLocal (Join-Path $OutDir 'ui-after-fail.xml') -Force
    Say ('   失败后语义树里的类：' + ((@($failNodes | ForEach-Object { [string]$_.class } | Sort-Object -Unique)) -join ', '))
    $inFail = GetInputNode
    $sendFail = GetSendNode
    if ($inFail -and $sendFail) {
      Say ('   失败态：输入框节点 class=' + $inFail.Class + ' enabled=' + $inFail.Enabled + '；发送键 enabled=' + $sendFail.Enabled + ' clickable=' + $sendFail.Clickable)
    }
    $txt = AllText
    Check '切失败 ⇒ 界面出现「错误：」**且带 404**（说真话，不是装作切成功）' ($txt.Contains('错误：') -and $txt.Contains('404')) ('界面上没有「错误：…404…」')
    $headerStillA = FindByText ($titleA + ' · temporal')
    Check '切失败 ⇒ 当前会话**仍是 A**（用户看得见自己还在哪儿）' ([bool]$headerStillA) ('语义树里找不到「' + $titleA + ' · temporal」')
    $inputB = GetInputNode
    if (-not $inputB) {
      Note '切失败 ⇒ 输入框 enabled=false（用户没法打字）' '语义树里定位不到输入行那一块'
    } else {
      Check '切失败 ⇒ 输入框 enabled=false（用户没法打字）' ($inputB.Enabled -eq 'false') ('enabled=' + $inputB.Enabled + ' class=' + $inputB.Class)
    }
    $sendB = GetSendNode
    if (-not $sendB) {
      Note '切失败 ⇒ 发送键 enabled=false（用户按不动）' '语义树里定位不到发送键'
    } else {
      Check '切失败 ⇒ 发送键 enabled=false（用户按不动发送）' ($sendB.Enabled -eq 'false' -and $sendB.Clickable -eq 'false') ('enabled=' + $sendB.Enabled + ' clickable=' + $sendB.Clickable)
    }
  }

  # ── (5) 终局：一条消息都没落 ────────────────────────────────────────────
  Say ''
  Say '(5) 终局：一条消息都没落（替身记账）'
  $writes = Get-StubWrites
  Say ('   替身记到的写请求：' + $writes.Count + ' 条')
  Check '终局 ⇒ 一条消息都没发出去（服务端没记到任何写）' ($writes.Count -eq 0) ('服务端记到了：' + (@($writes | ForEach-Object { $_.method + ' ' + $_.path }) -join ', '))

  # ── (7) 正控：放开注入 ⇒ 切到 B 成功 ⇒ 真发一条 ⇒ 替身记到 POST ────────
  Say ''
  Say '(6) 正控：放开注入 ⇒ 切到 B 成功 ⇒ 真发一条 ⇒ 替身**记到** POST'
  Write-StubConfig @()
  try { TapNode (FindByText '返回') } catch { Say ('退回列表失败：' + $_.Exception.Message) }
  Start-Sleep -Seconds 3
  $hitB3 = FindByText $titleB
  if (-not $hitB3) {
    Note '正控：切到 B 成功' '列表上找不到 B ⇒ 判不了'
  } else {
    TapNode $hitB3
    Start-Sleep -Seconds 4
    $headerB = FindByText ($titleB + ' · temporal')
    Check '正控：放开注入 ⇒ 切到 B **成功**（当前会话行 = B）' ([bool]$headerB) ('语义树里找不到「' + $titleB + ' · temporal」')
    $inputE = GetChatInput
    if ($inputE -and $inputE.Enabled -eq 'true') {
      adb -s $Serial shell input tap $inputE.X $inputE.Y | Out-Null
      Start-Sleep -Milliseconds 800
      adb -s $Serial shell input text 'probe-send-ok-1' | Out-Null
      Start-Sleep -Seconds 2
      $inputF = GetChatInput
      $typedOk = if ($inputF) { [string]$inputF.Text } else { '' }
      Check '正控：放开注入 ⇒ 字**打得进去**' ($typedOk.Contains('probe-send-ok-1')) ('输入框里是：' + $typedOk)
      $sendBtn = FindSendButton
      if ($sendBtn) {
        Say ('  ▸ 点发送键 @ ' + $sendBtn.X + ',' + $sendBtn.Y)
        adb -s $Serial shell input tap $sendBtn.X $sendBtn.Y | Out-Null
      } else {
        Say '  ▸ 找不到发送键 ⇒ 改用回车（TextField 的 textInputAction=send）'
        adb -s $Serial shell input keyevent 66 | Out-Null
      }
      Start-Sleep -Seconds 8
    } else {
      Note '正控：字打进去' ('输入框的 enabled=' + $(if ($inputE) { $inputE.Enabled } else { '定位不到' }) + ' ⇒ 判不了')
    }
  }
  $writes2 = Get-StubWrites
  Check '正控 ⇒ 替身**记到了**那条 POST（说明上一条「没记到写」不是探测器瞎了）' ($writes2.Count -gt 0) ('替身一条写都没记到 ⇒ 探测器可能瞎了 ⇒ 第 (6) 条的读数不算数')

  Say ''
  Say '(8) 收尾：把设备复原'
} finally {
  if ($devPort -gt 0) {
    adb -s $Serial reverse --remove ('tcp:' + $devPort) 2>$null | Out-Null
  }
  if ($script:stubProc) {
    try { Stop-Process -Id $script:stubProc.Id -Force -ErrorAction SilentlyContinue } catch { }
  }
  if (Test-Path $cfgBackup) {
    Get-Content $cfgBackup -Raw | adb -s $Serial shell ('run-as ' + $Package + " sh -c 'cat > app_flutter/app_config.json'") | Out-Null
  }
  try {
    adb -s $Serial shell am force-stop $Package | Out-Null
    Start-Sleep -Seconds 3
    adb -s $Serial shell am start -n ($Package + '/' + $Activity) | Out-Null
    Start-Sleep -Seconds 18
    $line = adb -s $Serial logcat -d -v time 2>$null |
      Select-String -Pattern 'EncephalonRuntime.*agent surface:\s*(\d+)' | Select-Object -Last 1
    Check '设备复原：大脑又起来了' ([bool]$line) ('logcat 里没有新的 agent surface ⇒ 大脑没起来')
  } catch {
    Note '设备复原：大脑又起来了' $_.Exception.Message
  }
  Restore-A11y
}

Say ''
$red = @($script:results | Where-Object { -not $_.Ok })
Say ('读数：' + $script:results.Count + ' 条，' + $red.Count + ' 红')
if ($red.Count -gt 0) {
  Say '⇒ 有红。'
  exit 1
}
Say '⇒ 全绿：切会话失败 ⇒ 用户看得见（说真话）、发不出去（输入框禁用）、一条消息都没落。'
exit 0
