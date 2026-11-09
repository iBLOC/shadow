<#
.SYNOPSIS
    在真机上验证「手机操作（mobile use）」—— 退出码即结论。

.DESCRIPTION
    这条链路（Dart → 方法通道 → Kotlin → 无障碍服务）**单测测不到**
    （单测走的是抽象层 AccessibilityOps）⇒ ⇒ 只能真机验。

    本脚本把整条流程脚本化，包含四件**缺一不可**的事：
      ① 跑 `flutter drive`（**不是** `flutter test -d` —— 后者的退出码被一条
         flutter_tools 的 golden 监听噪声污染，见下）；
      ② 代开无障碍服务（系统设置里的开关，**不能程序化授予**）⇒ ⇒ 必须在
         **app 装完之后**才开（装之前开会被重装冲掉）；
      ③ 把别的窗口推到前台（**自己的 app 读不到自己的窗口** —— Android 无障碍
         框架不把宿主自己的窗口交给它自己绑定的服务 ⇒ ⇒ rootInActiveWindow
         会是 null ⇒ ⇒ 读屏必然是空树）；
      ④ **双保险判成败**：驱动退出码 **＋** 扫一遍 app 侧的日志
         ⇒ ⇒ 因为 `flutter drive` 的官方驱动**看不见普通 `test()` 的失败**
         ⇒ ⇒ 只看退出码会「失败长得像成功」。

    ## 为什么用 `flutter drive` 而不是 `flutter test -d`

    ⚠️ `flutter test -d` 的 host 端（flutter_tools 的
    `FlutterPlatform._listenToVmServiceForGoldens`）在 app 起来之后会**无条件**
    `streamListen('integration_test.VmServiceProxyGoldenFileComparator')`
    ⇒ ⇒ 那是一条**自定义事件流**，只有 app 侧真的 `dev.postEvent(..., stream: …)`
    过一次才会存在 ⇒ ⇒ **不比对 golden 图时它从来不存在** ⇒ ⇒ VM 直接拒：
    `streamListen: invalid 'streamId' parameter` ⇒ ⇒ 而 flutter_tools 里那个
    调用**既没 await 也没 try/catch** ⇒ ⇒ 变成**未捕获的异步错误**
    ⇒ ⇒ 被记成「loading 那个伪用例失败」⇒ ⇒ **整次退出码非 0**，哪怕真用例全过。
    ⇒ ⇒ `flutter drive` 走的是另一条路（主机侧驱动脚本 + app 侧
    ext.integration_test 回调）⇒ ⇒ **压根不碰那条 golden 监听**。

.PARAMETER DeviceId
    adb 设备号（`adb devices` 里那一列）。

.PARAMETER TimeoutSeconds
    整次运行的上限（构建 + 安装 + 用例）。

.EXAMPLE
    pwsh -File shadow-mobile/scripts/verify-mobile-use-on-device.ps1 -DeviceId 192.168.31.193:36549
