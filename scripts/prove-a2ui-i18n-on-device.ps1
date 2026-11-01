# 真机证明：**手机上真的能看到中文界面**（A2UI 的界面文案随 `Accept-Language` 走）。
#
# ## 这条脚本补的是什么洞
#
# 2026-11-01 的台账（`shadow-mobile/AGENTS.md` ㋁ 条⑥）写着：「手机上还看不到中文
# 界面」—— 端脑侧与客户端侧**都已验**，**真机未验**，因为设备上那份 `.so` 与 APK
# 都是旧的 ⇒ ⇒ 前提不满足 ⇒ ⇒ 那一格当时**判不了**。
#
# ⇒ 现在前提满足了：`.so` 重编过（中文字面量在二进制里，sha256 63D3E61C…）、
#   APK 重打过并装上 ⇒ ⇒ 这一格**可以验了**。
#
# ## 它证明三件事（每件事都有**反证**）
#
# 1. **端脑认 `Accept-Language`**：同一个 `/a2a`、同一把钥匙、同一份 body
#    ⇒ ⇒ **只换这一个头** ⇒ ⇒ 英文给 `Tasks (`、中文给 `任务（`
#    ⇒ ⇒ 两次读数**互为反证**（不是「碰巧是中文」）。
# 2. **手机端送对了那个头**：App 按**系统语言**送（zh-CN ⇒ `zh`）
#    ⇒ ⇒ 屏幕上出现的是**中文**。
# 3. **界面不是「看着像」**：判据读的是 `uiautomator dump` 的**语义树**
#    （按文字找，**不猜像素**）。
#
# ## 手法
#
# - 开 App 自带无障碍服务 ⇒ Flutter 建语义树 ⇒ 结尾还原。
# - 端脑端口从 logcat 取 ⇒ `adb forward`（端口每次启动随机分配）。
# - 钥匙**只进 HTTP 头，绝不打印**。
# - 建一条**本次运行独有**的任务 ⇒ 看板非空 ⇒ 断言钉在**标题**上；
#   收尾用 `DELETE /api/telencephalon/tasks/{id}` 把它删掉 ⇒ 不留垃圾。
#
# 退出码：0 全过 / 1 有红 / 2 什么都没探到。
param(
  [string]$Serial = '',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = '',
  # ⚠️ 界面坐标（本机 1080x2400 实测）—— 只用于**输入条**与**发送按钮**；
  #    A2UI 入口是**按文字**找的（tooltip = `Agent2UI`）。
  [string]$TapInput = '480,2076',
  [string]$TapSend = '979,1364',
  [switch]$SkipUi
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Projects\iBLOC\shadow'
if (-not $OutDir) { $OutDir = Join-Path $repo 'artifacts\a2ui-i18n-device' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$uiLocal = Join-Path $OutDir 'ui-probe.xml'

function Say($msg) { Write-Output $msg }

$script:results = New-Object System.Collections.Generic.List[object]
function Check($name, $ok, $detail) {
  $script:results.Add([pscustomobject]@{ Name = $name; Ok = $ok; Detail = $detail })
  if ($ok) { Say ('  [PASS] ' + $name) } else { Say ('  [FAIL] ' + $name + ' —— ' + $detail) }
}
function Note($name, $detail) { Say ('  [判不了] ' + $name + ' —— ' + $detail) }

# ── 选设备 ────────────────────────────────────────────────────────────────
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
function TapXY([string]$xy) {
  $parts = $xy -split ','
  adb -s $Serial shell input tap ([int]$parts[0]) ([int]$parts[1]) | Out-Null
}

# ── HTTP 探针（curl：SSE 落文件再读，避免命令行转义坑）────────────────────
function Probe($method, $path, $headers, $body) {
  $outFile = Join-Path $OutDir 'probe-out.txt'
  $a = @('-s', '-o', $outFile, '-w', '%{http_code}', '-X', $method, '--max-time', '25')
  foreach ($h in $headers) {
    # ⚠️ **守卫**：一个头必须形如 `Name: value`（值里**不许有空格**）。
    #    ⇒ ⇒ 逗号/`+` 把两个头拼成一条时，这里**当场炸** ⇒ ⇒
    #    ⇒ 而不是让服务端回一个**假的 401** ⇒ ⇒ 把我引到「门坏了」上去。
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

Say ''
Say '(0) 启动 App ⇒ 取端脑面端口 ⇒ 取钥匙'
adb -s $Serial shell am force-stop $Package | Out-Null
Start-Sleep -Seconds 2
adb -s $Serial logcat -c
adb -s $Serial shell input keyevent KEYCODE_WAKEUP | Out-Null
adb -s $Serial shell am start -n ($Package + '/' + $Activity) | Out-Null
$agentPort = 0
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  $line = adb -s $Serial logcat -d -v time 2>$null |
    Select-String -Pattern 'EncephalonRuntime.*agent surface:\s*(\d+)' | Select-Object -Last 1
  if ($line -and $line.Matches[0].Groups[1].Value) { $agentPort = [int]$line.Matches[0].Groups[1].Value; break }
}
if (-not $agentPort) {
  Say '没读到端脑面端口 ⇒ 什么都没探到。'
  Restore-A11y
  exit 2
}
$localPort = 40000 + (Get-Random -Minimum 0 -Maximum 2000)
adb -s $Serial forward ('tcp:' + $localPort) ('tcp:' + $agentPort) | Out-Null
$script:base = 'http://127.0.0.1:' + $localPort
Say ('   端脑面端口：' + $agentPort + ' ⇒ ' + $script:base)

$shadowKey = (adb -s $Serial shell ('run-as ' + $Package + ' cat files/shadow.key') 2>$null | Out-String).Trim()
$adminToken = (adb -s $Serial shell ('run-as ' + $Package + ' cat files/admin.key') 2>$null | Out-String).Trim()
if (-not $shadowKey) {
  Say '读不到 shadow key ⇒ 什么都没探到。'
  Restore-A11y
  exit 2
}
Say ('   钥匙已取到（长度 shadow=' + $shadowKey.Length + ' / admin=' + $adminToken.Length + '，**不打印**）')

# ── (1) 建一条本次运行独有的任务（看板非空 ⇒ 断言钉在**标题**上）──────────
Say ''
Say '(1) 建一条本次运行独有的任务'
$taskTitle = 'A2UI-i18n-proof-' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$createBody = @{
  title = $taskTitle
  description = 'prove-a2ui-i18n-on-device.ps1 建的'
  priority = 'high'
  tags = @('a2ui-i18n-device')
} | ConvertTo-Json -Compress
$createResp = Probe 'POST' '/api/telencephalon/tasks' @(('X-Admin-Token: ' + $adminToken)) $createBody
Check '建任务' ($createResp.Status -eq 200) ('HTTP ' + $createResp.Status + ' body=' + $createResp.Body)
$taskId = ''
if ($createResp.Status -eq 200) {
  try {
    $created = ConvertFrom-Json $createResp.Body
    if ($created.id) { $taskId = [string]$created.id }
  } catch { }
}
if (-not $taskId) {
  # 创建响应没带 id ⇒ 从列表里按标题反查（**不猜**）。
  $listTasks = Probe 'GET' '/api/telencephalon/tasks' @(('X-Admin-Token: ' + $adminToken)) $null
  if ($listTasks.Status -eq 200) {
    try {
      foreach ($t in @(ConvertFrom-Json $listTasks.Body)) {
        if ([string]$t.title -eq $taskTitle) { $taskId = [string]$t.id; break }
      }
    } catch { }
  }
}
Say ('   任务 id：' + $(if ($taskId) { $taskId } else { '（没拿到 ⇒ 收尾只能靠标题删）' }))

# ── (2) 同一个请求、只换 `Accept-Language` ⇒ 两组读数互为反证 ─────────────
Say ''
Say '(2) 端脑认不认 `Accept-Language`（同一把钥匙、同一份 body，只换这一个头）'
$a2aBody = @{
  jsonrpc = '2.0'
  id = 'probe-' + [guid]::NewGuid().ToString('N')
  method = 'message/stream'
  params = @{
    message = @{
      role = 'user'
      parts = @(@{ kind = 'text'; text = 'a2ui:tasks' })
    }
  }
} | ConvertTo-Json -Depth 8 -Compress
# ⚠️ **不能**写 @('X-Shadow-Key: ' + $shadowKey, 'X-A2A-Extensions: ' + $ext)
#    ⇒ ⇒ **逗号比 `+` 结合更紧** ⇒ ⇒ 两个头被**拼成一条**畸形头 ⇒ ⇒
#    ⇒ 服务端看到的是「一把错钥匙」⇒ ⇒ 报出**假的 401** ⇒ ⇒ 会把我
#    ⇒ 引到「门坏了」上去（实测踩到：门其实好得很）。
#    ⇒ ⇒ 每个元素各自加括号 ⇒ ⇒ 数组就是两个头。
$a2aExt = 'https://a2ui.org/a2a-extension/a2ui/v0.8'
$a2aHeaders = @(('X-Shadow-Key: ' + $shadowKey), ('X-A2A-Extensions: ' + $a2aExt))
$probeEn = Probe 'POST' '/a2a' ($a2aHeaders + @(('Accept-Language: en'))) $a2aBody
$probeZh = Probe 'POST' '/a2a' ($a2aHeaders + @(('Accept-Language: zh'))) $a2aBody
Check '探针 en ⇒ 200' ($probeEn.Status -eq 200) ('HTTP ' + $probeEn.Status)
Check '探针 zh ⇒ 200' ($probeZh.Status -eq 200) ('HTTP ' + $probeZh.Status)
if ($probeEn.Status -eq 200 -and $probeZh.Status -eq 200) {
  Check 'Accept-Language: en ⇒ 界面文案是英文' ($probeEn.Body.Contains('Tasks (')) ('SSE 里没有 `Tasks (`')
  Check 'Accept-Language: en ⇒ **不含**中文' (-not $probeEn.Body.Contains('任务（')) ('en 的 SSE 里出现了中文标题')
  Check 'Accept-Language: zh ⇒ 界面文案是中文' ($probeZh.Body.Contains('任务（')) ('SSE 里没有 `任务（`')
  Check 'Accept-Language: zh ⇒ **不含**英文' (-not $probeZh.Body.Contains('Tasks (')) ('zh 的 SSE 里出现了英文标题')
} else {
  Note 'Accept-Language 两组对照' '探针没拿到 200 ⇒ 判不了'
}

# ── (3) 屏幕上那一格（手机端送的是**系统语言**）────────────────────────────
if (-not $SkipUi) {
  Say ''
  Say '(3) 驱动界面 ⇒ 屏幕上那一格要显示中文'
  adb -s $Serial shell cmd statusbar collapse 2>$null | Out-Null
  $entry = FindByText 'Agent2UI'
  if (-not $entry) {
    Note '屏幕上是中文' '语义树里找不到「Agent2UI」入口 ⇒ 判不了'
  } else {
    Say ('  ▸ 点「Agent2UI」@ ' + $entry.X + ',' + $entry.Y)
    adb -s $Serial shell input tap $entry.X $entry.Y | Out-Null
    Start-Sleep -Seconds 3
    TapXY $TapInput
    Start-Sleep -Seconds 1
    adb -s $Serial shell input text 'a2ui:tasks' | Out-Null
    Start-Sleep -Seconds 1
    TapXY $TapSend
    Start-Sleep -Seconds 8
    $allText = ''
    foreach ($n in (DumpNodes)) {
      $t = NodeText $n
      if ($t) { $allText += ($t -replace '\s+', ' ') + ' ' }
    }
    [IO.File]::WriteAllText((Join-Path $OutDir 'ui-text.txt'), $allText, (New-Object Text.UTF8Encoding($false)))
    $shotRemote = '/sdcard/a2ui-i18n-device.png'
    adb -s $Serial shell screencap -p $shotRemote | Out-Null
    $shotLocal = Join-Path $OutDir 'a2ui-i18n-device.png'
    adb -s $Serial pull $shotRemote $shotLocal 2>&1 | Out-Null
    Say ('   截图：' + $shotLocal)
    Check '屏幕上的看板标题是中文' ($allText.Contains('任务（')) ('语义树里没有 `任务（` ⇒ 手机上还是英文')
    Check '屏幕上**不含**英文标题' (-not $allText.Contains('Tasks (')) ('语义树里出现了 `Tasks (`')
    Check '屏幕上能看到刚建的那条任务' ($allText.Contains($taskTitle)) ('语义树里没有那条任务的标题')
  }
} else {
  Note '屏幕上是中文' '-SkipUi ⇒ 本轮只验了服务端那一半'
}

# ── (4) 收尾：删掉自己建的任务、撤掉转发、还原无障碍 ─────────────────────
Say ''
Say '(4) 收尾'
if ($taskId) {
  $del = Probe 'DELETE' ('/api/telencephalon/tasks/' + [uri]::EscapeDataString($taskId)) @(('X-Admin-Token: ' + $adminToken)) $null
  Check '删掉自己建的那条任务' ($del.Status -eq 200 -or $del.Status -eq 204) ('HTTP ' + $del.Status)
} else {
  Note '删掉自己建的那条任务' '没拿到任务 id ⇒ 删不掉（那条任务留在设备上了）'
}
adb -s $Serial forward --remove ('tcp:' + $localPort) 2>$null | Out-Null
Restore-A11y

$failed = @($script:results | Where-Object { -not $_.Ok })
Say ''
Say ('读数：' + $script:results.Count + ' 条，' + $failed.Count + ' 红')
if ($failed.Count -gt 0) {
  Say '⇒ 有红。'
  exit 1
}
Say '⇒ 手机上确实显示中文界面。'
exit 0