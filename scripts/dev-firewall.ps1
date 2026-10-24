# iBLOC dev firewall bootstrap — one-time admin script.
#
# Windows Firewall prompts on every freshly-compiled binary because
# each `cargo build` produces a new exe hash. Path-based rules skip
# the hash check entirely: anything under an authorized directory is
# allowed through, no matter how many times we rebuild.
#
# Run once from an elevated PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts/dev-firewall.ps1
#
# Idempotent: re-running removes the old iBLOC rules and re-adds
# them (so new repos picked up by the scan take effect).
#
# Scope: inbound rules only, Private + Domain profiles (home/office
# LAN). Public profile (coffee-shop wifi) stays protected — binaries
# are NOT allowed inbound there.

#Requires -RunAsAdministrator

# Per-operation error handling: a single bad rule must not abort
# the whole run (the previous version used $ErrorActionPreference =
# 'Stop' and died on the first -Program wildcard rejection).
$ErrorActionPreference = 'Continue'

# Wipe previous iBLOC dev rules (idempotency).
Get-NetFirewallRule -DisplayName "iBLOC dev:*" -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue

# Every iBLOC checkout under C:\Projects\iBLOC — scan rather than
# hardcode, so new repos are picked up automatically.
$repos = Get-ChildItem "C:\Projects\iBLOC" -Directory

$targets = @()
foreach ($repo in $repos) {
    foreach ($t in @('target', 'target-acp')) {
        foreach ($profile in @('debug', 'release')) {
            $p = Join-Path $repo.FullName "$t\$profile"
            if (Test-Path $p) { $targets += $p }
        }
    }
}
# shadow-desktop is a nested repo — Tauri builds land here.
$sdTauri = "C:\Projects\iBLOC\shadow\shadow-desktop\src-tauri\target"
if (Test-Path $sdTauri) {
    foreach ($profile in @('debug', 'release')) {
        $p = Join-Path $sdTauri $profile
        if (Test-Path $p) { $targets += $p }
    }
}

$targets = $targets | Sort-Object -Unique
Write-Host "Authorized directories:"
$targets | ForEach-Object { Write-Host "  $_" }

# Windows Firewall's -Program takes an EXACT path (file or folder).
# A wildcard like "C:\...\debug\*" is rejected with
# "应用程序包含无效的字符，或具有无效的长度" (HRESULT 0x80070057).
#
# Strategy (per directory):
#   1. try the DIRECTORY path — Windows matches the folder prefix,
#      so every exe inside (including ones added later) is covered.
#   2. if the directory form is rejected, fall back to one rule per
#      .exe currently in the directory. Rebuilt binaries keep the
#      same path, so their existing rule still applies; only
#      brand-new exe names need a script re-run.
$dirRules = 0
$exeRules = 0
$failed = @()

foreach ($dir in $targets) {
    $name = "iBLOC dev: $dir"
    try {
        New-NetFirewallRule -DisplayName $name `
            -Direction Inbound `
            -Program $dir `
            -Action Allow `
            -Profile Private, Domain `
            -Enabled True `
            -ErrorAction Stop | Out-Null
        $dirRules++
        Write-Host "  + dir rule: $name"
        continue
    } catch {
        # directory form not accepted on this host — fall back
    }

    # cargo puts binaries in the profile root (target\debug\foo.exe)
    # but examples in a subdir (target\debug\examples\foo.exe), so the
    # enumeration must recurse.
    #
    # NOTE: the dev tree holds ~5700 exes across the target dirs.
    # Per-exe rules would blow up the firewall rule table, so the
    # directory form above MUST be the primary path. This fallback
    # is capped and only exists for hosts that reject directories.
    $exes = Get-ChildItem -Path $dir -Filter *.exe -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notlike '*\deps\*' } |
        Select-Object -ExpandProperty FullName -Unique
    if (-not $exes -or $exes.Count -eq 0) {
        $failed += $dir
        Write-Host "  ! no exe found in $dir (skipped)"
        continue
    }
    if ($exes.Count -gt 200) {
        Write-Host ("  ! {0} exes in {1} — too many for per-exe rules, skipped" -f $exes.Count, $dir)
        $failed += $dir
        continue
    }
    $added = 0
    foreach ($exePath in $exes) {
        try {
            New-NetFirewallRule -DisplayName "$name [$([System.IO.Path]::GetFileName($exePath))]" `
                -Direction Inbound `
                -Program $exePath `
                -Action Allow `
                -Profile Private, Domain `
                -Enabled True `
                -ErrorAction Stop | Out-Null
            $added++
            $exeRules++
        } catch {
            Write-Host "  ! failed: $exePath"
        }
    }
    Write-Host "  + $added exe rule(s) in $dir"
}

Write-Host ""
Write-Host "Rules added: $dirRules directory + $exeRules executable"
if ($failed.Count -gt 0) {
    Write-Host "Skipped: $($failed -join ', ')"
}

# Verification hint — the user can re-run this to confirm the
# rules landed (read-only, no admin needed):
Write-Host ""
Write-Host "Verify with:"
Write-Host '  Get-NetFirewallRule -DisplayName "iBLOC dev:*" | Measure-Object | Select -Expand Count'

# Summary of service ports these binaries listen on (documentation
# only — the path rules above already cover them; listed so the
# operator knows what's exposed on the LAN):
$ports = @{
    60080 = 'telencephalon (cortex gateway)'
    8085  = 'neuron embedded (Tauri shell)'
    18082 = 'prefrontal serve'
    19082 = 'parietal-server (behavior stub)'
    8082  = 'encephalon a2a_server / diencephalon'
    8081  = 'hippocampus'
    8080  = 'resonance'
    7447  = 'zenohd router (multi-device deployments)'
    7777  = 'diencephalon MCP HTTP'
    1420  = 'shadow-desktop vite dev'
    5173  = 'vite default'
}
Write-Host "`nKnown service ports (covered by the path rules above):"
$ports.GetEnumerator() | Sort-Object Name | ForEach-Object {
    Write-Host ("  {0,-6} {1}" -f $_.Name, $_.Value)
}

Write-Host "`nDone. Newly-compiled binaries under the listed directories"
Write-Host "no longer trigger the firewall prompt (Private/Domain only)."
