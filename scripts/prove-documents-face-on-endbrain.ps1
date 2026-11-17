# 真端脑里的**文档面**（资源管理）—— 那条 URL 在**真端脑**上通不通、字节是不是逐字回来。
#
# ## 为什么要有它
# 端脑**源码**里有那条路由 ≠ **编出来的那台端脑**里有 ≠ **那台端脑带着海马体面**
# ≠ **那台端脑的海马体是新的** ⇒ ⇒ 四层都可能缺一环 ⇒ ⇒ 而桌面端的客户端
# **打的就是端脑**（{端脑}/hippocampus/api/...，不是 localhost:8081）
# ⇒ ⇒ 「桌面端能不能用」这件事**只能**在真端脑上验。
#
# ⚠️ **上一刀的读数只到「真海马体 ＋ 十几行代理」那一档** ⇒ ⇒ 代理把端脑那一层
# （nest ＋ 门 ＋ 租户校验）**整个绕过去了** ⇒ ⇒ 「门会不会把这条 URL 掐断」
# 这件事**从来没被检验过** ⇒ ⇒ 失败会长得像成功。
#
# ## ⚠️ 判据为什么用**差分**而不是「空体 404」
# 端脑的门是 route_layer 罩在 router **外面** ⇒ ⇒ **没匹配到路由的路径压根不进门**
# （实测：端脑没带海马体面时 /hippocampus/api/documents 回的是**空体 404**，
# 不是 401）⇒ ⇒ 「404」**既可能是**「门关着」，**也可能是**「路由没挂」
# ⇒ ⇒ 写死 404 就是**假绿**的温床。
# ⇒ ⇒ 改成差分三件套：
#   · **正控**（/hippocampus/api/memory —— 海马体面在时**必定**存在）
#   · **负控**（/hippocampus/api/definitely-not-a-route —— 故意不存在）
#   · **正题**（/hippocampus/api/documents —— 文档面）
# ⇒ ⇒ 正控与负控**同形** ⇒ ⇒ 这把尺**分辨不出**「在不在」⇒ ⇒ 退出码 2（读数不可信）
# ⇒ ⇒ 正题与负控**同形** ⇒ ⇒ 文档面**没挂** ⇒ ⇒ 退出码 1
# ⇒ ⇒ 正题与负控**不同形** ⇒ ⇒ 文档面**在** ⇒ ⇒ 再验**裸字节往返**
#
# ## ⚠️ 字节那一格是这一刀的主戏
# mock fetch **不校验字节** ⇒ ⇒ 「上传把二进制变成了 Base64」这一类缺陷在 mock 面
# **永远抓不到**（每一步都绿，而真打过去存回去的是 Base64 文本）⇒ ⇒ 这里上传 512 字节
# （含 0x00 与 0xFF）⇒ ⇒ **逐字**取回 ⇒ ⇒ 比 **sha256**。
# ⇒ ⇒ 顺带把删除的**三件事实**（索引删了没／字节删了没／字节为什么没删）**分开看**
# ⇒ ⇒ 「索引删了、字节还在」**不许**混进「已删除」那一句。
#
# ## ⚠️ 钥匙是**可选**的（不许因为读不到就假装探到了）
# 门认两把：读门＝影子锁 ∪ admin token；写门＝**只**认 admin token ⇒ ⇒
# 探针带的是 X-Admin-Token ＋ X-Shadow-Key（各一把，有就带）⇒ ⇒ **两把钥匙都不打印**
# （只报字符长度）⇒ ⇒ 读到 401 ⇒ ⇒ **门关着** ⇒ ⇒ 退出码 3（缺凭据，**不**是「面不存在」）。
#
# ## -SelfTest（判据自己也要被审）
# 起一个**本地假端脑**（纯 PowerShell，无外部依赖）⇒ ⇒ 把五种形状喂进去：
#   形状 1「文档面在」               ⇒ ⇒ 退出码 **0**
#   形状 2「海马体在、文档面不在」   ⇒ ⇒ 退出码 **1**
#   形状 3「整张海马体面没挂」       ⇒ ⇒ 退出码 **2**（正控失效 ⇒ 尺子瞎了）
#   形状 4「假端脑撒谎（负控也回 200）」⇒ ⇒ 退出码 **2**（尺子瞎了）
#   形状 5「下载的字节是坏的」       ⇒ ⇒ 退出码 **1**（字节那一格有牙）
# ⇒ ⇒ 这五道是**判据自己的变异** —— 不跑它们，这把尺的退出码只是「看起来对」。
#
# ## 退出码
#   0 文档面在（且裸字节往返逐字一致）
#   1 文档面不在（与负控同形）／字节对不上
#   2 尺子失效（正控与负控同形 ⇒ ⇒ 这次读数不可信）
#   3 门关着（401 ⇒ ⇒ 缺凭据，**不**是「面不存在」）
param(
  [string]$BaseUrl = '',
  [string]$AdminToken = '',
  [string]$ShadowKey = '',
  [string]$Tenant = 'default',
  [switch]$SkipBytes,
  [switch]$SelfTest,
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Continue'
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.local/probe-documents-face' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ⚠️ Say 必须写**主机流**（Write-Host）而不是输出流 ⇒ ⇒ 否则 Probe 的返回值
# 会被它自己的日志污染（返回值变成 [日志行, 字典]）⇒ ⇒ 判据读到的就成了
# 「成员枚举碰巧对」⇒ ⇒ 不许。日志进主机流，抓取方照样看得到。
function Say($m) { Write-Host $m }

$script:adminToken = $AdminToken
$script:shadowKey = $ShadowKey
$script:tenant = $Tenant
$script:skipBytes = [bool]$SkipBytes
$script:seq = 0
$script:outDir = $OutDir

# ---- 探针：一次 HTTP 往返 ⇒ 状态码 ＋ 体长 ＋ sha256（体是**字节**，不是字符串）----
function Probe($base, $name, $method, $path, $inFile) {
  $script:seq = $script:seq + 1
  $outFile = Join-Path $script:outDir ('body-' + $script:seq + '-' + ($name -replace '[^A-Za-z0-9_-]', '_') + '.bin')
  $a = @('-s', '-o', $outFile, '-w', '%{http_code}', '-X', $method, '--max-time', '30')
  if ($script:adminToken) { $a += @('-H', ('X-Admin-Token: ' + $script:adminToken)) }
  if ($script:shadowKey) { $a += @('-H', ('X-Shadow-Key: ' + $script:shadowKey)) }
  if ($inFile) {
    # ⚠️ body 走文件（--data-binary @file）—— 直接把字节当命令行参数传会被转义弄坏。
    $a += @('-H', 'Content-Type: application/octet-stream', '--data-binary', ('@' + $inFile))
  }
  $a += ($base + $path)
  $code = (& curl.exe @a 2>$null) -join ''
  $len = 0
  $sha = ''
  if (Test-Path $outFile) {
    $len = (Get-Item $outFile).Length
    $sha = (Get-FileHash $outFile -Algorithm SHA256).Hash
  }
  $txt = ''
  if ($len -gt 0 -and $len -lt 4096) { $txt = [string](Get-Content $outFile -Raw -ErrorAction SilentlyContinue) }
  $snippet = ($txt.Substring(0, [Math]::Min(180, $txt.Length))) -replace "\r?\n", ' '
  Say ('  [' + $name + '] ' + $method + ' ' + $path + ' ⇒ HTTP ' + $code + ' | 体长=' + $len + ' | ' + $snippet)
  return @{ Name = $name; Method = $method; Path = $path; Status = [int]$code; BodyLen = $len; Sha = $sha; Body = $snippet; File = $outFile }
}

# 签名：状态码 ＋ 体长（体首 180 字只给人看，不进签名）
function Sig($p) { return ('' + $p.Status + '/' + $p.BodyLen) }

function ReadJson($file) {
  try {
    $raw = [string](Get-Content $file -Raw -ErrorAction SilentlyContinue)
    if (-not $raw) { return $null }
    return ($raw | ConvertFrom-Json)
  } catch {
    return $null
  }
}

# ---- 主判定：跑一遍探针 ⇒ 返回退出码 ----------------------------------------
function Invoke-DocumentsProbe($base) {
  $base = $base.TrimEnd('/')
  Say ('端脑面：' + $base)
  if ($script:adminToken) { Say ('钥匙：admin token（' + $script:adminToken.Length + ' 字符，不打印）') }
  if ($script:shadowKey) { Say ('钥匙：shadow key（' + $script:shadowKey.Length + ' 字符，不打印）') }
  if (-not $script:adminToken -and -not $script:shadowKey) {
    Say '⚠ 没有任何钥匙 ⇒ ⇒ 读面可能还能过、写面（上传／改名／删除）一定被拒 ⇒ ⇒ 读数分开说'
  }

  Say '--- 三件套（正控 ＋ 负控 ＋ 正题）---'
  $health = Probe $base 'healthz' 'GET' '/healthz' $null
  $pos = Probe $base 'hippocampus-control' 'GET' '/hippocampus/api/memory' $null
  $neg = Probe $base 'negative-control' 'GET' '/hippocampus/api/definitely-not-a-route' $null
  $sub = Probe $base 'documents-list' 'GET' ('/hippocampus/api/documents?tenantId=' + $script:tenant + '&limit=1') $null

  $locked = @($pos, $neg, $sub) | Where-Object { $_.Status -eq 401 -or $_.Status -eq 403 }
  if ($locked.Count -gt 0) {
    Say ('  ✗ 门关着（' + $locked[0].Status + ' ⇒ telencephalon_door_closed）⇒ ⇒ 缺凭据 ⇒ ⇒ **不能**说「面不存在」')
    return 3
  }
  if ($health.Status -eq 200 -and $health.BodyLen -gt 0) {
    Say ('  · 端脑自报：' + ($health.Body -replace '\s+', ' '))
  }

  $negSig = Sig $neg
  $posSig = Sig $pos
  Say ('  · 负控签名 = ' + $negSig + ' ｜ 正控签名 = ' + $posSig + ' ｜ 正题签名 = ' + (Sig $sub))
  if ($posSig -eq $negSig) {
    Say '  ✗ 正控失效：正控（海马体面应存在的 /api/memory）与负控**同形**⇒ ⇒ 这台端脑没带海马体面（或根本不是端脑面）⇒ ⇒ 本次读数不可信'
    return 2
  }
  Say '  ✓ 正控成立：正控与负控**不同形**⇒ ⇒ 这把尺分辨得出「在不在」'

  if ((Sig $sub) -eq $negSig) {
    Say '  ✗ 正题与负控同形 ⇒ ⇒ 文档面**没挂**进这台端脑'
    return 1
  }
  Say '  ✓ 正题与负控**不同形**⇒ ⇒ 文档面**在**这台端脑里'

  if ($script:skipBytes) {
    Say '  · 已跳过字节那一格（-SkipBytes）⇒ ⇒ 本次只证明「面在」'
    return 0
  }

  # ---- 字节那一格：上传→取回→改名→删除→再取 ----
  Say '--- 裸字节往返（上传 → 取回 → 改名 → 删除）---'
  $bytes = New-Object byte[] 512
  for ($i = 0; $i -lt $bytes.Length; $i++) { $bytes[$i] = ($i * 7 + ($i % 251)) % 256 }
  $inFile = Join-Path $script:outDir ('upload-' + $script:seq + '.bin')
  [IO.File]::WriteAllBytes($inFile, $bytes)
  $upSha = (Get-FileHash $inFile -Algorithm SHA256).Hash
  Say ('  上传字节：512 字节 ｜ sha256 = ' + $upSha)

  $t = [uri]::EscapeDataString($script:tenant)
  $up = Probe $base 'upload' 'POST' ('/hippocampus/api/documents/' + $t + '/upload?name=probe-bytes.bin&mime=application/octet-stream&kind=file') $inFile
  if ($up.Status -ne 201 -and $up.Status -ne 200) {
    Say ('  ✗ 上传不成功（HTTP ' + $up.Status + '）⇒ ⇒ 字节那一格**没证到**')
    return 1
  }
  $upJson = ReadJson $up.File
  $id = ''
  if ($upJson -and $upJson.id) { $id = [string]$upJson.id }
  if (-not $id) {
    Say '  ✗ 上传回包里没有 id ⇒ ⇒ 拿不到文档身份 ⇒ ⇒ 字节那一格**没证到**'
    return 1
  }
  Say ('  文档 id = ' + $id)

  $dl = Probe $base 'download' 'GET' ('/hippocampus/api/documents/' + $t + '/' + [uri]::EscapeDataString($id) + '/content') $null
  if ($dl.Status -ne 200) {
    Say ('  ✗ 下载不成功（HTTP ' + $dl.Status + '）')
    return 1
  }
  if ($dl.Sha -ne $upSha) {
    Say ('  ✗ 字节**对不上**：上传 sha256 = ' + $upSha + ' ｜ 取回 sha256 = ' + $dl.Sha)
    return 1
  }
  Say ('  ✓ 字节逐字一致（sha256 = ' + $upSha + '）')

  $patch = Probe $base 'rename' 'PATCH' ('/hippocampus/api/documents/' + $t + '/' + [uri]::EscapeDataString($id)) $null
  if ($patch.Status -eq 200) {
    $pj = ReadJson $patch.File
    $newName = ''
    if ($pj -and $pj.name) { $newName = [string]$pj.name }
    Say ('  · 改名回包的 name = ' + $newName)
  } else {
    Say ('  · 改名跳过（HTTP ' + $patch.Status + '）⇒ ⇒ 不影响字节那一格')
  }

  $del = Probe $base 'delete' 'DELETE' ('/hippocampus/api/documents/' + $t + '/' + [uri]::EscapeDataString($id)) $null
  $dj = ReadJson $del.File
  $deleted = ''
  $bytesDeleted = ''
  $bytesError = ''
  if ($dj) {
    if ($null -ne $dj.deleted) { $deleted = [string]$dj.deleted }
    if ($null -ne $dj.bytes_deleted) { $bytesDeleted = [string]$dj.bytes_deleted }
    if ($null -ne $dj.bytes_error) { $bytesError = [string]$dj.bytes_error }
  }
  Say ('  删除三件事实：deleted=' + $deleted + ' ｜ bytes_deleted=' + $bytesDeleted + ' ｜ bytes_error=' + $bytesError)

  $again = Probe $base 'download-after-delete' 'GET' ('/hippocampus/api/documents/' + $t + '/' + [uri]::EscapeDataString($id) + '/content') $null
  if ($again.Status -ne 404) {
    Say ('  ✗ 删除后取不到 404（HTTP ' + $again.Status + '）⇒ ⇒ 删除那一格**没证到**')
    return 1
  }
  Say '  ✓ 删除后取不到（404）'
  Say '✓ 文档面在这台端脑里，且裸字节往返逐字一致'
  return 0
}

# ---- 自测：假端脑（纯 PowerShell，无外部依赖）-------------------------------
$fakeScript = @'
param([int]$Port = 0, [string]$Shape = 'documents')
$ErrorActionPreference = 'Continue'
$crlf = [string][char]13 + [string][char]10
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
$store = @{}

function Read-Request($stream) {
  $ms = New-Object System.IO.MemoryStream
  $buf = New-Object byte[] 1
  $state = 'head'
  $header = New-Object System.Text.StringBuilder
  $contentLength = 0
  while ($true) {
    # ⚠️ 内容读够了就**立刻**收手 —— 否则 GET（没有 body）会在等第一个字节时**死等**
    # ⇒ ⇒ 假端脑不答 ⇒ ⇒ 每一发探针都要等满 curl 的超时 ⇒ ⇒ 自测拖死。
    if ($state -eq 'body' -and $ms.Length -ge $contentLength) { break }
    if ($stream.Read($buf, 0, 1) -le 0) { break }
    $b = $buf[0]
    if ($state -eq 'head') {
      [void]$header.Append([char]$b)
      if ($header.Length -ge 4) {
        $tail = $header.ToString()
        if ($tail.EndsWith($crlf + $crlf)) {
          $state = 'body'
          $headText = $header.ToString()
          foreach ($line in ($headText -split $crlf)) {
            # ⚠️ **不用正则**（-match 里的反斜杠在某些写入通道里会被吃掉 ⇒ ⇒ 实测
            # Content-Length 解析成 0 ⇒ ⇒ 上传体收不到 ⇒ ⇒ 字节那一格永远红）
            # ⇒ ⇒ 改成纯字符串判定：前缀 ＋ 切片 ⇒ ⇒ 没有转义 ⇒ ⇒ 不会有这一类病。
            if ($line.StartsWith('Content-Length:')) {
              $contentLength = [int]($line.Substring('Content-Length:'.Length).Trim())
            }
          }
        }
      }
    } else {
      $ms.WriteByte($b)
    }
  }
  $headText = $header.ToString()
  $first = ($headText -split $crlf)[0]
  $parts = $first -split ' '
  $method = ''
  $path = ''
  if ($parts.Count -ge 2) { $method = $parts[0]; $path = $parts[1] }
  return @{ Method = $method; Path = $path; Body = $ms.ToArray() }
}

function Send-Response($stream, $status, $body, $contentType) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $head = 'HTTP/1.1 ' + $status + $crlf + 'Content-Type: ' + $contentType + $crlf + 'Content-Length: ' + $bytes.Length + $crlf + 'Connection: close' + $crlf + $crlf
  $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($headBytes, 0, $headBytes.Length)
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Flush()
}

