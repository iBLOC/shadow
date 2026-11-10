# 真机脚本的「读数解析」那一半 —— **纯函数**（**不碰设备**）。
#
# ## 为什么把这几段抽出来
#
# 实测（2026-11-04 那轮 F946U）暴露了两个**只在真机上才看得见**的缺陷：
#   ① 「搬屏后立刻去查」⇒ ⇒ 搬屏是**异步**的 ⇒ ⇒ 窗口还报旧屏
#      ⇒ ⇒ 脚本连喊三次「还是 display 2」⇒ ⇒ 而 task **早就搬到了** display 0
#      ⇒ ⇒ ⇒ 白折腾 ⇒ ⇒ ⇒ **失败长得像失败，但真相是「已经好了」**。
#   ② 「取第一个 displayId=0 的 rootTask」⇒ ⇒ 取到的是 **id=1（启动器那个）**
#      ⇒ ⇒ 这次恰好能搬 ⇒ ⇒ **纯属运气** ⇒ ⇒ 因为「哪个 rootTask 能承载 app」
#      ⇒ ⇒ 是系统内部决定的 ⇒ ⇒ 挑错就搬不动。
#
# ⇒ ⇒ 所以：**解析**必须是纯函数（能离线自检），**搬屏**必须**轮询到真的换屏为止**
# ⇒ ⇒ 并且**挨个试**目标屏上的 rootTask ⇒ ⇒ 谁生效用谁。
#
# ## ⚠️⚠️ 这个文件**只放函数** —— 不放「直接跑」的入口
#
# 实测（2026-11-08）踩过：用「文件名 == 脚本名」判断「是不是直接跑」
# ⇒ ⇒ 于是把文件**改名**做反向验证时 ⇒ ⇒ 入口不触发 ⇒ ⇒ **自检根本没跑**
# ⇒ ⇒ 却仍然 **EXIT=0** ⇒ ⇒ ⇒ 「全过」是**空的**⇒ ⇒ ⇒ 典型的**空绿**。
# ⇒ ⇒ ⇒ 所以入口放在**独立的 runner**（mobile-use-parsers-selfcheck.ps1）
# ⇒ ⇒ ⇒ 本文件永远只被 dot-source ⇒ ⇒ ⇒ 改名/复制都不影响它的行为。

function Get-AppWindowDisplayIdFromDump {
    <#
      自家窗口（MainActivity）**自己那块**的 displayId。
      ⚠️ **按块解析** —— 不按「第一处提及」往后数几行。
      ⇒ ⇒ 实测：dumpsys 里自家窗口会被**提到多次**（imeLayeringTarget 等）
      ⇒ ⇒ ⇒ 顺着提及往后扫，会把**别的窗口**的 mDisplayId 当成我们的。
      ⇒ ⇒ ⇒ 症状：明明在 display 0，却报「落在 display 2」⇒ ⇒ ⇒ 白搬一次。
      ⇒ ⇒ ⇒ **判不出来就返回空串**（明说「不知道」）
      ⇒ ⇒ ⇒ 而不是拿别人的屏来充数 ⇒ ⇒ 「不知道」≠「在别的屏」。
    #>
    param([string]$Dump)
    if ([string]::IsNullOrWhiteSpace($Dump)) { return '' }
    $inBlock = $false
    foreach ($line in ($Dump -split '\r?\n')) {
        if ($line -match '^\s*Window #\d+ Window\{[^}]*com\.ibloc\.shadow/com\.ibloc\.shadow\.MainActivity\}') {
            $inBlock = $true
            continue
        }
        if ($line -match '^\s*Window #\d+ Window\{') { $inBlock = $false }
        if ($inBlock -and ($line -match 'mDisplayId=(\d+)')) { return $Matches[1] }
    }
    return ''
}

function Get-StackPlacementFromDump {
    <#
      从 `am stack list` 的输出里解析两样东西：
      ① app 自己的 task id；② **目标屏（display 0）上**的 rootTask id 们。
      ⚠️ ② 之所以要**全部**而不是「第一个」⇒ ⇒ 因为「哪个 rootTask 能承载 app」
      ⇒ ⇒ 是系统内部决定的 ⇒ ⇒ ⇒ 挨个试 ⇒ ⇒ 谁生效用谁。
    #>
    param([string]$Stack)
    $taskId = ''
    $roots = @()
    foreach ($line in ($Stack -split '\r?\n')) {
        if ((-not $taskId) -and ($line -match 'taskId=(\d+): com\.ibloc\.shadow/')) { $taskId = $Matches[1] }
        if ($line -match 'RootTask id=(\d+).*displayId=0 ') { $roots += $Matches[1] }
    }
    return [pscustomobject]@{ TaskId = $taskId; RootTaskIds = $roots }
}

