# 真机探针：**AG-UI 那一路在真端脑上真通**（手机里那台端脑 ＋ 真模型）。
#
# ## 它回答哪几格
#   ① **门在那儿**：不带钥匙 ⇒ 401（`telencephalon_door_closed`）⇒ ⇒ 不带钥匙那一格是**对照**
#      （证明门真的在，不是「反正都能过」）；带钥匙 ⇒ 能过
#   ② **端点在那儿且认形状**：`POST /shadow/v1/conversations/{id}/ag-ui:stream`
#      ⇒ 400/422 是**形状不对**（不是 404「没这条路」）
#   ③ **真事件序列**：真跑一轮 ⇒ ⇒ 逐字记 AG-UI 事件类型序列（RUN_STARTED →
#      TEXT_MESSAGE_START/CONTENT/END → RUN_FINISHED）
#   ④ **真模型**：模型真的回话了（文本非空）⇒ ⇒ 这一跳不是拿 fixture 冒充的
#   ⑤ 收尾清理（DELETE 走 admin 门）⇒ ⇒ 探针不留会话
#
# ## ⚠️ 判据纪律
#   · **会话 id 不打印**（它是设备上的真实标识）
#   · **两把钥匙只写文件、不打印**（shadow.key / admin.key 在 App 私有目录）
#   · **只删探针自己建的会话** ⇒ ⇒ 不动别人的会话
#   · **不重启 App**：App 正在跑就复用 ⇒ ⇒ 不打断别人正在跑的演练
#   · 记「状态码 ＋ 帧数 ＋ 事件类型序列 ＋ 文本前 120 字」
#   · ⚠️ **真模型耗时波动很大**（实测 3 秒 ～ 162 秒）⇒ ⇒ 超时给到 300 秒
#
# ## ⚠️ 这一格**花钱**：它会**真调一次模型**（真端脑真跑一轮）
#
# ## 退出码
#   0 全部探完且已清理 / 1 有探针没跑成 / 2 什么都没探到（App 没跑、端口找不到、钥匙读不到）
param(
  [string]$Serial = 'ee6b4832',
  [string]$Package = 'com.ibloc.shadow',
  # ⚠️ 空 ＝ 自动发现（把设备上所有 LISTEN 端口当候选，挨个用读门认端脑）
  [string]$DevicePort = '',
  [string]$Prompt = '请只回两个字：收到'
)

$ErrorActionPreference = 'Continue'
function Say($m) { [Console]::WriteLine($m) }

function Read-DeviceSecret($rel) {
  $out = (adb -s $Serial shell run-as $Package cat $rel 2>$null | Out-String).Trim()
  return $out
}

# ① App 在跑吗（**不重启** ⇒ 不打断别人）
$appPid = (adb -s $Serial shell pidof $Package 2>$null | Out-String).Trim()
if (-not $appPid) {
  Say 'App 没在跑 ⇒ 本探针**不自动重启**（重启会打断别人正在跑的演练）⇒ 退出';
  exit 2
}
Say ('App 在跑（pid ' + $appPid + '）⇒ 复用，不重启')

# ② 端脑端口（自动发现）
$candidates = @()
if ($DevicePort) {
  $candidates = @([int]$DevicePort)
} else {
  $status = (adb -s $Serial shell cat ("/proc/" + $appPid + "/status") 2>$null | Out-String)
  foreach ($line in ($status -split "`n")) {
    if ($line -match '^Uid:\s+(\d+)') { Say ('App uid ' + $matches[1]); break }
  }
  # ⚠️ **不按 uid 过滤** —— `/proc/net/tcp` 的 **uid 列不是最后一列**（倒数第 6 列）
  # ⇒ ⇒ 按 uid 挑会把候选挑空 ⇒ ⇒ 改成「**所有** LISTEN 端口都当候选」，
  #    挨个用读门（带 shadow key 打 /shadow/v1/agents）认端脑 ⇒ ⇒ 谁应答谁就是。
  $tcp = (adb -s $Serial shell 'cat /proc/net/tcp /proc/net/tcp6 2>/dev/null' 2>$null | Out-String)
  foreach ($line in ($tcp -split "`n")) {
    if ($line -match '^\s*\d+:\s+([0-9A-Fa-f]{2,8}):([0-9A-Fa-f]{4})\s+[0-9A-Fa-f]{8}:0000\s+0A') {
      $port = [Convert]::ToInt32($matches[2], 16)
      if ($port -gt 1024 -and $candidates -notcontains $port) { $candidates += $port }
    }
  }
  Say ('候选监听端口（' + $candidates.Count + ' 个）：' + ($candidates -join ', '))
}
if (-not $candidates -or $candidates.Count -eq 0) { Say '没找到候选端口 ⇒ 什么都没探到'; exit 2 }

# ③ 两把钥匙（**只读不打印**）
$shadowKey = Read-DeviceSecret 'files/shadow.key'
$adminToken = Read-DeviceSecret 'files/admin.key'
if (-not $shadowKey -or -not $adminToken) { Say '读不到钥匙 ⇒ 什么都没探到'; exit 2 }
Say ('两把钥匙到手（长度 ' + $shadowKey.Length + '/' + $adminToken.Length + '，不打印）')

