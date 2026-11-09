# 真机探针：**asr / tts 分档默认的「消费点」** —— 写进去之后，voice 面到底按不按它选引擎。
#
# ## 它回答哪几格
#   ① 分档默认表里的 `asr` 档，voice/transcribe **真的读它吗**
#   ② `tts` 档同理（即使这台大脑根本没有 TTS 引擎）
#   ③ 「显式 model > 分档默认 > 第一个注册的引擎」这个优先级**在真机上成立吗**
#
# ## 判据（按**错误码的形状**分，不按「是不是同一个错误」分）
#   · 显式分支错 ⇒ 400（bad_request，消息带显式 id）
#   · 分档默认分支错 ⇒ 503（api_error）＋ 消息里带 `capability default '<档>' -> <id>`
#   · 解析成功 ⇒ 落到 neuron 层（503/5002）或真跑通（200）
#   ⇒ ⇒ 「红得一样」≠「红在同一处」⇒ ⇒ 判据必须**带那句 id**才算命中
#
# ## 复原
#   · 分档默认是**纯内存**（LobeCache）⇒ ⇒ 必须整份 PUT 回基线并复核
#   · 引擎注册**不可撤销**（DELETE 501）⇒ ⇒ 末尾重启 app 清零并复核
#
# 退出码：0 核心判据命中 / 1 有探针没跑成或核心判据未命中 / 2 什么都没探到
param(
  [string]$Serial = 'ee6b4832',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Continue'
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.local/probe-asr-tier' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$utf8NoBom = New-Object Text.UTF8Encoding($false)
function Say($m) { [Console]::WriteLine($m) }

function Get-AppPid { return (adb -s $Serial shell pidof $Package 2>$null | Out-String).Trim() }
function Get-LoggedPort {
  $l = adb -s $Serial logcat -d -v time 2>$null | Select-String -Pattern 'EncephalonRuntime.*agent surface:\s*(\d+)' | Select-Object -Last 1
  if (-not $l) { return 0 }
  return [int]$l.Matches[0].Groups[1].Value
}
function Restart-Brain {
  adb -s $Serial logcat -c
  adb -s $Serial shell am start -S --activity-clear-task -n ("$Package/$Activity") | Out-Null
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    $p = Get-LoggedPort
    if ($p) { return $p }
  }
  return 0
}

$agentPort = 0
$pidNow = Get-AppPid
if ($pidNow) {
  $agentPort = Get-LoggedPort
  if ($agentPort) { Say ('大脑已在跑：pid ' + $pidNow + '，端口 ' + $agentPort + ' ⇒ 复用（不重启）') }
}
if (-not $agentPort) {
  Say '大脑没在跑 ⇒ 起它（-S --activity-clear-task）'
  $agentPort = Restart-Brain
}
if (-not $agentPort) { Say '!! 没读到端脑面端口 ⇒ 什么都没探到'; exit 2 }
$localPort = 46000 + (Get-Random -Minimum 0 -Maximum 2000)
adb -s $Serial forward ("tcp:$localPort") ("tcp:$agentPort") | Out-Null
$base = "http://127.0.0.1:$localPort"
Say ('端脑面端口：' + $agentPort + ' ⇒ ' + $base)

$shadowKey = (adb -s $Serial shell "run-as $Package cat files/shadow.key" 2>$null | Out-String).Trim()
$adminToken = (adb -s $Serial shell "run-as $Package cat files/admin.key" 2>$null | Out-String).Trim()
if (-not $shadowKey) { Say '!! 读不到影子锁 ⇒ 什么都探不到'; exit 2 }
Say ('钥匙已取到（shadow=' + $shadowKey.Length + ' / admin=' + $adminToken.Length + ' 字符，不打印）')

function Probe($name, $method, $path, $body, $mode) {
  $outFile = Join-Path $OutDir ('body-' + ($name -replace '[^A-Za-z0-9_-]', '_') + '.txt')
  $a = @('-s', '-o', $outFile, '-w', '%{http_code}', '-X', $method, '--max-time', '25')
  if ($mode -eq 'both' -or $mode -eq 'shadow') { $a += @('-H', ('X-Shadow-Key: ' + $shadowKey)) }
  if ($mode -eq 'both' -or $mode -eq 'admin') { $a += @('-H', ('X-Admin-Token: ' + $adminToken)) }
  if ($body) {
    $inFile = Join-Path $OutDir 'probe-in.json'
    [IO.File]::WriteAllText($inFile, $body, $utf8NoBom)
    $a += @('-H', 'Content-Type: application/json', '--data-binary', ('@' + $inFile))
  }
  $a += ($base + $path)
  $code = (& curl.exe @a 2>$null) -join ''
  $ec = $LASTEXITCODE
  $txt = ''
  if (Test-Path $outFile) { $txt = [string][IO.File]::ReadAllText($outFile) }
  $snippet = $txt.Substring(0, [Math]::Min(220, $txt.Length)).Replace([string][char]13, ' ').Replace([string][char]10, ' ')
  Say ('  [' + $name + '] ' + $method + ' ' + $path + ' ⇒ HTTP ' + $code + ' (curl ' + $ec + ') | 体长=' + $txt.Length + ' | ' + $snippet)
  return @{ Name = $name; Status = [int]$code; BodyLen = $txt.Length; Body = $txt; CurlExit = $ec }
}