function Send-Bytes($stream, $data, $contentType) {
  $head = 'HTTP/1.1 200 OK' + $crlf + 'Content-Type: ' + $contentType + $crlf + 'Content-Length: ' + $data.Length + $crlf + 'Connection: close' + $crlf + $crlf
  $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($headBytes, 0, $headBytes.Length)
  $stream.Write($data, 0, $data.Length)
  $stream.Flush()
}

$json = 'application/json'
$octet = 'application/octet-stream'

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $req = Read-Request $stream
    $p = $req.Path
    $m = $req.Method

    if ($p -eq '/healthz') {
      $hip = 'true'
      if ($Shape -eq 'nohippocampus') { $hip = 'false' }
      Send-Response $stream '200 OK' ('{"status":"healthy","hippocampus":' + $hip + '}') $json
    } elseif ($Shape -eq 'lying') {
      Send-Response $stream '200 OK' '{"documents":[],"lying":true}' $json
    } elseif ($Shape -eq 'nohippocampus') {
      Send-Response $stream '404 Not Found' '' 'text/plain'
    } elseif ($p -like '/hippocampus/api/documents*') {
      if ($Shape -eq 'nodocuments') {
        Send-Response $stream '404 Not Found' '' 'text/plain'
      } elseif ($m -eq 'POST' -and $p -like '*/upload*') {
        $store['probe-doc-1'] = $req.Body
        Send-Response $stream '201 Created' '{"id":"probe-doc-1","name":"probe-bytes.bin","tenant_id":"default"}' $json
      } elseif ($m -eq 'GET' -and $p -like '*/content') {
        if ($store.ContainsKey('probe-doc-1')) {
          $data = $store['probe-doc-1']
          if ($Shape -eq 'corrupt') {
            $copy = New-Object byte[] $data.Length
            [Array]::Copy($data, $copy, $data.Length)
            for ($i = 0; $i -lt $copy.Length; $i++) { $copy[$i] = $copy[$i] -bxor 1 }
            $data = $copy
          }
          Send-Bytes $stream $data $octet
        } else {
          Send-Response $stream '404 Not Found' '' 'text/plain'
        }
      } elseif ($m -eq 'DELETE') {
        $store.Remove('probe-doc-1')
        Send-Response $stream '200 OK' '{"success":true,"deleted":true,"bytes_deleted":512,"bytes_error":null}' $json
      } else {
        Send-Response $stream '200 OK' '{"documents":[]}' $json
      }
    } elseif ($p -eq '/hippocampus/api/memory') {
      Send-Response $stream '200 OK' '{"memories":[]}' $json
    } else {
      Send-Response $stream '404 Not Found' '' 'text/plain'
    }
  } catch {
  } finally {
    $client.Close()
  }
}
'@

