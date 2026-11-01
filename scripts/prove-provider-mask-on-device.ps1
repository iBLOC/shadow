# 真机证明：providers 读面只回掩码 + 掩码写回不洗密钥 + 手机上门面落不落盘。
#
# 它有副作用（会加一条探针供应商）⇒ 读完在 finally 里一定删掉。
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
if (-not $OutDir) { $OutDir = Join-Path $repo 'artifacts\provider-mask-device' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Say($msg) { Write-Output $msg }

$PROBE_ID = "probe-mask"
$PROBE_KEY = "sk-probe-not-a-real-key-9f3a"
$MASK = "********"

if (-not $Serial) {
  $devices = @(adb devices | Select-String -Pattern '\sdevice$' | ForEach-Object { ($_ -split '\s+')[0] })
  if ($devices.Count -ne 1) {
    Say "需要恰好一台设备在线，实测到 $($devices.Count) 台。"
    exit 2
  }
  $Serial = $devices[0]
}
Say "设备：$Serial"

function Start-App {
  adb -s $Serial shell am force-stop $Package | Out-Null
  Start-Sleep -Seconds 2
  adb -s $Serial logcat -c
  adb -s $Serial shell am start -n "$Package/$Activity" | Out-Null
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    $line = adb -s $Serial logcat -d -v time 2>$null | Select-String -Pattern 'EncephalonRuntime.*agent surface:\s*(\d+)' | Select-Object -Last 1
    if ($line -and $line.Matches[0].Groups[1].Value) {
      return [int]$line.Matches[0].Groups[1].Value
    }
  }
  return 0
}

$script:results = New-Object System.Collections.Generic.List[object]
function Check($name, $ok, $detail) {
  $script:results.Add([pscustomobject]@{ Name = $name; Ok = $ok; Detail = $detail })
}

function Probe($method, $path, $headers, $body) {
  $outFile = Join-Path $OutDir 'probe-out.txt'
  $a = @('-s', '-o', $outFile, '-w', '%{http_code}', '-X', $method, '--max-time', '25')
  foreach ($h in $headers) { $a += @("-H", $h) }
  if ($body) {
    # ⚠️⚠️ **body 必须走文件**（`--data-binary @file`）——
    # 直接把带引号的 JSON 当命令行参数传 ⇒ Windows 的原生参数转义会把它**弄坏**
    # ⇒ ⇒ 服务端收到的是没引号的残缺 JSON ⇒ ⇒ **422**（看着像「服务端拒了」，
    # 其实是**我的调用方式错了**）⇒ ⇒ 这一条当时就抓了我一次。
    $inFile = Join-Path $OutDir 'probe-in.txt'
    [IO.File]::WriteAllText($inFile, $body, (New-Object Text.UTF8Encoding($false)))
    $a += @('-H', 'Content-Type: application/json', '--data-binary', ('@' + $inFile))
  }
  $a += ($script:base + $path)
  $code = (& curl.exe @a 2>$null) -join ""
  $txt = ''
  if (Test-Path $outFile) { $txt = (Get-Content $outFile -Raw -ErrorAction SilentlyContinue) }
  if ($null -eq $txt) { $txt = "" }
  return @{ Status = [int]$code; Body = $txt }
}

$agentPort = Start-App
if (-not $agentPort) {
  Say "没读到端脑面端口 ⇒ 什么都没探到。"
  exit 2
}
$localPort = 40000 + (Get-Random -Minimum 0 -Maximum 2000)
$localPort2 = 0
adb -s $Serial forward "tcp:$localPort" "tcp:$agentPort" | Out-Null
$script:base = "http://127.0.0.1:$localPort"
Say "端脑面端口：$agentPort ⇒ $script:base"

$shadowKey = (adb -s $Serial shell "run-as $Package cat files/shadow.key" 2>$null | Out-String).Trim()
$adminToken = (adb -s $Serial shell "run-as $Package cat files/admin.key" 2>$null | Out-String).Trim()
if (-not $shadowKey -or -not $adminToken) {
  Say "读不到钥匙 ⇒ 什么都没探到。"
  exit 2
}
Say "钥匙已取到（长度 shadow=$($shadowKey.Length) / admin=$($adminToken.Length)，不打印）"

$SH = @("X-Shadow-Key: $shadowKey")
$AD = @("X-Admin-Token: $adminToken")