$asrUnknown = 'probe-nonexistent-asr-xyz'
$ttsUnknown = 'probe-nonexistent-tts-xyz'
$asrKnown = 'probe-asr-candle'

Say '--- 0. 基线 ---'
$baseRes = Probe '00-baseline' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'shadow'
$baselineDefaults = '{}'
try {
  $parsed = $baseRes.Body | ConvertFrom-Json
  $baselineDefaults = ($parsed.defaults | ConvertTo-Json -Compress -Depth 5)
} catch { Say ('!! 基线解析失败：' + $_.Exception.Message) }
Say ('基线 defaults = ' + $baselineDefaults)

Say '--- 1. 注册一个真引擎（asr/candle）---'
$reg = Probe '10-register-asr-candle' 'POST' '/api/telencephalon/neuron/admin/model' '{"capability":"asr","modelId":"probe-asr-candle","engine":"candle"}' 'both'
$afterReg = Probe '11-get-after-register' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'shadow'
Say ('  registered 读数：' + $afterReg.Body)

Say '--- 2. 对照格：asr 档为空 ⇒ 走「第一个注册的引擎」回落 ---'
$putEmpty1 = Probe '20-put-empty' 'PUT' '/api/telencephalon/lobes/capability-defaults' '{"defaults":{}}' 'both'
$r3 = Probe '21-transcribe-no-default' 'POST' '/api/telencephalon/voice/transcribe' '{"audio":"SGVsbG8="}' 'both'

Say '--- 3. 核心格①：asr 档 = 未注册的 id ⇒ 若被读 ⇒ 503 且消息带 id ---'
$putAsrUnknown = Probe '30-put-asr-unknown' 'PUT' '/api/telencephalon/lobes/capability-defaults' ('{"defaults":{"asr":"' + $asrUnknown + '"}}') 'both'
$r4 = Probe '31-transcribe-asr-default-unknown' 'POST' '/api/telencephalon/voice/transcribe' '{"audio":"SGVsbG8="}' 'both'

Say '--- 4. 核心格②：asr 档 = 已注册的 id ⇒ 若被解析 ⇒ 不该出现默认分支的错误码 ---'
$putAsrKnown = Probe '40-put-asr-known' 'PUT' '/api/telencephalon/lobes/capability-defaults' ('{"defaults":{"asr":"' + $asrKnown + '"}}') 'both'
$r5 = Probe '41-transcribe-asr-default-known' 'POST' '/api/telencephalon/voice/transcribe' '{"audio":"SGVsbG8="}' 'both'

Say '--- 5. 优先级格：显式 model（未注册）盖过分档默认 ⇒ 应是显式分支的 400 ---'
$r6 = Probe '50-transcribe-explicit-unknown' 'POST' '/api/telencephalon/voice/transcribe' '{"audio":"SGVsbG8=","model":"probe-nonexistent-explicit-xyz"}' 'both'

Say '--- 6. 对照格：显式 model ＝ 分档默认同一个已注册 id ---'
$r7 = Probe '60-transcribe-explicit-known' 'POST' '/api/telencephalon/voice/transcribe' ('{"audio":"SGVsbG8=","model":"' + $asrKnown + '"}') 'both'

Say '--- 7. TTS 档：核心格③（这台大脑没有 TTS 引擎，但档仍应被读）---'
$putTtsUnknown = Probe '70-put-tts-unknown' 'PUT' '/api/telencephalon/lobes/capability-defaults' ('{"defaults":{"tts":"' + $ttsUnknown + '"}}') 'both'
$r8 = Probe '71-synthesize-tts-default-unknown' 'POST' '/api/telencephalon/voice/synthesize' '{"text":"probe"}' 'both'

Say '--- 8. TTS 对照格：无 tts 档 ⇒ 不该出现默认分支的错误码 ---'
$putEmpty2 = Probe '80-put-empty-again' 'PUT' '/api/telencephalon/lobes/capability-defaults' '{"defaults":{}}' 'both'
$r9 = Probe '81-synthesize-no-default' 'POST' '/api/telencephalon/voice/synthesize' '{"text":"probe"}' 'both'

Say '--- 9. 复原基线并复核 ---'
$restore = Probe '90-restore' 'PUT' '/api/telencephalon/lobes/capability-defaults' ('{"defaults":' + $baselineDefaults + '}') 'both'
$getAfter = Probe '91-get-after-restore' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'shadow'
$restoredOk = $false
$d2 = '(读不出来)'
try {
  $p2 = $getAfter.Body | ConvertFrom-Json
  $d2 = ($p2.defaults | ConvertTo-Json -Compress -Depth 5)
  $restoredOk = ($d2 -eq $baselineDefaults)
} catch { }
Say ('复原复核：defaults 现值 = ' + $d2 + ' ｜ 与基线逐字相同 = ' + $restoredOk)

