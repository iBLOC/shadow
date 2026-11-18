# 真机上的**视频生成面** —— 两条路由（创建＋查询）真的在**那台手机现在跑的那份大脑**里吗。

# ## 为什么要有它
# 端脑**源码**里有某条路由 ⇒ ≠ **编出来的那份大脑**里有 ⇒ ⇒ 真机上那条功能
# **根本不存在（404）** ⇒ ⇒ 界面只会显示一条原始错误 ⇒ ⇒ **失败长得像成功**。
# `scripts/check-brain-route-surface.mjs` 是**产物级**（扫二进制字节）⇒ ⇒ 它问的是
# 「编出来的那份有没有」⇒ ⇒ **不问「手机现在跑的是不是那份」** ⇒ ⇒ 这一支是真机级。

# ## ⚠️ 判据为什么用**差分**而不是「空体 404」
# 常见说法是「路由不存在 ⇒ 404 且体为空」⇒ ⇒ 但**这台端脑**的门是套在 router
# 外面的（`apply_door`）⇒ ⇒ **未匹配路径也可能被门拦**（403/401 ＋ JSON 体）
# ⇒ ⇒ 「空体 404」**未必**是未匹配的签名 ⇒ ⇒ 写死它就是**假绿**的温床。
# ⇒ ⇒ 改成差分：**负控**（故意不存在的路径）先量出「未匹配」长什么样 ⇒ ⇒
#     与负控**签名不同**（状态码或体长任一不同）⇒ ⇒ 才算「这条路径被匹配了」。
# ⇒ ⇒ 负控自己是什么形状，脚本**如实报出来**（是空体 404 就说空体 404）。

# ## ⚠️ 双侧对照（证明这把尺**不是空转**）
#   · **正控**（已知存在的路由：capability-defaults）⇒ ⇒ 它必须与负控**不同**
#   · **负控**（故意不存在的路由：.../videos/definitely-not-a-route）
# ⇒ ⇒ 正控若与负控相同 ⇒ ⇒ 说明「我们打到的不是端脑面」⇒ ⇒ 本次读数不可信。

# ## ⚠️ 钥匙是**可选**的（不许因为读不到就假装探到了）
# release 档的 APK **不可 run-as** ⇒ ⇒ 读不到 `files/shadow.key` ⇒ ⇒ 门是关着的
# ⇒ ⇒ 读到的是门的那层应答（401/403 ＋ JSON 体）⇒ ⇒ **照样能证明「路由存在」**
# ⇒ ⇒ 但**不能**证明「带钥匙能调通」⇒ ⇒ 结论口径必须分开说，不许混成一句。

# ## ⚠️ `-BaseUrl` 自测入口（判据自己也要被审）
# 给了它就不走设备，直连那个基址 ⇒ ⇒ 可以拿**本地假端脑**把三种形状喂进去：
#   路由存在（与负控不同形）⇒ 退出码 **0**
#   路由不存在（与负控同形）⇒ 退出码 **1**
#   尺子失效（正控与负控同形）⇒ 退出码 **2**
# ⇒ ⇒ 这三道是**判据自己的变异** —— 不跑这三道，这把尺的退出码只是「看起来对」。

# ## 退出码
#   0 两条视频路由都在（正控与负控都成立）
#   1 有路由不在（与负控同形）
#   2 什么都没探到（设备没授权／端口没起来／正控失效）
param(
  [string]$Serial = '',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$OutDir = '',
  [string]$BaseUrl = ''
)

$ErrorActionPreference = 'Continue'
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.local/probe-video-routes' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ⚠️ Say 必须写**主机流**（Write-Host）而不是输出流 ⇒ ⇒ 否则 `Probe` 的返回值
# 会被它自己的日志污染（返回值变成 [日志行, 字典]）⇒ ⇒ 判据读到的就成了
# 「成员枚举碰巧对」⇒ ⇒ 不许。日志进主机流，抓取方照样看得到。
function Say($m) { Write-Host $m }

$shadowKey = ''
$adminToken = ''

