<#
.SYNOPSIS
    起 obscura 浏览器引擎（MCP over HTTP），并把端脑那一侧的接线打出来。

.DESCRIPTION
    「web 能力面」在真环境里点得亮，是六步：
      ① 装（下载官方发行包）→ ② 核（官方 sha256）→ ③ 起（本脚本）
      → ④ 探（能取页）→ ⑤ 配（端脑）→ ⑥ 升／愈（换版本不用改代码 ＋ 崩溃自愈）

    ⚠️ **不核摘要就不许起** —— 「跑的是不是官方那一份」是**分发链**的事，
       不是代码的事 ⇒ ⇒ 本脚本默认**拒绝**启动未核过的二进制
       （要跳过必须显式 -SkipDigestCheck，且脚本会大声说）。

    ⚠️ **「就绪」＝「能取页」** —— 工具清单能回**不等于**能上网
       ⇒ ⇒ 本脚本会真打一次 browser_navigate ⇒ ⇒ 取不到就**响亮地失败**
       （最常见的原因：本机解析器是 fake-IP ⇒ ⇒ 引擎的严格模式把每个站
       都挡掉 ⇒ ⇒ 需要 -AllowPrivateNetwork）。

    ⚠️ **假 IP 逃生口是显式的** —— 且那个逃生口是**全有全无**的
       ⇒ ⇒ 它会让 169.254.169.254 这类地址也真去连 ⇒ ⇒ **门面那一层
       必须比引擎严**（synapse::tools::web::policy 就在做这件事）。

    ⚠️ **换版本不用改代码（升级那一格）** —— 摘要表钉在代码里 ⇒ ⇒ 换版本
       就得改代码 ⇒ ⇒ 运维升级引擎时得等一个开发者。⇒ ⇒ 本脚本的
       -RefreshManifest 从**官方 release API**取回逐资产的 sha256（GitHub 的
       API 逐资产带 digest 字段）⇒ ⇒ 写成一份**清单**（JSON）⇒ ⇒ 校验时
       「锚（代码里的表）＋ 清单（可更新的数据）」一起上场 ⇒ ⇒ 锚不认识
       那一版时清单接管 ⇒ ⇒ 运维自己能升。

    ⚠️ **崩溃自愈（-Watch）** —— 引擎是**外进程** ⇒ ⇒ 它会自己死
       ⇒ ⇒ -Watch 会在探不通时**重启它**并复测 ⇒ ⇒ 只重启**本脚本起的**
       那个进程（不是本脚本起的 ⇒ ⇒ 响亮地说「自愈不了」，不乱杀别人的进程）。

.EXAMPLE
    pwsh -File scripts/start-obscura-web-engine.ps1 `
        -Archive ..\..\.toolcache\obscura\obscura-windows.zip `
        -AllowPrivateNetwork