function Get-A11yBindingSignals {
    <#
      无障碍服务「真的绑上了」吗？—— **双信号**（跨机型）。
      ① Enabled services 里有我们的包 ⇒ ⇒ **授权**有了
      ② 服务自己在**当前进程**里打过连上那行 ⇒ ⇒ **绑定**有了
      ⚠️ 为什么②要按 pid 过滤 ⇒ ⇒ 那行可能属于**上一个进程**
      ⇒ ⇒ ⇒ 而「上一次的证据」当「这一次的证据」⇒ ⇒ 就是假阳性。
      ⚠️ 为什么不能只看 ① 的包名 —— 实测（2026-11-04）两台机器格式不同：
      ⇒ ⇒ 三星那台的 `Bound services:{… com.ibloc.shadow/…}` 含**包名**
      ⇒ ⇒ MIUI 那台只有 `Service[label=影…]` ⇒ ⇒ **永远匹配不到** ⇒ ⇒ 假阴性。
    #>
    param([string]$Dump, [string]$ServiceLog)
    $enabled = $false
    $boundByPackage = $false
    $boundByLog = $false
    if ($Dump) {
        $enabled = $Dump -match 'Enabled services:\{?\{?[^}]*com\.ibloc\.shadow'
        $boundByPackage = $Dump -match 'Bound services:\{[^}]*com\.ibloc\.shadow'
    }
    if ($ServiceLog) { $boundByLog = $ServiceLog -match 'PrefrontalAccessibilityService connected' }
    return [pscustomobject]@{
        Enabled        = $enabled
        BoundByPackage = $boundByPackage
        BoundByLog     = $boundByLog
        Bound          = ($enabled -and ($boundByPackage -or $boundByLog))
    }
}

