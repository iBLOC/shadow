# 真机证明：**手机真的把 A2UI 界面画出来了**。
#
# ## 这条脚本补的是什么洞
#
# 到 2026-10-31 之前，A2UI 这条链的证据是**三段拼起来**的：
#
# - 端脑侧：Rust 单测 + JNI 宿主直测（真 `.so`、真嵌入式端脑）⇒ `/a2a` 真的在吐 surface；
# - 桌面侧：`a2ui.live.test.tsx` ⇒ 桌面客户端真的对着活的端脑画出了 DOM；
# - 移动侧：`test/widget/a2ui_*_test.dart` ⇒ **喂的是录下来的字节**。
#
# ⇒ **中间那截是空的**：没有任何一份证据说明「**手机**真的把界面画出来」。
# 录下来的字节证明不了它，因为真机上还有三件录下来的字节里没有的东西：
# 地址（端脑面端口每次启动随机分配）、钥匙（`X-Shadow-Key`）、以及真机渲染。
#
# ## 这条脚本做什么
#
# 1. 起 App ⇒ 从 logcat 里读出**端脑面的真实端口**；
# 2. `adb forward` 把那个端口映射到本机；
# 3. **不带钥匙**打 `/a2a` ⇒ 必须 **401**（证明门在，而且是在**这台设备上**）；
# 4. 从 App 的私有目录读出**它自己那把钥匙** ⇒ 带钥匙再打 ⇒ 必须 **200**，
#    且 SSE 里必须带 `surfaceUpdate` + `beginRendering` + **刚刚建的那条任务标题**
#    ⇒ 证明「服务端 → 线缆」这一段在真机上成立；
# 5. 驱动界面（进 A2UI → 发 `a2ui:tasks`）⇒ 截图 ⇒ 证明「线缆 → 屏幕」这一段成立。
#
# ## ⚠️ 为什么能从 App 的私有目录读钥匙
#
# `com.ibloc.shadow` 是 **debuggable** 的（`dumpsys package` 里 `flags=[ DEBUGGABLE … ]`）
# ⇒ `adb shell run-as com.ibloc.shadow cat files/shadow.key` 可读。
#
# ⚠️ **钥匙只在本进程内用，绝不打印** —— 与 AGENTS.md 里「两把钥匙都只写文件、不打印」
# 那条纪律一致：脚本只把它放进 HTTP 头。
#
# ## 怎么跑
#
# ```powershell
# cd C:\Projects\iBLOC\shadow
# pwsh -NoProfile -File scripts\prove-a2ui-on-device.ps1
# ```
#
# ⚠️ **坐标是本机（小米 2106118C / 1080x2400）实测的** —— 换机型要重测：
# `-TapA2uiEntry` / `-TapInput` / `-TapSend`。
# 不想动界面就加 `-SkipUi`（只验 1~4 那几段）。
param(
  [string]$Serial = '',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = '',
  # 界面坐标（本机实测，格式 "x,y"）——
  # ⚠️ **换机型要重测**：这三个点是按 1080x2400 的屏幕量的。
  # ⚠️ `TapInput` 是**键盘没开**时的位置；`TapSend` 是**键盘开了**之后的位置
  #    （键盘会把输入条顶上去 ⇒ 发送按钮跟着上移）。
  [string]$TapA2uiEntry = '884,180',
  [string]$TapInput = '480,2076',
  [string]$TapSend = '979,1364',
  [switch]$SkipUi
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Projects\iBLOC\shadow'
if (-not $OutDir) { $OutDir = Join-Path $repo 'artifacts\a2ui-device' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Say($msg) { Write-Output $msg }

# ── 0. 选设备 ─────────────────────────────────────────────────────
if (-not $Serial) {
  $devices = @(adb devices | Select-String -Pattern '\sdevice$' | ForEach-Object { ($_ -split '\s+')[0] })
  if ($devices.Count -ne 1) {
    throw "需要恰好一台设备在线，实测到 $($devices.Count) 台。用 -Serial 指定。"
  }
  $Serial = $devices[0]
}
Say "设备：$Serial"

# ── 1. 起 App，并从 logcat 里读端脑面端口 ─────────────────────────
#
# ⚠️ **端口每次启动随机分配** ⇒ 必须**起完再读**，不能写死。
#
# ⚠️ 而且必须**先 force-stop 再起** —— App 已经在跑的时候 `am start` 只是
# 「intent 已送达」（实测：`Warning: Activity not started, intent has been
# delivered to currently running top-most instance.`）⇒ **不会**有新的
# 「Encephalon started」那行 ⇒ 而 logcat 又被 `-c` 清过 ⇒ 端口永远读不到。
adb -s $Serial shell am force-stop $Package | Out-Null
Start-Sleep -Seconds 2
adb -s $Serial logcat -c
adb -s $Serial shell am start -n "$Package/$Activity" | Out-Null

$agentPort = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  $line = adb -s $Serial logcat -d -v time 2>$null |
    Select-String -Pattern 'EncephalonRuntime.*agent surface:\s*(\d+)' |
    Select-Object -Last 1
  if ($line -and $line.Matches[0].Groups[1].Value) {
    $agentPort = [int]$line.Matches[0].Groups[1].Value
    break
  }
}
if (-not $agentPort) { throw '没从 logcat 里读到端脑面端口 —— App 起来了吗？' }
Say "端脑面端口：$agentPort"

# ── 2. 把设备上的那个端口映射到本机 ─────────────────────────────
$localPort = 40000 + (Get-Random -Minimum 0 -Maximum 2000)
adb -s $Serial forward "tcp:$localPort" "tcp:$agentPort" | Out-Null
$base = "http://127.0.0.1:$localPort"
Say "映射：$base ⇒ 设备上的 $agentPort"

# ── 3. 读那两把钥匙（**只进 HTTP 头，绝不打印**）────────────────
$shadowKey = (adb -s $Serial shell "run-as $Package cat files/shadow.key" 2>$null | Out-String).Trim()
$adminToken = (adb -s $Serial shell "run-as $Package cat files/admin.key" 2>$null | Out-String).Trim()
if (-not $shadowKey) { throw "读不到 shadow.key —— $Package 是 debuggable 的吗？" }
Say "钥匙已取到（长度 shadow=$($shadowKey.Length) / admin=$($adminToken.Length)，**不打印**）"

# ── 4. 建一条**本次运行独有**的任务（断言才能精确到「画出来的是我建的那条」）──
$title = "A2UI-device-proof-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$createBody = @{
  title       = $title
  description = 'prove-a2ui-on-device.ps1 建的'
  priority    = 'high'
  tags        = @('a2ui-device')
} | ConvertTo-Json -Compress
$createResp = Invoke-WebRequest "$base/api/telencephalon/tasks" -Method POST `
  -Headers @{ 'Content-Type' = 'application/json'; 'X-Admin-Token' = $adminToken } `
  -Body $createBody -TimeoutSec 15 -SkipHttpErrorCheck