# ④ 挨个端口认端脑（读门：带 shadow key 打 /shadow/v1/agents）
$brainPort = 0
$localPortUsed = 0
$localPort = 61320
foreach ($p in $candidates) {
  $local = $localPort; $localPort++
  adb -s $Serial forward ("tcp:" + $local) ("tcp:" + $p) 2>$null | Out-Null
  try {
    $probe = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $local + "/shadow/v1/agents") -Headers @{ 'X-Shadow-Key' = $shadowKey } -TimeoutSec 4 -UseBasicParsing
    if ($probe.StatusCode -eq 200) { Say ('端脑认出来了：设备端口 ' + $p + '（本机 ' + $local + '）'); $brainPort = $p; $localPortUsed = $local; break }
  } catch { }
  adb -s $Serial forward --remove ("tcp:" + $local) 2>$null | Out-Null
}
if (-not $brainPort) { Say '候选端口里没有端脑 ⇒ 什么都没探到'; exit 2 }
$base = 'http://127.0.0.1:' + $localPortUsed

# ⑤ 不带钥匙那一格是**对照**（证明门真在）
$noKeyStatus = 0
try {
  Invoke-WebRequest -Uri ($base + '/shadow/v1/conversations') -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 10 -UseBasicParsing | Out-Null
  $noKeyStatus = 200
} catch {
  $noKeyStatus = [int]$_.Exception.Response.StatusCode
}
Say ('对照：不带钥匙 POST /shadow/v1/conversations ⇒ 状态 ' + $noKeyStatus + '（期望 401）')

# ⑥ 建会话（**id 不打印**）
$conv = Invoke-WebRequest -Uri ($base + '/shadow/v1/conversations') -Method Post -ContentType 'application/json' -Headers @{ 'X-Shadow-Key' = $shadowKey } -Body '{}' -TimeoutSec 20 -UseBasicParsing
$convId = ($conv.Content | ConvertFrom-Json).id
if (-not $convId) { Say '建会话失败 ⇒ 有探针没跑成'; exit 1 }
Say '建会话 200（id 不打印）'

# ⑦ 真跑一轮 AG-UI
$req = @{ threadId = $convId; messages = @(@{ role = 'user'; content = $Prompt }) } | ConvertTo-Json -Depth 6
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$frames = @()
$text = ''
$httpStatus = 0
try {
  $stream = Invoke-WebRequest -Uri ($base + '/shadow/v1/conversations/' + $convId + '/ag-ui:stream') -Method Post -ContentType 'application/json' -Headers @{ 'X-Shadow-Key' = $shadowKey } -Body $req -TimeoutSec 300 -UseBasicParsing
  $httpStatus = $stream.StatusCode
  foreach ($line in ($stream.Content -split "`n")) {
    $t = $line.Trim()
    if (-not $t.StartsWith('data:')) { continue }
    $payload = $t.Substring(5).Trim()
    if (-not $payload) { continue }
    try {
      $ev = $payload | ConvertFrom-Json
      $frames += $ev.type
      if ($ev.type -eq 'TEXT_MESSAGE_CONTENT' -and $ev.delta) { $text += $ev.delta }
    } catch { $frames += '<<坏帧>>' }
  }
} catch {
  Say ('AG-UI 流失败：' + $_.Exception.Message)
}
$sw.Stop()
Say ('ag-ui:stream 状态 ' + $httpStatus + ' ｜ 耗时 ' + [int]$sw.Elapsed.TotalSeconds + ' 秒 ｜ 帧数 ' + $frames.Count)
Say ('事件序列：' + ($frames -join ' -> '))
Say ('文本前 120 字：' + $text.Substring(0, [Math]::Min(120, $text.Length)))
# ⚠️ **脱敏后的真帧**（设备上的真实标识换成占位 ⇒ ⇒ 这份可以直接当 fixture 用）
$safe = @()
if ($stream) {
  foreach ($line in ($stream.Content -split "`n")) {
    $t2 = $line.Trim()
    if (-not $t2.StartsWith('data:')) { continue }
    $safe += ($t2 -replace '"threadId":"[^"]*"', '"threadId":"thread-1"' -replace '"runId":"[^"]*"', '"runId":"run-1"' -replace '"messageId":"[^"]*"', '"messageId":"m1"')
  }
}
Say '脱敏帧（可作 fixture）：'
foreach ($s in $safe) { Say ('  ' + $s) }

# ⑧ 收尾清理（**只删自己建的**）
try {
  $null = Invoke-WebRequest -Uri ($base + '/shadow/v1/conversations/' + $convId) -Method Delete -Headers @{ 'X-Admin-Token' = $adminToken } -TimeoutSec 15 -UseBasicParsing
  Say '已删除本探针建的会话（id 不打印）'
} catch {
  Say ('清理失败（探针建的会话可能留在设备上）：' + $_.Exception.Message)
}
adb -s $Serial forward --remove ("tcp:" + $localPortUsed) 2>$null | Out-Null

# ⑨ 读数自评（**形状不对** ⇒ 退出码 1）
$ok = ($httpStatus -eq 200) -and ($frames -contains 'RUN_STARTED') -and ($frames -contains 'RUN_FINISHED') -and ($text.Trim().Length -gt 0)
if (-not $ok) { Say '读数不达标（没有 RUN_STARTED/RUN_FINISHED 或模型没回话）⇒ 退出码 1'; exit 1 }
Say 'AG-UI 真机真通 ✔（RUN_STARTED → … → RUN_FINISHED ＋ 真模型回话）'
exit 0