function Get-InstallFailureKind {
    <#
      把「安装失败」**归因** —— 而不是让它长得像「无障碍没绑上」。
      ⚠️ 为什么要归因 —— 实测（2026-11-09，MI_MAX_2）踩过：
      ⇒ ⇒ `adb install` 的 stderr 被 `| Out-Null` 吞掉 ⇒ ⇒ 脚本只看见
      ⇒ ⇒ 「退出码非 0」⇒ ⇒ 然后一路喊「无障碍服务没绑上」
      ⇒ ⇒ ⇒ 而真正的闸是 **MIUI 的「USB 安装」策略**
      ⇒ ⇒ ⇒ ⇒ 症状离根因隔了三层 ⇒ ⇒ ⇒ 每次都得人肉去猜是哪一层的闸。
      ⇒ ⇒ 所以：**把错误码解析出来** ⇒ ⇒ 归到「设备策略闸」那一类
      ⇒ ⇒ ⇒ 而不是笼统的「装不上」。
      ⚠️⚠️ **不许靠关键字猜** —— 只认 `INSTALL_FAILED_*` / `INSTALL_PARSE_FAILED_*`
      ⇒ ⇒ 以及 MIUI 的**取消族** `INSTALL_CANCELED_BY_USER` / `INSTALL_CANCELED_BY_SYSTEM`
      ⇒ ⇒ ⇒ 这一族**已知**的错误码 ⇒ ⇒ 认不出就归 unknown 并原样透传
      ⇒ ⇒ ⇒ 宁可说「不知道」，也不要把「不知道」说成「设备策略闸」。
    #>
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) {
        return [pscustomobject]@{ Kind = 'unknown'; Code = ''; Hint = ''; Detail = '' }
    }
    $map = @(
        @{ Code = 'INSTALL_FAILED_USER_RESTRICTED'; Kind = 'device-policy'
           Hint = '设备策略闸（adb 直接装的那条路）：需 ⇒ 在设备上手动打开「开发者选项 → USB 安装」；⚠️ 实测 MIUI 11 上这个开关**硬性要求插 SIM 卡**（无卡时点它只弹 toast「请先插入SIM卡」）⇒ ⇒ 所以「让用户翻一下开关」不一定就够。' },
        @{ Code = 'INSTALL_CANCELED_BY_USER'; Kind = 'device-policy'
           Hint = '设备策略闸（走**设备安装器 UI**那条路时报的**同一个**闸、但码不同）：MIUI 把 adb 安装导向 com.miui.permcenter.install.AdbInstallActivity ⇒ ⇒ 它当场取消 ⇒ ⇒ 根因与 USER_RESTRICTED 相同。' },
        @{ Code = 'INSTALL_CANCELED_BY_SYSTEM'; Kind = 'device-policy'
           Hint = '安装被**系统侧**取消（不是用户点的）⇒ ⇒ 多半是系统策略/资源闸。' },
        @{ Code = 'INSTALL_FAILED_NO_MATCHING_ABIS'; Kind = 'abi'
           Hint = '设备 ABI 与 APK 内 lib/ 目录没有交集 ⇒ ⇒ 查 android/app/build.gradle.kts 的 ndk abiFilters；⚠️ 若 APK 的 lib/ 里**根本没有**那个 ABI（实测 v7a 设备遇到只有 arm64/x86_64 的 APK）⇒ ⇒ 放宽 abiFilters 也救不了 ⇒ ⇒ 那台设备是**物理上**出局。' },
        @{ Code = 'INSTALL_FAILED_INSUFFICIENT_STORAGE'; Kind = 'storage'
           Hint = '设备 /data 空间不足 ⇒ ⇒ 至少留出 APK 体积的 1.5 倍再装。' },
        @{ Code = 'INSTALL_FAILED_UPDATE_INCOMPATIBLE'; Kind = 'version'
           Hint = '与已装版本签名/版本不兼容 ⇒ ⇒ 先卸载旧版再装。' },
        @{ Code = 'INSTALL_FAILED_VERSION_DOWNGRADE'; Kind = 'version'
           Hint = '要装的版本比已装的低 ⇒ ⇒ 先卸载旧版再装。' },
        @{ Code = 'INSTALL_FAILED_TEST_ONLY'; Kind = 'test-only'
           Hint = 'APK 是 testOnly ⇒ ⇒ 走 `pm install` 时必须加 -t。' },
        @{ Code = 'INSTALL_FAILED_INVALID_APK'; Kind = 'apk'
           Hint = 'APK 本身无效（可能传输不完整）⇒ ⇒ 核对文件大小/MD5。' },
        @{ Code = 'INSTALL_PARSE_FAILED_NO_CERTIFICATES'; Kind = 'apk'
           Hint = 'APK 没有证书 ⇒ ⇒ 重新构建并签名。' },
        @{ Code = 'INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES'; Kind = 'apk'
           Hint = 'APK 签名不一致 ⇒ ⇒ 重新构建并签名。' }
    )
    foreach ($m in $map) {
        # ⚠️ **按完整码匹配**（带词边界）⇒ ⇒ 「像但不是」的那个码不许命中
        # ⇒ ⇒ 理由：-match 默认**忽略大小写**且是**子串**匹配 ⇒ ⇒ 只加前后缀的近似码会被误认。
        if ($Text -match ('(?<![A-Za-z0-9_])' + [regex]::Escape($m.Code) + '(?![A-Za-z0-9_])')) {
            return [pscustomobject]@{ Kind = $m.Kind; Code = $m.Code; Hint = $m.Hint; Detail = $m.Code }
        }
    }
    # ⚠️ `INSTALL_PARSE_FAILED_*` 是一族 ⇒ ⇒ 但**具体哪一种**要原样透传
    if ($Text -match 'INSTALL_PARSE_FAILED_[A-Z_]+') {
        $code = $Matches[0]
        return [pscustomobject]@{ Kind = 'apk'; Code = $code; Hint = 'APK 解析失败 ⇒ ⇒ 核对文件完整性与签名。'; Detail = $code }
    }
    $firstInstallLine = ($Text -split '\r?\n' | Where-Object { $_ -match 'INSTALL' } | Select-Object -First 1)
    return [pscustomobject]@{ Kind = 'unknown'; Code = ''; Hint = ''; Detail = $firstInstallLine }
}

