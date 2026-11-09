<#
.SYNOPSIS
    MIUI「继续安装」弹窗的**代点守门员** —— 真机验证的前置件。

.DESCRIPTION
    MIUI（小米）上 `adb install` 会被系统拦下：弹出「继续安装」确认框
    （`com.miui.securitycenter`）⇒ ⇒ adb **不会**点它 ⇒ ⇒ 系统取消
    ⇒ ⇒ 安装报 `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`。

    ⚠️ 这一道闸**关不掉**：
    - `adb_install_need_confirm`（secure/global）、`install_verifier_enable`、
      `package_verifier_enable`、`verifier_verify_adb_installs` 全部设 0 仍被拦；
    - 换 `pm install -r -g` 路径是**同一道闸**；
    - 「开发者选项 → USB 安装」在 odin 上**本来就是开的**⇒ ⇒ 不是它。

    ⇒ ⇒ 唯一的路：**找到那个按钮，按下去**。

    ## ⚠️⚠️ 为什么是**两段判据**（2026-11-10 真机实测踩出来的）

    实测弹窗的样子（odin，MIUI 14 / Android 13，1080x2400）：

        USB安装提示 | 影 | 正在通过USB安装此应用，是否继续？ | 拒绝后下次安装不再提示
        继续安装   | 拒绝（6）

    ⚠️⚠️ **「拒绝（6）」里那个 6 是倒计时** ⇒ ⇒ 弹窗**只活约 6 秒**
    ⇒ ⇒ 过期后系统自己按「拒绝」⇒ ⇒ 安装失败。

    ⚠️⚠️ **旧版守门员结构上追不上**：它每轮做一次 `uiautomator dump`
    ⇒ ⇒ **实测每轮 2–4 秒**（1.3 MB 的树）⇒ ⇒ 一轮就吃掉半个窗口
    ⇒ ⇒ ⇒ 实测装 3 次**全部** `INSTALL_FAILED_USER_RESTRICTED`。

    ⇒ ⇒ **修法（两段）**（判据内核在 lib/miui-confirm-tap.ps1 ⇒ ⇒ **纯函数** ⇒ ⇒ 可离线自检）：
      ① **快触发**：`dumpsys window | grep mCurrentFocus` —— 实测 **73 ms**
         ⇒ ⇒ 判「当前焦点是不是那个确认框」⇒ ⇒ 命中后**立刻**去点
         ⇒ ⇒ **不要**在快触发这一段做 dump。
      ② **取坐标**：命中之后才做一次 `uiautomator dump` 解析「继续安装」的 bounds
         ⇒ ⇒ **缓存**⇒ ⇒ 同一个窗口里第二次弹窗（安装重试）**零 dump**。
    ⇒ ⇒ ⇒ **通用形态：一个判据若每轮要 2–4 秒 ⇒ ⇒ 它天然追不上 6 秒的窗口
      ⇒ ⇒ 判据必须分层：「便宜的判据负责**触发**，贵的判据只在**命中之后**跑一次」。

    ## ⚠️ 实测读数（odin，2026-11-10）

    · 旧版（纯 dump 轮询）⇒ ⇒ 连装 **3 次全部** `INSTALL_FAILED_USER_RESTRICTED`
    · 新版（快触发 ＋ 坐标缓存）⇒ ⇒ **第一次就装上**（`Success`，耗时 9 秒）
      ⇒ ⇒ 且弹窗**从「拒绝（6）」被点成「继续安装」** ⇒ ⇒ 弹窗没活到 6 秒就消失。

.PARAMETER Serial
    adb 设备号。

.PARAMETER Seconds
    守多久（秒）。

.PARAMETER IntervalMs
    快触发那一段的轮询间隔（毫秒）。

.PARAMETER SelfCheck
    只跑**离线自检**（不碰设备）⇒ ⇒ 没连设备也能验这些判据。

.EXAMPLE
    pwsh -File shadow-mobile/scripts/miui-install-confirm-tap.ps1 -Serial ee6b4832

.EXAMPLE
    pwsh -File shadow-mobile/scripts/miui-install-confirm-tap.ps1 -SelfCheck

#>
param(
    [string]$Serial,
    [int]$Seconds = 900,
    [int]$IntervalMs = 300,
    [switch]$SelfCheck
)

$ErrorActionPreference = 'Continue'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---- 判据内核（**纯函数** ⇒ ⇒ 可离线自检）----
$libPath = Join-Path (Join-Path $scriptDir 'lib') 'miui-confirm-tap.ps1'
if (-not (Test-Path -LiteralPath $libPath)) {
    Write-Error ('缺判据库：' + $libPath)
}
. $libPath

