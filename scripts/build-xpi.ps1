param(
    [string]$SourceDir = (Join-Path $PSScriptRoot "..\zotero-addon"),
    [string]$Output = (Join-Path $PSScriptRoot "..\dist\zotero-link.xpi")
)

$ErrorActionPreference = "Stop"

$SourceDir = (Resolve-Path $SourceDir).Path
$Output = [System.IO.Path]::GetFullPath($Output)
$outDir = Split-Path -Parent $Output
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (Test-Path $Output) { Remove-Item $Output -Force }

# Keep this list in sync with zotero-addon/ contents. The XPI must have
# manifest.json at its root and use forward slashes in entry names.
$files = @(
    "manifest.json",
    "bootstrap.js",
    "prefs.js",
    "content/zoterolink.js",
    "content/icon-48.png",
    "content/icon-96.png"
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($Output, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($rel in $files) {
        $full = Join-Path $SourceDir $rel
        if (-not (Test-Path $full)) { throw "Missing addon file: $rel" }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $full, $rel, [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $zip.Dispose()
}

$manifest = Get-Content (Join-Path $SourceDir "manifest.json") -Raw | ConvertFrom-Json
Write-Host "Built $Output"
Write-Host "Version: $($manifest.version)  Size: $((Get-Item $Output).Length) bytes"
