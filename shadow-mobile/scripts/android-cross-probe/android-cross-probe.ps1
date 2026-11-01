<#
.SYNOPSIS
    验证一个 Rust crate 能否交叉编译到 Android (aarch64-linux-android)。

.DESCRIPTION
    背景（2026-10-28 实测）：评估「移动端改嵌大脑 encephalon」的可行性时，
    需要逐个确认 encephalon 的强制依赖链能不能编到 Android。本脚本把那次
    探路固化下来，任何 crate 都能一句话验。

    关键设计（都是踩过的坑）：
      1. CARGO_TARGET_DIR 指向临时目录 —— 绝不污染被测仓的 target/。
      2. 优先 --locked：cargo 宁可报错也不改被测仓的 Cargo.lock（兄弟仓普遍
         有他人未提交的 WIP，改 lockfile 会毁掉别人的工作）。
      3. --locked 失败时自动降级为「复制到临时目录再编」的二次尝试 —— 有些
         仓的 committed Cargo.lock 本来就与 Cargo.toml 不同步（diencephalon
         就是），此时原仓一个字节都不该被写。
      4. NDK 工具链环境变量必须显式设置：cargo 不读 Android.mk，linker 不会
         自动指向 NDK。
      5. NDK 位置按 NdkRoot -> ANDROID_NDK_HOME -> ANDROID_HOME/
         ANDROID_SDK_ROOT -> %LOCALAPPDATA% 依次探测，干净 shell 里也能跑。

.PARAMETER ManifestPath
    被测 crate 的 Cargo.toml 路径。

.PARAMETER Features
    可选。传给 cargo 的 --features 列表（逗号分隔）。

.PARAMETER NoDefaultFeatures
    开关。加上 --no-default-features。

.PARAMETER NdkRoot
    可选。NDK 根目录（含 ndk\<version>）。默认自动探测。

.EXAMPLE
    ./android-cross-probe.ps1 -ManifestPath C:\Projects\iBLOC\synapse\Cargo.toml

.EXAMPLE
    ./android-cross-probe.ps1 -ManifestPath C:\Projects\iBLOC\prefrontal\Cargo.toml -Features mobile
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [string]$Features = '',
    [switch]$NoDefaultFeatures,
    [string]$NdkRoot = ''
)

$ErrorActionPreference = 'Stop'

# ---- 路径 ------------------------------------------------------------------
$manifest = (Resolve-Path -LiteralPath $ManifestPath).Path
$crateDir = Split-Path -Parent $manifest
$crateName = Split-Path -Leaf $crateDir

# ---- 工具链 ----------------------------------------------------------------
# NDK 版本与 shadow-mobile 工程钉死的版本一致（android/app/build.gradle.kts）。
$ndkVersion = '30.0.14904198'

$ndkCandidates = @()
if ($NdkRoot) { $ndkCandidates += $NdkRoot }
if ($env:ANDROID_NDK_HOME) { $ndkCandidates += $env:ANDROID_NDK_HOME }
foreach ($sdkVar in @('ANDROID_HOME', 'ANDROID_SDK_ROOT')) {
    $sdk = [Environment]::GetEnvironmentVariable($sdkVar, 'User')
    if (-not $sdk) { $sdk = [Environment]::GetEnvironmentVariable($sdkVar, 'Process') }
    if ($sdk) { $ndkCandidates += (Join-Path $sdk "ndk\$ndkVersion") }
}
if ($env:LOCALAPPDATA) { $ndkCandidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk\ndk\$ndkVersion") }

$ndkRootFound = $ndkCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $ndkRootFound) {
    throw ("NDK $ndkVersion not found. Tried:`n  " + ($ndkCandidates -join "`n  ") + "`nPass -NdkRoot <path> explicitly.")
}
$ndkbin = Join-Path $ndkRootFound 'toolchains\llvm\prebuilt\windows-x86_64\bin'
if (-not (Test-Path -LiteralPath $ndkbin)) {
    throw "NDK toolchain not found under: $ndkbin"
}

