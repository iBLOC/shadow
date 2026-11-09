# 真机探针：手机端那份大脑（NDK 内嵌 `libencephalon.so`）**到底有没有那几条路由**。
#
# ## 为什么要有它
#
# 端脑**源码**里有某条路由 ⇒ ≠ **你编出来的那份大脑**里有 ⇒ ⇒ 真机上那条功能
# **根本不存在（404）** ⇒ ⇒ 界面只会显示一条原始错误 ⇒ ⇒ **失败长得像成功**。
#
# `scripts/check-brain-route-surface.mjs` 是**产物级**（扫二进制字节）⇒ ⇒ 它能
# 判「编出来的那份有没有」⇒ ⇒ 但它**不问「手机现在跑的是不是那份」** ⇒ ⇒
# 这一支是**真机级**：把 app 拉起来，从 logcat 取端脑面端口，adb forward 到本机，
# 直接打那几条路由。
#
# ## 判据（对着真实客户端与门策略，不猜）
#
#   · GET  /api/telencephalon/lobes/capability-defaults   —— 读门（X-Shadow-Key）
#   · GET  /api/telencephalon/notifications               —— 读门
#   · POST /api/telencephalon/notifications/ack           —— 写门（X-Admin-Token）
#   · POST /api/telencephalon/tasks/{id}/update           —— 写门
#
# ## ⚠️ 为什么不能只看状态码
#
# axum 里 **404 有两种**：
#   · **路由不存在** ⇒ 404 且**响应体为空**（体长 0）
#   · **路由在、资源没有** ⇒ 404 且**带 JSON 体**（端脑自己的错误体）
# ⇒ ⇒ 所以读数必须记「状态码 ＋ **体长** ＋ 体首 200 字」。
#
# 退出码：0 全部存在 / 1 有路由不存在 / 2 什么都没探到（端口没起来、钥匙读不到）。
param(
  [string]$Serial = 'ee6b4832',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Continue'
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.local/probe-brain-routes' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Say($m) { Write-Output $m }

# ---- 1. 起 app，从 logcat 取端脑面端口 -------------------------------------
# ⚠️ 端口**每次启动随机分配** ⇒ ⇒ 只能问 logcat（`EncephalonRuntime.*agent surface:`）。
adb -s $Serial shell am force-stop $Package | Out-Null
Start-Sleep -Seconds 2
adb -s $Serial logcat -c
adb -s $Serial shell am start -n "$Package/$Activity" | Out-Null
$agentPort = 0
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  $line = adb -s $Serial logcat -d -v time 2>$null |
          Select-String -Pattern 'EncephalonRuntime.*agent surface:\s*(\d+)' |
          Select-Object -Last 1
  if ($line -and $line.Matches[0].Groups[1].Value) {
    $agentPort = [int]$line.Matches[0].Groups[1].Value
    break
  }
}
if (-not $agentPort) {
  Say '!! 没读到端脑面端口 ⇒ 什么都没探到'
  adb -s $Serial logcat -d -v time 2>$null |
    Select-String -Pattern 'EncephalonRuntime|Encephalon' | Select-Object -Last 25
  exit 2
}
$localPort = 41000 + (Get-Random -Minimum 0 -Maximum 2000)
adb -s $Serial forward "tcp:$localPort" "tcp:$agentPort" | Out-Null
$base = "http://127.0.0.1:$localPort"
Say "端脑面端口：$agentPort ⇒ $base"

# ---- 2. 取钥匙（**不打印**）-------------------------------------------------
$shadowKey = (adb -s $Serial shell "run-as $Package cat files/shadow.key" 2>$null | Out-String).Trim()
$adminToken = (adb -s $Serial shell "run-as $Package cat files/admin.key" 2>$null | Out-String).Trim()
if (-not $shadowKey) {
  Say '!! 读不到影子锁 ⇒ 什么都探不到'
  exit 2
}
Say ("钥匙已取到（shadow=" + $shadowKey.Length + " / admin=" + $adminToken.Length + " 字符，不打印）")

function Probe($name, $method, $path, $body) {
  $outFile = Join-Path $OutDir ('body-' + ($name -replace '[^A-Za-z0-9_-]', '_') + '.txt')
  $a = @('-s', '-o', $outFile, '-w', '%{http_code}', '-X', $method, '--max-time', '25')
  if ($shadowKey) { $a += @('-H', "X-Shadow-Key: $shadowKey") }
  if ($adminToken) { $a += @('-H', "X-Admin-Token: $adminToken") }
  if ($body) {
    # ⚠️ body 必须走文件（--data-binary @file）—— 直接把带引号的 JSON 当命令行参数
    # 传 ⇒ Windows 的参数转义会把它弄坏 ⇒ ⇒ 服务端收到残缺 JSON ⇒ ⇒ 422。
    $inFile = Join-Path $OutDir 'probe-in.json'
    [IO.File]::WriteAllText($inFile, $body, (New-Object Text.UTF8Encoding($false)))
    $a += @('-H', 'Content-Type: application/json', '--data-binary', ('@' + $inFile))
  }
  $a += ($base + $path)
  $code = (& curl.exe @a 2>$null) -join ''
  $txt = ''
  if (Test-Path $outFile) { $txt = [string](Get-Content $outFile -Raw -ErrorAction SilentlyContinue) }
  if ($null -eq $txt) { $txt = '' }
  $snippet = ($txt.Substring(0, [Math]::Min(200, $txt.Length))) -replace "\r?\n", ' '
  Say ("  [$name] $method $path ⇒ HTTP " + $code + ' | 体长=' + $txt.Length + ' | ' + $snippet)
  return @{ Name = $name; Method = $method; Path = $path; Status = [int]$code; BodyLen = $txt.Length; Body = $snippet }
}

Say '--- 四条路由的真机读数 ---'
$all = @(
  (Probe 'capability-defaults' 'GET'  '/api/telencephalon/lobes/capability-defaults' $null),
  (Probe 'notifications'       'GET'  '/api/telencephalon/notifications' $null),
  (Probe 'notifications-ack'   'POST' '/api/telencephalon/notifications/ack' '{"ids":[]}'),
  (Probe 'tasks-update'        'POST' '/api/telencephalon/tasks/probe-nonexistent-id/update' '{"status":"done"}')
)

# ---- 3. 判据：路由「在」≠「空体 404」 --------------------------------------
$missing = @($all | Where-Object { $_.Status -eq 404 -and $_.BodyLen -eq 0 })
Say ''
Say ('路由存在判定：存在 ' + ($all.Count - $missing.Count) + ' / ' + $all.Count)
if ($missing.Count -gt 0) {
  foreach ($m in $missing) { Say ('  ✗ 路由不存在（空体 404）：' + $m.Method + ' ' + $m.Path) }
  exit 1
}
Say '✓ 这些路由在真机的大脑里都存在'
exit 0
