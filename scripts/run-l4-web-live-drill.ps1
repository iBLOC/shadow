<#
.SYNOPSIS
    L4 真模型演练：真端脑 ＋ 真模型 ＋ 真引擎 ⇒ ⇒ **证明**模型自己会去调 web_fetch。

.DESCRIPTION
    链路（本脚本逐段点亮）：
      ① 引擎（obscura 外进程，摘要核过、真打一次取页探针）
      → ② 端脑（真的 HTTP 面、真的工具注册表、真的配置面）
      → ③ 叶区（把 web_fetch 交给模型）
      → ④ 真模型（云供应商，走 OpenAI 兼容面）
      → ⑤ 工具结果回到模型 ⇒ ⇒ 模型用**抓回来的原文**回答。

    ⚠️ **为什么 prompt 抓的是一个随机 nonce 页（而不是 example.com）**：
       example.com 的第一句是**模型训练数据里就有**的 ⇒ ⇒ 模型**不调工具**
       也能一字不差答出来 ⇒ ⇒ 那种读数是**假绿**（上一轮就栽在这）。
       ⇒ ⇒ 本脚本抓 `httpbin.org/uuid`（每次一个**新的** v4 UUID）⇒ ⇒
       模型答对的 UUID **只可能**来自那一次真抓取 ⇒ ⇒ 它就是**证据**。

    ⚠️ **负控（差分证明）**：另起一台**没有 web 能力**的端脑（配置里没有
       `web` 节、进程里也没有引擎端点）⇒ ⇒ 同一句 prompt、同一台模型
       ⇒ ⇒ **拿不到 UUID** ⇒ ⇒ 「正控有 UUID、负控没有」= 模型不是背的。

    ⚠️ **要看的两处证据**（缺一不可）：
       ❶ 协议面：SSE 里出现 `CUSTOM(name=telencephalon_tool_result)`
          且 name=web_fetch、载荷里 `ok=true` ⇒ ⇒ 工具**真跑了**且**出了声**；
       ❷ 内容面：模型答案里的 UUID **等于**工具载荷里的那个 UUID
          ⇒ ⇒ 模型**确实看着抓回来的原文**在答。

    ⚠️ **密钥不打印、不进日志**：两把钥匙只写文件；provider key 只写进台架文件。

.EXAMPLE
    pwsh -File scripts/run-l4-web-live-drill.ps1

.EXAMPLE
    pwsh -File scripts/run-l4-web-live-drill.ps1 -KeepBrain