# ⚠️ **离线自检** —— **在碰设备之前**就做 ⇒ ⇒ 没连设备也能验判据。
if ($SelfCheck) {
    $self = Invoke-MiuiConfirmTapSelfCheck
    Write-Host '== MIUI 安装闸判据自检 =='
    foreach ($c in $self.Cases) {
        $mark = '过'
        if (-not $c.Ok) { $mark = '红' }
        Write-Host ('  [' + $mark + '] ' + $c.Name + '  —— ' + $c.Detail)
    }
    Write-Host ('共 ' + $self.Cases.Count + ' 条，失败 ' + $self.Failures.Count + ' 条')
    if ($self.Cases.Count -eq 0) { Write-Host '!! 一条用例都没执行 ⇒ ⇒ 空绿 ⇒ ⇒ 判失败'; exit 1 }
    if (-not $self.Ok) { Write-Host '== 有不过 =='; foreach ($f in $self.Failures) { Write-Host ('  - ' + $f) }; exit 1 }
    Write-Host '== MIUI 安装闸判据自检：全过 =='
    exit 0
}

if ([string]::IsNullOrWhiteSpace($Serial)) {
    Write-Error '需要 -Serial（或用 -SelfCheck 跑离线自检）'
}

$deadline = (Get-Date).AddSeconds($Seconds)
$taps = 0

# ⚠️ **坐标缓存** —— 命中过一次之后就不用再 dump 了。
# ⚠️ 为什么缓存是安全的：同一个弹窗在同一台设备上**位置不变**
# ⇒ ⇒ 而我们自己就是这么点 ⇒ ⇒ 点的还是同一个按钮。
$cachedX = -1
$cachedY = -1

# ⚠️ **快触发** —— 只要 73 ms（实测）⇒ ⇒ 能在 6 秒窗口里轮很多圈。
function Get-FocusLine {
    return ((& adb -s $Serial shell 'dumpsys window | grep mCurrentFocus' 2>$null) -join '')
}

# ⚠️ **慢路径** —— 从整棵树里找「继续安装」那个节点的 bounds。
function Resolve-ContinueButton {
    & adb -s $Serial shell uiautomator dump /sdcard/inst.xml 2>$null | Out-Null
    $xml = (& adb -s $Serial shell cat /sdcard/inst.xml 2>$null) -join ''
    return (Resolve-ContinueButtonBounds -Xml $xml)
}

function Invoke-ConfirmTap {
    param([int]$X, [int]$Y, [string]$How)
    & adb -s $Serial shell input tap $X $Y | Out-Null
    $script:taps++
    Write-Host ('TAP 继续安装 @ ' + $X + ',' + $Y + '  [' + $How + ']  t=' + (Get-Date -Format 'HH:mm:ss'))
}

$lastSlowCheck = [DateTime]::MinValue

while ((Get-Date) -lt $deadline) {
    $focus = Get-FocusLine
    # ⚠️ **兜底间隔 10 秒** ⇒ ⇒ 不跟快触发抢 adb ⇒ ⇒ 但也够密（弹窗活 6 秒 ⇒ 至少碰到一次）。
    $slowDue = ((Get-Date) - $lastSlowCheck).TotalSeconds -ge 10
    $plan = Get-ConfirmTapPlan -FocusLine $focus -HasCached ($cachedX -ge 0) -SlowDue $slowDue

    if ($plan -eq 'tap-cached') {
        Invoke-ConfirmTap -X $cachedX -Y $cachedY -How 'cached'
        Start-Sleep -Milliseconds 600
        continue
    }
    if ($plan -eq 'resolve') {
        # ⚠️ **第一次命中** ⇒ ⇒ 慢路径解析一次坐标（dump 2–4 秒 ⇒ 仍在 6 秒窗口内）
        $btn = Resolve-ContinueButton
        if ($btn) {
            $cachedX = $btn.x
            $cachedY = $btn.y
            Invoke-ConfirmTap -X $cachedX -Y $cachedY -How 'resolved'
            Start-Sleep -Milliseconds 600
            continue
        }
    }
    if ($plan -eq 'slow-scan') {
        $lastSlowCheck = Get-Date
        $btn = Resolve-ContinueButton
        if ($btn) {
            $cachedX = $btn.x
            $cachedY = $btn.y
            Invoke-ConfirmTap -X $cachedX -Y $cachedY -How 'slow-path'
            Start-Sleep -Milliseconds 600
            continue
        }
    }

    Start-Sleep -Milliseconds $IntervalMs
}

Write-Host ('taps=' + $taps)
