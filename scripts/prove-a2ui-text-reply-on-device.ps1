# 真机证明：**端脑的原话真的上屏了**（移动端 A2UI「空 / 失败」三态的真机那一截）。
#
# ## 这条脚本补的是什么洞
#
# 到 2026-11-01 之前，「端脑说了话」这件事只在**录下来的字节**里被证明过：
#
# - 端脑侧：Rust 单测 ⇒ `views_hint` 那段纯文本确实会被发出来；
# - 移动端：`test/widget/a2ui_answer_states_test.dart` ⇒ 真起一个本地 HTTP
#   服务回放端脑的字节，断言那句话进了界面拿得到的流。
#
# ⇒ **真机上那一截是空的** —— 而真机一开跑就逮到：
# **状态栏已经变绿（「已连接到 Shadow A2A 服务器」⇒ 端脑确实回话了），
# 可内容区只有一个永远转圈的圈** ⇒ 端脑的原话**上不了屏**。
# 根因：`surfaceIdsProvider`（StreamProvider）永远停在 `loading`。
#
# ## 这条脚本做什么
#
# 1. 起 App ⇒ 从 logcat 读出**端脑面的真实端口**（每次启动随机分配）；
# 2. `adb forward` 映射到本机；
# 3. **不带钥匙**打 `/a2a` ⇒ 必须 **401**（证明门在，而且是在这台设备上）；
# 4. 带钥匙打 `/a2a`，发一条**不会命中任何视图**的话（`hello`）
#    ⇒ 端脑的 `resolve_view` 返回 `None` ⇒ 回**纯文本**（`views_hint`）
#    ⇒ ⇒ **服务端说的那句话**从这里取（**真相源**）；
# 5. 驱动界面（进「组件」⇒ 发同一条话）⇒ 截图
#    ⇒ ⇒ 断言「**屏幕中央有端脑那句话的文字**」且「**没在转圈**」。
#
# ## ⚠️ 为什么判据是「像素」而不是「读屏」
#
# ⚠️ **`uiautomator dump` 读不到 Flutter 的字** —— Flutter 的语义树
# 默认**不暴露**给 uiautomator（要有一个无障碍服务在跑才会建）
# ⇒ dump 回来的是一棵**全空**的树 ⇒ ⇒ 拿它判「屏幕上有没有那句话」
# **一定判不出**（它只会一直说「没有」）。
# ⇒ ⇒ 改判**像素**：端脑的原话是**深色正文**，而「还在转圈」是**绿色弧线**
# ⇒ ⇒ 两个判据互补：中央有深色文字 ⇒ 原话上屏了；中央只有绿色弧 ⇒ 还在转圈。
#
# ## ⚠️ 坐标是本机（小米 2106118C / 1080x2400）实测的
# 换机型要重测：-TapA2uiEntry / -TapInput / -TapSend。
param(
  [string]$Serial = '',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = '',
  # 「组件」按钮（对话页 AppBar）。
  [string]$TapA2uiEntry = '869,180',
  # ⚠️ **输入框** —— 本机实测 **y=2050** 才能聚焦（2076 / 2136 都不行，
  #    点了输入法**不弹** ⇒ 灌不进去字 ⇒ 后面全白搭）。
  [string]$TapInput = '480,2050',
  # ⚠️ **发送键** —— **键盘弹起之后**的位置（键盘会把输入条顶上去）。
  [string]$TapSend = '979,1389',
  # 发给端脑的那句话 —— ⚠️ **必须不命中任何视图**
  # （端脑的关键词兜底认「任务 / 待办 / task / todo / 智能体 / 叶区 / agent」）
  # ⇒ 命中了就会画 surface ⇒ 走不到「纯文本」那条路。
  [string]$Message = 'hello',
  [switch]$SkipUi
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Projects\iBLOC\shadow'
if (-not $OutDir) { $OutDir = Join-Path $repo 'artifacts\a2ui-text-reply' }
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
# ⚠️ 端口每次启动随机分配 ⇒ 必须**起完再读**。
# ⚠️ 必须**先 force-stop** —— App 已在跑时 `am start` 不会重启它
#    ⇒ 没有新的「Encephalon started」那行 ⇒ 端口永远读不到。
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

# ── 2. 映射到本机 ───────────────────────────────────────────────
$localPort = 41000 + (Get-Random -Minimum 0 -Maximum 2000)
adb -s $Serial forward "tcp:$localPort" "tcp:$agentPort" | Out-Null
$base = "http://127.0.0.1:$localPort"
Say "映射：$base ⇒ 设备上的 $agentPort"

# ── 3. 读影子钥匙（**只进 HTTP 头，绝不打印**）────────────────────
$shadowKey = (adb -s $Serial shell "run-as $Package cat files/shadow.key" 2>$null | Out-String).Trim()
if (-not $shadowKey) { throw "读不到 shadow.key —— $Package 是 debuggable 的吗？" }
Say "钥匙已取到（长度 shadow=$($shadowKey.Length)，**不打印**）"

# ⚠️ **语言要与 App 一致** —— 从设备系统语言推出 App 会发的那个值
#    （App 取的是 `languageCode` ⇒ 取 `zh-CN` 的 `zh`）。
$AcceptLanguage = ''
$sysLocale = (adb -s $Serial shell getprop persist.sys.locale 2>$null | Out-String).Trim()
if (-not $sysLocale) { $sysLocale = 'zh' }
$AcceptLanguage = ($sysLocale -split '[-_]')[0]
Say "Accept-Language：$AcceptLanguage"

# ── 4. 探针 A：**不带钥匙** ⇒ 必须 401（门是真的）────────────────
$streamBody = @{
  jsonrpc = '2.0'
  id      = 'probe-' + [Guid]::NewGuid().ToString('N')
  method  = 'message/stream'
  params  = @{
    message = @{
      role  = 'user'
      parts = @(@{ kind = 'text'; text = $Message })
    }
  }
} | ConvertTo-Json -Depth 8 -Compress

$noKey = Invoke-WebRequest "$base/a2a" -Method POST `
  -Headers @{ 'Content-Type' = 'application/json' } `
  -Body $streamBody -TimeoutSec 15 -SkipHttpErrorCheck
Say "探针 A（无钥匙）⇒ HTTP $($noKey.StatusCode)"

# ── 5. 探针 B：**带对的那把钥匙** ⇒ 200 + 端脑的那句纯文本 ───────
$withKey = Invoke-WebRequest "$base/a2a" -Method POST `
  -Headers @{
    'Content-Type'     = 'application/json'
    'X-Shadow-Key'     = $shadowKey
    'X-A2A-Extensions' = 'https://a2ui.org/a2a-extension/a2ui/v0.8'
    'Accept-Language'  = $AcceptLanguage
  } `
  -Body $streamBody -TimeoutSec 20 -SkipHttpErrorCheck
Say "探针 B（对钥匙）⇒ HTTP $($withKey.StatusCode)  content-type=$($withKey.Headers['content-type'])"

$sse = [string]$withKey.Content

# 取端脑那句**纯文本**。
#
# ⚠️ **不要用正则去抠 JSON 里的 "text"** —— 踩过：正则捕获的是**引号内**的内容
# ⇒ 重建 JSON 时把引号丢了 ⇒ `ConvertFrom-Json` 报
# 「Unexpected character encountered while parsing value: T」⇒ **静默**（catch 吞了）
# ⇒ 看起来像「端脑没回话」。
# ⇒ ⇒ 走**结构化**：整条 `data:` 行 `ConvertFrom-Json`，再取
# `result.status.message.parts` 里 `kind = 'text'` 的那段。
$brainText = ''
foreach ($line in ($sse -split '\r?\n')) {
  if (-not $line.StartsWith('data:')) { continue }
  $json = $line.Substring(5).Trim()
  if (-not $json) { continue }
  try { $evt = $json | ConvertFrom-Json } catch { continue }
  $parts = $evt.result.status.message.parts
  foreach ($p in @($parts)) {
    if ($p.kind -eq 'text' -and $p.text) { $brainText = [string]$p.text }
  }
}
if (-not $brainText) { throw 'SSE 里没解析出端脑的纯文本 —— 端脑这次画界面了？' }
Say "端脑的原话（服务端）：$brainText"

# ── 6. 驱动界面 ⇒ 截图 ⇒ 像素级判读 ────────────────────────────
$screenHasWords = $false
$screenStillSpinning = $false
if (-not $SkipUi) {
  function Tap([string]$xy) {
    $parts = $xy -split ','
    adb -s $Serial shell input tap ([int]$parts[0]) ([int]$parts[1]) | Out-Null
  }

  Say "驱动界面：进「组件」⇒ 发 $Message"
  adb -s $Serial shell cmd statusbar collapse 2>$null | Out-Null
  Tap $TapA2uiEntry
  Start-Sleep -Seconds 3
  Tap $TapInput
  Start-Sleep -Seconds 2
  adb -s $Serial shell input text $Message | Out-Null
  Start-Sleep -Seconds 2
  Tap $TapSend
  Start-Sleep -Seconds 8

  $remote = '/sdcard/a2ui-text-reply.png'
  adb -s $Serial shell screencap -p $remote | Out-Null
  $shot = Join-Path $OutDir 'a2ui-text-reply.png'
  adb -s $Serial pull $remote $shot 2>&1 | Out-Null
  Say "截图：$shot"

  # ── 像素判读 ──────────────────────────────────────────────────
  # ⚠️ 判据（**互补**的两个）：
  #   ① 中央有**深色**像素 ⇒ 那就是端脑原话的正文 ⇒ 原话上屏了；
  #   ② 中央有**绿色**像素 ⇒ 那是「还在转圈」的弧线 ⇒ 原话**没**上屏。
  # ⚠️ 只看**中央那一块**（避开顶部状态栏 —— 它本来就是绿的）。
  Add-Type -AssemblyName System.Drawing
  $bmp = [System.Drawing.Bitmap]::FromFile($shot)
  try {
    $x0 = [int]($bmp.Width * 0.15); $x1 = [int]($bmp.Width * 0.85)
    $y0 = [int]($bmp.Height * 0.35); $y1 = [int]($bmp.Height * 0.70)
    $dark = 0; $green = 0; $total = 0
    for ($y = $y0; $y -lt $y1; $y += 3) {
      for ($x = $x0; $x -lt $x1; $x += 3) {
        $c = $bmp.GetPixel($x, $y)
        $total++
        if ($c.R -lt 110 -and $c.G -lt 110 -and $c.B -lt 110) { $dark++ }
        elseif ($c.G -gt 120 -and $c.G - $c.R -gt 40 -and $c.G - $c.B -gt 40) { $green++ }
      }
    }
    $darkRatio = [math]::Round(100 * $dark / $total, 2)
    $greenRatio = [math]::Round(100 * $green / $total, 2)
    Say ("中央区域像素：深色 $darkRatio% / 绿色 $greenRatio%（采样 $total 点）"
    )
    $screenHasWords = ($darkRatio -ge 0.25)
    $screenStillSpinning = ($greenRatio -ge 0.25)
  } finally {
    $bmp.Dispose()
  }
}

# ── 7. 判据（机器可判）─────────────────────────────────────────
$checks = [ordered]@{
  '无钥匙 ⇒ 401'                 = ($noKey.StatusCode -eq 401)
  '对钥匙 ⇒ 200'                 = ($withKey.StatusCode -eq 200)
  '响应是 SSE'                   = ($withKey.Headers['content-type'] -match 'text/event-stream')
  '端脑这次回的是纯文本'          = ($brainText.Length -gt 0)
  '端脑的原话提到了 A2UI'        = ($brainText -match 'A2UI')
  '端脑的原话没被画成 surface'    = ($sse -notmatch 'surfaceUpdate')
  '屏幕上有端脑的那句话'          = $screenHasWords
  '屏幕没在转圈'                  = (-not $screenStillSpinning)
}
$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
foreach ($c in $checks.GetEnumerator()) {
  Say ("  {0} {1}" -f $(if ($c.Value) { 'OK ' } else { 'XX ' }), $c.Key)
}
if ($failed.Count -gt 0) { Say "没过：$($failed.Count) 条" } else { Say '全过' }

# ── 8. 收尾：撤掉转发（别在主机上留一条通往设备的通道）──────────
adb -s $Serial forward --remove "tcp:$localPort" 2>$null | Out-Null

if ($failed.Count -gt 0) { exit 1 }
Say ''
Say '=> 真机上，端脑的原话上屏了。'
exit 0
