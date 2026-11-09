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
    - 「开发者选项 → USB 安装」在 odin 上**本来就是开的** ⇒ ⇒ 不是它。

    ⇒ ⇒ 唯一的路：**找到那个按钮，按下去**。

.PARAMETER Serial
    adb 设备号。

.PARAMETER Seconds
    守多久（秒）。

.PARAMETER IntervalMs
    轮询间隔（毫秒）。

.EXAMPLE
    pwsh -File shadow-mobile/scripts/miui-install-confirm-tap.ps1 -Serial ee6b4832

#>
param([string]$Serial, [int]$Seconds = 900, [int]$IntervalMs = 2500)

$ErrorActionPreference = 'Continue'
$deadline = (Get-Date).AddSeconds($Seconds)
$taps = 0

while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds $IntervalMs
  # ⚠️ MIUI 上 `uiautomator dump` 会向 stderr 刷一串 ThemeCompatibilityLoader 异常栈
  # ⇒ ⇒ 不吞掉的话，真输出会被它淹没。
  & adb -s $Serial shell uiautomator dump /sdcard/inst.xml 2>$null | Out-Null
  $xml = (& adb -s $Serial shell cat /sdcard/inst.xml 2>$null) -join ''
  if ($xml -match '继续安装') {
    foreach ($n in [regex]::Matches($xml, '<node[^>]*>')) {
      $v = $n.Value
      if ($v -match 'text="继续安装"') {
        $b = [regex]::Match($v, 'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)]"')
        if ($b.Success) {
          $x = [int](([int]$b.Groups[1].Value + [int]$b.Groups[3].Value) / 2)
          $y = [int](([int]$b.Groups[2].Value + [int]$b.Groups[4].Value) / 2)
          & adb -s $Serial shell input tap $x $y | Out-Null
          Write-Host ('TAP 继续安装 @ ' + $x + ',' + $y + '  t=' + (Get-Date -Format 'HH:mm:ss'))
          $taps++
          Start-Sleep -Milliseconds 1200
          break
        }
      }
    }
  }
}
Write-Host ('taps=' + $taps)