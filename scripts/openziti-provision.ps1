# =====================================================================
#  OpenZiti 真网供给脚本 —— 给 Shadow 的零信任端到端验证铺路
# =====================================================================
#  目的：在一张**真的** OpenZiti 网络上，把「服务 + 两个身份 + 策略 +
#        身份文件」一次性备齐，好让 Rust 侧的 4 条 #[ignore] 真网测试
#        （HTTP / WebSocket / SSE / 本地代理）能真的跑起来。
#
#  为什么需要这个脚本：
#    - 本机**没有 ziti CLI**（Get-Command ziti / ziti-tunnel 均 NOT FOUND）
#      => 没法用 ziti edge enroll 做身份注册；
#    - OpenZiti v2.0.8 的 CLI 路径全变了（/edge/client/v1/login 已 404），
#      认证走 POST /edge/client/v1/authenticate?method=password；
#    - 所以整条链改走 **REST API**，本脚本就是把配方固化下来。
#
#  v2 的 API 形状（2026-11-04 实测，与 v1 差别很大）：
#    登录          POST /edge/client/v1/authenticate?method=password
#                  -> { data: { id, token } }；之后带 zt-session 头
#    建服务        POST /edge/management/v1/services  { name, encryptionRequired }
#    建身份        POST /edge/management/v1/identities { name, type:"Default" }
#                  -> 注意：v2 **不吃** enrollmentMethod 字段
#    建 enrollment POST /edge/management/v1/enrollments
#                  { identityId, method:"ott", expiresAt }  -> 之后 GET 拿 jwt
#    换身份文件    POST /edge/client/v1/enroll?method=ott&token=<uuid>
#                  头 Authorization: Bearer <jwt>，体 = PEM CSR
#                  -> 返回 { data: { cert } }（v2 **不再**返回 ca！）
#    CA bundle     GET /.well-known/est/cacerts  (PKCS#7) -> 解出根 CA
#    建策略        POST /edge/management/v1/service-policies
#                  { name, type:"Bind"|"Dial", semantic:"AnyOf",
#                    identityRoles:["@<identityId>"], serviceRoles:["@<serviceId>"] }
#                  -> 角色必须带前缀：# = 角色属性，@ = 名称或 id
#
#  两条踩过的坑（脚本里都处理了）：
#    ① encryptionRequired 在 v2 **不可 PATCH**（报 "no fields updated"）
#       => 只能删掉服务重建。
#    ② enroll 的响应里**没有 ca 字段** => CA bundle 要去 EST 端点拿。
#
#  幂等：同名实体已存在就复用；本地身份文件还在且控制器侧证书也在 => 不重发。
#  重新来一遍：-Recreate
#
#  用法：
#    $env:ZITI_ADMIN_PASSWORD = '...'
#    pwsh -File scripts/openziti-provision.ps1
#    pwsh -File scripts/openziti-provision.ps1 -Recreate
# =====================================================================

[CmdletBinding()]
param(
  [string]$Controller = 'https://192.168.31.170:1280',
  [string]$Username = 'admin',
  [string]$Password = '',
  [string]$ServiceName = 'shadow-brain',
  [string]$OutDir = '',
  [switch]$Recreate
)

$ErrorActionPreference = 'Stop'

if (-not $Password) { $Password = $env:ZITI_ADMIN_PASSWORD }
if (-not $Password) {
  throw '需要控制器口令：用 -Password 传，或设环境变量 ZITI_ADMIN_PASSWORD。'
}
if (-not $OutDir) {
  $OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.ziti'
}

# --- TLS：本机局域网上的自签证书，开发期跳过校验 -------------------
# 5.1 没有 -SkipCertificateCheck；7+ 走参数。两种宿主都要能跑。
$skipCert = @{}
if ($PSVersionTable.PSVersion.Major -ge 6) {
  $skipCert['SkipCertificateCheck'] = $true
} else {
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
}

$script:Session = $null

