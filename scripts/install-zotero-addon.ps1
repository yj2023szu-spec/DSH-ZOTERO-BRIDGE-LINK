param(
    [string]$Xpi = (Join-Path $PSScriptRoot "..\dist\zotero-link.xpi"),
    [string]$ProfileDir
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Xpi)) {
    throw "XPI not found: $Xpi. Run scripts/build-xpi.ps1 first."
}

if (-not $ProfileDir) {
    $root = Join-Path $env:APPDATA "Zotero\Zotero\Profiles"
    if (-not (Test-Path $root)) { throw "Zotero profile directory not found: $root" }
    $profiles = @(Get-ChildItem $root -Directory -ErrorAction SilentlyContinue)
    if ($profiles.Count -eq 0) { throw "No Zotero profile under $root" }
    if ($profiles.Count -eq 1) {
        $ProfileDir = $profiles[0].FullName
    }
    else {
        $ProfileDir = ($profiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
        Write-Host "Multiple Zotero profiles found; using the most recently used one:"
        Write-Host "  $ProfileDir"
    }
}

$extensions = Join-Path $ProfileDir "extensions"
New-Item -ItemType Directory -Force -Path $extensions | Out-Null
$target = Join-Path $extensions "zotero-link@local.xpi"
Copy-Item $Xpi $target -Force

Write-Host "Installed bridge addon:"
Write-Host "  $target"
Write-Host ""
Write-Host "Next: fully quit Zotero and start it again."
Write-Host "Then verify with: node scripts/smoke-bridge.mjs"
