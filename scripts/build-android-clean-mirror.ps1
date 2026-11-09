# 从**已提交状态**编出手机端那份 NDK 内嵌大脑（libencephalon.so）。
#
# ## 为什么不能直接在共享工作树里编
#
# ① **工作树是脏的** —— 兄弟仓（端脑／synapse／hippocampus…）里常有并行会话的
#    在飞改动 ⇒ ⇒ 直接编 ⇒ ⇒ 产物里混着**没提交的代码** ⇒ ⇒ 「产物级」的读数
#    成了**孤儿读数**（答不出「这份产物是哪棵源码树编的」）。
# ② **构建脚本会临时改写 manifest** —— `scripts/build-android.ps1` 会改写
#    `Cargo.toml`（path 依赖覆盖）与 `Cargo.lock` ⇒ ⇒ 在共享工作树里跑
#    ＝ 往别人的在飞面上写东西。
#
# ## 为什么镜像必须「同级同层」
#
# 兄弟仓之间的依赖全是**相对路径**（`../synapse`、`../neuron`、
# `../hippocampus/hippocampus-core`…）⇒ ⇒ 复制到别处 ⇒ ⇒ 这些连线**全断**
# ⇒ ⇒ 镜像必须保持**同样的相对布局** ⇒ ⇒ 整棵镜像摆成一排。
#
# ## 为什么镜像不落在 iBLOC 顶层
#
# `scripts/check-legacy-residue-all.mjs` 会**枚举 iBLOC 顶层的每个目录**当仓
# 扫 ⇒ ⇒ 在那儿放副本 ⇒ ⇒ 会被当新仓扫 ⇒ ⇒ ⇒ 默认落在 iBLOC 之外。
#
# ## 为什么还要一个联接（junction）
#
# 增量缓存在**真仓**的 `target-android`（上次构建留下 1915 个 rlib）⇒ ⇒ 镜像里
# 是空的 ⇒ ⇒ 从零编几千个 crate（以小时计）⇒ ⇒ 联接指回真缓存 ⇒ ⇒ 实测
# **4 分 23 秒**。
#
# 用法：
#   pwsh -File scripts/build-android-clean-mirror.ps1
#   pwsh -File scripts/build-android-clean-mirror.ps1 -MirrorRoot 'D:/cc/m1'
param(
  [string]$SourceRoot = 'C:/Projects/iBLOC',
  [string]$MirrorRoot = 'C:/Projects/_cc/m1',
  [string]$JniLibsDir = '',
  [string]$Target = 'aarch64-linux-android',
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$repos = @('encephalon','telencephalon','synapse','diencephalon','neuron','prefrontal','hippocampus','ziti-rust')

New-Item -ItemType Directory -Force -Path $MirrorRoot | Out-Null

# ---- 1. 逐仓导出**已提交状态** ---------------------------------------------
foreach ($r in $repos) {
    $repo = Join-Path $SourceRoot $r
    if (-not (Test-Path -LiteralPath $repo)) { throw "源仓不存在：$repo" }
    $dst = Join-Path $MirrorRoot $r
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    $tar = Join-Path $MirrorRoot "$r.tar"
    & git -C $repo archive --format=tar -o $tar HEAD
    if ($LASTEXITCODE -ne 0) { throw "git archive 失败：$r" }
    & tar -xf $tar -C $dst
    if ($LASTEXITCODE -ne 0) { throw "解包失败：$r" }
    Remove-Item -LiteralPath $tar -Force
    $n = @(Get-ChildItem -Path $dst -Recurse -File -ErrorAction SilentlyContinue).Count
    Write-Output ("已镜像 {0}：{1} 个文件" -f $r, $n)
}

# ---- 2. target-android 联接（复用增量缓存）--------------------------------
$link = Join-Path $MirrorRoot 'encephalon/target-android'
$real = Join-Path $SourceRoot 'encephalon/target-android'
if (-not (Test-Path -LiteralPath $link)) {
    New-Item -ItemType Junction -Path $link -Target $real | Out-Null
    Write-Output "联接：$link ⇒ $real"
} else {
    Write-Output "联接已存在：$link"
}

# ---- 3. 核：镜像里每条 path 依赖都指得到东西 --------------------------------
$missing = @()
foreach ($r in $repos) {
    $repoRoot = Join-Path $MirrorRoot $r
    Get-ChildItem -Path $repoRoot -Recurse -Filter 'Cargo.toml' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\target\\' } |
        ForEach-Object {
            $manifest = $_.FullName
            $dir = Split-Path -Parent $manifest
            Select-String -Path $manifest -Pattern '^\s*[A-Za-z0-9_-]+\s*=.*\bpath\s*=\s*"([^"]+)"' -AllMatches | ForEach-Object {
                foreach ($m in $_.Matches) {
                    $raw = $m.Groups[1].Value
                    if ($raw -like 'src/*' -or $raw -like 'crates/*' -or $raw -like 'hippocampus-*/*') { return }
                    $abs = [System.IO.Path]::GetFullPath((Join-Path $dir $raw))
                    if (-not (Test-Path -LiteralPath $abs)) { $missing += ("$r ⇒ $abs") }
                }
            }
        }
}
if ($missing.Count -gt 0) {
    Write-Output "镜像里有 path 依赖指不到东西："
    $missing | Sort-Object -Unique | ForEach-Object { Write-Output ("  " + $_) }
    exit 1
}
Write-Output "镜像内所有 path 依赖都解析得到。"

if ($SkipBuild) { exit 0 }

# ---- 4. 编译并拷进 jniLibs -------------------------------------------------
if (-not $JniLibsDir) {
    $JniLibsDir = Join-Path $SourceRoot 'shadow/shadow-mobile/android/app/src/main/jniLibs'
}
$script = Join-Path $MirrorRoot 'encephalon/scripts/build-android.ps1'
& pwsh -NoProfile -ExecutionPolicy Bypass -File $script -Target $Target -JniLibsDir $JniLibsDir
exit $LASTEXITCODE