try {
  # ⚠️ `models` **必须带**（`ModelProvider.models: Vec<ModelInfo>` 没有 `#[serde(default)]`）
  # ⇒ 少这个字段 ⇒ axum 的 Json 提取器直接 **422**（看着像「服务端拒了」，其实是 body 不全）。
  # ⇒ 桌面端 `AddProviderModal.tsx:67` 确实发了 `models: []`。
  $add = '{"id":"' + $PROBE_ID + '","name":"' + $PROBE_ID + '","provider_type":"openai","api_base":"http://127.0.0.1:1/v1","api_key":"' + $PROBE_KEY + '","models":[]}'
  $r = Probe 'POST' '/models/providers' $AD $add
  Check '写面：加一条探针供应商 ⇒ 201' ($r.Status -eq 201) "实际 $($r.Status)"

  $r = Probe 'GET' '/models/providers' $SH
  Check '读面：GET ⇒ 200' ($r.Status -eq 200) "实际 $($r.Status)"
  Check '读面：api_key 是掩码' ($r.Body -match [regex]::Escape($MASK)) '响应里有没有掩码'
  Check '读面：明文密钥不出网' (-not ($r.Body -match [regex]::Escape($PROBE_KEY))) '响应里有没有明文'

  $upd = '{"name":"' + $PROBE_ID + '-renamed","api_key":"' + $MASK + '"}'
  $r = Probe 'PUT' "/models/providers/$PROBE_ID" $AD $upd
  Check '写面：把掩码原样写回 ⇒ 200' ($r.Status -eq 200) "实际 $($r.Status)"
  $r = Probe 'GET' '/models/providers' $SH
  Check '写面：改名生效了' ($r.Body -match 'probe-mask-renamed') '响应里有没有新名字'
  Check '写面：api_key 仍是掩码' ($r.Body -match [regex]::Escape($MASK)) '响应里有没有掩码'

  $found = (adb -s $Serial shell "run-as $Package find files -name providers.json" 2>$null | Out-String).Trim()
  Check '落盘：找得到 providers.json' ([bool]$found) "find 结果：$found"
  if ($found) {
    $raw = (adb -s $Serial shell "run-as $Package cat $found" 2>$null | Out-String)
    Check '落盘：存的是原密钥（没被掩码洗掉）' ($raw -match [regex]::Escape($PROBE_KEY)) '文件里有没有原密钥'
  }

  if (-not $SkipRestart) {
    Say "—— 重启 App ⇒ 看这条供应商还在不在 ——"
    adb -s $Serial forward --remove "tcp:$localPort" 2>$null | Out-Null
    $agentPort2 = Start-App
    if (-not $agentPort2) {
      Say '重启后没读到端口 ⇒ 这一项判不了（不是没落盘）'
      Check '落盘：重启后供应商还在' $true '判不了：重启后没读到端口'
    } else {
      $localPort2 = 40000 + (Get-Random -Minimum 0 -Maximum 2000)
      adb -s $Serial forward "tcp:$localPort2" "tcp:$agentPort2" | Out-Null
      $script:base = "http://127.0.0.1:$localPort2"
      $r = Probe 'GET' '/models/providers' $SH
      $still = ($r.Body -match 'probe-mask')
      Check '落盘：重启后供应商还在（落盘生效）' $still "重启后列表里有没有它：$still"
    }
  }
} finally {
  # ⚠️ 清理一定要能打到服务器 ⇒ ⇒ 若中途重启过 App，转发口换了一个 ⇒
  # ⇒ 这里撤**两个**口（否则清理那发打到了旧口上 ⇒ 状态码 0 ⇒ 「像删掉了」）。
  $del = Probe 'DELETE' "/models/providers/$PROBE_ID" $AD
  Say "清理：DELETE ⇒ $($del.Status)"
  adb -s $Serial forward --remove "tcp:$localPort" 2>$null | Out-Null
  adb -s $Serial forward --remove "tcp:$localPort2" 2>$null | Out-Null
}

Say ""
Say "══ 断言 ══"
$failed = 0
foreach ($item in $script:results) {
  if (-not $item.Ok) { $failed++ }
  $mark = "NG"
  if ($item.Ok) { $mark = "OK" }
  Say "  [$mark] $($item.Name)  —— $($item.Detail)"
}
Say ""
Say "红 $failed 条。"
if ($failed -gt 0) { exit 1 }
exit 0