if ($BaseUrl) {
  # ---- 自测模式：直连给定基址（不走设备）--------------------------------
  Say ('自测模式：直连 ' + $BaseUrl + '（不走设备）')
  $base = $BaseUrl.TrimEnd('/')
} else {
  # ---- 0. 设备（分清「已授权」与「未授权」）-------------------------------
  $rows = @(adb devices | Select-Object -Skip 1 | ForEach-Object {
    $p = @($_ -split '\s+' | Where-Object { $_ -ne '' })
    if ($p.Count -ge 2) { [pscustomobject]@{ Serial = $p[0]; State = $p[1] } }
  })
  $ready = @($rows | Where-Object { $_.State -eq 'device' })
  $blocked = @($rows | Where-Object { $_.State -ne 'device' })
  if ($blocked.Count -gt 0) {
    Say ('⚠️ 未授权/掉线的设备：' + (($blocked | ForEach-Object { $_.Serial + '=' + $_.State }) -join ', ') + ' ⇒ ⇒ 探不到')
  }
  if ($ready.Count -eq 0) {
    Say '!! 没有已授权的设备（state=device）⇒ ⇒ 什么都探不到'
    exit 2
  }
  if (-not $Serial) { $Serial = $ready[0].Serial }
  Say ('设备：' + $Serial)

  # ---- 1. 起 app，从 logcat 取端脑面端口 ---------------------------------
  adb -s $Serial shell am force-stop $Package | Out-Null
  Start-Sleep -Seconds 2
  adb -s $Serial logcat -c
  adb -s $Serial shell am start -n "$Package/$Activity" | Out-Null
  $agentPort = 0
  for ($i = 0; $i -lt 60; $i++) {
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
    Say '!! 没读到端脑面端口 ⇒ 什么都没探到'
    adb -s $Serial logcat -d -v time 2>$null |
      Select-String -Pattern 'EncephalonRuntime|Encephalon' | Select-Object -Last 25 | ForEach-Object { Say ('   ' + $_.Line) }
    exit 2
  }
  $localPort = 43000 + (Get-Random -Minimum 0 -Maximum 1500)
  adb -s $Serial forward "tcp:$localPort" "tcp:$agentPort" | Out-Null
  $base = "http://127.0.0.1:$localPort"
  Say ('端脑面端口：' + $agentPort + ' ⇒ ' + $base)

  # ---- 2. 取钥匙（**不打印**；读不到也**继续探**）--------------------------
  $shadowKey = (adb -s $Serial shell "run-as $Package cat files/shadow.key" 2>$null | Out-String).Trim()
  $adminToken = (adb -s $Serial shell "run-as $Package cat files/admin.key" 2>$null | Out-String).Trim()
  if ($shadowKey) {
    Say ('钥匙已取到（shadow=' + $shadowKey.Length + ' / admin=' + $adminToken.Length + ' 字符，不打印）')
  } else {
    Say '⚠️ 读不到影子锁（release 档不可 run-as ⇒ ⇒ 这是**预期**的）⇒ ⇒ 本次读数只证明「路由存在」，**不**证明「带钥匙能调通」'
  }
}