#>
param(
    [string]$DeviceId = '',
    [int]$TimeoutSeconds = 900,
    # ⚠️ **跑哪一个 target** —— 默认是「读屏 / 手势 / 按文字点击」那一族；
    # ⇒ ⇒ 探针那一族（验「点到了想要的东西」在**自家 UI** 上）传
    # ⇒ ⇒ 'integration_test/a11y_own_ui_probe_test.dart'。
    [string]$Target = 'integration_test/a11y_mobile_use_test.dart',
    # ⚠️ **主机侧驱动** —— 默认是读屏那一族的驱动
    # ⇒ ⇒ 探针那一族用自己的驱动（逻辑相同，但文件名要与 target 对上）。
    [string]$Driver = 'test_driver/a11y_mobile_use_test.dart',
    # ⚠️ **保持自己的 app 在前台** —— 探针那一族**必须**这样：
    # ⇒ ⇒ 读屏那族要把别的窗口推到前台（自己读不到自己），
    # ⇒ ⇒ 而探针要点的正是**自己写的 UI** ⇒ ⇒ 它得在前台。
    [switch]$KeepOwnAppForeground,
    # ⚠️ **只跑解析判据的离线自检**（**不碰设备**）⇒ ⇒ CI 里没真机也能验这些判据。
    # ⇒ ⇒ 用法：`pwsh -File shadow-mobile/scripts/verify-mobile-use-on-device.ps1 -SelfCheck`
    [switch]$SelfCheck
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mobileRoot = Split-Path -Parent $scriptDir

# ---- 解析判据那一半（**纯函数** ⇒ ⇒ 可离线自检）----
# ⚠️⚠️ 为什么抽出去 —— 实测（2026-11-08）那两个缺陷都出在「读 dumpsys 文本」上
# ⇒ ⇒ ⇒ 而「读文本」这件事**根本不需要设备** ⇒ ⇒ ⇒ 抽成纯函数 ⇒ ⇒ 就能离线钉住。
# ⚠️ **路径要跨平台** —— CI 跑在 ubuntu 上 ⇒ ⇒ `Join-Path` 里写反斜杠会当成**文件名的一部分**
# ⇒ ⇒ ⇒ 找不着库 ⇒ ⇒ ⇒ 所以**分段 Join-Path**，不拼字符串。
$parserLib = Join-Path (Join-Path $scriptDir 'lib') 'mobile-use-parsers.ps1'
if (-not (Test-Path -LiteralPath $parserLib)) {
    Write-Error "缺解析库：$parserLib"
}
. $parserLib

# ⚠️ **离线自检** —— **在碰设备之前**就做 ⇒ ⇒ 没连设备也能验判据。
if ($SelfCheck) {
    $self = Invoke-MobileUseParserSelfCheck
    Write-Host '== 解析判据自检 =='
    foreach ($c in $self.Cases) {
        $mark = '过'
        if (-not $c.Ok) { $mark = '红' }
        Write-Host ('  [' + $mark + '] ' + $c.Name + '  —— ' + $c.Detail)
    }
    Write-Host ('共 ' + $self.Cases.Count + ' 条，失败 ' + $self.Failures.Count + ' 条')
    if ($self.Cases.Count -eq 0) { Write-Host '!! 一条用例都没执行 ⇒ ⇒ 空绿 ⇒ ⇒ 判失败'; exit 1 }
    if (-not $self.Ok) { Write-Host '== 有不过 =='; foreach ($f in $self.Failures) { Write-Host ('  - ' + $f) }; exit 1 }
    Write-Host '== 解析判据自检：全过 =='
    exit 0
}
$logDir = Join-Path $mobileRoot 'build\device-verify'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $logDir ("a11y-verify-$stamp.log")

# ---- 设备号：没给就自己找唯一的一台 ----
if ([string]::IsNullOrWhiteSpace($DeviceId)) {
    $devices = @(& adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
    if ($devices.Count -ne 1) {
        Write-Error "需要 -DeviceId：当前在线设备 $($devices.Count) 台（$($devices -join ', ')）"
    }
    $DeviceId = $devices[0]
}
Write-Host "== 设备 $DeviceId =="
# ---- 设备前置体检（**在花时间构建/传输之前**）----
# ⚠️⚠️ 为什么要有这一段 —— 实测（2026-11-09）踩过三道闸，全在**设备侧**：
# ⇒ ⇒ ① **ABI 对不上** ⇒ ⇒ 装**物理上**不可能 ⇒ ⇒ 不查就装 ⇒ ⇒ 白花 200 秒传 200MB；
# ⇒ ⇒ ② **/data 空间不够** ⇒ ⇒ 装到一半失败 ⇒ ⇒ 那是最难查的一种；
# ⇒ ⇒ ③ **设备策略闸**（MIUI「USB 安装」/ One UI「通过 USB 安装应用」）
# ⇒ ⇒ ⇒ ⇒ 只有**物理开关**能解 ⇒ ⇒ 而脚本只能报错 ⇒ ⇒ 报错时得说清是哪一类的闸
# ⇒ ⇒ ⇒ 否则症状（无障碍没绑上）离根因隔了三层 ⇒ ⇒ ⇒ 又是「失败长得像成功」。
$preApk = Join-Path $mobileRoot 'build\app\outputs\flutter-apk\app-debug.apk'
if (Test-Path -LiteralPath $preApk) {
    $preApkBytes = (Get-Item -LiteralPath $preApk).Length
    # APK 里的 ABI 目录（**读的是 APK 本身**，不是构建配置 ⇒ ⇒ 才是事实）
    $apkLibDirs = @()
    try {
        if (-not ('System.IO.Compression.ZipFile' -as [type])) { Add-Type -AssemblyName System.IO.Compression.FileSystem }
        $zip = [System.IO.Compression.ZipFile]::OpenRead($preApk)
        $apkLibDirs = @($zip.Entries | Where-Object { $_.FullName -like 'lib/*/*.so' } | ForEach-Object { ($_.FullName -split '/')[1] } | Sort-Object -Unique)
        $zip.Dispose()
    } catch {
        $apkLibDirs = @()
    }
    $devAbilist = ((& adb -s $DeviceId shell getprop ro.product.cpu.abilist) -join '').Trim()
    $abi = Test-ApkAbiSupported -DeviceAbilist $devAbilist -ApkLibDirs $apkLibDirs
    Write-Host ('== 前置体检：APK ' + [Math]::Round($preApkBytes / 1MB, 1) + ' MB ｜ 设备 ABI=[' + $devAbilist + '] ｜ APK ABI=[' + ($apkLibDirs -join ',') + '] ==')
    if ($abi.Known -and -not $abi.Supported) {
        Write-Host '!! 前置体检不过：这台设备的 ABI 与 APK 没有交集 ⇒ ⇒ 装**物理上**不可能'
        Write-Host '   ⇒ ⇒ 这是**设备侧**的硬约束（不是 app 的缺陷）⇒ ⇒ 换 arm64-v8a / x86_64 的设备'
        exit 1
    }
    $freeBytes = 0
    $dfText = ((& adb -s $DeviceId shell df -k /data 2>$null) -join "`n")
    $dfLine = ($dfText -split "`n" | Where-Object { $_ -match '/data\s*$' } | Select-Object -First 1)
    if ($dfLine) {
        $cols = @($dfLine -split '\s+' | Where-Object { $_ -ne '' })
        if ($cols.Count -ge 4) { $freeBytes = [long]$cols[3] * 1024 }
    }
    $room = Test-InstallHasRoom -ApkBytes $preApkBytes -FreeBytes $freeBytes
    if ($room.Known) {
        Write-Host ('== 前置体检：/data 可用 ' + [Math]::Round($room.Free / 1MB, 1) + ' MB ｜ 至少需要 ' + [Math]::Round($room.Required / 1MB, 1) + ' MB ==')
        if (-not $room.Ok) {
            Write-Host '!! 前置体检不过：/data 空间不足 ⇒ ⇒ 装到一半会失败 ⇒ ⇒ 先清空间'
            exit 1
        }
    }
} else {
    Write-Host '== 前置体检：APK 还不存在（首次构建）⇒ ⇒ 跳过这一段 =='
}


# ---- 记下无障碍授权的原值（跑完要还原 ⇒ 这一步是可逆的）----
$prevServices = (& adb -s $DeviceId shell settings get secure enabled_accessibility_services) -join ''
$prevEnabled = (& adb -s $DeviceId shell settings get secure accessibility_enabled) -join ''
Write-Host "== 原无障碍状态：services=[$prevServices] enabled=[$prevEnabled] =="

# ---- 记下屏幕旋转的原值（跑完要还原 ⇒ 这一步是可逆的）----
$prevAutoRotate = (& adb -s $DeviceId shell settings get system accelerometer_rotation) -join ''
$prevRotation = (& adb -s $DeviceId shell settings get system user_rotation) -join ''
# ⚠️⚠️ **必须锁定竖屏** —— 实测踩过：设备**跑着跑着转了屏**
# ⇒ ⇒ 横屏时 dpr=1.33、竖屏时 dpr=2.625 ⇒ ⇒ 视口尺寸与 dpr 全变
# ⇒ ⇒ ⇒ 而探针的坐标（目标矩形 / 空白点 / 候选点）都是**按当时那套几何**算的
# ⇒ ⇒ ⇒ 转屏发生在「量」与「用」之间 ⇒ ⇒ 偏移立刻过期 ⇒ ⇒ 点到别的地方
# ⇒ ⇒ ⇒ 症状：落点与目标差几十像素 ⇒ ⇒ 看着像「点歪了」
# ⇒ ⇒ ⇒ 其实是我们自己的坐标**过期**了 ⇒ ⇒ ⇒ 所以**从根上锁死**它。
Write-Host "== 锁定竖屏（原：autoRotate=[$prevAutoRotate] userRotation=[$prevRotation]）=="
& adb -s $DeviceId shell settings put system accelerometer_rotation 0 | Out-Null
& adb -s $DeviceId shell settings put system user_rotation 0 | Out-Null

# ---- 屏幕：探针那一族**必须**有屏 ----
# ⚠️⚠️ 为什么：探针要量**自家 App 的真实布局** ⇒ ⇒ App 得真渲染
# ⇒ ⇒ 而**屏幕灭着** ⇒ ⇒ App 处在 paused ⇒ ⇒ 引擎没有 vsync ⇒ ⇒ 一个帧都没有
# ⇒ ⇒ ⇒ 症状同样是「布局没落地」，但**根因完全不同** ⇒ ⇒ 别混为一谈。
# ⚠️ 这台机器默认 30 秒 ⇒ ⇒ 一次 drive（构建 + 安装 + 跑用例）好几分钟
# ⇒ ⇒ 屏幕必然在跑用例**之前**就灭了 ⇒ ⇒ 所以这里临时拉长（收尾还原）。
$prevScreenTimeout = (& adb -s $DeviceId shell settings get system screen_off_timeout) -join ''
Write-Host "== 原息屏超时：$prevScreenTimeout ms =="
if ($prevScreenTimeout -and $prevScreenTimeout -ne 'null') {
    & adb -s $DeviceId shell settings put system screen_off_timeout 1800000 | Out-Null
}

function Restore-Accessibility {
    if ($prevServices -and $prevServices -ne 'null') {
        & adb -s $DeviceId shell settings put secure enabled_accessibility_services $prevServices | Out-Null
    } else {
        & adb -s $DeviceId shell settings delete secure enabled_accessibility_services | Out-Null
    }
    if ($prevEnabled -and $prevEnabled -ne 'null') {
        & adb -s $DeviceId shell settings put secure accessibility_enabled $prevEnabled | Out-Null
    }
    # ⚠️ **屏幕旋转也要还原** —— 上面把它锁成竖屏了 ⇒ ⇒ 跑完必须还原
    # ⇒ ⇒ ⇒ 否则用户在手机上会莫名其妙发现「自动旋转关了」。
    if ($prevAutoRotate -and $prevAutoRotate -ne 'null') {
        & adb -s $DeviceId shell settings put system accelerometer_rotation $prevAutoRotate | Out-Null
    }
    if ($prevRotation -and $prevRotation -ne 'null') {
        & adb -s $DeviceId shell settings put system user_rotation $prevRotation | Out-Null
    }
}

# ---- 无障碍服务**真的绑上了**吗？（**跨机型**判据）----
# ⚠️⚠️ 为什么不能用单一正则 —— 实测（2026-11-04）两台机器的 dumpsys **格式不同**：
# ⇒ ⇒ 三星：`Bound services:{Service[label=影, …] com.ibloc.shadow/…}` ⇒ 含**包名**
# ⇒ ⇒ 小米(MIUI)：`Bound services:{Service[label=影, …]}` ⇒ **只有 label、没有包名**
# ⇒ ⇒ ⇒ 只按包名匹配 ⇒ ⇒ 在 MIUI 上**永远匹配不到** ⇒ ⇒ **假阴性**
# ⇒ ⇒ ⇒ ⇒ 症状：脚本一直判「没绑上」⇒ ⇒ 每 5 秒 delete+put 重开一次
# ⇒ ⇒ ⇒ ⇒ ⇒ 那会把**本来好好的绑定**反复拆了再装 ⇒ ⇒ 反而干扰探针。
# ✅ ⇒ ⇒ 所以判据改成**双信号**：
# ⇒ ⇒ ① `Enabled services` 里有我们的包（**授权**有了）
# ⇒ ⇒ ② **服务自己**在**当前进程**里打过那行连上日志（**绑定**有了）
# ⇒ ⇒ ⇒ ② 用 `logcat --pid=<当前 pid>` 过滤 ⇒ ⇒ **不可能取到旧进程的证据**
# ⇒ ⇒ ⇒ ⇒ ⇒ 这正好补上原来「logcat 判据会被冲掉 / 可能是旧进程」那两个坑。
function Test-A11yServiceBound {
    param([string]$PidText)
    $dump = (& adb -s $DeviceId shell dumpsys accessibility 2>$null) -join [Environment]::NewLine
    $log = ''
    if ($PidText) {
        $log = (& adb -s $DeviceId logcat -d --pid=$PidText -t 400 2>$null) -join [Environment]::NewLine
    }
    # ⚠️ 判据本体在**纯函数**里（lib/mobile-use-parsers.ps1）⇒ ⇒ 可离线自检。
    $sig = Get-A11yBindingSignals -Dump $dump -ServiceLog $log
    return $sig.Bound
}

# ---- app 的窗口现在在哪块屏上（空串 = 还没起来 / 查不到）----
# ⚠️ 为什么要查「哪块屏」：实测（2026-11-04）真凶 —— 这台设备上**同时有**
# ⇒ ⇒ **多块屏**：display 0（内屏 1080x1920 @420dpi）＋ display 2/16
# ⇒ ⇒ （**DeX 虚拟桌面屏** 1920x1080 @**213dpi**）
# ⇒ ⇒ ⇒ 而 `flutter drive` 把 app launching 上去时，任务**可能落在虚拟屏上**
# ⇒ ⇒ ⇒ 那块屏 dpr = 213/160 = **1.33125**（内屏是 420/160 = **2.625**）
# ⇒ ⇒ ⇒ 而**无障碍手势只派发到默认屏** ⇒ ⇒ 两块屏**坐标系不同**
# ⇒ ⇒ ⇒ ⇒ 手势落不进我们自己的窗口 ⇒ ⇒ **零指针事件**
# ⇒ ⇒ ⇒ ⇒ 症状：**「派发成功、却什么都没点到」** ⇒ ⇒ 长得像手势坏了
# ⇒ ⇒ ⇒ ⇒ 实际上是我们**不在手势去的那块屏上**。
function Get-AppWindowDisplayId {
    $dump = (& adb -s $DeviceId shell dumpsys window windows 2>$null) -join "`n"
    # ⚠️ 判据本体在**纯函数**里（**按块解析** ⇒ ⇒ 不会把别人的屏当成我们的）。
    return (Get-AppWindowDisplayIdFromDump -Dump $dump)
}

# ---- 把 app 的 task 钉回**默认屏**（display 0）----
# ⚠️⚠️ **治法**：`am stack move-task <taskId> <目标屏rootTaskId> true`
# ⇒ ⇒ ⇒ 它搬的是**任务**，**不是重启 app** ⇒ ⇒ **进程不变**（实测 pid 不变）
# ⇒ ⇒ ⇒ ⇒ ⇒ 所以 VM service 不断、flutter drive 不受影响、探针不中断。
# ⚠️⚠️ **参数顺序是三星改过的** —— 实测踩过两种报错：
# ⇒ ⇒ `move-task <taskId> <rootTaskId> <toTop>`，而 rootTaskId 要的是
# ⇒ ⇒ **目标屏的 RootTask id**（**不是** display id！）
# ⇒ ⇒ ⇒ 传 0 会报 "No rootTask for rootTaskId=0" ⇒ ⇒ 那不是失败，是参数不对。
function Ensure-AppOnPrimaryDisplay {
    $displayId = Get-AppWindowDisplayId
    if (-not $displayId) { return $true }      # 窗口还没起来 ⇒ 等下一轮
    if ($displayId -eq '0') { return $true }    # 已经在默认屏上 ⇒ 没事
    $stack = (& adb -s $DeviceId shell am stack list 2>$null) -join "`n"
    $place = Get-StackPlacementFromDump -Stack $stack
    if ((-not $place.TaskId) -or ($place.RootTaskIds.Count -eq 0)) {
        Write-Host "!! 找不到 task / 目标屏 rootTask ⇒ ⇒ 搬不了屏（当前 display $displayId）"
        return $false
    }
    # ⚠️⚠️ **挨个试**目标屏上的 rootTask —— 实测（2026-11-04）那版只取「第一个」
    # ⇒ ⇒ 取到的是启动器那个（id=1）⇒ ⇒ 这次恰好能搬 ⇒ ⇒ **纯属运气**
    # ⇒ ⇒ ⇒ 因为「哪个 rootTask 能承载 app」是系统内部决定的 ⇒ ⇒ 挑错就搬不动。
    foreach ($root in $place.RootTaskIds) {
        Write-Host "== app 落在 display $displayId ⇒ ⇒ 搬回默认屏（task $($place.TaskId) → rootTask $root）=="
        & adb -s $DeviceId shell am stack move-task $place.TaskId $root true 2>&1 | Out-Null
        # ⚠️⚠️ **搬屏是异步的** —— 实测（2026-11-04）搬完 1.2 秒去查，
        # ⇒ ⇒ 窗口**还报旧屏** ⇒ ⇒ 脚本连喊三次「还是 display 2」⇒ ⇒
        # ⇒ ⇒ 而其实 task **早就搬到了** display 0 ⇒ ⇒ ⇒ 白折腾。
        # ⇒ ⇒ ⇒ 修法：**轮询**到窗口真的换屏为止（最多 ~12 秒）。
        for ($i = 1; $i -le 12; $i++) {
            Start-Sleep -Milliseconds 1000
            $after = Get-AppWindowDisplayId
            if ($after -eq '0') {
                Write-Host "== 搬屏后：display 0（用了 ${i}s）=="
                return $true
            }
        }
        Write-Host "== 换了 rootTask $root 之后仍在 display $after ⇒ ⇒ 换下一个 =="
    }
    Write-Host '!! 搬不动 ⇒ ⇒ 目标屏上的 rootTask 都试过了'
    return $false
}

# ---- 期望的 dpr（默认屏 density/160）—— 交给探针**自检** ----
# ⚠️ 为什么主机要算这个：探针**自己**量到的 dpr 与主机期望不符
# ⇒ ⇒ ⇒ 说明它落在别的屏上 ⇒ ⇒ 这一轮**不成立** ⇒ ⇒ 明确报错，
# ⇒ ⇒ ⇒ 而不是把「派发成功、零指针事件」报成「手势坏了」。
$expectDpr = ''
$densityText = ((& adb -s $DeviceId shell wm density 2>$null) -join ' ')
# ⚠️⚠️ **先看 Override，再看 Physical** —— 实测（2026-11-09，MI_MAX_2）：
# ⇒ ⇒ `wm density` 同时给两行（Physical 480 / **Override 440**）⇒ ⇒
# ⇒ ⇒ 实际生效的是 **Override**（440 ⇒ dpr **2.75**）⇒ ⇒
# ⇒ ⇒ 以前只读 Physical（480 ⇒ dpr 3.0）⇒ ⇒ 探针那句
# ⇒ ⇒ 「我在主机期望的那块屏上吗」⇒ ⇒ **判这一轮不成立**
# ⇒ ⇒ ⇒ 而这一轮其实**完全成立** ⇒ ⇒ 那是**假红** ⇒ ⇒ 读数被白白丢掉。
$densityValue = 0
if ($densityText -match 'Override density:\s*(\d+)') {
    $densityValue = [double]$Matches[1]
}
elseif ($densityText -match 'Physical density:\s*(\d+)') {
    $densityValue = [double]$Matches[1]
}
if ($densityValue -gt 0) {
    $expectDpr = ($densityValue / 160).ToString('0.####', [Globalization.CultureInfo]::InvariantCulture)
    Write-Host "== 默认屏 density=$densityValue ⇒ ⇒ 期望 dpr=$expectDpr =="
}

$flutterCmd = (Get-Command flutter -ErrorAction Stop).Source
$driveArgs = @(
    'drive',
    # ⚠️⚠️ **必须加括号** —— PowerShell 里 `,` 的优先级**低于** `+`
    # ⇒ ⇒ 不加括号时 `'--target=' + $Target, '-d', $DeviceId` 会被解析成
    # ⇒ ⇒ `'--target=' + ($Target, '-d', $DeviceId)`
    # ⇒ ⇒ 数组被拼成**八个独立元素**（实测：COUNT=8，
    # ⇒ ⇒ 其中有 `'--target='` 和 `$Target` **两个**）
    # ⇒ ⇒ flutter 收到**空**的 target ⇒ ⇒ 「Target file "" not found.」
    # ⇒ ⇒ ⇒ 教训：**参数拼接一律加括号**。
    ('--driver=' + $Driver),
    ('--target=' + $Target),
    '-d', $DeviceId,
    '--no-dds',
    # ⚠️⚠️ **跑完不要卸载** —— `flutter drive` 默认在结束时会调
    # ⇒ ⇒ `driverService.stop()` ⇒ ⇒ 那条路在 Android 上是**卸载 App**
    # ⇒ ⇒ ⇒ 所以跑完 `pm list packages` 查不到包（实测：19:18:33 被卸）。
    # ⇒ ⇒ ⇒ `--keep-app-running` 让它打印「Leaving the application running.」
    # ⇒ ⇒ ⇒ 并**跳过**那次 stop ⇒ ⇒ 包留在设备上。
    # ⚠️⚠️ **但光留着不够** —— 留着的是**集成测试目标包**（Dart 入口是
    # ⇒ ⇒ integration_test/xxx.dart，**不是** lib/main.dart）⇒ ⇒ 启动是黑屏
    # ⇒ ⇒ ⇒ 所以收尾还要把**真 App** 装回去（见下面「收尾」那段）。
    '--keep-app-running'
)

# ⚠️⚠️ **把「期望的 dpr」交给探针** —— 让探针**自己**判「我在不在手势去的那块屏上」
# ⇒ ⇒ ⇒ 对不上就**明确说这一轮不成立**，而不是把「派发成功、零指针事件」
# ⇒ ⇒ ⇒ 报成「手势坏了」（那是**失败长得像成功**的另一种形态）。
if ($expectDpr) {
    $driveArgs += ('--dart-define=PROBE_EXPECT_DPR=' + $expectDpr)
}

Write-Host "== 起 flutter drive（日志：$logPath）=="
# ⚠️ 日志**边跑边写** —— 上一版是「跑完才落盘」⇒ ⇒ 一旦卡住就**什么都没有**。
$job = Start-Job -ScriptBlock {
    param($wd, $flutter, $argsList, $logFile)
    Set-Location -LiteralPath $wd
    # ⚠️⚠️ **必须把原生输出的解码方式改成 UTF-8** —— PowerShell 默认按
    # 控制台代码页（这台机器是 GBK）解码 ⇒ ⇒ 设备/app 出来的中文**全变乱码**
    # ⇒ ⇒ 日志没法看、也没法在台账里引用。
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    & $flutter @argsList 2>&1 | ForEach-Object {
        $_ | Out-File -LiteralPath $logFile -Append -Encoding utf8
    }
    $LASTEXITCODE
} -ArgumentList $mobileRoot, $flutterCmd, $driveArgs, $logPath

$exitCode = 1
try {
    # ---- ② 等 app 进程起来 ⇒ 代开无障碍 ----
    # ⚠️⚠️ **截止时间给满** —— 这个循环要**一路盯到 drive 结束**
    # ⇒ ⇒ 因为 drive 可能**重装** app（⇒ ⇒ 授权会被冲掉）⇒ ⇒ 得有补授权的机会。
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $granted = $false
    $lastPid = ''
    $lastAttempt = [DateTime]::MinValue
    $clearedLogcat = $false
    $lastKeepAlive = [DateTime]::MinValue
    $lastDisplayCheck = [DateTime]::MinValue
    $foregroundPid = ''
# ⚠️ **靶子回前台的时间戳** —— 读屏族的靶子（系统设置）必须**一直在前台**
# ⇒ ⇒ 理由见下面那段注释（用例会把它切走，而驱动只准备了一次）。
$lastTargetForeground = [DateTime]::MinValue
    while ((Get-Date) -lt $deadline) {
        if ($job.State -ne 'Running') { break }
        $pidText = ((& adb -s $DeviceId shell pidof com.ibloc.shadow) -join '').Trim()
        # ---- ① app 必须待在**默认屏**上（手势只去那块屏）----
        # ⚠️ 每 3 秒查一次就够 —— 它只在 drive **重装** app 之后才可能跑偏。
        if (((Get-Date) - $lastDisplayCheck).TotalSeconds -ge 3) {
            $lastDisplayCheck = Get-Date
            if ($pidText -ne '') { $null = Ensure-AppOnPrimaryDisplay }
        }
        if ($pidText -ne '') {
            # ⚠️⚠️⚠️ **授权必须「跟着当前进程走」** —— 2026-11-03 真机实测踩出来的：
            # ⇒ ⇒ `flutter drive` 会**重装** app ⇒ ⇒ 卸载会把系统设置里的
            # ⇒ ⇒ `enabled_accessibility_services` **清空**（实测：跑完是 null）
            # ⇒ ⇒ ⇒ 「授权一次」**不够** ⇒ ⇒ 授权给**旧进程**那份在重装后失效
            # ⇒ ⇒ ⇒ 症状：app 侧 `isEnabled` 永远 false ⇒ ⇒ 用例等满 60 秒才失败。
            # ⇒ ⇒ ⇒ 所以：**pid 一变就重新代开**（外加每 5 秒兜底复查一次）。
            # ⚠️⚠️⚠️ **不要「每 5 秒重写一次设置项」** ——
            # ⇒ ⇒ 改写 `enabled_accessibility_services` ⇒ ⇒ 系统会**重绑**那个服务
            # ⇒ ⇒ ⇒ 等于**脚本自己在制造竞态**：服务被拆 → 实例为 null →
            # ⇒ ⇒ ⇒ app 侧的准入读数在那一秒里读成「没开」
            # ⇒ ⇒ ⇒ 真机实测（2026-11-10）：那一秒里工具层抛的是
            # ⇒ ⇒ ⇒ 「请去系统设置里打开」—— 而那里本来就是开的。
            # ⇒ ⇒ ⇒ **尺子不许自己拨动被测物** ⇒ ⇒ 改成：
            # ⇒ ⇒ ⇒ **pid 变了**（drive 重装 ⇒ 授权被清空）**或**
            # ⇒ ⇒ ⇒ **服务当前确实没绑上**（真的掉了）⇒ ⇒ 才重开授权。
            $needAttempt = ($pidText -ne $lastPid) -or (-not (Test-A11yServiceBound -PidText $pidText))
            if (-not $needAttempt) {
                Start-Sleep -Milliseconds 700
                continue
            }
            $lastPid = $pidText
            $lastAttempt = Get-Date
            Write-Host "== app 在跑（pid $pidText）⇒ 代开无障碍服务 =="
            # ⚠️⚠️ **先把屏幕点亮** —— 否则探针那一族量不到布局：
            # ⇒ ⇒ 息屏 ⇒ ⇒ App paused ⇒ ⇒ 没有 vsync ⇒ ⇒ 没有帧 ⇒ ⇒ 树不构建。
            & adb -s $DeviceId shell input keyevent KEYCODE_WAKEUP | Out-Null
            & adb -s $DeviceId shell wm dismiss-keyguard 2>$null | Out-Null
            # ⚠️⚠️ **先清空 logcat** —— 确认信号是「服务连上时打的那行日志」
            # ⇒ ⇒ 而 logcat 里**可能还留着上一轮**的那行
            # ⇒ ⇒ ⇒ 不清就等于**拿上一轮的证据当这一轮的**（假阳性）
            # ⇒ ⇒ ⇒ 那样「服务没连上」会被判成「连上了」⇒ ⇒ 又是「失败长得像成功」。
            # ⚠️⚠️ **只清第一次** —— 上面这段授权会**每 5 秒重做一次**
            # ⇒ ⇒ 每次都清 ⇒ ⇒ 反而把 app 侧的取证行（performTap dispatched=…）
            # ⇒ ⇒ **全擦掉** ⇒ ⇒ 到时候只剩「派发成功但落点没进来」没有旁证。
            if (-not $clearedLogcat) {
                & adb -s $DeviceId logcat -c 2>$null | Out-Null
                $clearedLogcat = $true
            }
            & adb -s $DeviceId shell settings put secure enabled_accessibility_services com.ibloc.shadow/com.ibloc.shadow.PrefrontalAccessibilityService | Out-Null
            & adb -s $DeviceId shell settings put secure accessibility_enabled 1 | Out-Null
            # ⚠️⚠️ **代开不等于生效** —— 这一步必须**验**，不能假定：
            # ⇒ ⇒ `settings put` 只是改了设置项 ⇒ ⇒ 系统**随后**才去连服务
            # ⇒ ⇒ 而 app 正在被 flutter drive **反复重装**（pid 会变）
            # ⇒ ⇒ ⇒ 授权可能落在**旧进程**上 ⇒ ⇒ 新进程里的服务**根本没连上**
            # ⇒ ⇒ ⇒ 症状：app 侧 `isEnabled` 永远 false（等满 60 秒才失败）
            # ⇒ ⇒ ⇒ 判据：**服务自己**连上时会打一行日志
            # ⇒ ⇒ ⇒ （PrefrontalAccessibilityService connected）⇒ ⇒ 用它当**确认信号**。
            # ⚠️⚠️ **判据必须是「当前状态」，不能是「历史日志」** ——
            # ⇒ ⇒ 原来打算用 logcat 里「服务连上时打的那行」当确认信号
            # ⇒ ⇒ 实测**不可靠**：那条行会被后续日志**冲掉**（-t 400 取不到），
            # ⇒ ⇒ 而且它可能属于**上一个进程**（实测：pid 1606 的还在，
            # ⇒ ⇒   而这一轮 pid 3709 的服务**从没连上**）⇒ ⇒ 两种都会假阳性。
            # ⇒ ⇒ ⇒ 改用 `dumpsys accessibility`：它给的是**现在**的绑定关系
            # ⇒ ⇒ ⇒（`Bound services` ＝ 已绑上的、`Enabled services` ＝ 已授权的）
            # ⇒ ⇒ ⇒ 两个都要有 —— 只「授权」没「绑定」＝ 服务没真起来。
            $connected = $false
            for ($i = 0; $i -lt 40; $i++) {
                if (Test-A11yServiceBound -PidText $pidText) { $connected = $true; break }
                Start-Sleep -Milliseconds 600
            }
            if (-not $connected) {
                Write-Host '!! 无障碍服务没真绑上 ⇒ ⇒ 重开一次授权'
                # ⚠️ 重开时**先关后开** —— 只改设置项不会让系统**重新绑定**一个
                # ⇒ ⇒ 已经绑失败过的服务 ⇒ ⇒ 必须先 delete 再 put。
                & adb -s $DeviceId shell settings delete secure enabled_accessibility_services | Out-Null
                Start-Sleep -Milliseconds 800
                & adb -s $DeviceId shell settings put secure enabled_accessibility_services com.ibloc.shadow/com.ibloc.shadow.PrefrontalAccessibilityService | Out-Null
                # ⚠️⚠️ **还要 toggle 一下 `accessibility_enabled`** —— 实测（2026-11-04，MIUI 那台）
                # ⇒ ⇒ 只 put 的话系统**不会重新绑定**：dumpsys 里 Enabled 有我们、Bound 却是空
                # ⇒ ⇒ ⇒ 而 0 → 1 那个 toggle **逼它重读一遍设置** ⇒ ⇒ 当场绑上 ✓
                & adb -s $DeviceId shell settings put secure accessibility_enabled 0 | Out-Null
                Start-Sleep -Milliseconds 500
                & adb -s $DeviceId shell settings put secure accessibility_enabled 1 | Out-Null
                for ($i = 0; $i -lt 40; $i++) {
                    if (Test-A11yServiceBound -PidText $pidText) { $connected = $true; break }
                    Start-Sleep -Milliseconds 600
                }
            }
            if ($connected) {
                Write-Host "== 无障碍服务已授权**且已绑定**（pid $($pidText.Trim())）=="
                $granted = $true
            } else {
                # ⚠️⚠️ **不要在这一刻就判失败** —— 没绑上**不代表**整轮没戏：
                # ⇒ ⇒ drive 还在重装 ⇒ ⇒ 下一个 pid 上来还得**再代开一次**。
                Write-Host "!! 无障碍服务还没绑上（pid $pidText）⇒ ⇒ 继续盯"
            }

            # ---- ③ 把别的窗口推到前台（自己读不到自己）----
            # ⚠️ **两个都做**：HOME 先离开自己的 app（它读不到自己的窗口），
            #    然后**明确拉起系统设置** —— 它的列表行是**稳定的可点文字**，
            #    「按文字点击」那条正路径要的就是这种目标；
            #    而且它**确定**在前面（HOME 之后有时落在应用抽屉，不确定）。
            # ⚠️⚠️⚠️ **每个 pid 都要重切一次** —— `flutter drive` 会**重装** app
            # ⇒ ⇒ 重装把我们自己的 App 拉回前台 ⇒ ⇒ 而**自己的 app 读不到
            # ⇒ ⇒ ⇒ 自己的窗口** ⇒ ⇒ 读屏那族读到 null ⇒ ⇒ 报成「服务没连上」
            # ⇒ ⇒ ⇒ ⇒ 那是**假象** —— 服务明明绑着（dumpsys 有 Bound services）。
            if ($granted -and $foregroundPid -ne $pidText) {
                if ($KeepOwnAppForeground) {
                    # ⚠️ **探针模式**：不切前台 —— 被点的正是**我们自己的 UI**
                    # ⇒ ⇒ 切走了手势就落到别的窗口上 ⇒ ⇒ 那一族就白跑了。
                    Write-Host '== 保持自己的 app 在前台（探针模式）=='
                } else {
            Start-Sleep -Milliseconds 1500
            & adb -s $DeviceId shell input keyevent KEYCODE_HOME | Out-Null
            Start-Sleep -Milliseconds 800
            # ⚠️ 这一句偶尔会报「Activity not started, unknown error code 10」
            #    —— 那表示**设置已经在最前面**了（意图已送达、无需再启动）
            #    ⇒ ⇒ 不是错误 ⇒ ⇒ 把它的 stderr 收掉，别在输出里吓人。
                    & adb -s $DeviceId shell am start -a android.settings.SETTINGS 2>$null | Out-Null
                }
                # ⚠️ **前台切换只做一次** —— 之后继续盯授权（drive 可能再重装）。
                $foregroundPid = $pidText
            }

            # ⚠️⚠️⚠️ **靶子得「一直在前台」**（2026-11-11 真机实测补的）
            # ⇒ ⇒ 上面那次切换**只在 pid 变化时做一次**
            # ⇒ ⇒ ⇒ 而用例里任何一个 `back` / `home`（全局动作那条、
            # ⇒ ⇒ ⇒ 滑动那条的收尾……）都会把**靶子切走**
            # ⇒ ⇒ ⇒ ⇒ 而驱动脚本**永远不会把它拉回来**
            # ⇒ ⇒ ⇒ ⇒ ⇒ 实测后果：「滑动手势（别人的 app 里）」那条
            # ⇒ ⇒ ⇒ ⇒ ⇒ 量到的其实是**桌面** ⇒ ⇒ ⇒ 红了
            # ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：靶子要有人负责「一直在」**
            # ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **只准备一次是不够的** ——
            # ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 用例会把它弄走的。
            if ($granted -and -not $KeepOwnAppForeground) {
                if (((Get-Date) - $lastTargetForeground).TotalSeconds -ge 6) {
                    $lastTargetForeground = Get-Date
                    # ⚠️ **只拉起，不按 HOME** —— HOME 会让系统落在启动器
                    # ⇒ ⇒ ⇒ 而启动器不是确定可滚的靶子（实测滑它不生效）
                    & adb -s $DeviceId shell am start -a android.settings.SETTINGS 2>$null | Out-Null
                }
            }

            # ⚠️⚠️⚠️ **保活：App 必须处于「resume」才收得到触摸** ——
            # ⇒ ⇒ 息屏 ⇒ ⇒ Activity 被 **STOPPED** ⇒ ⇒ dispatchGesture 派发
            # ⇒ ⇒ ⇒ **成功**（dispatched=true）但**落不到 app 的窗口上**
            # ⇒ ⇒ ⇒ 症状：app 里零指针事件 ⇒ ⇒ 校准永远量不出偏移。
            # ⇒ ⇒ ⇒ 实测（2026-11-03）：mWakefulness=Dozing ＋
            # ⇒ ⇒ ⇒ state=STOPPED ⇒ ⇒ 就是这一条。
            # ⇒ ⇒ ⇒ 所以这里**定期**把它点亮 ＋ 拉回前台。
            # ⚠️ **只在探针模式做** —— 读屏那一族**故意**把别的窗口推到前台
            # ⇒ ⇒ 这里再拉回来就把它毁掉了。
            if (((Get-Date) - $lastKeepAlive).TotalSeconds -ge 8) {
                $lastKeepAlive = Get-Date
                & adb -s $DeviceId shell input keyevent KEYCODE_WAKEUP | Out-Null
                & adb -s $DeviceId shell wm dismiss-keyguard 2>$null | Out-Null
                # ⚠️ **只有探针模式才把自家 App 拉回前台** —— 读屏那一族
                # ⇒ ⇒ **故意**要让别的窗口在前台（自己读不到自己）
                if ($KeepOwnAppForeground) {
                    # ⚠️ 这一句偶尔会报「Activity not started, unknown error code 10」
                    #    —— 那表示**它已经在最前面**了 ⇒ ⇒ 不是错误 ⇒ ⇒ stderr 收掉。
                    & adb -s $DeviceId shell am start -n com.ibloc.shadow/com.ibloc.shadow.MainActivity 2>$null | Out-Null
                }
                # ⚠️ **对照 tap 已撤掉** —— 它的使命完成（证明「不是 a11y 独有的问题」）
                # ⇒ ⇒ 现在事件能进 app 了 ⇒ ⇒ 它反而会**污染校准**
                # ⇒ ⇒ ⇒（校准靠 `downCount` 增量认「这一次手势」）
            }
        }
        Start-Sleep -Milliseconds 700
    }
    if (-not $granted) {
        # ⚠️⚠️ **这不是判失败的依据** —— 权威是 **app 自己报的结论**
        # ⇒ ⇒（驱动只信 `shadow_verdict`）⇒ ⇒ 这里只是**主机侧信号没看见**
        # ⇒ ⇒ ⇒ 而它可能是**机型格式不同**导致的假阴性（见 Test-A11yServiceBound）
        # ⇒ ⇒ ⇒ ⇒ 所以这句话**不能**写成「判失败」—— 那会与真实退出码打架。
        Write-Host '!! 主机侧没看到「服务已绑定」的信号 ⇒ ⇒ 可能机型格式不同（权威仍是 app 侧结论）'
    }

    $null = Wait-Job $job -Timeout $TimeoutSeconds
    if ($job.State -eq 'Running') {
        Stop-Job $job
        Write-Host '!! 超时 ⇒ 判失败'
    }
    $raw = Receive-Job $job
    $exitCode = 1
    foreach ($line in $raw) {
        if (($line -as [int]) -ne $null) { $exitCode = [int]$line }
    }
    # ⚠️⚠️ **失败也要归因** —— `flutter drive` 装不上 app 时，错误码**就在它的日志里**
    # ⇒ ⇒（实测原文：`adb.exe: failed to install …: Failure [INSTALL_FAILED_USER_RESTRICTED: Install canceled by user]`）
    # ⇒ ⇒ 而不解析 ⇒ ⇒ 就只剩一句「退出码非 0」⇒ ⇒ ⇒ 跟 app 缺陷分不开。
    # ⚠️⚠️⚠️ **归因的输入必须取「真源」** —— 原来喂的是 `Receive-Job` 的**输出对象**
    # ⇒ ⇒ 而那个对象在 job 被 `Stop-Job` 打断时**可能是空的** ⇒ ⇒ ⇒ 归因被**静默跳过**
    # ⇒ ⇒ ⇒ （实测：真机那一轮归因行压根没打印 ⇒ ⇒ 就是因为 `$raw` 空了）
    # ⇒ ⇒ ⇒ 而**日志文件**才是完整的（job 的脚本块一直在 `Out-File -Append`）⇒ ⇒ 用它。
    if ($exitCode -ne 0) {
        $logText = ''
        if (Test-Path -LiteralPath $logPath) { $logText = Get-Content -LiteralPath $logPath -Raw -ErrorAction SilentlyContinue }
        $rawText = ''
        if ($raw) { $rawText = (@($raw) | ForEach-Object { "$_" }) -join "`n" }
        $driveFailure = Get-InstallFailureKind -Text ($logText + "`n" + $rawText)
        if ($driveFailure.Kind -ne 'unknown') {
            Write-Host ('!! 归因：' + $driveFailure.Kind + '（' + $driveFailure.Code + '）')
            Write-Host ('   ⇒ ⇒ ' + $driveFailure.Hint)
        }
    }
}
finally {
    Restore-Accessibility
    if ($prevScreenTimeout -and $prevScreenTimeout -ne 'null') {
        & adb -s $DeviceId shell settings put system screen_off_timeout $prevScreenTimeout | Out-Null
    }
    Remove-Job $job -Force -ErrorAction SilentlyContinue
}

# ---- 跑完把**真 App** 装回去 ----
# ⚠️⚠️ **为什么不能就这么算了** —— `flutter drive` 装的是**集成测试目标包**
# ⇒ ⇒ 它的 Dart 入口是 `integration_test/xxx.dart`，**不是** `lib/main.dart`
# ⇒ ⇒ 留在设备上启动起来是**黑屏**（跑的是测试 harness）
# ⇒ ⇒ ⇒ 所以「跑完设备上留着的」必须是**真 App**，不是那个测试包。
Write-Host '== 收尾：把真 App（入口 lib/main.dart）装回设备 =='
$appApk = Join-Path $mobileRoot 'build\app\outputs\flutter-apk\app-debug.apk'
$buildOk = $false
$buildTail = @()
Push-Location -LiteralPath $mobileRoot
try {
    $buildTail = @(& $flutterCmd build apk --debug 2>&1 | ForEach-Object { "$_" })
    $buildOk = ($LASTEXITCODE -eq 0)
} catch {
    Write-Host "!! 构建真 App 时抛错：$($_.Exception.Message)"
} finally {
    Pop-Location
}
if (-not $buildOk) {
    Write-Host '!! 真 App 构建失败 ⇒ ⇒ 设备上留着的是**测试包**（启动是黑屏）'
    $buildTail | Select-Object -Last 8 | ForEach-Object { Write-Host "   $_" }
    $exitCode = 1
} elseif (-not (Test-Path -LiteralPath $appApk)) {
    Write-Host "!! 真 App APK 不存在：$appApk"
    $exitCode = 1
} else {
    # ⚠️⚠️ **不许把 stderr 吞掉** —— 原来这行是 `| Out-Null`
    # ⇒ ⇒ ⇒ 安装失败时那句 `INSTALL_FAILED_USER_RESTRICTED` **没人看得到**
    # ⇒ ⇒ ⇒ 脚本只知道「退出码非 0」⇒ ⇒ ⇒ 跟 app 缺陷分不开 ⇒ ⇒ ⇒ 又一次「失败长得像成功」。
    $installOut = @(& adb -s $DeviceId install -r $appApk 2>&1 | ForEach-Object { "$_" })
    if ($LASTEXITCODE -ne 0) {
        Write-Host '!! 真 App 装回去失败'
        $installFailure = Get-InstallFailureKind -Text ($installOut -join "`n")
        if ($installFailure.Kind -ne 'unknown') {
            Write-Host ('   ⇒ ⇒ 归因：' + $installFailure.Kind + '（' + $installFailure.Code + '）')
            Write-Host ('   ⇒ ⇒ ' + $installFailure.Hint)
        } else {
            $installOut | Select-Object -Last 5 | ForEach-Object { Write-Host ('   ' + $_) }
        }
        $exitCode = 1
    } else {
        Write-Host '== 真 App 已装回设备 =='
        # ⚠️ **MD5 双向对账** —— 「装成功」**不等于**「装的是这一份」。
        $localMd5 = (Get-FileHash -LiteralPath $appApk -Algorithm MD5).Hash.ToLowerInvariant()
        $devicePath = (((& adb -s $DeviceId shell pm path com.ibloc.shadow) -join '').Trim()) -replace '^package:', ''
        $deviceMd5 = ''
        if ($devicePath) {
            $deviceMd5 = (((& adb -s $DeviceId shell md5sum $devicePath) -join '').Trim() -split '\s+')[0]
        }
        if ($deviceMd5 -and $deviceMd5.ToLowerInvariant() -eq $localMd5) {
            Write-Host "== MD5 对账一致：$localMd5 =="
        } else {
            Write-Host "!! MD5 对账**不一致**（本地=$localMd5 设备=$deviceMd5）"
            $exitCode = 1
        }
        # ⚠️⚠️ **重装会把无障碍授权项清空** ⇒ ⇒ 所以装完要**再补一次**原值
        # ⇒ ⇒ （`Restore-Accessibility` 幂等 ⇒ ⇒ 重复调用无害）
        Restore-Accessibility
    }
}

Write-Host "== 日志：$logPath =="
$logText = ''
if (Test-Path -LiteralPath $logPath) {
    $logText = Get-Content -Raw -LiteralPath $logPath
    Select-String -LiteralPath $logPath -Pattern 'VERDICT|SCREEN TREE|SIGNATURE|PROBE|All tests passed|Failure Details|\[E\]' |
        Select-Object -Last 14 | ForEach-Object { Write-Host $_.Line.Trim() }
}

# ⚠️⚠️ **双保险**：驱动退出码之外，再替它看一眼 app 侧的日志 ——
# ⇒ 因为 `flutter drive` 的**官方驱动看不见普通 `test()` 的失败**
# ⇒ ⇒ 只看退出码 ⇒ ⇒ 会出现「用例红了、退出码 0」。
# ⇒ ⇒ 这里扫 app 侧 reporter 的失败标记 ⇒ ⇒ 命中就判失败。
if ($logText -match 'Some tests failed\.') {
    Write-Host '!! app 侧 reporter 报了失败 ⇒ ⇒ 判失败'
    $exitCode = 1
}
elseif ($logText -match '(?m)\[E\]\s*$') {
    Write-Host '!! app 侧有用例标了 [E] ⇒ ⇒ 判失败'
    $exitCode = 1
}

Write-Host "== 退出码：$exitCode =="
exit $exitCode
