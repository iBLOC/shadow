# 真机证明：手机上的会话**活得过 App 重启**。
#
# 背景：2026-11-01 之前，移动端的会话存储是**纯内存**的 => => 进程一重启，
# 聊天记录全没。
#
# ⚠️⚠️ **为什么手机上不是海马体（Lance）**：Lance 发布文件靠 `fs::hard_link`，
# 而 **Android 的 SELinux 不允许 App 在自己的数据目录里建硬链接**（AOSP：
# `allow appdomain app_data_file:file rw_file_perms`，那个宏里**没有** `link`）
# => => 2026-11-01 真机实测 `avc: denied { link } ... app=com.ibloc.shadow`
# => => Lance 连不上 => => 端脑 panic => => **App 整个起不来**。
# => => 所以移动端走**文件版**会话存储（App 私有目录里的一个 JSON）。
#
# 它量三件事（全是**真存储**上的读数，不是 App 界面上的自称）：
#   1. 建会话 => 端脑回 id；
#   2. 设备 App 私有目录里真的有那个会话文件（落盘了）；
#   3. **杀掉 App 再起来** => 那个会话还在（这才是这条线要证明的东西）。
#
# ⚠️ **反向验证**：同一份脚本跑在**改动前的旧包**上，第 3 条必须**红**
# （会话随重启消失）—— 否则这份脚本就是恒绿的假证明。
#
# 退出码：0 全过 / 1 有红 / 2 什么都没探到。
param(
  [string]$Serial = '',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = '',
  [switch]$SkipRestart
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Projects\iBLOC\shadow'
if (-not $OutDir) { $OutDir = Join-Path $repo 'artifacts\mobile-hippocampus-device' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Say($msg) { Write-Output $msg }

$PROBE_MARKER = 'probe-mobile-hippocampus-' + [guid]::NewGuid().ToString('N').Substring(0, 8)

if (-not $Serial) {
  $devices = @(adb devices | Select-String -Pattern '\sdevice$' | ForEach-Object { ($_ -split '\s+')[0] })
  if ($devices.Count -ne 1) {
    Say ('需要恰好一台设备在线，实测到 ' + $devices.Count + ' 台。=> 用 -Serial 指定。')
    exit 2
  }
  $Serial = $devices[0]
}
Say ('设备：' + $Serial)

# ⚠️ 别让系统把这个 App 冻住（见 Start-App 里的说明）：冻结期间端脑的
# 端口在 LISTEN 但没人 accept，读数会伪装成「端脑没起来」。
adb -s $Serial shell ('cmd deviceidle whitelist +' + $Package) | Out-Null

function Start-App {
  adb -s $Serial shell am force-stop $Package | Out-Null
  Start-Sleep -Seconds 2
  adb -s $Serial logcat -c
  # ⚠️⚠️ **屏幕必须醒着**。锁屏（甚至 AOD）时 MIUI 会把后台进程**冻结**
  # ⇒ ⇒ 端脑的端口还在 LISTEN，但**没人 accept** ⇒ ⇒ 读数是 000
  # （连不上）⇒ ⇒ 看着像「端脑没起来」，其实是被冻住了 —— 2026-11-01
  # 当场踩到：端脑日志明明写着 "Encephalon started on port 40349"，
  # 而 curl 一直超时，直到把 App 拉回前台才 200。
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

$script:results = New-Object System.Collections.Generic.List[object]
function Check($name, $ok, $detail) {
  $script:results.Add([pscustomobject]@{ Name = $name; Ok = $ok; Detail = $detail })
  if ($ok) { Say ('  [PASS] ' + $name) } else { Say ('  [FAIL] ' + $name + ' —— ' + $detail) }
}

function Probe($method, $path, $headers, $body) {
  $outFile = Join-Path $OutDir 'probe-out.txt'
  $a = @('-s', '-o', $outFile, '-w', '%{http_code}', '-X', $method, '--max-time', '25')
  foreach ($h in $headers) { $a += @('-H', $h) }
  if ($body) {
    # ⚠️ body 必须走文件（--data-binary @file）—— 直接把带引号的 JSON 当
    # 命令行参数传，Windows 的原生参数转义会把它弄坏 => 服务端收到残缺
    # JSON => 422（看着像「服务端拒了」，其实是调用方式错了）。
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

function Forward-Port([int]$agentPort) {
  $localPort = 40000 + (Get-Random -Minimum 0 -Maximum 2000)
  adb -s $Serial forward ('tcp:' + $localPort) ('tcp:' + $agentPort) | Out-Null
  $script:base = 'http://127.0.0.1:' + $localPort
  return $localPort
}

# ---- 启动端脑 --------------------------------------------------------------
$agentPort = Start-App
if (-not $agentPort) {
  Say '没读到端脑面端口 => 什么都没探到。'
  exit 2
}
$null = Forward-Port $agentPort
Say ('端脑面端口：' + $agentPort + ' => ' + $script:base)

$shadowKey = (adb -s $Serial shell ('run-as ' + $Package + ' cat files/shadow.key') 2>$null | Out-String).Trim()
if (-not $shadowKey) {
  Say '读不到 shadow key => 什么都没探到。'
  exit 2
}
Say ('钥匙已取到（长度 ' + $shadowKey.Length + '，不打印）')
$SH = @('X-Shadow-Key: ' + $shadowKey)

# ---- (1) 建会话 ------------------------------------------------------------
Say ''
Say '(1) 建会话'
$body = '{"system":"' + $PROBE_MARKER + '"}'
$created = Probe 'POST' '/shadow/v1/conversations' $SH $body
$convId = ''
if ($created.Status -eq 200) {
  try { $convId = (ConvertFrom-Json $created.Body).id } catch { $convId = '' }
}
Check '端脑能建会话' ($created.Status -eq 200 -and [bool]$convId) ('HTTP ' + $created.Status + ' body=' + $created.Body)
if (-not $convId) {
  Say '拿不到会话 id => 后面无从谈起。'
  exit 2
}
Say ('   会话 id：' + $convId)
Say ('   探针标记：' + $PROBE_MARKER)

# ---- (2) 会话存储落盘 ----------------------------------------------------
Say ''
Say '(2) 会话存储落盘（设备 App 私有目录）'
$storeFile = 'files/shadow/conversations.json'
$fileList = (adb -s $Serial shell ('run-as ' + $Package + ' ls -la ' + $storeFile) 2>$null | Out-String)
$fileOk = ($fileList -match 'conversations\.json')
Check '设备上有会话存储文件' $fileOk ('没找到 ' + $storeFile + '：' + $fileList.Trim())
if ($fileOk) { Say ('   ' + ($fileList.Trim() -split '\s+' | Select-Object -Last 5) -join ' ') }

# ---- (3) 重启后还在吗（这条线要证明的就是它）---------------------------------
Say ''
Say '(3) 杀掉 App 再起来 => 会话还在吗'
if (-not $SkipRestart) {
  $agentPort2 = Start-App
  if (-not $agentPort2) {
    Say '重启后没读到端脑面端口 => 端脑没起来。'
    Check '重启后端脑起来' $false '读不到端口'
  } else {
    Say ('   重启后端脑面端口：' + $agentPort2)
    $null = Forward-Port $agentPort2
    Check '重启后端脑起来' $true ''
    $after = Probe 'GET' '/shadow/v1/conversations' $SH $null
    $found = ($after.Body -like ('*' + $convId + '*'))
    Check '重启后那个会话还在' ($after.Status -eq 200 -and $found) ('HTTP ' + $after.Status + '；body 里找不到 ' + $convId + ' => 会话随重启消失了')
    $one = Probe 'GET' ('/shadow/v1/conversations/' + $convId) $SH $null
    Check '按 id 读回会话' ($one.Status -eq 200) ('HTTP ' + $one.Status)
  }
} else {
  Say '   （-SkipRestart：没跑重启那一段）'
}

# ---- 汇总 ------------------------------------------------------------------
Say ''
$red = @($script:results | Where-Object { -not $_.Ok })
Say ('读数：' + $script:results.Count + ' 条，' + $red.Count + ' 红')
if ($red.Count -gt 0) {
  Say '=> 有红。'
  exit 1
}
Say '=> 全绿。'
exit 0