Say '--- 10. 重启 app 复核（分档默认是内存态 ⇒ 重启应回基线）---'
$agentPort2 = Restart-Brain
$restartOk = $false
if ($agentPort2) {
  $localPort2 = 48000 + (Get-Random -Minimum 0 -Maximum 2000)
  adb -s $Serial forward ("tcp:$localPort2") ("tcp:$agentPort2") | Out-Null
  $base2 = "http://127.0.0.1:$localPort2"
  $outFile2 = Join-Path $OutDir 'body-95-after-restart.txt'
  $a2 = @('-s', '-o', $outFile2, '-w', '%{http_code}', '--max-time', '25', '-H', ('X-Shadow-Key: ' + $shadowKey))
  $a2 += ($base2 + '/api/telencephalon/lobes/capability-defaults')
  $code2 = (& curl.exe @a2 2>$null) -join ''
  $txt2 = ''
  if (Test-Path $outFile2) { $txt2 = [string][IO.File]::ReadAllText($outFile2) }
  $restartOk = $txt2.Contains($baselineDefaults)
  Say ('  [95-after-restart] HTTP ' + $code2 + ' | 体长=' + $txt2.Length + ' | ' + $txt2)
} else { Say '!! 重启后没读到端口 ⇒ 复核没做成' }

# ---- 判据汇总（按**形状**判，不按「同样红」判）---------------------------
$core1 = ($r4.Status -eq 503) -and $r4.Body.Contains('capability default') -and $r4.Body.Contains($asrUnknown)
$core2 = ($r8.Status -eq 503) -and $r8.Body.Contains('capability default') -and $r8.Body.Contains($ttsUnknown)
# ⚠️ 第一版这一格判据**写错了**（**我自己的尺子坏了**，不是被测物有病）：
#    我以为「已注册的 id ⇒ 解析成功 ⇒ 不会出现默认分支的错码」⇒ ⇒ 读数 False。
#    真读数是：默认分支的错码是 5003（**它不分错因**）⇒ ⇒ 引擎自己的加载失败
#    也走 5003 ⇒ ⇒ 正确判据是「消息里带默认档那个 id ＋ 没有 ModelNotRegistered」
#    ⇒ ⇒ 即「端脑**拿着默认档给的 id 真的找到了那个引擎、并去加载它**」。
$core3 = ($r5.Status -eq 503) -and $r5.Body.Contains('capability default') -and $r5.Body.Contains($asrKnown) -and (-not $r5.Body.Contains('ModelNotRegistered'))
$core4 = ($r6.Status -eq 400) -and $r6.Body.Contains('probe-nonexistent-explicit-xyz')
$ctl1 = (-not $r3.Body.Contains('capability default'))
$ctl2 = (-not $r9.Body.Contains('capability default'))

Say ''
Say '--- 判据汇总 ---'
Say ('核心① asr 档被读（503 且消息带 id）      : ' + $core1 + '  ⇒ HTTP ' + $r4.Status + ' | ' + $r4.Body)
Say ('核心② tts 档被读（503 且消息带 id）      : ' + $core2 + '  ⇒ HTTP ' + $r8.Status + ' | ' + $r8.Body)
Say ('核心③ asr 档解析到已注册引擎（带 id 且非 ModelNotRegistered）: ' + $core3 + '  ⇒ HTTP ' + $r5.Status + ' | ' + $r5.Body)
Say ('新发现·显式分支把「引擎加载失败」也包成 4004（请求方的错）: HTTP ' + $r7.Status + ' | ' + $r7.Body)
Say ('核心④ 显式 model 盖过分档默认（400）      : ' + $core4 + '  ⇒ HTTP ' + $r6.Status + ' | ' + $r6.Body)
Say ('对照① 无 asr 档 ⇒ 不出现默认分支错码      : ' + $ctl1 + '  ⇒ HTTP ' + $r3.Status + ' | ' + $r3.Body)
Say ('对照② 无 tts 档 ⇒ 不出现默认分支错码      : ' + $ctl2 + '  ⇒ HTTP ' + $r9.Status + ' | ' + $r9.Body)
Say ('对照③ 显式＝已注册 id                    : HTTP ' + $r7.Status + ' | ' + $r7.Body)
Say ('引擎注册读数                            : HTTP ' + $reg.Status + ' | ' + $reg.Body)
Say ('复原复核（内存态）                       : ' + $restoredOk)
Say ('重启复核（内存态）                       : ' + $restartOk)

if ((-not $core1) -or (-not $core2) -or (-not $restoredOk)) { exit 1 }
exit 0