.EXAMPLE
    # 升级那一格：从官方 API 取回 v0.2.6 的逐资产摘要，写成清单
    pwsh -File scripts/start-obscura-web-engine.ps1 `
        -RefreshManifest v0.2.6 -ManifestOut .\obscura-manifest-v0.2.6.json

.EXAMPLE
    # 用那份清单核一个新下载的发行包（锚不认识这一版 ⇒ ⇒ 清单接管）
    pwsh -File scripts/start-obscura-web-engine.ps1 `
        -Archive .\obscura-v0.2.6-windows.zip `
        -Manifest .\obscura-manifest-v0.2.6.json
#>
[CmdletBinding()]
param(
    [string]$Binary,
    [string]$Archive,
    [string]$Port = '3111',
    [switch]$AllowPrivateNetwork,
    [switch]$SkipDigestCheck,
    [string]$Manifest,
    [string]$AssetName,
    [string]$RefreshManifest,
    [string]$ManifestOut,
    [string]$ProbeUrl = 'https://example.com/',
    [switch]$Watch,
    [int]$WatchIntervalSec = 30,
    [int]$MaxRestarts = 5
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$IblocRoot = Split-Path -Parent $RepoRoot
$ReleaseApi = 'https://api.github.com/repos/h4ckf0r0day/obscura/releases/tags/'

function Write-Step([string]$Text) {
    Write-Host "> $Text" -ForegroundColor Cyan
}

function Resolve-EngineBinary {
    $candidates = @()
    if ($Binary) { $candidates += $Binary }
    if ($env:OBSCURA_BIN) { $candidates += $env:OBSCURA_BIN }
    $candidates += (Join-Path $IblocRoot '.toolcache\obscura\bin\obscura.exe')
    foreach ($c in $candidates) {
        if ($c -and (Test-Path -LiteralPath $c)) {
            return (Resolve-Path -LiteralPath $c).Path
        }
    }
    $tried = ($candidates -join '; ')
    throw "找不到 obscura 可执行文件（试过：$tried）。`n先从官方 release 下载并解压，再 -Binary <path> 或设 `$env:OBSCURA_BIN。"
}

function Get-OfficialReleaseManifest {
    <#
      从**官方 release API**取回逐资产的 sha256 ⇒ ⇒ 写成清单（JSON）。
      ⚠️ GitHub 的 release API 逐资产带 digest 字段（实测 2026-11-16）⇒ ⇒
         这一格是**官方自己算的** ⇒ ⇒ 不是我们抄的摘要表。
    #>
    param([string]$Tag, [string]$OutPath)
    $url = $ReleaseApi + $Tag
    Write-Step "取官方 release 清单：$url"
    $release = Invoke-RestMethod -Uri $url -Headers @{ Accept = 'application/vnd.github+json' }
    $assets = @()
    foreach ($a in $release.assets) {
        if (-not $a.digest) {
            throw "官方资产 '$($a.name)' 没有 digest 字段 ⇒ ⇒ 这一版没法用 API 取摘要 ⇒ ⇒ 拒绝写清单。"
        }
        $sha = ([string]$a.digest) -replace '^sha256:', ''
        $assets += [ordered]@{ name = [string]$a.name; sha256 = $sha.ToLowerInvariant() }
    }
    $doc = [ordered]@{
        version    = ([string]$release.tag_name) -replace '^v', ''
        source_url = $url
        retrieved_at = (Get-Date).ToUniversalTime().ToString('o')
        assets     = $assets
    }
    $json = $doc | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($OutPath, $json, (New-Object System.Text.UTF8Encoding($false)))
    Write-Step ("写清单：" + $OutPath + "（version=" + $doc.version + "，" + $assets.Count + " 个资产，来源 " + $url + "）")
}

function Test-OfficialDigest {
    param([string]$ArchivePath)
    # ⚠️ 摘要的**真源**在 synapse（Rust）：官方 20 个资产的摘要钉在
    #    src/tools/web/engine_binary.rs ⇒ ⇒ 这里调它那个 CLI，不复制一份。
    $synapseRepo = Join-Path $IblocRoot 'synapse'
    $cli = Join-Path $synapseRepo 'examples\verify_web_engine_artifact.rs'
    if (-not (Test-Path -LiteralPath $cli)) {
        throw "找不到 synapse 的校验 CLI（$cli）—— 摘要真源在那儿 ⇒ ⇒ 不许自己复制一份摘要表。"
    }
    Write-Step '核发行包摘要（首次会编译 synapse，慢）…'
    $cliArgs = @($ArchivePath)
    if ($Manifest) { $cliArgs += @('--manifest', $Manifest) }
    if ($AssetName) { $cliArgs += @('--asset', $AssetName) }
    Push-Location $synapseRepo
    try {
        & cargo run --quiet --example verify_web_engine_artifact -- @cliArgs
        if ($LASTEXITCODE -ne 0) {
            throw '发行包摘要**对不上官方** ⇒ ⇒ 拒绝启动（跑的不是官方那一份）。'
        }
    }
    finally {
        Pop-Location
    }
}

function Test-FakeIpResolver {
    # 本机解析器是不是 fake-IP（Clash 之类）—— **实测**，不是假设。
    try {
        $addrs = [System.Net.Dns]::GetHostAddresses('example.com')
    }
    catch {
        return $false
    }
    foreach ($a in $addrs) {
        $b = $a.GetAddressBytes()
        if ($b.Length -eq 4 -and $b[0] -eq 198 -and ($b[1] -eq 18 -or $b[1] -eq 19)) {
            return $true
        }
    }
    return $false
}

function Invoke-Mcp {
    param([string]$Endpoint, [string]$Method, [string]$ParamsJson, [int]$Id = 1)
    $headers = @{ Accept = 'application/json, text/event-stream' }
    $body = '{"jsonrpc":"2.0","id":' + $Id + ',"method":"' + $Method + '","params":' + $ParamsJson + '}'
    $resp = Invoke-WebRequest -Uri $Endpoint -Method POST -Headers $headers -ContentType 'application/json' -Body $body
    $raw = $resp.Content
    if ($raw.StartsWith('{')) { return ($raw | ConvertFrom-Json) }
    $line = ($raw -split "`n" | Where-Object { $_ -like 'data:*' } | Select-Object -First 1)
    return (($line -replace '^data:s*', '') | ConvertFrom-Json)
}

