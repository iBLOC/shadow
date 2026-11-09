<#
.SYNOPSIS
    **注入式强制重启无障碍服务** —— 给「准入必须等得起」那类修法做真机对照。

.DESCRIPTION
    无障碍服务会被系统重启（app 首帧那一下、ART baseline profile 安装、
    宿主改写 `enabled_accessibility_services` …）⇒ ⇒ 那 1 秒里服务实例为 null、
    连「已启用列表」都可能读成空的。

    ⇒ ⇒ 这个脚本**故意**制造那个窗口：在宿主端把服务摘掉 N 毫秒再装回
    ⇒ ⇒ 于是「等得起」与「一读就下结论」两条路就有了可分辨的真样本。

    ⚠️ 触发点用**标记行**选（本轮 pid ＋ 标记），而不是掐时间：
    ⇒ ⇒ 掐时间会落在用例间隙 ⇒ ⇒ 什么也没验到。

    ⚠️ logcat 的真实行形如
    `11-10 01:52:12.859 13147 13147 I flutter : --- PROBE TAP ---`
    ⇒ ⇒ **pid 是裸数字**、**tag 带尾空格**
    ⇒ ⇒ 拿驱动日志那份 `I/flutter (pid):` 的形状去套 ⇒ ⇒ **永远匹配不上**。

.PARAMETER Serial
    adb 设备号。

.PARAMETER Marker
    触发标记（默认落在「校准命中」那一行 ⇒ ⇒ 它后面紧跟着一次工具层调用）。

.PARAMETER OffMs
    服务被摘掉多久（毫秒）。

.EXAMPLE
    pwsh -File shadow-mobile/scripts/force-a11y-restart.ps1 -Serial ee6b4832

#>
param(
  [string]$Serial,
  [string]$Marker = 'PROBE CALIBRATE HIT',
  [int]$TimeoutSeconds = 300,
  [int]$OffMs = 1200
)

$ErrorActionPreference = 'Continue'
$svc = 'com.ibloc.shadow/com.ibloc.shadow.PrefrontalAccessibilityService'
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

# ⚠️ 必须按**本轮 pid** 认日志 —— logcat 缓冲区里还留着上一轮的行
# ⇒ ⇒ 只按标记认 ⇒ ⇒ 会匹配到上一轮的 ⇒ ⇒ 触发得太早（app 还没跑）⇒ ⇒ 什么也没验到。
$pid1 = ''
while ((Get-Date) -lt $deadline) {
  $p = (& adb -s $Serial shell pidof com.ibloc.shadow 2>$null) -join ''
  $p = $p.Trim()
  if ($p -match '^\d+$') { $pid1 = $p; break }
  Start-Sleep -Milliseconds 300
}
if ($pid1 -eq '') { Write-Host 'app never started'; exit 2 }
Write-Host ('app pid = ' + $pid1)

while ((Get-Date) -lt $deadline) {
  $lines = & adb -s $Serial logcat -d 2>$null
  $hit = $lines | Where-Object {
    $_ -and ($_ -match (' ' + $pid1 + ' ')) -and ($_ -match 'flutter') -and ($_ -match [regex]::Escape($Marker))
  } | Select-Object -First 1
  if ($hit) {
    Write-Host ('MARKER HIT at ' + (Get-Date -Format 'HH:mm:ss.fff'))
    Write-Host ('  line: ' + $hit.Trim())
    & adb -s $Serial shell settings delete secure enabled_accessibility_services | Out-Null
    Write-Host ('switch OFF at ' + (Get-Date -Format 'HH:mm:ss.fff'))
    Start-Sleep -Milliseconds $OffMs
    & adb -s $Serial shell settings put secure enabled_accessibility_services $svc | Out-Null
    Write-Host ('switch ON  at ' + (Get-Date -Format 'HH:mm:ss.fff'))
    exit 0
  }
  Start-Sleep -Milliseconds 120
}
Write-Host 'marker never hit'