$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = Join-Path $ndkbin 'aarch64-linux-android31-clang.cmd'
$env:CC_aarch64_linux_android = Join-Path $ndkbin 'aarch64-linux-android31-clang.cmd'
$env:CXX_aarch64_linux_android = Join-Path $ndkbin 'aarch64-linux-android31-clang++.cmd'
$env:AR_aarch64_linux_android = Join-Path $ndkbin 'llvm-ar.exe'

$target = 'aarch64-linux-android'
$workRoot = Join-Path $env:TEMP "android-cross-probe\$crateName"
$env:CARGO_TARGET_DIR = Join-Path $workRoot 'target'
New-Item -ItemType Directory -Force -Path $env:CARGO_TARGET_DIR | Out-Null

# ---- 组装 cargo 参数 --------------------------------------------------------
function Build-CargoArgs {
    param([string]$Manifest, [switch]$Locked)
    $a = @('build', '--manifest-path', $Manifest, '--target', $target, '--release')
    if ($Features) { $a += @('--features', $Features) }
    if ($NoDefaultFeatures) { $a += '--no-default-features' }
    if ($Locked) { $a += '--locked' }
    return $a
}

# 跑 cargo，把输出写进日志文件并直接打到 host，**不进入 pipeline**
# （否则 cargo 的 stdout 会和返回码混在一起，调用方拿到的是数组而不是退出码）。
function Invoke-Probe {
    param([string[]]$CargoArgs, [string]$Label)
    $log = Join-Path $workRoot "$Label.log"
    Write-Host "==> [$Label] cargo $($CargoArgs -join ' ')" -ForegroundColor Cyan
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & cargo @CargoArgs 2>&1 | Tee-Object -FilePath $log | ForEach-Object { Write-Host $_ }
    $code = $LASTEXITCODE
    $sw.Stop()
    Write-Host ("==> [$Label] exit={0} elapsed={1:hh\:mm\:ss}  log={2}" -f $code, $sw.Elapsed, $log) -ForegroundColor $(if ($code -eq 0) { 'Green' } else { 'Red' })
    return [int]$code
}

Write-Host "crate     : $crateName"
Write-Host "manifest : $manifest"
Write-Host "target   : $target"
Write-Host "ndk      : $ndkRootFound"
Write-Host "targetdir: $env:CARGO_TARGET_DIR"
Write-Host ''

# ---- 第一轮：原仓 + --locked（保证不写被测仓的 Cargo.lock）-----------------
$code = Invoke-Probe -CargoArgs (Build-CargoArgs -Manifest $manifest -Locked) -Label 'locked'

# ---- 第二轮：--locked 拒绝时的安全降级 -------------------------------------
if ($code -ne 0) {
    Write-Host ''
    Write-Host '!! --locked 失败 —— 多半是 committed Cargo.lock 与 Cargo.toml 不同步，' -ForegroundColor Yellow
    Write-Host '!! 或 lockfile 与当前依赖图有版本冲突。改为复制到临时目录再编，原仓保持只读。' -ForegroundColor Yellow

    $stageRoot = Join-Path $workRoot 'stage'
    if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

    Copy-Item -LiteralPath $crateDir -Destination (Join-Path $stageRoot $crateName) -Recurse -Force -Exclude @('target', '.git')
    Write-Host "copied -> $stageRoot\$crateName" -ForegroundColor DarkGray

    $code = Invoke-Probe -CargoArgs (Build-CargoArgs -Manifest (Join-Path $stageRoot "$crateName\Cargo.toml")) -Label 'staged'
}

Write-Host ''
if ($code -eq 0) {
    Write-Host "VERDICT: PASS — $crateName 能编到 $target" -ForegroundColor Green
} else {
    Write-Host "VERDICT: FAIL — $crateName 编不到 $target（见上方错误与 $workRoot 下的日志）" -ForegroundColor Red
}
exit $code