function Get-NavigateParams {
    param([string]$Url)
    # ⚠️ URL 用 **ConvertTo-Json** 转义 ⇒ ⇒ 别手拼 JSON（引号/反斜杠会出事）。
    $argObj = @{ url = $Url } | ConvertTo-Json -Compress
    return '{"name":"browser_navigate","arguments":' + $argObj + '}'
}

function Test-EngineReady {
    # ⚠️ **「就绪」＝「能取页」** —— 工具清单能回不等于能上网 ⇒ ⇒ 真打一次。
    param([string]$Endpoint, [string]$Url)
    try {
        $j = Invoke-Mcp -Endpoint $Endpoint -Method 'tools/list' -ParamsJson '{}'
        if (-not $j.result.tools -or $j.result.tools.Count -eq 0) { return $false }
        $nav = Invoke-Mcp -Endpoint $Endpoint -Method 'tools/call' -ParamsJson (Get-NavigateParams -Url $Url) -Id 2
        if ($nav.result.isError) { return $false }
        $text = [string]$nav.result.content[0].text
        return ($text.Length -gt 0)
    }
    catch {
        return $false
    }
}

function Start-EngineProcess {
    param([string]$Bin, [string]$PortNumber, [string]$Endpoint)
    Write-Step "起引擎：obscura mcp --http --port $PortNumber"
    $proc = Start-Process -FilePath $Bin -ArgumentList @('mcp', '--http', '--port', $PortNumber) -PassThru -WindowStyle Hidden
    $tools = $null
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $j = Invoke-Mcp -Endpoint $Endpoint -Method 'tools/list' -ParamsJson '{}'
            $tools = $j.result.tools
            break
        }
        catch { }
    }
    if (-not $tools) {
        Write-Host "!! 引擎起来了但探不到工具清单（$Endpoint）—— 看它的 stderr。" -ForegroundColor Red
        exit 1
    }
    Write-Step ("引擎工具清单：" + $tools.Count + " 个")
    return $proc
}

# ── 升级那一格：先把清单取回来 ──────────────────────────────────────────
if ($RefreshManifest) {
    if (-not $ManifestOut) {
        throw '给了 -RefreshManifest 就得给 -ManifestOut（清单要落在哪儿）。'
    }
    Get-OfficialReleaseManifest -Tag $RefreshManifest -OutPath $ManifestOut
    if (-not $Archive) {
        Write-Host '（只取清单 ⇒ ⇒ 没启动引擎。）' -ForegroundColor Green
        exit 0
    }
    $Manifest = $ManifestOut
}

$bin = Resolve-EngineBinary
Write-Step "引擎：$bin"

if ($Archive) {
    if ($SkipDigestCheck) {
        Write-Host '!! 跳过了发行包摘要核对 —— 「跑的是不是官方那一份」没人保证。' -ForegroundColor Yellow
    }
    else {
        Test-OfficialDigest -ArchivePath $Archive
    }
}
elseif (-not $SkipDigestCheck) {
    Write-Host '!! 没给 -Archive ⇒ ⇒ 发行包摘要**没核**（解压出来的可执行文件官方没有可比对的摘要）。' -ForegroundColor Yellow
}

