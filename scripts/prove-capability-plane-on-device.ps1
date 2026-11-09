# 真机探针：**能力面**（分档默认模型 ＋ agent 能力声明）在手机端那份大脑上的真读数。
#
# ## 它回答哪三格
#   ① PUT /lobes/capability-defaults 收不收口校验 model id（能不能指向没注册的引擎）
#   ② 词表里有、但这台大脑**不暴露**的档（vad）⇒ PUT 收不收 / agent 声明收不收
#   ③ POST /admin/agents/create 声明 required_capabilities 会被什么拒
#
# ## 判据纪律
#   · 记「状态码 ＋ 体长 ＋ 体首 200 字」—— 404 有两种（空体 = 路由不存在）
#   · 分档默认是**纯内存**（LobeCache）⇒ 探针跑完必须**用基线原值整份 PUT 复原**并复核
#   · agent 创建会**写海马体** ⇒ 先探海马体通不通；通了才建探针 agent，并如实报告能否清掉
#
# ## ⚠️ 起 app 的两个坑（2026-11-11 真机实测）
#   ① MIUI 会把 app **自动拉活** ⇒ ⇒ `am start` 只把已有实例带到前台 ⇒ ⇒
#      **不会**再打一行「started on port」⇒ ⇒ 「先清 logcat 再等新端口」永远等不到；
#   ② app 的**任务记录可能是陈的** ⇒ ⇒ `am start` 报「已交付给当前顶层实例」⇒ ⇒
#      **进程根本没被拉起来**（pidof 空、无 EncephalonRuntime 日志）⇒ ⇒ 必须 `-S --activity-clear-task`。
#
# 退出码：0 全部探完且基线已复原 / 1 有探针没跑成 / 2 什么都没探到（端口没起来、钥匙读不到）
param(
  [string]$Serial = 'ee6b4832',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Continue'
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.local/probe-capability-plane' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$utf8NoBom = New-Object Text.UTF8Encoding($false)
function Say($m) { [Console]::WriteLine($m) }

# ---- 1. 端脑面端口：先复用活着的，必要时才重启 ---------------------------
function Get-AppPid {
  return (adb -s $Serial shell pidof $Package 2>$null | Out-String).Trim()
}
function Get-LoggedPort {
  $l = adb -s $Serial logcat -d -v time 2>$null | Select-String -Pattern 'EncephalonRuntime.*agent surface:\s*(\d+)' | Select-Object -Last 1
  if (-not $l) { return 0 }
  return [int]$l.Matches[0].Groups[1].Value
}
function Restart-Brain {
  # ⚠️ `-S --activity-clear-task`：任务记录陈旧时，只有它能把进程真拉起来
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
  if ($agentPort) { Say ("大脑已在跑：pid " + $pidNow + "，端口 " + $agentPort + " ⇒ 复用（不重启）") }
}
if (-not $agentPort) {
  Say "大脑没在跑 ⇒ 起它（-S --activity-clear-task）"
  $agentPort = Restart-Brain
}
if (-not $agentPort) {
  Say '!! 没读到端脑面端口 ⇒ 什么都没探到'
  exit 2
}
$localPort = 42000 + (Get-Random -Minimum 0 -Maximum 2000)
adb -s $Serial forward "tcp:$localPort" "tcp:$agentPort" | Out-Null
$base = "http://127.0.0.1:$localPort"
Say ("端脑面端口：" + $agentPort + " ⇒ " + $base)

# ---- 2. 取钥匙（**不打印**）-------------------------------------------------
$shadowKey = (adb -s $Serial shell "run-as $Package cat files/shadow.key" 2>$null | Out-String).Trim()
$adminToken = (adb -s $Serial shell "run-as $Package cat files/admin.key" 2>$null | Out-String).Trim()
if (-not $shadowKey) { Say "!! 读不到影子锁 ⇒ 什么都探不到"; exit 2 }
Say ("钥匙已取到（shadow=" + $shadowKey.Length + " / admin=" + $adminToken.Length + " 字符，不打印）")

function Probe($name, $method, $path, $body, $mode) {
  # mode: both | shadow | admin | none | wrongadmin
  $outFile = Join-Path $OutDir ("body-" + ($name -replace "[^A-Za-z0-9_-]", "_") + ".txt")
  $a = @("-s", "-o", $outFile, "-w", "%{http_code}", "-X", $method, "--max-time", "25")
  if ($mode -eq "both" -or $mode -eq "shadow") { $a += @("-H", ("X-Shadow-Key: " + $shadowKey)) }
  if ($mode -eq "both" -or $mode -eq "admin") { $a += @("-H", ("X-Admin-Token: " + $adminToken)) }
  if ($mode -eq "wrongadmin") { $a += @("-H", "X-Admin-Token: definitely-not-the-admin-token") }
  if ($body) {
    $inFile = Join-Path $OutDir "probe-in.json"
    [IO.File]::WriteAllText($inFile, $body, $utf8NoBom)
    $a += @("-H", "Content-Type: application/json", "--data-binary", ("@" + $inFile))
  }
  $a += ($base + $path)
  $code = (& curl.exe @a 2>$null) -join ""
  $txt = ""
  if (Test-Path $outFile) { $txt = [string](Get-Content $outFile -Raw -ErrorAction SilentlyContinue) }
  if ($null -eq $txt) { $txt = "" }
  $snippet = ($txt.Substring(0, [Math]::Min(200, $txt.Length))) -replace "\r?\n", " "
  Say ("  [" + $name + "] " + $method + " " + $path + " ⇒ HTTP " + $code + " | 体长=" + $txt.Length + " | " + $snippet)
  return @{ Name = $name; Status = [int]$code; BodyLen = $txt.Length; Body = $txt }
}

# ---- 3. 基线（必须先读，后面按它复原）-------------------------------------
Say '--- 读面基线与门 ---'
$baseRes = Probe '00-baseline-get' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'shadow'
$noKeyRes = Probe '01-get-nokey' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'none'
$adminOnlyRes = Probe '02-get-adminonly' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'admin'

$baselineDefaults = "{}"
try {
  $parsed = $baseRes.Body | ConvertFrom-Json
  $baselineDefaults = ($parsed.defaults | ConvertTo-Json -Compress -Depth 5)
} catch { Say ("!! 基线解析失败：" + $_.Exception.Message) }
Say ("基线 defaults = " + $baselineDefaults)

# ---- 4. PUT 的四道门 -------------------------------------------------------
Say '--- PUT /lobes/capability-defaults：写门与收口 ---'
$putNoAuth = Probe '10-put-noadmin' 'PUT' '/api/telencephalon/lobes/capability-defaults' '{"defaults":{"llm":"probe-llm"}}' 'shadow'
$putWrong = Probe '11-put-wrongadmin' 'PUT' '/api/telencephalon/lobes/capability-defaults' '{"defaults":{"llm":"probe-llm"}}' 'wrongadmin'
$putUnknownCap = Probe '12-put-unknown-cap' 'PUT' '/api/telencephalon/lobes/capability-defaults' '{"defaults":{"stt":"probe"}}' 'both'
$putEmptyVal = Probe '13-put-empty-value' 'PUT' '/api/telencephalon/lobes/capability-defaults' '{"defaults":{"asr":""}}' 'both'
$putNoDefaults = Probe '14-put-no-defaults' 'PUT' '/api/telencephalon/lobes/capability-defaults' '{}' 'both'

# ---- 5. 落点与整份替换 -----------------------------------------------------
Say '--- 落点：未注册的 id 收不收 / 整份替换 / vad 收不收 ---'
$putUnregistered = Probe '20-put-unregistered-id' 'PUT' '/api/telencephalon/lobes/capability-defaults' '{"defaults":{"asr":"probe-nonexistent-engine-xyz"}}' 'both'
$getAfterUnreg = Probe '21-get-after-unregistered' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'shadow'
$putLlmOnly = Probe '22-put-llm-only' 'PUT' '/api/telencephalon/lobes/capability-defaults' '{"defaults":{"llm":"probe-llm-xyz"}}' 'both'
$getAfterLlm = Probe '23-get-after-llm-only' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'shadow'
$putVad = Probe '24-put-vad' 'PUT' '/api/telencephalon/lobes/capability-defaults' '{"defaults":{"vad":"probe-vad-xyz"}}' 'both'
$getAfterVad = Probe '25-get-after-vad' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'shadow'

# ---- 6. 复原（整份 PUT 回基线）并复核 --------------------------------------
Say '--- 复原基线 ---'
$restore = Probe '30-restore-baseline' 'PUT' '/api/telencephalon/lobes/capability-defaults' ('{"defaults":' + $baselineDefaults + '}') 'both'
$getAfterRestore = Probe '31-get-after-restore' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'shadow'
$restoredOk = $false
$d2 = "(读不出来)"
try {
  $p2 = $getAfterRestore.Body | ConvertFrom-Json
  $d2 = ($p2.defaults | ConvertTo-Json -Compress -Depth 5)
  $restoredOk = ($d2 -eq $baselineDefaults)
} catch { }
Say ("复原复核：defaults 现值 = " + $d2 + " ｜ 与基线逐字相同 = " + $restoredOk)

# ---- 7. agent 能力声明 -----------------------------------------------------
Say '--- POST /admin/agents/create：能力声明 ---'
$hippoStats = Probe '40-hippo-preview-stats' 'GET' '/api/telencephalon/hippocampus/preview/stats' $null 'both'
$createNoAuth = Probe '41-create-noadmin' 'POST' '/api/telencephalon/admin/agents/create' '{"name":"probe-capability-plane-a","system_prompt":"probe","required_capabilities":["asr","tts"]}' 'shadow'
$createAsrTts = Probe '42-create-asr-tts' 'POST' '/api/telencephalon/admin/agents/create' '{"name":"probe-capability-plane-b","system_prompt":"probe","required_capabilities":["asr","tts"]}' 'both'
$createVad = Probe '43-create-vad' 'POST' '/api/telencephalon/admin/agents/create' '{"name":"probe-capability-plane-c","system_prompt":"probe","required_capabilities":["vad"]}' 'both'
$createStt = Probe '44-create-unknown-word' 'POST' '/api/telencephalon/admin/agents/create' '{"name":"probe-capability-plane-d","system_prompt":"probe","required_capabilities":["stt"]}' 'both'
$listAgents = Probe '45-list-agents' 'GET' '/api/telencephalon/agents' $null 'both'

# ---- 8. 引擎注册面（让 registered.asr 变非空）-------------------------------
Say '--- POST /neuron/admin/model：引擎注册面 ---'
# ⚠️ `ModelRegistration` 是 `#[serde(rename_all = "camelCase")]` ⇒ ⇒ **字段名是 camelCase**。
#    （第一版探针用 snake_case ⇒ ⇒ 被 serde 挡在 400 "missing field modelId" ⇒ ⇒
#      **那一格没探成** —— 尺子没对着被测物。）
$regAsr = Probe '50-register-asr' 'POST' '/api/telencephalon/neuron/admin/model' '{"capability":"asr","modelId":"probe-asr-engine-xyz","engine":"probe"}' 'both'
$regTts = Probe '51-register-tts' 'POST' '/api/telencephalon/neuron/admin/model' '{"capability":"tts","modelId":"probe-tts-engine-xyz","engine":"probe"}' 'both'
$regVad = Probe '52-register-vad' 'POST' '/api/telencephalon/neuron/admin/model' '{"capability":"vad","modelId":"probe-vad-engine-xyz","engine":"probe"}' 'both'
$regChronos2 = Probe '53-register-chronos2' 'POST' '/api/telencephalon/neuron/admin/model' '{"capability":"chronos2","modelId":"probe-chronos2-xyz","engine":"probe"}' 'both'
# ⚠️ `register_model` 对 asr/tts **写的正是 asr_registry / tts_registry** ⇒ ⇒
#    那就是 `registered` 读的那张表 ⇒ ⇒ 上一轮 registered 仍空，**只是因为 engine 名是假的**
#    （"Invalid ASR engine: unknown AsrImpl: probe"）⇒ ⇒ 这一相用**真引擎名**再试。
$regCand = @()
foreach ($e in @('candle', 'tract', 'sherpa')) {
  $regCand += ,(Probe ('60-register-asr-' + $e) 'POST' '/api/telencephalon/neuron/admin/model' ('{"capability":"asr","modelId":"probe-asr-' + $e + '","engine":"' + $e + '"}') 'both')
}
foreach ($e in @('burn')) {
  $regCand += ,(Probe ('61-register-tts-' + $e) 'POST' '/api/telencephalon/neuron/admin/model' ('{"capability":"tts","modelId":"probe-tts-' + $e + '","engine":"' + $e + '"}') 'both')
}
$getAfterCand = Probe '62-get-after-candidates' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'shadow'
$previewAfterCand = Probe '63-preview-after-candidates' 'GET' '/api/telencephalon/neuron/preview/models' $null 'both'
$unload = Probe '64-unload-asr' 'DELETE' '/api/telencephalon/neuron/admin/model/asr/probe-asr-candle' $null 'both'

$getAfterReg = Probe '54-get-after-register' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'shadow'
$previewModels = Probe '55-preview-models' 'GET' '/api/telencephalon/neuron/preview/models' $null 'both'
$putRegistered = Probe '56-put-registered-id' 'PUT' '/api/telencephalon/lobes/capability-defaults' '{"defaults":{"asr":"probe-asr-engine-xyz"}}' 'both'
$restore2 = Probe '57-restore-again' 'PUT' '/api/telencephalon/lobes/capability-defaults' ('{"defaults":' + $baselineDefaults + '}') 'both'
$getAfterRestore2 = Probe '58-get-after-restore2' 'GET' '/api/telencephalon/lobes/capability-defaults' $null 'shadow'
$restoredOk2 = $false
try {
  $p3 = $getAfterRestore2.Body | ConvertFrom-Json
  $d3 = ($p3.defaults | ConvertTo-Json -Compress -Depth 5)
  $restoredOk2 = ($d3 -eq $baselineDefaults)
} catch { }

# ---- 9. 收尾：重启 app（内存态清零）＋ 复核 --------------------------------
Say '--- 重启 app 复核（分档默认是内存态 ⇒ 重启应回到基线）---'
$agentPort2 = Restart-Brain
if ($agentPort2) {
  $localPort2 = 44000 + (Get-Random -Minimum 0 -Maximum 2000)
  adb -s $Serial forward "tcp:$localPort2" "tcp:$agentPort2" | Out-Null
  $base2 = "http://127.0.0.1:$localPort2"
  $outFile2 = Join-Path $OutDir "body-70-after-restart.txt"
  $a2 = @("-s", "-o", $outFile2, "-w", "%{http_code}", "--max-time", "25", "-H", ("X-Shadow-Key: " + $shadowKey))
  $a2 += ($base2 + "/api/telencephalon/lobes/capability-defaults")
  $code2 = (& curl.exe @a2 2>$null) -join ""
  $txt2 = ""
  if (Test-Path $outFile2) { $txt2 = [string](Get-Content $outFile2 -Raw -ErrorAction SilentlyContinue) }
  Say ("  [70-after-restart] HTTP " + $code2 + " | 体长=" + $txt2.Length + " | " + (($txt2.Substring(0, [Math]::Min(200, $txt2.Length))) -replace "\r?\n", " "))
} else { Say ("!! 重启后没读到端口 ⇒ 复核没做成") }

Say ""
Say '--- 探针小结（状态码/体长见上）---'
Say ("基线 defaults              : " + $baselineDefaults)
Say ("读门：无任何头             : HTTP " + $noKeyRes.Status + "（体长 " + $noKeyRes.BodyLen + "）")
Say ("读门：只带 admin 头        : HTTP " + $adminOnlyRes.Status + "（体长 " + $adminOnlyRes.BodyLen + "）")
Say ("写门：无 admin 头          : HTTP " + $putNoAuth.Status + "（体长 " + $putNoAuth.BodyLen + "）")
Say ("写门：错 admin 头          : HTTP " + $putWrong.Status + "（体长 " + $putWrong.BodyLen + "）")
Say ("未知能力词 stt            : HTTP " + $putUnknownCap.Status + " ⇒ " + $putUnknownCap.Body)
Say ("空值模型 id               : HTTP " + $putEmptyVal.Status + " ⇒ " + $putEmptyVal.Body)
Say ("缺 defaults 字段          : HTTP " + $putNoDefaults.Status + " ⇒ " + $putNoDefaults.Body)
Say ("未注册的 id               : HTTP " + $putUnregistered.Status + " ⇒ 落点 GET " + $getAfterUnreg.Body)
Say ("整份替换（asr→llm）       : GET " + $getAfterLlm.Body)
Say ("vad 档 PUT                : HTTP " + $putVad.Status + " ⇒ GET " + $getAfterVad.Body)
Say ("复原复核                  : " + $restoredOk)
Say ("海马体可达性              : HTTP " + $hippoStats.Status + " ⇒ " + $hippoStats.Body)
Say ("agent 声明（无 admin 头）  : HTTP " + $createNoAuth.Status + " ⇒ " + $createNoAuth.Body)
Say ("agent 声明 asr+tts        : HTTP " + $createAsrTts.Status + " ⇒ " + $createAsrTts.Body)
Say ("agent 声明 vad            : HTTP " + $createVad.Status + " ⇒ " + $createVad.Body)
Say ("agent 声明 stt            : HTTP " + $createStt.Status + " ⇒ " + $createStt.Body)
Say ("引擎注册 asr（camelCase） : HTTP " + $regAsr.Status + " ⇒ " + $regAsr.Body)
Say ("引擎注册 tts              : HTTP " + $regTts.Status + " ⇒ " + $regTts.Body)
Say ("引擎注册 vad（第三份词表）: HTTP " + $regVad.Status + " ⇒ " + $regVad.Body)
Say ("引擎注册 chronos2         : HTTP " + $regChronos2.Status + " ⇒ " + $regChronos2.Body)
foreach ($r in $regCand) { Say ("  真引擎名注册 ⇒ HTTP " + $r.Status + " | " + $r.Body) }
Say ("真引擎名注册后 registered  : " + $getAfterCand.Body)
Say ("真引擎名注册后 preview     : " + $previewAfterCand.Body)
Say ("卸载面（DELETE）            : HTTP " + $unload.Status + " ⇒ " + $unload.Body)
Say ("注册后 registered          : " + $getAfterReg.Body)
Say ("注册后 preview/models      : " + $previewModels.Body)
Say ("PUT 刚注册的 id            : HTTP " + $putRegistered.Status + " ⇒ " + $putRegistered.Body)
Say ("二次复原复核               : " + $restoredOk2)
Say ("注册后 registered          : " + $getAfterReg.Body)

if ((-not $restoredOk) -or (-not $restoredOk2)) { exit 1 }
exit 0
