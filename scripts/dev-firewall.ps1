# iBLOC dev firewall bootstrap — one-time admin script.
#
# Windows Firewall prompts on every freshly-compiled binary because
# each `cargo build` produces a new exe hash. Path-based rules are
# fragile here: -Program rejects wildcards AND (as the 2026-10-25 run
# showed) is documented for program FILE paths, so both "dir\*" and
# the bare directory form are unreliable across hosts.
#
# Port rules are the robust dimension: the firewall prompt itself is
# "program X wants to listen on port Y" — allowing the port covers
# ANY binary listening there, across unlimited rebuilds.
#
# Run once from an elevated PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts/dev-firewall.ps1
#
# Idempotent: re-running removes the old iBLOC rules and re-adds them.
# Scope: inbound, Private + Domain profiles only. Public (coffee-shop
# wifi) stays fully protected.

#Requires -RunAsAdministrator

# Per-rule error tolerance: one bad rule must not abort the run.
$ErrorActionPreference = 'Continue'

# Wipe previous iBLOC dev rules (both this scheme and the old
# path-based scheme from earlier revisions of this script).
Get-NetFirewallRule -DisplayName "iBLOC dev:*" -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue

# Service ports actually used by the iBLOC stack. Grouped so the
# rule names document what each range is for.
$portGroups = @{
    'brain gateway (telencephalon :60080)'         = @(60080)
    'lobe services (hippocampus 8081, neuron 8083/8085)' = @(8081, 8083, 8085)
    'encephalon a2a_server (:8082)'                 = @(8082)
    'prefrontal serve + e2e (:18082-18084)'         = @(18082, 18083, 18084)
    'parietal behavior stub (:19082)'               = @(19082)
    'resonance (:8080)'                             = @(8080)
    'zenoh router + peer tests (:7447-7460)'        = @(7447..7460)
    'diencephalon MCP HTTP (:7777-7779)'            = @(7777, 7778, 7779)
    'vite dev servers (:1420, :5173)'               = @(1420, 5173)
}

$added = 0
$failed = @()

foreach ($entry in $portGroups.GetEnumerator()) {
    $label = $entry.Key
    $ports = $entry.Value
    $name = "iBLOC dev: $label"
    try {
        New-NetFirewallRule -DisplayName $name `
            -Direction Inbound `
            -Protocol TCP `
            -LocalPort $ports `
            -Action Allow `
            -Profile Private, Domain `
            -Enabled True `
            -ErrorAction Stop | Out-Null
        $added++
        Write-Host ("  + {0}  [{1}]" -f $label, ($ports -join ','))
    } catch {
        $failed += $label
        Write-Host ("  ! {0} — {1}" -f $label, $_.Exception.Message)
    }
}

# zenoh peer mode also uses UDP multicast for discovery on the LAN —
# without an inbound UDP allow, every peer discovery ping prompts.
try {
    New-NetFirewallRule -DisplayName "iBLOC dev: zenoh UDP discovery + transport" `
        -Direction Inbound `
        -Protocol UDP `
        -LocalPort 7447-7460 `
        -Action Allow `
        -Profile Private, Domain `
        -Enabled True `
        -ErrorAction Stop | Out-Null
    $added++
    Write-Host "  + zenoh UDP discovery + transport  [7447-7460/udp]"
} catch {
    $failed += 'zenoh UDP'
    Write-Host ("  ! zenoh UDP — {0}" -f $_.Exception.Message)
}

Write-Host ""
Write-Host "Rules added: $added"
if ($failed.Count -gt 0) {
    Write-Host "Failed: $($failed -join ', ')"
}
Write-Host ""
Write-Host "Verify (read-only, no admin needed):"
Write-Host '  Get-NetFirewallRule -DisplayName "iBLOC dev:*" | Measure-Object | Select -Expand Count'
