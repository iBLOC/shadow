# 证明「用户喊停」的效力**跨进程重启**也成立。
#
# ⚠️ **为什么要有这条脚本**：产品语义已经变成「用户停过一次 ⇒ 之后每次启动 App
#    都不再自动起脑」⇒ ⇒ 这是一条**语义承诺** ⇒ ⇒ 承诺必须有运行时证据。
#
# 做法是 **A/B 对照**（光看「没起来」不够 ⇒ ⇒ 可能是环境坏了、也可能是设备抽风）：
#   - 处理组：配置里带着「用户喊停」⇒ force-stop + 重启 ⇒ 等 N 秒
#     ⇒ 期望：**Encephalon started 0 次**（大脑没自动起来）
#   - 对照组：把标记去掉 ⇒ force-stop + 重启 ⇒ 等 25 秒
#     ⇒ 期望：**Encephalon started ≥ 1 次**（大脑照旧自动起来）
# ⇒ ⇒ 唯一变量是那个标记 ⇒ ⇒ 因果钉死。
#
# ⚠️ 判据用 **Kotlin 侧**那行「Encephalon started」—— App 自己那行守卫日志
#    走 package:logging 的 info 级 ⇒ **没被放出来** ⇒ ⇒ 「logcat 里没看到它」
#    **不能**当「守卫没跑」的证据。
#
# ⚠️ 脚本会**先备份**设备上的 app_config.json ⇒ 收尾**原样还原** ⇒
#    不给用户的设备留残留状态。

param(
  [string]$Serial = '',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = '',
  [int]$WaitSeconds = 50,
  [int]$ControlWaitSeconds = 25
)

$ErrorActionPreference = 'Stop'
if (-not $OutDir) { $OutDir = 'C:\Projects\iBLOC\shadow\artifacts\brain-stop-persists' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$cfgFile = Join-Path $OutDir 'app_config.json'

function Say($msg) { Write-Output $msg }

# 读设备上的配置（run-as ⇒ 只有 debug 包能读）
function ReadDeviceConfig {
  $raw = (adb -s $Serial shell run-as $Package cat app_flutter/app_config.json 2>$null | Out-String).Trim()
  if (-not $raw) { return $null }
  return $raw
}

function WriteDeviceConfig([string]$json) {
  [IO.File]::WriteAllText($cfgFile, $json, (New-Object Text.UTF8Encoding($false)))
  adb -s $Serial push $cfgFile /data/local/tmp/cfg_prove.json | Out-Null
  adb -s $Serial shell run-as $Package cp /data/local/tmp/cfg_prove.json app_flutter/app_config.json | Out-Null
}

function RestartApp {
  adb -s $Serial shell am force-stop $Package | Out-Null
  Start-Sleep -Seconds 2
  adb -s $Serial logcat -c | Out-Null
  adb -s $Serial shell am start -n ($Package + '/' + $Activity) | Out-Null
}

function CountBrainStarts {
  $log = adb -s $Serial logcat -d -v time 2>$null
  return @($log | Select-String -Pattern 'Encephalon started').Count
}

Say ('设备：' + $Serial)
$original = ReadDeviceConfig
if (-not $original) { throw '读不到设备上的 app_config.json（run-as 失败 ⇒ 可能不是 debug 包）' }
Say ('原配置已备份（收尾原样还原）：' + $original)

$checks = [ordered]@{}

try {
  # ── 处理组：带着「用户喊停」重启 ⇒ 大脑不该自己起来 ──────────────
  Say ''
  Say '── 处理组：配置里带着「用户喊停」⇒ force-stop + 重启 ──────────'
  if ($original -match 'brainStoppedByUser') {
    $flagged = $original
  } else {
    # 原配置里没有 ⇒ 造一份带标记的（保留其它字段）
    $obj = $original | ConvertFrom-Json
    $obj | Add-Member -NotePropertyName 'brainStoppedByUser' -NotePropertyValue $true -Force
    $flagged = $obj | ConvertTo-Json -Compress
  }
  WriteDeviceConfig $flagged
  Say ('  配置 = ' + (ReadDeviceConfig))
  RestartApp
  Say ('  等 ' + $WaitSeconds + ' 秒（旧行为是「十几秒后自己回来」）……')
  Start-Sleep -Seconds $WaitSeconds
  $treatmentStarts = CountBrainStarts
  Say ('  Encephalon started 次数 = ' + $treatmentStarts)
  $checks['处理组：带着「用户喊停」重启 ⇒ 大脑没有自动起来'] = ($treatmentStarts -eq 0)

  # ── 对照组：把标记去掉 ⇒ 大脑照旧自动起来 ──────────────────────
  Say ''
  Say '── 对照组：去掉标记 ⇒ force-stop + 重启（唯一变量） ─────────────'
  $obj2 = $flagged | ConvertFrom-Json
  $obj2.PSObject.Properties.Remove('brainStoppedByUser')
  WriteDeviceConfig ($obj2 | ConvertTo-Json -Compress)
  Say ('  配置 = ' + (ReadDeviceConfig))
  RestartApp
  Say ('  等 ' + $ControlWaitSeconds + ' 秒……')
  Start-Sleep -Seconds $ControlWaitSeconds
  $controlStarts = CountBrainStarts
  Say ('  Encephalon started 次数 = ' + $controlStarts)
  $checks['对照组：去掉标记 ⇒ 大脑照旧自动起来'] = ($controlStarts -ge 1)
}
finally {
  Say ''
  Say '── 收尾：把设备配置原样还原 ─────────────────────────────────'
  WriteDeviceConfig $original
  Say ('  已还原 = ' + (ReadDeviceConfig))
  adb -s $Serial shell rm /data/local/tmp/cfg_prove.json 2>$null | Out-Null
  adb -s $Serial shell am force-stop $Package | Out-Null
}

Say ''
$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
foreach ($c in $checks.GetEnumerator()) {
  Say ('  ' + $(if ($c.Value) { 'OK ' } else { 'XX ' }) + $c.Key)
}
if ($failed.Count -gt 0) { Say ('没过：' + $failed.Count + ' 条'); exit 1 }
Say '全过'
Say ''
Say '=> 「用户喊停」的效力跨进程重启也成立（唯一变量 = 那个落盘标记）。'