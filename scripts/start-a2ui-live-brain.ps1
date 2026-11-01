# 起一台**只绑 loopback** 的端脑，专供桌面端 A2UI 的活体联调用。
#
# ## 为什么要有这个脚本
#
# `shadow-desktop/src/components/chat/__tests__/a2ui.live.test.tsx` 是**活体**联调：
# 它要一个**真的**端脑在 `POST /a2a` 上吐 surface ⇒ 光有录下来的字节
# （`fixtures/a2ui/tasks_sse.txt`）验不了两件事：
#   ① 端脑**真的**在吐这个形状（不是我们以为的形状）；
#   ② `/a2a` **真的**在 shadow key 后面（不是「应该」在）。
#
# ## ⚠️⚠️ 关于「监听地址」：独立宿主**不读** config 的 `bind.http`
#
# 端脑 YAML 里那句 `telencephalon.bind.http` 说的是「**端脑面**在哪」，
# 不是「**这台服务器**暴露到哪」⇒ 混在一起的话，一份端脑配置就能悄悄把
# 整台 agent 放到局域网上 ⇒ 两条线各管各的。
#
# ⇒ 暴露面由**宿主**决定：
# - **新版**（杏仁核会话 2026-10-31 修的）：**默认绑回环** `127.0.0.1`，
#   要暴露到局域网必须**显式**写 `--bind 0.0.0.0` 或 `TELENCEPHALON_BIND=0.0.0.0`；
# - **旧版**：`C:\Projects\iBLOC\encephalon\src\a2a_server.rs:207` 把地址
#   **写死**成 `TcpListener::bind(("0.0.0.0", port))` ⇒ config 对它无效。
#
# ⚠️ **为什么这件事有后果**：端脑面**还有约 30 张 router 敞开**
# （见 `docs/superpowers/architecture/2026-10-31-agent-surface-endpoint-lock-matrix.md`）
# ⇒ 一台绑在 `0.0.0.0` 的端脑 = **把那些不拿凭据就能进的端点放到局域网上**。
#
# ⇒ 所以本脚本**起完之后会报出实际监听地址**；若不是回环 ⇒ **响亮地提醒**，
#   并要求验完就停（`-Stop`）。**不要相信配置、只相信实际监听地址**。
#
# 对照：桌面端自己的 sidecar 一直是 loopback
# （`shadow-desktop/src-tauri/src/cortex_http.rs:63` ⇒ `127.0.0.1:60080`，
# 还有一条测试钉着「the sidecar must stay on loopback」）。
#
# ## 两把钥匙是**分开的**
#
# - `shadow.key` ⇒ `/a2a` 的门（`api::shadow_auth::require_shadow_key`）；
# - `admin.key` ⇒ 建任务用（`X-Admin-Token`）。
#
# 两把都**只写文件、不打印** ⇒ 别把它们贴进日志或聊天。
#
# ## 怎么用
#
# ```powershell
# # 1) 编出宿主端脑（端脑 + 海马体合成的那张面）
# cd C:\Projects\iBLOC\encephalon
# $env:PROTOC = 'C:\Users\87462\bin\protoc.exe'
# cargo build --bin encephalon-server --no-default-features --features "telencephalon hippocampus" -j 1
# #    ⚠️ 产物在 target\debug\deps\encephalon_server.exe；cargo 最后「提升到 target\debug\」那步
# #       可能因为另一个实例正占着那个 exe 而失败 ⇒ 直接从 deps\ 取。
#
# # 2) 起它（默认用 target\xplat-scratch\encephalon-server-xplat.exe）
# pwsh -NoProfile -File scripts\start-a2ui-live-brain.ps1 -Exe <上面那个 exe 的路径>
#
# # 3) 跑活体联调
# cd shadow-desktop
# $env:A2UI_LIVE_URL         = 'http://127.0.0.1:60080'
# $env:A2UI_LIVE_KEY         = (Get-Content ..\..\encephalon\target\a2ui-proof\shadow.key -Raw).Trim()
# $env:A2UI_LIVE_ADMIN_TOKEN = (Get-Content ..\..\encephalon\target\a2ui-proof\admin.key -Raw).Trim()
# pnpm vitest run src/components/chat/__tests__/a2ui.live.test.tsx
#
# # 4) 验完**立刻停**（这台在局域网里是敞着的）
# pwsh -NoProfile -File scripts\start-a2ui-live-brain.ps1 -Stop
# ```
#
# ⚠️ **没设那三个环境变量 ⇒ 整组跳过**（不是失败）⇒ 常规 `vitest run` 不受影响。
param(
  [string]$Exe = '',
  [int]$Port = 60080,
  [string]$ProofDir = 'C:\Projects\iBLOC\encephalon\target\a2ui-proof',
  [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Projects\iBLOC\encephalon'
$utf8 = New-Object System.Text.UTF8Encoding($false)

# ── -Stop：把还活着的实例停掉（**验完就要停** —— 它在局域网里是敞着的）──
if ($Stop) {
  $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $listeners) {
    Write-Output "端口 $Port 上没有在听的实例。"
    exit 0
  }
  foreach ($l in $listeners) {
    Write-Output "stopping pid=$($l.OwningProcess) (listening on $($l.LocalAddress):$($l.LocalPort))"
    Stop-Process -Id $l.OwningProcess -Force -ErrorAction SilentlyContinue
  }
  Write-Output '已停。'
  exit 0
}

if (-not $Exe) {
  $candidates = @(
    (Join-Path $repo 'target\xplat-scratch\encephalon-server-xplat.exe'),
    (Join-Path $repo 'target\debug\deps\encephalon_server.exe'),
    (Join-Path $repo 'target\debug\encephalon-server.exe')
  )
  $Exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Exe -or -not (Test-Path $Exe)) {
  throw "找不到端脑二进制。编法：cargo build --bin encephalon-server --no-default-features --features `"telencephalon hippocampus`" -j 1（产物在 target\debug\deps\）"
}
Write-Output ("binary: {0}（{1:N1} MB @ {2}）" -f $Exe, ((Get-Item $Exe).Length / 1MB), (Get-Item $Exe).LastWriteTime)

New-Item -ItemType Directory -Force -Path $ProofDir | Out-Null
foreach ($d in 'identity', 'flows', 'lance') {
  New-Item -ItemType Directory -Force -Path (Join-Path $ProofDir $d) | Out-Null
}

# 两把分开的钥匙 ⇒ 只写文件、**不打印**
$shadowKey = [Convert]::ToBase64String(
  [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$adminKey = [Convert]::ToBase64String(
  [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
).TrimEnd('=').Replace('+', '-').Replace('/', '_')
[System.IO.File]::WriteAllText((Join-Path $ProofDir 'shadow.key'), $shadowKey, $utf8)
[System.IO.File]::WriteAllText((Join-Path $ProofDir 'admin.key'), $adminKey, $utf8)

$config = @"
telencephalon:
  id: ""
  instance_name: "a2ui-live-proof"
  bind:
    http: "127.0.0.1:$Port"
    mtls: "127.0.0.1:60082"

  admin:
    api_key: "`${TELENCEPHALON_ADMIN_KEY}"

  shadow:
    api_key: "`${TELENCEPHALON_SHADOW_KEY}"

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
[System.IO.File]::WriteAllText((Join-Path $ProofDir 'config.yaml'), $config, $utf8)

# 旧实例先停（它占着端口）
$old = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($old) {
  foreach ($o in $old) { Stop-Process -Id $o.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

$env:TELENCEPHALON_ADMIN_KEY    = $adminKey
$env:TELENCEPHALON_SHADOW_KEY   = $shadowKey
$env:TELENCEPHALON_CONFIG       = Join-Path $ProofDir 'config.yaml'
$env:TELENCEPHALON_IDENTITY_DIR = Join-Path $ProofDir 'identity'
$env:TELENCEPHALON_FLOW_DIR     = Join-Path $ProofDir 'flows'
$env:HIPPOCAMPUS_DATA_DIR       = Join-Path $ProofDir 'lance'
$env:LANCE_URI                  = 'file://' + (Join-Path $ProofDir 'lance')
# provider 指向 mock（确定性向量）⇒ 走「provider 优先」那条真路径
$env:EMBEDDING_API_BASE         = 'http://127.0.0.1:8899/v1'
$env:EMBEDDING_API_KEY          = 'mock'
$env:EMBEDDING_MODEL            = 'text-embedding-3-small'

$stamp = Get-Date -Format 'HHmmss'
$err = Join-Path $ProofDir "server-$stamp.err.log"
$out = Join-Path $ProofDir "server-$stamp.out.log"
Start-Process $Exe -ArgumentList '--port', "$Port" -WorkingDirectory $repo `
  -RedirectStandardError $err -RedirectStandardOutput $out -WindowStyle Hidden

for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  try {
    $h = Invoke-WebRequest "http://127.0.0.1:$Port/healthz" -TimeoutSec 5
    Write-Output "healthz $($h.StatusCode): $($h.Content)"
    break
  } catch { }
}

Write-Output ''
Write-Output '钥匙已生成（**只写文件、不打印**）：'
Write-Output ("  shadow key : {0}" -f (Join-Path $ProofDir 'shadow.key'))
Write-Output ("  admin token: {0}" -f (Join-Path $ProofDir 'admin.key'))

# ⚠️ **报出实际监听地址** —— 别让「我以为只在本机」变成「其实在局域网上」。
$listen = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listen) {
  $addrs = ($listen | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }) -join ', '
  Write-Output ''
  Write-Output "实际监听：$addrs"
  if ($listen | Where-Object { $_.LocalAddress -ne '127.0.0.1' -and $_.LocalAddress -ne '::1' }) {
    Write-Output ''
    Write-Output '⚠️⚠️ **这台在局域网里是可达的** —— 端脑面还有约 30 张 router 敞开'
    Write-Output '   （旧版宿主把监听地址写死成 0.0.0.0 ⇒ config 的 bind.http 对它无效；'
    Write-Output '     新版默认回环，要暴露必须显式 `--bind 0.0.0.0` / `TELENCEPHALON_BIND=0.0.0.0`）'
    Write-Output '   ⇒ **验完立刻停**：'
    Write-Output "     pwsh -NoProfile -File scripts\start-a2ui-live-brain.ps1 -Stop"
  } else {
    Write-Output '（回环绑定 ✓ ⇒ 局域网够不着。）'
  }
}

Write-Output ''
Write-Output '接着跑活体联调：'
Write-Output "  `$env:A2UI_LIVE_URL         = 'http://127.0.0.1:$Port'"
Write-Output "  `$env:A2UI_LIVE_KEY         = (Get-Content '$ProofDir\shadow.key' -Raw).Trim()"
Write-Output "  `$env:A2UI_LIVE_ADMIN_TOKEN = (Get-Content '$ProofDir\admin.key' -Raw).Trim()"
Write-Output "  cd shadow-desktop; pnpm vitest run src/components/chat/__tests__/a2ui.live.test.tsx"
