# 解析判据的**离线自检** runner —— **不需要真机**。
#
# ⚠️ 为什么单独一个 runner —— 实测（2026-11-08）踩过：
# ⇒ ⇒ 原本把「直接跑」的入口放在库文件里、用「文件名 == 脚本名」判断
# ⇒ ⇒ ⇒ 把文件**改名**做反向验证时入口不触发 ⇒ ⇒ **自检根本没跑却 EXIT=0**
# ⇒ ⇒ ⇒ 「全过」是**空的**⇒ ⇒ ⇒ 典型的**空绿**。
# ⇒ ⇒ ⇒ 所以：库只放函数；入口在这里；而且**逐条报出用例数**
# ⇒ ⇒ ⇒ 「0 条用例」直接判红（空绿保护）。
#
# 用法：pwsh -File shadow-mobile/scripts/lib/mobile-use-parsers-selfcheck.ps1

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'mobile-use-parsers.ps1')

$result = Invoke-MobileUseParserSelfCheck
Write-Host '== 解析判据自检 =='
foreach ($c in $result.Cases) {
    $mark = '过'
    if (-not $c.Ok) { $mark = '红' }
    Write-Host ('  [' + $mark + '] ' + $c.Name + '  —— ' + $c.Detail)
}
Write-Host ('共 ' + $result.Cases.Count + ' 条，失败 ' + $result.Failures.Count + ' 条')
# ⚠️⚠️ **空绿保护** —— 一条用例都没跑 ⇒ ⇒ 那不是「全过」，那是「没跑」
if ($result.Cases.Count -eq 0) {
    Write-Host '!! 一条用例都没执行 ⇒ ⇒ 空绿 ⇒ ⇒ 判失败'
    exit 1
}
if (-not $result.Ok) {
    Write-Host '== 有不过 =='
    foreach ($f in $result.Failures) { Write-Host ('  - ' + $f) }
    exit 1
}
exit 0