function Start-FakeBrain($shape, $outDir) {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  $listener.Stop()
  $fakePath = Join-Path $outDir ('fake-brain-' + $shape + '.ps1')
  [IO.File]::WriteAllText($fakePath, $fakeScript, (New-Object Text.UTF8Encoding($false)))
  $hostExe = (Get-Process -Id $PID).Path
  $proc = Start-Process -FilePath $hostExe -ArgumentList @('-NoProfile', '-File', $fakePath, '-Port', $port, '-Shape', $shape) -WindowStyle Hidden -PassThru
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    try {
      $c = New-Object System.Net.Sockets.TcpClient
      $c.Connect('127.0.0.1', $port)
      $c.Close()
      $ready = $true
      break
    } catch {
    }
  }
  return @{ Proc = $proc; Port = $port; Ready = $ready }
}

if ($SelfTest) {
  Say '=== 自测：把五种形状喂给这把尺 ==='
  $cases = @(
    @{ Shape = 'documents'; Expect = 0; Why = '文档面在 → 字节逐字一致' },
    @{ Shape = 'nodocuments'; Expect = 1; Why = '海马体在、文档面不在 → 与负控同形' },
    @{ Shape = 'nohippocampus'; Expect = 2; Why = '整张海马体面没挂 → 正控失效 → 尺子瞎了' },
    @{ Shape = 'lying'; Expect = 2; Why = '假端脑撒谎（负控也回 200）→ 尺子瞎了' },
    @{ Shape = 'corrupt'; Expect = 1; Why = '下载的字节是坏的 → 字节那一格有牙' }
  )
  $fails = 0
  foreach ($c in $cases) {
    Say ('--- 形状 ' + $c.Shape + '（期望退出码 ' + $c.Expect + '）---')
    $fake = Start-FakeBrain $c.Shape $OutDir
    if (-not $fake.Ready) {
      Say ('  ✗ 假端脑没起来（端口 ' + $fake.Port + '）')
      $fails = $fails + 1
      continue
    }
    $code = Invoke-DocumentsProbe ('http://127.0.0.1:' + $fake.Port)
    Say ('  实际退出码 = ' + $code + ' ｜ 期望 = ' + $c.Expect + ' ｜ ' + $c.Why)
    if ($code -ne $c.Expect) { $fails = $fails + 1; Say '  ✗ 不符' } else { Say '  ✓ 符' }
    try { if ($fake.Proc -and -not $fake.Proc.HasExited) { Stop-Process -Id $fake.Proc.Id -Force -ErrorAction SilentlyContinue } } catch { }
  }
  Say ''
  if ($fails -gt 0) {
    Say ('✗ 自测失败 ' + $fails + ' / ' + $cases.Count)
    exit 1
  }
  Say ('✓ 自测全部通过（' + $cases.Count + ' / ' + $cases.Count + '）')
  exit 0
}

if (-not $BaseUrl) {
  Say '!! 给一个 -BaseUrl（真端脑面，比如 http://127.0.0.1:60080）⇒ ⇒ 不然不知道探哪里'
  exit 2
}
exit (Invoke-DocumentsProbe $BaseUrl)
