# 真机探针：**手机上「不注册 agent」能不能起对话** —— 也就是「模型行为级读数」的入口在不在。
#
# ## 它回答哪几格
#   ① `POST /shadow/v1/conversations` 在**读门**（shadow key ∪ admin）⇒ ⇒ 不需要 admin、**不需要注册 agent**
#   ② 会话存储在**没有海马体**时回落成**纯内存**（`boot.rs:526-574`：`#[cfg(not(feature="hippocampus"))] ⇒ lance_store = None`）
#   ③ 发一条消息 ⇒ ⇒ **模型行为级读数**（真跑通了？还是死在模型那一格？）
#   ④ 收尾清理（DELETE 走 admin 门）⇒ ⇒ 探针不留会话
#
# ## 判据纪律
#   · 记「状态码 ＋ 体长 ＋ 体首 200 字」
#   · **不带任何钥匙**那一格是**对照**（证明门真的在那儿，而不是「反正都能过」）
#   · 会话 id 不打印（它是设备上的真实标识）
#
# 退出码：0 全部探完且已清理 / 1 有探针没跑成 / 2 什么都没探到（端口没起来、钥匙读不到）
param(
  [string]$Serial = 'ee6b4832',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Continue'
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.local/probe-phone-chat' }
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
  for ($i = 0; $i -lt 120; $i++) {
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
  # mode: shadow | admin | both | none
  $outFile = Join-Path $OutDir ('body-' + ($name -replace '[^A-Za-z0-9_-]', '_') + '.txt')
  $a = @('-s', '-o', $outFile, '-w', '%{http_code}', '-X', $method, '--max-time', '90')
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

Say '--- 0. 对照格：同一请求**不带任何钥匙** ⇒ ⇒ 门真的在那儿 ---'
$noKey = Probe '00-create-nokey' 'POST' '/shadow/v1/conversations' '{"agent":"temporal"}' 'none'

Say '--- 1. 建会话（**只带 shadow key** ⇒ ⇒ 读门；**不注册 agent**）---'
$create = Probe '01-create-conversation' 'POST' '/shadow/v1/conversations' '{"agent":"temporal"}' 'shadow'
$convId = ''
if ($create.Body -match '"id"\s*:\s*"([^"]+)"') { $convId = $Matches[1] }
Say ('  会话 id 取到了 = ' + $(if ($convId) { '是（不打印内容）' } else { '否 ⇒ 后面几格没法探' }))

$sent = $null; $got = $null; $deleted = $null; $listAfter = $null
if ($convId) {
  Say '--- 2. 发一条消息（**模型行为级读数**）---'
  $sent = Probe '02-send-message' 'POST' ("/shadow/v1/conversations/" + $convId + "/messages") '{"text":"回答一个词：ok"}' 'shadow'
  Say '--- 3. 读回执（history 里有几轮）---'
  $got = Probe '03-get-conversation' 'GET' ("/shadow/v1/conversations/" + $convId) $null 'shadow'
  Say '--- 4. 清理（DELETE ⇒ admin 门）---'
  $deleted = Probe '04-delete-conversation' 'DELETE' ("/shadow/v1/conversations/" + $convId) $null 'admin'
  $listAfter = Probe '05-list-after-delete' 'GET' '/shadow/v1/conversations' $null 'shadow'
}

Say ''
Say '--- 判据汇总 ---'
Say ('对照：建会话不带钥匙 ⇒ HTTP ' + $noKey.Status + '（应当是 401）')
Say ('建会话（只带 shadow key）⇒ HTTP ' + $create.Status + '（应当是 200 ＋ 有 id）')
if ($sent) { Say ('发消息 ⇒ HTTP ' + $sent.Status + ' | ' + $sent.Body) }
if ($got) { Say ('读回执 ⇒ HTTP ' + $got.Status + ' | 体长=' + $got.BodyLen) }
if ($deleted) { Say ('清理（DELETE）⇒ HTTP ' + $deleted.Status + ' | ' + $deleted.Body) }
if ($listAfter) { Say ('清理后列表 ⇒ HTTP ' + $listAfter.Status + ' | 体长=' + $listAfter.BodyLen) }

$ok = ($noKey.Status -eq 401) -and ($create.Status -eq 200) -and ($convId -ne '')
if ($deleted) { $ok = $ok -and ($deleted.Status -in @(200, 204)) }
Say ('总判据 ⇒ ' + $ok)
if (-not $ok) { exit 1 }
exit 0
