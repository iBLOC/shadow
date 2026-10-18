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

$ErrorActionPreference = 'Stop'

# Wipe previous iBLOC dev rules (idempotency).
Get-NetFirewallRule -DisplayName "iBLOC dev:*" -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule

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

foreach ($dir in $targets) {
    $name = "iBLOC dev: $dir"
    New-NetFirewallRule -DisplayName $name `
        -Direction Inbound `
        -Program "$dir\*" `
        -Action Allow `
        -Profile Private, Domain `
        -Enabled True | Out-Null
    Write-Host "  + rule added: $name"
}

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