if ($createResp.StatusCode -ne 200) {
  throw "建任务失败：HTTP $($createResp.StatusCode) $($createResp.Content)"
}
Say "任务已建：$title"

# ── 5. 探针 A：**不带钥匙** ⇒ 必须 401（门是真的）────────────────
$streamBody = @{
  jsonrpc = '2.0'
  id      = 'probe-' + [Guid]::NewGuid().ToString('N')
  method  = 'message/stream'
  params  = @{
    message = @{
      role  = 'user'
      parts = @(@{ kind = 'text'; text = 'a2ui:tasks' })
    }
  }
} | ConvertTo-Json -Depth 8 -Compress

$noKey = Invoke-WebRequest "$base/a2a" -Method POST `
  -Headers @{ 'Content-Type' = 'application/json' } `
  -Body $streamBody -TimeoutSec 15 -SkipHttpErrorCheck
Say "探针 A（无钥匙）⇒ HTTP $($noKey.StatusCode)"

# ── 6. 探针 B：**带对的那把钥匙** ⇒ 必须 200 且 SSE 带 surface ────
$withKey = Invoke-WebRequest "$base/a2a" -Method POST `
  -Headers @{
    'Content-Type'     = 'application/json'
    'X-Shadow-Key'     = $shadowKey
    'X-A2A-Extensions' = 'https://a2ui.org/a2a-extension/a2ui/v0.8'
  } `
  -Body $streamBody -TimeoutSec 20 -SkipHttpErrorCheck
Say "探针 B（对钥匙）⇒ HTTP $($withKey.StatusCode)  content-type=$($withKey.Headers['content-type'])"

$sse = $withKey.Content

# ── 7. 判据（机器可判，不是「看着像」）────────────────────────────
$checks = [ordered]@{
  '无钥匙 ⇒ 401'                 = ($noKey.StatusCode -eq 401)
  '对钥匙 ⇒ 200'                 = ($withKey.StatusCode -eq 200)
  '响应是 SSE'                   = ($withKey.Headers['content-type'] -match 'text/event-stream')
  '载荷里有 surfaceUpdate'       = ($sse -match 'surfaceUpdate')
  '载荷里有 beginRendering'      = ($sse -match 'beginRendering')
  'surface id 是 shadow.tasks'   = ($sse -match 'shadow\.tasks')
  '载荷里有刚建的那条任务'        = ($sse -match [regex]::Escape($title))
}
$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
foreach ($c in $checks.GetEnumerator()) {
  Say ("  {0} {1}" -f $(if ($c.Value) { '✓' } else { '✗' }), $c.Key)
}
if ($failed.Count -gt 0) { Say "✗ 探针没过：$($failed.Count) 条" } else { Say '✓ 探针全过' }

# ── 8. 驱动界面 ⇒ 截图（证明「线缆 → 屏幕」那一段）────────────────
$shot = $null
if (-not $SkipUi) {
  function Tap([string]$xy) {
    $parts = $xy -split ','
    adb -s $Serial shell input tap ([int]$parts[0]) ([int]$parts[1]) | Out-Null
  }

  Say '驱动界面：进 A2UI → 发 a2ui:tasks'
  adb -s $Serial shell cmd statusbar collapse 2>$null | Out-Null
  Tap $TapA2uiEntry
  Start-Sleep -Seconds 2
  Tap $TapInput
  Start-Sleep -Seconds 1
  adb -s $Serial shell input text 'a2ui:tasks' | Out-Null
  Start-Sleep -Seconds 1
  Tap $TapSend
  Start-Sleep -Seconds 5

  $remote = '/sdcard/a2ui-device-proof.png'
  adb -s $Serial shell screencap -p $remote | Out-Null
  $shot = Join-Path $OutDir 'a2ui-device-proof.png'
  adb -s $Serial pull $remote $shot 2>&1 | Out-Null
  Say "截图：$shot"
}

# ── 9. 收尾：把转发撤掉（别在主机上留一条通往设备的通道）──────────
adb -s $Serial forward --remove "tcp:$localPort" 2>$null | Out-Null

if ($failed.Count -gt 0) { exit 1 }
Say ''
Say '⇒ 真机 A2UI 链路成立。'
exit 0