function Probe($name, $method, $path, $body) {
  $outFile = Join-Path $OutDir ('body-' + ($name -replace '[^A-Za-z0-9_-]', '_') + '.txt')
  $a = @('-s', '-o', $outFile, '-w', '%{http_code}', '-X', $method, '--max-time', '25')
  if ($shadowKey) { $a += @('-H', "X-Shadow-Key: $shadowKey") }
  if ($adminToken) { $a += @('-H', "X-Admin-Token: $adminToken") }
  if ($body) {
    # ⚠️ body 必须走文件（--data-binary @file）—— 直接把带引号的 JSON 当命令行参数
    # 传 ⇒ Windows 的参数转义会把它弄坏 ⇒ ⇒ 服务端收到残缺 JSON ⇒ ⇒ 422。
    $inFile = Join-Path $OutDir 'probe-in.json'
    [IO.File]::WriteAllText($inFile, $body, (New-Object Text.UTF8Encoding($false)))
    $a += @('-H', 'Content-Type: application/json', '--data-binary', ('@' + $inFile))
  }
  $a += ($base + $path)
  $code = (& curl.exe @a 2>$null) -join ''
  $txt = ''
  if (Test-Path $outFile) { $txt = [string](Get-Content $outFile -Raw -ErrorAction SilentlyContinue) }
  if ($null -eq $txt) { $txt = '' }
  $snippet = ($txt.Substring(0, [Math]::Min(200, $txt.Length))) -replace "\r?\n", ' '
  Say ('  [' + $name + '] ' + $method + ' ' + $path + ' ⇒ HTTP ' + $code + ' | 体长=' + $txt.Length + ' | ' + $snippet)
  return @{ Name = $name; Method = $method; Path = $path; Status = [int]$code; BodyLen = $txt.Length; Body = $snippet }
}

# 签名：状态码 ＋ 体长（体首 200 字只给人看，不进签名）
function Sig($p) { return ("" + $p.Status + '/' + $p.BodyLen) }

Say '--- 四条探针（正控 ＋ 两条视频路由 ＋ 一条负控）---'
$pos    = Probe 'positive-control'  'GET'  '/api/telencephalon/lobes/capability-defaults' $null
$create = Probe 'video-create' 'POST' '/api/telencephalon/videos/generations' '{"prompt":"probe video route","model":"MiniMax-H3"}'
$query  = Probe 'video-query'  'GET'  '/api/telencephalon/videos/generations/probe-nonexistent-task-id?model=MiniMax-H3' $null
$neg    = Probe 'video-negative-control' 'GET' '/api/telencephalon/videos/definitely-not-a-route' $null

Say ''
$negSig = Sig $neg
if ($neg.Status -eq 404 -and $neg.BodyLen -eq 0) {
  Say ('  ✓ 负控＝「空体 404」⇒ ⇒ 这台端脑的未匹配路径是空体 404 ⇒ ⇒ 差分口径成立')
} else {
  Say ('  ⚠️ 负控**不是**空体 404（实际 HTTP ' + $neg.Status + ' / 体长 ' + $neg.BodyLen + '）⇒ ⇒ 这台端脑连未匹配路径都被门/中间件拦了 ⇒ ⇒ 改用**差分口径**（与负控不同即视为「路径被匹配」）')
}
Say ('  · 负控签名 = ' + $negSig + ' ｜ 正控签名 = ' + (Sig $pos))

if ((Sig $pos) -eq $negSig) {
  Say '  ✗ 正控失效：已知存在的路由（capability-defaults）与负控**同形**⇒ ⇒ 这不是端脑面（或没起来／端口不对）⇒ ⇒ 本次读数不可信'
  exit 2
}
Say '  ✓ 正控成立：已知存在的路由与负控**不同形**⇒ ⇒ 这把尺分辨得出「在不在」'

$video = @($create, $query)
$missing = @($video | Where-Object { (Sig $_) -eq $negSig })
Say ('视频路由存在判定：存在 ' + ($video.Count - $missing.Count) + ' / ' + $video.Count)
foreach ($v in $video) {
  Say ('  · ' + $v.Name + ' ⇒ HTTP ' + $v.Status + ' | 体长=' + $v.BodyLen + ' | 签名=' + (Sig $v) + ' | ' + $v.Body)
}
if ($missing.Count -gt 0) {
  foreach ($m in $missing) { Say ('  ✗ 路由与负控同形 ⇒ 未被匹配（路由不存在）：' + $m.Method + ' ' + $m.Path) }
  exit 1
}
if ($shadowKey) {
  Say '✓ 真机上的大脑里，视频那两条路由都在（本次**带**影子锁 ⇒ ⇒ 读数覆盖「门开」那一面）'
} else {
  Say '✓ 真机上的大脑里，视频那两条路由都在（本次**无**钥匙 ⇒ ⇒ 只证明「路由存在」，不证明「门开可调」）'
}
exit 0
