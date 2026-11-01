
# ─────────────────────────────────────────────────────────────────────────────
# 本轮的真机读数（设备 2106118C / 小米，干净 worktree）
# ─────────────────────────────────────────────────────────────────────────────
#
# 产物：干净 worktree @ telencephalon@7556ddf + encephalon@8e880fe 编出
#   编出来那份 = APK 内那份 = 设备上那份
#   sha256 = 4BE92B94F369B7F8AB65924D567446958F9DDB67DBF51DBB4E8146503F146817
#
# ⚠️⚠️ **别把这条指纹当「提交号」** —— 它只对**同一个编译路径**成立：
#   Rust 二进制会把编译期绝对路径烙进去（实测 216 处
#   C:ProjectsiBLOCclean	elencephalon…）⇒ ⇒ **换路径重编 ⇒ 指纹必变**
#   ⇒ ⇒ 换机器/换路径时，**重跑本脚本重新取指纹**，别照抄这一条。
#
# ✅ 本轮在这份产物上的读数：
#   - 本脚本 17 条全绿（出处 2 + 门矩阵 8 + A2UI 诚实性 3 + A2UI 本地化 4）
#   - prove-provider-doors-on-device.ps1  14 条全绿（含主人面门标记）
#   - prove-provider-mask-on-device.ps1   11 条全绿（含「重启后供应商还在」）
#
# ✅ 反向验证（把 -ExpectSha 改成全 0）⇒ ⇒ **恰好 1 条红**、其余 16 条仍绿
#   ⇒ ⇒ 断言钉在「真的对上了」上，不是恒绿。
#
# ✅ 另一条更硬的反向验证（**病自己指出病灶**）：
#   装**不含** 8e880fe（providers 落盘修法）的那份 ⇒ ⇒ 掩码脚本 11 条里
#   **红 2 条**，且红的正是「落盘：存的是原密钥」与「重启后供应商还在」
#   ⇒ ⇒ 换上含那笔的 ⇒ ⇒ **0 红**。
#
# ⚠️ 三道 Windows 上的坎（绕过办法都在这）：
#   1) Flutter 只在 .flutter-plugins-dependencies 的 plugins 段真的变了时才重建
#      symlink ⇒ ⇒ 第一次构建失败时它已经把清单写好了 ⇒ ⇒ 第二次构建不再碰
#      symlink ⇒ ⇒ **不需要开 Developer Mode**；
#   2) flutter build apk 没有 --offline ⇒ ⇒ 先 flutter pub get --offline，再
#      flutter build apk --no-pub；
#   3) native assets（sqlite3 的 build hook）要联网拉预编译二进制 ⇒ ⇒ 把真仓
#      .dart_tool/hooks_runner 整棵复制到干净树（用 Node 拷，bash 递归写会被拦）。
param(
  [string]$Serial = 'ee6b4832',
  [string]$Package = 'com.ibloc.shadow',
  [string]$Activity = 'com.ibloc.shadow.MainActivity',
  [string]$JniLibs = 'C:\Projects\iBLOC\shadow\shadow-mobile\android\app\src\main\jniLibs\arm64-v8a\libencephalon.so',
  [string]$ExpectSha = '',
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
# ============================================================
# 真机验收：**装上去的 .so = 某个具名提交编出来的那份**
# ============================================================
# 三层对齐（承「产物验收要三层对齐」那条纪律）：
#   ① APK 内那份      ↔ jniLibs 那份   （逐字节）
#   ② 设备上那份      ↔ 编出来的那份   （逐字节）
#   ③ 编出来的那份    ↔ 某个具名提交   （干净 worktree 编的）
#
# 本脚本验第 ② 层 + 行为层：
#   - 拉设备上 APK 里的 libencephalon.so ⇒ 算 sha256
#   - 与本机 jniLibs 那份比对
#   - 跑门矩阵（读=shadow∪admin / 写=admin / 主人=内部凭据∪admin）
#   - 跑 A2UI：叶区诚实性（unknown / not probed）+ 文案本地化（zh vs en）
#
# 退出码：0 全过 / 1 有红 / 2 什么都没探到
if (-not $OutDir) { $OutDir = Join-Path $env:TEMP 'so-provenance' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$script:results = New-Object System.Collections.Generic.List[object]
function Check([string]$name, [bool]$ok, [string]$detail) {
  $script:results.Add(@{ Name = $name; Ok = $ok; Detail = $detail }) | Out-Null
  $mark = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Output ("[{0}] {1}  {2}" -f $mark, $name, $detail)
}

Write-Output '=== 0. 设备在线？ ==='
$devices = @(adb devices | Select-String '\sdevice$' | ForEach-Object { ($_ -split '\s+')[0] })
if ($devices -notcontains $Serial) { Write-Output "设备 $Serial 不在线（在线：$($devices -join ',')）"; exit 2 }

Write-Output '=== 1. 设备 APK 路径 + 抽 .so 算指纹 ==='
$apkPath = (adb -s $Serial shell pm path $Package | Select-Object -First 1) -replace '^package:', ''
if (-not $apkPath) { Write-Output '拿不到 APK 路径'; exit 2 }
$libDir = $apkPath -replace 'base\.apk$', ''
$libFile = "$libDir/lib/arm64/libencephalon.so"
$pulled = Join-Path $OutDir 'device-libencephalon.so'
adb -s $Serial pull $libFile $pulled | Out-Null
if (-not (Test-Path $pulled)) { Write-Output '拉不下设备上的 .so'; exit 2 }
$devSha = (Get-FileHash $pulled -Algorithm SHA256).Hash
$devLen = (Get-Item $pulled).Length
Write-Output "设备上的 .so : $devSha  ($devLen bytes)"

$localSha = ''
$localLen = 0
if (Test-Path $JniLibs) {
  $localSha = (Get-FileHash $JniLibs -Algorithm SHA256).Hash
  $localLen = (Get-Item $JniLibs).Length
  Write-Output "本机 jniLibs : $localSha  ($localLen bytes)"
  Check '设备那份 == 本机 jniLibs 那份' ($devSha -eq $localSha) ("dev=$devSha local=$localSha")
} else {
  Check '本机 jniLibs 那份存在' $false $JniLibs
}
if ($ExpectSha) {
  Check '编出来的那份 == 预期具名提交产物' ($devSha -eq $ExpectSha.ToUpper()) ("dev=$devSha expect=$ExpectSha")
}

Write-Output '=== 2. 起 App + 读端脑面端口 ==='
adb -s $Serial shell am force-stop $Package | Out-Null
Start-Sleep -Seconds 2
adb -s $Serial logcat -c
adb -s $Serial shell am start -n "$Package/$Activity" | Out-Null
$agentPort = $null
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1
  $line = adb -s $Serial logcat -d -v time 2>$null | Select-String 'EncephalonRuntime.*agent surface:\s*(\d+)' | Select-Object -Last 1
  if ($line -and $line.Matches[0].Groups[1].Value) { $agentPort = [int]$line.Matches[0].Groups[1].Value; break }
}
if (-not $agentPort) { Write-Output '没读到端脑面端口 ⇒ 什么都没探到'; exit 2 }
Write-Output "端脑面端口：$agentPort"
$localPort = 40000 + (Get-Random -Minimum 0 -Maximum 2000)
adb -s $Serial forward "tcp:$localPort" "tcp:$agentPort" | Out-Null
$base = "http://127.0.0.1:$localPort"

$shadowKey = (adb -s $Serial shell "run-as $Package cat files/shadow.key" 2>$null | Out-String).Trim()
$adminToken = (adb -s $Serial shell "run-as $Package cat files/admin.key" 2>$null | Out-String).Trim()
if (-not $shadowKey -or -not $adminToken) { Write-Output '读不到钥匙 ⇒ 什么都没探到'; exit 2 }
Write-Output "钥匙已取到（不打印）"

function Code([string]$Method, [string]$Path, [string[]]$Headers, [string]$Body) {
  $a = @('-s', '-o', 'NUL', '-w', '%{http_code}', '-X', $Method, '--max-time', '25')
  foreach ($h in $Headers) { $a += @('-H', $h) }
  if ($Body) { $a += @('-H', 'Content-Type: application/json', '--data-binary', $Body) }
  $a += "$base$Path"
  return [int]((& curl.exe @a 2>$null) -join '')
}

Write-Output '=== 3. providers 面门矩阵 ==='
$c = Code 'GET' '/models/providers' @()
Check '读门 无凭据 => 401' ($c -eq 401) "got $c"
$c = Code 'GET' '/models/providers' @("X-Shadow-Key: $shadowKey")
Check '读门 shadow => 200' ($c -eq 200) "got $c"
$c = Code 'GET' '/models/providers' @("X-Admin-Token: $adminToken")
Check '读门 admin => 200' ($c -eq 200) "got $c"
$c = Code 'GET' '/models/providers' @('X-Admin-Token: ')
Check '读门 空 admin => 401' ($c -eq 401) "got $c"
$c = Code 'POST' '/models/providers' @('Content-Type: application/json')
Check '写面 无凭据 => 401' ($c -eq 401) "got $c"
$c = Code 'POST' '/models/providers' @('Content-Type: application/json', "X-Shadow-Key: $shadowKey")
Check '写面 仅 shadow => 401' ($c -eq 401) "got $c"
$c = Code 'POST' "/models/providers/__probe_nonexistent__/test" @('Content-Type: application/json', "X-Admin-Token: $adminToken")
Check '写面 admin => 不是 401（门开了）' ($c -ne 401) "got $c"
$c = Code 'POST' '/api/telencephalon/chat/completions' @('Content-Type: application/json')
Check '主人面 无凭据 => 401' ($c -eq 401) "got $c"

Write-Output '=== 4. A2UI：叶区诚实性 + 文案本地化 ==='
function Sse([string]$Lang, [string]$Text) {
  $body = @{ jsonrpc = '2.0'; id = 'p'; method = 'message/stream'; params = @{ message = @{ role = 'user'; parts = @(@{ kind = 'text'; text = $Text }) } } } | ConvertTo-Json -Depth 8 -Compress
  $a = @('-s', '-N', '-X', 'POST', '-H', 'Content-Type: application/json', '-H', "Accept-Language: $Lang", '-H', "X-Shadow-Key: $shadowKey", '--data-binary', $body, '--max-time', '15', "$base/a2a")
  return ((& curl.exe @a 2>$null) -join [Environment]::NewLine)
}
$zhAgents = Sse 'zh-CN' 'a2ui:agents'
$enAgents = Sse 'en-US' 'a2ui:agents'
Check '叶区：中文文案 尚未探活' ($zhAgents -match '尚未探活') ("len=" + $zhAgents.Length)
Check '叶区：英文文案 not probed' ($enAgents -match 'not probed') ("len=" + $enAgents.Length)
Check '叶区：状态是 unknown（不撒谎）' ($zhAgents -match '"status":"unknown"') ''
$zhTasks = Sse 'zh-CN' 'a2ui:tasks'
$enTasks = Sse 'en-US' 'a2ui:tasks'
Check '任务：中文标题 任务（N）' ($zhTasks -match '任务（\d+）') ''
Check '任务：英文标题 Tasks (N)' ($enTasks -match 'Tasks \(\d+\)') ''
Check '任务：中文空态 还没有任务。' ($zhTasks -match '还没有任务。') ''
Check '任务：英文空态 No tasks yet.' ($enTasks -match 'No tasks yet\.') ''

Write-Output ''
$red = @($script:results | Where-Object { -not $_.Ok })
Write-Output ("断言：{0} 条，红 {1} 条" -f $script:results.Count, $red.Count)
if ($red.Count -gt 0) { exit 1 }
Write-Output '全部绿。'
exit 0
