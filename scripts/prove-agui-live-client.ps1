# 端到端：**桌面端客户端**对着**活的**端脑跑一轮 AG-UI（活体联调）。
#
# ## 它回答哪几格
#   ① **客户端那一侧真的能跑**：影仓自己的 `AguiClient`（发请求 ＋ SSE 解析 ＋
#      归约）＋ `AguiDriver`（收口）对着**活的**端脑跑完一轮 ⇒ ⇒ 这一跳不是
#      手写 fetch 冒充的 ⇒ ⇒ **客户端代码本身**被真端脑验过
#   ② **真端脑真的吐那 5 帧**（`RUN_STARTED → TEXT_MESSAGE_START →
#      TEXT_MESSAGE_CONTENT → TEXT_MESSAGE_END → RUN_FINISHED`）
#   ③ **真模型真的回话了**（文本非空）
#
# ## ⚠️ 为什么端脑**不必**跑在本机
# 手机 App 里**内嵌**端脑运行时 ⇒ ⇒ 本脚本用 `adb forward` 把**设备里**那台
# 端脑转到本机 60080 ⇒ ⇒ 桌面端连 `http://127.0.0.1:60080` ⇒ ⇒ 不用编译端脑。
#
# ## ⚠️ 判据纪律
#   · **两把钥匙只写进程环境变量、不打印**（shadow key ＋ admin token）
#   · 判据只删**本次建的**会话 ⇒ ⇒ 不动别人的会话
#   · App **正在跑就复用**（不打断别人的演练）⇒ ⇒ **只在它没跑时**才起它
#   · 记「退出码 ＋ 帧序列 ＋ 文本非空」
#
# ## 退出码
#   0 活体联调全绿 / 1 判据没跑成或跑红了 / 2 什么都没探到（App 起不来、端脑找不到、钥匙读不到）
param(
  # ⚠️ **留空 ＝ 自动认**（已授权的那台）⇒ ⇒ 换机后不必改脚本
  #    （上一版把旧机号写死 ⇒ ⇒ 设备一换就必失效）
  [string]$Serial = '',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [int]$LocalPort = 60080
)

$ErrorActionPreference = 'Continue'
function Say($m) { [Console]::WriteLine($m) }

# ⓪ 设备（没指定 ⇒ 自动认一台**已授权**的；认不到就**说清是哪一种认不到**）
if (-not $Serial) {
  $devText = (adb devices | Out-String)
  $authorized = @()
  $unauthorized = @()
  foreach ($line in ($devText -split "`n")) {
    if ($line -match '^(\S+)\s+device$') { $authorized += $matches[1] }
    elseif ($line -match '^(\S+)\s+unauthorized$') { $unauthorized += $matches[1] }
  }
  if ($authorized.Count -eq 0) {
    if ($unauthorized.Count -gt 0) {
      Say ('设备已连但**未授权**（' + ($unauthorized -join ', ') + '）⇒ 请在设备屏幕上点「允许 USB 调试」⇒ 什么都没探到')
    } else {
      Say '没找到已授权的设备 ⇒ 什么都没探到'
    }
    exit 2
  }
  $Serial = $authorized[0]
  Say ('自动认设备：' + $Serial + '（已授权 ' + $authorized.Count + ' 台，取第一台）')
}

# ① App 在跑吗（**没跑才起** ⇒ 不打断别人）
$appPid = (adb -s $Serial shell pidof $Package 2>$null | Out-String).Trim()
if (-not $appPid) {
  Say 'App 没在跑 ⇒ 起它（它没在跑 ⇒ 起它不会打断谁）'
  adb -s $Serial shell am start -S -n ("$Package/$Activity") | Out-Null
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    $appPid = (adb -s $Serial shell pidof $Package 2>$null | Out-String).Trim()
    if ($appPid) { break }
  }
}
if (-not $appPid) { Say 'App 起不来 ⇒ 什么都没探到'; exit 2 }
Say ('App 在跑（pid ' + $appPid + '）')

# ② 端脑端口（**所有** LISTEN 端口都当候选 ⇒ ⇒ 挨个用读门认）
$candidates = @()
$tcp = (adb -s $Serial shell 'cat /proc/net/tcp /proc/net/tcp6 2>/dev/null' 2>$null | Out-String)
foreach ($line in ($tcp -split "`n")) {
  if ($line -match '^\s*\d+:\s+([0-9A-Fa-f]{2,8}):([0-9A-Fa-f]{4})\s+[0-9A-Fa-f]{8}:0000\s+0A') {
    $port = [Convert]::ToInt32($matches[2], 16)
    if ($port -gt 1024 -and $candidates -notcontains $port) { $candidates += $port }
  }
}
if ($candidates.Count -eq 0) { Say '没找到候选端口 ⇒ 什么都没探到'; exit 2 }
Say ('候选监听端口（' + $candidates.Count + ' 个）')

# ③ 两把钥匙（**只读不打印**）
$shadowKey = (adb -s $Serial shell run-as $Package cat files/shadow.key 2>$null | Out-String).Trim()
$adminToken = (adb -s $Serial shell run-as $Package cat files/admin.key 2>$null | Out-String).Trim()
if (-not $shadowKey -or -not $adminToken) { Say '读不到钥匙 ⇒ 什么都没探到'; exit 2 }
Say ('两把钥匙到手（长度 ' + $shadowKey.Length + '/' + $adminToken.Length + '，不打印）')

# ④ 挨个端口认端脑（读门：带 shadow key 打 /shadow/v1/agents）
$brainPort = 0
$probeLocal = 61340
foreach ($p in $candidates) {
  $local = $probeLocal; $probeLocal++
  adb -s $Serial forward ("tcp:" + $local) ("tcp:" + $p) 2>$null | Out-Null
  try {
    $probe = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $local + "/shadow/v1/agents") -Headers @{ 'X-Shadow-Key' = $shadowKey } -TimeoutSec 4 -UseBasicParsing
    if ($probe.StatusCode -eq 200) { Say ('端脑认出来了：设备端口 ' + $p); $brainPort = $p; break }
  } catch { }
  adb -s $Serial forward --remove ("tcp:" + $local) 2>$null | Out-Null
}
if (-not $brainPort) { Say '候选端口里没有端脑 ⇒ 什么都没探到'; exit 2 }

# ⑤ 把设备里那台端脑转到本机 ⇒ ⇒ 桌面端连 http://127.0.0.1:<LocalPort>
adb -s $Serial forward ("tcp:" + $LocalPort) ("tcp:" + $brainPort) 2>$null | Out-Null
$env:AGUI_LIVE_URL = ("http://127.0.0.1:" + $LocalPort)
$env:AGUI_LIVE_KEY = $shadowKey
$env:AGUI_LIVE_ADMIN_TOKEN = $adminToken
Say ('已把设备端脑 ' + $brainPort + ' 转到本机 ' + $LocalPort)

# ⑥ 跑桌面端活体联调判据
Push-Location (Join-Path (Split-Path -Parent $PSScriptRoot) 'shadow-desktop')
pnpm vitest run src/lib/agui/__tests__/agui.live.test.ts
$code = $LASTEXITCODE
Pop-Location
adb -s $Serial forward --remove ("tcp:" + $LocalPort) 2>$null | Out-Null

Say ('活体联调判据退出码 ' + $code)
if ($code -ne 0) { exit 1 }
Say '桌面端客户端 ⇄ 活端脑：AG-UI 那一路真跑通了 ✔'
exit 0
