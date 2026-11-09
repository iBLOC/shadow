
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
  [string]$Package = '',
  [string]$Activity = '',
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
# ⚠️ **包名要自己探，不许写死**（2026-11-10 真机实测抓到的）：
# debug flavor 的 applicationId 是 `com.ibloc.debug`，release 才是 `com.ibloc.shadow`
# ⇒ ⇒ 写死成 release 包名 ⇒ ⇒ 设备上 `pm path` 取不到 APK 路径 ⇒ ⇒ 退出码 2
# （「什么都没探到」）⇒ ⇒ 而且 `run-as` **只有 debug 包能跑** ⇒ ⇒ 优先探 debug 包。
if (-not $Package) {
  $candidates = adb -s $Serial shell pm list packages |
    ForEach-Object { ($_ -split ':')[-1].Trim() } |
    Where-Object { $_ -like 'com.ibloc.*' }
  # ⚠️ **优先 com.ibloc.shadow**（2026-11-10 实测纠正）：仓里 applicationId 就是它
  # ⇒ ⇒ 而设备上那个 `com.ibloc.debug` 是**旧版「影」**（2026-08-03 装的，带 MNN/sherpa
  # 模型权重，那一版**还没有端脑 so**）⇒ ⇒ 优先探 debug 会**探到旧版** ⇒ ⇒ 假红。
  $Package = ($candidates | Where-Object { $_ -eq 'com.ibloc.shadow' } | Select-Object -First 1)
  if (-not $Package) { $Package = ($candidates | Where-Object { $_ -eq 'com.ibloc.debug' } | Select-Object -First 1) }
  if (-not $Package) { $Package = ($candidates | Select-Object -First 1) }
}
if (-not $Package) { Write-Output '设备上找不到 iBLOC 的包 ⇒ 判不了'; exit 2 }
# ⚠️ **Activity 不能从包名推**（2026-11-10 真机实测抓到的）：debug flavor 只改了
# **applicationId**（com.ibloc.debug）⇒ ⇒ 而 **Kotlin 源包名仍是 com.ibloc.shadow**
# ⇒ ⇒ 所以 Activity 是 com.ibloc.shadow.MainActivity ⇒ ⇒ 按包名推会得到
# 「com.ibloc.debug.MainActivity」⇒ ⇒ **起 App 直接失败**（Error type 3）。
# ⇒ ⇒ 正解：**问系统**（resolve-activity）⇒ ⇒ 问不到再回落那个源包名。
if (-not $Activity) {
  $resolved = adb -s $Serial shell cmd package resolve-activity --brief $Package 2>$null | Select-Object -Last 1
  if ($resolved -and $resolved -match '/') { $Activity = ($resolved.Trim() -split '/')[-1] }
}
if (-not $Activity) { $Activity = 'com.ibloc.shadow.MainActivity' }
Write-Output "包名：$Package"

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
# ⚠️ **文件名带时间戳**（2026-11-10 实测踩到的坑）：so 是**直接打进 APK** 的
# ⇒ ⇒ 设备文件系统里**没有**它 ⇒ ⇒ pull 会失败 ⇒ ⇒ 而旧版脚本随后拿
# `$OutDir` 里**上一次跑留下的缓存**当「设备上的那份」⇒ ⇒ 报出一个**假红**
# （缓存里是旧 so，而设备上其实已经装了新 so）⇒ ⇒ ⇒ 「量到的必须是这一次的」。
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$pulled = Join-Path $OutDir "device-libencephalon-$stamp.so"
adb -s $Serial pull $libFile $pulled | Out-Null
if (-not (Test-Path $pulled)) {
  # ⇒ ⇒ 走真路：把 **APK 本身**拉回来，本地解 zip 取那份 so（第 ① 层要量的正是它）
  $apkPulled = Join-Path $OutDir "device-$stamp.apk"
  Write-Output "设备文件系统里没有那份 so（它内嵌在 APK 里）⇒ ⇒ 改拉 APK 本地解：$apkPulled"
  adb -s $Serial pull $apkPath $apkPulled | Out-Null
  if (-not (Test-Path $apkPulled)) { Write-Output '拉不下 APK'; exit 2 }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($apkPulled)
  try {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq 'lib/arm64-v8a/libencephalon.so' } | Select-Object -First 1
    if (-not $entry) { $entry = $zip.Entries | Where-Object { $_.FullName -like '*/libencephalon.so' } | Select-Object -First 1 }
    if (-not $entry) { Write-Output 'APK 里找不到 libencephalon.so'; exit 2 }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $pulled, $true)
    Write-Output "APK 内条目：$($entry.FullName)"
  } finally { $zip.Dispose() }
}
if (-not (Test-Path $pulled)) { Write-Output '取不到设备那份 so'; exit 2 }
$devSha = (Get-FileHash $pulled -Algorithm SHA256).Hash
$devLen = (Get-Item $pulled).Length
Write-Output "设备上的 .so : $devSha  ($devLen bytes)"

$localSha = ''
$localLen = 0
if (Test-Path $JniLibs) {
  $localSha = (Get-FileHash $JniLibs -Algorithm SHA256).Hash
  $localLen = (Get-Item $JniLibs).Length
  Write-Output "本机 jniLibs : $localSha  ($localLen bytes)"
  # ⚠️⚠️ **不能直接拿 jniLibs 那份跟 APK 里那份比指纹**（2026-11-10 实测）：
  # Android 构建会 **strip** 掉 native 库的符号表 ⇒ ⇒ APK 内那份是 **strip 过的**
  # ⇒ ⇒ 实测 jniLibs 223,372,280 B ⇒ ⇒ APK 内 157,623,608 B ⇒ ⇒ 逐字节**必然不等**
  # ⇒ ⇒ 而那是**假红**（被测物没坏，是尺子跨了一道变换）。
  # ⇒ ⇒ 正解：**两边都 strip 到同一形状再比** ⇒ ⇒ 用 NDK 的 llvm-strip 处理本机那份。
  $ndkRoot = $env:ANDROID_NDK_HOME
  if (-not $ndkRoot) { $ndkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk\ndk\30.0.14904198' }
  $stripExe = Join-Path $ndkRoot 'toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-strip.exe'
  if (Test-Path $stripExe) {
    $stripped = Join-Path $OutDir "local-stripped-$stamp.so"
    & $stripExe --strip-unneeded -o $stripped $JniLibs 2>$null | Out-Null
    if (Test-Path $stripped) {
      $strippedSha = (Get-FileHash $stripped -Algorithm SHA256).Hash
      $strippedLen = (Get-Item $stripped).Length
      Write-Output "本机 jniLibs（strip 后）: $strippedSha  ($strippedLen bytes)"
      Check '设备那份 == 本机 jniLibs strip 后那份' ($devSha -eq $strippedSha) ("dev=$devSha localStripped=$strippedSha")
    } else {
      Write-Output 'strip 跑不出来 ⇒ ⇒ 这一格判不了（不是红）'
    }
  } else {
    Write-Output "找不到 NDK 的 llvm-strip（$stripExe）⇒ ⇒ 这一格判不了（不是红）"
  }
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
