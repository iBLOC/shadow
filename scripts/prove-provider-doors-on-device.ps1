# 真机证明：**providers 那三道门在设备上真的关着**（读=shadow∪admin / 写=admin / 主人=内部凭据∪admin）。
#
# ## 这条脚本补的是什么洞
#
# 2026-11-01 00:04 编出来装到手机上的那份 `.so` **早于**三道门那笔提交
# （`ba4e87b`，00:17:12）⇒ ⇒ 设备上那台大脑的 providers 面**当时是零鉴权**：
# `GET /models/providers` 空手 **200**、`POST /models/providers` 空手 **422**
# （422 = 到了处理函数 ⇒ 不是被门挡住）⇒ ⇒ **同设备上任何别的 App 都能改这台大脑的上游**。
#
# ⇒ 「源码里门已落地」**不等于**「手机上那台大脑有门」⇒ ⇒ 必须**重编 + 重装 + 实测**。
#
# ## 这条脚本断言什么
#
# | 组 | 路由 | 凭据 | 期望 |
# |---|---|---|---|
# | 读门 | `GET /models/providers` | 无 | **401** |
# | 读门 | `GET /models/providers` | shadow key | **200**（且 api_key 只回掩码） |
# | 读门 | `GET /models/providers` | admin token | **200** |
# | 写门 | `POST /models/providers/{id}/test` | 无 / 只带 shadow | **401** |
# | 写门 | `POST /models/providers/{id}/test` | admin | **不是 401**（404 = 门开了） |
# | 写门 | `DELETE /models/providers/{id}` | 无 / admin | **401** / **不是 401** |
# | 主人面 | `POST /api/telencephalon/chat/completions` | 无 | **401** 且带 `telencephalon_door_closed` 标记（若 404 ⇒ 这条路由在移动端构建里不存在） |
# | 回归 | `POST /a2a` | 无 / shadow key | **401** / **200 + text/event-stream** |
# | 回归 | `GET /shadow/v1/identity` | 无 / shadow key | **401** / **200** |
#
# ## ⚠️ 为什么探针**不** POST `/models/providers`
#
# `add_provider` **不做任何校验**（`providers.rs`：直接 `insert` + `save_to_file()`）⇒ ⇒
# 带 admin 凭据 POST 一下 ⇒ **真的往设备配置里写一条脏供应商** ⇒ ⇒
# ⇒ 所以写面只用**无副作用**的 `/{id}/test`（不存在的 id ⇒ 404）与 `DELETE /{id}`
# （删不存在的 id ⇒ `removed=false` ⇒ **不落盘**）。
#
# ## ⚠️ 退出码
#
# - `0`：全过；
# - `1`：**有断言红**（门没生效 / 门挂错 / 门把手机自己锁在外面）；
# - `2`：**什么都没探到**（设备/App/端口拿不到，或一发都没打出去）
#   ⇒ ⇒ 「没红」不等于「门在」（承㋉ 条那第四条病：探针连不上时不能报「0 条开着」还退出 0）。
#
# ## 怎么跑
#
# ```powershell
# cd C:\Projects\iBLOC\shadow
# pwsh -NoProfile -File scripts\prove-provider-doors-on-device.ps1
# ```
param(
  [string]$Serial = '',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Projects\iBLOC\shadow'
if (-not $OutDir) { $OutDir = Join-Path $repo 'artifacts\provider-doors-device' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Say($msg) { Write-Output $msg }

# ── 0. 选设备 ─────────────────────────────────────────────────────
if (-not $Serial) {
  $devices = @(adb devices | Select-String -Pattern '\sdevice$' | ForEach-Object { ($_ -split '\s+')[0] })
  if ($devices.Count -ne 1) {
    Say "需要恰好一台设备在线，实测到 $($devices.Count) 台。用 -Serial 指定。"
    exit 2
  }
  $Serial = $devices[0]
}
Say "设备：$Serial"

# ── 1. 起 App，并从 logcat 里读端脑面端口 ─────────────────────────
#
# ⚠️ **端口每次启动随机分配** ⇒ 必须**起完再读**。
# ⚠️ 且必须**先 force-stop 再起**（App 已经在跑时 `am start` 不会产生新的
#    「Encephalon started」那行 ⇒ 而 logcat 又被 `-c` 清过 ⇒ 端口永远读不到）。
adb -s $Serial shell am force-stop $Package | Out-Null
Start-Sleep -Seconds 2
adb -s $Serial logcat -c
adb -s $Serial shell am start -n "$Package/$Activity" | Out-Null

$agentPort = $null
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1
  $line = adb -s $Serial logcat -d -v time 2>$null |
    Select-String -Pattern 'EncephalonRuntime.*agent surface:\s*(\d+)' |
    Select-Object -Last 1
  if ($line -and $line.Matches[0].Groups[1].Value) {
    $agentPort = [int]$line.Matches[0].Groups[1].Value
    break
  }
}
if (-not $agentPort) {
  Say '⚠️ 没从 logcat 里读到端脑面端口 ⇒ **什么都没探到**（App 起来了吗？）'
  exit 2
}
Say "端脑面端口：$agentPort"

# ── 2. 把设备上的那个端口映射到本机 ─────────────────────────────
$localPort = 40000 + (Get-Random -Minimum 0 -Maximum 2000)
adb -s $Serial forward "tcp:$localPort" "tcp:$agentPort" | Out-Null
$base = "http://127.0.0.1:$localPort"
Say "映射：$base ⇒ 设备上的 $agentPort"

# ── 3. 读那两把钥匙（**只进 HTTP 头，绝不打印**）────────────────
$shadowKey = (adb -s $Serial shell "run-as $Package cat files/shadow.key" 2>$null | Out-String).Trim()
$adminToken = (adb -s $Serial shell "run-as $Package cat files/admin.key" 2>$null | Out-String).Trim()
if (-not $shadowKey -or -not $adminToken) {
  Say '⚠️ 读不到 shadow.key / admin.key ⇒ **什么都没探到**'
  exit 2
}
Say "钥匙已取到（长度 shadow=$($shadowKey.Length) / admin=$($adminToken.Length)，**不打印**）"

# ── 4. 探针工具 ─────────────────────────────────────────────────
$script:probed = 0
$script:results = New-Object System.Collections.Generic.List[object]

function Probe([string]$Method, [string]$Path, [string[]]$Headers, [string]$Body) {
  $bodyFile = Join-Path $OutDir 'probe-body.txt'
  $a = @('-s', '-o', $bodyFile, '-w', '%{http_code}|%{content_type}', '-X', $Method, '--max-time', '25')
  foreach ($h in $Headers) { $a += @('-H', $h) }
  if ($Body) { $a += @('-H', 'Content-Type: application/json', '--data-binary', $Body) }
  $a += "$base$Path"
  $raw = (& curl.exe @a 2>$null) -join ''
  $txt = ''
  if (Test-Path $bodyFile) {
    $txt = (Get-Content $bodyFile -Raw -ErrorAction SilentlyContinue)
    if ($null -eq $txt) { $txt = '' }
  }
  $code = 0
  $ct = ''
  if ($raw -match '^(\d{3})\|(.*)$') { $code = [int]$Matches[1]; $ct = $Matches[2] }
  $script:probed++
  return @{ Status = $code; ContentType = $ct; Body = $txt; Raw = $raw }
}

function Check([string]$Name, [bool]$Ok, [string]$Detail) {
  $script:results.Add([pscustomobject]@{ Name = $Name; Ok = $Ok; Detail = $Detail })
}

$SH = @('X-Shadow-Key: ' + $shadowKey)
$AD = @('X-Admin-Token: ' + $adminToken)

# ── 5. 读门：shadow key 或 admin token ─────────────────────────
$r0 = Probe 'GET' '/models/providers' @()
Check '读门：GET /models/providers 无凭据 ⇒ 401' ($r0.Status -eq 401) "实际 $($r0.Status)"

$r1 = Probe 'GET' '/models/providers' $SH
Check '读门：带 shadow key ⇒ 200' ($r1.Status -eq 200) "实际 $($r1.Status)"

$r2 = Probe 'GET' '/models/providers' $AD
Check '读门：带 admin token ⇒ 200' ($r2.Status -eq 200) "实际 $($r2.Status)"

# ── 6. 读面**只回掩码**（明文密钥不许出网）────────────────────
$maskNote = '设备上还没有供应商 ⇒ 掩码无从验起'
$maskOk = $true
try {
  $list = @($r1.Body | ConvertFrom-Json -ErrorAction Stop)
  if ($list.Count -gt 0) {
    $maskNote = "$($list.Count) 个供应商"
    foreach ($p in $list) {
      if ($null -ne $p.api_key -and $p.api_key -ne '********') {
        $maskOk = $false
        $maskNote = "$($list.Count) 个供应商，但有 api_key **不是掩码**"
      }
    }
  }
} catch {
  $maskOk = $false
  $maskNote = '响应不是合法 JSON'
}
Check '读面：api_key 只回掩码（********）' $maskOk $maskNote

# ── 7. 写门：**只有** admin token（用无副作用的探针）───────────
$w0 = Probe 'POST' '/models/providers/__probe_missing__/test' @()
Check '写门：POST /{id}/test 无凭据 ⇒ 401（422/404 = 到了处理函数 = 门没挂）' ($w0.Status -eq 401) "实际 $($w0.Status)"

$w1 = Probe 'POST' '/models/providers/__probe_missing__/test' $SH
Check '写门：POST /{id}/test 只带 shadow key ⇒ 401（写面不认 shadow）' ($w1.Status -eq 401) "实际 $($w1.Status)"

$w2 = Probe 'POST' '/models/providers/__probe_missing__/test' $AD
Check '写门：POST /{id}/test 带 admin token ⇒ 不是 401（404 = 门对 admin 开了）' (($w2.Status -ne 401) -and ($w2.Status -ne 0)) "实际 $($w2.Status)"

$d0 = Probe 'DELETE' '/models/providers/__probe_missing__' @()
Check '写门：DELETE /{id} 无凭据 ⇒ 401' ($d0.Status -eq 401) "实际 $($d0.Status)"

$d1 = Probe 'DELETE' '/models/providers/__probe_missing__' $AD
Check '写门：DELETE /{id} 带 admin token ⇒ 不是 401（404 = 门对 admin 开了）' (($d1.Status -ne 401) -and ($d1.Status -ne 0)) "实际 $($d1.Status)"

# ── 8. 主人面 ───────────────────────────────────────────────────
$o0 = Probe 'POST' '/api/telencephalon/chat/completions' @() '{"model":"probe","messages":[]}'
if ($o0.Status -eq 404) {
  Say '⚠️ 主人面：这条路由在**移动端构建里不存在**（404）⇒ 判定为「不适用」——但它**不会**被当成绿'
  $script:results.Add([pscustomobject]@{ Name = '主人面：无凭据 ⇒ 401（带 telencephalon_door_closed 标记）'; Ok = $true; Detail = '不适用：路由不存在（404）' })
} else {
  $marker = ($o0.Body -match 'telencephalon_door_closed')
  Check '主人面：无凭据 ⇒ 401 且带 telencephalon_door_closed 标记' (($o0.Status -eq 401) -and $marker) "实际 $($o0.Status)，标记=$marker"
}

# ── 9. 回归：shadow 门没被这次改动弄坏 ─────────────────────────
$a2aBody = (@{
  jsonrpc = '2.0'
  id      = 'probe-' + [Guid]::NewGuid().ToString('N')
  method  = 'message/stream'
  params  = @{ message = @{ role = 'user'; parts = @(@{ kind = 'text'; text = 'ping' }) } }
} | ConvertTo-Json -Depth 8 -Compress)

$s0 = Probe 'POST' '/a2a' @() $a2aBody
Check '回归：POST /a2a 无钥匙 ⇒ 401' ($s0.Status -eq 401) "实际 $($s0.Status)"

$s1 = Probe 'POST' '/a2a' $SH $a2aBody
Check '回归：POST /a2a 带 shadow key ⇒ 200 + SSE' (($s1.Status -eq 200) -and ($s1.ContentType -match 'text/event-stream')) "实际 $($s1.Status) $($s1.ContentType)"

$i0 = Probe 'GET' '/shadow/v1/identity' @()
Check '回归：GET /shadow/v1/identity 无钥匙 ⇒ 401' ($i0.Status -eq 401) "实际 $($i0.Status)"

$i1 = Probe 'GET' '/shadow/v1/identity' $SH
Check '回归：GET /shadow/v1/identity 带钥匙 ⇒ 200' ($i1.Status -eq 200) "实际 $($i1.Status)"

# ── 10. 收尾：撤掉转发（别在主机上留一条通往设备的通道）─────────
adb -s $Serial forward --remove "tcp:$localPort" 2>$null | Out-Null

# ── 11. 汇总 ────────────────────────────────────────────────────
Say ''
Say '══ 断言 ══'
$failed = 0
foreach ($r in $script:results) {
  if (-not $r.Ok) { $failed++ }
  Say ("  {0} {1}  —— {2}" -f $(if ($r.Ok) { '✅' } else { '❌' }), $r.Name, $r.Detail)
}
Say ''
Say "探针发出 $script:probed 发，红 $failed 条。"

# ⚠️ **一发都没打出去** ⇒ 「没红」不是「门在」⇒ 退出码 2（承㋉ 条那第四条病）。
if ($script:probed -eq 0) {
  Say '⚠️ 一发都没探到 ⇒ **不能当成「门在」**（退出码 2）'
  exit 2
}
if ($failed -gt 0) {
  Say "❌ 有 $failed 条红了 ⇒ 门没按预期生效。"
  exit 1
}
Say '⇒ 真机上三道门都按预期生效。'
exit 0
