<#
.SYNOPSIS
    服务 terminator 巡检 —— OpenZiti v2。

.DESCRIPTION
    ⚠️ **这个脚本的职责变了** —— 早先它叫「补 terminator」，会**手建**一个
    binding=tls 的 terminator。那是**错的**：

    - 路由器只认 binding=**edge**（common/binding.go:20 EdgeBinding="edge"）
      ⇒ binding=tls 的 terminator 会让路由器报
      **"xgress factory [tls] not found"** ⇒ ⇒ 拨号侧表现成「连不上」。
    - 现在**根本不用手建** —— 路由器的 processBind 会**自己建**
      （controller/handler_edge_ctrl/create_terminator_v2.go:138 恒用
      Binding: common.EdgeBinding，地址就是 terminator 的 UUID）。

    ⇒ ⇒ 所以这个脚本现在只做**巡检**：把该服务现有的 terminator 列出来，
       并**点名**哪些是路由器用不了的（binding 不是 edge）⇒ ⇒ 那才是真问题。

    -RemoveNonEdge 才会删掉那些用不了的（默认**只报不删**）。

.EXAMPLE
    $env:ZITI_ADMIN_PASSWORD = '...'
    pwsh -File scripts/openziti-terminator.ps1

.EXAMPLE
    pwsh -File scripts/openziti-terminator.ps1 -RemoveNonEdge
#>
[CmdletBinding()]
param(
  [string]$Controller = 'https://192.168.31.170:1280',
  [string]$Username = 'admin',
  [string]$Password = '',
  [string]$ServiceName = 'shadow-brain',
  [switch]$RemoveNonEdge
)

$ErrorActionPreference = 'Stop'
if (-not $Password) { $Password = $env:ZITI_ADMIN_PASSWORD }
if (-not $Password) {
  throw '需要控制器口令：用 -Password 传，或设环境变量 ZITI_ADMIN_PASSWORD。'
}

# --- TLS：本机局域网上的自签证书，开发期跳过校验 -------------------
# 5.1 没有 -SkipCertificateCheck；7+ 走参数。两种宿主都要能跑。
$skipCert = @{}
if ($PSVersionTable.PSVersion.Major -ge 6) {
  $skipCert['SkipCertificateCheck'] = $true
} else {
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
}

function Invoke-Api {
  param(
    [string]$Method = 'GET',
    [string]$Path,
    $Body = $null
  )
  $p = @{
    Uri         = "$Controller$Path"
    Method      = $Method
    TimeoutSec  = 60
    Headers     = @{ 'zt-session' = $script:Session }
  }
  foreach ($k in $skipCert.Keys) { $p[$k] = $skipCert[$k] }
  if ($null -ne $Body) {
    $p['Body'] = ($Body | ConvertTo-Json -Depth 8)
    $p['ContentType'] = 'application/json'
  }
  try {
    Invoke-RestMethod @p
  } catch {
    $detail = [string]$_.ErrorDetails.Message
    if (-not $detail) { $detail = $_.Exception.Message }
    throw "API $Method $Path 失败 -> $detail"
  }
}

Write-Host "== 登录控制器 =="
$loginParams = @{
  Uri         = "$Controller/edge/client/v1/authenticate?method=password"
  Method      = 'POST'
  Body        = (@{ username = $Username; password = $Password } | ConvertTo-Json)
  ContentType = 'application/json'
  TimeoutSec  = 60
}
foreach ($k in $skipCert.Keys) { $loginParams[$k] = $skipCert[$k] }
$login = Invoke-RestMethod @loginParams
$script:Session = $login.data.token
Write-Host "    会话 id = $($login.data.id)"

Write-Host "== 解析服务 =="
$services = @((Invoke-Api 'GET' '/edge/management/v1/services').data)
$service = $services | Where-Object { $_.name -eq $ServiceName } | Select-Object -First 1
if (-not $service) { throw "找不到服务 $ServiceName" }
Write-Host "    服务 $ServiceName id = $($service.id)"

Write-Host "== 该服务的 terminator =="
$terms = @((Invoke-Api 'GET' "/edge/management/v1/services/$($service.id)/terminators").data)
if ($terms.Count -eq 0) {
  Write-Host "  （0 个）"
  Write-Host "  这**通常没问题** —— 路由器的 processBind 会自己建（binding=edge）。"
  Write-Host "  只有在「已经有人 bind 过、却一个都没有」时才值得看一眼。"
  return
}

$bad = @()
foreach ($t in $terms) {
  $ok = ($t.binding -eq 'edge')
  if (-not $ok) { $bad += $t }
  $mark = ''
  if (-not $ok) { $mark = '   <- 路由器用不了' }
  $line = '    {0} router={1} binding={2} address={3}{4}' -f $t.id, $t.router.name, $t.binding, $t.address, $mark
  Write-Host $line
}

if ($bad.Count -gt 0) {
  Write-Host ""
  Write-Host "  有 $($bad.Count) 个 terminator 的 binding 不是 edge ⇒ ⇒ 路由器会报"
  Write-Host '     "xgress factory [tls] not found" ⇒ ⇒ 拨号侧表现成「连不上」。'
  Write-Host "     删掉它们（-RemoveNonEdge）⇒ ⇒ 让路由器的 processBind 自己建。"
  if ($RemoveNonEdge) {
    foreach ($t in $bad) {
      Invoke-Api 'DELETE' "/edge/management/v1/terminators/$($t.id)" | Out-Null
      Write-Host "    已删 $($t.id)"
    }
  }
} else {
  Write-Host ""
  Write-Host "  全是 edge binding —— 路由器能用。"
}