function Invoke-Api {
  param(
    [string]$Method = 'GET',
    [string]$Path,
    $Body = $null
  )
  $p = @{
    Uri        = "$Controller$Path"
    Method     = $Method
    Headers    = @{}
    TimeoutSec = 60
  }
  if ($script:Session) { $p['Headers']['zt-session'] = $script:Session }
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

function Write-Step([string]$Text) { Write-Host "==> $Text" }

# --- 登录 ---------------------------------------------------------
Write-Step "登录控制器 $Controller"
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

# --- 清掉本脚本自己建的策略（每次都重建，保证指向最新身份/服务）---
Write-Step "清理旧的 shadow-brain 策略"
$oldPols = @((Invoke-Api 'GET' '/edge/management/v1/service-policies').data)
foreach ($op in $oldPols) {
  if ($op.name -like 'shadow-brain-*') {
    Write-Host "    删除策略 $($op.name)"
    Invoke-Api 'DELETE' "/edge/management/v1/service-policies/$($op.id)" | Out-Null
  }
}

# --- 服务 ---------------------------------------------------------
Write-Step "服务 $ServiceName"
$services = @((Invoke-Api 'GET' '/edge/management/v1/services').data)
$svc = $services | Where-Object { $_.name -eq $ServiceName } | Select-Object -First 1
if ($svc -and $svc.encryptionRequired) {
  # ⚠️ v2 不允许 PATCH 这个字段 => 只能删了重建。
  Write-Host "    已存在的服务开着端到端加密，v2 改不了 => 删掉重建"
  Invoke-Api 'DELETE' "/edge/management/v1/services/$($svc.id)" | Out-Null
  $svc = $null
}
if (-not $svc) {
  $created = Invoke-Api 'POST' '/edge/management/v1/services' @{
    name              = $ServiceName
    # ziti-sdk 0.3 的 Hello 握手**不做** libsodium 端到端加密
    # => 开 encryptionRequired 会被 edge router 拒掉
    encryptionRequired = $false
  }
  $svcId = $created.data.id
  Write-Host "    已创建 service id = $svcId"
} else {
  $svcId = $svc.id
  Write-Host "    已存在 service id = $svcId"
}

# --- 身份 + enrollment --------------------------------------------
function New-KeyAndCsr([string]$CommonName) {
  $ec = [System.Security.Cryptography.ECDsa]::Create(
    [System.Security.Cryptography.ECCurve]::CreateFromFriendlyName('nistP256'))
  $req = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest(
    "CN=$CommonName", $ec, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  $csrDer = $req.CreateSigningRequest()
  $nl = [Environment]::NewLine
  $csrPem = "-----BEGIN CERTIFICATE REQUEST-----" + $nl +
            [Convert]::ToBase64String($csrDer, 'InsertLineBreaks') + $nl +
            "-----END CERTIFICATE REQUEST-----" + $nl
  $keyPem = "-----BEGIN PRIVATE KEY-----" + $nl +
            [Convert]::ToBase64String($ec.ExportPkcs8PrivateKey(), 'InsertLineBreaks') + $nl +
            "-----END PRIVATE KEY-----" + $nl
  return @{ Csr = $csrPem; Key = $keyPem }
}

function Ensure-Identity {
  param([string]$Name)

  $ids = @((Invoke-Api 'GET' '/edge/management/v1/identities').data)
  $id = $ids | Where-Object { $_.name -eq $Name } | Select-Object -First 1

  if ($id -and $Recreate) {
    Write-Host "    删除旧身份 $($id.id)"
    Invoke-Api 'DELETE' "/edge/management/v1/identities/$($id.id)" | Out-Null
    $id = $null
  }
  if (-not $id) {
    $created = Invoke-Api 'POST' '/edge/management/v1/identities' @{
      name           = $Name
      type           = 'Default'
      isAdmin        = $false
      roleAttributes = @()
    }
    $id = $created.data
    Write-Host "    已创建 identity id = $($id.id)"
  } else {
    Write-Host "    已存在 identity id = $($id.id)"
  }
  return $id.id
}

function Test-HasCertAuthenticator([string]$IdentityId) {
  $auths = @((Invoke-Api 'GET' "/edge/management/v1/identities/$IdentityId/authenticators").data)
  return [bool]($auths | Where-Object { $_.method -eq 'cert' } | Select-Object -First 1)
}

function Get-CaBundlePem([string]$EnrollCertPem) {
  # 首选：控制器的 EST CA bundle（PKCS#7）—— 含**自签的根 CA**。
  # ⚠️ 只有 pwsh 7 有 System.Security.Cryptography.Pkcs 这个程序集；
  #    Windows PowerShell 5.1 没有 => 走退路（enrollment 链里的中间 CA）。
  try {
    $p = @{ Uri = "$Controller/.well-known/est/cacerts"; Method = 'GET'; TimeoutSec = 60 }
    foreach ($k in $skipCert.Keys) { $p[$k] = $skipCert[$k] }
    $resp = Invoke-WebRequest @p
    $der = [Convert]::FromBase64String(([System.Text.Encoding]::ASCII.GetString([byte[]]$resp.Content)).Trim())
    Add-Type -AssemblyName System.Security.Cryptography.Pkcs -ErrorAction Stop
    $cms = New-Object System.Security.Cryptography.Pkcs.SignedCms
    $cms.Decode($der)
    $nl = [Environment]::NewLine
    $parts = @()
    foreach ($c in $cms.Certificates) {
      $parts += ("-----BEGIN CERTIFICATE-----" + $nl +
        [Convert]::ToBase64String($c.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert), 'InsertLineBreaks') + $nl +
        "-----END CERTIFICATE-----" + $nl)
    }
    Write-Host "    CA bundle 来自 EST(PKCS#7)：$($cms.Certificates.Count) 张（含自签根）"
    return ($parts -join '')
  } catch {
    Write-Host "    EST CA bundle 不可用 => 退回 enrollment 链里的中间 CA（rustls 可接受非自签信任锚）"
    $blocks = [regex]::Matches($EnrollCertPem, '-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----')
    $parts = @()
    for ($i = 1; $i -lt $blocks.Count; $i++) {
      $parts += ($blocks[$i].Value + [Environment]::NewLine)
    }
    return ($parts -join '')
  }
}

function Ensure-Enrolled {
  param([string]$IdentityId, [string]$Name)

  $certPath = Join-Path $OutDir "$Name.cert.pem"
  $keyPath  = Join-Path $OutDir "$Name.key.pem"
  $caPath   = Join-Path $OutDir "$Name.ca.pem"
  $jsonPath = Join-Path $OutDir "$Name.identity.json"

  $haveLocal = (Test-Path $certPath) -and (Test-Path $keyPath) -and
               (Test-Path $caPath) -and (Test-Path $jsonPath)
  if ($haveLocal -and (Test-HasCertAuthenticator $IdentityId) -and -not $Recreate) {
    Write-Host "    身份文件已在本地且控制器证书仍在 -> 复用"
    return $jsonPath
  }

  Write-Step "为 $Name 走一次 OTT enrollment"
  $expires = (Get-Date).ToUniversalTime().AddHours(6).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  $enr = Invoke-Api 'POST' '/edge/management/v1/enrollments' @{
    identityId = $IdentityId
    method     = 'ott'
    expiresAt  = $expires
  }
  $enr = (Invoke-Api 'GET' "/edge/management/v1/enrollments/$($enr.data.id)").data
  Write-Host "    enrollment token = $($enr.token)"

  $pair = New-KeyAndCsr $Name
  $enrollParams = @{
    Uri         = "$Controller/edge/client/v1/enroll?method=ott&token=$($enr.token)"
    Method      = 'POST'
    Headers     = @{ 'Authorization' = "Bearer $($enr.jwt)" }
    Body        = $pair.Csr
    ContentType = 'application/x-pem-file'
    TimeoutSec  = 60
  }
  foreach ($k in $skipCert.Keys) { $enrollParams[$k] = $skipCert[$k] }
  $res = Invoke-RestMethod @enrollParams

  if (-not $res.data.cert) { throw "enroll 没有拿到证书" }
  $caBundle = Get-CaBundlePem $res.data.cert

  if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
  # 用 ascii 编码写文件 => 两个宿主都不加 BOM（PEM 前有 BOM 会被解析器拒）
  Set-Content -Path $certPath -Value $res.data.cert -NoNewline -Encoding ascii
  Set-Content -Path $keyPath  -Value $pair.Key     -NoNewline -Encoding ascii
  Set-Content -Path $caPath   -Value $caBundle     -NoNewline -Encoding ascii

  $identity = @{
    ztAPI = "$Controller/edge/client/v1"
    id    = $IdentityId
    cert  = $certPath
    key   = $keyPath
    ca    = $caPath
  }
  Set-Content -Path $jsonPath -Value ($identity | ConvertTo-Json -Depth 4) -Encoding ascii
  Write-Host "    已写出 $jsonPath"
  return $jsonPath
}

# --- 策略 ---------------------------------------------------------
function Ensure-Policy {
  param([string]$Name, [string]$Type, [string]$IdentityId, [string]$ServiceId)
  $created = Invoke-Api 'POST' '/edge/management/v1/service-policies' @{
    name          = $Name
    type          = $Type
    semantic      = 'AnyOf'
    identityRoles = @("@$IdentityId")
    serviceRoles  = @("@$ServiceId")
  }
  Write-Host "    已创建策略 $Name id = $($created.data.id)"
  return $created.data.id
}

# =====================================================================
#  主流程
# =====================================================================
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

Write-Step "准备宿主身份（Bind）"
$hostId = Ensure-Identity 'shadow-brain-host'
$hostJson = Ensure-Enrolled -IdentityId $hostId -Name 'shadow-brain-host'

Write-Step "准备客户端身份（Dial）"
$clientId = Ensure-Identity 'shadow-brain-client'
$clientJson = Ensure-Enrolled -IdentityId $clientId -Name 'shadow-brain-client'

Write-Step "绑定策略"
Ensure-Policy -Name 'shadow-brain-bind' -Type 'Bind' -IdentityId $hostId   -ServiceId $svcId | Out-Null
Ensure-Policy -Name 'shadow-brain-dial' -Type 'Dial' -IdentityId $clientId -ServiceId $svcId | Out-Null

Write-Step "写环境变量文件"
$envFile = Join-Path $OutDir 'ziti.env'
$envText = @(
  "# 由 scripts/openziti-provision.ps1 生成 —— 真网测试用这一份",
  "ZITI_IDENTITY=$clientJson",
  "ZITI_HOST_IDENTITY=$hostJson",
  "ZITI_SERVICE=$ServiceName"
) -join [Environment]::NewLine
Set-Content -Path $envFile -Value $envText -Encoding ascii
Write-Host "    $envFile"

Write-Step "edge router 现状"
$rs = @((Invoke-Api 'GET' '/edge/management/v1/edge-routers').data)
foreach ($r in $rs) {
  $protos = @()
  if ($r.supportedProtocols) {
    foreach ($pp in $r.supportedProtocols.PSObject.Properties) { $protos += ($pp.Name + '=' + $pp.Value) }
  }
  Write-Host ("    {0} host={1} online={2} {3}" -f $r.name, $r.hostname, $r.isOnline, ($protos -join ' '))
}

Write-Host ''
Write-Host '供给完成。下一步：'
Write-Host '  1) 体检（控制器 API 层 + 线路协议层）：'
Write-Host ("     ZITI_IDENTITY=" + $clientJson)
Write-Host '     cargo run --offline --manifest-path C:\Projects\iBLOC\synapse\Cargo.toml --features ziti --example ziti_doctor'
Write-Host '  2) 线路探针（edge router 能不能说上话）：'
Write-Host '     cargo run --offline --manifest-path C:\Projects\iBLOC\synapse\Cargo.toml --features ziti --example ziti_wire_probe'
