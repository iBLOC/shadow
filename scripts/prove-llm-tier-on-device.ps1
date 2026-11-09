# 真机探针：**llm（文本）这一档**的分档默认，端脑到底在哪儿消费。
#
# ## 为什么问这一格
#   `PUT /lobes/capability-defaults` 能写 llm 档 ⇒ 但源码里 `capability_default(..)`
#   **只有 api/voice.rs 消费（asr/tts）** ⇒ ⇒ llm 档很可能**没人读** ⇒ ⇒
#   而 llm 档真正的路由走**另一条路**：`POST /lobes/models`（全局 default_model
#   ＋ per-lobe lobe_models 覆盖，落在 native_lobes，不在 lobe_cache）⇒ ⇒
#   ⇒ 设备级实测：**写进去看得见吗？路由真的变吗？**
#
# 退出码：0 探完且复原复核通过 / 1 没复原 / 2 没探到（端口/钥匙）
param([string]$Serial = "ee6b4832", [string]$Package = "com.ibloc.shadow", [string]$Activity = "com.ibloc.shadow.MainActivity")
$ErrorActionPreference = "Continue"
$OutDir = "C:/Projects/iBLOC/shadow/.local/probe-llm-tier"
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
  for ($i = 0; $i -lt 90; $i++) { Start-Sleep -Seconds 1; $p = Get-LoggedPort; if ($p) { return $p } }
  return 0
}
$port = 0
$pidNow = Get-AppPid
if ($pidNow) { $port = Get-LoggedPort; if ($port) { Say ("复用活端口 pid=" + $pidNow + " port=" + $port) } }
if (-not $port) { Say "大脑没在跑 ⇒ 起它"; $port = Restart-Brain }
if (-not $port) { Say "!! 没端口"; exit 2 }
$lp = 45000 + (Get-Random -Minimum 0 -Maximum 2000)
adb -s $Serial forward ("tcp:" + $lp) ("tcp:" + $port) | Out-Null
$base = "http://127.0.0.1:" + $lp
$sk = (adb -s $Serial shell ("run-as " + $Package + " cat files/shadow.key") 2>$null | Out-String).Trim()
$ak = (adb -s $Serial shell ("run-as " + $Package + " cat files/admin.key") 2>$null | Out-String).Trim()
if (-not $sk) { Say "!! 读不到钥匙"; exit 2 }
function Probe($name, $method, $path, $body) {
  $of = Join-Path $OutDir ("b-" + ($name -replace "[^A-Za-z0-9_-]", "_") + ".txt")
  $a = @("-s", "-o", $of, "-w", "%{http_code}", "-X", $method, "--max-time", "25", "-H", ("X-Shadow-Key: " + $sk), "-H", ("X-Admin-Token: " + $ak))
  if ($body) {
    $inf = Join-Path $OutDir "in.json"
    [IO.File]::WriteAllText($inf, $body, $utf8NoBom)
    $a += @("-H", "Content-Type: application/json", "--data-binary", ("@" + $inf))
  }
  $a += ($base + $path)
  $code = (& curl.exe @a 2>$null) -join ""
  $t = ""
  if (Test-Path $of) { $t = [string](Get-Content $of -Raw -ErrorAction SilentlyContinue) }
  if ($null -eq $t) { $t = "" }
  Say ("  [" + $name + "] " + $method + " " + $path + " ⇒ HTTP " + $code + " | 体长=" + $t.Length + " | " + (($t.Substring(0, [Math]::Min(260, $t.Length))) -replace "\r?\n", " "))
  return @{ Status = [int]$code; Body = $t; Len = $t.Length }
}
Say "--- 基线 ---"
$r1 = Probe "01-lobes-list" "GET" "/api/telencephalon/lobes/list" $null
$r2 = Probe "02-runtime-prefrontal" "GET" "/api/telencephalon/lobes/runtime/prefrontal" $null
$r3 = Probe "03-capability-defaults" "GET" "/api/telencephalon/lobes/capability-defaults" $null
Say "--- 写 llm 档（分档默认）---"
$w1 = Probe "10-put-llm-tier" "PUT" "/api/telencephalon/lobes/capability-defaults" '{"defaults":{"llm":"probe-llm-xyz"}}'
$r4 = Probe "11-capability-defaults-after" "GET" "/api/telencephalon/lobes/capability-defaults" $null
$r5 = Probe "12-lobes-list-after" "GET" "/api/telencephalon/lobes/list" $null
$r6 = Probe "13-runtime-prefrontal-after" "GET" "/api/telencephalon/lobes/runtime/prefrontal" $null
Say "--- 真正的 llm 路由面（lobes/models）---"
$w2 = Probe "20-post-lobe-models" "POST" "/api/telencephalon/lobes/models" '{"default_model":"probe-llm-xyz"}'
$r7 = Probe "21-lobes-list-after-models" "GET" "/api/telencephalon/lobes/list" $null
Say "--- 复原（把全局默认放回本地）---"
$w3 = Probe "30-restore-local" "POST" "/api/telencephalon/lobes/models" '{"default_model":null}'
$w4 = Probe "31-restore-cap-defaults" "PUT" "/api/telencephalon/lobes/capability-defaults" '{"defaults":{}}'
$r8 = Probe "32-capability-defaults-restored" "GET" "/api/telencephalon/lobes/capability-defaults" $null
$r9 = Probe "33-lobes-list-restored" "GET" "/api/telencephalon/lobes/list" $null
Say "--- 重启复核（app 启动时会自己下发路由）---"
$port2 = Restart-Brain
if ($port2) {
  $lp2 = 46000 + (Get-Random -Minimum 0 -Maximum 2000)
  adb -s $Serial forward ("tcp:" + $lp2) ("tcp:" + $port2) | Out-Null
  $of2 = Join-Path $OutDir "b-40-after-restart.txt"
  $a2 = @("-s", "-o", $of2, "-w", "%{http_code}", "--max-time", "25", "-H", ("X-Shadow-Key: " + $sk))
  $a2 += ("http://127.0.0.1:" + $lp2 + "/api/telencephalon/lobes/capability-defaults")
  $c2 = (& curl.exe @a2 2>$null) -join ""
  $t2 = ""
  if (Test-Path $of2) { $t2 = [string](Get-Content $of2 -Raw -ErrorAction SilentlyContinue) }
  Say ("  [40-after-restart] HTTP " + $c2 + " | 体长=" + $t2.Length + " | " + (($t2.Substring(0, [Math]::Min(200, $t2.Length))) -replace "\r?\n", " "))
} else { Say "!! 重启后没端口" }
exit 0