$exeHash = (Get-FileHash -LiteralPath $bin -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Step "可执行文件 sha256：$exeHash（官方 release **不**发布解压后二进制的摘要 —— 这一行只作记录）"

$fakeIp = Test-FakeIpResolver
if ($fakeIp) {
    Write-Host '!! 本机解析器是 **fake-IP** ⇒ ⇒ 引擎的严格模式会把**每个站**都挡掉。' -ForegroundColor Yellow
    if ($AllowPrivateNetwork) {
        $env:OBSCURA_ALLOW_PRIVATE_NETWORK = '1'
        Write-Host '!! 已开 OBSCURA_ALLOW_PRIVATE_NETWORK=1 ⇒ ⇒ 该逃生口**全有全无** ⇒ ⇒ 连 169.254.169.254 也会真去连 ⇒ ⇒ 门面那一层必须更严（synapse::tools::web::policy）。' -ForegroundColor Red
    }
    else {
        Write-Host '   ⇒ ⇒ 要让引擎能上网，需显式加 -AllowPrivateNetwork（脚本不会替你开）。' -ForegroundColor Yellow
    }
}
else {
    Write-Step '解析器不是 fake-IP ⇒ ⇒ 引擎的严格模式可用（不需要逃生口）。'
}

$endpoint = "http://127.0.0.1:$Port/mcp"
$started = $null
$reused = $false
try {
    $existing = Invoke-Mcp -Endpoint $endpoint -Method 'tools/list' -ParamsJson '{}'
    $reused = $true
    Write-Step ("端口 $Port 上**已经有**引擎在跑（工具 " + $existing.result.tools.Count + " 个）⇒ ⇒ 复用它，不另起。")
}
catch {
    $started = Start-EngineProcess -Bin $bin -PortNumber $Port -Endpoint $endpoint
}

try {
    $nav = Invoke-Mcp -Endpoint $endpoint -Method 'tools/call' -ParamsJson (Get-NavigateParams -Url $ProbeUrl) -Id 2
    $navText = [string]$nav.result.content[0].text
    if ($nav.result.isError) {
        throw "引擎拒绝取页：$navText"
    }
    Write-Step "能取页：$navText"
}
catch {
    Write-Host "!! 引擎在，但**取不到页**：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host '   ⇒ ⇒ 最常见原因：本机解析器是 fake-IP ⇒ ⇒ 引擎严格模式全站被挡' -ForegroundColor Yellow
    Write-Host '      ⇒ ⇒ 用 -AllowPrivateNetwork 重起（那个逃生口全有全无 ⇒ ⇒ 门面必须更严）。' -ForegroundColor Yellow
    exit 1
}

Write-Host ''
Write-Host '端脑那一侧这样配（**二选一**）：' -ForegroundColor Green
Write-Host '  环境变量：'
Write-Host "    `$env:TELENCEPHALON_WEB_ENGINE_URL = '$endpoint'"
Write-Host '  配置文件（telencephalon.web.engine_url）：'
Write-Host '    telencephalon:'
Write-Host '      web:'
Write-Host "        engine_url: `"$endpoint`""
Write-Host ''
Write-Host '（配置文件里的 `${TELENCEPHALON_WEB_ENGINE_URL}` 也会被展开 ⇒ ⇒ 两种写法同一份真源；环境变量还会**覆盖**配置。）'
Write-Host ''

# ── 崩溃自愈：引擎是外进程 ⇒ ⇒ 它会自己死 ⇒ ⇒ 探不通就重启它并复测 ──
if ($Watch) {
    Write-Step ("进入守护模式（每 " + $WatchIntervalSec + " 秒探一次，最多自愈 " + $MaxRestarts + " 次）")
    $restarts = 0
    while ($true) {
        Start-Sleep -Seconds $WatchIntervalSec
        if (Test-EngineReady -Endpoint $endpoint -Url $ProbeUrl) {
            continue
        }
        if ($restarts -ge $MaxRestarts) {
            Write-Host "!! 探不通且自愈次数用尽（$MaxRestarts 次）⇒ ⇒ 不再自动重启 ⇒ ⇒ 请人看一眼。" -ForegroundColor Red
            exit 1
        }
        if (-not $started) {
            Write-Host '!! 探不通，但这个引擎**不是本脚本起的** ⇒ ⇒ 自愈不了 ⇒ ⇒ 不乱杀别人的进程。' -ForegroundColor Red
            Write-Host '   ⇒ ⇒ 要自愈就换个空端口重起（-Port），或者自己把这个引擎重启。' -ForegroundColor Yellow
            exit 1
        }
        $restarts++
        Write-Step ("探不通 ⇒ ⇒ 自愈第 " + $restarts + " 次：重启引擎")
        try { $started.Refresh() } catch { }
        if (-not $started.HasExited) {
            Stop-Process -Id $started.Id -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
        $started = Start-EngineProcess -Bin $bin -PortNumber $Port -Endpoint $endpoint
        if (Test-EngineReady -Endpoint $endpoint -Url $ProbeUrl) {
            Write-Step ("已自愈（第 " + $restarts + " 次）⇒ ⇒ 引擎又能取页了")
        }
        else {
            Write-Host '!! 自愈后**仍然取不到页** ⇒ ⇒ 不是进程死了，是引擎取不到网 ⇒ ⇒ 查解析器／代理。' -ForegroundColor Yellow
        }
    }
}

if ($started) {
    Write-Host "停引擎：Stop-Process -Id $($started.Id)"
}
else {
    Write-Host '（本次复用了已在运行的引擎 ⇒ ⇒ 没有新起进程 ⇒ ⇒ 没有要停的 PID。）'
}