#>
[CmdletBinding()]
param(
    [string]$BrainExe = '',
    [int]$Port = 60091,
    [int]$ControlPort = 60093,
    [int]$EnginePort = 3117,
    [string]$ProofDir = '',
    [string]$ProviderId = '',
    [string]$Model = '',
    [string]$NonceUrl = 'https://httpbin.org/uuid',
    [switch]$KeepBrain
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$IblocRoot = Split-Path -Parent $RepoRoot
if (-not $ProofDir) { $ProofDir = Join-Path $IblocRoot '.toolcache\l4-drill' }

function Write-Step([string]$Text) { Write-Host "> $Text" -ForegroundColor Cyan }
function Write-Good([string]$Text) { Write-Host $Text -ForegroundColor Green }
function Write-Bad([string]$Text) { Write-Host $Text -ForegroundColor Yellow }

function Resolve-BrainExe {
    $candidates = @()
    if ($BrainExe) { $candidates += $BrainExe }
    $candidates += (Join-Path $IblocRoot 'encephalon\target\debug\deps\encephalon_server.exe')
    $candidates += (Join-Path $IblocRoot 'encephalon\target\debug\encephalon-server.exe')
    foreach ($c in $candidates) {
        if ($c -and (Test-Path -LiteralPath $c)) { return (Resolve-Path -LiteralPath $c).Path }
    }
    throw ("找不到端脑宿主二进制（试过：" + ($candidates -join '; ') + "）。编法：cargo build --manifest-path <iBLOC>\encephalon\Cargo.toml --bin encephalon-server --no-default-features --features 'telencephalon'")
}

function New-BrainConfig {
    param([string]$Path, [string]$Instance, [int]$BindPort, [bool]$WithWeb)
    $adminKey = (Get-Content -LiteralPath (Join-Path $ProofDir 'admin.key') -Raw).Trim()
    $shadowKey = (Get-Content -LiteralPath (Join-Path $ProofDir 'shadow.key') -Raw).Trim()
    $engineUrl = "http://127.0.0.1:$EnginePort/mcp"
    $webBlock = ''
    if ($WithWeb) {
        $webBlock = @"
  web:
    engine_url: "$engineUrl"

"@
    }
    $cfg = @"
telencephalon:
  id: ""
  instance_name: "$Instance"
  bind:
    http: "127.0.0.1:$BindPort"
    mtls: "127.0.0.1:$($BindPort + 1)"

  admin:
    api_key: "$adminKey"

  shadow:
    api_key: "$shadowKey"

$webBlock
  mds_discovery:
    enabled: false
    encryption_key_id: "default"
    advertise_interval_sec: 30
    discover_interval_sec: 60

  trust_store:
    auto_accept: false

  storage:
    neon_url: ""
    pool_max_conn: 10
    audit_log_retention_days: 90

  wasm_runtime:
    default_resources:
      memory_bytes: 104857600
      fuel: 1000000
      wall_clock_ms: 30000
      network_policy: "deny_all"
    auto_start_on_install: false
    health_check_interval_sec: 30
    max_concurrent_agents: 20

  a2a_gateway:
    request_timeout_ms: 30000
    rate_limit_per_minute: 1000
    audit_enabled: true
"@
    [System.IO.File]::WriteAllText($Path, $cfg, (New-Object System.Text.UTF8Encoding($false)))
}

function New-ProofDir {
    New-Item -ItemType Directory -Force -Path $ProofDir | Out-Null
    foreach ($d in 'identity', 'flows', 'lance', 'identity_ctl', 'flows_ctl', 'lance_ctl') {
        New-Item -ItemType Directory -Force -Path (Join-Path $ProofDir $d) | Out-Null
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    foreach ($name in 'shadow.key', 'admin.key') {
        $p = Join-Path $ProofDir $name
        if (Test-Path -LiteralPath $p) {
            $v = (Get-Content -LiteralPath $p -Raw).Trim()
        }
        else {
            $v = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
            [System.IO.File]::WriteAllText($p, $v, $utf8)
        }
    }
    New-BrainConfig -Path (Join-Path $ProofDir 'config.yaml') -Instance 'l4-web-drill' -BindPort $Port -WithWeb $true
    New-BrainConfig -Path (Join-Path $ProofDir 'config.noweb.yaml') -Instance 'l4-web-control' -BindPort $ControlPort -WithWeb $false
}

function New-ProviderFile {
    $script = @'
import sqlite3, json, sys
real_path, secrets_db, provider_id, out_path = sys.argv[1:5]
real = json.load(open(real_path, encoding="utf-8"))
if provider_id not in real:
    raise SystemExit("provider not found: " + provider_id)
entry = dict(real[provider_id])
db = sqlite3.connect(secrets_db)
row = db.execute("select value from secret_material where handle=?", ("provider-" + provider_id,)).fetchone()
if not row:
    raise SystemExit("no secret for provider-" + provider_id)
v = row[0]
entry["api_key"] = v.decode("utf-8") if isinstance(v, (bytes, bytearray)) else str(v)
json.dump({provider_id: entry}, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(json.dumps({"provider": entry.get("name"), "base": entry.get("api_base"), "models": len(entry.get("models", [])), "selected_model": entry.get("selected_model")}, ensure_ascii=False))
'@
    $py = Join-Path $ProofDir 'make_provider_file.py'
    [System.IO.File]::WriteAllText($py, $script, (New-Object System.Text.UTF8Encoding($false)))
    $realProviders = Join-Path $env:USERPROFILE '.local\share\shadow\providers.json'
    $secretsDb = Join-Path $env:APPDATA 'shadow\secrets.db'
    if (-not (Test-Path -LiteralPath $realProviders)) { throw "找不到桌面的 provider 文件：$realProviders" }
    if (-not (Test-Path -LiteralPath $secretsDb)) { throw "找不到桌面的密钥库：$secretsDb" }
    if (-not $ProviderId) {
        $first = (Get-Content -LiteralPath $realProviders -Raw | ConvertFrom-Json).PSObject.Properties | Where-Object { $_.Value.selected_model } | Select-Object -First 1
        if (-not $first) { throw 'provider 文件里没有一条带 selected_model 的条目 ⇒ ⇒ 请显式给 -ProviderId。' }
        # ⚠️ PowerShell 里函数内赋值是**局部**作用域 ⇒ ⇒ 必须写回脚本级，
        #    否则外层拿到的仍是空值（上一跑就撞了「空 model id」4006）。
        $script:ProviderId = $first.Name
    }
    $out = Join-Path $ProofDir 'providers.json'
    $info = & python $py $realProviders $secretsDb $ProviderId $out
    if ($LASTEXITCODE -ne 0) { throw '造台架 provider 文件失败。' }
    Write-Step ("台架 provider 文件：" + $info)
    if (-not $Model) { $script:Model = ($info | ConvertFrom-Json).selected_model }
}

function Start-Engine {
    $endpoint = "http://127.0.0.1:$EnginePort/mcp"
    try {
        $null = Invoke-WebRequest -Uri $endpoint -Method POST -ContentType 'application/json' -Headers @{ Accept = 'application/json, text/event-stream' } -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' -TimeoutSec 5
        Write-Step ("引擎已在 $endpoint ⇒ ⇒ 复用它")
        return
    }
    catch { }
    $archive = Join-Path $IblocRoot '.toolcache\obscura\obscura-windows.zip'
    $engineScript = Join-Path $RepoRoot 'scripts\start-obscura-web-engine.ps1'
    Write-Step '起引擎（核摘要 + 真打一次取页探针）…'
    & pwsh -NoProfile -File $engineScript -Port "$EnginePort" -Archive $archive
    if ($LASTEXITCODE -ne 0) { throw '引擎没起来（摘要对不上或取不到页）⇒ ⇒ 停。' }
}

function Start-Brain {
    param([int]$BindPort, [string]$ConfigName, [string]$Suffix, [bool]$WithWeb)
    $exe = Resolve-BrainExe
    Write-Step ("端脑宿主（$Suffix）：" + $exe)
    $env:TELENCEPHALON_ADMIN_KEY = (Get-Content -LiteralPath (Join-Path $ProofDir 'admin.key') -Raw).Trim()
    $env:TELENCEPHALON_SHADOW_KEY = (Get-Content -LiteralPath (Join-Path $ProofDir 'shadow.key') -Raw).Trim()
    $env:TELENCEPHALON_CONFIG = Join-Path $ProofDir $ConfigName
    $env:TELENCEPHALON_IDENTITY_DIR = Join-Path $ProofDir $Suffix
    $env:TELENCEPHALON_FLOW_DIR = Join-Path $ProofDir $Suffix
    $env:HIPPOCAMPUS_DATA_DIR = Join-Path $ProofDir 'lance'
    $env:LANCE_URI = 'file://' + (Join-Path $ProofDir 'lance')
    if ($WithWeb) {
        $env:TELENCEPHALON_WEB_ENGINE_URL = "http://127.0.0.1:$EnginePort/mcp"
    }
    else {
        Remove-Item Env:\TELENCEPHALON_WEB_ENGINE_URL -ErrorAction SilentlyContinue
    }
    $env:TELENCEPHALON_PROVIDERS_FILE = Join-Path $ProofDir 'providers.json'
    $env:EMBEDDING_API_BASE = 'http://127.0.0.1:8899/v1'
    $env:EMBEDDING_API_KEY = 'mock'
    $env:EMBEDDING_MODEL = 'text-embedding-3-small'
    $out = Join-Path $ProofDir ("brain" + $Suffix + ".out.log")
    $err = Join-Path $ProofDir ("brain" + $Suffix + ".err.log")
    $proc = Start-Process -FilePath $exe -ArgumentList @('--port', "$BindPort") -WorkingDirectory (Join-Path $IblocRoot 'encephalon') -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden -PassThru
    [System.IO.File]::WriteAllText((Join-Path $ProofDir ("brain" + $Suffix + ".pid")), "$($proc.Id)", (New-Object System.Text.UTF8Encoding($false)))
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep -Seconds 2
        try {
            $h = Invoke-WebRequest "http://127.0.0.1:$BindPort/healthz" -TimeoutSec 5
            Write-Step ("端脑就绪（$Suffix）：" + $h.StatusCode)
            return $proc
        }
        catch { }
    }
    throw ("端脑没就绪（" + $Suffix + "，看 brain" + $Suffix + ".err.log）。")
}

function Invoke-Brain {
    param([string]$Method, [string]$Path, $Body = $null, [int]$BindPort = 0)
    if ($BindPort -eq 0) { $BindPort = $Port }
    $headers = @{
        'x-shadow-key' = (Get-Content -LiteralPath (Join-Path $ProofDir 'shadow.key') -Raw).Trim()
        'x-admin-token' = (Get-Content -LiteralPath (Join-Path $ProofDir 'admin.key') -Raw).Trim()
    }
    $params = @{ Uri = "http://127.0.0.1:$BindPort$Path"; Method = $Method; Headers = $headers; TimeoutSec = 300 }
    if ($null -ne $Body) {
        $params['ContentType'] = 'application/json'
        $params['Body'] = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }
    return Invoke-WebRequest @params
}

function Stop-BrainByPidFile {
    param([string]$PidFile)
    if (-not (Test-Path -LiteralPath $PidFile)) { return }
    $brainPid = [int](Get-Content -LiteralPath $PidFile -Raw).Trim()
    $p = Get-Process -Id $brainPid -ErrorAction SilentlyContinue
    if ($p) { Stop-Process -Id $brainPid -Force -ErrorAction SilentlyContinue; Write-Step ("已停端脑（pid=" + $brainPid + "）") }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

function Stop-BrainOnPort {
    # ⚠️ **端口归属才是真身**：实测 Start-Process 回的 pid 与**真正监听**的
    #    进程**不是同一个**（宿主会再起一个子进程去 serve）⇒ ⇒ 只按 pid
    #    文件杀 ⇒ ⇒ 端脑**漏停**（占着端口 ⇒ ⇒ 下一次跑直接撞端口）。
    param([int]$BindPort)
    $conn = Get-NetTCPConnection -State Listen -LocalPort $BindPort -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $owner = $conn.OwningProcess
        Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
        Write-Step ("已停端脑（端口 " + $BindPort + " 上的 pid=" + $owner + "）")
    }
}

function Get-Uuid {
    param([string]$Text)
    if (-not $Text) { return '' }
    $m = [regex]::Match($Text, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
    if ($m.Success) { return $m.Value }
    return ''
}

function Invoke-AguiTurn {
    param([string]$ConvId, [string]$Prompt, [int]$BindPort = 0)
    if ($BindPort -eq 0) { $BindPort = $Port }
    $req = @{
        threadId = $ConvId
        runId = 'run-' + [int][double]::Parse((Get-Date -UFormat %s))
        messages = @(@{ role = 'user'; content = $Prompt })
        tools = @()
    }
    $resp = Invoke-Brain -Method 'POST' -Path "/shadow/v1/conversations/$ConvId/ag-ui:stream" -Body $req -BindPort $BindPort
    $events = @()
    $text = ''
    foreach ($line in ($resp.Content -split [char]10)) {
        $t = $line.Trim()
        if (-not $t.StartsWith('data:')) { continue }
        $payload = $t.Substring(5).Trim()
        try { $ev = $payload | ConvertFrom-Json } catch { continue }
        $events += $ev
        if ($ev.type -eq 'TEXT_MESSAGE_CONTENT') { $text += $ev.delta }
        elseif ($ev.type -like 'TOOL*') { Write-Host ("  工具事件：" + $ev.type + ' ' + ($ev | ConvertTo-Json -Compress -Depth 6)) -ForegroundColor Magenta }
        elseif ($ev.type -eq 'CUSTOM') { Write-Host ("  CUSTOM：" + $ev.name + ' ' + ($ev.value | ConvertTo-Json -Compress -Depth 6)) -ForegroundColor Magenta }
        else { Write-Host ("  事件：" + $ev.type) -ForegroundColor DarkGray }
    }
    return @{ Events = $events; Text = $text }
}

New-ProofDir
New-ProviderFile
Start-Engine

$brain = $null
$control = $null
try {
    $brain = Start-Brain -BindPort $Port -ConfigName 'config.yaml' -Suffix 'main' -WithWeb $true

    $r = Invoke-Brain -Method 'PUT' -Path '/api/telencephalon/lobes/capability-defaults' -Body @{ defaults = @{ llm = $Model } }
    Write-Step ("llm 默认模型 = " + $Model + "（" + $r.StatusCode + "）")

    # ---- 注册远端引擎：叶区按 model id 注册，key 由大脑的 provider 目录解析 ----
    $providers = Get-Content -LiteralPath (Join-Path $ProofDir 'providers.json') -Raw | ConvertFrom-Json
    $entry = $providers.PSObject.Properties | Where-Object { $_.Name -eq $ProviderId } | Select-Object -First 1
    if (-not $entry) { throw ("台架 provider 文件里没有 " + $ProviderId) }
    $baseUrl = $entry.Value.api_base
    $reg = @{
        providers = @(@{ id = $ProviderId; base_url = $baseUrl; model = $Model })
        default_model = $Model
        lobe_models = @{}
    }
    $r = Invoke-Brain -Method 'POST' -Path '/api/telencephalon/lobes/models' -Body $reg
    Write-Step ("注册远端引擎（temporal → " + $Model + "）：" + $r.Content)

    # ---- 建会话：AG-UI 的轮次挂在会话上，没有会话就是 404 ----
    $r = Invoke-Brain -Method 'POST' -Path '/shadow/v1/conversations' -Body @{ agent = 'temporal' }
    $conv = ($r.Content | ConvertFrom-Json).id
    Write-Step ("会话：" + $conv)

    $prompt = '请用 web_fetch 抓取 ' + $NonceUrl + ' ，然后把返回内容里的 uuid **原样**告诉我（不要改写、不要复述你的推测、不要编造）。'

    # ---- 正控：引擎在、工具在 ----
    Write-Step '正控：打一轮 AG-UI 真对话（引擎在）…'
    $pos = Invoke-AguiTurn -ConvId $conv -Prompt $prompt
    $posText = $pos.Text
    $posUuid = Get-Uuid $posText
    $posTool = @($pos.Events | Where-Object { $_.type -eq 'CUSTOM' -and $_.name -eq 'telencephalon_tool_result' -and $_.value.name -eq 'web_fetch' })
    $posToolUuid = ''
    $posToolOk = $false
    if ($posTool.Count -gt 0) {
        try {
            $payload = $posTool[0].value.result | ConvertFrom-Json
            $posToolOk = ($payload.ok -eq $true)
            $body = $payload.output.content[0].text
            if (-not $body) { $body = [string]$payload.output }
            $posToolUuid = Get-Uuid $body
        }
        catch { Write-Bad ('工具载荷解析失败：' + $_.Exception.Message) }
    }
    Write-Host ''
    Write-Step ('正控：工具事件 ' + $posTool.Count + ' 条，ok=' + $posToolOk + '，模型答案里的 uuid=' + $posUuid + '，工具载荷里的 uuid=' + $posToolUuid)
    Write-Host ('正控模型文本：' + $posText.Substring(0, [Math]::Min(600, $posText.Length)))

    # ---- 负控：另一台**没有 web 能力**的端脑 ⇒ ⇒ 同一句 prompt ----
    Write-Step '负控：起一台**没有 web 能力**的端脑（差分证明）…'
    $control = Start-Brain -BindPort $ControlPort -ConfigName 'config.noweb.yaml' -Suffix 'ctl' -WithWeb $false
    $r = Invoke-Brain -Method 'PUT' -Path '/api/telencephalon/lobes/capability-defaults' -Body @{ defaults = @{ llm = $Model } } -BindPort $ControlPort
    $regCtl = @{
        providers = @(@{ id = $ProviderId; base_url = $baseUrl; model = $Model })
        default_model = $Model
        lobe_models = @{}
    }
    $r = Invoke-Brain -Method 'POST' -Path '/api/telencephalon/lobes/models' -Body $regCtl -BindPort $ControlPort
    $r = Invoke-Brain -Method 'POST' -Path '/shadow/v1/conversations' -Body @{ agent = 'temporal' } -BindPort $ControlPort
    $convCtl = ($r.Content | ConvertFrom-Json).id
    $ctl = Invoke-AguiTurn -ConvId $convCtl -Prompt $prompt -BindPort $ControlPort
    $ctlUuid = Get-Uuid $ctl.Text
    $ctlTool = @($ctl.Events | Where-Object { $_.type -eq 'CUSTOM' -and $_.name -eq 'telencephalon_tool_result' })
    Write-Step ('负控：工具事件 ' + $ctlTool.Count + ' 条，模型答案里的 uuid=' + $ctlUuid)
    Write-Host ('负控模型文本：' + $ctl.Text.Substring(0, [Math]::Min(600, $ctl.Text.Length)))

    Write-Host ''
    Write-Host '==================== 判定 ====================' -ForegroundColor Cyan
    $okProtocol = ($posTool.Count -gt 0 -and $posToolOk)
    $okContent = ($posUuid -ne '' -and $posToolUuid -ne '' -and $posUuid -eq $posToolUuid)
    $okControl = ($ctlUuid -eq '')
    if ($okProtocol) { Write-Good '✅ 协议面：工具结果出了声（web_fetch，ok=true）' } else { Write-Bad '⚠️ 协议面：没有工具结果事件 ⇒ ⇒ 工具没跑或没出声' }
    if ($okContent) { Write-Good ('✅ 内容面：模型答案里的 uuid 与工具抓回来的那个**逐字一致**（' + $posUuid + '）') } else { Write-Bad '⚠️ 内容面：模型答案与工具载荷对不上（正控 uuid=' + $posUuid + '／工具 uuid=' + $posToolUuid + '）' }
    if ($okControl) { Write-Good '✅ 负控：没有 web 能力的端脑拿不到 uuid ⇒ ⇒ 正控那个 uuid 是**取来的**，不是背的' } else { Write-Bad ('⚠️ 负控：没有工具的端脑也答出了 uuid（' + $ctlUuid + '）⇒ ⇒ 这一轮**不能**当证据') }
    if ($okProtocol -and $okContent -and $okControl) {
        Write-Good '✅✅ L4 真模型那一格：亮了（协议面 + 内容面 + 负控三条全过）'
        exit 0
    }
    Write-Bad '⚠️⚠️ L4 真模型那一格：没全亮 ⇒ ⇒ 差在哪，看上面三行。'
    exit 1
}
finally {
    if (-not $KeepBrain) {
        # ⚠️ 停的必须是 Start-Brain **真正写下的**那几个 pid 文件
        #    （brainmain.pid／brainctl.pid）⇒ ⇒ 名字对不上 ⇒ ⇒ 端脑会漏停。
        foreach ($pf in @('brainmain.pid', 'brainctl.pid', 'brain.pid')) {
            Stop-BrainByPidFile -PidFile (Join-Path $ProofDir $pf)
        }
        Stop-BrainOnPort -BindPort $Port
        Stop-BrainOnPort -BindPort $ControlPort
    }
}
