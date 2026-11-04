param(
    [string]$Source = (Join-Path $PSScriptRoot "..\skill\zotero-literature"),
    [string]$Target = (Join-Path $env:USERPROFILE ".agents\skills\zotero-literature")
)

$ErrorActionPreference = "Stop"

$Source = (Resolve-Path $Source).Path
New-Item -ItemType Directory -Force -Path $Target | Out-Null
Get-ChildItem $Source -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($Source.Length).TrimStart('\', '/')
    $dest = Join-Path $Target $rel
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
    Copy-Item $_.FullName $dest -Force
}

Write-Host "Installed skill to: $Target"