function Test-ApkAbiSupported {
    <#
      这台设备**能不能**跑这个 APK —— 只做能判的那部分。
      ⚠️ 为什么要有它 —— 实测（2026-11-09）踩过：
      ⇒ ⇒ `android/app/build.gradle.kts` 里 `ndk abiFilters = "arm64-v8a,x86_64"`
      ⇒ ⇒ ⇒ 而 APK 里的 native 库也只有 arm64-v8a / x86_64
      ⇒ ⇒ ⇒ ⇒ 设备是 **armeabi-v7a**（小米 LX04）⇒ ⇒ **装**物理上不可能
      ⇒ ⇒ ⇒ ⇒ 不查就装 ⇒ ⇒ 白花 200 秒传 200MB ⇒ ⇒ ⇒ 失败长得像「网络慢」。
      ⚠️ **判不出来就说判不出来** —— 任一边空 ⇒ ⇒ Known=$false
      ⇒ ⇒ ⇒ 绝不把「不知道」说成「不支持」。
    #>
    param([string]$DeviceAbilist, [string[]]$ApkLibDirs)
    $dev = @()
    if ($DeviceAbilist) {
        $dev = @($DeviceAbilist -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
    }
    $apk = @(@($ApkLibDirs) | Where-Object { $_ -and $_.Trim() -ne '' } | ForEach-Object { $_.Trim() })
    if ($dev.Count -eq 0 -or $apk.Count -eq 0) {
        return [pscustomobject]@{ Known = $false; Supported = $false; Common = @(); Device = $dev; Apk = $apk }
    }
    $common = @($dev | Where-Object { $apk -contains $_ })
    return [pscustomobject]@{ Known = $true; Supported = ($common.Count -gt 0); Common = $common; Device = $dev; Apk = $apk }
}

function Test-InstallHasRoom {
    <#
      装得下吗 —— 安装要**解包**，所以不能拿 APK 体积当门槛。
      ⚠️ 1.5 这个系数是**下界**：装完 /data 占用可能远大于 APK 体积
      ⇒ ⇒ ⇒ 拿 1.0 当门槛 ⇒ ⇒ 会在装到一半时失败 ⇒ ⇒ 那才是最难查的一种。
      ⚠️ 判不出来就说判不出来（任一边 <= 0 ⇒ Known=$false）。
    #>
    param([long]$ApkBytes, [long]$FreeBytes)
    if ($ApkBytes -le 0 -or $FreeBytes -le 0) {
        return [pscustomobject]@{ Known = $false; Ok = $false; Required = 0; Free = $FreeBytes; Margin = 0 }
    }
    $required = [long]([Math]::Ceiling($ApkBytes * 1.5))
    return [pscustomobject]@{ Known = $true; Ok = ($FreeBytes -ge $required); Required = $required; Free = $FreeBytes; Margin = ($FreeBytes - $required) }
}
# ---- 第四档前置体检：锁屏这一格（2026-11-11 实测补）--------------------------
function Test-DeviceCanShowInstallDialog {
    <#
      这台设备**此刻**能不能让 MIUI 的「继续安装」弹窗**拿到焦点** ⇒ ⇒ 能不能装。

      ⚠️⚠️ 为什么要有第四档 —— 实测（2026-11-11，MI_MAX_2 / Android 7.1 / MIUI V11）：
      ⇒ ⇒ ① 设备**锁着**（mWakefulness=Asleep ＋ mShowingLockscreen=true）
      ⇒ ⇒ ② 装机守门员**全程零命中**（它盯的焦点窗口从来没落到确认框上）
      ⇒ ⇒ ③ adb install 与 pm install -r -g **两条路都**报同一个错：
      ⇒ ⇒    INSTALL_FAILED_USER_RESTRICTED: Install canceled by user
      ⇒ ⇒ ④ 而 adb_install_need_confirm（secure 与 global）**本来就是 0**
      ⇒ ⇒    ⇒ ⇒ **那不是「没关确认开关」，是「弹窗根本弹不到前台」**
      ⇒ ⇒ ⑤ wm dismiss-keyguard ／ input keyevent 82 ／ input swipe **全部无效**
      ⇒ ⇒    ⇒ ⇒ 那是 **secure keyguard** ⇒ ⇒ 需要**设备主人解锁**（物理动作）

      ⇒ ⇒ ⇒ ⇒ **通用形态：错误码只说「被用户取消」，但真因是「弹窗没机会出现」**
      ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **⇒ 这一档必须在「传 200MB 之前」问掉**，
      ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **⇒ 否则失败长得像「网络慢」**（而它其实是锁屏）。

      ⚠️ **三档读数**（不许只有「行／不行」两个值）：
        · Ready    —— 亮着 ＋ 没锁屏 ⇒ ⇒ 弹窗能拿到焦点 ⇒ ⇒ 守门员能点到
        · Locked   —— 锁着（secure keyguard）⇒ ⇒ **需要设备主人解锁**（物理动作）
        · Asleep   —— 没锁但设备在休眠 ⇒ ⇒ 先点亮（input keyevent 224）
        · Unknown  —— 读不到状态 ⇒ ⇒ **判不出来** ⇒ ⇒ 不许当成 Ready
    #>
    param([string]$Wakefulness, [string]$LockScreen, [string]$KeyguardDismissable)

    $wake = if ($Wakefulness) { $Wakefulness.Trim() } else { '' }
    $lock = if ($LockScreen) { $LockScreen.Trim() } else { '' }
    $dismissable = if ($KeyguardDismissable) { $KeyguardDismissable.Trim() } else { '' }

    if (-not $wake -or -not $lock) {
        return [pscustomobject]@{
            Known = $false; Ready = $false; State = 'Unknown'
            Wakefulness = $wake; LockScreen = $lock
            Reason = '读不到唤醒/锁屏状态 ⇒ ⇒ 判不出来（不许当成 Ready）'
        }
    }

    $isLocked = ($lock -match 'true')
    $isAsleep = ($wake -match 'Asleep|Dozing')
    $canDismiss = ($dismissable -match 'true')

    if ($isLocked -and -not $canDismiss) {
        return [pscustomobject]@{
            Known = $true; Ready = $false; State = 'Locked'
            Wakefulness = $wake; LockScreen = $lock
            Reason = '设备锁着（secure keyguard）⇒ ⇒ 确认框弹不到前台 ⇒ ⇒ adb 关不掉 ⇒ ⇒ 需要设备主人解锁（物理动作）'
        }
    }
    if ($isAsleep) {
        return [pscustomobject]@{
            Known = $true; Ready = $false; State = 'Asleep'
            Wakefulness = $wake; LockScreen = $lock
            Reason = '设备在休眠 ⇒ ⇒ 弹窗弹不到前台 ⇒ ⇒ 先点亮（input keyevent 224）＋ 拉高 screen_off_timeout'
        }
    }
    return [pscustomobject]@{
        Known = $true; Ready = $true; State = 'Ready'
        Wakefulness = $wake; LockScreen = $lock
        Reason = '亮着且没锁屏 ⇒ ⇒ 弹窗能拿到焦点 ⇒ ⇒ 守门员点得到'
    }
}

function Invoke-MobileUseParserSelfCheck {
    <#
      用**真机抓来的样本**把上面三个判据钉一遍。
      ⇒ ⇒ 返回：`Ok`（布尔）＋ `Cases`（逐条：名字/过没过/说明）＋ `Failures`。
      ⇒ ⇒ **逐条报出来** ⇒ ⇒ 「全过」才有内容 ⇒ ⇒ 「0 条用例」是**空绿**。
    #>
    $cases = @()

    # ---- 样本 A：自家窗口在 display 0（**F946U 真机原样**，2026-11-04）----
    $dumpOnDefault = @'
  Window #12 Window{b529a18 u0 com.ibloc.shadow/com.ibloc.shadow.MainActivity}:
    mDisplayId=0 rootTaskId=2274 mSession=Session{dd04644 11824:u0a10046} mClient=android.os.BinderProxy@b5011ee
'@

    # ---- 样本 B：自家窗口在 display 2（**按真机格式重建**：id 取自 2026-11-04 那次实测）----
    $dumpOnVirtual = @'
  Window #9 Window{0badf00 u0 com.ibloc.shadow/com.ibloc.shadow.MainActivity}:
    mDisplayId=2 rootTaskId=2271 mSession=Session{1a2b3c4 11824:u0a10046} mClient=android.os.BinderProxy@c001122
'@

    # ---- 样本 C：自家窗口**只**出现在提及行里、没有自己的块 ⇒ ⇒ **判不出来** ----
    # ⇒ ⇒ 旧算法会把**下一块窗**的 displayId 当成我们的 ⇒ ⇒ 新算法必须返回空串。
    $dumpUnknown = @'
  imeLayeringTarget in display# 0 Window{b529a18 u0 com.ibloc.shadow/com.ibloc.shadow.MainActivity}
  Window #14 Window{deadbee u0 com.sec.android.app.desktoplauncher/com.android.launcher3.Launcher}:
    mDisplayId=2 rootTaskId=2271 mSession=Session{5e6f7a8 11824:u0a10046} mClient=android.os.BinderProxy@d0d0d0d
'@

    # ---- 样本 D：`am stack list`（**F946U 真机原样**，2026-11-04）----
    $stackSample = @'
RootTask id=2274 bounds=[0,0][1920,1080] displayId=0 userId=0
  taskId=2274: com.ibloc.shadow/com.ibloc.shadow.MainActivity bounds=[0,0][1920,1080] userId=0 visible=true
RootTask id=2275 bounds=[0,0][1920,1080] displayId=0 userId=0
  taskId=2275: com.samsung.android.calendar/com.samsung.android.app.calendar.activity.MainActivity bounds=[0,0][1920,1080] userId=0 visible=false
RootTask id=1 bounds=[0,0][1920,1080] displayId=0 userId=0
  taskId=2270: com.sec.android.app.launcher/com.sec.android.app.launcher.activities.LauncherActivity bounds=[0,0][1920,1080] userId=0 visible=false
RootTask id=2271 bounds=[0,0][1920,1080] displayId=2 userId=0
  taskId=2272: com.sec.android.app.desktoplauncher/com.android.launcher3.Launcher bounds=[0,0][1920,1080] userId=0 visible=true
'@

    # ---- 样本 E/F/G：无障碍 dumpsys（**三星格式** / **MIUI 格式** / **未授权**，均真机原样）----
    $a11ySamsung = @'
     Bound services:{Service[label=影, feedbackType[FEEDBACK_GENERIC], capabilities=33], com.ibloc.shadow/com.ibloc.shadow.PrefrontalAccessibilityService}
     Enabled services:{{com.ibloc.shadow/com.ibloc.shadow.PrefrontalAccessibilityService}}
'@
    $a11yMiui = @'
     Bound services:{Service[label=影, feedbackType[FEEDBACK_GENERIC], capabilities=33, eventTypes=[TYPE_WINDOW_STATE_CHANGED, TYPE_WINDOW_CONTENT_CHANGED], notificationTimeout=100, requestA11yBtn=false]}
     Enabled services:{{com.ibloc.shadow/com.ibloc.shadow.PrefrontalAccessibilityService}}
'@
    $a11yNotEnabled = @'
     Bound services:{}
     Enabled services:{}
'@
    $serviceLog = @'
I/flutter: PrefrontalAccessibilityService connected
'@

    $id = Get-AppWindowDisplayIdFromDump -Dump $dumpOnDefault
    $cases += @{ Name = '自家窗口在默认屏 ⇒ 解析出 0'; Ok = ($id -eq '0'); Detail = ('实际 ' + $id) }

    $id = Get-AppWindowDisplayIdFromDump -Dump $dumpOnVirtual
    $cases += @{ Name = '自家窗口在虚拟屏 ⇒ 解析出 2'; Ok = ($id -eq '2'); Detail = ('实际 ' + $id) }

    $id = Get-AppWindowDisplayIdFromDump -Dump $dumpUnknown
    $cases += @{ Name = '没有自家窗口的块 ⇒ 返回空串（判不出来，而不是猜）'; Ok = ($id -eq ''); Detail = ('实际 ' + $id) }

    $place = Get-StackPlacementFromDump -Stack $stackSample
    $cases += @{ Name = 'stack ⇒ app 的 task id = 2274'; Ok = ($place.TaskId -eq '2274'); Detail = ('实际 ' + $place.TaskId) }
    $cases += @{ Name = 'stack ⇒ 目标屏 rootTask 列表**含**启动器那个（id=1）'; Ok = ($place.RootTaskIds -contains '1'); Detail = ('实际 ' + ($place.RootTaskIds -join ',')) }
    $cases += @{ Name = 'stack ⇒ display 2 上的 rootTask（2271）**不**混进目标屏列表'; Ok = (-not ($place.RootTaskIds -contains '2271')); Detail = ('实际 ' + ($place.RootTaskIds -join ',')) }

    $sig = Get-A11yBindingSignals -Dump $a11ySamsung -ServiceLog ''
    $cases += @{ Name = '三星格式（含包名）⇒ 判为已绑定'; Ok = $sig.Bound; Detail = ('Enabled=' + $sig.Enabled + ' ByPkg=' + $sig.BoundByPackage) }

    $sig = Get-A11yBindingSignals -Dump $a11yMiui -ServiceLog $serviceLog
    $cases += @{ Name = 'MIUI 格式（只有 label）⇒ 靠当前进程日志判为已绑定'; Ok = $sig.Bound; Detail = ('Enabled=' + $sig.Enabled + ' ByLog=' + $sig.BoundByLog) }
    $cases += @{ Name = 'MIUI 格式 ⇒ **不**该判成「按包名已绑定」'; Ok = (-not $sig.BoundByPackage); Detail = ('ByPkg=' + $sig.BoundByPackage) }

    $sig = Get-A11yBindingSignals -Dump $a11yNotEnabled -ServiceLog ''
    $cases += @{ Name = '没授权 ⇒ 不判为已绑定'; Ok = (-not $sig.Bound); Detail = ('Enabled=' + $sig.Enabled) }

    # ---- 样本 H：安装失败的**真机原样**输出（2026-11-09，MI_MAX_2 / MIUI）----
    $installUserRestricted = @'
Performing Streamed Install
adb: failed to install /data/local/tmp/app-debug.apk: Failure [INSTALL_FAILED_USER_RESTRICTED: Install canceled by user]
'@
    $installNoAbis = @'
adb: failed to install /tmp/x.apk: Failure [INSTALL_FAILED_NO_MATCHING_ABIS: Failed to extract native libraries, res=-2]
'@
    $installStorage = 'adb: failed to install: Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE: Failed to create /data/app]'
    $installVersion = 'adb: failed to install: Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package signatures do not match]'
    $installTestOnly = 'Failure [INSTALL_FAILED_TEST_ONLY: installPackageLI /data/app/x.testOnly]'
    $installUnknown = 'adb: error: failed to stat /tmp/missing.apk: No such file or directory'

    $f = Get-InstallFailureKind -Text $installUserRestricted
    $cases += @{ Name = '安装被设备策略拦（USER_RESTRICTED）⇒ 归「设备闸」'; Ok = ($f.Kind -eq 'device-policy'); Detail = ('Kind=' + $f.Kind) }

    # ⚠️ 样本 I：MIUI **同一个闸**的另一个码（走设备安装器 UI 那条路时，2026-11-09 真机实测）
    $installCanceledByUser = @'
11-09 16:57:02.281  1567  1622 E Pm      : install msg : Failure [INSTALL_CANCELED_BY_USER]
11-09 16:57:02.281  1567  1622 E PackageInstaller: Commit of session 1908434464 failed: Install canceled by user.
'@
    $f = Get-InstallFailureKind -Text $installCanceledByUser
    $cases += @{ Name = '安装被设备**取消**（CANCELED_BY_USER）⇒ 归「设备闸」（与 USER_RESTRICTED 同根因）'; Ok = ($f.Kind -eq 'device-policy'); Detail = ('Kind=' + $f.Kind + ' Code=' + $f.Code) }
    $f = Get-InstallFailureKind -Text 'Failure [INSTALL_CANCELED_BY_SYSTEM]'
    $cases += @{ Name = '安装被系统取消（CANCELED_BY_SYSTEM）⇒ 归「设备闸」'; Ok = ($f.Kind -eq 'device-policy'); Detail = ('Kind=' + $f.Kind) }
    # ⚠️⚠️ **孪生负控**：只多一个后缀的**不像**的错误码 ⇒ ⇒ 必须归 unknown（不许靠子串认）
    $f = Get-InstallFailureKind -Text 'Failure [INSTALL_CANCELED_BY_USER_X]'
    $cases += @{ Name = '相似但未知的码（CANCELED_BY_USER_X）⇒ 仍归 unknown（不许靠子串认）'; Ok = ($f.Kind -eq 'unknown'); Detail = ('Kind=' + $f.Kind) }
    $f = Get-InstallFailureKind -Text $installNoAbis
    $cases += @{ Name = 'ABI 不匹配 ⇒ 归「ABI」'; Ok = ($f.Kind -eq 'abi'); Detail = ('Kind=' + $f.Kind) }
    $f = Get-InstallFailureKind -Text $installStorage
    $cases += @{ Name = '空间不足 ⇒ 归「空间」'; Ok = ($f.Kind -eq 'storage'); Detail = ('Kind=' + $f.Kind) }
    $f = Get-InstallFailureKind -Text $installVersion
    $cases += @{ Name = '签名/版本不兼容 ⇒ 归「版本」'; Ok = ($f.Kind -eq 'version'); Detail = ('Kind=' + $f.Kind) }
    $f = Get-InstallFailureKind -Text $installTestOnly
    $cases += @{ Name = 'testOnly ⇒ 归「test-only」'; Ok = ($f.Kind -eq 'test-only'); Detail = ('Kind=' + $f.Kind) }
    # ⚠️⚠️ **负控**：不含任何已知错误码 ⇒ ⇒ 必须归 unknown（不许猜）
    $f = Get-InstallFailureKind -Text $installUnknown
    $cases += @{ Name = '不认识的失败 ⇒ 归 unknown（不许猜）'; Ok = ($f.Kind -eq 'unknown'); Detail = ('Kind=' + $f.Kind) }
    # ⚠️⚠️ **负控**：文本里有「安装」「USB 安装」这类关键字但没有错误码 ⇒ ⇒ 仍归 unknown
    $f = Get-InstallFailureKind -Text '无法安装：USB 安装被拒绝，但这里没有错误码'
    $cases += @{ Name = '只有中文关键字、没有错误码 ⇒ 仍归 unknown（不许靠关键字猜）'; Ok = ($f.Kind -eq 'unknown'); Detail = ('Kind=' + $f.Kind) }
    $f = Get-InstallFailureKind -Text ''
    $cases += @{ Name = '空文本 ⇒ 归 unknown'; Ok = ($f.Kind -eq 'unknown'); Detail = ('Kind=' + $f.Kind) }

    $abi = Test-ApkAbiSupported -DeviceAbilist 'arm64-v8a,armeabi-v7a,armeabi' -ApkLibDirs @('arm64-v8a', 'x86_64')
    $cases += @{ Name = 'ABI：设备 arm64 ⇒ 与 APK 有交集 ⇒ 支持'; Ok = ($abi.Known -and $abi.Supported); Detail = ('Common=' + ($abi.Common -join ',')) }
    $abi = Test-ApkAbiSupported -DeviceAbilist 'armeabi-v7a,armeabi' -ApkLibDirs @('arm64-v8a', 'x86_64')
    $cases += @{ Name = 'ABI：设备只有 v7a（LX04 那台）⇒ 无交集 ⇒ 不支持'; Ok = ($abi.Known -and -not $abi.Supported); Detail = ('Common=' + ($abi.Common -join ',')) }
    $abi = Test-ApkAbiSupported -DeviceAbilist '' -ApkLibDirs @('arm64-v8a')
    $cases += @{ Name = 'ABI：读不到设备 abilist ⇒ 判不出来（不许当成不支持）'; Ok = (-not $abi.Known); Detail = ('Known=' + $abi.Known) }
    $abi = Test-ApkAbiSupported -DeviceAbilist 'arm64-v8a' -ApkLibDirs @()
    $cases += @{ Name = 'ABI：读不到 APK 的 lib 目录 ⇒ 判不出来'; Ok = (-not $abi.Known); Detail = ('Known=' + $abi.Known) }

    $room = Test-InstallHasRoom -ApkBytes 201846429 -FreeBytes 39124100
    $cases += @{ Name = '空间：可用 37MB < APK 192MB ⇒ 装不下'; Ok = ($room.Known -and -not $room.Ok); Detail = ('需要=' + $room.Required + ' 可用=' + $room.Free) }
    $room = Test-InstallHasRoom -ApkBytes 1000 -FreeBytes 5000
    $cases += @{ Name = '空间：够 ⇒ 判为装得下'; Ok = ($room.Known -and $room.Ok); Detail = ('需要=' + $room.Required + ' 可用=' + $room.Free) }
    $room = Test-InstallHasRoom -ApkBytes 0 -FreeBytes 5000
    $cases += @{ Name = '空间：读不到 APK 大小 ⇒ 判不出来'; Ok = (-not $room.Known); Detail = ('Known=' + $room.Known) }
    # ---- sample J/K: lock-screen gate (2026-11-11 MI_MAX_2 real device) ----
    # TWIN PAIR: same reading, only the lockscreen item differs => one says Locked, one says Ready
    # => proves this gate really reads the lockscreen, not a constant.
    $d = Test-DeviceCanShowInstallDialog -Wakefulness 'Awake' -LockScreen 'true mShowingDream=false' -KeyguardDismissable 'false'
    $cases += @{ Name = 'lockscreen: awake but LOCKED (keyguard cannot be dismissed) => Locked (owner must unlock)'; Ok = ($d.Known -and -not $d.Ready -and $d.State -eq 'Locked'); Detail = ('State=' + $d.State) }
    $d = Test-DeviceCanShowInstallDialog -Wakefulness 'Awake' -LockScreen 'false' -KeyguardDismissable 'true'
    $cases += @{ Name = 'lockscreen twin: same device NOT locked => Ready (dialog can take focus)'; Ok = ($d.Known -and $d.Ready -and $d.State -eq 'Ready'); Detail = ('State=' + $d.State) }
    $d = Test-DeviceCanShowInstallDialog -Wakefulness 'Asleep' -LockScreen 'false' -KeyguardDismissable 'true'
    $cases += @{ Name = 'asleep: not locked but device asleep => Asleep (wake it first)'; Ok = ($d.Known -and -not $d.Ready -and $d.State -eq 'Asleep'); Detail = ('State=' + $d.State) }
    # NEGATIVE CONTROL: cannot read state => Unknown (must NOT be treated as Ready)
    $d = Test-DeviceCanShowInstallDialog -Wakefulness '' -LockScreen '' -KeyguardDismissable ''
    $cases += @{ Name = 'cannot read wake/lockscreen state => Unknown (must NOT be Ready)'; Ok = (-not $d.Known -and -not $d.Ready -and $d.State -eq 'Unknown'); Detail = ('State=' + $d.State + ' Known=' + $d.Known) }
    $failures = @()
    foreach ($c in $cases) { if (-not $c.Ok) { $failures += ($c.Name + ' ⇒ ' + $c.Detail) } }
    return [pscustomobject]@{ Ok = ($failures.Count -eq 0); Cases = $cases; Failures = $failures }
}
